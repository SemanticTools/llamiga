
import {
    addInputWords,
    generateRandomSentence,
    boostInputScores,
    generateMultipleSentences,
    generateMultipleSentencesWithDecay,
    recordFeedback,
    updateRuleConfidence,
    dictionary,
    compatibilityRules,
    grammarRules,
    sentenceStructures,
    learningStats,
    wordScores
  } from './random.mjs';


  console.log('=== Learning-Ready Random Sentence Generator (Extended) ===\n');
    
  // Example: incorporate some input text
  addInputWords("Spaceships planets aliens stars");
  // Subsequent calls will favor "spaceships", "planets", etc., and treat “spaceships” as plural
  boostInputScores();

  //generateMultipleSentencesWithDecay(5);
  
  console.log('--- Individual sentence generation ---');
  const singleSentence = generateRandomSentence();
  console.log(`Generated: ${singleSentence.sentence}`);
  console.log(`Confidence: ${singleSentence.confidence.toFixed(2)}`);