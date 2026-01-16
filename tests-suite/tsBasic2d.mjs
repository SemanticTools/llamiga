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

const members = [
    "gemini::gemini-2.0-flash",
    "openai::gpt-4-turbo"     , 
    "anthropic::claude-sonnet-4-20250514"  
];

const judge = "mistral::mistral-medium-latest";
const council = "councillius::default";
const toolbert = "toolbert::default";

const councilliusConfig = {
    members: members,
    judge: judge,
    judgementRequest: `As the judge, evaluate the quality of each response from the council members. The original prompt was {{MEMBER-PROMPT}}\n\nOnly return the winner response. Do not comment on why.`,
    judgementItem: "\n\nHere is the response from council member '{{MEMBER-NAME}}':\n------------\n{{MEMBER-RESPONSE}}\n------------\n",
}

let response, prompt;

let chatSession = llAmiga.createSession( 
    [ 
        members, 
        toolbert,
        council 
    ]
);

console.log("Running chained 'ask' session with Toolbert and Councillius\n");

response = await chatSession.chain()

    .ask( toolbert, "dogs, cats, hair, music, sports, science" )
    .ask(    
            council,
            "You are a hilarius assistant." + 
            "You make unpredictable jokes." +
            "Here is some inspiration: {{LASTRESPONSE}}\n\n" + 
            "Tell me a funny joke.",
            councilliusConfig
    )

    .runAll();

console.log("A collectively best joke: \n\n", response.text );
