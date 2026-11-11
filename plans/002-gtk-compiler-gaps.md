# Plan 002: GTK packets state the choice filter, the filter hook, the delete dialog and the edit title

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the
> expected result before moving on. If anything in "STOP conditions" occurs, stop and report — do not improvise.
> A reviewer dispatched you and maintains `plans/README.md`; do not touch it.
>
> **Drift check (run first)**: `git diff --stat 3087d77..HEAD -- src/gtkContracts.ts src/presets.ts tests/`
> Any change there since this plan was written: compare the excerpts below with the live code; on a mismatch, STOP.

## Status

- **Priority**: P1 · **Effort**: M · **Risk**: MED (changes text in every GTK packet)
- **Depends on**: none · **Category**: bug
- **Planned at**: commit `3087d77`, 2026-11-11

## Why this matters

Cascade V4 compiles an app idea into a packet (five Markdown documents plus a starter kit) that a coding agent
builds from. After compiling, a paid Claude review finds defects and a paid repair rewrites the documents. Every
repair is text the compiler should have written itself. For one GTK packet (Tea Cellar) the repair needed 2
rounds and 7 edits, 4 of them for one compiler gap: a feature that filters the list by one of several options
was described as an on/off toggle, and nothing said how a filter control in one task changes the rows the list
task renders. The reviewer also noted three smaller gaps. This plan makes the compiler state all four for every
GTK packet, with no product name in the compiler.

## Current state

All in `src/gtkContracts.ts`, function `refineGtkPhases` (read lines 260-394 fully before editing). Lines are
very long; excerpts are shortened with `...`.

`src/gtkContracts.ts:277-279`:

```ts
  const narrowKinds = [...new Set(blueprint.features.map(feature => feature.narrowsListBy).filter(kind => kind !== "none"))]
  const noMatch = narrowKinds.some(kind => kind === "text" || kind === "flag")
  const FILTER_WIDGET = { text: "a GtkSearchEntry", flag: "a GtkToggleButton (or AdwSwitchRow)", sort: "a GtkDropDown of the sort orders" } as const
```

`src/gtkContracts.ts:288` (inside `slotNote`):

```ts
      ...(filter ? [`the filter area above the list holds ${narrowKinds.map(kind => FILTER_WIDGET[kind as keyof typeof FILTER_WIDGET]).join(" and ") || "one control"}, one per narrowing feature, mounted by that feature's task`] : []),
```

`src/gtkContracts.ts:348` and `352-359`:

```ts
  const SHARED_HELPERS = "The shared view state exposes two display-free entry points that later tasks call and never re-implement: reload() re-reads the store's list into the loaded records, and show_toast(message) adds an AdwToast to the window's ToastOverlay (build_window stores the overlay in the shared view state)."
  ...
  const NARROW = {
    text: `Narrow the list with a GtkSearchEntry mounted in the filter area. ...`,
    flag: `Narrow the list with a GtkToggleButton (or AdwSwitchRow) mounted in the filter area, off initially and labelled with the wording of your acceptance criterion; turning it off restores the full list and needs no clear control. ${NO_MATCH}`,
    sort: "Reorder the list with a GtkDropDown mounted in the filter area, ...",
  } as const
  const EDIT_CONTROL = "You build the per-row Edit control (a button) that opens the form for that record, and mount it in the slot named above; the list task builds no edit control. The edit dialog's title is \"Edit\" and the record's singular name, its Save button is labelled \"Save\" (the add dialog's label belongs to the add dialog only), and it opens prefilled from the record."
  ...
  const CONFIRM_DIALOG = "A removal confirmation is a custom AdwDialog, not an AdwAlertDialog (which closes on every response): Remove calls the store and closes the dialog only after it returns Ok; on StoreError show the toast and leave the dialog open. The confirmation is built from a display-free function request_delete(id: i64) returning the loaded record to confirm, or None when the id is not in the loaded list; your tests assert it, and the dialog is shown only for Some."
```

`src/gtkContracts.ts:374` and `379` (inside the `notes` array of each task):

```ts
        ...(firstMain ? [SHARED_HELPERS] : []),
        ...
        ...(!firstMain ? owned.filter(feature => feature.narrowsListBy !== "none" && feature.dataOperations.length > 0 && feature.dataOperations.every(operation => operation === "read")).slice(0, 1).map(feature => NARROW[feature.narrowsListBy as "text" | "flag" | "sort"]) : []),
```

`src/presets.ts:497` (GTK preset validation commands):

```ts
    identity => `appstreamcli validate resources/${identity.bundleId}.metainfo.xml`,
```

The evidence packet (read only, never write): `/home/arch/dev/nodaysidle/tea-cellar/`. In its `blueprint.json`:

- `blueprint.features` has a feature with `"narrowsListBy": "flag"` and
  `"choiceLists": [{"name": "Tea type filter", "options": ["All", "green", "black", "oolong", "herbal"], "initial": "All"}]`.
  In the compiler's normalized blueprint a feature carries its choice lists as rendered strings in
  `feature.choices` (`src/compiler.ts:81`, `:184`, built at `:645` as `"Name: option, option; initially X"`).
  Check whether the structured lists are also available on the normalized feature before you choose what to print.
- `repair.edits` (7 entries) is the text the paid repair wrote. Edits 1, 2, 6 and 7 are the model for Step 2:
  read their full `find` and `replace` values. They contain this product's names; the compiler text must not.

Conventions: tests are vitest files in `tests/` that compile a fixture with `compilePacket(blueprint, "linux-wayland-gtk4-desktop")`
and assert with `toContain` on `packet.documents["TASKS.md"]` (exemplar: `tests/gtk.test.ts`, top 30 lines and
its `task(...)` helper). Code style: no semicolons, double quotes, 2 spaces. Repository rules: write the failing
test first; fix the shared code once with **no special case for a product name**; never delete or loosen an
existing assertion or check; commit locally only, never push; never write into `/home/arch/dev/nodaysidle/<packet>/`;
no API keys and no paid network calls (never run `cascade generate` or `npm run probe:live`; never print
environment variables).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install (fresh worktree) | `npm ci` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| One file | `npx vitest run tests/gtk-compiler-gaps.test.ts` | all pass |
| All tests | `npm test` | exit 0 (baseline at `3087d77`: 489 passed, 19 skipped) |

## Scope

**In scope**: `src/gtkContracts.ts`; `src/presets.ts` (only the GTK `appstreamcli` command, and any other GTK
text in that file that names the same command, to keep them consistent); `tests/gtk-compiler-gaps.test.ts`
(create); `tests/fixtures/gtk-choice-filter.json` (create); an existing test file only to update an assertion
that fails solely because this plan changed the sentence it checks.

**Out of scope**: `src/compiler.ts`, `src/kits.ts`, `src/renderers.ts`, `src/review.ts`, `src/audit.ts`, every
other preset's files, `src-tauri/**`, `scripts/**`, `docs/**`, `plans/**`, provider notes (`providerNotes`
arrays: they go to the paid provider and cannot be verified without paid runs).

## Git workflow

Branch `advisor/002-gtk-compiler-gaps` in your worktree. One commit per step (2 to 5). Message style:
`fix(gtk): <what changed and why>`. Never push, no pull request.

## Steps

### Step 0: Baseline

`npm ci`, `npm run typecheck`, `npm test`. **Verify**: exit 0, 489 passed.

### Step 1: Fixture and failing tests

1. Create `tests/fixtures/gtk-choice-filter.json`: the value of the `blueprint` key of
   `/home/arch/dev/nodaysidle/tea-cellar/blueprint.json`, unchanged (the inner object only, not the manifest).
2. Create `tests/gtk-compiler-gaps.test.ts`. Compile the fixture and assert `packet.failures` equals `[]`.
   Find the tasks by content, not by id: the first main task contains `You are the first main-surface task`;
   the filter task is the block whose prompt contains `GtkDropDown` and `filter area` after your change (before
   it, find it as the block containing `Narrow the list with`); the delete task contains `request_delete`; the
   edit task contains `The edit dialog's title is`. Assertions (all must fail now):
   - filter task contains `one single-choice GtkDropDown` and does not contain `GtkToggleButton`
   - filter task contains `All, green, black, oolong, herbal` (the options come from the fixture, which is fine in a test)
   - first main task contains `Filter hook` and `visible_rows()` and `set_filter_selection`
   - first main task does not contain `GtkToggleButton`
   - filter task contains `set_filter_selection`
   - delete task contains `"Cancel"` and `"Delete"` and the words `its question is`
   - edit task contains `in lower case`
   - `TASKS.md` contains `appstreamcli validate --no-net`
   - a second compile of an existing fixture that has an on/off flag filter without a choice list still
     contains `GtkToggleButton` (find one in `tests/gtk.test.ts` or `tests/fixtures/`; if none exists, build one
     by copying the new fixture in the test and emptying that feature's `choiceLists`).

**Verify**: `npx vitest run tests/gtk-compiler-gaps.test.ts` → runs, fails only on `toContain` mismatches.

### Step 2: A choice filter is a dropdown, and the list exposes a filter hook

First read how `NARROW.text`, `NARROW.flag`, `FLAG_SELECTION` and the first main task's prompt currently say a
narrowing control changes the rows the list renders. If a mechanism is already stated, reuse it for the choice
filter and report that; if none is stated (expected), add the hook below.

1. A narrowing feature with `narrowsListBy === "flag"` that declares at least one choice list is a **choice
   filter**. For it:
   - the slot note (`FILTER_WIDGET` use at line 288) says `a GtkDropDown of the declared options` instead of the toggle;
   - its task gets this note instead of `NARROW.flag` (fill the options from the blueprint):
     `Narrow the list with one single-choice GtkDropDown mounted in the filter area, built over a gtk::StringList of exactly the options of your declared choice list in their declared order (<options>) and opening at its initial option (<initial>); build no toggle, switch or clear control. Choosing an option shows only the loaded records that match it by the rule your behavior states, and the initial option shows every loaded record again when your behavior says it stands for all of them. Keep the narrowing in one display-free function that takes the loaded records and the selected option's text and returns the matching records in the loaded order; your tests assert it for every option.` followed by the existing `NO_MATCH` sentence.
   - A flag filter without a choice list keeps today's toggle text unchanged.
2. Filter hook. When the first main task exposes a filter area and some feature narrows by `text` or `flag`,
   add this note to the first main task:
   `Filter hook (you build it; a narrowing task only sets it): the shared view state holds filter_selection: String (initially the narrowing control's initial value: the empty text for a search, the initial option for a choice, "off" for a toggle) and row_filter, a function from the loaded records and that selection to the records to show (initially one that returns every record in the loaded order), plus the display-free visible_rows(), which returns row_filter applied to the loaded records and filter_selection, and set_filter_selection(selection), which stores the selection and re-renders the list. Your list renders visible_rows(), never the loaded records directly.`
   and this note to each narrowing task of kind `text` or `flag`:
   `Apply the narrowing through the filter hook the list task exposes in the shared view state: from the shared registration files set row_filter to your display-free function, and on every change of your control call set_filter_selection with its current value; do not edit the list feature file and do not filter there.`
   When a blueprint has more than one narrowing feature of kind `text` or `flag`, say instead that the shared
   view state holds one such pair per narrowing feature, named after the feature, and that `visible_rows()`
   applies them one after another; write that variant in the same style and quote it in your report.
3. Make sure no sentence left in the same prompt contradicts the new ones (for example a sentence that says
   the list applies the filter itself). If one does, STOP and report it rather than rewriting text outside this step.

**Verify**: the filter and first-main assertions pass; `npx vitest run tests/gtk.test.ts tests/gtk-audit8.test.ts tests/round11-gtk-export.test.ts` → all pass (update an assertion only as Scope allows).

### Step 3: The delete dialog has stated labels and a question

Change `CONFIRM_DIALOG` so it reads (keep the rest of the sentence as it is):

`The per-row control that asks for a removal is a button labelled "Delete". A removal confirmation is a custom AdwDialog, not an AdwAlertDialog (which closes on every response): its question is the confirmation text the PRD quotes, or when the PRD quotes none "Delete this item?" with the record's singular name in place of "item"; its buttons are "Cancel" and "Delete" (when the PRD or an acceptance criterion quotes another label for one of them, use the quoted label); Delete calls the store and closes the dialog only after it returns Ok; on StoreError show the toast and leave the dialog open; Cancel closes the dialog and changes nothing.`

followed by the existing `request_delete` sentence unchanged. Before committing, search the generated
`TASKS.md` of the fixture for another sentence that names the label of the per-row delete control; if one
exists and disagrees, STOP and report.

**Verify**: delete assertions pass.

### Step 4: The edit dialog title is exact

In `EDIT_CONTROL` replace `The edit dialog's title is \"Edit\" and the record's singular name,` with
`The edit dialog's title is \"Edit\" followed by one space and the record's singular name in lower case (for a record called Note the title is \"Edit note\"),`.

**Verify**: edit assertion passes.

### Step 5: The metainfo check runs offline

In `src/presets.ts` change the GTK validation command to
`appstreamcli validate --no-net resources/${identity.bundleId}.metainfo.xml` (the flag exists:
`appstreamcli validate --help` lists `--no-net  Do not use network access.`). Run
`grep -n "appstreamcli" src/*.ts` and make every GTK place that shows the full command show the same command;
leave prose that only names the tool unchanged.

**Verify**: `npx vitest run tests/gtk-compiler-gaps.test.ts` → all pass.

### Step 6: Full checks and proof on the real blueprint

`npm run typecheck`, `npm test`. Then:

```bash
OUT=$(mktemp -d)
python3 -c "import json;json.dump(json.load(open('/home/arch/dev/nodaysidle/tea-cellar/blueprint.json'))['blueprint'],open('$OUT/bp.json','w'))"
npm run -s cascade -- compile --preset linux-wayland-gtk4-desktop --blueprint "$OUT/bp.json" --option packaging=local --out "$OUT/p"; echo "exit=$?"
```

(If the option name is rejected, read the accepted options from the error message or from
`blueprint.json` → `preset.options` and pass those.)

**Verify**: typecheck exit 0; `npm test` exit 0 with at least 489 plus your new tests; the compile prints
`Compiled:` and `exit=0`. In your report, paste every sentence you added or changed, verbatim, as it appears in
the recompiled `TASKS.md`.

## Done criteria

- [ ] `npm run typecheck` exits 0; `npm test` exits 0; `tests/gtk-compiler-gaps.test.ts` exists and passes
- [ ] `git diff --stat 3087d77` lists only in-scope files
- [ ] No assertion deleted from an existing test (each changed `expect(` line has a replacement)
- [ ] `grep -c "tea\|Tea" <(git diff 3087d77 -- src/)` prints 0 (no product name in the compiler)
- [ ] Nothing pushed; `/home/arch/dev/nodaysidle/tea-cellar` unchanged

## STOP conditions

- An excerpt in "Current state" does not match the live code.
- More than 8 existing assertions fail, or one fails for a reason other than the changed sentence.
- `packet.failures` is non-empty for any fixture that was clean before.
- The fix needs a file outside the scope (for example `src/compiler.ts`).
- A remaining sentence contradicts a new one and you would have to rewrite text this plan does not name.
- Any step would need an API key or a paid call. A verification fails twice after a reasonable fix.

## Maintenance notes

- Deferred on purpose: whether `form_state` errors are rendered in the dialog; a default range for a number
  field the idea gave no range for; the `Choices:` line printed on contracts of features that have no such
  input (`src/renderers.ts`, shared by all presets); `show_toast` being called "display-free".
- A reviewer should read the recompiled first main task, filter task and delete task once from start to end
  and look for two sentences that disagree.
- The saved Tea Cellar packet will no longer replay its recorded repair edits after this change (their `find`
  texts are gone). That is expected: the compiler now writes that text itself.
