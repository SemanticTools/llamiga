// SPDX-License-Identifier: Apache-2.0
/*
Copyright 2025-2026 Dusty Wilhelm Murray (Semantic Tools)

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0
*/

import { classifyHttpError, classifyNetworkError, ErrorCode, isRetryable } from '../src/llm/common/errors.mjs';
import { test, expect } from './testUtils.mjs';

function mockResponse(status, headers = {}) {
  return {
    status,
    headers: {
      forEach(cb) {
        for (const [k, v] of Object.entries(headers)) cb(v, k);
      }
    }
  };
}

// --- shared shape checks ---

test("classifyHttpError attaches code, status, provider", () => {
  const err = classifyHttpError(mockResponse(429), { error: { type: 'rate_limit_exceeded' } }, 'OpenAI', 'gpt-4o');
  expect.toEqual(err.code, 'RATE_LIMIT');
  expect.toEqual(err.status, 429);
  expect.toEqual(err.provider, 'OpenAI');
});

test("classifyHttpError prefixes message with [Provider/model]", () => {
  const err = classifyHttpError(mockResponse(500), { error: { message: 'boom' } }, 'OpenAI', 'gpt-4o');
  expect.toContain(err.message, '[OpenAI/gpt-4o]');
});

test("classifyHttpError prefixes with [Provider] when no model", () => {
  const err = classifyHttpError(mockResponse(500), {}, 'OpenAI');
  expect.toContain(err.message, '[OpenAI]');
  expect.toNotContain(err.message, '[OpenAI/');
});

test("classifyHttpError attaches raw.headers (lowercased keys)", () => {
  const err = classifyHttpError(
    mockResponse(429, { 'Retry-After': '30', 'X-Request-Id': 'req_abc' }),
    {},
    'OpenAI',
    'gpt-4o'
  );
  expect.toEqual(err.raw.headers['retry-after'], '30');
  expect.toEqual(err.raw.headers['x-request-id'], 'req_abc');
});

test("classifyHttpError attaches raw.responseBody", () => {
  const body = { error: { type: 'rate_limit_exceeded', message: 'slow down' } };
  const err = classifyHttpError(mockResponse(429), body, 'OpenAI', 'gpt-4o');
  expect.toEqual(err.raw.responseBody, body);
});

test("classifyHttpError attaches parseError as .cause", () => {
  const parseError = new SyntaxError('bad json');
  const err = classifyHttpError(mockResponse(500), 'not-json-string', 'OpenAI', 'gpt-4o', parseError);
  expect.toEqual(err.cause, parseError);
});

// --- OpenAI / Grok / Mistral (OpenAI-like) ---

test("OpenAI 429 rate_limit_exceeded → RATE_LIMIT", () => {
  const err = classifyHttpError(mockResponse(429),
    { error: { type: 'rate_limit_exceeded', message: 'slow down' } },
    'OpenAI', 'gpt-4o');
  expect.toEqual(err.code, 'RATE_LIMIT');
});

test("OpenAI 401 invalid_api_key → AUTH", () => {
  const err = classifyHttpError(mockResponse(401),
    { error: { code: 'invalid_api_key', message: 'bad key' } },
    'OpenAI', 'gpt-4o');
  expect.toEqual(err.code, 'AUTH');
});

test("OpenAI 403 (no body type) → AUTH", () => {
  const err = classifyHttpError(mockResponse(403), {}, 'OpenAI', 'gpt-4o');
  expect.toEqual(err.code, 'AUTH');
});

test("OpenAI insufficient_quota → QUOTA_EXHAUSTED", () => {
  const err = classifyHttpError(mockResponse(429),
    { error: { type: 'insufficient_quota', message: 'no credits' } },
    'OpenAI', 'gpt-4o');
  expect.toEqual(err.code, 'QUOTA_EXHAUSTED');
});

test("OpenAI 400 model_not_found → CLIENT", () => {
  const err = classifyHttpError(mockResponse(404),
    { error: { code: 'model_not_found', message: 'no model' } },
    'OpenAI', 'gpt-4o');
  expect.toEqual(err.code, 'CLIENT');
});

test("OpenAI 500 → SERVER", () => {
  const err = classifyHttpError(mockResponse(500), {}, 'OpenAI', 'gpt-4o');
  expect.toEqual(err.code, 'SERVER');
});

test("OpenAI 503 → SERVER", () => {
  const err = classifyHttpError(mockResponse(503), {}, 'OpenAI', 'gpt-4o');
  expect.toEqual(err.code, 'SERVER');
});

test("Grok uses OpenAI-like classifier (429 → RATE_LIMIT)", () => {
  const err = classifyHttpError(mockResponse(429),
    { error: { type: 'rate_limit_exceeded' } },
    'Grok', 'grok-3-fast');
  expect.toEqual(err.code, 'RATE_LIMIT');
});

test("Mistral uses OpenAI-like classifier (401 → AUTH)", () => {
  const err = classifyHttpError(mockResponse(401),
    { error: { message: 'Unauthorized' } },
    'Mistral', 'mistral-medium');
  expect.toEqual(err.code, 'AUTH');
});

// --- Anthropic ---

test("Anthropic 429 rate_limit_error → RATE_LIMIT", () => {
  const err = classifyHttpError(mockResponse(429),
    { error: { type: 'rate_limit_error', message: 'slow down' } },
    'Anthropic', 'claude-3-5-sonnet');
  expect.toEqual(err.code, 'RATE_LIMIT');
});

test("Anthropic 401 authentication_error → AUTH", () => {
  const err = classifyHttpError(mockResponse(401),
    { error: { type: 'authentication_error', message: 'invalid x-api-key' } },
    'Anthropic', 'claude-3-5-sonnet');
  expect.toEqual(err.code, 'AUTH');
});

test("Anthropic permission_error → AUTH", () => {
  const err = classifyHttpError(mockResponse(403),
    { error: { type: 'permission_error', message: 'no access' } },
    'Anthropic', 'claude-3-5-sonnet');
  expect.toEqual(err.code, 'AUTH');
});

test("Anthropic overloaded_error → SERVER", () => {
  const err = classifyHttpError(mockResponse(529),
    { error: { type: 'overloaded_error', message: 'overloaded' } },
    'Anthropic', 'claude-3-5-sonnet');
  expect.toEqual(err.code, 'SERVER');
});

test("Anthropic invalid_request_error with 'credit balance' → QUOTA_EXHAUSTED", () => {
  const err = classifyHttpError(mockResponse(400),
    { error: { type: 'invalid_request_error', message: 'Your credit balance is too low' } },
    'Anthropic', 'claude-3-5-sonnet');
  expect.toEqual(err.code, 'QUOTA_EXHAUSTED');
});

test("Anthropic invalid_request_error without credit-balance → CLIENT", () => {
  const err = classifyHttpError(mockResponse(400),
    { error: { type: 'invalid_request_error', message: 'bad request' } },
    'Anthropic', 'claude-3-5-sonnet');
  expect.toEqual(err.code, 'CLIENT');
});

test("Anthropic 500 → SERVER", () => {
  const err = classifyHttpError(mockResponse(500), {}, 'Anthropic', 'claude-3-5-sonnet');
  expect.toEqual(err.code, 'SERVER');
});

// --- Gemini ---

test("Gemini RESOURCE_EXHAUSTED + RATE_LIMIT_EXCEEDED → RATE_LIMIT", () => {
  const err = classifyHttpError(mockResponse(429),
    { error: { status: 'RESOURCE_EXHAUSTED', message: 'rate limited',
               details: [{ '@type': 'x', reason: 'RATE_LIMIT_EXCEEDED' }] } },
    'Gemini', 'gemini-2.0-flash');
  expect.toEqual(err.code, 'RATE_LIMIT');
});

test("Gemini RESOURCE_EXHAUSTED + QUOTA_EXCEEDED → QUOTA_EXHAUSTED", () => {
  const err = classifyHttpError(mockResponse(429),
    { error: { status: 'RESOURCE_EXHAUSTED', message: 'quota gone',
               details: [{ reason: 'QUOTA_EXCEEDED' }] } },
    'Gemini', 'gemini-2.0-flash');
  expect.toEqual(err.code, 'QUOTA_EXHAUSTED');
});

test("Gemini RESOURCE_EXHAUSTED with no details → RATE_LIMIT (default)", () => {
  const err = classifyHttpError(mockResponse(429),
    { error: { status: 'RESOURCE_EXHAUSTED', message: 'limit' } },
    'Gemini', 'gemini-2.0-flash');
  expect.toEqual(err.code, 'RATE_LIMIT');
});

test("Gemini UNAUTHENTICATED → AUTH", () => {
  const err = classifyHttpError(mockResponse(401),
    { error: { status: 'UNAUTHENTICATED', message: 'API key not valid' } },
    'Gemini', 'gemini-2.0-flash');
  expect.toEqual(err.code, 'AUTH');
});

test("Gemini PERMISSION_DENIED → AUTH", () => {
  const err = classifyHttpError(mockResponse(403),
    { error: { status: 'PERMISSION_DENIED', message: 'no access' } },
    'Gemini', 'gemini-2.0-flash');
  expect.toEqual(err.code, 'AUTH');
});

test("Gemini INVALID_ARGUMENT → CLIENT", () => {
  const err = classifyHttpError(mockResponse(400),
    { error: { status: 'INVALID_ARGUMENT', message: 'bad arg' } },
    'Gemini', 'gemini-2.0-flash');
  expect.toEqual(err.code, 'CLIENT');
});

test("Gemini UNAVAILABLE → SERVER", () => {
  const err = classifyHttpError(mockResponse(503),
    { error: { status: 'UNAVAILABLE', message: 'down' } },
    'Gemini', 'gemini-2.0-flash');
  expect.toEqual(err.code, 'SERVER');
});

test("Gemini INTERNAL → SERVER", () => {
  const err = classifyHttpError(mockResponse(500),
    { error: { status: 'INTERNAL', message: 'oops' } },
    'Gemini', 'gemini-2.0-flash');
  expect.toEqual(err.code, 'SERVER');
});

// --- Ollama ---

test("Ollama 500 → SERVER", () => {
  const err = classifyHttpError(mockResponse(500), 'model not loaded', 'Ollama', 'llama3');
  expect.toEqual(err.code, 'SERVER');
});

test("Ollama 503 → SERVER", () => {
  const err = classifyHttpError(mockResponse(503), '', 'Ollama', 'llama3');
  expect.toEqual(err.code, 'SERVER');
});

test("Ollama 400 → CLIENT", () => {
  const err = classifyHttpError(mockResponse(400), { error: 'bad model' }, 'Ollama', 'llama3');
  expect.toEqual(err.code, 'CLIENT');
});

test("Ollama 404 → CLIENT", () => {
  const err = classifyHttpError(mockResponse(404), 'not found', 'Ollama', 'llama3');
  expect.toEqual(err.code, 'CLIENT');
});

// --- Unknown provider falls back to OpenAI-like ---

test("Unknown provider → OpenAI-like classifier (500 → SERVER)", () => {
  const err = classifyHttpError(mockResponse(500), {}, 'NewProvider', 'some-model');
  expect.toEqual(err.code, 'SERVER');
});

// --- classifyNetworkError ---

test("classifyNetworkError returns NETWORK code", () => {
  const cause = new TypeError('fetch failed');
  const err = classifyNetworkError(cause, 'OpenAI', 'gpt-4o');
  expect.toEqual(err.code, 'NETWORK');
});

test("classifyNetworkError sets .cause to original error", () => {
  const cause = new TypeError('fetch failed');
  const err = classifyNetworkError(cause, 'OpenAI', 'gpt-4o');
  expect.toEqual(err.cause, cause);
});

test("classifyNetworkError has null status", () => {
  const err = classifyNetworkError(new Error('boom'), 'OpenAI', 'gpt-4o');
  expect.toEqual(err.status, null);
});

test("classifyNetworkError prefixes message with [Provider/model]", () => {
  const err = classifyNetworkError(new Error('DNS lookup failed'), 'Anthropic', 'claude-3-opus');
  expect.toContain(err.message, '[Anthropic/claude-3-opus]');
  expect.toContain(err.message, 'DNS lookup failed');
});

// --- isRetryable ---

test("isRetryable returns true for RATE_LIMIT", () => {
  expect.toEqual(isRetryable(ErrorCode.RATE_LIMIT), true);
});

test("isRetryable returns true for SERVER", () => {
  expect.toEqual(isRetryable(ErrorCode.SERVER), true);
});

test("isRetryable returns true for NETWORK", () => {
  expect.toEqual(isRetryable(ErrorCode.NETWORK), true);
});

test("isRetryable returns false for AUTH", () => {
  expect.toEqual(isRetryable(ErrorCode.AUTH), false);
});

test("isRetryable returns false for QUOTA_EXHAUSTED", () => {
  expect.toEqual(isRetryable(ErrorCode.QUOTA_EXHAUSTED), false);
});

test("isRetryable returns false for CLIENT", () => {
  expect.toEqual(isRetryable(ErrorCode.CLIENT), false);
});

// --- ErrorCode is frozen ---

test("ErrorCode is frozen (no accidental mutation)", () => {
  let threw = false;
  try {
    ErrorCode.RATE_LIMIT = 'whatever';
  } catch (e) {
    threw = true;
  }
  // In strict mode it throws; in sloppy mode it silently fails. Either way the value stays:
  expect.toEqual(ErrorCode.RATE_LIMIT, 'RATE_LIMIT');
});

// --- Run all tests ---

console.log("\n--- Running classifyHttpError tests ---\n");

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
