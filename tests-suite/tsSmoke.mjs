// SPDX-License-Identifier: Apache-2.0
/*
Copyright 2025-2026 Dusty Wilhelm Murray (Semantic Tools)

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0
*/

/*
Happy-path smoke tests against real providers. Each provider's tests are
registered ONLY when its env var is present, so this file runs cleanly
without any keys (everything just gets skipped).

To exercise a provider, set its key before running:
   OPENAI_API_KEY=...     OPENAI
   ANTHROPIC_API_KEY=...  ANTHROPIC
   GEMINI_API_KEY=...     GEMINI
   MISTRAL_API_KEY=...    MISTRAL
   GROK_API_KEY=...       GROK
   OLLAMA_API_BASE=...    OLLAMA  (URL, not a key)
*/

import * as llAmiga from '../src/index.mjs';
import { test, expect } from './testUtils.mjs';

const PROVIDERS = [
  { id: 'openai',    envVar: 'OPENAI_API_KEY' },
  { id: 'anthropic', envVar: 'ANTHROPIC_API_KEY' },
  { id: 'gemini',    envVar: 'GEMINI_API_KEY' },
  { id: 'mistral',   envVar: 'MISTRAL_API_KEY' },
  { id: 'grok',      envVar: 'GROK_API_KEY' },
  { id: 'ollama',    envVar: 'OLLAMA_API_BASE' },
];

const available = PROVIDERS.filter(p => process.env[p.envVar]);
const skipped = PROVIDERS.filter(p => !process.env[p.envVar]);

console.log("\n--- Smoke test plan ---");
for (const p of available) console.log(`   ✓ ${p.id.padEnd(10)} — ${p.envVar} present`);
for (const p of skipped)   console.log(`   ⏭  ${p.id.padEnd(10)} — ${p.envVar} not set, skipping`);
console.log();

for (const provider of available) {
  // Each test sticks to a single deterministic prompt to keep token cost minimal.

  test(`smoke[${provider.id}]: ask returns success + non-empty text`, async () => {
    const session = llAmiga.createSession(provider.id);
    const response = await session.ask("Reply with exactly the word: pong");
    expect.toEqual(response.success, true);
    if (typeof response.text !== 'string' || response.text.length === 0) {
      throw new Error(`expected non-empty string, got ${JSON.stringify(response.text)}`);
    }
  });

  test(`smoke[${provider.id}]: response carries pluginName and model`, async () => {
    const session = llAmiga.createSession(provider.id);
    const response = await session.ask("Reply with exactly the word: pong");
    if (typeof response.pluginName !== 'string') throw new Error('pluginName missing');
    if (typeof response.model !== 'string') throw new Error('model missing');
  });

  test(`smoke[${provider.id}]: response carries retries count`, async () => {
    const session = llAmiga.createSession(provider.id);
    const response = await session.ask("Reply with exactly the word: pong");
    if (typeof response.retries !== 'number' || response.retries < 0) {
      throw new Error(`expected non-negative retries, got ${response.retries}`);
    }
  });

  test(`smoke[${provider.id}]: chat() with history works`, async () => {
    const session = llAmiga.createSession(provider.id);
    const r1 = await session.chat("Remember the number 42. Reply OK.");
    expect.toEqual(r1.success, true);
    const r2 = await session.chat("What number did I ask you to remember? Reply with the number only.");
    expect.toEqual(r2.success, true);
    if (typeof r2.text !== 'string' || r2.text.length === 0) {
      throw new Error('empty follow-up response');
    }
  });

  test(`smoke[${provider.id}]: session-wide retry config flows through (no errors expected)`, async () => {
    const session = llAmiga.createSession(provider.id);
    // Set an aggressive retry config that should have no effect on a happy path.
    session.setConfig({ retry: { maxAttempts: 2, baseMs: 100 } });
    const response = await session.ask("Reply with exactly the word: pong");
    expect.toEqual(response.success, true);
    expect.toEqual(response.retries, 0);   // no retries needed on happy path
  });
}

// --- Run all tests ---

if (available.length === 0) {
  console.log("--- No provider env vars present; nothing to run. ---\n");
  process.exit(0);
}

console.log(`--- Running smoke tests for: ${available.map(p => p.id).join(', ')} ---\n`);

let passed = 0, failed = 0;
for (let { name, fn } of test.cases) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`);
    failed++;
  }
}

console.log(`\n--- ${passed} passed, ${failed} failed (${skipped.length} provider${skipped.length === 1 ? '' : 's'} skipped) ---\n`);
process.exit(failed > 0 ? 1 : 0);
