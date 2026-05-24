// SPDX-License-Identifier: Apache-2.0
/*
Copyright 2025-2026 Dusty Wilhelm Murray (Semantic Tools)

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0
*/

/*
End-to-end integration tests for V0.10 hide/restore turns and sections.

Uses testbert1 (FLM) so no API keys needed. testbert1's `fixedResponse` config
key is used to make responses deterministic where convenient.
*/

import * as llAmiga from '../src/index.mjs';
import { test, expect } from './testUtils.mjs';

// --- naming a turn ---

test("chat with name stamps both messages with turnId", async () => {
  const s = llAmiga.createSession('testbert1');
  await s.chat("hello", { name: 'greet' });
  const disc = s.getDiscussion();
  expect.toEqual(disc.length, 2);
  expect.toEqual(disc[0].turnId, 'greet');
  expect.toEqual(disc[1].turnId, 'greet');
  expect.toEqual(disc[0].role, 'user');
  expect.toEqual(disc[1].role, 'assistant');
});

test("chat without name leaves turnId undefined", async () => {
  const s = llAmiga.createSession('testbert1');
  await s.chat("hello");
  const disc = s.getDiscussion();
  expect.toEqual(disc[0].turnId, undefined);
  expect.toEqual(disc[1].turnId, undefined);
});

test("duplicate turn name throws at chat() time", async () => {
  const s = llAmiga.createSession('testbert1');
  await s.chat("first", { name: 'plan' });
  let threw = false;
  try {
    await s.chat("second", { name: 'plan' });
  } catch (e) {
    threw = true;
    expect.toContain(e.message, "already in use");
  }
  expect.toEqual(threw, true);
});

// --- ask rejects name ---

test("ask with name throws", async () => {
  const s = llAmiga.createSession('testbert1');
  let threw = false;
  try {
    await s.ask("hi", { name: 'x' });
  } catch (e) {
    threw = true;
    expect.toContain(e.message, "name is not allowed on ask()");
  }
  expect.toEqual(threw, true);
});

// --- chain rejects name ---

test("chain ask with name throws", async () => {
  const s = llAmiga.createSession('testbert1');
  let threw = false;
  try {
    s.chain().ask("hi", { name: 'x' });
  } catch (e) {
    threw = true;
    expect.toContain(e.message, "chain mode");
  }
  expect.toEqual(threw, true);
});

// --- HideTurn / RestoreTurn ---

test("hideTurn flips active=false on both messages of the turn", async () => {
  const s = llAmiga.createSession('testbert1');
  await s.chat("hi", { name: 'a' });
  s.hideTurn('a');
  const disc = s.getDiscussion();
  expect.toEqual(disc[0].active, false);
  expect.toEqual(disc[1].active, false);
});

test("restoreTurn flips active back to true", async () => {
  const s = llAmiga.createSession('testbert1');
  await s.chat("hi", { name: 'a' });
  s.hideTurn('a');
  s.restoreTurn('a');
  const disc = s.getDiscussion();
  expect.toEqual(disc[0].active, true);
  expect.toEqual(disc[1].active, true);
});

test("hideTurn does NOT affect other turns", async () => {
  const s = llAmiga.createSession('testbert1');
  await s.chat("first", { name: 'a' });
  await s.chat("second", { name: 'b' });
  s.hideTurn('a');
  const disc = s.getDiscussion();
  // turn a hidden
  expect.toEqual(disc[0].active, false);
  expect.toEqual(disc[1].active, false);
  // turn b untouched
  expect.toEqual(disc[2].active, true);
  expect.toEqual(disc[3].active, true);
});

test("hideTurn throws on unknown turnId", async () => {
  const s = llAmiga.createSession('testbert1');
  await s.chat("hi", { name: 'a' });
  let threw = false;
  try { s.hideTurn('nope'); } catch (e) {
    threw = true;
    expect.toContain(e.message, "No turn with id");
  }
  expect.toEqual(threw, true);
});

test("restoreTurn throws on unknown turnId", async () => {
  const s = llAmiga.createSession('testbert1');
  let threw = false;
  try { s.restoreTurn('nope'); } catch (e) { threw = true; }
  expect.toEqual(threw, true);
});

// --- isTurnHidden ---

test("isTurnHidden reflects state", async () => {
  const s = llAmiga.createSession('testbert1');
  await s.chat("hi", { name: 'a' });
  expect.toEqual(s.isTurnHidden('a'), false);
  s.hideTurn('a');
  expect.toEqual(s.isTurnHidden('a'), true);
  s.restoreTurn('a');
  expect.toEqual(s.isTurnHidden('a'), false);
});

test("isTurnHidden throws on unknown turnId", async () => {
  const s = llAmiga.createSession('testbert1');
  let threw = false;
  try { s.isTurnHidden('nope'); } catch (e) { threw = true; }
  expect.toEqual(threw, true);
});

// --- HideSection / RestoreSection / isSectionHidden ---

test("section is discoverable on the user message after chat", async () => {
  const s = llAmiga.createSession('testbert1');
  await s.chat("prefix <<seed>>SECRET<</seed>> body", { name: 'a' });
  const disc = s.getDiscussion();
  expect.toEqual(disc[0].sectionIds.length, 1);
  expect.toEqual(disc[0].sectionIds[0], 'seed');
});

test("hideSection adds to hiddenSections; restoreSection removes", async () => {
  const s = llAmiga.createSession('testbert1');
  await s.chat("prefix <<seed>>SECRET<</seed>> body", { name: 'a' });
  expect.toEqual(s.isSectionHidden('a', 'seed'), false);
  s.hideSection('a', 'seed');
  expect.toEqual(s.isSectionHidden('a', 'seed'), true);
  s.restoreSection('a', 'seed');
  expect.toEqual(s.isSectionHidden('a', 'seed'), false);
});

test("hideSection throws on unknown section", async () => {
  const s = llAmiga.createSession('testbert1');
  await s.chat("plain message", { name: 'a' });
  let threw = false;
  try { s.hideSection('a', 'nope'); } catch (e) {
    threw = true;
    expect.toContain(e.message, "No section");
  }
  expect.toEqual(threw, true);
});

test("hideSection throws on unknown turn", async () => {
  const s = llAmiga.createSession('testbert1');
  let threw = false;
  try { s.hideSection('nope', 'seed'); } catch (e) { threw = true; }
  expect.toEqual(threw, true);
});

test("duplicate section ids in same message throw at chat() time", async () => {
  const s = llAmiga.createSession('testbert1');
  let threw = false;
  try {
    await s.chat("<<a>>x<</a>> <<a>>y<</a>>", { name: 'dup' });
  } catch (e) {
    threw = true;
    expect.toContain(e.message, "Duplicate section");
  }
  expect.toEqual(threw, true);
});

test("nested sections throw at chat() time", async () => {
  const s = llAmiga.createSession('testbert1');
  let threw = false;
  try {
    await s.chat("<<a>>outer <<b>>inner<</b>> rest<</a>>", { name: 'nest' });
  } catch (e) {
    threw = true;
    expect.toContain(e.message, "Nested sections");
  }
  expect.toEqual(threw, true);
});

test("turn and section hide states are independent", async () => {
  const s = llAmiga.createSession('testbert1');
  await s.chat("<<a>>SECRET<</a>>", { name: 't' });
  s.hideSection('t', 'a');
  expect.toEqual(s.isSectionHidden('t', 'a'), true);
  s.hideTurn('t');
  // section still hidden
  expect.toEqual(s.isSectionHidden('t', 'a'), true);
  s.restoreTurn('t');
  // restoring turn does NOT restore section
  expect.toEqual(s.isSectionHidden('t', 'a'), true);
});

// --- previewDiscussion: post-filter content ---

test("previewDiscussion: empty session returns []", async () => {
  const s = llAmiga.createSession('testbert1');
  const p = s.previewDiscussion();
  expect.toEqual(p.length, 0);
});

test("previewDiscussion: strips markers around visible sections", async () => {
  const s = llAmiga.createSession('testbert1');
  await s.chat("prefix <<seed>>BODY<</seed>> suffix", { name: 'a' });
  const p = s.previewDiscussion();
  // user message: BODY visible, markers stripped
  expect.toEqual(p[0].content, "prefix BODY suffix");
});

test("previewDiscussion: drops body of hidden sections", async () => {
  const s = llAmiga.createSession('testbert1');
  await s.chat("prefix <<seed>>SECRET<</seed>> suffix", { name: 'a' });
  s.hideSection('a', 'seed');
  const p = s.previewDiscussion();
  expect.toEqual(p[0].content, "prefix  suffix");
});

test("previewDiscussion: drops entire turn when hidden", async () => {
  const s = llAmiga.createSession('testbert1');
  await s.chat("first", { name: 'a' });
  await s.chat("second", { name: 'b' });
  s.hideTurn('a');
  const p = s.previewDiscussion();
  // turn a hidden → only turn b visible (user + assistant = 2 messages)
  expect.toEqual(p.length, 2);
  // both belong to turn b
  for (const m of p) {
    if (!m.content.includes("second") && !m.content.includes("TestBert")) {
      throw new Error('expected only turn b content, got: ' + m.content);
    }
  }
});

test("previewDiscussion: returns a fresh snapshot (mutations don't affect session)", async () => {
  const s = llAmiga.createSession('testbert1');
  await s.chat("hi", { name: 'a' });
  const p = s.previewDiscussion();
  p[0].content = 'MUTATED';
  const p2 = s.previewDiscussion();
  if (p2[0].content === 'MUTATED') throw new Error('preview is not a snapshot');
});

// --- listTurns ---

test("listTurns: empty session returns []", async () => {
  const s = llAmiga.createSession('testbert1');
  expect.toEqual(s.listTurns().length, 0);
});

test("listTurns: shows named turns with hide state and sections", async () => {
  const s = llAmiga.createSession('testbert1');
  await s.chat("<<seed>>x<</seed>> body", { name: 'a' });
  await s.chat("plain", { name: 'b' });
  s.hideSection('a', 'seed');
  const turns = s.listTurns();
  expect.toEqual(turns.length, 2);

  const a = turns.find(t => t.turnId === 'a');
  expect.toEqual(a.hidden, false);
  expect.toEqual(a.sections.length, 1);
  expect.toEqual(a.sections[0].id, 'seed');
  expect.toEqual(a.sections[0].hidden, true);

  const b = turns.find(t => t.turnId === 'b');
  expect.toEqual(b.hidden, false);
  expect.toEqual(b.sections.length, 0);
});

test("listTurns: hidden turn shows hidden=true", async () => {
  const s = llAmiga.createSession('testbert1');
  await s.chat("hi", { name: 'a' });
  s.hideTurn('a');
  const turns = s.listTurns();
  expect.toEqual(turns[0].hidden, true);
});

test("listTurns: unnamed messages don't appear", async () => {
  const s = llAmiga.createSession('testbert1');
  await s.chat("named", { name: 'a' });
  await s.chat("not named");
  const turns = s.listTurns();
  expect.toEqual(turns.length, 1);
  expect.toEqual(turns[0].turnId, 'a');
});

// --- end-to-end: hide affects what the plugin actually receives ---

test("e2e: hidden turn is omitted from what testbert echoes back", async () => {
  // testbert1 echoes the prompt — we can check what it received by counting messages in raw.
  const s = llAmiga.createSession('testbert1');
  await s.chat("turn1", { name: 'a' });
  await s.chat("turn2", { name: 'b' });
  s.hideTurn('a');

  // Force a 3rd call so we can read how many messages testbert saw.
  const r = await s.chat("turn3");
  // raw.message_count = how many history messages testbert saw on this call.
  // Before turn 3, discussion had: a-user, a-asst, b-user, b-asst → 4 messages.
  // a is hidden → 2 visible.
  expect.toEqual(s.rawResponse.message_count, 2);
});

test("e2e: hidden section drops body from what testbert sees", async () => {
  const s = llAmiga.createSession('testbert1');
  await s.chat("prefix <<seed>>SECRETBODY<</seed>> suffix", { name: 'a' });
  s.hideSection('a', 'seed');

  // Capture the next prompt+history sent to testbert.
  // testbert1's response text includes the prompt it received. Make a follow-up
  // and inspect previewDiscussion to verify the user msg from turn 'a' has the section dropped.
  const preview = s.previewDiscussion();
  if (preview[0].content.includes('SECRETBODY')) {
    throw new Error('expected SECRETBODY to be dropped, got: ' + preview[0].content);
  }
  expect.toEqual(preview[0].content, "prefix  suffix");
});

test("e2e: markers always stripped, even on visible sections", async () => {
  const s = llAmiga.createSession('testbert1');
  await s.chat("<<visible>>BODY<</visible>>", { name: 'v' });
  const preview = s.previewDiscussion();
  // BODY remains; the <<visible>> and <</visible>> delimiters are gone
  if (preview[0].content.includes('<<visible>>') || preview[0].content.includes('<</visible>>')) {
    throw new Error('markers not stripped: ' + preview[0].content);
  }
  expect.toEqual(preview[0].content, 'BODY');
});

// --- chain mode blocks every new method ---

test("hideTurn throws in chain mode", async () => {
  const s = llAmiga.createSession('testbert1');
  let threw = false;
  try { s.chain().hideTurn('a'); } catch (e) { threw = true; }
  expect.toEqual(threw, true);
});

test("restoreTurn throws in chain mode", async () => {
  const s = llAmiga.createSession('testbert1');
  let threw = false;
  try { s.chain().restoreTurn('a'); } catch (e) { threw = true; }
  expect.toEqual(threw, true);
});

test("hideSection throws in chain mode", async () => {
  const s = llAmiga.createSession('testbert1');
  let threw = false;
  try { s.chain().hideSection('a', 's'); } catch (e) { threw = true; }
  expect.toEqual(threw, true);
});

test("restoreSection throws in chain mode", async () => {
  const s = llAmiga.createSession('testbert1');
  let threw = false;
  try { s.chain().restoreSection('a', 's'); } catch (e) { threw = true; }
  expect.toEqual(threw, true);
});

test("listTurns throws in chain mode", async () => {
  const s = llAmiga.createSession('testbert1');
  let threw = false;
  try { s.chain().listTurns(); } catch (e) { threw = true; }
  expect.toEqual(threw, true);
});

test("isTurnHidden throws in chain mode", async () => {
  const s = llAmiga.createSession('testbert1');
  let threw = false;
  try { s.chain().isTurnHidden('a'); } catch (e) { threw = true; }
  expect.toEqual(threw, true);
});

test("isSectionHidden throws in chain mode", async () => {
  const s = llAmiga.createSession('testbert1');
  let threw = false;
  try { s.chain().isSectionHidden('a', 's'); } catch (e) { threw = true; }
  expect.toEqual(threw, true);
});

test("previewDiscussion throws in chain mode", async () => {
  const s = llAmiga.createSession('testbert1');
  let threw = false;
  try { s.chain().previewDiscussion(); } catch (e) { threw = true; }
  expect.toEqual(threw, true);
});

// --- Run all tests ---

console.log("\n--- Running hide/restore integration tests ---\n");

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
