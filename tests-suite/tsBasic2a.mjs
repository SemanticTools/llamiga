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
