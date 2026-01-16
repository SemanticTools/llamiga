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

## Configuration

Set API keys for the providers you want to use:

```bash
export GOOGLE_API_KEY=your-key      # Gemini
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

## Plugin Configuration for a LLM Council session

Pass plugin-specific settings: (minimal support for this version)

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
| `setConfig(plugin, config)` | Set provider config |
| `getConfig(plugin, model)` | Get provider config |
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
