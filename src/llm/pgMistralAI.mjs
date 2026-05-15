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
const pluginVersion = "0.0.4";
const commands = true;
const providerName = "Mistral";

import process from 'node:process';
import { withRetry } from './common/retry.mjs';
import { classifyHttpError, classifyNetworkError } from './common/errors.mjs';

const keyName = 'MISTRAL_API_KEY';
const API_KEY = process.env[keyName];

// Uses library retry defaults.
export const defaultRetry = {};

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
  return withRetry(async ({ attempt }) => {
    let contents = [];
    let messages = messages0;
    if (messages === null) messages = [];

    let i = 0;
    for (let msg of messages) {
      if (msg.role === "local-system") {
        i++;
        continue;
      }
      const role = translateRole(msg.role, i);
      contents.push({ role: role, content: msg.content });
      i++;
    }

    contents.push({ role: "user", content: prompt });

    const url = 'https://api.mistral.ai/v1/chat/completions';

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({ model: model, messages: contents })
      });
    } catch (fetchErr) {
      throw classifyNetworkError(fetchErr, providerName, model);
    }

    if (!response.ok) {
      let parsedBody;
      let parseError;
      try {
        parsedBody = await response.json();
      } catch (e) {
        parseError = e;
        try { parsedBody = await response.text(); } catch { parsedBody = null; }
      }
      throw classifyHttpError(response, parsedBody, providerName, model, parseError);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    return {
      success: true,
      retries: attempt - 1,
      text: aiResponse,
      totalTokens: data.usage?.total_tokens || null,
      responseId: data.id,
      raw: data
    };
  }, config.retry);
}

const id = pluginName;
const version = pluginVersion;

export { complete, id, version, commands, envInit, getDefaultModel };
