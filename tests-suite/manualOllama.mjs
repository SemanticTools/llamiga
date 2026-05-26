// SPDX-License-Identifier: Apache-2.0
/*
Copyright 2025-2026 Dusty Wilhelm Murray (Semantic Tools)

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0
*/

/*
Manual Ollama smoke test.

Run with:  source .env; node tests-suite/manualOllama.mjs

Verifies:
  - OLLAMA_API_BASE / OLLAMA_API_KEY are picked up correctly
  - A plain ask() call goes through (proxy auth works if OLLAMA_API_KEY set)
  - A two-turn chat() preserves history
  - Error classification surfaces in a recognizable shape

Configurable via env:
  OLLAMA_TEST_MODEL  — model name to use (defaults to plugin's getDefaultModel())
*/

import * as llAmiga from '../src/index.mjs';

function fmt(obj) {
  return JSON.stringify(obj, (_k, v) => (typeof v === 'function' ? '[function]' : v), 2);
}

// --- env snapshot ---

console.log('--- Env ---');
console.log('  OLLAMA_API_BASE :', process.env.OLLAMA_API_BASE
  ? process.env.OLLAMA_API_BASE
  : '(not set — plugin will fail)');
console.log('  OLLAMA_API_KEY  :', process.env.OLLAMA_API_KEY
  ? '(present, ' + process.env.OLLAMA_API_KEY.length + ' chars — sent as Authorization: Bearer)'
  : '(not set — no Authorization header sent)');
const TEST_MODEL = process.env.OLLAMA_TEST_MODEL;
console.log('  OLLAMA_TEST_MODEL:', TEST_MODEL || '(not set — using plugin default)');
console.log();

if (!process.env.OLLAMA_API_BASE) {
  console.error('OLLAMA_API_BASE must be set. Aborting.');
  process.exit(1);
}

// --- create session ---

// NOTE: createSession('ollama::<model>') has a pre-existing quirk where the model
// from the spec gets overridden by the plugin's default. Workaround: setLM after.
// See plan/TECHNICALDEBT.md for details.
const spec = TEST_MODEL ? `ollama::${TEST_MODEL}` : 'ollama';
const session = llAmiga.createSession('ollama');
session.setLM(spec);
console.log('Session created, provider:', session.getProviderName(), 'model:', session.getModel());
console.log();

function printError(e) {
  console.error('  ❌ threw  :', e.message);
  console.error('  code     :', e.code);
  console.error('  status   :', e.status);
  console.error('  provider :', e.provider);
  if (e.raw?.headers) console.error('  headers  :', fmt(e.raw.headers));
  if (e.raw?.responseBody !== undefined && e.raw?.responseBody !== null) {
    const body = e.raw.responseBody;
    const printable = typeof body === 'string' ? body : fmt(body);
    console.error('  body     :', printable.length > 500 ? printable.slice(0, 500) + '...(truncated)' : printable);
  }
  // Walk the .cause chain — undici wraps the real error one level deep.
  let c = e.cause;
  let depth = 1;
  while (c && depth < 6) {
    const detail = [
      c.message || '(no message)',
      c.code ? `code=${c.code}` : '',
      c.errno !== undefined ? `errno=${c.errno}` : '',
      c.syscall ? `syscall=${c.syscall}` : '',
      c.address ? `addr=${c.address}` : '',
      c.port !== undefined ? `port=${c.port}` : '',
    ].filter(Boolean).join('  ');
    console.error(`  cause[${depth}] :`, detail);
    c = c.cause;
    depth++;
  }
}

// --- Test 1: plain ask ---

console.log('--- Test 1: ask("What is 2+2? Reply with one digit only.") ---');
try {
  const r = await session.ask('What is 2+2? Reply with one digit only.');
  console.log('  success      :', r.success);
  console.log('  text         :', JSON.stringify(r.text));
  console.log('  model        :', r.model);
  console.log('  pluginName   :', r.pluginName);
  console.log('  retries      :', r.retries);
  console.log('  totalTokens  :', r.totalTokens);
  console.log('  elapsedMS    :', r.elapsedMS);
} catch (e) {
  printError(e);
}
console.log();

// --- Test 2: two-turn chat (history preserved) ---

console.log('--- Test 2: chat() two turns, second turn relies on first ---');
const chatSession = llAmiga.createSession('ollama');
chatSession.setLM(spec);
try {
  const r1 = await chatSession.chat('Remember the number 42. Reply with just OK.');
  console.log('  turn 1 text:', JSON.stringify(r1.text));
  const r2 = await chatSession.chat('What number did I ask you to remember? Reply only the number.');
  console.log('  turn 2 text:', JSON.stringify(r2.text));
  console.log('  → if turn 2 contains "42" the history is being sent correctly');
} catch (e) {
  printError(e);
}
console.log();

// --- Test 3: error path — bad model ---

console.log('--- Test 3: deliberately bad model (should classify cleanly) ---');
const badSession = llAmiga.createSession('ollama');
badSession.setLM('ollama::definitely-not-a-real-model-xyz123');
try {
  const r = await badSession.ask('hi');
  console.log('  unexpectedly succeeded:', r.text);
} catch (e) {
  console.error('  threw (expected):');
  printError(e);
}
console.log();

console.log('--- Done ---');
