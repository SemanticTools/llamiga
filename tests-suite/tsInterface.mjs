import * as llAmiga from '../src/index.mjs';
import { expect, test } from './testUtils.mjs';


// --- Actual tests (much cleaner!) ---

test("missing session init plugin throws", async () => {
  await expect.toThrow(async () => {
    let session = llAmiga.createSession();
  }, "Plugin specs");
});

test("empty session array #1  plugin throws", async () => {
  await expect.toThrow(async () => {
    let session = llAmiga.createSession([]);
  }, "Plugin array");
});

test("empty session array #2  plugin throws", async () => {
  await expect.toThrow(async () => {
    let session = llAmiga.createSession([[]]);
  }, "Plugin array");
});

test("missing plugin throws", async () => {
  await expect.toThrow(async () => {
    let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
    session.setLM('gemini');
    session.getModel();
  }, "no plugin");
});

test("setLM testbert1", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  session.setLM('testbert1');
  let response = await session.ask("Hello, how are you?");
  expect.toContain(response.text, "TestBert1");
});


test("setLM testbert2", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  session.setLM('testbert2');
  let response = await session.ask("Testing");
  expect.toContain(response.text, "TestBert2");
});

test("setLM testbert1 and fantasy model", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  session.setLM('testbert1::fantasy');
  let response = await session.ask("Testing");
  expect.toContain(response.text, "fantasy");
});

test("get Provider name testbert1", async () => {
  let session = llAmiga.createSession("testbert1");
  let provider = session.getProviderName();
  
  expect.toContain(provider, "TestBert1");
});

test("get Provider name testbert1", async () => {
  let session = llAmiga.createSession("testbert1");
  let model = session.getModel();
  
  expect.toContain(model, "mock");
});

test("ask detailed last response testbert1", async () => {
  let session = llAmiga.createSession("testbert1");
  let response = await session.ask("testbert1","...");
  let details = session.getLastDetailedResponse();
  let string = JSON.stringify(details);
  expect.toContain(string, '"prompt_length":3'); //specific to plugin mock model, so we took any field
});


test("ask config testbert1", async () => {
  let session = llAmiga.createSession("testbert1");
  let response = await session.ask("testbert1","...",{ testmessage: "hello_config" });
  expect.toContain(response.text, "<hello_config>");
});

test("ask noconfig testbert1", async () => {
  let session = llAmiga.createSession("testbert1");
  let response = await session.ask("testbert1","...");
  expect.toContain(response.text, "no_test_config");
});


test("ask x2 LASTRESPONSE", async () => {
  let session = llAmiga.createSession("testbert1");
  let response;
  
  response = await session.ask("testbert1","cat");
  response = await session.ask("testbert1", llAmiga.LASTRESPONSE + " dog" );
  
  
  expect.toContain(response.text, "cat");
  expect.toContain(response.text, "dog");
});

test("ask x2 LASTRESPONSE and !macros", async () => {
  let session = llAmiga.createSession("testbert1",{ macros: false });
  let response;
  
  response = await session.ask("testbert1","cat");
  response = await session.ask("testbert1", llAmiga.LASTRESPONSE + " dog" );
  
  expect.toContain(response.text, llAmiga.LASTRESPONSE);
  expect.toNotContain(response.text, "cat");
  expect.toContain(response.text, "dog");
});


test("chat config testbert1", async () => {
  let session = llAmiga.createSession("testbert1");
  let response = await session.chat("testbert1","...",{ testmessage: "hello_config" });
  expect.toContain(response.text, "<hello_config>");
});

test("chat noconfig testbert1", async () => {
  let session = llAmiga.createSession("testbert1");
  let response = await session.chat("testbert1","...");
  expect.toContain(response.text, "no_test_config");
});


test("chat testbert1 and fantasy model", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  let response = await session.chat('testbert1::fantasy',"Testing");
  expect.toContain(response.text, "fantasy");
});

test("chat testbert1 and default model", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  let response = await session.chat('testbert1',"Testing");
  expect.toContain(response.text, "testbert-mock-v1");
});


test("chat 2x testbert1, don't change model state", async () => {
  await expect.toThrow(async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  let response = await session.chat('testbert1',"Testing");
  response = await session.chat('"Testing"');
  expect.toContain(response.text, "testbert-mock-v1");
  }, "No plugin");
});


test("chat x2 LASTRESPONSE", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  let response;
  response = await session.chat("testbert1","cat");
  response = await session.chat("testbert1",llAmiga.LASTRESPONSE + " dog");
  expect.toContain(response.text, "cat");
  expect.toContain(response.text, "dog");
});

test("chat x2 LASTRESPONSE and !macros", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS, { macros: false });
  let response;
  response = await session.chat("testbert1","cat");
  response = await session.chat("testbert1",llAmiga.LASTRESPONSE + " dog");
  expect.toNotContain(response.text, "cat");
  expect.toContain(response.text, "dog");
});


test("chat getdiscussion", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  await session.chat('testbert1',"Testing1");
  await session.chat('testbert2',"Testing2");
  let discussion = session.getDiscussion();
  let discussionStr = JSON.stringify(discussion);

  expect.toContain(discussionStr, "testing1");
  expect.toContain(discussionStr, "testing2");
  expect.toContain(discussionStr, "role");
  expect.toContain(discussionStr, "user");
  expect.toContain(discussionStr, "assistant");
});


test("chat systemmessage", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  session.setSystemMessage("A cat sat on the fabulous mat.");

  let discussion = session.getDiscussion();
  let discussionStr = JSON.stringify(discussion);

  expect.toContain(discussionStr, '"role":"system"');
  expect.toContain(discussionStr, "cat");
  expect.toContain(discussionStr, "sat");
  expect.toContain(discussionStr, "fabulous");
  expect.toContain(discussionStr, "mat");
});

// Tests for addMessage()

test("addMessage user role", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  session.addMessage('user', 'Hello from user');
  
  let discussion = session.getDiscussion();
  let discussionStr = JSON.stringify(discussion);
  
  expect.toContain(discussionStr, '"role":"user"');
  expect.toContain(discussionStr, 'Hello from user');
});

test("addMessage assistant role", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  session.addMessage('assistant', 'Hello from assistant');
  
  let discussion = session.getDiscussion();
  let discussionStr = JSON.stringify(discussion);
  
  expect.toContain(discussionStr, '"role":"assistant"');
  expect.toContain(discussionStr, 'Hello from assistant');
});

test("addMessage system role", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  session.addMessage('system', 'System instruction');
  
  let discussion = session.getDiscussion();
  let discussionStr = JSON.stringify(discussion);
  
  expect.toContain(discussionStr, '"role":"system"');
  expect.toContain(discussionStr, 'System instruction');
});

test("addMessage multiple messages builds discussion", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  session.addMessage('user', 'First message');
  session.addMessage('assistant', 'First response');
  session.addMessage('user', 'Second message');
  
  let discussion = session.getDiscussion();
  
  expect.toEqual(discussion.length, 3);
  expect.toEqual(discussion[0].role, 'user');
  expect.toEqual(discussion[1].role, 'assistant');
  expect.toEqual(discussion[2].role, 'user');
});

test("addMessage invalid role throws", async () => {
  await expect.toThrow(async () => {
    let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
    session.addMessage('invalid', 'This should fail');
  }, "Invalid role");
});

test("addMessage empty string role throws", async () => {
  await expect.toThrow(async () => {
    let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
    session.addMessage('', 'This should fail');
  }, "Invalid role");
});

test("addMessage missing role param throws", async () => {
  await expect.toThrow(async () => {
    let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
    session.addMessage( 'This should fail');
  }, "Invalid role");
});

test("addMessage missing message param throws", async () => {
  await expect.toThrow(async () => {
    let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
    session.addMessage( 'system');
  }, "Message");
});

test("addMessage missing all param throws", async () => {
  await expect.toThrow(async () => {
    let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
    session.addMessage();
  }, "Role");
});

test("addMessage bot role throws", async () => {
  await expect.toThrow(async () => {
    let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
    session.addMessage('bot', 'This should fail');
  }, "Invalid role");
});

/* Pruning */

// Tests for pruneDiscussion()

test("pruneDiscussion PRUNE_ALL clears discussion", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  session.addMessage('user', 'First message');
  session.addMessage('assistant', 'First response');
  session.addMessage('user', 'Second message');
  
  let discussion = session.getDiscussion();
  expect.toEqual(discussion.length, 3);
  
  session.pruneDiscussion(llAmiga.PRUNE_ALL);
  
  discussion = session.getDiscussion();
  expect.toEqual(discussion.length, 0);
});

test("pruneDiscussion by index removes single message", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  session.addMessage('user', 'Message zero');
  session.addMessage('assistant', 'Message one');
  session.addMessage('user', 'Message two');
  
  session.pruneDiscussion(1);
  
  let discussion = session.getDiscussion();
  expect.toEqual(discussion.length, 2);
});

test("pruneDiscussion index 0 removes first message", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  session.addMessage('user', 'First');
  session.addMessage('assistant', 'Second');
  
  session.pruneDiscussion(0);
  
  let discussion = session.getDiscussion();
  expect.toEqual(discussion.length, 1);
});

test("pruneDiscussion out of bounds does nothing", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  session.addMessage('user', 'Only message');
  
  session.pruneDiscussion(99);
  
  let discussion = session.getDiscussion();
  expect.toEqual(discussion.length, 1);
});

test("pruneDiscussion negative index does nothing", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  session.addMessage('user', 'Only message');
  
  session.pruneDiscussion(-1);
  
  let discussion = session.getDiscussion();
  expect.toEqual(discussion.length, 1);
});

test("pruneDiscussion on empty discussion does nothing", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  
  session.pruneDiscussion(llAmiga.PRUNE_ALL);
  
  let discussion = session.getDiscussion();
  expect.toEqual(discussion.length, 0);
});





/* Chaining */

test("chain ask x2", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  let response = await session.chain()

    .ask( "testbert1", "dogs" )
    .ask( "testbert2", "cats" )
    .runAll();

  expect.toContain(response.text, "cats");
  expect.toContain(response.text, "testbert2");
});

test("chain ask x2 - metadata", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  let response = await session.chain()

    .ask( "testbert1", "dogs" )
    .ask( "testbert2", "cats" )
    .runAll();

  //remove text from response
  delete response.text;
  let responseMD = JSON.stringify(response);

  expect.toContain(responseMD, "success");
  expect.toContain(responseMD, "retries");
  expect.toContain(responseMD, "responseId");
  expect.toContain(responseMD, "totalTokens");
  expect.toContain(responseMD, "elapsedMS");
  expect.toContain(responseMD, "pluginName");
  expect.toContain(responseMD, "model");

  expect.toContain(response.pluginName, "testbert2");
});

test("chain ask x2 - LASTRESPONSE macro", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  let response = await session.chain()

    .ask( "testbert1", "dogs" )
    .ask( "testbert2", llAmiga.LASTRESPONSE +" cats" )
    .runAll();

  expect.toContain(response.text, "dogs");
  expect.toContain(response.text, "cats");
  expect.toContain(response.text, "testbert1");
  expect.toContain(response.text, "testbert2");

});

test("chain ask x2 - LASTRESPONSE and !macros", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS, { macros: false });
  let response = await session.chain()

    .ask( "testbert1", "dogs" )
    .ask( "testbert2", llAmiga.LASTRESPONSE +" cats")
    .runAll();

  expect.toNotContain(response.text, "dogs");
  expect.toContain(response.text, "cats");


});

test("chain ask 1x + config", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  let response = await session.chain()

    .ask( "testbert1", "dogs", { testmessage: "cats"} )
    .runAll();

  expect.toContain(response.text, "cats");
  expect.toContain(response.text, "dogs");
});

test("chain ask 1x + noconfig", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  let response = await session.chain()

    .ask( "testbert1", "..." )
    .runAll();

  expect.toContain(response.text, "no_test_config");

});

test("runall wo chain throws", async () => {
  await expect.toThrow(async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  response = await session.runAll();
  }, "chain");
});

test("pruneDiscussion in chain mode throws", async () => {
  await expect.toThrow(async () => {
    let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
    session.addMessage('user', 'Message');
    session.chain().pruneDiscussion(0);
  }, "chain mode");
});

test("getConfig in chain mode throws", async () => {
  await expect.toThrow(async () => {
    let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
    session.addMessage('user', 'Message');
    session.chain().getConfig(0);
  }, "chain mode");
});

test("setConfig in chain mode throws", async () => {
  await expect.toThrow(async () => {
    let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
    session.addMessage('user', 'Message');
    session.chain().setConfig( {});
  }, "chain mode");
});

test("clearConfig in chain mode throws", async () => {
  await expect.toThrow(async () => {
    let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
    session.addMessage('user', 'Message');
    session.chain().clearConfig();
  }, "chain mode");
});

test("getProviderName in chain mode throws", async () => {
  await expect.toThrow(async () => {
    let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
    session.addMessage('user', 'Message');
    session.chain().getProviderName();
  }, "chain mode");
});

test("getModel in chain mode throws", async () => {
  await expect.toThrow(async () => {
    let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
    session.addMessage('user', 'Message');
    session.chain().getModel();
  }, "chain mode");
});

test("getLastDetailedResponse in chain mode throws", async () => {
  await expect.toThrow(async () => {
    let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
    session.addMessage('user', 'Message');
    session.chain().getLastDetailedResponse();
  }, "chain mode");
});

test("addMessage in chain mode throws", async () => {
  await expect.toThrow(async () => {
    let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
    session.chain().addMessage('user', 'Message');
  }, "chain mode");
});

test("setSystemMessage in chain mode throws", async () => {
  await expect.toThrow(async () => {
    let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
    session.chain().setSystemMessage('System message');
  }, "chain mode");
});

/* Configuration */

test("getConfig returns undefined when no config set", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  let config = session.getConfig('testbert1', 'default');
  expect.toEqual(config, undefined);
});

test("getConfig retrieves config set with setConfig", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  session.setConfig('testbert1', { temperature: 0.7, maxTokens: 100 });
  
  let config = session.getConfig('testbert1', 'default');
  expect.toEqual(config.temperature, 0.7);
  expect.toEqual(config.maxTokens, 100);
});

test("getConfig retrieves model-specific config", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  session.setConfig('testbert1', 'custom-model', { temperature: 0.9 });
  
  let config = session.getConfig('testbert1', 'custom-model');
  expect.toEqual(config.temperature, 0.9);
});

test("getConfig falls back to default when model config not found", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  session.setConfig('testbert1', { temperature: 0.5 });
  
  let config = session.getConfig('testbert1', 'nonexistent-model');
  expect.toEqual(config.temperature, 0.5);
});

test("clearConfig removes config", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  session.setConfig('testbert1', { temperature: 0.7 });
  session.clearConfig('testbert1');
  
  let config = session.getConfig('testbert1', 'default');
  expect.toEqual(config, undefined);
});

test("clearConfig invalid plugin throws", async () => {
  await expect.toThrow(async () => {
    let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
    session.clearConfig('nonexistent');
  }, "No plugin");
});


/* Plugin System */

test("getPluginList ALL_PLUGINS returns all plugins", async () => {
  let list = llAmiga.getPluginList([llAmiga.ALL_PLUGINS]);
  expect.toContain(list.join(','), 'ollama');
  expect.toContain(list.join(','), 'openai');
  expect.toContain(list.join(','), 'anthropic');
  expect.toContain(list.join(','), 'testbert1');
});

test("getPluginList ALL_CLOUD_LLM_PLUGINS returns cloud LLMs", async () => {
  let list = llAmiga.getPluginList([llAmiga.ALL_CLOUD_LLM_PLUGINS]);
  expect.toContain(list.join(','), 'openai');
  expect.toContain(list.join(','), 'anthropic');
  // should NOT contain test plugins
  let hasTest = list.includes('testbert1');
  expect.toEqual(hasTest, false);
});

test("getPluginList ALL_GROUP_PLUGINS returns group plugins", async () => {
  let list = llAmiga.getPluginList([llAmiga.ALL_GROUP_PLUGINS]);
  expect.toContain(list.join(','), 'councillius');
});

test("single plugin auto-selects as active", async () => {
  let session = llAmiga.createSession('testbert1');
  
  // Should be auto-selected, no need to call setLM
  let providerName = session.getProviderName();
  expect.toEqual(providerName, 'testbert1');
  
  // Should be able to ask without setLM
  let response = await session.ask("Hello");
  expect.toContain(response.text, "TestBert1");
});


/* Edge Cases */

test("rawChat direct call works", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  let response = await session.rawChat('testbert1', 'Hello', null, null);
  expect.toContain(response.text, "TestBert1");
});

test("rawChat with discussion", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  let discussion = [
    { role: 'user', content: 'First message' },
    { role: 'assistant', content: 'First response' }
  ];
  let response = await session.rawChat('testbert1', 'Follow up', discussion, null);
  expect.toEqual(response.success, true);
});

test("setSystemMessage replaces existing system message", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  session.setSystemMessage("First system message");
  session.setSystemMessage("Replacement system message");
  
  let discussion = session.getDiscussion();
  expect.toEqual(discussion.length, 1);
  expect.toEqual(discussion[0].role, 'system');
  expect.toContain(discussion[0].content, "Replacement");
});

test("setSystemMessage inserts at position 0 when other messages exist", async () => {
  let session = llAmiga.createSession(llAmiga.ALL_TEST_PLUGINS);
  session.addMessage('user', 'User message');
  session.addMessage('assistant', 'Assistant message');
  session.setSystemMessage("Late system message");
  
  let discussion = session.getDiscussion();
  expect.toEqual(discussion.length, 3);
  expect.toEqual(discussion[0].role, 'system');
  expect.toEqual(discussion[1].role, 'user');
  expect.toEqual(discussion[2].role, 'assistant');
});

test("empty plugin array throws", async () => {
  await expect.toThrow(async () => {
    let session = llAmiga.createSession([]);
  }, "empty");
});

// --- Run all tests ---
console.log("\n--- Running tests ---\n");

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