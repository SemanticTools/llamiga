import * as ollamaAI  from './pgOLlamaAI.mjs';

const pluginName = "pgSleepingLama";
const pluginVersion = "0.0.2";
const commands = false;
const canSummarize = true;


const id = pluginName;
const version = pluginVersion;

async function ask( model, prompt, messages ) {

    let prompt1 = prompt;

    if( messages.lenght == 1 ) {
        /* First user prompt */
        prompt1 = "Here is a random sentence.  Please say some random things about it: " + prompt;
    }

    let lamaResponse = ollamaAI.ask(model, prompt, messages);

    return lamaResponse;
}

export { ask, id, version, commands, canSummarize }