// SPDX-License-Identifier: Apache-2.0
/*
Copyright 2025-2026 Dusty Wilhelm Murray (Semantic Tools)

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0
*/

import { withRetry, mergeRetry, validateRetry, RETRY_DEFAULTS } from '../src/llm/common/retry.mjs';
import { test, expect } from './testUtils.mjs';

// Construct a classified-error-shaped Error
function err(code, opts = {}) {
  const e = new Error(opts.message || `${code} error`);
  e.code = code;
  e.status = opts.status ?? null;
  e.provider = opts.provider || 'Test';
  if (opts.headers) e.raw = { headers: opts.headers, responseBody: opts.body || {} };
  return e;
}

// Fast test opts: minimal delays + no jitter for determinism.
const FAST = {
  maxAttempts: 3,
  backoff: 'fixed',
  baseMs: 1,
  maxMs: 10,
  jitter: false,
  honorRetryAfter: false,
  retryOn: ['RATE_LIMIT', 'SERVER', 'NETWORK'],
  totalTimeoutMs: null,
  onRetry: null,
};

// --- success path ---

test("withRetry returns value on first success", async () => {
  let calls = 0;
  const result = await withRetry(async () => { calls++; return { ok: true }; }, FAST);
  expect.toEqual(result.ok, true);
  expect.toEqual(calls, 1);
});

test("withRetry passes {attempt} to fn (starts at 1)", async () => {
  let captured = null;
  await withRetry(async ({ attempt }) => { captured = attempt; return 'ok'; }, FAST);
  expect.toEqual(captured, 1);
});

test("withRetry passes incrementing attempt on each retry", async () => {
  const attempts = [];
  await withRetry(async ({ attempt }) => {
    attempts.push(attempt);
    if (attempt < 3) throw err('RATE_LIMIT');
    return 'done';
  }, FAST);
  expect.toEqual(attempts.join(','), '1,2,3');
});

test("withRetry retries on RATE_LIMIT and succeeds", async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls++;
    if (calls < 3) throw err('RATE_LIMIT');
    return 'ok';
  }, FAST);
  expect.toEqual(result, 'ok');
  expect.toEqual(calls, 3);
});

test("withRetry retries on SERVER", async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls++;
    if (calls < 2) throw err('SERVER');
    return 'ok';
  }, FAST);
  expect.toEqual(calls, 2);
});

test("withRetry retries on NETWORK", async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls++;
    if (calls < 2) throw err('NETWORK');
    return 'ok';
  }, FAST);
  expect.toEqual(calls, 2);
});

// --- no retry on AUTH / QUOTA / CLIENT ---

test("withRetry does NOT retry on AUTH", async () => {
  let calls = 0;
  await expect.toThrow(async () => {
    await withRetry(async () => { calls++; throw err('AUTH'); }, FAST);
  }, 'AUTH error');
  expect.toEqual(calls, 1);
});

test("withRetry does NOT retry on QUOTA_EXHAUSTED", async () => {
  let calls = 0;
  await expect.toThrow(async () => {
    await withRetry(async () => { calls++; throw err('QUOTA_EXHAUSTED'); }, FAST);
  }, 'QUOTA_EXHAUSTED');
  expect.toEqual(calls, 1);
});

test("withRetry does NOT retry on CLIENT", async () => {
  let calls = 0;
  await expect.toThrow(async () => {
    await withRetry(async () => { calls++; throw err('CLIENT'); }, FAST);
  }, 'CLIENT error');
  expect.toEqual(calls, 1);
});

// --- exhaustion throws the LAST classified error ---

test("withRetry throws last classified error on exhaustion", async () => {
  let lastThrown = null;
  try {
    await withRetry(async () => {
      const e = err('RATE_LIMIT', { message: 'rate limited' });
      lastThrown = e;
      throw e;
    }, FAST);
  } catch (caught) {
    expect.toEqual(caught.code, 'RATE_LIMIT');
    expect.toEqual(caught, lastThrown);
  }
});

test("withRetry maxAttempts: 3 calls fn exactly 3 times then throws", async () => {
  let calls = 0;
  try {
    await withRetry(async () => { calls++; throw err('SERVER'); }, FAST);
  } catch (_) {}
  expect.toEqual(calls, 3);
});

test("withRetry maxAttempts: 1 calls fn exactly once", async () => {
  let calls = 0;
  try {
    await withRetry(async () => { calls++; throw err('SERVER'); }, { ...FAST, maxAttempts: 1 });
  } catch (_) {}
  expect.toEqual(calls, 1);
});

test("withRetry maxAttempts: 5 calls fn up to 5 times", async () => {
  let calls = 0;
  try {
    await withRetry(async () => { calls++; throw err('SERVER'); }, { ...FAST, maxAttempts: 5 });
  } catch (_) {}
  expect.toEqual(calls, 5);
});

// --- retryOn customization ---

test("withRetry retryOn empty array → never retries", async () => {
  let calls = 0;
  try {
    await withRetry(async () => { calls++; throw err('RATE_LIMIT'); }, { ...FAST, retryOn: [] });
  } catch (_) {}
  expect.toEqual(calls, 1);
});

test("withRetry retryOn includes CLIENT → retries CLIENT", async () => {
  let calls = 0;
  try {
    await withRetry(async () => { calls++; throw err('CLIENT'); }, { ...FAST, retryOn: ['CLIENT'] });
  } catch (_) {}
  expect.toEqual(calls, 3);
});

// --- retry: false disables ---

test("withRetry retry: false runs fn once and rethrows", async () => {
  let calls = 0;
  try {
    await withRetry(async () => { calls++; throw err('RATE_LIMIT'); }, false);
  } catch (caught) {
    expect.toEqual(caught.code, 'RATE_LIMIT');
  }
  expect.toEqual(calls, 1);
});

test("withRetry retry: false success path returns value", async () => {
  const result = await withRetry(async () => 'ok', false);
  expect.toEqual(result, 'ok');
});

// --- onRetry hook ---

test("withRetry calls onRetry between attempts with attempt/error/delayMs", async () => {
  const events = [];
  let calls = 0;
  try {
    await withRetry(async () => {
      calls++;
      throw err('RATE_LIMIT', { message: 'slow' });
    }, {
      ...FAST,
      onRetry: ({ attempt, error, delayMs }) => events.push({ attempt, code: error.code, delayMs }),
    });
  } catch (_) {}
  // onRetry fires before each sleep, so for maxAttempts=3 there are 2 retries → 2 events
  expect.toEqual(events.length, 2);
  expect.toEqual(events[0].attempt, 1);
  expect.toEqual(events[0].code, 'RATE_LIMIT');
  expect.toEqual(events[1].attempt, 2);
});

test("withRetry onRetry not called when fn succeeds first try", async () => {
  let called = false;
  await withRetry(async () => 'ok', {
    ...FAST,
    onRetry: () => { called = true; },
  });
  expect.toEqual(called, false);
});

test("withRetry onRetry not called on final failure (no retry happens after last attempt)", async () => {
  let count = 0;
  try {
    await withRetry(async () => { throw err('RATE_LIMIT'); }, {
      ...FAST,
      maxAttempts: 2,
      onRetry: () => { count++; },
    });
  } catch (_) {}
  // maxAttempts:2 → 1 retry → 1 onRetry event
  expect.toEqual(count, 1);
});

test("withRetry onRetry failures are swallowed (loop continues)", async () => {
  let calls = 0;
  try {
    await withRetry(async () => {
      calls++;
      throw err('RATE_LIMIT');
    }, {
      ...FAST,
      onRetry: () => { throw new Error('hook boom'); },
    });
  } catch (_) {}
  expect.toEqual(calls, 3);  // still ran all 3 attempts
});

// --- totalTimeoutMs ---

test("withRetry totalTimeoutMs aborts before next sleep if budget exceeded", async () => {
  let calls = 0;
  const start = Date.now();
  try {
    await withRetry(async () => { calls++; throw err('RATE_LIMIT'); }, {
      ...FAST,
      maxAttempts: 10,
      baseMs: 50,
      totalTimeoutMs: 30,
    });
  } catch (_) {}
  const elapsed = Date.now() - start;
  // Should bail very quickly — fewer than 10 attempts
  if (calls >= 10) throw new Error(`Expected early exit, got ${calls} calls in ${elapsed}ms`);
});

// --- honorRetryAfter ---

test("withRetry honorRetryAfter reads numeric seconds from header", async () => {
  let delayUsed = null;
  let calls = 0;
  try {
    await withRetry(async () => {
      calls++;
      throw err('RATE_LIMIT', { headers: { 'retry-after': '0.005' } });   // 5ms
    }, {
      ...FAST,
      honorRetryAfter: true,
      baseMs: 10000,                 // would be much longer without header
      maxMs: 30000,
      maxAttempts: 2,
      onRetry: ({ delayMs }) => { delayUsed = delayMs; },
    });
  } catch (_) {}
  // Header said 5ms; baseMs would have been 10s. Header wins (capped at maxMs).
  if (delayUsed === null) throw new Error('onRetry did not fire');
  if (delayUsed > 100) throw new Error(`Expected header delay ~5ms, got ${delayUsed}ms`);
});

test("withRetry honorRetryAfter capped at maxMs", async () => {
  let delayUsed = null;
  try {
    await withRetry(async () => {
      throw err('RATE_LIMIT', { headers: { 'retry-after': '9999' } });  // 9999 seconds
    }, {
      ...FAST,
      honorRetryAfter: true,
      maxMs: 50,
      maxAttempts: 2,
      onRetry: ({ delayMs }) => { delayUsed = delayMs; },
    });
  } catch (_) {}
  expect.toEqual(delayUsed, 50);
});

test("withRetry honorRetryAfter: false ignores the header", async () => {
  let delayUsed = null;
  try {
    await withRetry(async () => {
      throw err('RATE_LIMIT', { headers: { 'retry-after': '0.001' } });
    }, {
      ...FAST,
      honorRetryAfter: false,
      backoff: 'fixed',
      baseMs: 10,
      maxAttempts: 2,
      onRetry: ({ delayMs }) => { delayUsed = delayMs; },
    });
  } catch (_) {}
  // Header ignored — should be ~10ms (the configured baseMs).
  expect.toEqual(delayUsed, 10);
});

// --- mergeRetry ---

test("mergeRetry returns library defaults when no layers", () => {
  const m = mergeRetry();
  expect.toEqual(m.maxAttempts, RETRY_DEFAULTS.maxAttempts);
  expect.toEqual(m.baseMs, RETRY_DEFAULTS.baseMs);
});

test("mergeRetry: later layers override earlier ones", () => {
  const m = mergeRetry({ maxAttempts: 5 }, { maxAttempts: 10 });
  expect.toEqual(m.maxAttempts, 10);
});

test("mergeRetry: carry-through across layers (unset fields keep prior value)", () => {
  const m = mergeRetry({ maxAttempts: 5, baseMs: 500 }, { maxAttempts: 10 });
  expect.toEqual(m.maxAttempts, 10);
  expect.toEqual(m.baseMs, 500);
});

test("mergeRetry: undefined/null layers are skipped", () => {
  const m = mergeRetry(undefined, { maxAttempts: 7 }, null, { baseMs: 99 });
  expect.toEqual(m.maxAttempts, 7);
  expect.toEqual(m.baseMs, 99);
});

test("mergeRetry: false at any layer short-circuits to false", () => {
  const m = mergeRetry({ maxAttempts: 5 }, false, { maxAttempts: 10 });
  expect.toEqual(m, false);
});

test("mergeRetry: validates each layer (throws on bad input)", () => {
  let threw = false;
  try {
    mergeRetry({ maxAttempts: 'five' });
  } catch (e) {
    threw = true;
    expect.toContain(e.message, 'maxAttempts');
  }
  expect.toEqual(threw, true);
});

// --- validateRetry ---

test("validateRetry: empty/undefined/null/false are valid", () => {
  validateRetry(undefined);
  validateRetry(null);
  validateRetry(false);
  validateRetry({});
});

test("validateRetry: rejects non-object", () => {
  let threw = false;
  try { validateRetry('foo'); } catch (e) { threw = true; expect.toContain(e.message, 'expected object'); }
  expect.toEqual(threw, true);
});

test("validateRetry: rejects unknown keys", () => {
  let threw = false;
  try { validateRetry({ bogus: 1 }); } catch (e) { threw = true; expect.toContain(e.message, 'unknown key'); }
  expect.toEqual(threw, true);
});

test("validateRetry: rejects bad maxAttempts", () => {
  let threw = false;
  try { validateRetry({ maxAttempts: 0 }); } catch (e) { threw = true; }
  expect.toEqual(threw, true);

  threw = false;
  try { validateRetry({ maxAttempts: -1 }); } catch (e) { threw = true; }
  expect.toEqual(threw, true);

  threw = false;
  try { validateRetry({ maxAttempts: 'five' }); } catch (e) { threw = true; }
  expect.toEqual(threw, true);
});

test("validateRetry: rejects bad backoff", () => {
  let threw = false;
  try { validateRetry({ backoff: 'linear' }); } catch (e) { threw = true; }
  expect.toEqual(threw, true);
});

test("validateRetry: rejects negative baseMs/maxMs", () => {
  let threw = false;
  try { validateRetry({ baseMs: -1 }); } catch (e) { threw = true; }
  expect.toEqual(threw, true);

  threw = false;
  try { validateRetry({ maxMs: -1 }); } catch (e) { threw = true; }
  expect.toEqual(threw, true);
});

test("validateRetry: rejects non-boolean jitter/honorRetryAfter", () => {
  let threw = false;
  try { validateRetry({ jitter: 'yes' }); } catch (e) { threw = true; }
  expect.toEqual(threw, true);
});

test("validateRetry: rejects non-array retryOn", () => {
  let threw = false;
  try { validateRetry({ retryOn: 'RATE_LIMIT' }); } catch (e) { threw = true; }
  expect.toEqual(threw, true);
});

test("validateRetry: rejects non-function onRetry", () => {
  let threw = false;
  try { validateRetry({ onRetry: 'log' }); } catch (e) { threw = true; }
  expect.toEqual(threw, true);
});

test("validateRetry: accepts null onRetry", () => {
  validateRetry({ onRetry: null });  // should not throw
});

test("validateRetry: accepts null totalTimeoutMs", () => {
  validateRetry({ totalTimeoutMs: null });
});

// --- Run all tests ---

console.log("\n--- Running withRetry tests ---\n");

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
