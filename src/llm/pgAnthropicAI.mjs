const pluginName = "pgAnthropicAI";
const pluginVersion = "0.0.4";
const commands = true;

import process from 'node:process';

const keyName = 'ANTHROPIC_API_KEY';
const API_KEY = process.env[keyName];

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
  const maxTries = 3;
  let retries = 0;

  while (retries < maxTries) {
    try {
      // 1. Transform messages to Anthropic format
      let contents = [];
      let messages = messages0;
      if (messages === null) messages = [];
      
      let systemMessage = "";
      let i = 0;
      
      for (let msg of messages) {
        // Extract system message (typically first message)
        if (msg.role === "system" && i === 0) {
          systemMessage = msg.content;
          i++;
          continue;
        }
        
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

      // 2. Call the Anthropic API
      const url = 'https://api.anthropic.com/v1/messages';
      
      const body = {
        model: model,
        messages: contents,
        max_tokens: 4096
      };
      
      // Add system message if present
      if (systemMessage) {
        body.system = systemMessage;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        if (response.status === 429 || response.status === 500 || response.status === 529) {
          const waitTime = 20000;
          console.warn(`⚡ Anthropic API issue (${response.status}). Retrying...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retries++;
          continue;
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Anthropic API error ${response.status}: ${JSON.stringify(errorData)}`);
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
        retries: retries,
        text: aiResponse,
        responseId: data.id,
        totalTokens: data.usage ? data.usage.input_tokens + data.usage.output_tokens : -1,
        raw: data
      };

    } catch (err) {
      if (err.message?.includes('429') || err.message?.includes('500') || err.message?.includes('529')) {
        continue; // already handled above
      }
      console.error('❌ Error contacting Anthropic:', err.message);
      throw err;
    }
  }
}

const id = pluginName;
const version = pluginVersion;

export { complete, id, version, commands, envInit, getDefaultModel };
