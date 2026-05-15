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
 * Unified streaming abstraction for LLamiga
 * Normalizes streaming responses from different LLM providers
 */

/**
 * Standard chunk format that all providers emit
 * @typedef {Object} StreamChunk
 * @property {string} type - Chunk type: 'content', 'metadata', 'error', 'done'
 * @property {string} content - Text content (for type='content')
 * @property {Object} metadata - Additional metadata (for type='metadata')
 * @property {string} error - Error message (for type='error')
 * @property {Object} raw - Raw provider-specific data
 */

/**
 * Stream event types
 */
export const StreamEventType = {
  CONTENT: 'content',      // Text chunk
  METADATA: 'metadata',    // Token counts, IDs, etc.
  ERROR: 'error',          // Error occurred
  DONE: 'done'             // Stream complete
};

/**
 * Create a standard content chunk
 * @param {string} content - The text content
 * @param {Object} raw - The raw provider-specific data
 * @returns {StreamChunk}
 */
export function createContentChunk(content, raw = null) {
  return {
    type: StreamEventType.CONTENT,
    content: content,
    metadata: null,
    error: null,
    raw: raw
  };
}

/**
 * Create a metadata chunk
 * @param {Object} metadata - Metadata object
 * @param {Object} raw - The raw provider-specific data
 * @returns {StreamChunk}
 */
export function createMetadataChunk(metadata, raw = null) {
  return {
    type: StreamEventType.METADATA,
    content: null,
    metadata: metadata,
    error: null,
    raw: raw
  };
}

/**
 * Create an error chunk
 * @param {string} error - Error message
 * @param {Object} raw - The raw provider-specific data
 * @returns {StreamChunk}
 */
export function createErrorChunk(error, raw = null) {
  return {
    type: StreamEventType.ERROR,
    content: null,
    metadata: null,
    error: error,
    raw: raw
  };
}

/**
 * Create a done chunk
 * @param {Object} raw - The raw provider-specific data
 * @returns {StreamChunk}
 */
export function createDoneChunk(raw = null) {
  return {
    type: StreamEventType.DONE,
    content: null,
    metadata: null,
    error: null,
    raw: raw
  };
}

/**
 * Generic Server-Sent Events (SSE) stream parser
 * Handles the low-level stream reading and line parsing
 *
 * @param {Response} response - Fetch API response object
 * @param {Function} chunkExtractor - Provider-specific function to extract chunks
 * @param {Function} onChunk - Callback for each standardized chunk
 * @returns {Promise<Object>} Final result with full text and metadata
 */
export async function parseSSEStream(response, chunkExtractor, onChunk) {
  if (!response.ok) {
    throw new Error(`Stream error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = '';
  let fullText = '';
  let metadata = {};
  let hasError = false;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Send final done event
        const doneChunk = createDoneChunk();
        if (onChunk) onChunk(doneChunk);
        break;
      }

      // Decode the chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Parse SSE format: "data: {...}"
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);

          // Check for stream end marker
          if (data === '[DONE]') {
            continue;
          }

          try {
            // Parse JSON and extract provider-specific chunk
            const parsed = JSON.parse(data);
            const standardChunks = chunkExtractor(parsed);

            // chunkExtractor can return single chunk or array of chunks
            const chunks = Array.isArray(standardChunks)
              ? standardChunks
              : [standardChunks];

            // Process each chunk
            for (const chunk of chunks) {
              if (!chunk) continue;

              // Accumulate content
              if (chunk.type === StreamEventType.CONTENT && chunk.content) {
                fullText += chunk.content;
              }

              // Accumulate metadata
              if (chunk.type === StreamEventType.METADATA && chunk.metadata) {
                metadata = { ...metadata, ...chunk.metadata };
              }

              // Handle errors
              if (chunk.type === StreamEventType.ERROR) {
                hasError = true;
              }

              // Call user callback
              if (onChunk) {
                onChunk(chunk);
              }
            }
          } catch (err) {
            console.warn('Failed to parse SSE line:', trimmed, err.message);
            // Don't throw, continue parsing other lines
          }
        } else if (trimmed.startsWith('event: ')) {
          // Some providers send event type separately
          // Can be handled by chunkExtractor if needed
        }
      }
    }
  } catch (err) {
    const errorChunk = createErrorChunk(err.message);
    if (onChunk) onChunk(errorChunk);
    throw err;
  } finally {
    reader.releaseLock();
  }

  if (hasError) {
    throw new Error('Stream encountered errors');
  }

  return {
    success: true,
    text: fullText,
    metadata: metadata,
    raw: null
  };
}

/**
 * Parse NDJSON stream (used by Ollama and similar services)
 * Simpler than SSE - just newline-delimited JSON objects
 *
 * @param {Response} response - Fetch API response object
 * @param {Function} chunkExtractor - Provider-specific function to extract chunks
 * @param {Function} onChunk - Callback for each standardized chunk
 * @returns {Promise<Object>} Final result with full text and metadata
 */
export async function parseNDJSONStream(response, chunkExtractor, onChunk) {
  if (!response.ok) {
    throw new Error(`Stream error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = '';
  let fullText = '';
  let metadata = {};
  let hasError = false;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        const doneChunk = createDoneChunk();
        if (onChunk) onChunk(doneChunk);
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const parsed = JSON.parse(trimmed);
          const standardChunks = chunkExtractor(parsed);

          const chunks = Array.isArray(standardChunks)
            ? standardChunks
            : [standardChunks];

          for (const chunk of chunks) {
            if (!chunk) continue;

            if (chunk.type === StreamEventType.CONTENT && chunk.content) {
              fullText += chunk.content;
            }

            if (chunk.type === StreamEventType.METADATA && chunk.metadata) {
              metadata = { ...metadata, ...chunk.metadata };
            }

            if (chunk.type === StreamEventType.ERROR) {
              hasError = true;
            }

            if (onChunk) {
              onChunk(chunk);
            }
          }
        } catch (err) {
          console.warn('Failed to parse NDJSON line:', trimmed, err.message);
        }
      }
    }
  } catch (err) {
    const errorChunk = createErrorChunk(err.message);
    if (onChunk) onChunk(errorChunk);
    throw err;
  } finally {
    reader.releaseLock();
  }

  if (hasError) {
    throw new Error('Stream encountered errors');
  }

  return {
    success: true,
    text: fullText,
    metadata: metadata,
    raw: null
  };
}
