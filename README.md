# llamiga

Your LLM amiga — a lightweight multi-provider LLM plugin framework for Node.js.

*Amiga means friend. llamiga is your friendly bridge to every major LLM.*

One interface, six providers, zero dependencies.

## What is this?

llamiga lets you talk to any major LLM provider through a unified API. Swap providers with one line. Bring your own plugins. Keep it simple.

## Supported providers

**LLMs:**
- Claude (Anthropic)
- GPT (OpenAI)
- Gemini (Google)
- Mistral
- Grok (xAI)
- Ollama (self-hosted LLAMAs)

**FLMs (Fake Language Models):**
- Toolbert — an auto-feedback plugin that reviews and nudges LLM outputs

FLMs use the same interface as LLMs but don't pretend to be large language models. They're logic, rules, personality — no neural nets.

## Installation

```bash
npm install @semantictools/llamiga
```

## Usage

```javascript
import * as llAmiga  from '../src/index.mjs';

let geminiPG = llAmiga.getPlugin('gemini');
console.log("Plugin default model: " , geminiPG.getModel());

let response = await geminiPG.ask("Hello, how are you?");
if( response.success ) {
    console.log("Gemini response: ", response.text );
}
```

Switch providers instantly:

```javascript
const gemini = llAmiga.getPlugin("gemini");
const gpt = llAmiga.getPlugin("openai");
const local = llAmiga.getPlugin("ollama");

// Same interface, different minds
let result1 = await gemini.ask("Explain quantum computing");
let result1 = await gpt.ask("Explain quantum computing");
let result1 = await local.ask("Explain quantum computing");
```

## Configuration

Set your API keys as environment variables:

```bash
export ANTHROPIC_API_KEY=your-key
export OPENAI_API_KEY=your-key
export GOOGLE_API_KEY=your-key
export MISTRAL_API_KEY=your-key
export GROK_API_KEY=your-key
export OLLAMA_API_BASE=http://localhost:11434
```

Only configure the providers you plan to use.

## Bring your own plugin

Register custom providers:

```javascript
import { registerPlugin } from '@semantictools/llamiga';

registerPlugin("my-provider", {
  ask: async (prompt) => {
    // your implementation
    return response;
  }
});

const custom = getPlugin("my-provider");
await custom.ask("Hello custom!");
```

## Features

- Unified interface across all providers
- Streaming support
- Conversation history
- Token counting
- Retries and fallback chains
- Zero dependencies

## Status

Beta — API may evolve.

## License

MIT © Dusty Wilhelm Murray / Semantic Tools
