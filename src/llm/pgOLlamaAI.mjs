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

/* OLlama Plugin for OLLAMA running on a (private) server */

const pluginName = "pgOLlamaNative";
const pluginVersion = "0.0.3";
const commands = true;

import process from 'node:process';

const keyName = 'OLLAMA_API_BASE';
const API_BASE = process.env[keyName];

function envInit() {
  if (!API_BASE) {
    let error = keyName + ' environment variable is not set. Please set it to your Ollama API base URL.';
    console.error('\n❌ ' + error + "\n");
    throw new Error(error);
  }
}

function getDefaultModel(size = "medium") {
  return "llama3";
}

function translateRole(role, index) {
  if (role === "assistant") return "assistant";
  if (role === "user") return "user";
  if (role === "system" && index === 0) return "system";
  if (role === "system") return "user"; // subsequent system messages become user
  return "user";
}

async function complete(model, prompt, messages0, config={}) {
  const maxTries = 3;
  let retries = 0;

  while (retries < maxTries) {
    try {
      // 1. Transform messages to Ollama format
      let contents = [];
      let messages = messages0;
      if (messages === null) messages = [];

      let i = 0;
      for (let msg of messages) {
        if (msg.role === "local-system") {
          continue;
        }
        const role = translateRole(msg.role, i);
        contents.push({
          role: role,
          content: msg.content
        });
        i++;
      }

      // Add the current prompt
      contents.push({
        role: "user",
        content: prompt
      });

      // 2. Call the Ollama endpoint
      const url = API_BASE + '/api/chat';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: contents
        })
      });

      if (!response.ok) {
        if (response.status === 429 || response.status === 500) {
          const waitTime = 20000;
          console.warn(`⚡ Ollama API issue (${response.status}). Retrying...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retries++;
          continue;
        }
        const errorData = await response.text().catch(() => '');
        throw new Error(`Ollama API error ${response.status}: ${errorData}`);
      }

      // 3. Parse streaming NDJSON response
      const responseData = await response.text();
      const jsonObjects = responseData.split('\n');

      let fullResponseText = '';
      let totalTokens = 0;
      let rawData = null;

      for (const jsonObject of jsonObjects) {
        try {
          if (jsonObject.trim() === '') {
            continue;
          }
          const parsedObject = JSON.parse(jsonObject);
          if (parsedObject.message) {
            fullResponseText += parsedObject.message.content;
          }
          if (parsedObject.done) {
            rawData = parsedObject;
            totalTokens = (parsedObject.prompt_eval_count || 0) + (parsedObject.eval_count || 0);
          }
        } catch (error) {
          console.error('Error parsing JSON object:', error, jsonObject);
        }
      }

      const aiResponse = fullResponseText.trim();

      return {
        success: true,
        retries: retries,
        text: aiResponse,
        totalTokens: totalTokens,
        raw: rawData
      };

    } catch (err) {
      if (err.message?.includes('429') || err.message?.includes('500')) {
        continue; // already handled above
      }
      console.error('❌ Error contacting Ollama:', err.message);
      throw err;
    }
  }
}

const id = pluginName;
const version = pluginVersion;

export { complete, id, version, commands, envInit, getDefaultModel };