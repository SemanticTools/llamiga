const pluginName = "pgGrokAI";
const pluginVersion = "0.0.3";
const commands = true;

import process from 'node:process';

const keyName = 'GROK_API_KEY';
const API_KEY = process.env[keyName];

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

async function complete(model, prompt, messages0) {
  const maxTries = 3;
  let retries = 0;

  while (retries < maxTries) {
    try {
      // 1. Transform messages to OpenAI-compatible format (Grok uses this)
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

      // 2. Call the xAI Grok API
      const url = 'https://api.x.ai/v1/chat/completions';

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
        if (response.status === 429 || response.status === 500) {
          const waitTime = 20000;
          console.warn(`⚡ Grok API issue (${response.status}). Retrying...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retries++;
          continue;
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Grok API error ${response.status}: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      const aiResponse = data.choices[0].message.content;

      return {
        success: true,
        retries: retries,
        text: aiResponse,
        totalTokens: data.usage ? data.usage.total_tokens : -1,
        responseId: data.id,
        raw: data        
      };

    } catch (err) {
      if (err.message?.includes('429') || err.message?.includes('500')) {
        continue; // already handled above
      }
      console.error('❌ Error contacting Grok:', err.message);
      throw err;
    }
  }
}

const id = pluginName;
const version = pluginVersion;

export { complete, id, version, commands, envInit, translateRole, getDefaultModel };
