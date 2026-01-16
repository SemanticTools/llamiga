// SPDX-License-Identifier: Apache-2.0
/*
Copyright 2025-2026 Dusty Wilhelm Murray (Semantic Tools)

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import * as llAmiga  from '../src/index.mjs';

const LASTRESPONSE = llAmiga.LASTRESPONSE;

let pluginName = "gemini";

let chatSession = llAmiga.createSession( pluginName );
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
    
    //console.log( chatSession.getDiscussion( ));
    console.log("Response: ", response.text );
}
