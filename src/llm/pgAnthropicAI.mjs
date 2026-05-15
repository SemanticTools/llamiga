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

const pluginName = "pgAnthropicAI";
const pluginVersion = "0.0.5";
const commands = true;
const providerName = "Anthropic";

import process from 'node:process';
import { withRetry } from './common/retry.mjs';
import { classifyHttpError, classifyNetworkError } from './common/errors.mjs';

const keyName = 'ANTHROPIC_API_KEY';
const API_KEY = process.env[keyName];

// Uses library retry defaults.
export const defaultRetry = {};

function envInit() {
  if (!API_KEY) {
    let error = keyName + ' environment variable is not set. Please set it to your Anthropic API key.';
    console.error('\n❌ ' + error + "\n");
    throw new Error(error);
  }
}

function getDefaultModel(size = "medium") {
  return "claude-sonnet-4-20250514";
}

function translateRole(role, index) {
  if (role === "assistant") return "assistant";
  if (role === "user") return "user";
  if (role === "system") return "user"; // Anthropic handles system separately
  return "user";
}

async function complete(model, prompt, messages0, config={}) {
  return withRetry(async ({ attempt }) => {
    // 1. Transform messages to Anthropic format
    let contents = [];
    let messages = messages0;
    if (messages === null) messages = [];

    let systemMessage = "";
    let i = 0;

    for (let msg of messages) {
      if (msg.role === "system" && i === 0) {
        systemMessage = msg.content;
        i++;
        continue;
      }
      if (msg.role === "local-system") {
        i++;
        continue;
      }
      const role = translateRole(msg.role, i);
      contents.push({ role: role, content: msg.content });
      i++;
    }

    contents.push({ role: "user", content: prompt });

    // 2. Call the Anthropic API
    const url = 'https://api.anthropic.com/v1/messages';

    const body = {
      model: model,
      messages: contents,
      max_tokens: 4096
    };
    if (systemMessage) body.system = systemMessage;

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
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

    let aiResponse;
    try {
      aiResponse = data.content[0].text;
    } catch (err) {
      aiResponse = "Plugin Error - " + JSON.stringify(data.content);
      console.log(aiResponse);
    }

    if (data.content.length > 1) {
      console.warn("⚠️ Multiple responses received, using the first one.");
      console.log(JSON.stringify(data.content, null, 2));
    }

    return {
      success: true,
      retries: attempt - 1,
      text: aiResponse,
      responseId: data.id,
      totalTokens: data.usage ? data.usage.input_tokens + data.usage.output_tokens : -1,
      raw: data
    };
  }, config.retry);
}

const id = pluginName;
const version = pluginVersion;

export { complete, id, version, commands, envInit, getDefaultModel };
