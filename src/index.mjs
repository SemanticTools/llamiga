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
import { mergeRetry, validateRetry } from './llm/common/retry.mjs';
import { validateSections, parseAndFilterSections } from './llm/common/markers.mjs';

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
        sessionConfig: undefined,
        plugins: plugins,
        plugin: plugin,
        pluginName: pluginName,
        pluginModels: pluginModels,

        context: {},
        model: model,
        discussion: [],
        uniqueMessageId: 10000,
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
        addMessage: function( role, content, opts ) {

            if( this.chainFlag ) {
                throw new Error( 'Cannot add message in chain mode' );
            }

            if( role !== 'system' && role !== 'user' && role !== 'assistant' ) {
                throw new Error( 'Invalid role: ' + role + '. Must be one of system, user, assistant.' );
            }

            if( !content ) {
                throw new Error( 'Message is empty' );
            }
            let message = {
                msgId: this.uniqueMessageId++,
                active: true,
                role: role,
                content,
                hiddenSections: new Set(),
                sectionIds: [],
            };
            if( opts && opts.turnId ) message.turnId = opts.turnId;
            if( opts && Array.isArray( opts.sectionIds )) message.sectionIds = opts.sectionIds;
            this.discussion.push( message );

        },
        setSystemMessage: function( content ) {

            if( this.chainFlag ) {
                throw new Error( 'Cannot set system message in chain mode' );
            }

            const specificRole = "system";
            let message = {
                msgId: this.uniqueMessageId++,
                active: true,
                role: specificRole,
                content,
                hiddenSections: new Set(),
                sectionIds: [],
            };
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
            if( debug ) console.log("chained-ask")

            /*
                chain().ask( prompt )
                chain().ask( prompt, options )           ← rejected (no naming in chain mode)
                chain().ask( specs, prompt [, options] ) ← options rejected if it carries name
            */

            let specs, prompt, overrideConfig;
            if( typeof p2 === 'string' ) {
                specs = p1;
                prompt = p2;
                overrideConfig = p3;
            } else if( p2 && typeof p2 === 'object' ) {
                specs = null;
                prompt = p1;
                overrideConfig = p2;
            } else {
                specs = null;
                prompt = p1;
                overrideConfig = undefined;
            }

            if(!prompt) {
                throw new Error( 'Prompt is empty' );
            }

            if( overrideConfig && typeof overrideConfig === 'object' && overrideConfig.name ) {
                throw new Error( 'name is not allowed in chain mode' );
            }

            /* We do not run macros now, we do that when chainData gets "run" */

            this.chainData.push( { function: "ask", specs, prompt, overrideConfig } );

            return this;
        },
        directAsk: async function( p1, p2, p3 ) {

            if( this.chainFlag ) {
                throw new Error( 'Cannot use ask in chain mode' );
            }

            let specs, prompt0, overrideConfig;
            if( typeof p2 === 'string' ) {
                specs = p1;
                prompt0 = p2;
                overrideConfig = p3;
            } else if( p2 && typeof p2 === 'object' ) {
                specs = null;
                prompt0 = p1;
                overrideConfig = p2;
            } else {
                specs = null;
                prompt0 = p1;
                overrideConfig = undefined;
            }

            if(!prompt0) {
                throw new Error( 'Prompt is empty' );
            }

            if( overrideConfig && typeof overrideConfig === 'object' && overrideConfig.name ) {
                throw new Error( 'name is not allowed on ask() — use chat() for named turns' );
            }

            let prompt = this._promptMacros( prompt0 );

            //if(! this.plugin ) {
            //    throw new Error( 'No plugin selected. Use setProvider() to select a plugin.' );
            //}
            //let config = this.getConfig( this.plugin._.id, this.model );

            return await this._rawChat( prompt, null, specs, overrideConfig );
        },
        askStream: async function( p1, p2, p3 ) {

            /*
                Either:  askStream( prompt, onChunk )
                     or  askStream( specs, prompt, onChunk )
            */

            if( this.chainFlag ) {
                throw new Error( 'Cannot use askStream in chain mode' );
            }

            let specs = null;
            let prompt0 = null;
            let onChunk = null;

            // Parse parameters
            if( typeof p2 === 'function' ) {
                // askStream( prompt, onChunk )
                prompt0 = p1;
                onChunk = p2;
            } else if( typeof p3 === 'function' ) {
                // askStream( specs, prompt, onChunk )
                specs = p1;
                prompt0 = p2;
                onChunk = p3;
            } else {
                throw new Error( 'askStream requires a callback function as the last parameter' );
            }

            if(!prompt0) {
                throw new Error( 'Prompt is empty' );
            }

            let prompt = this._promptMacros( prompt0 );

            // Create streaming config
            const streamConfig = {
                stream: true,
                onChunk: onChunk
            };

            return await this._rawChat( prompt, null, specs, streamConfig );
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
                chat( prompt )
                chat( prompt, options )
                chat( specs, prompt [, options ] )
                options may carry { name } to stamp the resulting turn.
            */

            if( this.chainFlag ) {
                throw new Error( 'Cannot use chat in chain mode' );
            }

            let specs, prompt0, overrideConfig;
            if( typeof p2 === 'string' ) {
                // chat( specs, prompt [, options ] )
                specs = p1;
                prompt0 = p2;
                overrideConfig = p3;
            } else if( p2 && typeof p2 === 'object' ) {
                // chat( prompt, options )
                specs = null;
                prompt0 = p1;
                overrideConfig = p2;
            } else {
                // chat( prompt )
                specs = null;
                prompt0 = p1;
                overrideConfig = undefined;
            }

            let prompt = this._promptMacros( prompt0 );

            if(! this.plugin && !specs) {
                throw new Error( 'No plugin selected. Use setProvider() to select a plugin.' );
            }

            // Extract turn name (if any) and validate sections / uniqueness up front.
            let turnId = null;
            let sectionIds = [];
            let downstreamConfig = overrideConfig;
            if( overrideConfig && typeof overrideConfig === 'object' && overrideConfig.name ) {
                turnId = overrideConfig.name;
                if( this.discussion.some( m => m.turnId === turnId )) {
                    throw new Error( `Turn name '${turnId}' already in use` );
                }
                sectionIds = validateSections( prompt );
                // Don't leak `name` into the plugin config — copy and strip.
                downstreamConfig = { ...overrideConfig };
                delete downstreamConfig.name;
            }

            let result = await this._rawChat( prompt, this.discussion, specs, downstreamConfig );
            if( result ) {
               const userOpts = turnId ? { turnId, sectionIds } : undefined;
               const asstOpts = turnId ? { turnId } : undefined;
               this.addMessage( 'user', prompt, userOpts );
               this.addMessage( 'assistant', result.text, asstOpts );
            }
            delete result.actualPrompt;
            return result;
        },
        chatStream: async function( p1, p2, p3, p4 ) {

            /*
                Either:  chatStream( prompt, onChunk [, options] )
                     or  chatStream( specs, prompt, onChunk [, options] )
                options may carry { name } to stamp the resulting turn.
            */

            if( this.chainFlag ) {
                throw new Error( 'Cannot use chatStream in chain mode' );
            }

            let specs = null;
            let prompt0 = null;
            let onChunk = null;
            let options = null;

            // Parse parameters
            if( typeof p2 === 'function' ) {
                // chatStream( prompt, onChunk [, options] )
                prompt0 = p1;
                onChunk = p2;
                if( p3 !== undefined ) options = p3;
            } else if( typeof p3 === 'function' ) {
                // chatStream( specs, prompt, onChunk [, options] )
                specs = p1;
                prompt0 = p2;
                onChunk = p3;
                if( p4 !== undefined ) options = p4;
            } else {
                throw new Error( 'chatStream requires a callback function as the last parameter' );
            }

            let prompt = this._promptMacros( prompt0 );

            if(! this.plugin && !specs) {
                throw new Error( 'No plugin selected. Use setLM() to select a plugin.' );
            }

            // Extract turn name (if any) and validate sections / uniqueness up front.
            let turnId = null;
            let sectionIds = [];
            if( options && typeof options === 'object' && options.name ) {
                turnId = options.name;
                if( this.discussion.some( m => m.turnId === turnId )) {
                    throw new Error( `Turn name '${turnId}' already in use` );
                }
                sectionIds = validateSections( prompt );
            }

            // Build streaming config; merge any caller-supplied retry/other options.
            const streamConfig = {
                stream: true,
                onChunk: onChunk,
                ...(options || {}),
            };
            // strip turn-only fields from streamConfig before passing down
            delete streamConfig.name;

            let result = await this._rawChat( prompt, this.discussion, specs, streamConfig );

            if( result ) {
                const userOpts = turnId ? { turnId, sectionIds } : undefined;
                const asstOpts = turnId ? { turnId } : undefined;
                this.addMessage( 'user', prompt, userOpts );
                this.addMessage( 'assistant', result.text, asstOpts );
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

            // Assemble config from the four-layer merge chain:
            //   sessionConfig → pluginConfigs[plugin::default] → pluginConfigs[plugin::model] → overrideConfig
            // Retry block is resolved separately via mergeRetry, walking the same layers plus plugin.defaultRetry.
            const sessionLayer = this.sessionConfig;
            const pluginDefaultLayer = this.pluginConfigs[ plugin._.id + "::default" ];
            const pluginModelLayer = this.pluginConfigs[ plugin._.id + "::" + model ];

            config = {
                ...(sessionLayer || {}),
                ...(pluginDefaultLayer || {}),
                ...(pluginModelLayer || {}),
                ...(overrideConfig || {}),
                framework,
                session: this,
            };

            config.retry = mergeRetry(
                plugin.defaultRetry,
                sessionLayer?.retry,
                pluginDefaultLayer?.retry,
                pluginModelLayer?.retry,
                overrideConfig?.retry,
            );

            // Submission filter (V0.10):
            //   - drop messages with active === false (HideTurn)
            //   - within each remaining message, drop bodies of hidden sections and strip all markers
            //   - also strip markers from the current prompt (no hidden sections — it's not in the discussion yet)
            const filteredDiscussion = (discussion || [])
                .filter( m => m.active !== false )
                .map( m => ({
                    ...m,
                    content: parseAndFilterSections( m.content, m.hiddenSections || new Set() ),
                }));
            const filteredPrompt = parseAndFilterSections( prompt, new Set() );

            let result =
                await plugin.complete(
                    model,
                    filteredPrompt,
                    filteredDiscussion,
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
        setDiscussion: function( newDiscussion ) {

            if( this.chainFlag ) {
                throw new Error( 'Cannot get discussion in chain mode' );
            }
            //check if newDiscussion exists and is an array
            if( !newDiscussion || !Array.isArray( newDiscussion )) {
                throw new Error( 'Discussion must be an array' );
            }
            this.discussion = newDiscussion;
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
        truncateStrings: function( truncateStrings0, maxLen ) {

            if( this.chainFlag ) {
                throw new Error( 'Cannot truncate discussion strings in chain mode' );
            }

            //Copy truncateStrings0 to truncateStrings to avoid modifying the objects in the original array
            let truncateStrings = [];
            for( let i=0; i<truncateStrings0.length; i++ ) {
                let ts = truncateStrings0[i];
                let ts2 = { ...ts };
                if( ts2.data.length > maxLen && ! ts2.hardDelete ) {
                    ts2.truncated = ts2.data.substring( 0, maxLen ) + "...";
                }
                else if ( ts2.hardDelete ) {
                    ts2.truncated = "";
                }
                truncateStrings.push( ts2 );
            }

            //loop through discussion and truncate strings matching truncateStrings.data to maxLen
            //but skip system messages
            //TODO, what about macros in system messages, we fix this later

            for( let i=0; i<this.discussion.length; i++ ) {
                let message = this.discussion[i];
                if( message.role !== 'system' ) {
                    if( message.originalContent ) {
                        //allready truncated
                        console.log("allready truncated. continue");
                    }
                    for( let j=0; j<truncateStrings.length; j++ ) {
                        let ts = truncateStrings[j];
                        if( message.content.includes( ts.data )) {
                            if( debug ) console.log( `Truncating message content at index ${i} for string ${ts.data}` );
                            //now replace all occurrences of ts.data in message.content with ts.truncated
                            message.originalContent = message.content;
                            message.content = message.content.split( ts.data ).join( ts.truncated );
                        }
                    }
                }
            }

        },

        // --- V0.10: hide/restore turns and sections ---

        _setTurnActive: function( turnId, isActive ) {
            const matches = this.discussion.filter( m => m.turnId === turnId );
            if( matches.length === 0 ) {
                throw new Error( `No turn with id '${turnId}'` );
            }
            for( const m of matches ) m.active = isActive;
        },
        hideTurn: function( turnId ) {
            if( this.chainFlag ) {
                throw new Error( 'Cannot hide turn in chain mode' );
            }
            this._setTurnActive( turnId, false );
        },
        restoreTurn: function( turnId ) {
            if( this.chainFlag ) {
                throw new Error( 'Cannot restore turn in chain mode' );
            }
            this._setTurnActive( turnId, true );
        },
        _findMessageWithSection: function( turnId, sectionId ) {
            return this.discussion.find( m =>
                m.turnId === turnId
                && Array.isArray( m.sectionIds )
                && m.sectionIds.includes( sectionId )
            );
        },
        hideSection: function( turnId, sectionId ) {
            if( this.chainFlag ) {
                throw new Error( 'Cannot hide section in chain mode' );
            }
            const msg = this._findMessageWithSection( turnId, sectionId );
            if( !msg ) {
                throw new Error( `No section '${sectionId}' in turn '${turnId}'` );
            }
            if( !msg.hiddenSections ) msg.hiddenSections = new Set();
            msg.hiddenSections.add( sectionId );
        },
        restoreSection: function( turnId, sectionId ) {
            if( this.chainFlag ) {
                throw new Error( 'Cannot restore section in chain mode' );
            }
            const msg = this._findMessageWithSection( turnId, sectionId );
            if( !msg ) {
                throw new Error( `No section '${sectionId}' in turn '${turnId}'` );
            }
            if( msg.hiddenSections ) msg.hiddenSections.delete( sectionId );
        },
        listTurns: function() {
            if( this.chainFlag ) {
                throw new Error( 'Cannot list turns in chain mode' );
            }
            const byTurn = new Map();
            for( const m of this.discussion ) {
                if( !m.turnId ) continue;
                if( !byTurn.has( m.turnId )) {
                    byTurn.set( m.turnId, { turnId: m.turnId, messages: [], sectionIds: [] });
                }
                const t = byTurn.get( m.turnId );
                t.messages.push( m );
                if( Array.isArray( m.sectionIds )) {
                    for( const sid of m.sectionIds ) {
                        if( !t.sectionIds.includes( sid )) t.sectionIds.push( sid );
                    }
                }
            }
            const result = [];
            for( const [turnId, t] of byTurn ) {
                const hidden = t.messages.every( m => m.active === false );
                const sections = t.sectionIds.map( sid => {
                    const msg = t.messages.find( m =>
                        Array.isArray( m.sectionIds ) && m.sectionIds.includes( sid )
                    );
                    const sectionHidden = msg && msg.hiddenSections && msg.hiddenSections.has( sid );
                    return { id: sid, hidden: !!sectionHidden };
                });
                result.push({ turnId, hidden, sections });
            }
            return result;
        },
        isTurnHidden: function( turnId ) {
            if( this.chainFlag ) {
                throw new Error( 'Cannot inspect turn in chain mode' );
            }
            const matches = this.discussion.filter( m => m.turnId === turnId );
            if( matches.length === 0 ) {
                throw new Error( `No turn with id '${turnId}'` );
            }
            return matches.every( m => m.active === false );
        },
        isSectionHidden: function( turnId, sectionId ) {
            if( this.chainFlag ) {
                throw new Error( 'Cannot inspect section in chain mode' );
            }
            const msg = this._findMessageWithSection( turnId, sectionId );
            if( !msg ) {
                throw new Error( `No section '${sectionId}' in turn '${turnId}'` );
            }
            return !!(msg.hiddenSections && msg.hiddenSections.has( sectionId ));
        },
        previewDiscussion: function() {
            if( this.chainFlag ) {
                throw new Error( 'Cannot preview discussion in chain mode' );
            }
            return this.discussion
                .filter( m => m.active !== false )
                .map( m => ({
                    role: m.role,
                    content: parseAndFilterSections( m.content, m.hiddenSections || new Set() ),
                }));
        },

        getConfig: function( plugin, model ) {

            if( this.chainFlag ) {
                throw new Error( 'Cannot get config in chain mode' );
            }
            // 0-arg form → return session-wide config
            if( plugin === undefined ) {
                return this.sessionConfig;
            }
            // 1- or 2-arg form → fallback chain plugin::model → plugin::default → sessionConfig
            if( model !== undefined ) {
                let key1 = plugin + "::" + model;
                if( this.pluginConfigs[ key1 ] !== undefined ) {
                    return this.pluginConfigs[ key1 ];
                }
            }
            let key2 = plugin + "::default";
            if( this.pluginConfigs[ key2 ] !== undefined ) {
                return this.pluginConfigs[ key2 ];
            }
            return this.sessionConfig;
        },
        setConfig: function( p0, p1, p2 ) {

            if( this.chainFlag ) {
                throw new Error( 'Cannot set config in chain mode' );
            }

            // 1-arg form: setConfig({...}) → session-wide
            if( typeof p0 !== 'string' ) {
                if( p0 === undefined || p0 === null || typeof p0 !== 'object' || Array.isArray(p0) ) {
                    throw new Error( 'setConfig: config must be an object' );
                }
                if( p1 !== undefined || p2 !== undefined ) {
                    throw new Error( 'setConfig: extra arguments not allowed with object form' );
                }
                if( p0.retry !== undefined ) validateRetry( p0.retry );
                this.sessionConfig = {
                    ...p0,
                    framework,
                    session: this
                };
                return;
            }

            // 2- or 3-arg form: setConfig(plugin, [model,] {...})
            let plugin = p0;
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

            if( !this.pluginIndex[ plugin ] ) {
                throw new Error( 'No plugin found with name: ' + plugin );
            }
            if( value === undefined || value === null || typeof value !== 'object' || Array.isArray(value) ) {
                throw new Error( 'setConfig: config must be an object' );
            }
            if( value.retry !== undefined ) validateRetry( value.retry );

            this.pluginConfigs[plugin + "::" + model] = {
                ...value,
                framework,
                session: this
            };
        }
        ,
        clearConfig: function( p0, p1 ) {

            if( this.chainFlag ) {
                throw new Error( 'Cannot clear config in chain mode' );
            }

            // 0-arg form: clearConfig() → clear session-wide
            if( p0 === undefined ) {
                this.sessionConfig = undefined;
                return;
            }

            let plugin = p0;
            let model = "";
            if( p1 === undefined ) {
                model = "default";
            }
            else {
                model = p1;
            }

            if( this.pluginIndex[ plugin ] ) {
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