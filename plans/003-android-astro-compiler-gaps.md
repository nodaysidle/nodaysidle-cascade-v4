# Plan 003: Android packets share one open-form value and name their tags; Astro pages have one shape

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the
> expected result before moving on. If anything in "STOP conditions" occurs, stop and report — do not improvise.
> A reviewer dispatched you and maintains `plans/README.md`; do not touch it.
>
> **Drift check (run first)**: `git diff --stat 3087d77..HEAD -- src/compiler.ts src/androidForms.ts src/androidPlan.ts tests/`
> Any change there since this plan was written: compare the excerpts below with the live code; on a mismatch, STOP.

## Status

- **Priority**: P1 · **Effort**: M · **Risk**: MED (changes text in every Android and Astro packet)
- **Depends on**: none (independent of plan 002, which touches other files) · **Category**: bug
- **Planned at**: commit `3087d77`, 2026-11-11

## Why this matters

Cascade V4 compiles an app idea into a packet (five Markdown documents plus a starter kit) that a coding agent
builds from. After compiling, a paid Claude review finds defects and a paid repair rewrites the documents. Every
repair is text the compiler should have written itself.

- **Android** (evidence: Fuel Log, 3 repair rounds, 9 edits, 7 of them for one gap): the first screen task was
  told that the add form and the edit form are open "one at a time, so opening one closes the other", while
  each form's open state lives in its own task's file. No shared value exists that could do that, and the Add
  button had two possible owners. The reviewer also noted that field test tags and entity property names are
  never spelled out, and that deleting a record can leave its edit form open.
- **Astro** (evidence: Cinema Club, reviewer notes): a page of a collection without a detail route may render
  "one li per entry or one element for a single entry" (two different page shapes); a list ordered by a field
  has no rule for equal values; and "the build fails when the content file is missing" is not true, because a
  schema only checks files that exist.

This plan makes the compiler state these for every Android and Astro packet, with no product name in the compiler.

## Current state

Lines are very long; excerpts are shortened with `...`. Read each named line fully before editing.

### Android

`src/compiler.ts:1410` (inside `mainSlotsSentence`, the Android branch without a detail view):

```ts
... : android && !detailView ? "the add-entry area on the main screen above the list: the Add button (testTag \"add-entry\") plus the inline form shell, which hosts whichever form (add or edit) is open, one at a time, so opening one closes the other (the add task builds the form fields, validation, and the open or closed state in its own file" + (features.some(feature => feature.editsRecords) ? "; an edit task reuses them)" : ")") : "an add-entry control that opens the entry form shell (...)"
```

`src/androidPlan.ts:167-168` (the `else if (input.firstMain)` branch) pushes a long note that ends with a
sentence of this form (find it with `grep -n "lives in that task's own feature file" src/androidPlan.ts`):
`State that a later task owns (an open form, a pending delete, a mark) lives in that task's own feature file, never in the shared view state, because later tasks modify only the registration files.`

`src/compiler.ts:2068` builds, for a later feature task, `Your controls mount into the slots exposed by <task> (<slot>): build them in <file> and mount them from the shared registration file; do not rebuild the screen.`
followed for an edit task by `If your acceptance criteria edit stored fields in a form, reuse the form fields and validation that the add task exports from its own file and do not duplicate them; a single mark or toggle action needs no form.`

`src/androidForms.ts:90` (inside `androidFormRules`):

```ts
    `Form (${dataName}): ... each field is a text field (unless its rule below makes it a picker) whose visible label equals its name and whose testTag is "field-" plus the field's slug; the confirming button is labelled "Save" (testTag "save")...
```

`src/androidForms.ts:96`:

```ts
export const ANDROID_DELETE_PROMPT = `Delete prompt: the row's Delete control carries testTag "delete-" plus the record id; removing a record first shows an AlertDialog whose confirm button is labelled "Delete" (testTag "confirm-delete") and whose dismiss button is labelled "Cancel" (testTag "cancel-delete"); only "Delete" removes the record, and "Cancel" leaves it and closes the prompt. This is the one rule for every delete: ...`
```

`src/compiler.ts:1190` (Android data contract):

```ts
    return `Interface: OWN-DATA-STORE owns one Room entity ${record}Entity with the stored fields above, one ${record}Dao with exactly: ${functions.join(", ")}, the one RoomDatabase subclass AppDatabase ... Kotlin types: id is Long (autoGenerate), text and long-text are String, number is Double, ...
```

`src/compiler.ts:334` defines `export function slug(value: string): string`. `src/kitText.ts` exports
`fieldIdentifier` (used by the Waybar files); check what each returns before you use it.

Evidence packet (read only): `/home/arch/dev/nodaysidle/fuel-log/`. In its `blueprint.json`, `repair.edits`
entries 3 to 9 are the text the paid repair wrote for the open-form gap: read their full `find` and `replace`
values as the model. They contain this product's names; the compiler text must not.

### Astro

`src/compiler.ts:2070` is one long template. Its last branch (a page that is neither `[slug]` nor `[tag]`) reads:

```ts
... : `; it reads no data yet, so add the read of ${item.dataName} through list${pascal(item.dataName)}Entries() from src/lib/contentcatalog.ts and render the declared fields (a long-text field in one element)${astroPlan?.detailCollections.includes(item.name) ? "; when it lists entries, it renders one li containing one a per entry, href the detail route plus the entry id and a trailing slash" : `; ${item.name} has no detail route, so it renders the declared fields of every entry in ascending id order, one li per entry or one element for a single entry, with no a and no href; its focused test asserts that the built HTML contains each field value read from the content files, whatever the values are, and hardcodes no wording the content owner supplies`}`
```

The kit's `src/lib/contentcatalog.ts` returns entries sorted by ascending id from `list<Name>Entries()` and
does not throw for an empty collection.

Evidence packet (read only): `/home/arch/dev/nodaysidle/cinema-club/`.

### Conventions

Tests are vitest files in `tests/` that compile a fixture with `compilePacket(blueprint, presetId)` and assert
with `toContain` on `packet.documents[...]` (exemplars: `tests/android-forms.test.ts`, `tests/astro.test.ts`,
their top 30 lines and helpers). Preset ids: `android-kotlin-compose`, `astro-web`. Code style: no semicolons,
double quotes, 2 spaces. Repository rules: write the failing test first; fix the shared code once with **no
special case for a product name**; never delete or loosen an existing assertion or check; commit locally only,
never push; never write into `/home/arch/dev/nodaysidle/<packet>/`; no API keys and no paid network calls
(never run `cascade generate` or `npm run probe:live`; never print environment variables).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install (fresh worktree) | `npm ci` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| One file | `npx vitest run tests/android-astro-compiler-gaps.test.ts` | all pass |
| All tests | `npm test` | exit 0 (baseline at `3087d77`: 489 passed, 19 skipped) |

## Scope

**In scope**: `src/compiler.ts` (only the lines named above and what they directly need), `src/androidForms.ts`,
`src/androidPlan.ts`, `tests/android-astro-compiler-gaps.test.ts` (create),
`tests/fixtures/android-add-edit-forms.json` and `tests/fixtures/astro-plain-collection.json` (create), an
existing test file only to update an assertion that fails solely because this plan changed the sentence it checks.

**Out of scope**: `src/gtkContracts.ts` and `src/presets.ts` (another executor is editing them now),
`src/tauriContracts.ts`, `src/androidKit.ts`, `src/astroKit.ts`, `src/kits.ts`, `src/review.ts`, `src/audit.ts`,
`src-tauri/**`, `scripts/**`, `docs/**`, `plans/**`, provider notes.

Important: `mainSlotsSentence` and line 2068 are shared with other presets. Change only the Android branches
(`android && ...`) and text that is produced only for Android or only for Astro. If a sentence you need to
change is also printed for GTK or Tauri, add an Android-only variant instead of changing the shared one.

## Git workflow

Branch `advisor/003-android-astro-compiler-gaps` in your worktree. One commit per step (2 to 6). Message style:
`fix(android): ...` / `fix(astro): ...`. Never push, no pull request.

## Steps

### Step 0: Baseline

`npm ci`, `npm run typecheck`, `npm test`. **Verify**: exit 0, 489 passed.

### Step 1: Fixtures and failing tests

1. `tests/fixtures/android-add-edit-forms.json` = the value of the `blueprint` key of
   `/home/arch/dev/nodaysidle/fuel-log/blueprint.json`, unchanged (inner object only).
   `tests/fixtures/astro-plain-collection.json` = the same from `/home/arch/dev/nodaysidle/cinema-club/blueprint.json`.
2. `tests/android-astro-compiler-gaps.test.ts`: compile both, assert `packet.failures` equals `[]`. Find tasks
   by content: first main = block containing `You are the first main-surface task`; add task = block containing
   `Field rules` whose task creates records (or the block with `openAdd` after your change); edit task = block
   containing `openEdit` after your change; delete task = block containing `Delete prompt:`. Assertions:
   - Android first main contains `Open-form rule`, `OpenForm.None`, `OpenForm.Add`, `OpenForm.Edit(val id: Long)`, `openAdd()`, `openEdit(id: Long)`, `closeForm()`
   - Android `TASKS.md` does not contain `so opening one closes the other` and does not contain `the open or closed state in its own file`
   - the first main task says it builds the Add button and that the button calls `openAdd()`; no other task says it builds the Add button
   - the edit task contains `calls the shared openEdit(id)`; the add task contains `OpenForm.Add`
   - the delete task contains `closeForm()`
   - Android `TRD.md` contains `field-station-name` and `field-total-cost-eur` (or the tags your Step 3 function yields for those two field names: print them once and fix the expected strings to the real output) and `stationName`
   - Astro `TASKS.md` does not contain `or one element for a single entry` and contains `also when the collection has a single entry`
   - Astro `TASKS.md` contains `entries with an equal value keep ascending entry id order`
   - Astro `TASKS.md` contains `throw an Error` in the task of the page whose collection has no detail route
   - a compile of an existing Android fixture **without** an edit feature (find one via `tests/android*.test.ts`) does not contain `OpenForm.Edit`.

**Verify**: the file runs and fails only on `toContain` mismatches.

### Step 2: Android — one shared open-form value, one owner of the Add button

Applies to the Android variant with an inline form shell (the `android && !detailView` branch at
`src/compiler.ts:1410`). "Edit feature" below means `features.some(feature => feature.editsRecords)`.

1. Slot sentence (`src/compiler.ts:1410`): replace the Android text with
   `the add-entry area on the main screen above the list: the Add button (testTag "add-entry"; labelled as the PRD or an acceptance signal quotes it, else "Add"), which you build and which calls the shared openAdd(), plus the inline form shell, which shows the form that the shared openForm value names, one form at a time (the add task builds the form fields, validation, and its typed field values in its own file and mounts the form into the shell` + `; an edit task reuses them)` when an edit feature exists, else `)`.
2. First main note (`src/androidPlan.ts`, the sentence about state that a later task owns): for this variant say instead
   `Open-form rule (the one shared exception): the shared view state in your file holds exactly one open-form value, openForm, of the sealed type OpenForm with the cases OpenForm.None (initial), OpenForm.Add` + (edit feature: ` and OpenForm.Edit(val id: Long)`) + `, and exposes exactly these functions: openAdd()` + (edit feature: `, openEdit(id: Long)`) + ` and closeForm(). Because it is a single value, opening one form replaces any open one and no feature calls another feature. The form shell renders the form that openForm names and nothing for OpenForm.None. Every other state a later task owns (its typed field values, a pending delete, a mark) lives in that task's own feature file, never in the shared view state, because later tasks modify only the registration files.`
   `androidPlan.ts` may not know whether the variant applies or whether an edit feature exists: pass what is
   needed through its input object from the caller in `src/compiler.ts` (read how `input.detailView` gets there).
3. Add task (Android, this variant): add
   `The add form is open exactly when the shared openForm is OpenForm.Add: the Add button of the first main task calls openAdd(), and a successful Save or a close calls closeForm(); keep the typed field values in your own file and build no Add button.`
4. Edit task (Android, this variant, edit feature): add
   `The row's Edit control (label "Edit", testTag "edit-" plus the record id) calls the shared openEdit(id); the edit form is open exactly when the shared openForm is OpenForm.Edit(id), is pre-filled from the stored record, and a successful Save or a close calls closeForm(); keep the typed field values in your own file.`
   Before adding, search the generated edit task for an existing sentence about the Edit control's label or
   tag; keep one statement of each fact, not two.
5. Search the generated Android `TASKS.md` and `TRD.md` of the fixture for any remaining sentence that says a
   later task builds the Add button, or that an open form lives in a task's own file. Fix it if it is produced
   only for Android by an in-scope file; otherwise STOP and report it.

**Verify**: the open-form assertions pass; `npx vitest run tests/android.test.ts tests/android-forms.test.ts tests/android-mood.test.ts tests/round11-no-list.test.ts` → all pass (update an assertion only as Scope allows).

### Step 3: Android — tags and property names are spelled out

1. `src/androidForms.ts:90`: after `whose testTag is "field-" plus the field's slug` add the list of real tags
   for the fields the user enters, in the form ` (Station name: field-station-name, ...)`, computed from the
   field names with the same slug rule the documents mean (lower case, every run of characters that is not a
   letter or digit becomes one hyphen, no leading or trailing hyphen). Use `slug` from `src/compiler.ts` only if
   it implements exactly that and importing it creates no circular import problem (`npm run typecheck` and
   `npm test` stay green); otherwise write a 1-line local helper.
2. `src/compiler.ts:1190`: after `with the stored fields above` add the Kotlin property names:
   ` (Kotlin properties: id, then one per stored field in the order above, named in lowerCamelCase from the field name: <name list>)`,
   computed from the field names (words split at every character that is not a letter or digit; first word
   lower case, later words capitalised; "Total cost (EUR)" becomes totalCostEur). Reuse an existing helper if
   one produces exactly this; say in your report which one.

**Verify**: the tag and property assertions pass.

### Step 4: Android — a delete closes the edit form of that record

Append to `ANDROID_DELETE_PROMPT`:
` When the shared view state has an openForm value and it is OpenForm.Edit for the removed record's id, the delete calls closeForm() after the record is removed, so no form stays open for a record that no longer exists.`

**Verify**: the delete assertion passes.

### Step 5: Astro — one page shape, a tie-break, and a real build failure

All in the last branch of the template at `src/compiler.ts:2070`:

1. Replace `one li per entry or one element for a single entry, with no a and no href` with
   `one li per entry inside one ul, also when the collection has a single entry, with no a and no href`.
2. In the same no-detail-route text, add before `; its focused test asserts`:
   `; when the TRD failure behavior of this feature says the build fails if its content file is missing, make that true in the page itself: throw an Error that names the collection's src/content folder when list${pascal(item.dataName)}Entries() returns no entry, because the collection schema only checks files that exist`.
3. In the detail-route text, after `href the detail route plus the entry id and a trailing slash` add
   `; when the PRD orders the list by a field, entries with an equal value keep ascending entry id order (sort the result of list${pascal(item.dataName)}Entries() with a stable sort), and the focused test asserts the order of the built list items against the values in the content files`.

**Verify**: the Astro assertions pass; `npx vitest run tests/astro.test.ts` → all pass.

### Step 6: Full checks and proof on the real blueprints

`npm run typecheck`, `npm test`. Then compile both fixtures with the CLI into a `mktemp -d` folder
(`npm run -s cascade -- compile --preset <id> --blueprint tests/fixtures/<file> --out "$OUT/x"`; if an option is
required, the error message names it, and the packet's `blueprint.json` → `preset.options` shows the values).

**Verify**: typecheck exit 0; `npm test` exit 0 with at least 489 plus your new tests; both compiles print
`Compiled:`. In your report, paste every sentence you added or changed, verbatim, as it appears in the
recompiled documents.

## Done criteria

- [ ] `npm run typecheck` exits 0; `npm test` exits 0; the new test file exists and passes
- [ ] `git diff --stat 3087d77` lists only in-scope files
- [ ] No assertion deleted from an existing test (each changed `expect(` line has a replacement)
- [ ] No product name in the compiler diff: `git diff 3087d77 -- src/ | grep -i -c "fuel\|fill-up\|cinema\|screening\|venue"` prints 0
- [ ] A GTK and a Tauri fixture compile to the same `TASKS.md` as before your change (compare the output of one existing fixture per preset before and after, or show that every changed line is inside an `android` or Astro-only branch)
- [ ] Nothing pushed; the three packet folders unchanged

## STOP conditions

- An excerpt in "Current state" does not match the live code.
- More than 8 existing assertions fail, or one fails for a reason other than the changed sentence.
- `packet.failures` is non-empty for any fixture that was clean before.
- A needed change would alter text printed for GTK, Tauri or Waybar packets and no Android-only variant is possible.
- The fix needs a file outside the scope (for example `src/androidKit.ts`).
- A remaining sentence contradicts a new one and it is produced outside the in-scope lines.
- Any step would need an API key or a paid call. A verification fails twice after a reasonable fix.

## Maintenance notes

- Deferred on purpose: a seam for a failing repository in Android write-failure tests; the exported form API
  between the add and the edit task; the check order of field rules; an ordering test that cannot fail with a
  one-entry seed (Astro); number decimals the idea states in prose.
- A reviewer should read the recompiled Android first main, add, edit and delete tasks once from start to end
  and look for two sentences that disagree about who owns the Add button or the open form.
- The saved Fuel Log packet will no longer replay its recorded repair edits after this change. That is
  expected: the compiler now writes that text itself.
