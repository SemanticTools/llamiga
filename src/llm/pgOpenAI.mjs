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


const pluginName = "pgOpenAINative";
const pluginVersion = "0.0.5";
const commands = true;
const providerName = "OpenAI";

import process from 'node:process';
import {
  parseSSEStream,
  createContentChunk,
  createMetadataChunk,
  StreamEventType
} from './common/streaming.mjs';
import { withRetry } from './common/retry.mjs';
import { classifyHttpError, classifyNetworkError } from './common/errors.mjs';

const keyName = 'OPENAI_API_KEY';
const API_KEY = process.env[keyName];

// Uses library retry defaults.
export const defaultRetry = {};

function envInit() {
  if (!API_KEY) {
    let error = keyName + ' environment variable is not set. Please set it to your OpenAI API key.';
    console.error('\n❌ ' + error + "\n");
    throw new Error(error);
  }
}

function getDefaultModel(size = "medium") {
  return "gpt-4o";
}

function translateRole(role, index) {
  if (role === "assistant") return "assistant";
  if (role === "user") return "user";
  if (role === "system") return "system";
  return "user";
}

/**
 * Extract standardized chunks from OpenAI streaming response
 * @param {Object} data - Parsed JSON from SSE data line
 * @returns {StreamChunk|StreamChunk[]} Standard chunk(s)
 */
function extractOpenAIChunk(data) {
  const chunks = [];

  // Extract content
  const content = data.choices?.[0]?.delta?.content;
  if (content) {
    chunks.push(createContentChunk(content, data));
  }

  // Extract finish reason and metadata (sent at end)
  const finishReason = data.choices?.[0]?.finish_reason;
  if (finishReason) {
    chunks.push(createMetadataChunk({
      finishReason: finishReason,
      responseId: data.id,
      model: data.model,
      systemFingerprint: data.system_fingerprint
    }, data));
  }

  // Some models send usage in the last chunk
  if (data.usage) {
    chunks.push(createMetadataChunk({
      totalTokens: data.usage.total_tokens,
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens
    }, data));
  }

  return chunks.length > 0 ? chunks : null;
}

function transformMessages(messages0, prompt) {
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
  return contents;
}

async function complete(model, prompt, messages0, config={}) {
  if (config.stream && config.onChunk) {
    return await completeStreaming(model, prompt, messages0, config);
  }

  return withRetry(async ({ attempt }) => {
    const contents = transformMessages(messages0, prompt);
    const url = 'https://api.openai.com/v1/chat/completions';

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
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
      totalTokens: data.usage?.total_tokens,
      responseId: data.id,
      raw: data
    };
  }, config.retry);
}

async function completeStreaming(model, prompt, messages0, config) {
  return withRetry(async ({ attempt }) => {
    const contents = transformMessages(messages0, prompt);
    const url = 'https://api.openai.com/v1/chat/completions';

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: contents,
          stream: true,
          stream_options: { include_usage: true }
        })
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

    const result = await parseSSEStream(
      response,
      extractOpenAIChunk,
      config.onChunk
    );

    return {
      ...result,
      retries: attempt - 1
    };
  }, config.retry);
}

const id = pluginName;
const version = pluginVersion;

export { complete, id, version, commands, envInit, getDefaultModel };
