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

const dictionary = {
    article: {
      words: ['the', 'a'],
      rules: {
        'a_an_vowel': { pattern: 'vowel_start', article: 'an', confidence: 0.95 },
        'a_an_consonant': { pattern: 'consonant_start', article: 'a', confidence: 0.95 }
      }
    },
    
    noun: {
        words: {
          animate: [
            'dog', 'cat', 'child', 'bird', 'boy', 'girl', 'runner', 'teacher', 'student',
            'horse', 'lion', 'farmer', 'chef', 'doctor', 'nurse', 'player', 'actor', 'writer'
          ],
          inanimate: [
            'car', 'book', 'mouse', 'ball', 'table', 'gift', 'desk', 'team',
            'phone', 'computer', 'chair', 'clock', 'window', 'door', 'shirt', 'bottle'
          ],
          abstract: [
            'sunset', 'happiness', 'idea', 'dream', 'story',
            'freedom', 'knowledge', 'love', 'courage', 'truth'
          ]
        },
        properties: {
          // original animate nouns
          'dog':      { animate: true,  singular: true, can_act: true },
          'cat':      { animate: true,  singular: true, can_act: true },
          'child':    { animate: true,  singular: true, can_act: true },
          'bird':     { animate: true,  singular: true, can_act: true },
          'boy':      { animate: true,  singular: true, can_act: true },
          'girl':     { animate: true,  singular: true, can_act: true },
          'runner':   { animate: true,  singular: true, can_act: true },
          'teacher':  { animate: true,  singular: true, can_act: true },
          'student':  { animate: true,  singular: true, can_act: true },
          // original inanimate nouns
          'car':      { animate: false, singular: true, can_act: false },
          'book':     { animate: false, singular: true, can_act: false },
          'mouse':    { animate: true,  singular: true, can_act: true },
          'ball':     { animate: false, singular: true, can_act: false },
          'table':    { animate: false, singular: true, can_act: false },
          'gift':     { animate: false, singular: true, can_act: false },
          'desk':     { animate: false, singular: true, can_act: false },
          'team':     { animate: true,  singular: true, can_act: true },
          // original abstract nouns
          'sunset':     { animate: false, singular: true, can_act: false },
          'happiness':  { animate: false, singular: true, can_act: false },
          'idea':       { animate: false, singular: true, can_act: false },
          'dream':      { animate: false, singular: true, can_act: false },
          'story':      { animate: false, singular: true, can_act: false },
      
          // new animate nouns
          'horse':   { animate: true,  singular: true, can_act: true },
          'lion':    { animate: true,  singular: true, can_act: true },
          'farmer':  { animate: true,  singular: true, can_act: true },
          'chef':    { animate: true,  singular: true, can_act: true },
          'doctor':  { animate: true,  singular: true, can_act: true },
          'nurse':   { animate: true,  singular: true, can_act: true },
          'player':  { animate: true,  singular: true, can_act: true },
          'actor':   { animate: true,  singular: true, can_act: true },
          'writer':  { animate: true,  singular: true, can_act: true },
      
          // new inanimate nouns
          'phone':     { animate: false, singular: true, can_act: false },
          'computer':  { animate: false, singular: true, can_act: false },
          'chair':     { animate: false, singular: true, can_act: false },
          'clock':     { animate: false, singular: true, can_act: false },
          'window':    { animate: false, singular: true, can_act: false },
          'door':      { animate: false, singular: true, can_act: false },
          'shirt':     { animate: false, singular: true, can_act: false },
          'bottle':    { animate: false, singular: true, can_act: false },
      
          // new abstract nouns
          'freedom':   { animate: false, singular: true, can_act: false },
          'knowledge': { animate: false, singular: true, can_act: false },
          'love':      { animate: false, singular: true, can_act: false },
          'courage':   { animate: false, singular: true, can_act: false },
          'truth':     { animate: false, singular: true, can_act: false }
        }
      },
      
    
      verb: {
        words: {
          intransitive: [
            'runs', 'laughs', 'flies', 'walks', 'sings', 'wins', 'arrives',
            'sleeps', 'jumps', 'cries', 'sits', 'dances', 'swims', 'smiles'
          ],
          transitive: [
            'chases', 'buys', 'gives', 'finishes', 'sees', 'puts', 'studies', 'helps',
            'eats', 'kicks', 'builds', 'writes', 'paints', 'drives', 'calls', 'reads'
          ],
          linking: [
            'looks', 'seems', 'appears', 'becomes', 'remains',
            'feels', 'tastes', 'sounds', 'stays', 'grows'
          ]
        },
        properties: {
          // intransitive verbs
          'runs':    { type: 'intransitive', requires_animate: true,  takes_object: false, takes_adjective: false, base: 'run' },
          'laughs':  { type: 'intransitive', requires_animate: true,  takes_object: false, takes_adjective: false, base: 'laugh' },
          'flies':   { type: 'intransitive', requires_animate: true,  takes_object: false, takes_adjective: false, base: 'fly' },
          'walks':   { type: 'intransitive', requires_animate: true,  takes_object: false, takes_adjective: false, base: 'walk' },
          'sings':   { type: 'intransitive', requires_animate: true,  takes_object: false, takes_adjective: false, base: 'sing' },
          'wins':    { type: 'intransitive', requires_animate: true,  takes_object: false, takes_adjective: false, base: 'win' },
          'arrives': { type: 'intransitive', requires_animate: true,  takes_object: false, takes_adjective: false, base: 'arrive' },
          'sleeps':  { type: 'intransitive', requires_animate: true,  takes_object: false, takes_adjective: false, base: 'sleep' },
          'jumps':   { type: 'intransitive', requires_animate: true,  takes_object: false, takes_adjective: false, base: 'jump' },
          'cries':   { type: 'intransitive', requires_animate: true,  takes_object: false, takes_adjective: false, base: 'cry' },
          'sits':    { type: 'intransitive', requires_animate: true,  takes_object: false, takes_adjective: false, base: 'sit' },
          'dances':  { type: 'intransitive', requires_animate: true,  takes_object: false, takes_adjective: false, base: 'dance' },
          'swims':   { type: 'intransitive', requires_animate: true,  takes_object: false, takes_adjective: false, base: 'swim' },
          'smiles':  { type: 'intransitive', requires_animate: true,  takes_object: false, takes_adjective: false, base: 'smile' },
      
          // transitive verbs
          'chases':   { type: 'transitive', requires_animate: true, takes_object: true,  takes_adjective: false, base: 'chase' },
          'buys':     { type: 'transitive', requires_animate: true, takes_object: true,  takes_adjective: false, base: 'buy' },
          'gives':    { type: 'transitive', requires_animate: true, takes_object: true,  takes_adjective: false, base: 'give' },
          'finishes': { type: 'transitive', requires_animate: true, takes_object: true,  takes_adjective: false, base: 'finish' },
          'sees':     { type: 'transitive', requires_animate: true, takes_object: true,  takes_adjective: false, base: 'see' },
          'puts':     { type: 'transitive', requires_animate: true, takes_object: true,  takes_adjective: false, base: 'put' },
          'studies':  { type: 'transitive', requires_animate: true, takes_object: true,  takes_adjective: false, base: 'study' },
          'helps':    { type: 'transitive', requires_animate: true, takes_object: true,  takes_adjective: false, base: 'help' },
          'eats':     { type: 'transitive', requires_animate: true, takes_object: true,  takes_adjective: false, base: 'eat' },
          'kicks':    { type: 'transitive', requires_animate: true, takes_object: true,  takes_adjective: false, base: 'kick' },
          'builds':   { type: 'transitive', requires_animate: true, takes_object: true,  takes_adjective: false, base: 'build' },
          'writes':   { type: 'transitive', requires_animate: true, takes_object: true,  takes_adjective: false, base: 'write' },
          'paints':   { type: 'transitive', requires_animate: true, takes_object: true,  takes_adjective: false, base: 'paint' },
          'drives':   { type: 'transitive', requires_animate: true, takes_object: true,  takes_adjective: false, base: 'drive' },
          'calls':    { type: 'transitive', requires_animate: true, takes_object: true,  takes_adjective: false, base: 'call' },
          'reads':    { type: 'transitive', requires_animate: true, takes_object: true,  takes_adjective: false, base: 'read' },
      
          // linking verbs
          'looks':   { type: 'linking', requires_animate: false, takes_object: false, takes_adjective: true, base: 'look' },
          'seems':   { type: 'linking', requires_animate: false, takes_object: false, takes_adjective: true, base: 'seem' },
          'appears': { type: 'linking', requires_animate: false, takes_object: false, takes_adjective: true, base: 'appear' },
          'becomes': { type: 'linking', requires_animate: false, takes_object: false, takes_adjective: true, base: 'become' },
          'remains': { type: 'linking', requires_animate: false, takes_object: false, takes_adjective: true, base: 'remain' },
          'feels':   { type: 'linking', requires_animate: false, takes_object: false, takes_adjective: true, base: 'feel' },
          'tastes':  { type: 'linking', requires_animate: false, takes_object: false, takes_adjective: true, base: 'taste' },
          'sounds':  { type: 'linking', requires_animate: false, takes_object: false, takes_adjective: true, base: 'sound' },
          'stays':   { type: 'linking', requires_animate: false, takes_object: false, takes_adjective: true, base: 'stay' },
          'grows':   { type: 'linking', requires_animate: false, takes_object: false, takes_adjective: true, base: 'grow' }
        },
        conjugation_rules: {
          // existing bases
          'run':      { singular: 'runs',    plural: 'run' },
          'laugh':    { singular: 'laughs',  plural: 'laugh' },
          'fly':      { singular: 'flies',   plural: 'fly' },
          'walk':     { singular: 'walks',   plural: 'walk' },
          'sing':     { singular: 'sings',   plural: 'sing' },
          'win':      { singular: 'wins',    plural: 'win' },
          'arrive':   { singular: 'arrives', plural: 'arrive' },
          'chase':    { singular: 'chases',  plural: 'chase' },
          'buy':      { singular: 'buys',    plural: 'buy' },
          'give':     { singular: 'gives',   plural: 'give' },
          'finish':   { singular: 'finishes',plural: 'finish' },
          'see':      { singular: 'sees',    plural: 'see' },
          'put':      { singular: 'puts',    plural: 'put' },
          'study':    { singular: 'studies', plural: 'study' },
          'help':     { singular: 'helps',   plural: 'help' },
          'look':     { singular: 'looks',   plural: 'look' },
          'seem':     { singular: 'seems',   plural: 'seem' },
          'appear':   { singular: 'appears', plural: 'appear' },
          'become':   { singular: 'becomes', plural: 'become' },
          'remain':   { singular: 'remains', plural: 'remain' },
      
          // new bases
          'sleep':  { singular: 'sleeps',  plural: 'sleep' },
          'jump':   { singular: 'jumps',   plural: 'jump' },
          'cry':    { singular: 'cries',   plural: 'cry' },
          'sit':    { singular: 'sits',    plural: 'sit' },
          'dance':  { singular: 'dances',  plural: 'dance' },
          'swim':   { singular: 'swims',   plural: 'swim' },
          'smile':  { singular: 'smiles',  plural: 'smile' },
          'eat':    { singular: 'eats',    plural: 'eat' },
          'kick':   { singular: 'kicks',   plural: 'kick' },
          'build':  { singular: 'builds',  plural: 'build' },
          'write':  { singular: 'writes',  plural: 'write' },
          'paint':  { singular: 'paints',  plural: 'paint' },
          'drive':  { singular: 'drives',  plural: 'drive' },
          'call':   { singular: 'calls',   plural: 'call' },
          'read':   { singular: 'reads',   plural: 'read' },
          'feel':   { singular: 'feels',   plural: 'feel' },
          'taste':  { singular: 'tastes',  plural: 'taste' },
          'sound':  { singular: 'sounds',  plural: 'sound' },
          'stay':   { singular: 'stays',   plural: 'stay' },
          'grow':   { singular: 'grows',   plural: 'grow' }
        }
      },
      
    
    pronoun: {
      words: {
        subject: ['she', 'he', 'I', 'we', 'they', 'it', 'you'],
        object: ['her', 'him', 'me', 'us', 'them', 'it', 'you']
      },
      properties: {
        'she': { case: 'subject', animate: true, singular: true },
        'he': { case: 'subject', animate: true, singular: true },
        'i': { case: 'subject', animate: true, singular: true },
        'we': { case: 'subject', animate: true, plural: true },
        'they': { case: 'subject', animate: true, plural: true },
        'it': { case: 'subject', animate: false, singular: true },
        'you': { case: 'both', animate: true, singular: true },
        'her': { case: 'object', animate: true, singular: true },
        'him': { case: 'object', animate: true, singular: true },
        'me': { case: 'object', animate: true, singular: true },
        'us': { case: 'object', animate: true, plural: true },
        'them': { case: 'object', animate: true, plural: true }
      }
    },
    
    adjective: {
        words: {
          physical: [
            'red', 'small', 'big', 'fast', 'old', 'bright', 'dark', 'loud', 'soft', 'blue',
            'green', 'yellow', 'white', 'black', 'gray', 'purple', 'orange', 'pink', 'brown', 'silver',
            'golden', 'bronze', 'crimson', 'scarlet', 'azure', 'teal', 'turquoise', 'magenta', 'maroon', 'violet',
            'navy', 'olive', 'beige', 'tiny', 'huge', 'tall', 'short', 'narrow', 'wide', 'thick',
            'thin', 'deep', 'shallow', 'long', 'high', 'low', 'heavy', 'light', 'massive', 'slight',
            'bulky', 'slender', 'chubby', 'skinny', 'fat', 'lean', 'rough', 'smooth', 'hard', 'wet',
            'dry', 'shiny', 'dull', 'sharp', 'blunt', 'silky', 'fuzzy', 'coarse', 'gritty', 'slippery',
            'sticky', 'bumpy', 'glossy', 'matte', 'porous', 'dense', 'elastic', 'rigid', 'flexible', 'brittle',
            'malleable', 'chewy', 'crispy', 'crunchy', 'juicy', 'oily', 'greasy', 'round', 'square', 'triangular',
            'rectangular', 'oval', 'circular', 'cylindrical', 'cubic', 'flat', 'pointed', 'jagged', 'wavy', 'spiral',
            'hexagonal', 'octagonal', 'spherical', 'conical', 'pyramidal', 'elliptical', 'wooden', 'metallic', 'plastic', 'glass',
            'ceramic', 'stone', 'concrete', 'rubber', 'cotton', 'silk', 'woolen', 'leather', 'nylon', 'denim',
            'steel', 'iron', 'copper', 'carbon', 'fiberglass', 'porcelain', 'hot', 'cold', 'warm', 'cool',
            'icy', 'boiling', 'freezing', 'lukewarm', 'steamy', 'tepid', 'colorful', 'transparent', 'opaque', 'translucent',
            'luminous', 'brilliant', 'faded', 'rusty'
          ],
      
          emotional: [
            'tired', 'happy', 'confused', 'excited', 'sad', 'angry', 'calm', 'anxious', 'bored', 'relaxed',
            'worried', 'jealous', 'proud', 'ashamed', 'frustrated', 'surprised', 'disappointed', 'nervous', 'content', 'lonely',
            'grateful', 'peaceful', 'hopeful', 'fearful', 'terrified', 'optimistic', 'pessimistic', 'miserable', 'joyful', 'ecstatic',
            'gloomy', 'melancholic', 'furious', 'cheerful', 'moody', 'resentful', 'bitter', 'envious', 'embarrassed', 'determined',
            'curious', 'confident', 'insecure', 'enthusiastic', 'discouraged', 'motivated', 'depressed', 'elated', 'cautious', 'reckless',
            'appreciative', 'affectionate', 'aggressive', 'apathetic', 'arrogant', 'compassionate', 'cooperative', 'cruel', 'cynical', 'naive',
            'skeptical', 'selfish', 'sympathetic', 'tender', 'violent', 'vulnerable', 'eager', 'vexed', 'overwhelmed', 'restless',
            'satisfied', 'mournful', 'relieved', 'wistful', 'humiliated', 'emboldened', 'humbled', 'overjoyed', 'disgusted', 'pensive'
          ],
      
          quality: [
            'beautiful', 'young', 'quiet', 'clever', 'strong', 'intelligent', 'brave', 'honest', 'kind', 'polite',
            'gentle', 'patient', 'greedy', 'generous', 'creative', 'lazy', 'ambitious', 'curious', 'humble', 'independent',
            'reliable', 'responsible', 'efficient', 'hardworking', 'organized', 'punctual', 'flexible', 'detail-oriented', 'decisive', 'resourceful',
            'ethical', 'loyal', 'trustworthy', 'supportive', 'enthusiastic', 'artistic', 'analytical', 'logical', 'visionary', 'innovative',
            'systematic', 'methodical', 'meticulous', 'scholarly', 'charismatic', 'practical', 'adaptable', 'observant', 'persuasive', 'disciplined',
            'diligent', 'dedicated', 'inventive', 'strategic', 'reflective', 'assertive', 'tactical', 'courageous', 'empathetic', 'optimistic',
            'realistic', 'thorough', 'versatile', 'vigilant', 'zealous', 'proactive', 'collaborative', 'competitive', 'charitable', 'considerate',
            'tactful', 'unbiased', 'spontaneous', 'sincere', 'modest', 'witty', 'sensible', 'balanced', 'pragmatic', 'steadfast'
          ]
        }
      },
      
    
    adverb: {
      words: {
        manner: ['quietly', 'quickly', 'slowly', 'carefully', 'loudly'],
        time: ['yesterday', 'today', 'now', 'then'],
        frequency: ['always', 'never', 'often', 'sometimes']
      }
    },
    
    preposition: {
      words: {
        location: ['under', 'on', 'in', 'over', 'beside', 'behind', 'above', 'below', 'near'],
        direction: ['to', 'from', 'through', 'toward'],
        association: ['with', 'by', 'for']
      }
    },
    
    conjunction: {
      words: ['and', 'but', 'or', 'so', 'yet']
    }
  };
  
  // Compatibility rules - learnable weights (kept for future use)
  const compatibilityRules = {
    subject_verb: {
      'animate + requires_animate': { valid: true, confidence: 0.9 },
      'inanimate + requires_animate': { valid: false, confidence: 0.3 },
      'any + linking_verb': { valid: true, confidence: 0.95 }
    },
    verb_structure: {
      'intransitive + has_object': { valid: false, confidence: 0.2 },
      'transitive + no_object': { valid: false, confidence: 0.3 },
      'transitive + has_object': { valid: true, confidence: 0.9 },
      'linking + has_adjective': { valid: true, confidence: 0.9 },
      'linking + has_adverb': { valid: false, confidence: 0.2 },
      'linking + no_complement': { valid: false, confidence: 0.1 }
    },
    number_agreement: {
      'singular_subject + singular_verb': { valid: true, confidence: 0.95 },
      'plural_subject + plural_verb': { valid: true, confidence: 0.95 },
      'singular_subject + plural_verb': { valid: false, confidence: 0.1 },
      'plural_subject + singular_verb': { valid: false, confidence: 0.1 }
    },
    verb_preposition: {
      'gave + to': { compatibility: 0.9 },
      'studied + with': { compatibility: 0.8 },
      'looked + at': { compatibility: 0.9 },
      'walked + through': { compatibility: 0.7 },
      'put + on': { compatibility: 0.8 }
    }
  };
  
  // Grammar rules - learnable patterns
  const grammarRules = {
    pronoun_case: {
      patterns: [
        { position: 'sentence_start', required_case: 'subject', confidence: 0.95 },
        { position: 'after_verb', required_case: 'object', confidence: 0.9 },
        { position: 'before_verb', required_case: 'subject', confidence: 0.85 }
      ]
    },
    article_selection: {
      patterns: [
        { next_sound: 'vowel', article: 'an', confidence: 0.95 },
        { next_sound: 'consonant', article: 'a', confidence: 0.95 },
        { context: 'specific_reference', article: 'the', confidence: 0.8 }
      ]
    },
    word_order: {
      valid_patterns: [
        { pattern: 'subject + verb + object', score: 0.9 },
        { pattern: 'subject + verb + adjective', score: 0.85 },
        { pattern: 'adverb + subject + verb', score: 0.7 }
      ]
    }
  };
  
  // Sentence structures with learnability scores
  const sentenceStructures = [
    { pattern: ['article', 'noun', 'verb'], success_rate: 0.8, usage_count: 0 },
    { pattern: ['article', 'noun', 'verb', 'adjective'], success_rate: 0.85, usage_count: 0 },
    { pattern: ['article', 'noun', 'verb', 'article', 'noun'], success_rate: 0.75, usage_count: 0 },
    { pattern: ['pronoun', 'verb'], success_rate: 0.9, usage_count: 0 },
    { pattern: ['pronoun', 'verb', 'adjective'], success_rate: 0.85, usage_count: 0 },
    { pattern: ['article', 'adjective', 'noun', 'verb'], success_rate: 0.8, usage_count: 0 },
    { pattern: ['pronoun', 'verb', 'article', 'noun'], success_rate: 0.8, usage_count: 0 },
    { pattern: ['article', 'noun', 'verb', 'adverb'], success_rate: 0.75, usage_count: 0 },
    { pattern: ['noun', 'verb'], success_rate: 0.7, usage_count: 0 },
    { pattern: ['article', 'noun', 'verb', 'preposition', 'article', 'noun'], success_rate: 0.7, usage_count: 0 },
    { pattern: ['pronoun', 'verb', 'pronoun', 'article', 'noun'], success_rate: 0.75, usage_count: 0 },
    { pattern: ['adjective', 'noun', 'verb'], success_rate: 0.8, usage_count: 0 },
    { pattern: ['pronoun', 'verb', 'article', 'adjective', 'noun'], success_rate: 0.8, usage_count: 0 },
    { pattern: ['article', 'noun', 'verb', 'article', 'noun', 'preposition', 'article', 'noun'], success_rate: 0.6, usage_count: 0 },
    { pattern: ['pronoun', 'verb', 'adverb'], success_rate: 0.85, usage_count: 0 },
    { pattern: ['article', 'adjective', 'noun', 'verb', 'article', 'adjective', 'noun'], success_rate: 0.7, usage_count: 0 }
  ];
  
  // Learning statistics - will be updated based on feedback
  const learningStats = {
    word_success_rates: {},
    pattern_success_rates: {},
    rule_confidence_updates: {},
    user_feedback_history: []
  };
  
  // **New**: Maintain a score for every word (default 1.0)
  const wordScores = {};
  

  export {
    dictionary,
    compatibilityRules,
    grammarRules,
    sentenceStructures,
    learningStats,
    wordScores
  };
