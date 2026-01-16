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

/* 
Test plugin, only to test the interface. It does not actually do anything more then return a canned response.
*/
// SPDX-License-Identifier: Apache-2.0
/*
Copyright 2025-2026 Dusty Wilhelm Murray (Semantic Tools)

Licensed under the Apache License, Version 2.0 (the "License");
...
*/

/* 
Test plugin - returns canned responses for interface testing.
Does not call any external API.
*/

const pluginName = "pgTestBert1";
const pluginVersion = "0.8.0";
const commands = true;

function envInit() {
  // No API key needed for test plugin
}

function getDefaultModel(size = "medium") {
  return "testbert-mock-v1";
}

function translateRole(role, index) {
  if (role === "assistant") return "assistant";
  if (role === "user") return "user";
  if (role === "system") return "user";
  return "user";
}

async function complete(model, prompt, messages0, config = {}) {
  // Simulate a small delay like a real API would have
  const delay = config.mockDelay ?? 10;
  await new Promise(resolve => setTimeout(resolve, delay));


  let truncated = prompt;
  if (truncated.length > 250) {
        truncated = truncated.substring(0, 247) + "...";
  }
  //remove newlines
  truncated = truncated.replace(/\n/g, ' ');

  const config_message = config.testmessage ? "<" + config.testmessage +">" : "no_test_config";

  // Canned responses - could expand this with pattern matching
  const cannedResponses = [
    "TestBert1("+model+"): This is a test response to: \n"+ truncated + "\n" + config_message,
    "TestBert1("+model+"): This is another test response to:\n"+ truncated + "\n" + config_message,
    "TestBert1("+model+"): And yet another test response to: \n"+ truncated + "\n" + config_message,

  ];

  const responseText = config.fixedResponse 
    ?? cannedResponses[Math.floor(Math.random() * cannedResponses.length)];

  const mockTokenCount = Math.floor((prompt.length + responseText.length) / 4);

  return {
    success: true,
    retries: 0,
    text: responseText,
    responseId: "testbert-" + Date.now(),
    totalTokens: mockTokenCount,
    raw: {
      model: model,
      mock: true,
      prompt_length: prompt.length,
      message_count: messages0?.length ?? 0
    }
  };
}

const id = pluginName;
const version = pluginVersion;

export { complete, id, version, commands, envInit, getDefaultModel , translateRole };