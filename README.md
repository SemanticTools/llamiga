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

Chat interface for discussions:
```javascript
import * as llAmiga  from '../src/index.mjs';
const LASTRESPONSE = llAmiga.LASTRESPONSE;

let chatSession = llAmiga.createSession( 'gemini' );
let response, prompt;


let prompts = [
    "Tell me a joke",  "Tell me another joke based on the first one."
];

chatSession.setSystemMessage("You are a hilarius assistant. Remember this for each reply.");


for( let item of prompts ) {
    prompt = item;
    console.log("\n--- New Prompt ---\n");
    console.log("Prompt: ", prompt)
    
    response = await chatSession.chat( prompt);
    
    console.log( chatSession.getDiscussion( ));
    console.log("Response: ", response);
}
```

Chat interface with multiple providers, and mixed in TFM:
```javascript
import * as llAmiga  from '../src/index.mjs';

const LASTRESPONSE = llAmiga.LASTRESPONSE; //Use last response as input to next LLM/FLM request
let response, prompt;

let chatSession = llAmiga.createSession( 
    [ 
        'gemini', 'anthropic', 'grok', 'mistral', 'openai',  //lets use all plugins in this session
        'toolbert'          //and also our FLM "toolbert"
    ] );


let prompts = [
    {
        prompt: "Tell me a joke",
        provider: "mistral",    
    },
    {
        prompt: "tell me something amazing.",
        provider: "openai",    
    },
    {
        prompt: LASTRESPONSE,
        provider: "toolbert",    
    },
    {
        prompt: LASTRESPONSE,
        provider: "gemini",    
    },
    {
        prompt: "Reflect on the past conversation.",
        provider: "grok"
    }
];

chatSession.setSystemMessage("You are a hilarius assistant.");

for( let item of prompts ) {
    prompt = item.prompt;
    
    console.log("\n--- New Prompt ---\n");
    console.log("Prompt (to " + item.provider + "): ", prompt)
    
    chatSession.setProvider( item.provider );
    
    response = await chatSession.chat( prompt);
    
    console.log( chatSession.getDiscussion( ));
    console.log("Response: ", response);
    console.log("Raw response: ", chatSession.getLastDetailedResponse(), "\n");
}
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


## Features

- Unified interface across all providers
- Conversation history
- Token counting
- Retries and fallback chains
- Very few dependencies

## Status

Beta — API may evolve.

## License

MIT © Dusty Wilhelm Murray / Semantic Tools
