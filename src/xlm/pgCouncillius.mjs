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


const pluginName = "pgCouncillius";
const pluginVersion = "0.0.5";
const commands = true;

const debug = false;

function envInit() {
  /* Nothing */
}

function getDefaultModel(size = "medium") {
  return "council-1.0";
}

function translateRole(role, index) {
  return role; /* pass through */
}

async function complete(model, prompt, messages0, config={}) {

  if( debug ) console.log("Config = ", config)
  if (!config || !config.members || !config.judge) {
    throw new Error("pgCouncillius plugin requires a config with members and judge fields.");
  }

  if( debug ) console.log("Councillius: Starting completion with members:", 
    config.members.join(", "));

  
  const framework = config.framework;
  
  const members = config.members.map( member => {
    let memberPAM = framework.extractPluginAndModel( member );
    const pluginRecord = { 
      plugin: framework.getPlugin( memberPAM.provider ), 
      model: memberPAM.model,
      name: memberPAM.provider };
    return pluginRecord ;
  });

  let judgePAM = framework.extractPluginAndModel( config.judge );
  const judge = framework.getPlugin( judgePAM.provider );
  const judgeModel = judgePAM.model;
  const judgementRequest = config.judgementRequest;
  const judgementItem = config.judgementItem;

  let messages = messages0;
  if( messages === null ) messages = [];

  // Fire all members in parallel
  const memberPromises = members.map(member => 
    member.plugin.complete( member.model, prompt, messages, undefined )
      .then(result => ({ status: 'fulfilled', plugin: member.name, result }))
      .catch(error => ({ status: 'rejected', plugin: member.name, error }))
  );

  // Wait for all to complete (good or bad)
  const responses = await Promise.all(memberPromises);

  // Log results
  const successes = responses.filter(r => r.status === 'fulfilled');
  const failures = responses.filter(r => r.status === 'rejected');

  if( debug ) console.log(`Councillius: ${successes.length} succeeded, ${failures.length} failed`);
  
  if (failures.length > 0) {
    failures.forEach(f => console.error(`  - ${f.plugin}: ${f.error.message}`));
    return null;
  }

  let allTokens = 0;
  let allRetries = 0;
  let judgementPrompt = judgementRequest.replace("{{MEMBER-PROMPT}}", prompt);
  for (let resp of successes) {
    const item = judgementItem
      .replace("{{MEMBER-NAME}}", resp.plugin)
      .replace("{{MEMBER-RESPONSE}}", resp.result.text);
    judgementPrompt += item;
    allTokens += resp.result.totalTokens;
    allRetries += resp.result.retries;
  }

  if( debug ) console.log("Councillius: Sending judgement prompt to judge:\n", judgementPrompt);
  // Now pass to referee...
  // TODO: referee.plugin.complete(...) with all responses
  let final = await judge.complete( judgeModel, judgementPrompt, messages, undefined );

  return {
        success: true,
        retries: final.retries + allRetries,
        text: final.text,
        responseId: final.responseId,
        totalTokens: final.totalTokens + allTokens,
        raw: config
      };

  //return responses; // placeholder
}

const id = pluginName;
const version = pluginVersion;

export { complete, id, version, commands, envInit, translateRole, getDefaultModel };

