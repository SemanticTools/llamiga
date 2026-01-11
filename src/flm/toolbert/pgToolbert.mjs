const pluginName = "pgToolbert";
const pluginVersion = "0.5.0";
const commands = false;
const canSummarize = false;

import {
    addInputWords,
    generateRandomSentence
} from './lib/random.mjs';


const id = pluginName;
const version = pluginVersion;


const tooLongPrompts = [
   "Hey, that's to long, it confuses me! Try something shorter.",
    "I can't handle such long text, please simplify it for me.",
    "This prompt is too lengthy for me, could you shorten it?",
    "Wow, that's a lot of text! Can you make it shorter?",
    "I get confused with long text, please try a shorter one.",
    "Long text are tricky for me, can you simplify it?",
    "I prefer shorter text, this one is too long for me."
];

const fantasyPrompts = [
   "This looks like you have given it some thought, now be critical.",
   "You have been thinking, but have you forgotten something.",
   "Is it really like that?  Please check your assumptions.",
   "A long text, but should the focus not be on the essentials?",
   "Are you overcomplicating this?",
   "Hey, I appreciate your effort, But try a different angle!",
   "A 1000 monkeys can write shakespeare, but can you write a haiku?",
];

function envInit() {}
function getDefaultModel() { return "toolbert-v0-english"; }
  
async function complete( model, prompt, messages ) {

    let wordCount = prompt.split(" ").length;
    let origPrompt = messages[0].content;

    // Wait 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));

    if( (wordCount > 40 && Math.random() > 0.7)) {
      // If prompt is long, skip processing and return a random sentence

      //get a random toolongprompt from the array
      const randomIndex = Math.floor(Math.random() * tooLongPrompts.length);
      const randomTooLongPrompt = tooLongPrompts[randomIndex];

      return {
        success: true,
        retries: 0,
        text: randomTooLongPrompt,
        totalTokens: -1,
        responseId: "toolbert-001",        
        raw: {
          method: "too-long"
        }
      };      
    }
    else if( Math.random() > 0.9) {
      // It is random sentence time, som fantasy comments on the performance so far

      //get a random toolongprompt from the array
      const randomIndex = Math.floor(Math.random() * fantasyPrompts.length);
      const randomLongPrompt = fantasyPrompts[randomIndex];

      return {
        success: true,
        retries: 0,
        text: randomLongPrompt,
        totalTokens: -1,
        responseId: "toolbert-001",        
        raw: {
          method: "random-fantasy"
        }
      };
    }    


    addInputWords( prompt );
    const singleSentence = generateRandomSentence();

    /* get a number N from 1 to 5, extract so many words from the input */
    let fragments = "";
    let numWords = Math.floor(Math.random() * 5) + 1;
    let inputWords = prompt.split(" ");
    for( let i=0; i<numWords ; i++ ) {
      //get random word index
      let randomIndex = Math.floor(Math.random() * inputWords.length);
      //add the word to fragments
      fragments += inputWords[randomIndex] + " ";
      //remove the word from inputWords
      inputWords.splice(randomIndex, 1);

      //break if inputwords is empty
      if( inputWords.length === 0 ) {
        break;
      }
    }

    return {
      success: true,
      retries: 0,
      text: "Consider " + fragments + ", but please consider also: " + singleSentence.sentence,
      totalTokens: -1,
      responseId: "toolbert-001",        
      raw: {
        method: "random-input"
      }
    };

}

export { complete, id, version, commands, envInit, getDefaultModel };
  
