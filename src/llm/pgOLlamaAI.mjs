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
const pluginVersion = "0.0.4";
const commands = true;
const providerName = "Ollama";

import process from 'node:process';
import { withRetry } from './common/retry.mjs';
import { classifyHttpError, classifyNetworkError, readResponseBody } from './common/errors.mjs';

const keyName = 'OLLAMA_API_BASE';
const API_BASE = process.env[keyName];

// Optional bearer token for setups where Ollama sits behind an auth proxy.
// If unset, no Authorization header is sent at all (canonical Ollama runs unauthenticated).
const API_KEY = process.env['OLLAMA_API_KEY'];

// Local server cold-loads can take a while; baseline waits longer than the library default.
export const defaultRetry = { baseMs: 20000 };

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
  if (role === "system") return "user";
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
        continue;
      }
      const role = translateRole(msg.role, i);
      contents.push({ role: role, content: msg.content });
      i++;
    }

    contents.push({ role: "user", content: prompt });

    const url = API_BASE + '/api/chat';

    const headers = { 'Content-Type': 'application/json' };
    if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;

    // stream:false tells Ollama to buffer the response server-side and return
    // a single JSON object instead of NDJSON token-by-token. Avoids proxy
    // buffering / chunked-transfer issues some setups have with streaming.
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: model, messages: contents, stream: false })
      });
    } catch (fetchErr) {
      throw classifyNetworkError(fetchErr, providerName, model);
    }

    if (!response.ok) {
      const { body, parseError } = await readResponseBody(response);
      throw classifyHttpError(response, body, providerName, model, parseError);
    }

    // Parse streaming NDJSON response
    const responseData = await response.text();
    const jsonObjects = responseData.split('\n');

    let fullResponseText = '';
    let totalTokens = 0;
    let rawData = null;

    for (const jsonObject of jsonObjects) {
      try {
        if (jsonObject.trim() === '') continue;
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
      retries: attempt - 1,
      text: aiResponse,
      totalTokens: totalTokens,
      raw: rawData
    };
  }, config.retry);
}

const id = pluginName;
const version = pluginVersion;

export { complete, id, version, commands, envInit, getDefaultModel };
