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

/**
 * Unified retry helper for LLamiga.
 *
 * Library defaults can be overridden by plugin / session / plugin / plugin+model
 * layers via mergeRetry(). withRetry(fn, opts) owns the loop and is guaranteed
 * to always exit via return or throw — never falls off the end.
 *
 * Retry config shape:
 *   maxAttempts       integer >= 1
 *   backoff           'fixed' | 'exponential'
 *   baseMs            base delay in ms
 *   maxMs             upper cap for any single delay
 *   jitter            boolean — apply ±25% randomization
 *   honorRetryAfter   honor Retry-After header (capped by maxMs)
 *   retryOn           array of ErrorCode strings
 *   totalTimeoutMs    optional hard ceiling across all attempts (null = unused)
 *   onRetry           optional callback ({attempt, error, delayMs}) => void
 */

import { isRetryable } from './errors.mjs';

export const RETRY_DEFAULTS = Object.freeze({
  maxAttempts: 3,
  backoff: 'exponential',
  baseMs: 1000,
  maxMs: 30000,
  jitter: true,
  honorRetryAfter: true,
  retryOn: ['RATE_LIMIT', 'SERVER', 'NETWORK'],
  totalTimeoutMs: null,
  onRetry: null,
});

const ALLOWED_KEYS = new Set(Object.keys(RETRY_DEFAULTS));

/**
 * Validate a partial retry config object. Throws on bad input.
 * Empty / undefined / `false` are valid pass-throughs (handled by caller).
 */
export function validateRetry(partial) {
  if (partial === undefined || partial === null || partial === false) return;
  if (typeof partial !== 'object' || Array.isArray(partial)) {
    throw new Error(`Invalid retry config: expected object, got ${typeof partial}`);
  }
  for (const [k, v] of Object.entries(partial)) {
    if (!ALLOWED_KEYS.has(k)) {
      throw new Error(`Invalid retry config: unknown key '${k}'`);
    }
    switch (k) {
      case 'maxAttempts':
        if (!Number.isInteger(v) || v < 1) throw new Error(`retry.maxAttempts must be a positive integer, got ${v}`);
        break;
      case 'backoff':
        if (v !== 'fixed' && v !== 'exponential') throw new Error(`retry.backoff must be 'fixed' or 'exponential', got ${v}`);
        break;
      case 'baseMs':
      case 'maxMs':
        if (typeof v !== 'number' || !(v >= 0)) throw new Error(`retry.${k} must be a non-negative number, got ${v}`);
        break;
      case 'jitter':
      case 'honorRetryAfter':
        if (typeof v !== 'boolean') throw new Error(`retry.${k} must be a boolean, got ${typeof v}`);
        break;
      case 'retryOn':
        if (!Array.isArray(v) || !v.every(x => typeof x === 'string')) {
          throw new Error(`retry.retryOn must be an array of strings`);
        }
        break;
      case 'totalTimeoutMs':
        if (v !== null && (typeof v !== 'number' || !(v >= 0))) {
          throw new Error(`retry.totalTimeoutMs must be a non-negative number or null, got ${v}`);
        }
        break;
      case 'onRetry':
        if (v !== null && typeof v !== 'function') {
          throw new Error(`retry.onRetry must be a function or null, got ${typeof v}`);
        }
        break;
    }
  }
}

/**
 * Merge retry layers (last writer wins) into a single resolved retry config.
 * Any layer that is `false` short-circuits to `false` (retry disabled from that
 * point down). Each layer is shallow-merged into the accumulator.
 */
export function mergeRetry(...layers) {
  let acc = { ...RETRY_DEFAULTS };
  for (const layer of layers) {
    if (layer === undefined || layer === null) continue;
    if (layer === false) return false;
    validateRetry(layer);
    acc = { ...acc, ...layer };
  }
  return acc;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseRetryAfter(headers) {
  if (!headers) return null;
  const value = headers['retry-after'];
  if (!value) return null;
  const asNum = Number(value);
  if (Number.isFinite(asNum)) return asNum * 1000;
  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) {
    const delta = asDate - Date.now();
    return delta > 0 ? delta : 0;
  }
  return null;
}

function computeDelay(opts, attempt) {
  let delay;
  if (opts.backoff === 'fixed') {
    delay = opts.baseMs;
  } else {
    delay = opts.baseMs * Math.pow(2, attempt - 1);
  }
  if (opts.jitter) {
    const factor = 0.75 + Math.random() * 0.5; // ±25%
    delay = delay * factor;
  }
  return Math.min(delay, opts.maxMs);
}

/**
 * Run `fn` with the given retry config. Always exits via return (success) or
 * throw (final classified error). `fn` is called as `fn({attempt})` where
 * `attempt` is the 1-indexed attempt number; plugins use this to populate
 * `retries: attempt - 1` on their success result.
 *
 * @param {({attempt: number}) => Promise<*>} fn   the operation to attempt; should throw classified errors.
 * @param {object|false} opts                       resolved retry config from mergeRetry(), or `false` to disable.
 * @returns {Promise<*>}                            the resolved value from `fn` on success.
 */
export async function withRetry(fn, opts) {
  if (opts === false) {
    return await fn({ attempt: 1 });
  }
  const config = opts || RETRY_DEFAULTS;
  const startTime = Date.now();
  let lastError;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn({ attempt });
    } catch (err) {
      lastError = err;

      const isLastAttempt = attempt >= config.maxAttempts;
      const code = err?.code;
      const retryable = code ? config.retryOn.includes(code) : isRetryable(code);

      if (!retryable || isLastAttempt) {
        throw err;
      }

      let delay = computeDelay(config, attempt);
      if (config.honorRetryAfter && err?.raw?.headers) {
        const retryAfterMs = parseRetryAfter(err.raw.headers);
        if (retryAfterMs !== null) {
          delay = Math.min(retryAfterMs, config.maxMs);
        }
      }

      if (config.totalTimeoutMs !== null) {
        const elapsed = Date.now() - startTime;
        const remaining = config.totalTimeoutMs - elapsed;
        if (remaining <= 0 || delay >= remaining) {
          throw err;
        }
      }

      if (typeof config.onRetry === 'function') {
        try {
          config.onRetry({ attempt, error: err, delayMs: delay });
        } catch (_hookErr) {
          // hook failures must not break the retry loop
        }
      }

      await sleep(delay);
    }
  }

  // Defensive: loop exit always goes through throw above, but keep this as a guard.
  throw lastError || new Error('withRetry: exhausted with no error captured');
}
