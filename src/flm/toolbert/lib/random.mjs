let DEBUG = false; // Set to true for debugging output

function logDebug() {
    if (DEBUG) {
        conmsole.log(...arguments);
    }
}


import {
    dictionary,
    compatibilityRules,
    grammarRules,
    sentenceStructures,
    learningStats,
    wordScores
  } from './dict.mjs';


  // Utility functions - data-driven logic
  function getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
  }
  
  function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  
  // Get word properties from dictionary
  function getWordProperties(word) {
    if (!word) return {};
    const lower = word.toLowerCase();
    for (const partOfSpeech in dictionary) {
      const data = dictionary[partOfSpeech];
      if (data.properties && data.properties[lower]) {
        return { ...data.properties[lower], partOfSpeech };
      }
    }
    return {};
  }
  
  // **New**: Weighted-random selection based on wordScores
  function pickWordWeighted(wordList) {
    // Build array of [word, cumulativeWeight]
    let total = 0;
    const cumulative = wordList.map(w => {
      const score = wordScores[w.toLowerCase()] || 1.0;
      total += score;
      return { word: w, cumulative: total };
    });
    const r = Math.random() * total;
    for (const entry of cumulative) {
      if (r < entry.cumulative) {
        return entry.word;
      }
    }
    // Fallback (shouldn’t happen)
    return wordList[0];
  }
  
  // Data-driven word selection (adjusted for weighted pick)
  function selectWord(partOfSpeech, context = {}) {
    const wordData = dictionary[partOfSpeech];
    if (!wordData) return null;
    if (wordData.words) {
      if (typeof wordData.words === 'object' && !Array.isArray(wordData.words)) {
        // Categorized words - use context to select category
        let selectedCategory = null;
        
        // Apply context-based selection rules
        if (context.requires_case && wordData.words[context.requires_case]) {
          selectedCategory = context.requires_case;
        } else if (context.verb_type && wordData.words[context.verb_type]) {
          selectedCategory = context.verb_type;
        } else if (context.structure_context) {
          const structure = context.structure_context;
          if (structure.has_object && !structure.has_adjective) {
            selectedCategory = 'transitive';
          } else if (structure.has_adjective && !structure.has_object) {
            selectedCategory = 'linking';
          } else if (!structure.has_object && !structure.has_adjective) {
            selectedCategory = 'intransitive';
          }
        }
        
        if (!selectedCategory) {
          const categories = Object.keys(wordData.words);
          selectedCategory = getRandomElement(categories);
        }
        
        const wordsInCategory = wordData.words[selectedCategory];
        return pickWordWeighted(wordsInCategory);
      } else {
        return pickWordWeighted(wordData.words);
      }
    }
    return null;
  }
  
  // Data-driven article selection
  function selectArticle(nextWord) {
    const rules = grammarRules.article_selection.patterns;
    const vowels = ['a', 'e', 'i', 'o', 'u'];
    const firstLetter = nextWord.toLowerCase().charAt(0);
    const isVowel = vowels.includes(firstLetter);
    
    for (const rule of rules) {
      if ((rule.next_sound === 'vowel' && isVowel) || 
          (rule.next_sound === 'consonant' && !isVowel)) {
        return rule.article;
      }
    }
    
    return 'the'; // Default fallback
  }
  
  // Data-driven verb conjugation (unchanged, but uses noun plurality)
  function conjugateVerb(verb, subject) {
    const verbData = dictionary.verb;
    const verbProps = verbData.properties[verb];
    if (!verbProps || !verbProps.base) return verb;
    const conjugationRule = verbData.conjugation_rules[verbProps.base];
    if (!conjugationRule) return verb;
  
    const subjectProps = getWordProperties(subject);
    const lowerSubj = subject.toLowerCase();
    // Treat "we", "they", and "you" and any noun with plural:true as plural
    const isSubjectPlural = subjectProps.plural === true ||
                            ['they', 'we', 'you'].includes(lowerSubj);
  
    return isSubjectPlural ? conjugationRule.plural : conjugationRule.singular;
  }
  
  // Check compatibility (not fully used in this extension)
  function checkCompatibility(word1, word2, relationshipType) {
    const rules = compatibilityRules[relationshipType];
    if (!rules) return { valid: true, confidence: 0.5 };
    const word1Props = getWordProperties(word1);
    const word2Props = getWordProperties(word2);
    for (const ruleKey in rules) {
      if (matchesRule(word1Props, word2Props, ruleKey)) {
        return rules[ruleKey];
      }
    }
    return { valid: true, confidence: 0.5 };
  }
  
  function matchesRule(props1, props2, rulePattern) {
    const parts = rulePattern.split(' + ');
    return parts.some(part => 
      props1[part] === true ||
      props2[part] === true ||
      part === 'any' ||
      part === props1.partOfSpeech ||
      part === props2.partOfSpeech
    );
  }
  
  // **New**: Accurately detect whether a sentence has an object (noun or object-case pronoun) after the verb
  function sentenceHasObject(structure, words) {
    const verbIndex = structure.indexOf('verb');
    if (verbIndex === -1) return false;
    for (let i = verbIndex + 1; i < structure.length; i++) {
      const posTag = structure[i];
      const actualWord = words[i].toLowerCase();
      if (posTag === 'noun') {
        return true;
      }
      if (posTag === 'pronoun') {
        const pProps = dictionary.pronoun.properties[actualWord];
        if (pProps && pProps.case === 'object') {
          return true;
        }
      }
    }
    return false;
  }
  
  // **New**: Determine required pronoun case based on position
  function getRequiredCase(position) {
    const rules = grammarRules.pronoun_case.patterns;
    for (const rule of rules) {
      if (rule.position === position) {
        return rule.required_case;
      }
    }
    return 'subject'; // Default if no pattern matches
  }
  
  // Comprehensive sentence validation (unchanged)
  function validateSentence(structure, words, subject, verb, verbProps) {
    let confidence = 1.0;
    let penalties = [];
  
    if (!verbProps || Object.keys(verbProps).length === 0) {
      penalties.push("No verb properties found");
      return { confidence: 0.3, penalties };
    }
  
    // 1) Count objects/pronoun-objects accurately
    const hasObject = sentenceHasObject(structure, words);
  
    // 2) Check takes_object / takes_adjective flags
    const takesObj = verbProps.takes_object;
    const takesAdj = verbProps.takes_adjective;
    const verbIdx = structure.indexOf('verb');
    const nextPOS = (verbIdx !== -1 && verbIdx + 1 < structure.length) ? structure[verbIdx + 1] : null;
  
    if (!takesObj && hasObject) {
      confidence *= 0.1;
      penalties.push(`Verb "${verbProps.base}" should not take an object`);
    }
    if (takesObj && !hasObject) {
      confidence *= 0.2;
      penalties.push(`Verb "${verbProps.base}" expects an object`);
    }
    const hasAdjectiveAfter = nextPOS === 'adjective';
    if (takesAdj && !hasAdjectiveAfter) {
      confidence *= 0.2;
      penalties.push(`Verb "${verbProps.base}" expects an adjective complement`);
    }
    if (!takesAdj && hasAdjectiveAfter) {
      confidence *= 0.2;
      penalties.push(`Verb "${verbProps.base}" should not have an adjective after it`);
    }
  
    // 3) Enhanced Number Agreement (treat “you” and noun plural:true as plural)
    const subjectProps = getWordProperties(subject);
    const lowerSubj = subject.toLowerCase();
    const isSubjPlural = subjectProps.plural === true || ['we', 'they', 'you'].includes(lowerSubj);
    const verbBase = verbProps.base;
    if (verbBase && dictionary.verb.conjugation_rules[verbBase]) {
      const expectedForm = isSubjPlural
        ? dictionary.verb.conjugation_rules[verbBase].plural
        : dictionary.verb.conjugation_rules[verbBase].singular;
      if (expectedForm && verb !== expectedForm) {
        confidence *= 0.1;
        penalties.push(`Subject-verb disagreement: ${subject} + ${verb} (expected "${expectedForm}")`);
      }
    }
  
    // 4) Article-noun agreement (a/an)
    for (let i = 0; i < words.length - 1; i++) {
      if (words[i].toLowerCase() === 'a') {
        const nextWord = words[i + 1];
        if (nextWord) {
          const firstChar = nextWord.charAt(0).toLowerCase();
          if (['a', 'e', 'i', 'o', 'u'].includes(firstChar)) {
            confidence *= 0.2;
            penalties.push(`Article error: "a ${nextWord}" should be "an ${nextWord}"`);
          }
        }
      }
    }
  
    // 5) Semantic animacy check
    if (verbProps.requires_animate) {
      const subjectProps2 = getWordProperties(subject);
      if (subjectProps2.animate === false) {
        confidence *= 0.3;
        penalties.push(`Inanimate subject "${subject}" with action verb "${verb}"`);
      }
      if (!subjectProps2 || Object.keys(subjectProps2).length === 0) {
        confidence *= 0.4;
        penalties.push(`Unknown subject "${subject}" with action verb - assuming problematic`);
      }
    }
  
    // 6) Preposition usage check (transitive + preposition + object)
    const hasPreposition = structure.includes('preposition');
    if (verbProps.type === 'transitive' && hasPreposition && hasObject) {
      confidence *= 0.4;
      penalties.push("Transitive verb with preposition and object - unusual structure");
    }
  
    // 7) Adverb placement check
    if (structure.includes('adverb')) {
      const lastWord = words[words.length - 1].toLowerCase();
      if (lastWord === 'always') {
        confidence *= 0.6;
        penalties.push("Awkward adverb placement");
      }
    }
  
    return { confidence, penalties };
  }
  
  // Build sentence using data-driven rules (unchanged)
  function buildSentence(structure) {
    const words = [];
    let subject = null;
    let verb = null;
    let verbProps = null;
  
    // Temporary context flags for selecting verbs
    const hasObjectPlaceholder = structure.filter(pos => pos === 'noun').length > 1;
    const hasAdjectivePlaceholder = structure.includes('adjective');
    const hasAdverbPlaceholder = structure.includes('adverb');
  
    for (let i = 0; i < structure.length; i++) {
      const partOfSpeech = structure[i];
      let word = null;
      let context = {};
  
      if (partOfSpeech === 'article' && i + 1 < structure.length) {
        const nextPos = structure[i + 1];
        const nextWord = selectWord(nextPos, context) || '';
        word = selectArticle(nextWord);
      } else if (partOfSpeech === 'pronoun') {
        const position = i === 0
          ? 'sentence_start'
          : (i > 0 && structure[i - 1] === 'verb')
            ? 'after_verb'
            : 'before_verb';
        context.requires_case = getRequiredCase(position);
        word = selectWord(partOfSpeech, context);
        if (!subject) subject = word;
      } else if (partOfSpeech === 'noun') {
        word = selectWord(partOfSpeech, context);
        if (!subject) subject = word;
      } else if (partOfSpeech === 'verb') {
        context.structure_context = {
          has_object: hasObjectPlaceholder,
          has_adjective: hasAdjectivePlaceholder,
          has_adverb: hasAdverbPlaceholder
        };
        word = selectWord(partOfSpeech, context);
        verbProps = getWordProperties(word);
        if (subject) {
          word = conjugateVerb(word, subject);
        }
        verb = word;
      } else if (partOfSpeech === 'adjective') {
        if (verbProps && verbProps.takes_adjective === false) {
          return { isValid: false, confidence: 0, penalties: ["Adjective with non-linking verb"] };
        }
        word = selectWord(partOfSpeech, context);
      } else if (partOfSpeech === 'adverb') {
        if (verbProps && verbProps.type === 'linking' && !hasAdjectivePlaceholder) {
          return { isValid: false, confidence: 0, penalties: ["Adverb with linking verb, no adjective"] };
        }
        word = selectWord(partOfSpeech, context);
      } else {
        word = selectWord(partOfSpeech, context);
      }
  
      if (!word) {
        return { isValid: false, confidence: 0, penalties: ["Could not select word"] };
      }
  
      words.push(word);
    }
  
    // Now validate using the fixed validateSentence
    const validationResults = validateSentence(structure, words, subject, verb, verbProps);
    const confidence = validationResults.confidence;
    const sentence = capitalizeFirst(words.join(' ')) + '.';
  
    if (validationResults.penalties && validationResults.penalties.length > 0) {
      logDebug(`DEBUG: ${sentence} - Confidence: ${confidence.toFixed(2)} - Penalties: ${validationResults.penalties.join('; ')}`);
    }
  
    return {
      isValid: confidence > 0.2,
      text: sentence,
      words: words,
      confidence: confidence,
      penalties: validationResults.penalties || []
    };
  }
  
  // Main sentence generation with learning capability (unchanged)
  function generateRandomSentence() {
    const maxAttempts = 10;
  
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const structureData = getRandomElement(sentenceStructures);
      const structure = structureData.pattern;
      const sentence = buildSentence(structure);
  
      if (sentence.isValid) {
        structureData.usage_count++;
        return {
          sentence: sentence.text,
          structure: structure,
          words: sentence.words,
          confidence: sentence.confidence,
          structureId: sentenceStructures.indexOf(structureData)
        };
      }
    }
  
    // Fallback
    return {
      sentence: "The cat runs.",
      structure: ['article', 'noun', 'verb'],
      words: ['the', 'cat', 'runs'],
      confidence: 0.5,
      structureId: 0
    };
  }
  
  // Multiple sentence generation (unchanged)
  function generateMultipleSentences(count = 5) {
    logDebug(`Generating ${count} random sentences:\n`);
  
    for (let i = 1; i <= count; i++) {
      const result = generateRandomSentence();
      logDebug(`${i}. ${result.sentence}`);
      logDebug(`   Structure: [${result.structure.join(', ')}]`);
      logDebug(`   Words: [${result.words.join(', ')}]`);
      logDebug(`   Confidence: ${result.confidence.toFixed(2)}`);
      if (result.penalties && result.penalties.length > 0) {
        logDebug(`   Penalties: ${result.penalties.join('; ')}`);
      }
      logDebug('');
    }
  }
  
  // **New**: Add input words into dictionary, detect plurality, and boost scores
  function addInputWords(inputText) {
    // Split on non-letter characters, filter out empty tokens
    const tokens = inputText
      .split(/[^A-Za-z0-9]+/)
      .map(tok => tok.trim().toLowerCase())
      .filter(tok => tok.length > 0);
  
    for (const token of tokens) {
      // If already a noun in our dictionary, just boost its score
      if (dictionary.noun.properties[token]) {
        wordScores[token] = (wordScores[token] || 1.0) + 1.0;
        continue;
      }
  
      // Otherwise, we treat it as a new noun in the 'abstract' category
      // and detect plurality by a simple heuristic: ends with 's'
      const isPlural = token.length > 1 && token.endsWith('s');
      const singularForm = isPlural ? token.slice(0, -1) : token;
  
      // Add to dictionary.noun.words.abstract
      dictionary.noun.words.abstract.push(token);
  
      // Add properties entry
      dictionary.noun.properties[token] = {
        animate: false,              // assume abstract/inanimate
        singular: !isPlural,
        plural: isPlural,
        can_act: false
      };
  
      // Initialize its score (boost input words)
      wordScores[token] = (wordScores[token] || 1.0) + 2.0;
    }
  }
  
  // **New**: Decay scores of words each time they are used, to reduce repetition
  function decayScore(word) {
    const lower = word.toLowerCase();
    if (!wordScores[lower]) {
      wordScores[lower] = 1.0; 
    }
    // Multiply by a decay factor, e.g. 0.9
    wordScores[lower] *= 0.9;
    if (wordScores[lower] < 0.1) {
      wordScores[lower] = 0.1; // floor, so it never goes to zero
    }
  }
  
  // **New**: Boost scores of words used in the user-input each time
  function boostInputScores(wordsArray) {
    for (const w of wordsArray) {
      const lower = w.toLowerCase();
      wordScores[lower] = (wordScores[lower] || 1.0) + 0.5;
    }
  }
  
  // Wrap the original generateMultipleSentences to decay used words
  function generateMultipleSentencesWithDecay(count = 5) {
    logDebug(`Generating ${count} random sentences:\n`);
    for (let i = 1; i <= count; i++) {
      const result = generateRandomSentence();
      logDebug(`${i}. ${result.sentence}`);
      logDebug(`   Structure: [${result.structure.join(', ')}]`);
      logDebug(`   Words: [${result.words.join(', ')}]`);
      logDebug(`   Confidence: ${result.confidence.toFixed(2)}`);
      if (result.penalties && result.penalties.length > 0) {
        logDebug(`   Penalties: ${result.penalties.join('; ')}`);
      }
      logDebug('');
      // Decay all words used in this sentence
      result.words.forEach(decayScore);
    }
  }
  


  
  function recordFeedback(sentenceId, isPositive, feedback = '') {
    learningStats.user_feedback_history.push({
      sentenceId,
      isPositive,
      feedback,
      timestamp: Date.now()
    });
  }
  
  function updateRuleConfidence(ruleType, rule, delta) {
    if (!learningStats.rule_confidence_updates[ruleType]) {
      learningStats.rule_confidence_updates[ruleType] = {};
    }
    learningStats.rule_confidence_updates[ruleType][rule] =
      (learningStats.rule_confidence_updates[ruleType][rule] || 0) + delta;
  }

  
  export {
    addInputWords,
    generateRandomSentence,
    generateMultipleSentences,
    generateMultipleSentencesWithDecay,
    recordFeedback,
    updateRuleConfidence,
    boostInputScores,
    dictionary,
    compatibilityRules,
    grammarRules,
    sentenceStructures,
    learningStats,
    wordScores
  };