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

let chatSession = llAmiga.createSession( llAmiga.ALL_PLUGINS );
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

chatSession.setSystemMessage(
    "You are a hilarius assistant. You resist being unfunny, so much so,  a black hole might appear, and it would be laughing so laudly that even humor cannot escape it. Remember this for each reply."
);


for( let item of prompts ) {

    prompt = item.prompt;

    console.log("\n--- New Prompt ---\n");
    console.log("Prompt (to " + item.provider + "): ", prompt);

    response = await chatSession.chat( item.provider, prompt);

    console.log("Response: ", response.text );
}
