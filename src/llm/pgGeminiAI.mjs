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

const pluginName = "pgGeminiNative";
const pluginVersion = "0.0.6";
const commands = true;
const providerName = "Gemini";

import process from 'node:process';
import { withRetry } from './common/retry.mjs';
import { classifyHttpError, classifyNetworkError } from './common/errors.mjs';

const keyName = 'GEMINI_API_KEY';
const API_KEY = process.env[keyName];

// Uses library retry defaults.
export const defaultRetry = {};

function envInit() {
  if (!API_KEY) {
    let error = keyName+' environment variable is not set. Please set it to your Google Gemini API key.';
    console.error('\n❌ ' + error + "\n");
    throw new Error(error);
  }
}

function getDefaultModel(size = "medium") {
  return "gemini-2.0-flash";
}

function translateRole(role, index) {
  if (role === "assistant") return "model";
  if (role === "user") return "user";
  if (role === "system" ) return "user";
  return "user";
}

async function complete(model, prompt, messages0, config={}) {
  return withRetry(async ({ attempt }) => {
    let contents = [];
    let messages = messages0;
    if (messages === null) messages = [];

    let i = 0;
    for (let msg of messages) {
      const role = translateRole(msg.role, i);
      contents.push({
        role: role,
        parts: [{ text: msg.content }]
      });
      i++;
    }

    contents.push({
      role: "user",
      parts: [{ text: prompt }]
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
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
    const aiResponse = data.candidates[0].content.parts[0].text;

    return {
      success: true,
      retries: attempt - 1,
      text: aiResponse,
      totalTokens: data.usageMetadata.totalTokenCount,
      responseId: data.responseId,
      raw: data
    };
  }, config.retry);
}

const id = pluginName;
const version = pluginVersion;

export { complete, id, version, commands, envInit, translateRole, getDefaultModel };
