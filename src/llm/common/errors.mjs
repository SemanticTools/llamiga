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
 * Unified error taxonomy for LLamiga.
 *
 * All plugin `complete()` failures should throw an Error built by one of the
 * constructors below. Callers can switch on `err.code` to handle each category
 * distinctly without parsing message strings.
 *
 * Error shape:
 *   err.code              one of ErrorCode (RATE_LIMIT | QUOTA_EXHAUSTED | AUTH | CLIENT | SERVER | NETWORK)
 *   err.status            HTTP status when applicable, else null
 *   err.provider          provider name, e.g. 'Anthropic'
 *   err.message           human-readable, prefixed with [Provider/model]
 *   err.raw               { headers, responseBody } — present on HTTP errors only
 *   err.cause             underlying Error (standard ES2022) — set on NETWORK / parse failures
 */

export const ErrorCode = Object.freeze({
  RATE_LIMIT: 'RATE_LIMIT',
  QUOTA_EXHAUSTED: 'QUOTA_EXHAUSTED',
  AUTH: 'AUTH',
  CLIENT: 'CLIENT',
  SERVER: 'SERVER',
  NETWORK: 'NETWORK',
});

const RETRY_CATEGORIES = new Set([ErrorCode.RATE_LIMIT, ErrorCode.SERVER, ErrorCode.NETWORK]);

export function isRetryable(code) {
  return RETRY_CATEGORIES.has(code);
}

function headersToObject(headers) {
  if (!headers) return {};
  const out = {};
  if (typeof headers.forEach === 'function') {
    headers.forEach((value, key) => { out[key.toLowerCase()] = value; });
  }
  return out;
}

function buildError(code, status, provider, model, reason, raw, cause) {
  const prefix = model ? `[${provider}/${model}]` : `[${provider}]`;
  const err = new Error(`${prefix} ${reason}`);
  err.code = code;
  err.status = status;
  err.provider = provider;
  if (raw) err.raw = raw;
  if (cause) err.cause = cause;
  return err;
}

function classifyOpenAILike(status, body, provider, model, raw) {
  const type = body?.error?.type;
  const code = body?.error?.code;
  const message = body?.error?.message;

  if (type === 'insufficient_quota' || code === 'insufficient_quota') {
    return buildError(ErrorCode.QUOTA_EXHAUSTED, status, provider, model,
      message || 'Account quota exhausted', raw);
  }
  if (type === 'invalid_api_key' || code === 'invalid_api_key' || status === 401 || status === 403) {
    return buildError(ErrorCode.AUTH, status, provider, model,
      message || 'Authentication failed', raw);
  }
  if (type === 'rate_limit_exceeded' || code === 'rate_limit_exceeded' || status === 429) {
    return buildError(ErrorCode.RATE_LIMIT, status, provider, model,
      message || 'Rate limit exceeded', raw);
  }
  if (status >= 500) {
    return buildError(ErrorCode.SERVER, status, provider, model,
      message || `Server error ${status}`, raw);
  }
  return buildError(ErrorCode.CLIENT, status, provider, model,
    message || `Client error ${status}`, raw);
}

function classifyAnthropic(status, body, provider, model, raw) {
  const type = body?.error?.type;
  const message = body?.error?.message || '';

  if (type === 'authentication_error' || type === 'permission_error' || status === 401 || status === 403) {
    return buildError(ErrorCode.AUTH, status, provider, model,
      message || 'Authentication failed', raw);
  }
  if (type === 'rate_limit_error' || status === 429) {
    return buildError(ErrorCode.RATE_LIMIT, status, provider, model,
      message || 'Rate limit exceeded', raw);
  }
  if (type === 'overloaded_error' || status >= 500) {
    return buildError(ErrorCode.SERVER, status, provider, model,
      message || `Server error ${status}`, raw);
  }
  if (type === 'invalid_request_error') {
    // String-match for quota — see plan/TECHNICALDEBT.md "Anthropic QUOTA_EXHAUSTED detection".
    if (/credit balance/i.test(message)) {
      return buildError(ErrorCode.QUOTA_EXHAUSTED, status, provider, model,
        message, raw);
    }
    return buildError(ErrorCode.CLIENT, status, provider, model,
      message || `Client error ${status}`, raw);
  }
  return buildError(ErrorCode.CLIENT, status, provider, model,
    message || `Client error ${status}`, raw);
}

function classifyGemini(status, body, provider, model, raw) {
  const errStatus = body?.error?.status;
  const message = body?.error?.message;
  const details = body?.error?.details;

  if (errStatus === 'UNAUTHENTICATED' || errStatus === 'PERMISSION_DENIED' || status === 401 || status === 403) {
    return buildError(ErrorCode.AUTH, status, provider, model,
      message || 'Authentication failed', raw);
  }
  if (errStatus === 'RESOURCE_EXHAUSTED') {
    // Disambiguate via details[].reason
    const reasons = Array.isArray(details) ? details.map(d => d?.reason).filter(Boolean) : [];
    if (reasons.includes('QUOTA_EXCEEDED')) {
      return buildError(ErrorCode.QUOTA_EXHAUSTED, status, provider, model,
        message || 'Account quota exhausted', raw);
    }
    return buildError(ErrorCode.RATE_LIMIT, status, provider, model,
      message || 'Rate limit exceeded', raw);
  }
  if (errStatus === 'UNAVAILABLE' || errStatus === 'INTERNAL' || status >= 500) {
    return buildError(ErrorCode.SERVER, status, provider, model,
      message || `Server error ${status}`, raw);
  }
  return buildError(ErrorCode.CLIENT, status, provider, model,
    message || `Client error ${status}`, raw);
}

function classifyOllama(status, body, provider, model, raw) {
  const message = typeof body === 'string' ? body : (body?.error || `HTTP ${status}`);
  if (status >= 500) {
    return buildError(ErrorCode.SERVER, status, provider, model, message, raw);
  }
  return buildError(ErrorCode.CLIENT, status, provider, model, message, raw);
}

/**
 * Read an HTTP error response body once, robustly.
 *
 * Reads the stream as text first (consuming it exactly once), then attempts
 * JSON.parse. If parsing succeeds, returns the parsed object; otherwise returns
 * the raw text. If the stream read itself fails (rare — e.g. body already consumed
 * upstream), returns null with the underlying error as parseError.
 *
 * Replaces the pattern of `response.json()` then falling back to `response.text()`
 * which silently dropped body content because the stream was already drained.
 *
 * @param {Response} response
 * @returns {Promise<{body: *, parseError: Error|undefined}>}
 */
export async function readResponseBody(response) {
  let text;
  try {
    text = await response.text();
  } catch (e) {
    return { body: null, parseError: e };
  }
  try {
    return { body: JSON.parse(text), parseError: undefined };
  } catch {
    // Body wasn't JSON (e.g., HTML error page from a proxy). Return as raw text.
    return { body: text, parseError: undefined };
  }
}

/**
 * Build a classified Error from an HTTP failure response.
 *
 * @param {Response} response   fetch Response (used for status + headers).
 * @param {*} body              parsed body (object) or raw text if JSON parse failed.
 * @param {string} provider     provider display name, e.g. 'Anthropic'.
 * @param {string} [model]      model id for the error message prefix.
 * @param {Error} [parseError]  underlying Error if JSON parsing failed; attached as err.cause.
 * @returns {Error}             classified Error with .code, .status, .provider, .raw, optionally .cause.
 */
export function classifyHttpError(response, body, provider, model, parseError) {
  const status = response?.status ?? null;
  const raw = {
    headers: headersToObject(response?.headers),
    responseBody: body,
  };

  let err;
  switch (provider) {
    case 'Anthropic':
      err = classifyAnthropic(status, body, provider, model, raw);
      break;
    case 'Gemini':
      err = classifyGemini(status, body, provider, model, raw);
      break;
    case 'Ollama':
      err = classifyOllama(status, body, provider, model, raw);
      break;
    case 'OpenAI':
    case 'Grok':
    case 'Mistral':
    default:
      err = classifyOpenAILike(status, body, provider, model, raw);
      break;
  }

  if (parseError) err.cause = parseError;
  return err;
}

/**
 * Build a classified Error from a network-level failure (no response received).
 *
 * @param {Error} cause       the underlying fetch / network Error.
 * @param {string} provider   provider display name.
 * @param {string} [model]    model id for the error message prefix.
 * @returns {Error}           classified NETWORK Error with .cause set.
 */
export function classifyNetworkError(cause, provider, model) {
  return buildError(
    ErrorCode.NETWORK,
    null,
    provider,
    model,
    cause?.message || 'Network error',
    null,
    cause,
  );
}
