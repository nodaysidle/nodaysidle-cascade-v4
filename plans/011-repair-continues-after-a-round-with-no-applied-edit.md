# Plan 011: A repair round whose edits all fail no longer ends the repair, and the app shows the failed edits

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the
> expected result before moving on. If anything in "STOP conditions" occurs, stop and report — do not improvise.
> The reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0fb334f..HEAD -- src/review.ts src/app.ts src/cli.ts tests/review-tool.test.ts`
> must print nothing. Otherwise compare the excerpts below with the live code; on a mismatch, STOP.

## Status

- **Priority**: P1 · **Effort**: S–M · **Risk**: MED (changes when the paid repair loop stops)
- **Depends on**: none · **Category**: bug
- **Planned at**: commit `0fb334f`, 2026-11-11
- **Source**: round 13, Android idea N2 "Sleep Log", live run in the app: "Not ready · 1 repair round (0 edits)"
  with two blocking findings and two of three repair rounds unused.

## Why this matters

After a review finds blocking defects, Cascade V4 asks the model for edits, applies them, and reviews again, up
to three rounds. When a round applies no edit (every `find` text missed the file, or the model returned none),
the loop stops at once: one bad answer from the model ends the repair and the user gets "Not ready" although
two rounds were left and paid for nothing. The app then shows "1 repair round (0 edits)" and hides that edits
failed to apply, so the user cannot tell a model that did nothing from edits that were rejected.

## Current state

`src/review.ts:466-482` (inside the repair loop of the exported review-and-repair function):

```ts
  while (currentReview.blocking.length > 0 && rounds < maxRounds) {
    if (options.signal?.aborted) throw { kind: "cancelled", classification: "cancelled" }
    rounds += 1
    options.onProgress?.("repair")
    const roundFiles = packetFilesFromCompiled(currentPacket)
    const fix = await options.reviewProvider.fix({
      requestId: `${options.requestId}-fix-${rounds}`,
      apiKey: options.apiKey,
      model,
      prompt: buildFixPrompt(options.idea, options.presetId, roundFiles.files, currentReview.blocking),
      signal: options.signal,
    })
    if (options.signal?.aborted) throw { kind: "cancelled", classification: "cancelled" }
    const edited = await applyEditsToCompiledPacket(currentPacket, fix.edits)
    failedEdits += edited.failed.length
    if (edited.applied.length === 0) break
```

`edited.failed` is a list of `{ edit, reason }` (see `src/cli.ts:119`: `replayed.failed[0]!.edit.file`,
`replayed.failed[0]!.reason`).

`src/review.ts:207-212`: `export function buildFixPrompt(idea, preset, files, blocking): string`. It is also
called with four arguments by `scripts/agent-ready/fix.ts:125`; that call must keep working unchanged.

`src/app.ts:468-471`:

```ts
    const roundsLabel = repair.rounds === 0
      ? "0 repair rounds"
      : `${repair.rounds} repair ${repair.rounds === 1 ? "round" : "rounds"} (${repair.edits.length} ${repair.edits.length === 1 ? "edit" : "edits"})`
    verdictMeta.textContent = `${repair.model} · ${roundsLabel}`
```

`src/cli.ts:91-93` already prints `unverifiedFindings` and `failedEdits`; the app prints neither.

`PacketRepairRecord` (`src/review.ts:129-130`) already has `unverifiedFindings?` and `failedEdits?`.

The kit-build branch right below (`if (touchedKit(...) && options.kitBuilder) { ... break }`) discards a
repair that broke the kit and stops. **It stays exactly as it is.**

Conventions: vitest; the loop's tests are in `tests/review-tool.test.ts` with provider doubles (see the test
near line 340 that expects `repair.failedEdits` to be 1). Find the app's verdict-panel tests with
`grep -ln "repair round" tests/*.ts`. Repository rules: failing test first; never delete or loosen an existing
assertion (an assertion that pins the old stop-after-one-round behaviour may be updated to the new behaviour:
list each one in your report); commit locally only, never push; **no API keys and no paid calls: every test
uses a provider double**; never print an environment variable.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| One file | `npx vitest run tests/review-tool.test.ts` | all pass |
| All tests | `npm test` | exit 0 (baseline at `0fb334f`: 517 passed, 19 skipped) |

## Scope

**In scope**: `src/review.ts` (the loop and `buildFixPrompt`), `src/app.ts` (the verdict meta line only),
`tests/review-tool.test.ts`, the test file that covers the verdict panel.

**Out of scope**: `DEFAULT_REVIEW_ROUNDS` (stays 3), the kit-build branch, the review prompt and the audit
brief, `filterVerifiedFindings`, `applyEdits` and its path rules, `scripts/agent-ready/fix.ts`, the Rust side.

## Git workflow

Branch `advisor/011-repair-continues-after-empty-round`. One commit per step that changes behaviour (two
commits). Message style: `fix(review): ...`. Never push, no pull request.

## Steps

### Step 1: Failing tests for the loop

In `tests/review-tool.test.ts`, with provider doubles that count their calls:

1. First fix answer holds one edit whose `find` text is not in the file; second fix answer holds one valid
   edit; the review after it reports no blocking finding. Expect: `rounds` 2, one applied edit, `failedEdits`
   1, verdict agent-ready, `fix` called twice, `review` called twice (the first review and the one after the
   applied edit; no review after the empty round, because the packet did not change).
2. Every fix answer holds only an edit that cannot apply, `maxRounds` 3. Expect: `fix` called 3 times,
   `review` called once, `rounds` 3, no applied edit, `failedEdits` 3, verdict not-ready.
3. A fix answer with an empty edit list behaves the same as case 2 (retry until the rounds are used).
4. In case 1, the prompt of the second fix call contains the file and the reason of the failed edit, and the
   prompt of the first fix call does not contain that section.

**Verify**: cases 1 to 4 fail today (the loop stops after the first round).

### Step 2: Keep going, and tell the model what failed

1. `buildFixPrompt` gets an optional fifth parameter, a list of `{ file: string; reason: string }` from the
   previous round. When it is non-empty, the prompt gains one paragraph after the list of defects: the previous
   answer's edits could not be applied, one line per failure with the file and the reason (at most 10 lines,
   then "and N more"), and the instruction to copy every `find` text exactly from the file as shown above.
   When it is empty or absent the prompt is byte-identical to today's (pin this with an assertion).
2. In the loop: when `edited.applied.length === 0`, remember `edited.failed` (file and reason only) for the
   next round's prompt and `continue` instead of `break`. The `while` condition already ends the loop at
   `maxRounds`. After a round that applied at least one edit, the remembered failures are cleared.
3. Leave the kit-build branch, the re-review, the counting of `rounds` and `failedEdits`, and the verdict
   as they are.

**Verify**: `npx vitest run tests/review-tool.test.ts` passes; `npm run typecheck` exit 0.

### Step 3: The app shows what the command line already prints

In `src/app.ts` extend the verdict meta line:

- when `repair.failedEdits` is set: `1 repair round (0 edits, 4 could not be applied)`;
- when `repair.unverifiedFindings` is set and its counts sum to more than 0, append
  ` · N findings dropped (quote not in the packet)`.

Write the failing test first in the file that covers the verdict panel; keep the existing label text unchanged
when both fields are absent.

**Verify**: the new test fails before and passes after; `npm test` exit 0.

## Test plan

As in Steps 1 and 3. No test may call a real provider.

## Done criteria

- [ ] `npm run typecheck` and `npm test` exit 0; the new tests exist and pass
- [ ] `grep -n "applied.length === 0) break" src/review.ts` prints nothing
- [ ] `scripts/agent-ready/fix.ts` is unchanged and still typechecks
- [ ] `git diff --stat 0fb334f` lists only in-scope files; nothing pushed

## STOP conditions

- An excerpt in "Current state" does not match the live code.
- The change needs a new field on `PacketRepairRecord` or a change to `DEFAULT_REVIEW_ROUNDS`.
- An existing test fails for a reason other than the old stop-after-one-round behaviour.

## Maintenance notes

- Cost: a run whose repair answers never apply now makes up to three fix calls instead of one (two more paid
  calls at most, no extra review call). The ceiling of three rounds per run is unchanged. The owner was told.
- Not covered: a fix answer that applies some edits and fails others still goes to the re-review without
  telling the model which ones failed.
