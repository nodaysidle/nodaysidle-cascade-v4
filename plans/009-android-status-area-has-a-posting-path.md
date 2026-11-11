# Plan 009: A later Android task can show its message in the shared status area

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the
> expected result before moving on. If anything in "STOP conditions" occurs, stop and report — do not improvise.
> The reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0fb334f..HEAD -- src/androidPlan.ts src/androidForms.ts src/compiler.ts`
> must print nothing. Otherwise compare the excerpts below with the live code; on a mismatch, STOP.

## Status

- **Priority**: P1 · **Effort**: M · **Risk**: MED (changes the text of every Android packet with a status area)
- **Depends on**: none · **Category**: bug (packet contradiction)
- **Planned at**: commit `0fb334f`, 2026-11-11
- **Source**: round 13, Android idea N2 "Sleep Log", live run in the app: verdict "Not ready", blocking finding 2.

## Why this matters

In an Android packet the first main task builds one status area (testTag "status"). The packet says that area
shows the form-error text of a later task's form and the write-failure message of a later task's save or
delete (tags "form-error" and "write-error"). But the later tasks may modify only the registration files, the
shared view state is said to expose "exactly these functions: openAdd(), openEdit(id) and closeForm()", and no
sentence anywhere says how a later task puts a message into that area. A coding agent has to invent a setter
that the packet forbids. The in-app reviewer blocked the Sleep Log packet on exactly this, and the same gap is
in the round-12 Android packets (`lift-log`, `shopping-list`): they compile to the same sentences.

## Current state

`src/compiler.ts:1421` (list variant, inside `mainSlotsSentence`, `android` branch) prints:

```
a status area (testTag "status") that carries only the main list's empty message (... tag "empty-state"), the one quoted form-error text when the PRD or an acceptance signal quotes it (...), and the write-failure message of a later task's save, delete, mark, or toggle (the text its acceptance quotes, else "Could not save changes" or "Could not delete"; tag "write-error"; the row stays as it was)
```

`src/compiler.ts:1369` (no-list variant, inside `noListSlotsSentence`) prints a status area with the same two
message kinds. The `noData` branch above it (line 1364) builds no status area and must stay as it is.

`src/androidPlan.ts:171-178` (`androidTaskExtras`, the first-main notes) has three variants. The open-form
variant says:

```
Open-form rule (the one shared exception): the shared view state in your file holds exactly one open-form value, openForm, ... and exposes exactly these functions: openAdd(), openEdit(id: Long) and closeForm(). ... Every other state a later task owns (its typed field values, a pending delete, a mark) lives in that task's own feature file, never in the shared view state, because later tasks modify only the registration files.
```

The other two variants (`noList`, and the list variant without `openForm`) say only "State that a later task
owns ... lives in that task's own feature file, never in the shared view state".

`src/androidForms.ts:92` (the Rejection rule) says a quoted form-error is shown "once, in the status area
(testTag "form-error")". The form lives in a later task's file.

Nothing in `src/` mentions how a message reaches the status area: `grep -n "showStatus\|statusMessage" src/*.ts`
prints nothing.

Conventions: vitest; fixtures in `tests/fixtures/` (`android-*.json`, `round12-blueprints/android-kotlin-compose--*.json`);
existing Android text tests in `tests/android-forms.test.ts`, `tests/android-mood.test.ts`,
`tests/android-astro-compiler-gaps.test.ts`, `tests/round12-docs.test.ts`. Repository rules: failing test
first; fix the shared code once with no special case for a product name; never delete or loosen an existing
assertion (an assertion that pins a sentence this plan rewrites may be updated to the new sentence: list each
one in your report); commit locally only, never push; no API keys and no paid calls.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| One file | `npx vitest run tests/android-status-area.test.ts` | all pass |
| All tests | `npm test` | exit 0 (baseline at `0fb334f`: 517 passed, 19 skipped) |
| Compile a fixture | `npm run -s cascade -- compile --preset android-kotlin-compose --blueprint <file> --out <dir>` | `Compiled: <dir>/<slug>` |

Write compile output under `$HOME/.cache/cascade-v4/tmp/`, never under `/tmp` (small RAM disk with a quota).

## Scope

**In scope**: `src/androidPlan.ts`, `src/compiler.ts` (only the two Android status-area sentences and the call
sites that pass input to `androidTaskExtras`), `src/androidForms.ts` (only if the Rejection rule needs the
function name), `tests/android-status-area.test.ts` (create), existing Android tests that pin a rewritten
sentence.

**Out of scope**: every other preset (their compiled output must stay byte-identical), `src/androidKit.ts`
unless Step 2 shows the kit already ships a shared view state file that would contradict the new rule (then
STOP and report), the review and repair code, the `noData` (calculator) variant.

## Git workflow

Branch `advisor/009-android-status-and-widgets` (plan 010 is stacked on the same branch by the same worker).
One commit for this plan. Message style: `fix(android): ...`. Never push, no pull request.

## Steps

### Step 1: Failing test

Create `tests/android-status-area.test.ts`. Compile these blueprints with `compilePacket` the way
`tests/round12-docs.test.ts` does: `tests/fixtures/round12-blueprints/android-kotlin-compose--lift-log.json`,
`...--shopping-list.json`, `tests/fixtures/android-add-edit-forms.json`, and one Android fixture that takes the
no-list variant (find one with `grep -l` over the compiled TASKS for "one section per feature that creates or
reads"; if no fixture takes it, build one in the test by copying a fixture and removing its list feature the
way other tests derive variants). Assert, on TASKS.md split into task blocks:

1. The task block that contains `tag "write-error"` (the first main task) also contains
   `showStatus(text: String, tag: String)` and `clearStatus()`.
2. That block no longer claims the shared view state holds only the open-form functions: where it says
   "exposes exactly these functions", the list that follows includes `showStatus` and `clearStatus`.
3. Every later feature task block that builds a form or writes records (it contains "Form rules:" or
   "Delete prompt:", or its feature has a create, update or delete operation) contains `showStatus(`.
4. `tests/fixtures/android-tip-split.json` (stores nothing) contains neither `showStatus` nor `clearStatus`
   in any document.

**Verify**: the test fails on assertions 1 to 3 today and passes assertion 4.

### Step 2: One status contract, defined once

In `src/androidPlan.ts` add one exported constant for the definition and one for the use, and print them:

- **Definition** (first main task, every variant that builds a status area: list with `openForm`, list
  without `openForm`, and `noList`; never `noData`). Meaning to state, in the packet's plain style:
  the shared view state in the first main task's file also holds one status message, `statusMessage`, of type
  `StatusMessage?` (`data class StatusMessage(val text: String, val tag: String)`), initially null, and
  exposes `showStatus(text: String, tag: String)` and `clearStatus()`. The status area shows it as one Text
  whose testTag is its tag, together with the empty message when both apply. A task shows its quoted
  form-error text with `showStatus(text, "form-error")` and the message of a failed save, delete, mark or
  toggle with `showStatus(text, "write-error")`, and calls `clearStatus()` when the same action next succeeds
  and when its form closes. No task builds a second status area or its own copy of this value.
- In the open-form variant, rewrite the sentence so it does not contradict itself: the shared view state holds
  exactly two values, `openForm` and `statusMessage`, and exposes exactly the functions of both; "Every other
  state a later task owns ... lives in that task's own feature file" stays.
- In the two other variants, the sentence "State that a later task owns ... never in the shared view state"
  gets the same one exception.
- **Use** (every later task of the same packet that owns a main-surface feature with a form, a delete, or any
  create, update or delete operation): one short sentence that it shows its quoted form-error text and the
  message of a failed write by calling the shared `showStatus(text, tag)` with the tags above, clears it with
  `clearStatus()`, and builds no status area of its own.

Pass whatever flag `androidTaskExtras` needs from its caller in `src/compiler.ts` (look at how `openForm`,
`firstMain`, `noList` and `noData` are passed today and follow that). If the two status-area sentences in
`src/compiler.ts` need a pointer to the functions, add at most a short clause; do not restate the contract a
second time in different words.

**Verify**: `npx vitest run tests/android-status-area.test.ts` passes.

### Step 3: Nothing else moved

1. `npm run typecheck` and `npm test`. An existing assertion that pins a rewritten sentence may be updated to
   the new sentence; no assertion is deleted or loosened. List every updated assertion in your report.
2. Byte-identity for the other presets: before your change (at `0fb334f`, use `git stash`-free means: a second
   `git worktree` or compile first, then edit) and after it, compile every blueprint in
   `tests/fixtures/round12-blueprints/` and compare the output trees. Every non-Android packet must be
   byte-identical. For the four Android packets, save `diff -r` output and check that the only changed lines
   are the sentences this plan names (and plan 010's, when both are applied).

**Verify**: exit 0; non-Android diff is empty; you can quote the Android diff in your report.

## Test plan

`tests/android-status-area.test.ts` (new), as in Step 1.

## Done criteria

- [ ] `npm run typecheck` and `npm test` exit 0; the new test file exists and passes
- [ ] `grep -c "showStatus" src/androidPlan.ts` prints at least 1; the contract text exists in one constant
- [ ] the 20 non-Android round-12 packets compile byte-identically before and after
- [ ] `git diff --stat 0fb334f` lists only in-scope files; nothing pushed

## STOP conditions

- An excerpt in "Current state" does not match the live code.
- The Android kit (`src/androidKit.ts`) already ships a shared view state or status type that the new rule
  would contradict.
- A later task cannot call a function of the first main task's file under the packet's own file rules (find
  the sentence that allows `openAdd()` to be called from a later task; if that route does not carry over to
  `showStatus`, report it).
- A non-Android packet changes.

## Maintenance notes

- Not verified by this plan: no packet is built into an Android app, and no paid review reads the new text.
  The next live Android run is the real check.
- The same question (how does a later task reach a shared message area) may exist in the Tauri and GTK
  presets; they use an errors banner and toasts with their own rules and were not reported. Not in this plan.
