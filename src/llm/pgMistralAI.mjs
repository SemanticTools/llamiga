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

const pluginName = "pgMistralAI";
const pluginVersion = "0.0.3";
const commands = true;

import process from 'node:process';

const keyName = 'MISTRAL_API_KEY';
const API_KEY = process.env[keyName];

function envInit() {
  if (!API_KEY) {
    let error = keyName + ' environment variable is not set. Please set it to your Mistral AI API key.';
    console.error('\n❌ ' + error + "\n");
    throw new Error(error);
  }
}

function getDefaultModel(size = "medium") {
  return "mistral-medium-latest";
}

function translateRole(role, index) {
  if (role === "assistant") return "assistant";
  if (role === "user") return "user";
  if (role === "system") return index === 0 ? "system" : "user"; // Mistral only allows system as first message
  return "user";
}

async function complete(model, prompt, messages0, config={}) {
  const maxTries = 3;
  let retries = 0;

  while (retries < maxTries) {
    try {
      // 1. Transform messages to Mistral format (OpenAI-compatible)
      let contents = [];
      let messages = messages0;
      if (messages === null) messages = [];

      let i = 0;
      for (let msg of messages) {
        // Skip local-system messages
        if (msg.role === "local-system") {
          i++;
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

      // 2. Call the Mistral API
      const url = 'https://api.mistral.ai/v1/chat/completions';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
          model: model,
          messages: contents
        })
      });

      if (!response.ok) {
        if (response.status === 429 || response.status === 500 || response.status === 503) {
          const waitTime = 3000;
          console.warn(`⚡ Mistral API issue (${response.status}). Retrying...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retries++;
          continue;
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Mistral API error ${response.status}: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      const aiResponse = data.choices[0].message.content;

      return {
        success: true,
        retries: retries,
        text: aiResponse,
        totalTokens: data.usage?.total_tokens || null,
        responseId: data.id,
        raw: data
      };

    } catch (err) {
      if (err.message?.includes('429') || err.message?.includes('500')) {
        continue; // already handled above
      }
      console.error('❌ Error contacting Mistral AI:', err.message);
      throw err;
    }
  }
}

const id = pluginName;
const version = pluginVersion;

export { complete, id, version, commands, envInit, getDefaultModel };
