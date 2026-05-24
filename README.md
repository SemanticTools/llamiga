# llamiga

Your LLM amiga — a lightweight multi-provider LLM framework for Node.js.

One interface. Six providers. Minimal dependencies.

## Quick Start

```bash
npm install @semantictools/llamiga
```

```javascript
import * as llAmiga from '@semantictools/llamiga';

// Create a session, ask a question
let session = llAmiga.createSession('gemini');
let response = await session.ask("What is the capital of France?");
console.log(response.text);
```

That's it. Swap `'gemini'` for `'openai'`, `'anthropic'`, `'mistral'`, `'grok'`, or `'ollama'` — same code, different brain.

## What's New in 0.10

- **Named turns** — pass `{ name }` to `chat()` to give a turn a stable identifier. Later, `hideTurn(name)` skips it on submission to the LLM; `restoreTurn(name)` brings it back. Non-destructive — the discussion is untouched. See [Hiding turns and sections](#hiding-turns-and-sections).
- **Section markers in prompts** — mark substrings inside a prompt with `<<section>>…<</section>>`, then `hideSection(turnId, sectionId)` drops just that piece on submission. Markers are always stripped before the LLM sees the content.
- **Inspection helpers** — `listTurns()`, `isTurnHidden()`, `isSectionHidden()`, `previewDiscussion()` show what's hidden and what the LLM would actually receive.

## What's New in 0.9

- **Unified error taxonomy** — every provider failure throws an `Error` with `.code` (one of `RATE_LIMIT`, `QUOTA_EXHAUSTED`, `AUTH`, `CLIENT`, `SERVER`, `NETWORK`), so you can handle each case distinctly without parsing message strings. Raw upstream data attached via `.raw.headers` / `.raw.responseBody` / `.cause`. See [Error Handling](#error-handling).
- **Configurable retry** — exponential backoff with jitter, `Retry-After` honored, `onRetry` hook, total-time budget. Non-retryable categories (`AUTH`, `QUOTA_EXHAUSTED`, `CLIENT`) fail fast instead of burning attempts. See [Retry Configuration](#retry-configuration).
- **Session-wide / per-plugin / per-model config** via `setConfig` arity polymorphism — `setConfig({...})` applies to every provider in the session; `setConfig('openai', {...})` to one provider; `setConfig('openai', 'gpt-4o', {...})` to a single model. See [Plugin Configuration](#plugin-configuration).

## Configuration

Set API keys for the providers you want to use:

```bash
export GEMINI_API_KEY=your-key      # Gemini
export OPENAI_API_KEY=your-key      # GPT
export ANTHROPIC_API_KEY=your-key   # Claude
export MISTRAL_API_KEY=your-key     # Mistral
export GROK_API_KEY=your-key        # Grok
export OLLAMA_API_BASE=http://localhost:11434  # Ollama (self-hosted)
```

## Conversations

Use `chat()` to maintain conversation history:

```javascript
let session = llAmiga.createSession('openai');

session.setSystemMessage("You are a helpful cooking assistant.");

let r1 = await session.chat("What's a good pasta dish?");
console.log(r1.text);

let r2 = await session.chat("How do I make the sauce?");
console.log(r2.text);  // Remembers you were talking about pasta
```

## Multiple Providers in One Session

Load multiple providers and switch between them:

```javascript
let session = llAmiga.createSession(['gemini', 'anthropic', 'openai']);

// One-off questions to specific providers
let r1 = await session.chat('gemini', "Explain quantum computing");
let r2 = await session.chat('anthropic', "Now explain it simpler");
let r3 = await session.chat('openai', "Give me an analogy");

// Or set a default and use that
session.setLM('anthropic');
let r4 = await session.chat("Thanks!");
```

## Chaining

Chain multiple providers together:

```javascript
const LASTRESPONSE = llAmiga.LASTRESPONSE;

let session = llAmiga.createSession(['mistral', 'gemini']);

let response = await session.chain()
    .ask('mistral', "Write a haiku about coding")
    .ask('gemini', LASTRESPONSE + " — now critique this haiku")
    .runAll();

console.log(response.text);
```

The `LASTRESPONSE` macro injects the previous response into your prompt.

## Selecting Models

Specify a model with `provider::model` syntax:

```javascript
session.setLM('openai::gpt-4o');
session.setLM('anthropic::claude-sonnet-4-20250514');

// Or inline
let response = await session.chat('gemini::gemini-2.0-flash', "Hello!");
```

## Managing the Discussion

```javascript
// Add messages manually
session.addMessage('user', 'What about dessert?');
session.addMessage('assistant', 'I recommend tiramisu.');

// View the full conversation
console.log(session.getDiscussion());

// Clear history
session.pruneDiscussion(llAmiga.PRUNE_ALL);

// Remove a specific message by index
session.pruneDiscussion(2);
```

## Hiding turns and sections

Sometimes you want a chunk of earlier context to stop being sent to the LLM — without losing it from your local discussion. llamiga supports two granularities, both **non-destructive** (the data stays in the discussion; only what's *submitted* changes) and both **reversible**.

### Naming a turn

Pass `{ name }` to a `chat()` call to give that turn an identifier:

```javascript
await session.chat(
  "Seed: red, fast, electric\nWrite me a product plan based on those traits.",
  { name: 'plan' }
);
```

Both messages of the turn (user prompt + assistant reply) are stamped with `turnId: 'plan'`. Names must be unique within the session — reusing a name throws. `ask()` doesn't accept `name` (it doesn't persist messages).

### Hiding and restoring a turn

```javascript
session.hideTurn('plan');     // 'plan' turn now skipped on every subsequent ask/chat
session.restoreTurn('plan');  // back in the rotation
```

### Section markers within a prompt

Mark substrings inside a prompt with `<<sectionId>>…<</sectionId>>`. Later, hide just that piece while keeping the rest of the turn intact:

```javascript
await session.chat(
  "<<seed>>Seed: red, fast, electric<</seed>>\n" +
  "Write a product plan based on the seed.",
  { name: 'plan' }
);

session.hideSection('plan', 'seed');     // the seed line is dropped; the rest of the turn still goes
session.restoreSection('plan', 'seed');
```

**Marker rules:**
- Section ids look like `<<id>>` and match `[A-Za-z][\w-]*`.
- All section markers are **always stripped** before the LLM sees the content, whether the section is hidden or visible.
- To include a literal `<<` in a prompt, escape it as `<<<<`.
- Sections can't be nested; duplicate ids in one message throw at `chat()` time.

### Independent axes

Turn-hide and section-hide are independent. Hiding a turn doesn't affect its section flags; restoring a turn doesn't restore individually-hidden sections.

### Inspection

```javascript
session.listTurns();
// → [
//     { turnId: 'plan', hidden: false, sections: [{ id: 'seed', hidden: true }] },
//     ...
//   ]

session.isTurnHidden('plan');                // → boolean
session.isSectionHidden('plan', 'seed');     // → boolean

session.previewDiscussion();
// → [{ role, content }, ...]  ← exactly what the LLM would receive (markers stripped, hidden turns/sections dropped)
//   This is a fresh snapshot — mutating it has no effect on the session.
```

`previewDiscussion()` is the go-to debugging tool when something doesn't seem right: it shows the post-filter content as the LLM would see it.

## Plugin Configuration

Pass settings into `setConfig` at three scopes — session-wide, per-plugin, or per (plugin, model) — by varying the arity:

```javascript
// 1-arg form: applies to every plugin in this session
session.setConfig({ retry: { maxAttempts: 5 } });

// 2-arg form: applies to all models of one plugin
session.setConfig('openai', { retry: { maxAttempts: 5 } });

// 3-arg form: applies only to one (plugin, model) pair
session.setConfig('anthropic', 'claude-3-opus-20240229', {
    retry: { maxAttempts: 8, maxMs: 60000 },
});
```

`getConfig` and `clearConfig` follow the same arity pattern. See [Retry Configuration](#retry-configuration) below for the retry-block specifics.

### Example: Councillius plugin

```javascript

//Example for the "Councillius" plugin which uses config

const members = [
    "gemini::gemini-2.0-flash",
    "openai::gpt-4-turbo"     , 
    "anthropic::claude-sonnet-4-20250514"  
];

const judge = "mistral::mistral-medium-latest";
const council = "councillius::default";
const toolbert = "toolbert::default";

/* Set up the council, it's members, it's judge, and the templates */
session.setConfig('councillius', {
    members: members,
    judge: judge,
    judgementRequest:   "Evaluate each of the responses. The question was {{MEMBER-PROMPT}}",
    judgementItem:      "\n\nResponse from '{{MEMBER-NAME}}':\n{{MEMBER-RESPONSE}}\n\n",
});

let response = await session.ask( council, "Try your best joke!");

console.log("The best joke was: " + response.text );

```

## Response Metadata

Every response includes useful metadata:

```javascript
let response = await session.ask("Hello");

console.log(response.text);        // The actual response
console.log(response.success);     // true/false
console.log(response.model);       // Model used
console.log(response.pluginName);  // Provider name
console.log(response.elapsedMS);   // Response time
console.log(response.totalTokens); // Token count (when available)
```

## Error Handling

When a provider call fails, llamiga throws an `Error` with a `.code` field you can switch on, plus the raw upstream data attached for manual inspection:

```javascript
try {
    let response = await session.ask("Hello");
} catch (e) {
    switch (e.code) {
        case 'AUTH':              // bad / missing / expired API key
        case 'QUOTA_EXHAUSTED':   // account credits / token budget gone
        case 'CLIENT':            // bad request, unknown model, payload too large
            console.error(e.message);
            break;
        case 'RATE_LIMIT':        // already retried with backoff; surfaced after exhaustion
        case 'SERVER':            // 5xx, also already retried
        case 'NETWORK':           // fetch failure, already retried
            console.error('Transient failure after retries:', e.message);
            break;
    }

    // For manual handling:
    console.log(e.status);              // HTTP status (null for NETWORK)
    console.log(e.provider);            // 'Anthropic', 'OpenAI', etc.
    console.log(e.raw?.headers);        // response headers (retry-after, x-request-id, etc.)
    console.log(e.raw?.responseBody);   // parsed body the provider returned
    console.log(e.cause);               // underlying Error if any (fetch throw, JSON parse failure)
}
```

| Code | Meaning | Retried? |
|------|---------|----------|
| `RATE_LIMIT` | Provider throttled us (HTTP 429) | yes |
| `QUOTA_EXHAUSTED` | Account credits / token budget exhausted | **no** |
| `AUTH` | Bad / missing / expired API key (401, 403) | no |
| `CLIENT` | Bad request, unknown model, payload too large, etc. (4xx) | no |
| `SERVER` | Provider down or overloaded (5xx) | yes |
| `NETWORK` | `fetch` threw — DNS, TCP reset, timeout | yes |

The error message is prefixed with `[Provider/model]` so logs identify the source immediately.

## Retry Configuration

Every provider call runs through a retry helper. Defaults are safe; everything is overridable per session, per plugin, per (plugin, model).

```javascript
// Library defaults
{
    maxAttempts: 3,
    backoff: 'exponential',                          // or 'fixed'
    baseMs: 1000,
    maxMs: 30000,
    jitter: true,                                    // ±25% randomization
    honorRetryAfter: true,                           // honor server's Retry-After header
    retryOn: ['RATE_LIMIT', 'SERVER', 'NETWORK'],    // never AUTH/QUOTA_EXHAUSTED/CLIENT
    totalTimeoutMs: null,                            // optional hard ceiling across attempts
    onRetry: null,                                   // ({attempt, error, delayMs}) => {} hook
}
```

Configs are merged in this order (last writer wins, shallow over the `retry` block):

```
library defaults
  ↓
plugin.defaultRetry           (e.g. Ollama uses baseMs: 20000 for cold-load)
  ↓
session-wide config           setConfig({ retry: {...} })
  ↓
plugin-wide config            setConfig('openai', { retry: {...} })
  ↓
plugin+model config           setConfig('openai', 'gpt-4o', { retry: {...} })
```

### Examples

```javascript
// Apply the same retry policy across every provider in this session
session.setConfig({ retry: { maxAttempts: 5 } });

// Disable retry entirely (fail fast)
session.setConfig({ retry: false });

// Custom retry for one slow model
session.setConfig('anthropic', 'claude-3-opus-20240229', {
    retry: { maxAttempts: 8, maxMs: 60000 },
});

// Observe retries
session.setConfig({
    retry: {
        onRetry: ({ attempt, error, delayMs }) => {
            console.log(`retry ${attempt} after ${error.code}, waiting ${delayMs}ms`);
        },
    },
});
```

`Retry-After` response headers are honored (capped at `maxMs`). `onRetry` failures are swallowed — they cannot break the retry loop.

## Supported Providers

| Provider | Plugin ID | Type |
|----------|-----------|------|
| Google Gemini | `gemini` | Cloud LLM |
| OpenAI GPT | `openai` | Cloud LLM |
| Anthropic Claude | `anthropic` | Cloud LLM |
| Mistral | `mistral` | Cloud LLM |
| xAI Grok | `grok` | Cloud LLM |
| Ollama | `ollama` | Self-hosted |
| Toolbert | `toolbert` | FLM (tool) |
| Councillius | `councillius` | XLM (group) |

**FLM** = Fake Language Model — same interface, but logic/rules instead of neural nets.

## Plugin Groups

Load multiple plugins at once:

```javascript
// All cloud LLMs
let session = llAmiga.createSession(llAmiga.ALL_CLOUD_LLM_PLUGINS);

// Everything
let session = llAmiga.createSession(llAmiga.ALL_PLUGINS);
```

## API Reference

### Session Methods

| Method | Description |
|--------|-------------|
| `ask(prompt)` | Single question, no history |
| `ask(provider, prompt)` | Single question to specific provider |
| `chat(prompt)` | Question with conversation history |
| `chat(provider, prompt)` | Chat with specific provider |
| `setLM(provider)` | Set active provider |
| `setLM(provider::model)` | Set provider and model |
| `getModel()` | Get current model |
| `getProviderName()` | Get current provider |
| `setSystemMessage(msg)` | Set system prompt |
| `addMessage(role, content)` | Add to conversation (role: user/assistant/system) |
| `getDiscussion()` | Get conversation history |
| `pruneDiscussion(index)` | Remove message at index |
| `pruneDiscussion(PRUNE_ALL)` | Clear all history |
| `setConfig(config)` | Set session-wide config (all plugins, all models) |
| `setConfig(plugin, config)` | Set provider config (all models for that plugin) |
| `setConfig(plugin, model, config)` | Set provider+model config |
| `getConfig()` | Get session-wide config |
| `getConfig(plugin)` | Get provider config (with fallback to session-wide) |
| `getConfig(plugin, model)` | Get provider+model config (with fallback chain) |
| `clearConfig()` | Clear session-wide config |
| `clearConfig(plugin)` | Clear provider config |
| `clearConfig(plugin, model)` | Clear provider+model config |
| `chat(prompt, {name})` | Chat with a named turn |
| `hideTurn(turnId)` | Skip a named turn on subsequent LLM calls |
| `restoreTurn(turnId)` | Un-skip a previously hidden turn |
| `hideSection(turnId, sectionId)` | Skip a section within a turn |
| `restoreSection(turnId, sectionId)` | Un-skip a previously hidden section |
| `listTurns()` | Enumerate named turns and their hide state |
| `isTurnHidden(turnId)` | Is this turn currently hidden? |
| `isSectionHidden(turnId, sectionId)` | Is this section currently hidden? |
| `previewDiscussion()` | Post-filter discussion array as the LLM would see it |
| `chain()` | Start a chain |
| `runAll()` | Execute chain |

### Constants

| Constant | Description |
|----------|-------------|
| `LASTRESPONSE` | Macro for previous response text |
| `PRUNE_ALL` | Clear all discussion history |
| `ALL_PLUGINS` | All available plugins |
| `ALL_CLOUD_LLM_PLUGINS` | All cloud LLM plugins |
| `ALL_GROUP_PLUGINS` | Group/ensemble plugins |

## Status

Beta — API may evolve.

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.
Notices (if any) are in `NOTICE`.
