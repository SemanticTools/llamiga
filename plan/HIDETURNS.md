# LLaMiga — Hide/Restore Turns and Sections

## Goals

1. Let callers name a `chat()` turn, then later **hide** it from LLM submission without destroying it.
2. Let callers mark **sections** inside a prompt and hide/restore them independently of the turn.
3. Reversible: any hide can be undone via the symmetric restore. Nothing is dropped from `this.discussion`.
4. **All section markers are stripped before submission**, regardless of hide state — sections leave no trace in what the LLM sees.

## Out of scope

- Cloning / forking a discussion (the data model leaves this easy to add later).
- Per-message hide granularity that splits a turn (hide just the user message but keep the assistant reply, or vice versa).
- Tag-style names (a turnId that matches multiple turns). Names are unique identifiers, not labels.
- Naming turns produced by `ask()` or in chain mode (rejected explicitly).
- Editing message content in-place (use `pruneDiscussion`/`truncateStrings` if destructive edits are needed).

---

## 1. Concepts

### Turn
A turn is one `chat()` call. It produces **two messages** — a user prompt and an assistant response — that share a `turnId`. The turnId is supplied by the caller via the `name` option:

```js
await session.chat("Write me a plan...", { name: 'plan-turn' });
```

Turn names are **unique across the session**. Attempting to reuse a name throws at the `chat()` call.

A turn is "emergent" — there is no separate turn object on the session. It's just the set of messages in `discussion` that share a `turnId`. Discovery is via `discussion.filter(m => m.turnId === id)`.

### Section
A section is a named substring of one message's content, marked inline with delimiters:

```
<<seed>>Seed: red, fast, electric<</seed>>
```

- Section names are **scoped to their turn** — two turns may both have a `seed` section without conflict.
- Sections are addressed by `(turnId, sectionId)` pair.
- Section markers are **always removed before LLM submission**, regardless of whether the section is hidden.

### Hidden vs visible

- A message is **visible** when `message.active === true` (the default).
- A section is **visible** when its id is **not** in `message.hiddenSections`.
- Hide and restore for turn vs section are **independent axes**. Hiding a turn does not hide its sections separately, and vice versa. Restoring a turn does not restore individually-hidden sections inside it.

---

## 2. Marker syntax

```
<<sectionId>>content<</sectionId>>
```

- `sectionId` matches `[A-Za-z][\w-]*` — identifier-like, ASCII.
- Single-pass parser, non-nested. Nested sections (a `<<x>><<y>>…<</y>><</x>>`) are not supported in V0.10 — declared an error at `chat()` time.
- A literal `<<` in user content can be escaped as `<<<<` (parser collapses to `<<` after section extraction).
- An unclosed marker (`<<seed>>` without `<</seed>>`) is treated as literal text — it stays in `content` and is stripped silently at submission. No error. Rationale: malformed markup in arbitrary user-fed prompt text shouldn't crash the call.
- Duplicate section names within the same message (`<<seed>>...<</seed>>...<<seed>>...<</seed>>`) — throws at `chat()` time.

### Why `<<…>>` and not `[[…]]`

`[[foo]]` collides with markdown wikilinks and other prompt content. `<<foo>>` is rarer in natural text and code, less likely to trigger an accidental section match. Tradeoff: documented escape with `<<<<` for prompts that genuinely contain `<<`.

---

## 3. Data shape changes

### Message shape (existing fields preserved, two added)

```js
{
  msgId: <integer>,
  role: 'user' | 'assistant' | 'system',
  content: <string, raw with markers>,
  active: <boolean>,         // existing; now load-bearing (was unused)
  turnId: <string?>,         // new — present only for chat-created messages with a name
  hiddenSections: <Set>,     // new — section ids hidden in this message
}
```

- `active`: existed since V0.0 but no code read it. From V0.10 onward, the submission pipeline filters on it. Default still `true`.
- `turnId`: undefined when absent. Only set by named `chat()` calls.
- `hiddenSections`: empty `Set` by default. Stored as a Set for O(1) membership checks; documented in the API but serialized as a plain array when crossing JSON boundaries.

### Session state

**No new fields on the session.** All hide/restore state lives on individual messages, ensuring `setDiscussion()` and (future) `clone()` move state coherently with the data.

---

## 4. API surface

All new methods are blocked in chain mode (matching the existing convention for `addMessage` / `setConfig` / etc.).

### Naming a turn

The `name` option lives inside the existing third-argument options object on `chat()`:

```js
chat(prompt)                                                  // no name
chat(prompt, { name: 'plan' })                                // named
chat(provider, prompt)                                        // no name
chat(provider, prompt, { name: 'plan' })                      // named
chat(provider, prompt, { name: 'plan', retry: {...} })        // named + other config
```

Discrimination between forms uses `typeof p2 === 'string'` — unchanged from today.

- `ask()` rejects `name` with an explicit error.
- Chain mode's `chainAsk` rejects `name` with an explicit error (current chain doesn't persist messages, so names have nowhere to attach).
- `addMessage()` and `setSystemMessage()` stay nameless. We deliberately do **not** accept a `turnId` argument there — that would let callers construct half-turns (user without matching assistant), breaking the pair invariant.

### Hide / Restore — turns

```js
session.hideTurn(turnId)
session.restoreTurn(turnId)
```

Behavior:
- Finds all messages with `message.turnId === turnId`.
- Throws `'No turn with id ...'` if zero matches (typo safety, per V0.9 TECHNICALDEBT discussion).
- Flips `active` on each matching message — `false` for hide, `true` for restore.
- Section-level state inside the turn is **untouched** — turn and section axes are independent.

### Hide / Restore — sections

```js
session.hideSection(turnId, sectionId)
session.restoreSection(turnId, sectionId)
```

Behavior:
- Finds the message in the turn that contains `sectionId` (typically the user message).
- Throws `'No section ... in turn ...'` if not found.
- Adds/removes `sectionId` from `message.hiddenSections`.
- Does not modify `active`. A turn can have hidden sections while still being submitted, or vice versa.

### Inspection

```js
session.listTurns()
// → [
//     {
//       turnId: 'plan',
//       hidden: false,
//       sections: [
//         { id: 'seed', hidden: true },
//         { id: 'goals', hidden: false }
//       ]
//     },
//     ...
//   ]

session.isTurnHidden(turnId)              // → boolean
session.isSectionHidden(turnId, sectionId) // → boolean

session.previewDiscussion()
// → [
//     { role: 'system', content: '...' },
//     { role: 'user', content: '...' },     // post-filter, markers stripped
//     ...
//   ]
```

`previewDiscussion()` returns the canonical llamiga shape (`{role, content}` pairs) that would be sent to the LLM after all filtering. It does **not** apply per-provider role translation (e.g. Gemini's `assistant` → `model` mapping) — that stays inside each plugin.

The returned array is a **fresh snapshot** — each call walks `this.discussion`, parses sections, and produces new `{role, content}` objects. Callers may mutate the result with zero side effects on the session.

`listTurns` walks `discussion` and groups by `turnId`. Messages without a `turnId` are not returned (they're addressable only by `msgId` / index via existing APIs).

`isTurnHidden` returns true iff *all* messages in the turn have `active === false`. Since the only API that touches `active` is `hideTurn`/`restoreTurn` (which act on the whole turn), this should match user intuition. If a caller bypasses the API and pokes one message manually, behavior is undefined.

**Chain mode:** all inspection helpers are blocked in chain mode (consistent with the existing convention — `getDiscussion` and other read methods block in chain mode today). See TECHNICALDEBT for a deferred relaxation of this rule.

---

## 5. Submission pipeline

The change lives in `_rawChat` (`src/index.mjs`), right before `plugin.complete()` is called. The four-layer config merge from V0.9 is unchanged; this adds a *content* filter on the discussion array.

```
preparedDiscussion = []
for msg in this.discussion:
  if msg.active === false: continue        // turn-level hide

  cleaned = parseAndFilterSections(msg.content, msg.hiddenSections || new Set())
  preparedDiscussion.push({ ...msg, content: cleaned })

// preparedDiscussion is then passed as `discussion` to plugin.complete()
```

Where `parseAndFilterSections`:

```
parseAndFilterSections(content, hiddenSections):
  scan for <<id>>...<</id>> markers
  for each section found:
    if hiddenSections.has(id): drop the entire <<id>>...<</id>> block
    else: keep the inner content, drop just the <<id>> and <</id>> delimiters
  unescape <<<< → << in remaining text
  return result
```

The original `msg.content` is **never modified** by this pipeline. Only the per-call submission gets the filtered version.

---

## 6. Error semantics

All errors thrown by the new APIs are plain `Error` objects with a message. They are **not** part of the V0.9 classified-error taxonomy (those represent LLM failures; these are caller-API misuse).

| Trigger | Error message pattern |
|---|---|
| `chat(prompt, { name: X })` where X is already in use | `Turn name 'X' already in use` |
| `ask(prompt, { name: X })` | `name is not allowed on ask() — use chat()` |
| chain-mode `chainAsk` with name | `name is not allowed in chain mode` |
| Duplicate section ids in same message | `Duplicate section 'X' in turn 'Y'` |
| Nested sections | `Nested sections not supported: 'X' inside 'Y'` |
| `hideTurn` / `restoreTurn` with unknown turnId | `No turn with id 'X'` |
| `hideSection` / `restoreSection` with unknown turn or section | `No section 'X' in turn 'Y'` |
| Any of the new methods in chain mode (other than `chainAsk`) | `Cannot <method> in chain mode` |

---

## 7. Interactions with existing API

| Existing API | Interaction |
|---|---|
| `addMessage(role, content)` | Unchanged. Manually-added messages have no `turnId` and an empty `hiddenSections`. They're affected by the submission filter only via `active` (which stays `true` unless something flips it — and nothing does outside `hideTurn`). |
| `setSystemMessage(content)` | Unchanged. System messages are not part of turns. Markers inside the system message are still parsed and stripped at submission (consistent with the "markers always hidden" rule). Section hides on the system message are not currently addressable (no `turnId`), so effectively the only thing that happens to it is marker stripping. |
| `getDiscussion()` | Returns the live array, now with new fields (`turnId`, `hiddenSections`) on some messages. Callers reading the array directly will see them. Documented in README. |
| `setDiscussion(arr)` | Replaces the discussion. If the supplied messages have `turnId` / `active` / `hiddenSections`, those are honored as-is. No re-validation — caller takes ownership. Invariants (each turnId appears 0 or 2 times; distinct turns don't share a turnId) are documented but not enforced; the caller is responsible. |
| `pruneDiscussion(index)` | Unchanged; destructive. If used to remove a message that was part of a named turn, the turn becomes "half" — `isTurnHidden` and `listTurns` still operate over whatever messages remain. Caller's responsibility. |
| `truncateStrings(items, maxLen)` | Unchanged; destructive substring replacement. Operates on `content` directly, so it can technically remove section markers. If that happens, those sections become un-addressable. Caller's responsibility. |

---

## 8. File changes

| File | Change |
|---|---|
| `src/index.mjs` | Extend `chat()` / `chatStream()` to accept `options.name`; update `addMessage` to optionally accept `turnId` from internal callers (not the public signature); add `hideTurn`, `restoreTurn`, `hideSection`, `restoreSection`, `listTurns`, `isTurnHidden`, `isSectionHidden`, `previewDiscussion`; update `_rawChat` submission pipeline with marker parsing + active filter; reject `name` in `directAsk` and `chainAsk`. |
| `src/llm/common/markers.mjs` | **new** — `parseSections(content, hiddenSet) -> filteredContent`, plus validation helpers (`findDuplicateSections`, `findNestedSections`). |
| `tests-suite/tsHideTurns.mjs` | **new** — integration tests via testbert plugins. See §10. |
| `README.md` | New section "Hiding turns and sections" with examples. Update Session Methods table with the new methods. |
| `plan/HIDETURNS.md` | This file. |

No plugin changes required — the submission pipeline assembles a normal `discussion` array, plugins are agnostic to whether content went through marker parsing.

---

## 9. Behavior changes visible to callers

1. **`chat()` accepts a `name` option.** Existing callers passing `overrideConfig` continue to work — `name` is an additional optional field on the same options object.
2. **Messages have new fields.** Callers using `getDiscussion()` and reading raw messages will see `turnId` (sometimes) and `hiddenSections` (always, possibly empty). Existing code reading only `role`/`content` is unaffected.
3. **The submission pipeline now strips `<<section>>` markers.** A prompt that previously contained literal `<<foo>>` text (where `foo` looks like a valid identifier and there's a matching close) will have those delimiters silently removed from what the LLM sees. Mitigation: documented escape `<<<<` → `<<` literal. Risk in practice is low — `<<` in non-code natural language is rare.
4. **`active: true` is now read.** Code that previously set `active: false` on a message manually (none in this codebase, possibly some in downstream consumers) would have started silently hiding that message from submission. Backward-incompat for any external code that was doing this — but since no internal code did, very low likelihood.
5. **No throw on `ask` previously rejected naming.** New explicit rejection if someone passes `{ name }` to ask. This is a feature, not a regression.

---

## 10. Test plan

### Unit tests (no API keys)

- `parseSections` (`src/llm/common/markers.mjs`):
  - extracts and keeps content of an unhidden section, drops markers
  - drops content of a hidden section
  - leaves message unchanged when no markers present
  - throws on duplicate section names within a message
  - throws on nested sections
  - handles unclosed marker as literal text (no throw, marker stays as-is at parse time; stripped silently at submission)
  - unescapes `<<<<` to `<<`

### Integration tests via testbert (no API keys)

- `chat(prompt, { name: 'x' })` stamps both messages with `turnId: 'x'`
- duplicate name throws at chat call time
- `hideTurn('x')` sets `active: false` on both messages, `restoreTurn` resets
- `hideSection('x', 'seed')` adds to `hiddenSections`, restore removes
- `listTurns` enumerates named turns correctly with hide state
- `isTurnHidden` true only when all messages of turn are inactive; `isSectionHidden` reflects set membership
- `previewDiscussion` shows post-filter content: hidden turns dropped, hidden sections dropped, all markers stripped
- `_rawChat` actually sends the post-filter content to the plugin (verify via testbert echo)
- `ask(prompt, { name: 'x' })` throws
- `chainAsk(prompt, { name: 'x' })` throws
- new methods all throw in chain mode (except inspection helpers — those are read-only, and we should decide: same blocking behavior as the rest, or allowed for debugging? Open question, see §11.)
- `setDiscussion` round-trips `turnId`, `active`, `hiddenSections` faithfully

### Smoke (env-gated, optional)

- One real provider, hideTurn + new chat + verify the LLM doesn't reference the hidden content.

---

## 11. Decisions log

The following were open during design and have been resolved:

1. **Inspection helpers in chain mode → block.** Consistent with existing convention (`getDiscussion` and other read methods already block in chain mode). A wider relaxation of read-only-in-chain-mode is filed as a TECHNICALDEBT entry to be revisited as its own concern.

2. **`previewDiscussion()` returns a fresh snapshot.** Each call walks the discussion, parses sections, and produces new `{role, content}` objects. Callers may mutate the result freely with zero session-state impact. This is the natural shape of the implementation; no extra effort needed to maintain it.

3. **`setDiscussion(arr)` performs no turn-uniqueness validation.** Caller takes ownership of the data, consistent with how `setDiscussion` works today (only validates `Array.isArray`). Invariants are documented; violations are surfaced as unexpected hide scope (e.g., `hideTurn(x)` flipping `active` on three messages) rather than data corruption.

---

## 12. Documentation updates

### README.md

- **New section: "Hiding turns and sections"** — placed after "Managing the Discussion." Covers:
  - The `name` option on `chat()`
  - Marker syntax + escape
  - Turn ops (hide/restore) with examples
  - Section ops with examples
  - Inspection helpers
  - The "markers always stripped" rule

- **Session Methods table** — add rows for:
  ```
  | `hideTurn(turnId)`                    | Skip a named turn on subsequent LLM calls |
  | `restoreTurn(turnId)`                 | Un-skip a previously hidden turn         |
  | `hideSection(turnId, sectionId)`      | Skip a section within a turn             |
  | `restoreSection(turnId, sectionId)`   | Un-skip a previously hidden section      |
  | `listTurns()`                         | Enumerate named turns and their state    |
  | `isTurnHidden(turnId)`                | Is this turn currently hidden?           |
  | `isSectionHidden(turnId, sectionId)`  | Is this section currently hidden?        |
  | `previewDiscussion()`                 | Post-filter discussion as the LLM would see it |
  ```

- **Quick "What's New in 0.10" entry** — short bullet list at the top, like the V0.9 entry.

### In-code documentation

- JSDoc on each new method
- Module-level doc on `src/llm/common/markers.mjs`

---

## 13. License header on new source files

Per the project convention established in V0.9, every new `.mjs` file (here: `src/llm/common/markers.mjs`, `tests-suite/tsHideTurns.mjs`) starts with the SPDX + Apache-2.0 header. Format identical to `src/llm/common/streaming.mjs`.

Existing files being modified keep their headers unchanged.

---

## 14. Versioning

This is a minor version bump: `0.9.x` → `0.10.0`. No backwards-incompatible changes to the public API (existing `chat`/`ask`/`addMessage` signatures unchanged; new methods added; new optional field on the options object).

The internal `active` field becoming load-bearing is technically a behavior change for any downstream consumer that was setting it manually, but no public API documented it as caller-settable. Worth a release-note mention.

---

## 15. Not in scope for this version

- **Cloning / forking the discussion.** The data model supports it cleanly (all state per-message); just add a `clone()` method later that deep-copies `discussion`.
- **Tag-style names** (one name → many turns). If desired later, add a separate `tags` field on the options object and `HideByTag(tag)` verbs — don't conflate with `name`.
- **Per-half-turn hide.** Hiding just the user message while keeping the assistant reply, or vice versa. Today, turns are atomic for hide purposes.
- **Editing a section's content in place.** Today, sections can be hidden or restored, but not rewritten. If needed, do `pruneDiscussion` + re-add via `addMessage`.
- **Marker syntax customization.** The `<<…>>` delimiters are fixed. No per-session config to change them.
