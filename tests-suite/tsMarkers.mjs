// SPDX-License-Identifier: Apache-2.0
/*
Copyright 2025-2026 Dusty Wilhelm Murray (Semantic Tools)

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0
*/

import { validateSections, parseAndFilterSections } from '../src/llm/common/markers.mjs';
import { test, expect } from './testUtils.mjs';

// --- validateSections ---

test("validateSections: empty content returns []", () => {
  const ids = validateSections('');
  expect.toEqual(ids.length, 0);
});

test("validateSections: no markers returns []", () => {
  const ids = validateSections('just plain text');
  expect.toEqual(ids.length, 0);
});

test("validateSections: single section returns its id", () => {
  const ids = validateSections('prefix <<seed>>body<</seed>> suffix');
  expect.toEqual(ids.length, 1);
  expect.toEqual(ids[0], 'seed');
});

test("validateSections: multiple sections returns all ids in order", () => {
  const ids = validateSections('<<a>>x<</a>> middle <<b>>y<</b>> end');
  expect.toEqual(ids.length, 2);
  expect.toEqual(ids[0], 'a');
  expect.toEqual(ids[1], 'b');
});

test("validateSections: throws on duplicate id", () => {
  let threw = false;
  try {
    validateSections('<<a>>x<</a>> <<a>>y<</a>>');
  } catch (e) {
    threw = true;
    expect.toContain(e.message, "Duplicate section 'a'");
  }
  expect.toEqual(threw, true);
});

test("validateSections: throws on nested sections", () => {
  let threw = false;
  try {
    validateSections('<<a>> outer <<b>> inner <</b>> still outer <</a>>');
  } catch (e) {
    threw = true;
    expect.toContain(e.message, 'Nested sections not supported');
  }
  expect.toEqual(threw, true);
});

test("validateSections: unclosed opener is ignored (no throw)", () => {
  const ids = validateSections('prefix <<seed>> body without close');
  expect.toEqual(ids.length, 0);
});

test("validateSections: section ids may contain digits, hyphens, underscores", () => {
  const ids = validateSections('<<a-1>>x<</a-1>> <<b_2>>y<</b_2>>');
  expect.toEqual(ids.length, 2);
  expect.toEqual(ids[0], 'a-1');
  expect.toEqual(ids[1], 'b_2');
});

test("validateSections: <<<< escape does not become an opener", () => {
  const ids = validateSections('this has <<<<seed>>literal text');
  expect.toEqual(ids.length, 0);
});

test("validateSections: section ids must start with letter", () => {
  // <<1foo>> is not a valid id (starts with digit) — treated as literal
  const ids = validateSections('<<1foo>>x<</1foo>>');
  expect.toEqual(ids.length, 0);
});

// --- parseAndFilterSections ---

test("parseAndFilterSections: no markers leaves content unchanged", () => {
  const out = parseAndFilterSections('plain text', new Set());
  expect.toEqual(out, 'plain text');
});

test("parseAndFilterSections: visible section keeps body, strips delimiters", () => {
  const out = parseAndFilterSections('prefix <<seed>>BODY<</seed>> suffix', new Set());
  expect.toEqual(out, 'prefix BODY suffix');
});

test("parseAndFilterSections: hidden section drops whole block", () => {
  const out = parseAndFilterSections('prefix <<seed>>BODY<</seed>> suffix', new Set(['seed']));
  expect.toEqual(out, 'prefix  suffix');
});

test("parseAndFilterSections: only hides what's in the set", () => {
  const out = parseAndFilterSections(
    'A <<a>>aa<</a>> B <<b>>bb<</b>> C',
    new Set(['b'])
  );
  expect.toEqual(out, 'A aa B  C');
});

test("parseAndFilterSections: stray opener (no close) is stripped", () => {
  // Per the plan, leftover markers are stripped silently at submission time.
  const out = parseAndFilterSections('prefix <<seed>> dangling', new Set());
  expect.toEqual(out, 'prefix  dangling');
});

test("parseAndFilterSections: stray close (no open) is stripped", () => {
  const out = parseAndFilterSections('prefix <</seed>> dangling', new Set());
  expect.toEqual(out, 'prefix  dangling');
});

test("parseAndFilterSections: <<<< restored to literal << after processing", () => {
  const out = parseAndFilterSections('he said <<<<hello>> politely', new Set());
  expect.toEqual(out, 'he said <<hello>> politely');
});

test("parseAndFilterSections: escape protects against accidental matching", () => {
  // <<<<seed>>...<</seed>> — the opener is escaped, so the close becomes stray and is stripped.
  const out = parseAndFilterSections('<<<<seed>>content<</seed>>', new Set());
  expect.toEqual(out, '<<seed>>content');
});

test("parseAndFilterSections: undefined hiddenSections treated as empty", () => {
  const out = parseAndFilterSections('<<a>>x<</a>>', undefined);
  expect.toEqual(out, 'x');
});

test("parseAndFilterSections: empty string returns empty string", () => {
  const out = parseAndFilterSections('', new Set());
  expect.toEqual(out, '');
});

test("parseAndFilterSections: section bodies can contain newlines", () => {
  const out = parseAndFilterSections('<<seed>>line1\nline2\nline3<</seed>>', new Set());
  expect.toEqual(out, 'line1\nline2\nline3');
});

test("parseAndFilterSections: hidden section with multi-line body cleanly removed", () => {
  const out = parseAndFilterSections('keep <<seed>>line1\nline2<</seed>> kept', new Set(['seed']));
  expect.toEqual(out, 'keep  kept');
});

// --- combined / interaction ---

test("validate + parse: validated content survives parse with empty hidden set", () => {
  const content = 'one <<a>>aa<</a>> two <<b>>bb<</b>> three';
  validateSections(content);  // shouldn't throw
  const out = parseAndFilterSections(content, new Set());
  expect.toEqual(out, 'one aa two bb three');
});

test("validate + parse: hiding sections after validation works", () => {
  const content = 'one <<a>>aa<</a>> two <<b>>bb<</b>> three';
  validateSections(content);
  const out = parseAndFilterSections(content, new Set(['a']));
  expect.toEqual(out, 'one  two bb three');
});

// --- Run all tests ---

console.log("\n--- Running markers tests ---\n");

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
