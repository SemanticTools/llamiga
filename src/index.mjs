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

const g_plugins = {
  ollama:       { plugin: ollamaAI, tags: ['llm', 'selfhosted'] },
  openai:       { plugin: openAI, tags: ['llm', 'cloud'] },
  anthropic:    { plugin: anthropic, tags: ['llm', 'cloud'] },
  mistral:   { plugin: mistral, tags: ['llm', 'cloud'] },
  grok:        { plugin: grok, tags: ['llm', 'cloud'] },
  gemini:      { plugin: gemini, tags: ['llm', 'cloud'] },
  //sleepinglama: sleeplamaAI, needs more testing
  toolbert:   { plugin: toolbert, tags: ['flm', 'tool'] },
};

const LASTRESPONSE  = "{{lastresponse}}";
const PRUNE_ALL     = "{{pruneall}}";
const ALL_PLUGINS   = "{{all}}";
const ALL_CLOUD_LLM_PLUGINS = "{{cloud}}";
const ALL_TOOL_PLUGINS = "{{tool}}";

let debug = false;

function setDebug( value ) {
    //check if boolean
    if( typeof value !== 'boolean') {
        throw new Error( 'Debug value must be a boolean' );
    }
    debug = value;
}

function _getPlugin( id0 ) {

  console.log( id0 );
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


function getPluginList( specsArray ) {

    console.log("getPluginList called with specs: " + JSON.stringify( specsArray   ));
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
        else {
            names.push( spec );
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

    if( !Array.isArray( pluginSpecs0 )) {
        pluginSpecs = getPluginList( [ pluginSpecs0 ] );
    }
    else 
    {
        pluginSpecs = getPluginList( pluginSpecs0 );
    }

    console.log( "Using plugins: " + JSON.stringify( pluginSpecs ) );

    if( options && options.macros !== undefined ) macros = options.macros;

    if( Array.isArray( pluginSpecs )) {
        if( pluginSpecs.length === 0 ) {
            throw new Error( 'Plugin array is empty' );
        }
        for( let i=0; i<pluginSpecs.length; i++ ) {
            console.log( "Initializing plugin: '" + pluginSpecs[i] + "'" )
            let p = _getPlugin( pluginSpecs[i] );
            console.log( "Initialized plugin: '" , p , "'" )
            plugins.push( p );
            pluginIndex[ p._.id ] = p;
            pluginModels[ p._.id ] = p.getDefaultModel();
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
        ask: async function( prompt0, overrideModel ) {

            let prompt = this._promptMacros( prompt0 );

            if(! this.plugin ) {
                throw new Error( 'No plugin selected. Use setProvider() to select a plugin.' );
            }
            let config = this.getConfig( this.plugin._.id, this.model );
            return await this._rawChat( prompt, null, overrideModel, config );
        },
        rawChat: async function( prompt, discussion, overrideModel, overrideConfig ) {

            return await this._rawChat( prompt, discussion, overrideModel, overrideConfig );
        },      
        _promptMacros: function( prompt ) {
            if( this.macros ) {
                prompt = prompt.replaceAll( LASTRESPONSE, this.lastResponse );
            }
            return prompt;
        },   
        chat: async function( prompt0, overrideModel ) {

            let prompt = this._promptMacros( prompt0 );

            if(! this.plugin ) {
                throw new Error( 'No plugin selected. Use setProvider() to select a plugin.' );
            }

            let config = this.getConfig( this.plugin._.id, this.model );
            let result = await this._rawChat( prompt, this.discussion, overrideModel, config );
            if( result ) {
               this.addMessage( 'user', prompt );
               this.addMessage( 'assistant', result.text );
            }
            delete result.actualPrompt;
            return result;
        },
        _rawChat: async function( prompt, discussion, overrideModel, config ) {

            if(! this.plugin ) {
                throw new Error( 'No plugin selected. Use setProvider() to select a plugin.' );
            }
            let timing = common.getTiming();
            let startDate = new Date().toISOString();
            let model = this.model;
            if( overrideModel ) {
                model = overrideModel;
            }

            let result = 
                await this.plugin.complete( 
                    model, 
                    prompt, 
                    discussion,
                    config 
                );

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
        },
        pruneDiscussion: function( index ) {
            if( index == PRUNE_ALL ) {
                this.discussion = [];
            }
            else if( index >= 0 && index < this.discussion.length ) {
                this.discussion = this.discussion.slice( index , 1 );
            }
        },
        getConfig: function( plugin, model ) {
            let key1 = plugin + "::" + model;
            let key2 = plugin + "::" + model;

            if( this.pluginConfigs[ key1 ] !== undefined ) {
                return this.pluginConfigs[ key1 ];
            }
            if( this.pluginConfigs[ key2 ] !== undefined ) {
                return this.pluginConfigs[ key2 ];
            }
            return undefined;
        },
        setConfig: function( plugin, p1, p2 ) {

            let model = "";
            let value = null;
            if( p2 === undefined ) {
                model = "*";
                value = p1;
            }
            else {
                model = p1;
                value = p2;
            }
                
            if( this.pluginIndex[ plugin  ] ) {
                this.pluginConfigs[ plugin + "::" + model ] = value;
            }
            else {
                throw new Error( 'No plugin found with name: ' + plugin );
            }
        }
        ,
        clearConfig: function( plugin, p1 ) {

            let model = "";
            if( p2 === undefined ) {
                model = "*";
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
        }        
    };
    
    return session;
}

function createSession( pluginSpecs, options = {} ) {

    let object = createObject( pluginSpecs, options );

    return object;
}


export { createSession, getPluginList, setDebug, LASTRESPONSE, PRUNE_ALL, ALL_PLUGINS };