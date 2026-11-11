# Plan 004: The review and repair helpers exist once, and the tests cover the copy the app runs

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the
> expected result before moving on. If anything in "STOP conditions" occurs, stop and report — do not improvise.
> If a reviewer dispatched you, the reviewer maintains `plans/README.md`; otherwise update this plan's row there.
>
> **Drift check (run first)**: `git diff --stat d77242f..HEAD -- src/review.ts scripts/agent-ready/fix.ts scripts/agent-ready/review.ts tests/review-tool.test.ts`
> Any change there: compare the excerpts below with the live code; on a mismatch, STOP.

## Status

- **Priority**: P1 · **Effort**: S–M · **Risk**: LOW (no behaviour change intended)
- **Depends on**: none · **Category**: tech-debt, tests
- **Planned at**: commit `d77242f`, 2026-11-11

## Why this matters

Cascade V4 reviews a compiled packet with Claude and applies the repair edits Claude returns. That logic exists
twice: once in `src/review.ts` (what the desktop app and the CLI run) and once in two older command-line scripts
under `scripts/agent-ready/`. The tests for the hardest parts (create, move and delete of files, failed edits,
the prompts) import only the script copies, so the copy that ships is the one without those tests. Any fix
made to one copy silently misses the other. Plans 005 and 007 change this code and must be made once.

## Current state

- `src/review.ts` (481 lines) exports, among others: `buildReviewPromptForPacket(slug, preset, idea, files, notShown)`
  (line 185), `buildFixPrompt(idea, preset, files, blocking)` (205), `quoteFound(quote, files)` (236),
  `filterVerifiedFindings` (241), `applyEdits(files, edits)` returning `{ files, applied, failed }` (255),
  `touchedKit(edits, failed)` (325), and the types `PacketFile`, `Edit`, `EditFailure`, `Review`, `Fix`.
  `validPacketPath` (249) is not exported. This file is bundled into the browser frontend, so it must not import
  any `node:` module.
- `scripts/agent-ready/fix.ts` (279 lines) defines its own `validPacketPath` (36), `applyEdits` returning
  `{ files, failed }` (43), `writePacketEdits` (105), `touchedKit` (117), `buildKit` (161), `buildFixPrompt` (201), `main` (225).
- `scripts/agent-ready/review.ts` (115 lines) defines its own `readPacket` (31), `ideaFromRoundScript` (45),
  `buildReviewPrompt(packet, idea, files, notShown)` (55), `quoteFound` (73), `main` (78).
- The two `validPacketPath` and the two `touchedKit` bodies are textually identical today:

```ts
function validPacketPath(path: string | undefined): path is string {
  if (!path || path.startsWith("/") || path.includes("\\") || path === "blueprint.json") return false
  const parts = path.split("/")
  return parts.every(part => part !== "" && part !== "." && part !== "..")
}
```

- `tests/review-tool.test.ts:11-23` imports:

```ts
import {
  applyEditsToCompiledPacket, DEFAULT_REVIEW_ROUNDS, filterVerifiedFindings, Fix, FIX_JSON_SCHEMA,
  packetFilesFromCompiled, Review, REVIEW_JSON_SCHEMA, runReviewAndRepairLoop,
} from "../src/review"
import { applyEdits, buildFixPrompt, touchedKit, writePacketEdits } from "../scripts/agent-ready/fix"
import { buildReviewPrompt, quoteFound, readPacket } from "../scripts/agent-ready/review"
```

Conventions: vitest; no semicolons, double quotes, 2 spaces. Repository rules: commit locally only, never push;
never delete or loosen an existing assertion; no API keys and no paid network calls (never run the scripts'
`main`, `cascade generate`, or `npm run probe:live`; never print environment variables).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install (fresh worktree) | `npm ci` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| One file | `npx vitest run tests/review-tool.test.ts` | all pass |
| All tests | `npm test` | exit 0 (baseline at `d77242f`: 497 passed, 19 skipped) |
| Frontend build | `npm run build` | exit 0 (proves `src/review.ts` still bundles for the browser) |

## Scope

**In scope**: `src/review.ts` (exports only; no logic change), `scripts/agent-ready/fix.ts`,
`scripts/agent-ready/review.ts`, `tests/review-tool.test.ts`.

**Out of scope**: `src/review-wire.ts`, `src/pipeline.ts`, `src-tauri/**`, the `buildKit` function in
`scripts/agent-ready/fix.ts` (plan 007 and finding H own the build commands), `scripts/agent-ready/*.sh`,
`*.fish`, `*.py`, `*.md`.

## Git workflow

Branch `advisor/004-one-repair-implementation`. Commit per step. Message style: `refactor(review): ...`.
Never push, no pull request.

## Steps

### Step 0: Baseline

`npm ci`, `npm run typecheck`, `npm test`. **Verify**: exit 0, 497 passed.

### Step 1: Prove the copies agree before removing one

Diff the pairs by reading them side by side: `applyEdits` (src 255-323 vs script 43-103), `buildFixPrompt`
(src 205-232 vs script 201-223), `quoteFound` and `flat`, and `buildReviewPrompt` (script 55-68) against
`buildReviewPromptForPacket` (src 185-203). Write down every behavioural difference (not formatting). Expected
differences: the src `applyEdits` also returns `applied` and orders the result files (documents first); the
review prompt functions take different first arguments.

**Verify**: your notes list each difference. If the script copy does something the src copy does not (an
extra check, another failure reason, different prompt text that a test asserts), STOP and report it: the
owner must decide which behaviour is right.

### Step 2: Point the tests at the src copy first

In `tests/review-tool.test.ts` import `applyEdits`, `buildFixPrompt`, `touchedKit` and `quoteFound` from
`../src/review` instead of the scripts (keep `writePacketEdits`, `readPacket`, `buildReviewPrompt` from the
scripts for now). Adapt call sites only where the return shape differs (`applied` is extra).

**Verify**: `npx vitest run tests/review-tool.test.ts` → all pass with no assertion changed. If an assertion
fails, that is a real behavioural difference: STOP and report it.

### Step 3: Make the scripts thin

- `scripts/agent-ready/fix.ts`: delete its own `validPacketPath`, `applyEdits`, `touchedKit`, `buildFixPrompt`,
  `Edit`, `EditFailure` and import them from `../../src/review` (export `validPacketPath` from `src/review.ts`
  if the script needs it). Keep `writePacketEdits`, `buildKit`, `main`. Keep the script's exports that the test
  still imports.
- `scripts/agent-ready/review.ts`: delete its own `quoteFound`, `flat`, `Review` schema if identical, and make
  `buildReviewPrompt(packet, idea, files, notShown)` a wrapper that derives the slug and the preset exactly as
  it does today and calls `buildReviewPromptForPacket`. Keep `readPacket`, `ideaFromRoundScript`, `main`.

**Verify**: `npm run typecheck` exit 0; `npx vitest run tests/review-tool.test.ts` all pass;
`grep -c "function applyEdits\|function validPacketPath\|function touchedKit\|function quoteFound" scripts/agent-ready/fix.ts scripts/agent-ready/review.ts`
prints 0 for both files.

### Step 4: Full checks

`npm run typecheck`, `npm test`, `npm run build`.

**Verify**: all exit 0; test count is still 497 passed (no test removed).

## Test plan

No new behaviour, so no new tests. The proof is that the existing tests for create, move, delete, failed edits
and prompts now run against `src/review.ts` and pass unchanged.

## Done criteria

- [ ] `npm run typecheck`, `npm test`, `npm run build` exit 0; 497 tests pass
- [ ] `grep -n "from \"../scripts/agent-ready/fix\"" tests/review-tool.test.ts` shows only `writePacketEdits` (and nothing that also exists in `src/review.ts`)
- [ ] `git diff d77242f -- src/review.ts` shows only added `export` keywords (no logic change)
- [ ] `git diff --stat d77242f` lists only in-scope files; nothing pushed

## STOP conditions

- An excerpt in "Current state" does not match the live code.
- Step 1 or Step 2 finds a behavioural difference between the copies.
- `src/review.ts` would need a `node:` import.
- A verification fails twice after a reasonable fix.

## Maintenance notes

- After this lands, plans 005 and 007 change one copy only.
- `src/review-wire.ts` (the Node kit builder used by the CLI) still has no tests; plan 007 adds one for its environment.
- The script's `buildKit` and the build commands in four other places are finding H, not this plan.
