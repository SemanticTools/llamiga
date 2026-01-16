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


import * as openAI  from './llm/pgOpenAI.mjs';
import * as mistral  from './llm/pgMistralAI.mjs';
import * as ollamaAI  from './llm/pgOLlamaAI.mjs';
import * as anthropic  from './llm/pgAnthropicAI.mjs';
import * as grok  from './llm/pgGrokAI.mjs';
import * as gemini  from './llm/pgGeminiAI.mjs';
import * as toolbert  from './flm/toolbert/pgToolbert.mjs';
import * as councillius  from './xlm/pgCouncillius.mjs';
//import * as sleeplamaAI  from './llm/pgSleepingLama.mjs';

import * as testbert1 from './test/pgTestbert1.mjs';
import * as testbert2 from './test/pgTestbert2.mjs';

import * as common from './llm/common/common.mjs';

let debug = false;

const g_plugins = {
  ollama:       { plugin: ollamaAI, tags: ['llm', 'selfhosted'] },
  openai:       { plugin: openAI, tags: ['llm', 'cloud'] },
  anthropic:    { plugin: anthropic, tags: ['llm', 'cloud'] },
  mistral:   { plugin: mistral, tags: ['llm', 'cloud'] },
  grok:        { plugin: grok, tags: ['llm', 'cloud'] },
  gemini:      { plugin: gemini, tags: ['llm', 'cloud'] },
  //sleepinglama: sleeplamaAI, needs more testing
  toolbert:    { plugin: toolbert, tags: ['flm', 'tool'] },
  councillius: { plugin: councillius, tags: ['xlm', 'group'] },

  /* testing */
    testbert1:   { plugin: testbert1, tags: ['flm', 'test'] },
    testbert2:   { plugin: testbert2, tags: ['flm', 'test'] },
};

/* Macro constants */
const LASTRESPONSE  =           "{{LASTRESPONSE}}";

/* Prune constants */
const PRUNE_ALL     =           "{{PRUNE_ALL}}";

/* Plugin group constants */
const ALL_PLUGINS   =           "{{ALL_PLUGINS}}";
const ALL_CLOUD_LLM_PLUGINS =   "{{ALL_CLOUD_LLM_PLUGINS}}";
const ALL_TOOL_PLUGINS =        "{{ALL_TOOL_PLUGINS}}";
const ALL_TEST_PLUGINS =        "{{ALL_TEST_PLUGINS}}";
const ALL_GROUP_PLUGINS =       "{{ALL_GROUP_PLUGINS}}";



function setDebug( value ) {
    //check if boolean
    if( typeof value !== 'boolean') {
        throw new Error( 'Debug value must be a boolean' );
    }
    debug = value;
}

function _getPlugin( id0 ) {

  if( id0 === undefined || id0 === null ) {
    throw new Error( 'Internal error. Plugin id is undefined or null' );
  }
  if( typeof id0 !== 'string') {
    console.log( "Plugin dump: " + JSON.stringify( id0 ) );
    throw new Error( 'Internal error. Plugin id must be a string' );
  }
  if( debug ) console.log( "Retrieving Plugin: " + id0 );
  const id = id0.toLowerCase();
  const pluginSpec = g_plugins[id];
  
  if( !pluginSpec ) {
    throw new Error( 'No LLM/FLM/XLM plugin found: ' + id );
  }
  
  try {
    pluginSpec.plugin.envInit();
  }
  catch( err ) {
    console.warn( `Warning: Plugin ${id} environment initialization failed: `, err.message );
    //show stack
    console.debug( err.stack );
  }
  return { ...pluginSpec.plugin, _: { id, type: "LLaMiga-API-Plugin" } };
}


function _extractPluginAndModel( overrideSpecs ) {
    //specs are in this format "<provider>" or "<provider>://<model>"
    //if no model or model is "default", use default model

    //check if not undefined, not null and is a string
    if( overrideSpecs === undefined || overrideSpecs === null ) {
        throw new Error( 'Override specs is undefined or null' );
    }
    if( typeof overrideSpecs !== 'string' ) {
        throw new Error( 'Override specs must be a string' );
    }
    let parts = overrideSpecs.split( "::" );
    let pluginId = parts[0].toLowerCase();
    /*let plugin = this.pluginIndex[ pluginId ];
    if( !plugin ) {
        throw new Error( 'No plugin found with name: ' + pluginId );
    }*/
    let model = null;
    if( parts.length > 1 ) {
        model = parts[1];
    }

    let provider = pluginId;
    return { provider, model };
}


function getPluginList( specsArray ) {

    if( debug ) console.log("getPluginList called with specs: " + JSON.stringify( specsArray   ));
    let names = [];
    for( let i=0; i<specsArray.length; i++ ) {
        let spec = specsArray[i];

        if( spec == ALL_PLUGINS ) {
            return names.concat( Object.keys( g_plugins ) );
        }
        else if( spec == ALL_CLOUD_LLM_PLUGINS ) {
            for( let key of Object.keys( g_plugins )) {
                let p = g_plugins[ key ];
                if( p.tags.includes( 'llm' ) && p.tags.includes( 'cloud' )) {
                    names.push( key );
                }
            }
        }
        else if ( spec == ALL_TOOL_PLUGINS ) {
            for( let key of Object.keys( g_plugins )) {
                let p = g_plugins[ key ];
                if( p.tags.includes( 'tool' )) {
                    names.push( key );
                }
            }
        }
        else if ( spec == ALL_TEST_PLUGINS ) {
            for( let key of Object.keys( g_plugins )) {
                let p = g_plugins[ key ];
                if( p.tags.includes( 'test' )) {
                    names.push( key );
                }
            }
        }
        else if ( spec == ALL_GROUP_PLUGINS ) {
            for( let key of Object.keys( g_plugins )) {
                let p = g_plugins[ key ];
                if( p.tags.includes( 'group' ) ) {
                    names.push( key );
                }
            }
        }
        else {
            if( Array.isArray( spec )  ) {
                //let subNames = getPluginList( spec );
                names = names.concat( spec );
            }
            else {
                names.push( spec );
            }
            
        }
    }
    return names;

}

function createObject( pluginSpecs0, options = {}) {

    let plugins = [];
    let pluginIndex = {};
    let pluginModels = {};
    let pluginConfigs = {};
    let plugin = null;
    let pluginName = "empty";
    let model = null;
    let macros = true;
    let pluginSpecs;
    let framework = {};
    framework.getPlugin = _getPlugin;
    framework.extractPluginAndModel = _extractPluginAndModel;

    if( pluginSpecs0 === undefined || pluginSpecs0 === null) {
        throw new Error( 'Plugin specs is undefined or null' );
    }

    if( !Array.isArray( pluginSpecs0 )) {
        pluginSpecs = getPluginList( [ pluginSpecs0 ] );
    }
    else 
    {
        pluginSpecs = getPluginList( pluginSpecs0 );
    }

    if( options && options.macros !== undefined ) macros = options.macros;

    if( Array.isArray( pluginSpecs )) {
        if( pluginSpecs.length === 0 ) {
            throw new Error( 'Plugin array is empty' );
        }
        for( let i=0; i<pluginSpecs.length; i++ ) {

            let pam = _extractPluginAndModel( pluginSpecs[i] );
            let p = _getPlugin( pam.provider );

            plugins.push( p );
            pluginIndex[ p._.id ] = p;
            pluginModels[ p._.id ] = pam.model;
        }

        plugin = null;
        pluginName = null;
        model = null;

        if( plugins.length == 1 ) {
            plugin = plugins[0];
            pluginName = pluginSpecs[0];
            model = plugin.getDefaultModel();
        }
    }
    else {
        throw new Error( 'Plugin specs must be an array, internal error' );
    }

    let session = {

        framework: framework,

        pluginIndex: pluginIndex,
        pluginConfigs: {},
        plugins: plugins,
        plugin: plugin,
        pluginName: pluginName,
        pluginModels: pluginModels,

        context: {},
        model: model,
        discussion: [],
        lastResponse: "sorry, there is no response yet",
        macros: macros,
        chainFlag: false,
        chainData: [],


        getLastDetailedResponse: function() {
            if( this.chainFlag ) {
                throw new Error( 'Cannot get last detailed response in chain mode' );
            }

            return this.rawResponse;
        },
        _setModel: function( model ) {

            if( this.chainFlag ) {
                throw new Error( 'Cannot set model in chain mode' );
            }

            if( model != null ) {
                this.model = model;
                this.pluginModels[ this.plugin._.id ] = model;
            }
            else {
                this.model = this.plugin.getDefaultModel();
                this.pluginModels[ this.plugin._.id ] = this.model;
            }

        },
        getModel() {

            if( this.chainFlag ) {
                throw new Error( 'Cannot get model in chain mode' );
            }

            if(! this.plugin ) {
                throw new Error( 'No plugin selected. Use setLM() to select a plugin.' );
            }            

            return this.model;
        },

        getProviderName() {

            if( this.chainFlag ) {
                throw new Error( 'Cannot get provider name in chain mode' );
            }
            return this.pluginName;
        },

        setLM: function( pluginSpecs ) {

            if( this.chainFlag ) {
                throw new Error( 'Cannot set language-model in chain mode' );
            }

            let pam = _extractPluginAndModel( pluginSpecs );

            const plugin = this.pluginIndex[ pam.provider ];
            if( !plugin ) {
                throw new Error( 'No plugin found with name: ' + pam.provider );
            }

            model = pam.model;
            if( model === "default" ) {
                model = plugin.getDefaultModel();
            }            

            this.plugin = plugin;
            this.pluginName = pam.provider;

            this._setModel( model );
            
            return this;
            
        },
        addMessage: function( role, content ) {

            if( this.chainFlag ) {
                throw new Error( 'Cannot add message in chain mode' );
            }

            if( role !== 'system' && role !== 'user' && role !== 'assistant' ) {
                throw new Error( 'Invalid role: ' + role + '. Must be one of system, user, assistant.' );
            }

            if( !content ) {
                throw new Error( 'Message is empty' );
            }
            let message = { role: role, content };
            this.discussion.push( message );

        },
        setSystemMessage: function( content ) {

            if( this.chainFlag ) {
                throw new Error( 'Cannot set system message in chain mode' );
            }

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

        runAll: async function() {

            if( !this.chainFlag ) { 
                throw new Error( 'Cannot runAll when not in chain mode' );
            }            
            /* Partly unchain, otherwise we can't call our own ask */
            this.chainFlag = false;
            let response = null;
            try {

                for( let i=0; i<this.chainData.length; i++) {
                    let item = this.chainData[i];
                    if( debug) console.log("Running chain item ", item.function + " => " + item.specs )

                    if( item.function === "ask" ) {
                        response = await this.directAsk( item.specs, item.prompt, item.overrideConfig );
                    }
                }

            }
            catch( err ) {
                this._unChain();
                throw err;
            }

            this._unChain();
            return response;
        },

        /*simple: async function( prompt0 ) {

            if( this.chainFlag ) {
                throw new Error( 'Cannot use ask in chain mode' );
            }
            if(!prompt0) {
                throw new Error( 'Prompt is empty' );
            }

            let prompt = this._promptMacros( prompt0 );

            let result = await this._rawChat( prompt, null, null, null );
            return result.text;
        },*/    
        chainAsk: function( p1, p2, p3 ) {
            if( debug ) console.log("chained-ask for " + specs ) 
            
            /* 
                Either,  chat ( prompt ) or chat ( specs, prompt [, overrideConfig ])
            */

            let specs = p1;
            let prompt = p2;
            let overrideConfig = p3;

            if(! p2 ) {
                prompt = p1;
                specs = null;
                overrideConfig = null;
            }
            
            if(!prompt) {
                throw new Error( 'Prompt is empty' );
            }            

            /* We do not run macros now, we do that when chainData gets "run" */

            this.chainData.push( { function: "ask", specs, prompt, overrideConfig } );

            return this;
        },            
        directAsk: async function( p1, p2, p3 ) {

            if( this.chainFlag ) {
                throw new Error( 'Cannot use ask in chain mode' );
            }

            let specs = p1;
            let prompt0 = p2;
            let overrideConfig = p3;

            if(! p2 ) {
                prompt0 = p1;
                specs = null;
                overrideConfig = null;
            }

            if(!prompt0) {
                throw new Error( 'Prompt is empty' );
            }

            let prompt = this._promptMacros( prompt0 );

            //if(! this.plugin ) {
            //    throw new Error( 'No plugin selected. Use setProvider() to select a plugin.' );
            //}
            //let config = this.getConfig( this.plugin._.id, this.model );

            return await this._rawChat( prompt, null, specs, overrideConfig );
        },
        rawChat: async function( specs, prompt, discussion, overrideConfig ) {

            if( this.chainFlag ) {
                throw new Error( 'Cannot use rawChat in chain mode' );
            }
            return await this._rawChat( prompt, discussion, specs, overrideConfig );
        },      
        _promptMacros: function( prompt ) {
            if( this.macros ) {
                prompt = prompt.replaceAll( LASTRESPONSE, this.lastResponse );
            }
            return prompt;
        },
        chat: async function( p1, p2, p3  ) {

            /* 
                Either,  chat ( prompt ) or chat ( specs, prompt [, overrideConfig ])
            */

            if( this.chainFlag ) {
                throw new Error( 'Cannot use chat in chain mode' );
            }

            let specs = p1;
            let prompt0 = p2;
            let overrideConfig = p3;

            if(! p2 ) {
                prompt0 = p1;
                specs = null;
                overrideConfig = null;
            }

            let prompt = this._promptMacros( prompt0 );

            if(! this.plugin && !specs) {
                throw new Error( 'No plugin selected. Use setProvider() to select a plugin.' );
            }

            //let config = this.getConfig( this.plugin._.id, this.model );

            let result = await this._rawChat( prompt, this.discussion, specs, overrideConfig );
            if( result ) {
               this.addMessage( 'user', prompt );
               this.addMessage( 'assistant', result.text );
            }
            delete result.actualPrompt;
            return result;
        },
        _rawChat: async function( prompt, discussion, specs, overrideConfig ) {

            if(! this.plugin && !specs) {
                throw new Error( 'No plugin selected. Use setLM() to select a plugin.' );
            }
            let timing = common.getTiming();
            let startDate = new Date().toISOString();
            let model = this.model;
            let plugin = this.plugin;
            let config = null;

            if( specs ) {
                let pam = _extractPluginAndModel( specs );

                plugin = this.pluginIndex[ pam.provider ];
                if( !plugin ) {
                    throw new Error( 'No plugin found with name: ' + pam.provider );
                }
                model = pam.model;
                if( model === "default" || !model) {
                    model = plugin.getDefaultModel();
                }
            }
            else {
                model = this.model;
                if(!model ) {
                    model = this.pluginModels[ this.plugin._.id ];
                    if(!model || model == "default" ) {
                        model = this.plugin.getDefaultModel();
                    }
                }
            }

            if( !plugin ) {
                throw new Error( 'No plugin found, giving up' );
            }            

            if( overrideConfig ) {
                config = {
                    ...overrideConfig,
                    framework,
                    session: this
                };
            }
            else {
                config = this.getConfig( plugin._.id, model );
            }


            let result = 
                await plugin.complete( 
                    model, 
                    prompt, 
                    discussion,
                    config 
                );

            if( result.success ) {
               
               result.elapsedMS = timing.elapsed();
               result.date = startDate;
               result.pluginName = plugin._.id;
               result.model = model;

               this.lastResponse = result.text;
            }

            this.rawResponse = result.raw;
            delete result.raw;

            return result;
        },
        getDiscussion: function() {

            if( this.chainFlag ) {
                throw new Error( 'Cannot get discussion in chain mode' );
            }
            return this.discussion;
        },
        pruneDiscussion: function( index ) {

            if( this.chainFlag ) {
                throw new Error( 'Cannot prune discussion in chain mode' );
            }
            if( index == PRUNE_ALL ) {
                this.discussion = [];
            }
            else if( index >= 0 && index < this.discussion.length ) {
                this.discussion.splice( index, 1 );
            }
        },
        getConfig: function( plugin, model ) {

            if( this.chainFlag ) {
                throw new Error( 'Cannot get config in chain mode' );
            }            
            let key1 = plugin + "::" + model;
            let key2 = plugin + "::default";

            if( this.pluginConfigs[ key1 ] !== undefined ) {
                return this.pluginConfigs[ key1 ];
            }
            if( this.pluginConfigs[ key2 ] !== undefined ) {
                return this.pluginConfigs[ key2 ];
            }
            return undefined;
        },
        setConfig: function( plugin, p1, p2 ) {

            if( this.chainFlag ) {
                throw new Error( 'Cannot set config in chain mode' );
            }

            let model = "";
            let value = null;
            if( p2 === undefined ) {
                model = "default";
                value = p1;
            }
            else {
                model = p1;
                value = p2;
            }
                
            if( this.pluginIndex[ plugin  ] ) {
                this.pluginConfigs[plugin + "::" + model] = {
                    ...value,
                    framework,
                    session: this
                };
            }
            else {
                throw new Error( 'No plugin found with name: ' + plugin );
            }
        }
        ,
        clearConfig: function( plugin, p1 ) {

            if( this.chainFlag ) {
                throw new Error( 'Cannot clear config in chain mode' );
            }            
            let model = "";
            if( p1 === undefined ) {
                model = "default";
            }
            else {
                model = p1;
            }
                
            if( this.pluginIndex[ plugin  ] ) {
                delete this.pluginConfigs[ plugin + "::" + model ];
            }
            else {
                throw new Error( 'No plugin found with name: ' + plugin );
            }
        },
        chain() {
            this.chainFlag = true;

            this.ask = this.chainAsk;
            if( debug ) console.log("chain-started" ) 
            return this;
        },
        _unChain() {
            this.chainData = [];
            this.chainFlag = false;

            this.ask = this.directAsk;
            
            if( debug ) console.log("chain-ended" ) 
            return this;
        }

    };
    

    session._unChain();

    return session;
}

function createSession( pluginSpecs, options = {} ) {

    let object = createObject( pluginSpecs, options );

    return object;
}


export { 
    /* functions */
    createSession, getPluginList, setDebug, 
    /* constants */
    LASTRESPONSE, 
    PRUNE_ALL,
    /* constants for plugin groups */
    ALL_TEST_PLUGINS,
    ALL_CLOUD_LLM_PLUGINS, ALL_GROUP_PLUGINS, ALL_PLUGINS };