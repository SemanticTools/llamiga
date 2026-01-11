const pluginName = "pgGeminiNative";
const pluginVersion = "0.0.5";
const commands = true;

import process from 'node:process';

const keyName = 'GEMINI_API_KEY';
const API_KEY = process.env[keyName];

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

async function complete(model, prompt, messages0) {
  const maxTries = 3;
  let retries = 0; 

  while (retries < maxTries) {
    try {
      // 1. Transform messages to Native Gemini format
      let contents = [];
      let messages = messages0;
      if( messages === null ) messages = [];

      let i=0;
      for (let msg of messages) {
        const role = translateRole( msg.role, i );
        contents.push({
          role: role,
          parts: [{ text: msg.content }]
        });
        i++;
      }

      // Add the current prompt
      contents.push({
        role: "user",
        parts: [{ text: prompt }]
      });

      // 2. Call the Native endpoint
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
            
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
      });

      if (!response.ok) {
        if (response.status === 429 || response.status === 500) {
          const waitTime = 20000;
          console.warn(`⚡ Gemini API issue (${response.status}). Retrying...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retries++;
          continue;
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Gemini API error ${response.status}: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      const aiResponse = data.candidates[0].content.parts[0].text;

      return {
        success: true,
        retries: retries,
        text: aiResponse,
        totalTokens: data.usageMetadata.totalTokenCount,
        responseId: data.responseId,        
        raw: data
      };

    } catch (err) {
      if (err.message?.includes('429') || err.message?.includes('500')) {
        continue; // already handled above
      }
      console.error('❌ Error contacting Gemini Native:', err.message);
      throw err;
    }
  }
}

const id = pluginName;
const version = pluginVersion;

export { complete, id, version, commands, envInit,  getDefaultModel };