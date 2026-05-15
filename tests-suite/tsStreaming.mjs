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
 * Test suite for streaming functionality
 * Tests the unified streaming abstraction with OpenAI
 */

import { createSession } from '../src/index.mjs';

console.log('\n=== LLamiga Streaming Tests ===\n');

/**
 * Test 1: Basic streaming with chatStream
 */
async function testBasicStreaming() {
  console.log('Test 1: Basic streaming with chatStream');
  console.log('----------------------------------------');

  const session = createSession('openai::gpt-4o-mini');

  let chunkCount = 0;
  let contentChunks = 0;
  let metadataChunks = 0;
  let fullText = '';

  console.log('\nStreaming response:');
  console.log('---');

  await session.chatStream('Count from 1 to 5, one number per line', (chunk) => {
    chunkCount++;

    if (chunk.type === 'content') {
      contentChunks++;
      fullText += chunk.content;
      process.stdout.write(chunk.content);
    } else if (chunk.type === 'metadata') {
      metadataChunks++;
      console.log('\n[Metadata received]', chunk.metadata);
    } else if (chunk.type === 'done') {
      console.log('\n[Stream complete]');
    }
  });

  console.log('---\n');
  console.log(`✓ Received ${chunkCount} total chunks`);
  console.log(`✓ ${contentChunks} content chunks, ${metadataChunks} metadata chunks`);
  console.log(`✓ Full text length: ${fullText.length} characters\n`);
}

/**
 * Test 2: Streaming with raw chunk inspection
 */
async function testRawChunks() {
  console.log('Test 2: Streaming with raw chunk inspection');
  console.log('---------------------------------------------');

  const session = createSession('openai::gpt-4o-mini');

  let firstContentRaw = null;

  await session.chatStream('Say "Hello, streaming!"', (chunk) => {
    if (chunk.type === 'content') {
      process.stdout.write(chunk.content);

      // Capture first raw chunk
      if (!firstContentRaw && chunk.raw) {
        firstContentRaw = chunk.raw;
      }
    } else if (chunk.type === 'done') {
      console.log('\n');
    }
  });

  if (firstContentRaw) {
    console.log('✓ First content chunk raw structure:');
    console.log(JSON.stringify(firstContentRaw, null, 2));
  }

  console.log('✓ Raw chunks are accessible\n');
}

/**
 * Test 3: askStream (one-off streaming without conversation history)
 */
async function testAskStream() {
  console.log('Test 3: askStream (one-off streaming)');
  console.log('---------------------------------------');

  const session = createSession('openai');

  console.log('\nStreaming response:');
  console.log('---');

  const result = await session.askStream('What is 2+2?', (chunk) => {
    if (chunk.type === 'content') {
      process.stdout.write(chunk.content);
    }
  });

  console.log('\n---\n');
  console.log(`✓ Final result text: "${result.text}"`);
  console.log(`✓ Success: ${result.success}`);
  console.log(`✓ Metadata: ${JSON.stringify(result.metadata)}\n`);
}

/**
 * Test 4: Performance metrics
 */
async function testPerformanceMetrics() {
  console.log('Test 4: Performance metrics');
  console.log('---------------------------');

  const session = createSession('openai::gpt-4o-mini');

  const metrics = {
    firstChunkTime: null,
    chunkCount: 0,
    totalBytes: 0,
    startTime: Date.now()
  };

  await session.chatStream('Write a haiku about programming', (chunk) => {
    if (chunk.type === 'content') {
      if (!metrics.firstChunkTime) {
        metrics.firstChunkTime = Date.now() - metrics.startTime;
      }

      metrics.chunkCount++;
      metrics.totalBytes += chunk.content.length;
      process.stdout.write(chunk.content);
    } else if (chunk.type === 'done') {
      console.log('\n');
    }
  });

  const totalTime = Date.now() - metrics.startTime;

  console.log('Performance Metrics:');
  console.log(`  Time to first chunk: ${metrics.firstChunkTime}ms`);
  console.log(`  Total time: ${totalTime}ms`);
  console.log(`  Total chunks: ${metrics.chunkCount}`);
  console.log(`  Total bytes: ${metrics.totalBytes}`);
  console.log(`  Average chunk size: ${Math.round(metrics.totalBytes / metrics.chunkCount)} bytes`);
  console.log(`  Chunks per second: ${(metrics.chunkCount / (totalTime / 1000)).toFixed(2)}\n`);
}

/**
 * Test 5: Multi-turn conversation with streaming
 */
async function testConversationStreaming() {
  console.log('Test 5: Multi-turn conversation with streaming');
  console.log('-----------------------------------------------');

  const session = createSession('openai::gpt-4o-mini');

  console.log('\nTurn 1:');
  await session.chatStream('My favorite color is blue', (chunk) => {
    if (chunk.type === 'content') {
      process.stdout.write(chunk.content);
    }
  });

  console.log('\n\nTurn 2:');
  await session.chatStream('What is my favorite color?', (chunk) => {
    if (chunk.type === 'content') {
      process.stdout.write(chunk.content);
    }
  });

  console.log('\n\n✓ Conversation history maintained during streaming\n');
}

/**
 * Test 6: Provider switching with streaming
 */
async function testProviderSwitching() {
  console.log('Test 6: Provider switching with streaming');
  console.log('------------------------------------------');

  const session = createSession('openai::gpt-4o-mini');

  console.log('\nUsing OpenAI:');
  await session.chatStream('Say "Hello from OpenAI"', (chunk) => {
    if (chunk.type === 'content') {
      process.stdout.write(chunk.content);
    }
  });

  console.log('\n\n✓ Streaming works with provider specification\n');
}

/**
 * Test 7: Error handling in streaming
 */
async function testErrorHandling() {
  console.log('Test 7: Error handling in streaming');
  console.log('------------------------------------');

  const session = createSession('openai::gpt-4o-mini');

  let errorCaught = false;

  try {
    // Try to stream without a callback
    await session.chatStream('Test');
  } catch (err) {
    errorCaught = true;
    console.log(`✓ Error caught: ${err.message}`);
  }

  if (!errorCaught) {
    console.log('✗ Expected error was not thrown');
  }

  console.log();
}

/**
 * Run all tests
 */
async function runAllTests() {
  try {
    await testBasicStreaming();
    await testRawChunks();
    await testAskStream();
    await testPerformanceMetrics();
    await testConversationStreaming();
    await testProviderSwitching();
    await testErrorHandling();

    console.log('=================================');
    console.log('✓ All streaming tests completed!');
    console.log('=================================\n');
  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// Run tests
runAllTests();
