//example import
//import { EmailServer, EmailClient } from './EmailServer.mjs';


const pluginName = "pgTogetherAI";
const pluginVersion = "0.0.1";
const commands = true;

import axios from 'axios';
import process from 'node:process';
import * as common from './common/common.mjs';


const API_KEY = process.env.TOGETHER_API_KEY;

if (!API_KEY) {
  console.error('❌ No Together API Key found. Set TOGETHER_API_KEY environment variable.');
  process.exit(1);
}


async function ask( model, prompt, messages ) {
  //addSessionMessage("user", prompt);

  const maxTries = 3;
  let retries = 0;
  let aiResponse = '';

  while( retries < maxTries ) {
    try {

      let sessionMessages = [];
      for( let i = 0; i < messages.length; i++ ) {
        let msg = messages[i];
        if( msg.role == "local-system" ) {
          continue;
        }
        sessionMessages.push({ role: msg.role, content: msg.content });
      }     

      sessionMessages.push({ role: "user", content: prompt });

      const response = await axios.post('https://api.together.xyz/v1/chat/completions', {
        model: model,
        messages: sessionMessages
      }, {
        headers: {
          "Authorization": `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        }
      });

      aiResponse = response.data.choices[0].message.content;

      return {
        success: true,
        retries: retries,
        reply: aiResponse
      };

    } catch (err) {

      if (err.response && err.response.status === 429) {
          const waitTime = 20000; // 10 seconds (you could read `Retry-After` header too if you want)
          console.warn(`⚡ Rate limit hit. Waiting ${waitTime/1000}s before retrying...`);

          //addSessionMessage( "local-system", "Open AI Timeout, waiting..." );
          //updateSessionLog();

          await new Promise(resolve => setTimeout(resolve, waitTime));
          retries++;
          continue;
      }
      else if ( err.rule ) {
        
        let rule = err.rule;
        console.log( rule);
        console.warn("⚡ Fail Rule pattern found " + rule.pattern + "..." );

        //addSessionMessage( "local-system", "Fail Rule pattern found " + rule.pattern + "..." );
        
        //addSessionMessage( "assistant", aiResponse );
        //addSessionMessage( "system", rule.failResponse );

        //updateSessionLog();

        retries++;
        continue;
      }

      console.error('❌ Error contacting OpenAI:', err.response ? err.response.data : err.message);

      //addSessionMessage( "local-system", "Error contacting OpenAI, quiting trying, max-tries expired." );
      //updateSessionLog();

      throw err;
    }

  }
};


const id = pluginName;
const version = pluginVersion;

export { ask, id, version, commands }