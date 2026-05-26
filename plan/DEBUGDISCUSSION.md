# LLaMiga — Debug last submission to the LLM

## Goals

1. Let callers see **exactly what was sent to the LLM** on the most recent call — the same `{role, content}` array the plugin received, plus the prompt, model, and provider used.
2. Capture the **hide state at submission time** so a caller can answer "why was this turn/section missing?" not just "it was missing."
3. Work uniformly for `chat()`, `chatStream()`, `ask()`, and chain mode.
4. Zero configuration: the most recent submission is always available for inspection. No opt-in flag, no setup boilerplate.

## Out of scope

- A history / ring buffer of past submissions. Only the most recent one is retained for V0.11; multi-call replay can be added later if needed.
- Provider-specific transformations (e.g. Gemini's `assistant → model` role rename, OpenAI's per-model body shape). Those happen inside each plugin after `_rawChat` hands off — we capture *before* that, in canonical llamiga shape.
- Storing or rotating submission data to disk. In-memory only.
- Capturing the actual HTTP request/response payload. Those live in `err.raw.headers` / `err.raw.responseBody` (V0.9) on the failure path; this feature complements them on the success path.

---

## 1. Relationship to `previewDiscussion()` (V0.10)

| | `previewDiscussion()` | `getLastSubmission()` |
|---|---|---|
| When does it reflect | **Now** — what the next call would send if you triggered it now | **Then** — what was actually sent on the most recent call |
| Live or frozen | Live — changes as you hide/restore | Frozen at the moment of submission |
| What you see | Post-filter `[{role, content}, ...]` | Same plus model, provider, hide state, prompt, sanitized config |
| Use when | "Will the LLM see this if I call now?" | "Why did the LLM produce that output?" |

The two are complementary, not redundant. `previewDiscussion` is predictive; `getLastSubmission` is historical.

A classic debugging scenario:

1. Caller runs `chat()` with the plan turn hidden, gets unexpected output.
2. Caller restores the plan turn (still confused).
3. `previewDiscussion()` now shows the plan turn visible — useless for diagnosing the prior call.
4. `getLastSubmission()` still shows the plan turn was hidden at the time, with the exact post-filter content that went out. Diagnosis unblocked.

---

## 2. Data captured

```js
session.getLastSubmission()
// → {
//     timestamp: '2026-05-25T14:32:11.123Z',   // ISO string, when _rawChat sent
//     plugin: 'pgOpenAINative',                // plugin._.id
//     model: 'gpt-4o',                         // resolved model name
//     prompt: 'cleaned current prompt',        // post-filter, markers stripped
//     discussion: [                            // exactly what plugin.complete received
//       { role: 'system',    content: '...' },
//       { role: 'user',      content: '...' },
//       { role: 'assistant', content: '...' },
//       ...
//     ],
//     hideState: {                             // snapshot of what was hidden at submission time
//       hiddenTurns:    ['plan'],              // turnIds with active === false
//       hiddenSections: [                      // (turnId, sectionId) pairs that were hidden
//         { turnId: 'plan', sectionId: 'seed' },
//         ...
//       ],
//     },
//     config: {                                // sanitized — see §6
//       retry: { maxAttempts: 3, ... },
//       // any other non-function, non-session-ref fields the caller passed
//     },
//   }
```

Returns `null` if no call has been made yet (no submission to report).

### Why also include `hideState`

The post-filter `discussion` array shows *what* the LLM saw. `hideState` answers *why* something is missing from that array — without it, a caller staring at `discussion` has to guess whether content was hidden, never existed, or was pruned.

`hideState` is derived at capture time by walking `this.discussion` and recording `{turnId}` for every message with `active === false` and `{turnId, sectionId}` for every hidden section. Cheap to compute, dense to store.

---

## 3. API surface

One new session method:

```js
session.getLastSubmission()  // → { timestamp, plugin, model, prompt, discussion, hideState, config } | null
```

That's it. No setter, no clearer (the value is overwritten by each successive submission), no history.

**Chain mode:** blocked, consistent with all other inspection methods (V0.10). To revisit alongside the chain-mode-read-restrictions TECHNICALDEBT entry.

---

## 4. Where the capture happens

Inside `_rawChat`, immediately *after* the four-layer config merge and the V0.10 submission filter, immediately *before* `plugin.complete()` runs:

```js
// existing in _rawChat:
const filteredDiscussion = ...;
const filteredPrompt = ...;
config.retry = mergeRetry(...);

// NEW in V0.11 — capture the submission:
this.lastSubmission = {
  timestamp: new Date().toISOString(),
  plugin: plugin._.id,
  model,
  prompt: filteredPrompt,
  discussion: filteredDiscussion.map(m => ({ role: m.role, content: m.content })),
  hideState: this._captureHideState(),
  config: sanitizeConfigForCapture(config),
};

// existing — actual call:
let result = await plugin.complete(model, filteredPrompt, filteredDiscussion, config);
```

The capture happens regardless of whether `plugin.complete` succeeds or throws — debugging matters most when a call fails, and that's exactly when you want to inspect what was sent.

Each call overwrites `this.lastSubmission`. No accumulation, no eviction policy.

---

## 5. Why capture *before* the plugin call?

Plugins are free to transform the canonical `{role, content}` array into provider-specific shapes — OpenAI's `messages: [{role, content}]` differs from Gemini's `contents: [{role, parts: [{text}]}]`, etc. Capturing pre-transformation gives a stable, provider-agnostic shape that callers can reason about uniformly.

If a caller specifically wants the on-the-wire payload, they can use `err.raw.responseBody` on the failure path or rely on per-provider logging. That's outside this feature's scope.

---

## 6. Sanitizing `config`

The merged `config` object that flows into `plugin.complete` has a few things that don't belong in a debug snapshot:

- `framework` — internal helper object, large, useless for users.
- `session` — circular reference back to the session itself. JSON.stringify will explode.
- `retry.onRetry` — a function, which doesn't serialize meaningfully.
- `onChunk` (streaming) — a function.

Sanitization strategy: shallow-copy `config`, then delete `framework` and `session`, then walk `retry` and replace any function-valued fields with the string `'[function]'`. Same for top-level `onChunk` if present.

```js
function sanitizeConfigForCapture(config) {
  const clean = { ...config };
  delete clean.framework;
  delete clean.session;
  if (clean.retry) {
    const r = { ...clean.retry };
    if (typeof r.onRetry === 'function') r.onRetry = '[function]';
    clean.retry = r;
  }
  if (typeof clean.onChunk === 'function') clean.onChunk = '[function]';
  return clean;
}
```

The result is JSON-serializable, which means callers can `JSON.stringify(session.getLastSubmission())` for logs / bug reports / dumps without surprises.

---

## 7. Memory implications

Per submission, we retain:
- `prompt` — a string, post-filter (≤ size of original prompt)
- `discussion` — array of `{role, content}` pairs, post-filter (≤ size of original discussion content)
- `hideState` — small struct
- `config` — sanitized merge result, similar order of magnitude to caller's config object

In practice this is a few hundred bytes to maybe ~50 KB depending on how big the discussion is. Negligible for chat-sized usage; non-trivial for a 1000-turn megaconversation but still small in absolute terms.

Only **one** submission is retained at a time. Each new call overwrites the previous. No leak.

If a future use case needs zero overhead, we can add an opt-out (`session.setConfig({ debug: { captureSubmission: false } })`), but V0.11 ships with always-on capture for simplicity and zero-discovery-cost debuggability.

---

## 8. Interactions with existing features

| Feature | Interaction |
|---|---|
| **`ask()`** | Captures submission identically. `lastSubmission.discussion` will be `[]` since ask doesn't use history. |
| **`chat()` / `chatStream()`** | Captures submission with the full filtered discussion. |
| **Named turns / hidden turns / sections** | `hideState` snapshot records what was hidden at submission time. Subsequent restore/hide calls don't retroactively change the captured snapshot. |
| **Chain mode** | Each chained call overwrites `lastSubmission` as it runs. After `runAll()`, `lastSubmission` reflects the final chained call. To inspect intermediate steps, the chain would need to capture each step — out of scope for V0.11 (open question §11). |
| **Streaming** | The submission is captured at the start of the call (when `_rawChat` hands off), not as chunks arrive. The captured `discussion`/`prompt` is whatever was sent to start the stream. |
| **V0.9 error classification** | On a failed call, both `err.raw.*` (HTTP details) and `session.lastSubmission` (request payload) are available. Together they give a complete picture: what we sent, what came back, what error category. |
| **`setDiscussion(arr)`** | Doesn't clear or alter `lastSubmission`. The captured snapshot reflects whatever discussion existed at the prior call's submission time, regardless of subsequent mutations. |

---

## 9. File changes

| File | Change |
|---|---|
| `src/index.mjs` | In `_rawChat`: build the `lastSubmission` object and assign to `this.lastSubmission` just before `plugin.complete()`. Add `getLastSubmission()` and `_captureHideState()` session methods. Add `lastSubmission: null` to session state initialization. |
| `tests-suite/tsDebugDiscussion.mjs` | **new** — verifies capture for ask/chat, with hidden turns/sections, on error path, sanitization, chain-mode blocking, etc. |
| `README.md` | New subsection inside "Hiding turns and sections" called "Debugging the last submission" — explains `getLastSubmission()` with example. Update Session Methods table to add the new row. Add a "What's New in 0.11" entry at the top. |
| `plan/DEBUGDISCUSSION.md` | This file. |

No new modules; the capture/sanitize logic is local to `_rawChat` and short enough to live inline.

---

## 10. Behavior changes visible to callers

1. **New session field `lastSubmission`** appears (initially `null`). Read via `getLastSubmission()`. No interaction with any existing field.
2. **Memory footprint increases by one captured submission** per session. See §7 — negligible in practice.
3. **No API breakage** — purely additive. Existing code paths unchanged.

---

## 11. Open questions to resolve

1. **Should `getLastSubmission()` work in chain mode?** Consistent answer per V0.10 design: block in chain mode (matches `getDiscussion`, `previewDiscussion`, etc., and the open TECHNICALDEBT note about relaxing read-only methods in chain mode is the right place to revisit this).

2. **Should chain mode capture every intermediate submission, not just the last?** Most useful would be `session.getChainSubmissions()` → array of submissions, one per chained call. But this expands the feature meaningfully. **Default for V0.11: just the last one**, same as non-chain mode. Add chain-history capture as a follow-up if requested.

3. **Should we also attach the submission to the `response` object** (`response.submission = {...}`) so callers can save it per-call without racing the session-level overwrite? **Lean toward yes** — trivial to add, makes "save submission with each call" ergonomic. The session-level `lastSubmission` is a convenience for ad-hoc debug; the response-attached copy is for persistence/logging.

4. **Should errored calls capture submission *before* the throw propagates?** **Yes** — that's exactly when debug matters most. The capture happens on the line before `plugin.complete()`, so by construction the submission is recorded whether the call succeeds or throws.

5. **Should `lastSubmission.config` include the *unmerged* config layers too**, or just the final merged result? Merged-only keeps the snapshot simple; unmerged would help debug why a particular retry value ended up as it did. **Lean toward merged-only**; if users hit cases where they want to know "why is maxAttempts 5?", they can run `getConfig()` separately to inspect each layer.

---

## 12. Test plan

### Unit / integration (via testbert, no API keys)

- After `chat("hi")`, `getLastSubmission()` returns an object with the expected shape (timestamp, plugin, model, prompt, discussion, hideState, config).
- After `ask("hi")`, `lastSubmission.discussion === []` (no history sent), `prompt` matches.
- Before any call, `getLastSubmission()` returns `null`.
- A second call overwrites the first; the snapshot from the first is no longer accessible.
- With a hidden turn before the call: `lastSubmission.discussion` doesn't contain that turn's messages; `lastSubmission.hideState.hiddenTurns` includes the turnId.
- With a hidden section: section body is dropped in `lastSubmission.discussion[i].content`; `hideState.hiddenSections` includes the `{turnId, sectionId}` pair.
- After the call, restoring the turn does NOT change `getLastSubmission()` — the snapshot is frozen.
- On a failed call (testbert simulating an error), `lastSubmission` is still set with the request that was attempted.
- `lastSubmission.config` is JSON-serializable: `JSON.stringify(getLastSubmission())` does not throw. No `framework` or `session` keys present. `retry.onRetry` is `'[function]'` if a hook was set, not the live function.
- `getLastSubmission()` throws in chain mode.

---

## 13. Documentation updates

### README.md

- **What's New in 0.11** — short bullet at top.
- **New subsection under "Hiding turns and sections": "Debugging the last submission"** — explains `getLastSubmission()`, shows the shape of the returned object, gives a "I called the LLM and got weird output, now what?" example using both `previewDiscussion()` and `getLastSubmission()`.
- **Session Methods table** — add one row:
  ```
  | `getLastSubmission()` | Frozen snapshot of what was sent on the most recent call |
  ```

### In-code documentation

- JSDoc on `getLastSubmission` and `_captureHideState`.

---

## 14. License header

New source file `tests-suite/tsDebugDiscussion.mjs` carries the standard SPDX + Apache-2.0 header per project convention. Modifications to existing files keep their existing headers.

---

## 15. Versioning

Patch or minor bump: this is purely additive (new method, no signature changes). Goes out as **0.11.0** since we've been pacing minor bumps per feature set rather than batching.

---

## 16. Not in scope for this version

- **Ring buffer / call history.** Only the most recent submission is retained.
- **Per-step capture in chain mode.** A future `getChainSubmissions()` could expose every step; deferred.
- **Disk persistence.** In-memory only.
- **Pre-filter snapshot of the discussion.** The post-filter discussion plus `hideState` is sufficient to reason about what was hidden; the pre-filter array would just be `getDiscussion()` minus subsequent mutations, and we don't capture session state mutations historically.
- **Provider-specific on-the-wire payload.** Captured in canonical llamiga shape, not the per-provider transform.
