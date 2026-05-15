// SPDX-License-Identifier: Apache-2.0
/*
Copyright 2025-2026 Dusty Wilhelm Murray (Semantic Tools)

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0
*/

/*
End-to-end integration tests for the four-layer retry/config merge:
   library defaults → plugin.defaultRetry → setConfig({})
                    → setConfig(plugin, {}) → setConfig(plugin, model, {})

testbert1 uses withRetry internally and honors `config.simulateError`, so
behavior tests can drive real retries without hitting any external API.
testbert2 exports defaultRetry={baseMs:777} to make the plugin layer
observable in merge-output tests.
*/

import * as llAmiga from '../src/index.mjs';
import { RETRY_DEFAULTS } from '../src/llm/common/retry.mjs';
import { test, expect } from './testUtils.mjs';

function ask(session, prompt = "hi", overrideConfig) {
  // pulse config.captureMergedRetry through to the plugin so we can inspect.
  return session.ask(overrideConfig ? prompt : prompt);
}

// --- Layer 1: library defaults arrive when nothing is configured ---

test("library defaults arrive at plugin when no config set", async () => {
  const session = llAmiga.createSession('testbert1');
  session.setConfig('testbert1', { captureMergedRetry: true });

  const result = await session.ask("hi");
  expect.toEqual(result.capturedRetry.maxAttempts, RETRY_DEFAULTS.maxAttempts);
  expect.toEqual(result.capturedRetry.baseMs, RETRY_DEFAULTS.baseMs);
  expect.toEqual(result.capturedRetry.backoff, RETRY_DEFAULTS.backoff);
});

// --- Layer 2: plugin.defaultRetry overrides library defaults ---

test("plugin.defaultRetry layered on top of library defaults", async () => {
  // testbert2 exports defaultRetry = { baseMs: 777 }
  const session = llAmiga.createSession('testbert2');
  session.setConfig('testbert2', { captureMergedRetry: true });

  const result = await session.ask("hi");
  expect.toEqual(result.capturedRetry.baseMs, 777);
  // other fields fall through from library defaults
  expect.toEqual(result.capturedRetry.maxAttempts, RETRY_DEFAULTS.maxAttempts);
});

test("testbert1 has empty defaultRetry → library defaults visible", async () => {
  const session = llAmiga.createSession('testbert1');
  session.setConfig('testbert1', { captureMergedRetry: true });

  const result = await session.ask("hi");
  expect.toEqual(result.capturedRetry.baseMs, RETRY_DEFAULTS.baseMs);
});

// --- Layer 3: session-wide setConfig (1-arg form) ---

test("session-wide setConfig({retry}) applies to plugin", async () => {
  const session = llAmiga.createSession('testbert1');
  session.setConfig({ retry: { maxAttempts: 7 } });
  // also turn on capture (per-plugin) so we can inspect
  session.setConfig('testbert1', { captureMergedRetry: true });

  const result = await session.ask("hi");
  expect.toEqual(result.capturedRetry.maxAttempts, 7);
  // other fields carry through
  expect.toEqual(result.capturedRetry.baseMs, RETRY_DEFAULTS.baseMs);
});

test("session-wide setConfig applies to ALL plugins in session", async () => {
  const session = llAmiga.createSession(['testbert1', 'testbert2']);
  session.setConfig({ retry: { maxAttempts: 9 } });
  // capture flag on both
  session.setConfig('testbert1', { captureMergedRetry: true });
  session.setConfig('testbert2', { captureMergedRetry: true });

  const r1 = await session.ask('testbert1', "hi");
  const r2 = await session.ask('testbert2', "hi");
  expect.toEqual(r1.capturedRetry.maxAttempts, 9);
  expect.toEqual(r2.capturedRetry.maxAttempts, 9);
});

// --- Layer 4: plugin-wide setConfig (2-arg) overrides session-wide ---

test("plugin-wide setConfig overrides session-wide", async () => {
  const session = llAmiga.createSession('testbert1');
  session.setConfig({ retry: { maxAttempts: 7 } });
  session.setConfig('testbert1', { captureMergedRetry: true, retry: { maxAttempts: 11 } });

  const result = await session.ask("hi");
  expect.toEqual(result.capturedRetry.maxAttempts, 11);
});

test("plugin-wide setConfig: different plugins keep their own scope", async () => {
  const session = llAmiga.createSession(['testbert1', 'testbert2']);
  session.setConfig({ retry: { maxAttempts: 7 } });
  session.setConfig('testbert1', { captureMergedRetry: true, retry: { maxAttempts: 11 } });
  session.setConfig('testbert2', { captureMergedRetry: true });   // no plugin override → inherits session-wide

  const r1 = await session.ask('testbert1', "hi");
  const r2 = await session.ask('testbert2', "hi");
  expect.toEqual(r1.capturedRetry.maxAttempts, 11);
  expect.toEqual(r2.capturedRetry.maxAttempts, 7);
});

// --- Layer 5: plugin+model setConfig (3-arg) overrides plugin-wide ---

test("plugin+model setConfig overrides plugin-wide", async () => {
  const session = llAmiga.createSession('testbert1');
  session.setConfig('testbert1', { captureMergedRetry: true, retry: { maxAttempts: 11 } });
  session.setConfig('testbert1', 'special', { captureMergedRetry: true, retry: { maxAttempts: 22 } });

  // explicit specs to force the 'special' model on this call
  const result = await session.ask('testbert1::special', "hi");
  expect.toEqual(result.capturedRetry.maxAttempts, 22);
});

test("plugin+model: different models keep their own scope", async () => {
  const session = llAmiga.createSession('testbert1');
  session.setConfig('testbert1', { captureMergedRetry: true, retry: { maxAttempts: 11 } });
  session.setConfig('testbert1', 'special-model', { captureMergedRetry: true, retry: { maxAttempts: 22 } });

  const rDefault = await session.ask("hi");
  const rSpecial = await session.ask('testbert1::special-model', "hi");
  expect.toEqual(rDefault.capturedRetry.maxAttempts, 11);
  expect.toEqual(rSpecial.capturedRetry.maxAttempts, 22);
});

// --- carry-through across multiple layers ---

test("carry-through: unset fields fall through from earlier layers", async () => {
  const session = llAmiga.createSession('testbert1');
  session.setConfig({ retry: { maxAttempts: 8, baseMs: 50 } });            // sets two fields
  session.setConfig('testbert1', { captureMergedRetry: true, retry: { maxMs: 999 } });   // sets only maxMs

  const result = await session.ask("hi");
  expect.toEqual(result.capturedRetry.maxAttempts, 8);    // from session-wide
  expect.toEqual(result.capturedRetry.baseMs, 50);        // from session-wide
  expect.toEqual(result.capturedRetry.maxMs, 999);        // from plugin-wide
});

// --- retry: false short-circuits ---

test("retry: false at session-wide disables retries entirely", async () => {
  const session = llAmiga.createSession('testbert1');
  session.setConfig({ retry: false });
  session.setConfig('testbert1', {
    simulateError: { code: 'RATE_LIMIT', failCount: 5 },   // would otherwise retry up to 3x
  });

  let threw = false;
  try {
    await session.ask("hi");
  } catch (e) {
    threw = true;
    expect.toEqual(e.code, 'RATE_LIMIT');
  }
  expect.toEqual(threw, true);
});

test("retry: false at plugin-wide disables retries entirely", async () => {
  const session = llAmiga.createSession('testbert1');
  session.setConfig('testbert1', {
    retry: false,
    simulateError: { code: 'RATE_LIMIT', failCount: 5 },
  });

  let threw = false;
  try { await session.ask("hi"); } catch (e) { threw = true; }
  expect.toEqual(threw, true);
});

// --- end-to-end retry behavior ---

test("end-to-end: RATE_LIMIT recovers after retries", async () => {
  const session = llAmiga.createSession('testbert1');
  session.setConfig('testbert1', {
    retry: { maxAttempts: 5, backoff: 'fixed', baseMs: 1, jitter: false, honorRetryAfter: false },
    simulateError: { code: 'RATE_LIMIT', failCount: 2 },   // fail twice, succeed on 3rd
  });

  const result = await session.ask("hi");
  expect.toEqual(result.success, true);
  expect.toEqual(result.retries, 2);
});

test("end-to-end: maxAttempts=1 surfaces RATE_LIMIT without retry", async () => {
  const session = llAmiga.createSession('testbert1');
  session.setConfig('testbert1', {
    retry: { maxAttempts: 1, backoff: 'fixed', baseMs: 1, jitter: false, honorRetryAfter: false },
    simulateError: { code: 'RATE_LIMIT', failCount: 99 },
  });

  let caught = null;
  try { await session.ask("hi"); } catch (e) { caught = e; }
  expect.toEqual(caught.code, 'RATE_LIMIT');
});

test("end-to-end: AUTH fails fast even with high maxAttempts", async () => {
  const session = llAmiga.createSession('testbert1');
  session.setConfig('testbert1', {
    retry: { maxAttempts: 10, backoff: 'fixed', baseMs: 1, jitter: false, honorRetryAfter: false },
    simulateError: { code: 'AUTH' },
  });

  let caught = null;
  const start = Date.now();
  try { await session.ask("hi"); } catch (e) { caught = e; }
  const elapsed = Date.now() - start;

  expect.toEqual(caught.code, 'AUTH');
  // No retries → no sleeps. Should complete in well under 50ms.
  if (elapsed > 50) throw new Error(`AUTH retried (elapsed ${elapsed}ms)`);
});

test("end-to-end: SERVER recovers after retries", async () => {
  const session = llAmiga.createSession('testbert1');
  session.setConfig('testbert1', {
    retry: { maxAttempts: 3, backoff: 'fixed', baseMs: 1, jitter: false, honorRetryAfter: false },
    simulateError: { code: 'SERVER', failCount: 1 },
  });

  const result = await session.ask("hi");
  expect.toEqual(result.success, true);
  expect.toEqual(result.retries, 1);
});

// --- onRetry hook fires through the full session path ---

test("end-to-end: onRetry hook fires with classified error", async () => {
  const events = [];
  const session = llAmiga.createSession('testbert1');
  session.setConfig('testbert1', {
    retry: {
      maxAttempts: 4, backoff: 'fixed', baseMs: 1, jitter: false, honorRetryAfter: false,
      onRetry: ({ attempt, error }) => events.push({ attempt, code: error.code }),
    },
    simulateError: { code: 'RATE_LIMIT', failCount: 2 },
  });

  await session.ask("hi");
  expect.toEqual(events.length, 2);
  expect.toEqual(events[0].code, 'RATE_LIMIT');
  expect.toEqual(events[1].attempt, 2);
});

// --- getConfig fallback chain ---

test("getConfig() returns sessionConfig when set via 1-arg", async () => {
  const session = llAmiga.createSession('testbert1');
  session.setConfig({ retry: { maxAttempts: 4 } });
  const cfg = session.getConfig();
  expect.toEqual(cfg.retry.maxAttempts, 4);
});

test("getConfig(plugin) falls back through pluginDefault → sessionConfig", async () => {
  const session = llAmiga.createSession('testbert1');
  session.setConfig({ retry: { maxAttempts: 4 } });
  // no plugin-scoped config set
  const cfg = session.getConfig('testbert1');
  // should fall back to sessionConfig
  expect.toEqual(cfg.retry.maxAttempts, 4);
});

test("getConfig(plugin, model) falls back through model → default → session", async () => {
  const session = llAmiga.createSession('testbert1');
  session.setConfig({ retry: { maxAttempts: 4 } });
  session.setConfig('testbert1', { retry: { maxAttempts: 5 } });
  // no model-specific override
  const cfg = session.getConfig('testbert1', 'some-model');
  expect.toEqual(cfg.retry.maxAttempts, 5);
});

// --- clearConfig arity ---

test("clearConfig() clears session-wide", async () => {
  const session = llAmiga.createSession('testbert1');
  session.setConfig({ retry: { maxAttempts: 4 } });
  session.clearConfig();
  expect.toEqual(session.getConfig(), undefined);
});

test("clearConfig() does NOT clear plugin-scoped", async () => {
  const session = llAmiga.createSession('testbert1');
  session.setConfig({ retry: { maxAttempts: 4 } });
  session.setConfig('testbert1', { retry: { maxAttempts: 7 } });
  session.clearConfig();   // clear session-wide only
  // plugin-scoped survives
  const cfg = session.getConfig('testbert1');
  expect.toEqual(cfg.retry.maxAttempts, 7);
});

test("clearConfig(plugin) clears plugin-scoped only", async () => {
  const session = llAmiga.createSession('testbert1');
  session.setConfig({ retry: { maxAttempts: 4 } });
  session.setConfig('testbert1', { retry: { maxAttempts: 7 } });
  session.clearConfig('testbert1');
  // session-wide survives → getConfig('testbert1') falls back to it
  const cfg = session.getConfig('testbert1');
  expect.toEqual(cfg.retry.maxAttempts, 4);
});

// --- framework + session injection in every form ---

test("setConfig({...}) 1-arg form injects framework + session", async () => {
  const session = llAmiga.createSession('testbert1');
  session.setConfig({ retry: { maxAttempts: 4 } });
  const cfg = session.getConfig();
  if (!cfg.framework) throw new Error('framework not injected');
  if (cfg.session !== session) throw new Error('session not injected');
});

test("setConfig(plugin, {...}) injects framework + session", async () => {
  const session = llAmiga.createSession('testbert1');
  session.setConfig('testbert1', { retry: { maxAttempts: 4 } });
  const cfg = session.getConfig('testbert1');
  if (!cfg.framework) throw new Error('framework not injected');
  if (cfg.session !== session) throw new Error('session not injected');
});

test("setConfig(plugin, model, {...}) injects framework + session", async () => {
  const session = llAmiga.createSession('testbert1');
  session.setConfig('testbert1', 'm1', { retry: { maxAttempts: 4 } });
  const cfg = session.getConfig('testbert1', 'm1');
  if (!cfg.framework) throw new Error('framework not injected');
  if (cfg.session !== session) throw new Error('session not injected');
});

// --- validation ---

test("setConfig({}) with bad retry throws at setConfig time", async () => {
  const session = llAmiga.createSession('testbert1');
  let threw = false;
  try {
    session.setConfig({ retry: { maxAttempts: 'five' } });
  } catch (e) {
    threw = true;
    expect.toContain(e.message, 'maxAttempts');
  }
  expect.toEqual(threw, true);
});

test("setConfig(plugin, {...}) with bad retry throws", async () => {
  const session = llAmiga.createSession('testbert1');
  let threw = false;
  try {
    session.setConfig('testbert1', { retry: { backoff: 'linear' } });
  } catch (e) {
    threw = true;
    expect.toContain(e.message, 'backoff');
  }
  expect.toEqual(threw, true);
});

test("setConfig with non-object first arg throws", async () => {
  const session = llAmiga.createSession('testbert1');
  let threw = false;
  try {
    session.setConfig(42);
  } catch (e) { threw = true; }
  expect.toEqual(threw, true);
});

// --- chain mode still blocks ---

test("setConfig({}) throws in chain mode", async () => {
  const session = llAmiga.createSession('testbert1');
  let threw = false;
  try {
    session.chain().setConfig({ retry: {} });
  } catch (e) {
    threw = true;
    expect.toContain(e.message, 'chain mode');
  }
  expect.toEqual(threw, true);
});

// --- Run all tests ---

console.log("\n--- Running merge-chain integration tests ---\n");

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

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
process.exit(failed > 0 ? 1 : 0);
