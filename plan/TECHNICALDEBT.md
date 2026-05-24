# Technical Debt

Running list of known fragile or temporary choices that we deliberately deferred. Each entry should describe what's fragile, why we accepted it, and what a better fix would look like.

---

## Anthropic `QUOTA_EXHAUSTED` detection via English string-match

**Where:** `src/llm/common/errors.mjs`, in the per-Anthropic branch of `classifyHttpError`.

**What we do:** When Anthropic returns a 400 with `body.error.type === 'invalid_request_error'`, we look at `body.error.message` and treat it as `QUOTA_EXHAUSTED` if the message contains the substring `"credit balance"`. Everything else with that error type stays `CLIENT`.

**Why this is fragile:** We're string-matching English error text from an external API. Anthropic can:
- Reword the message in any patch release (`"insufficient credits"`, `"account balance"`, localized variants, etc.) and our detection silently regresses to `CLIENT`.
- Change the HTTP status or error shape entirely.
- Introduce a dedicated error type (which would be good for us, but we'd have to notice).

A `CLIENT` miscategorization for a quota-exhausted account is the worst miss in the taxonomy — the user sees a "bad request" error when the real problem is billing, and worse, the V0.9 retry policy won't retry `CLIENT` anyway so they don't get a misleading retry loop, just a misleading error.

**Why we accepted it for V0.9:** Anthropic doesn't expose a structured quota signal as of the V0.9 design. String-matching is the only available heuristic. We'd rather classify it imperfectly than not at all — `QUOTA_EXHAUSTED` is actionable user-facing information.

**Better fix when revisited:**
1. Periodically check Anthropic's API error reference for a dedicated quota error type (`credit_balance_too_low`, etc.) and switch to structured detection.
2. Until then, broaden the string-match set with each variant we observe in the wild, and unit-test against each canned body.
3. Consider exposing a `provider.detectQuota(body)` hook per plugin so the fragile logic is at least co-located and testable per provider.
4. Add a log line at WARN level when we hit the string-match branch, so we can see in deployments whether it's still firing as expected (or has gone silent because Anthropic changed the wording).

**Trigger to revisit:** Either a user-reported miscategorized quota error, or an Anthropic API changelog entry about error shapes.

---

## V0.9 open design questions deferred during planning

The following five questions were raised during the V0.9 design and intentionally answered with a "pick the obvious default now, revisit if real use surfaces problems" stance. Each entry records the decision made and what would trigger reopening it.

### Retry config merge semantics — carry-through assumed

**Decision:** All four layers of the retry merge chain (library → plugin.defaultRetry → session-wide → plugin-wide → plugin+model) are merged with full carry-through: `{...lib, ...plugin, ...session, ...pluginConfig, ...pluginModelConfig}`. A user setting only `{retry: {maxAttempts: 5}}` at the session-wide layer keeps `retryOn`, `baseMs`, etc. from the library defaults.

**Why this might bite:** "Reset to library default and only override what I wrote" is the other plausible reading, and would be the right call if a user wanted to *narrow* `retryOn` at a deeper layer (e.g. plugin-level says retry on `[RATE_LIMIT, SERVER]` only) without having to re-specify every array element above it. We can't do both behaviors with a single shallow merge.

**Trigger to revisit:** A user wanting different `retryOn` per plugin and getting surprised that the session-wide list "wins" too aggressively.

### V0.9 release strategy — single bundled release

**Decision:** Ship `0.9.0` with the full taxonomy + retry refactor in one shot. No intermediate `0.8.x` "just the small structural fix" release.

**Why this might bite:** A downstream consumer manually patched `node_modules/@semantictools/llamiga/src/llm/pgAnthropicAI.mjs` to add the missing `throw` after the retry loop. Until `0.9.0` lands and they upgrade, their `node_modules` patch remains load-bearing (will be wiped by `npm install` / `npm update`). A small `0.8.x` containing just the throw-after-loop fix would let them drop the patch sooner.

**Trigger to revisit:** If `0.9.0` slips by more than a couple of weeks and the downstream consumer hits the patch-loss problem.

### ~~`chat()` and other entry points not yet audited for merge-chain coverage~~ — RESOLVED

**Original concern:** V0.9 plan verified `session.ask()` flows through the four-layer merge but hadn't audited `chat()` and other entry points.

**Resolution (V0.9 implementation):** Audited `src/index.mjs`. Every user-facing call (`ask`, `chat`, `chatStream`, `rawChat`, and chain mode via `runAll` → `directAsk`) funnels through `_rawChat`, which contains the only call site to `plugin.complete()`. The four-layer merge is applied uniformly. Streaming preserves `{stream, onChunk}` correctly because `overrideConfig` is spread with highest precedence.

### Councillius bypasses the four-layer merge for member calls

**Where:** `src/xlm/pgCouncillius.mjs:70`. Council members are invoked via `member.plugin.complete(member.model, prompt, messages, undefined)` — a plugin-to-plugin call that bypasses `index.mjs:_rawChat` and the config-assembly merge chain entirely.

**What this means:** Retry config set at session-wide scope (`session.setConfig({retry: {...}})`) or plugin scope (`session.setConfig('openai', {retry: {...}})`) does **not** propagate to council member calls. Members run with only the library defaults + the member plugin's `defaultRetry`.

**Why this is not a regression:** Before V0.9 there was no session-wide retry config, so nothing was being silently dropped. The hole is "new feature doesn't apply where users would reasonably expect it" rather than "old behavior broke."

**Why we accepted it for V0.9:** Fixing it properly means Councillius reaches back into the session (via `config.session`, which is already injected) and re-runs the same config-assembly logic that lives in `_rawChat`. That's a non-trivial change to `_rawChat` to extract the merge as a reusable helper, plus changes to Councillius itself. Out of scope for V0.9.

**Better fix when revisited:**
1. Extract the four-layer merge from `_rawChat` into a session method (e.g. `session._assembleConfig(plugin, model, overrideConfig)`).
2. Councillius calls `config.session._assembleConfig(member.plugin, member.model, undefined)` per member instead of passing `undefined`.
3. Same treatment for the judge call at line 104.

**Trigger to revisit:** A user reporting that retry settings don't propagate to Councillius members, or any future XLM plugin doing similar plugin-to-plugin calls.

### `createSession('provider::model')` ignores the model in the spec for single-plugin sessions

**Where:** `src/index.mjs:235-238`, inside `createObject`.

**What happens:** When the user calls `createSession('testbert1::special')` (or any single-plugin session with a `provider::model` spec), the parser at line 223 correctly extracts `model='special'` and stores it in `pluginModels[plugin._.id]`. But then the block at line 235-238 unconditionally overrides the session's active model with `plugin.getDefaultModel()`:

```js
if (plugins.length == 1) {
    plugin = plugins[0];
    pluginName = pluginSpecs[0];
    model = plugin.getDefaultModel();    // ← ignores pam.model from the spec
}
```

Result: `this.model` on the session is the plugin's default, not the model the user asked for. Subsequent `session.ask("hi")` calls (without explicit specs) run against the default model. The user-specified model is silently discarded.

**Why this matters for V0.9:** The merge chain uses `this.model` to look up `pluginConfigs[plugin::model]`. So `setConfig('testbert1', 'special', {...})` doesn't apply to `session.ask("hi")` on a session created via `createSession('testbert1::special')` — even though everything *looks* like it should. The fix in the V0.9 integration test was to pass `'testbert1::special'` explicitly on the `ask` call.

**Why not a regression:** Pre-existing since `createObject` was written. V0.9 didn't introduce it.

**Better fix when revisited:**

Change the block at line 235-238 to honor the model from the spec when present:

```js
if (plugins.length == 1) {
    plugin = plugins[0];
    pluginName = pluginSpecs[0];
    let pam = _extractPluginAndModel(pluginSpecs[0]);
    if (pam.model && pam.model !== 'default') {
        model = pam.model;
    } else {
        model = plugin.getDefaultModel();
    }
}
```

This is a small change but it's an API behavior change — anyone relying on `createSession('foo::bar')` quietly using `foo`'s default model would see different behavior. Worth a minor version bump and a release note.

**Trigger to revisit:** A user reporting that `provider::model` in `createSession` "doesn't work", or any time the merge chain is extended in a way that makes this discrepancy more visible.

### Streaming + retry interaction not specified

**Decision:** V0.9 wires `withRetry` + `classifyHttpError` into both `pgOpenAI.complete` and `pgOpenAI.completeStreaming`. Other plugins don't have streaming yet (the `common/streaming.mjs` refactor is in flight separately). When other plugins add streaming, they'll inherit the same retry/error pattern by structure.

**Why this might bite:** Streaming errors are weirder — the response may start successfully (200 OK), then fail mid-stream. The current plan treats the streaming call as one atomic operation: if it fails before the stream starts, retry; if it fails mid-stream, the partial content is lost and the error propagates. That's the simplest behavior but may not match what users want for long streams. No mid-stream error category exists in the taxonomy.

**Trigger to revisit:** A user reporting that mid-stream errors are unrecoverable, or the streaming refactor maturing across all plugins.

### Retry config validation strictness — strict at `setConfig` time

**Decision:** `setConfig` (and the layer merge) validates the `retry` block synchronously and throws on bad input (`maxAttempts: 'five'`, `baseMs: -100`, unknown keys, etc.). Bad config is caught at setup, not at first `ask()`.

**Why this might bite:** Strict validation surfaces a backward-compat risk if any existing user has been passing config keys we don't recognize (currently silently ignored). They'd start getting errors at `setConfig` time on upgrade. Mitigation: only validate the `retry` sub-object; leave other keys untouched.

**Trigger to revisit:** An existing user reporting `setConfig` throws after upgrade for a non-retry-related key.

---

## Read-only session methods are unnecessarily blocked in chain mode

**Where:** Throughout `src/index.mjs` — every read-only session method currently throws `'Cannot <op> in chain mode'`. Examples: `getDiscussion` (line 691), `getConfig` (~778), `getModel`, `getProviderName`, `getLastDetailedResponse`, etc. The V0.10 hide/restore inspection helpers (`listTurns`, `isTurnHidden`, `isSectionHidden`, `previewDiscussion`) follow this same convention.

**What's wrong:** Chain mode was designed to prevent state changes mid-chain, but the rule was overgeneralized to "block everything." Read-only operations have no side effects and can't corrupt chain state. Blocking them prevents introspection — exactly when introspection is most useful (debugging "why is my chain producing weird output?"). A user can't even call `getDiscussion` to see what's accumulated, or `previewDiscussion` to see what the next chain step will actually send.

**Why we accepted it for V0.10:** Relaxing it requires touching every read-only method on the session, deciding what "read-only" means precisely for each, and updating tests for the new behavior. That's a wider scope than HIDETURNS warrants, and the new V0.10 helpers blocking in chain mode is *consistent* with the existing behavior — annoying, but not a regression.

**Better fix when revisited:**
1. Audit every method on the session, classify as read-only or state-mutating.
2. Remove the chain-mode block from all read-only methods (both existing and the V0.10 helpers).
3. Document explicitly: "chain mode blocks state-mutating methods; reads work normally."
4. Update tests in `tsInterface.mjs` that currently assert the read-blocks (e.g., `getConfig in chain mode throws` — that test would flip to assert it works).

**Trigger to revisit:** A user reporting they can't debug a chain because `getDiscussion`/`previewDiscussion` throws, or any time we feel the API ergonomics around chain mode justify a wider pass.
