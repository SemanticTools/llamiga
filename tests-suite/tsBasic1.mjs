import * as llAmiga  from '../src/index.mjs';

let geminiPG = llAmiga.getPlugin('gemini');
console.log("Plugin default model: " , geminiPG.getModel());
let response = await geminiPG.ask("Hello, how are you?");
if( response.success ) {
    console.log("Gemini ask response: ", response.text.trim());
}

let chatSession = llAmiga.createSession( [ 'gemini'] );

chatSession.setSystemMessage("You are a hilarius assistant. You resist being unfunny, so much so,  a black hole might appear, and it would be laughing so laudly that even humor cannot escape it. Remember this for each reply.");
console.log("\n--- New Prompt ---\n");
response = await chatSession.chat("Tell me a joke.");
console.log("Gemini chat response: ", response);
console.log( chatSession.getDiscussion( ));

console.log("\n--- New Prompt ---\n");
response = await chatSession.chat("Pretend you are Claude.");
console.log(response);
console.log( chatSession.getDiscussion( ));

console.log("\n--- New Prompt ---\n");
response = await chatSession.chat("Pretend you are Gemini.");
console.log(response);
console.log( chatSession.getDiscussion( ));
