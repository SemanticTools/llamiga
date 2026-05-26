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

const pluginName = "pgGrokAI";
const pluginVersion = "0.0.4";
const commands = true;
const providerName = "Grok";

import process from 'node:process';
import { withRetry } from './common/retry.mjs';
import { classifyHttpError, classifyNetworkError, readResponseBody } from './common/errors.mjs';

const keyName = 'GROK_API_KEY';
const API_KEY = process.env[keyName];

// Uses library retry defaults.
export const defaultRetry = {};

function envInit() {
  if (!API_KEY) {
    let error = keyName + ' environment variable is not set. Please set it to your xAI Grok API key.';
    console.error('\n❌ ' + error + "\n");
    throw new Error(error);
  }
}

function getDefaultModel(size = "medium") {
  return "grok-3-fast";
}

function translateRole(role, index) {
  if (role === "assistant") return "assistant";
  if (role === "user") return "user";
  if (role === "system") return "system";
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

    const url = 'https://api.x.ai/v1/chat/completions';

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
      const { body, parseError } = await readResponseBody(response);
      throw classifyHttpError(response, body, providerName, model, parseError);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    return {
      success: true,
      retries: attempt - 1,
      text: aiResponse,
      totalTokens: data.usage ? data.usage.total_tokens : -1,
      responseId: data.id,
      raw: data
    };
  }, config.retry);
}

const id = pluginName;
const version = pluginVersion;

export { complete, id, version, commands, envInit, translateRole, getDefaultModel };
