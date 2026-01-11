/*
MIT © Dusty Wilhelm Murray / Semantic Tools / LLaMiga / 2026
*/

import * as openAI  from './llm/pgOpenAI.mjs';
import * as mistral  from './llm/pgMistralAI.mjs';
import * as ollamaAI  from './llm/pgOLlamaAI.mjs';
import * as anthropic  from './llm/pgAnthropicAI.mjs';
import * as grok  from './llm/pgGrokAI.mjs';
import * as gemini  from './llm/pgGeminiAI.mjs';
import * as toolbert  from './flm/toolbert/pgToolbert.mjs';
//import * as sleeplamaAI  from './llm/pgSleepingLama.mjs';
import * as common from './llm/common/common.mjs';

const plugins = {
  ollama: ollamaAI,
  openai: openAI,
  anthropic: anthropic,
  mistral: mistral,
  grok: grok,
  gemini: gemini,
  //sleepinglama: sleeplamaAI, needs more testing
  toolbert: toolbert
};

const LASTRESPONSE = "<lastresponse>";


function _getPlugin( id0 ) {

  const id = id0.toLowerCase();
  const plugin = plugins[id];
  
  if( !plugin ) {
    throw new Error( 'No LLM/FLM/XLM plugin found: ' + id );
  }
  
  plugin.envInit();
  return { ...plugin, _: { id, type: "LLaMiga-API-Plugin" } };
}

function createObject( pluginSpecs, options = {}) {

    let plugins = [];
    let pluginIndex = {};
    let pluginModels = {};
    let plugin = null;
    let pluginName = "empty";
    let model = null;
    let macros = false;

    if( options && options.macros ) macros = true;

    if( Array.isArray( pluginSpecs )) {
        if( pluginSpecs.length === 0 ) {
            throw new Error( 'Plugin array is empty' );
        }
        for( let i=0; i<pluginSpecs.length; i++ ) {
            let p = _getPlugin( pluginSpecs[i] );
            plugins.push( p );
            pluginIndex[ p._.id ] = p;
            pluginModels[ p._.id ] = p.getDefaultModel();
        }

        plugin = plugins[0];
        pluginName = pluginSpecs[0];
        model = plugin.getDefaultModel();
    }
    else {
        plugin = _getPlugin( pluginSpecs );
        plugins.push( plugin );
        pluginName = pluginSpecs;
        model = plugin.getDefaultModel();
    }

    let session = {
        pluginIndex: pluginIndex,
        plugins: plugins,
        plugin: plugin,
        pluginName: pluginName,
        pluginModels: pluginModels,
        context: {},
        model: plugin.getDefaultModel(),
        discussion: [],
        lastResponse: "sorry, there is no response yet",
        macros: macros,

        getLastDetailedResponse: function() {
            return this.rawResponse;
        },
        setModel: function( model ) {

            this.model = model;
            this.pluginModels[ this.plugin._.id ] = model;
            return this;
        },
        getModel() {

            return this.model;
        },
        getProviderName() {

            return this.pluginName;
        },        
        setProvider: function( pluginName, overrideModel ) {

            const id = pluginName.toLowerCase();
            const plugin = this.pluginIndex[ id ];
            if( !plugin ) {
                throw new Error( 'No plugin found with name: ' + pluginName );
            }
            this.plugin = plugin;
            let model = this.pluginModels[ id ];
            if( overrideModel ) {
                model = overrideModel;
            }
            this.setModel( model );
        },
        addMessage: function( role, content ) {

            if( role !== 'system' && role !== 'user' && role !== 'assistant' ) {
                throw new Error( 'Invalid role: ' + role + '. Must be one of system, user, assistant.' );
            }
            let message = { role: role, content };
            this.discussion.push( message );
        },
        setSystemMessage: function( content ) {
            const specificRole = "system";
            let message = { role: specificRole, content };
            if( this.discussion.length > 0 ) {
                if( this.discussion[0].role === 'system' ) {
                    this.discussion[0] = message;
                }
                else {
                    //move everything up 1 and insert at 0
                    this.discussion.unshift( message );
                }
            }
            else {
                this.discussion.push( message );
            }            
        },        
        ask: async function( prompt, overrideModel ) {

            return await this._rawChat( prompt, null, overrideModel );
        },
        rawAsk: async function( prompt, discussion, overrideModel ) {

            return await this._rawChat( prompt, discussion, overrideModel );
        },         
        mixChat: async function( prompt, discussion, overrideModel ) {

            let result = await this._rawChat( prompt, this.discussion, overrideModel );
            if( result ) {
               this.addMessage( 'user', prompt );
               this.addMessage( 'assistant', result.text );
            }
            return result;
        },
        chat: async function( prompt, overrideModel ) {

            let result = await this._rawChat( prompt, this.discussion, overrideModel );
            if( result ) {
               this.addMessage( 'user', prompt );
               this.addMessage( 'assistant', result.text );
            }
            return result;
        },
        _rawChat: async function( prompt0, discussion, overrideModel ) {

            let timing = common.getTiming();
            let startDate = new Date().toISOString();
            let model = this.model;
            if( overrideModel ) {
                model = overrideModel;
            }

            let prompt = prompt0;
            if( prompt === LASTRESPONSE && this.macros ) prompt = this.lastResponse;

            let result = 
                await this.plugin.complete( 
                    model, 
                    prompt, 
                    discussion );

            if( result.success ) {
               
               result.elapsedMS = timing.elapsed();
               result.date = startDate;
               result.pluginName = this.plugin._.id;
               result.model = model;

               this.lastResponse = result.text;
            }

            this.rawResponse = result.raw;
            delete result.raw;

            return result;
        },
        getDiscussion: function() {

            return this.discussion;
        }   

    };
    
    return session;
}

function createSession( pluginSpecs, options = {} ) {
    
    let object = createObject( pluginSpecs, options );

    delete object.ask;
    delete object.rawAsk;  

    return object;
}

function getPlugin( pluginName ) {

    if( typeof pluginName !== 'string' ) {
        throw new Error( 'Plugin name must be a string' );
    }

    let object = createObject( pluginName );

    delete object.chat;
    delete object.mixChat;
    delete object.getDiscussion;
    delete object.setProvider;
    delete object.addMessage;
    delete object.setSystemMessage;

    return object;
}

export { createSession, getPlugin, LASTRESPONSE };