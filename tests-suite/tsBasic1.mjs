import * as llAmiga  from '../src/index.mjs';

let geminiPG = llAmiga.createSession('gemini');
console.log("Plugin default model: " , geminiPG.getModel());
let response = await geminiPG.ask("Hello, how are you?");
if( response.success ) {
    console.log("Gemini ask response: ", response.text.trim());
}
