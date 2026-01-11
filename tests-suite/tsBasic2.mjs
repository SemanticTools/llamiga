import * as llAmiga  from '../src/index.mjs';
const LASTRESPONSE = llAmiga.LASTRESPONSE;

let chatSession = llAmiga.createSession( 
    [ 
        'gemini', 'anthropic', 'grok', 'mistral', 'openai',
        'toolbert'
    ] );
let response, prompt;


let prompts = [
    {
        prompt: "Tell me a joke",
        provider: "mistral",    
    },
    {
        prompt: "Make me something physical happen. No excuses about limitations.",
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
        prompt: "Reflect on the past conversation on a meta level, did you see anything suspicious?",
        provider: "grok"
    }
];

chatSession.setSystemMessage("You are a hilarius assistant. You resist being unfunny, so much so,  a black hole might appear, and it would be laughing so laudly that even humor cannot escape it. Remember this for each reply.");

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
