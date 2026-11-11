# Plan 012: The review asks what happens to a delayed write when the app closes

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the
> expected result before moving on. If anything in "STOP conditions" occurs, stop and report — do not improvise.
> The reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**: this plan is stacked on branch `integrate/009-011` (commit `355da7a`).
> `git diff --stat 355da7a..HEAD -- src/review.ts scripts/agent-ready/audit-brief.md` must print nothing.

## Status

- **Priority**: P1 · **Effort**: S · **Risk**: LOW in code, MED in effect (the paid review gets one more check, so
  a packet with a delayed write can get one more blocking finding and one more repair round)
- **Depends on**: plans 009 to 011 (same file `src/review.ts`) · **Category**: quality check (stricter)
- **Planned at**: commit `355da7a`, 2026-11-11
- **Owner decision**: Alan said yes on 2026-11-11 ("yes add the review check for delayed writes").
- **Source**: round 13, Tauri idea T3 "Scratch Pad". The in-app review passed the packet with 0 blocking; an
  independent audit then blocked it: no document says what happens to text typed in the last second before the
  window closes, while the packet says the one-second timer is the only thing that writes.

## Why this matters

When an idea has a delayed write (an autosave one second after the user stops typing), the packet must say
what happens to the pending write when the window closes. Without that rule a literal build loses the last
input, and two coding agents build two different behaviours. The review brief has ten checks and none of them
asks for this, so the in-app reviewer did not look.

## Current state

`src/review.ts:150-172`: `const AUDIT_BRIEF_BODY = [ ... ].join("\n")`, with the lines `"Check specifically:"`,
then checks `"1. ..."` to `"10. preset-specific build/run path coherent."`, then an empty line and
`"If you find nothing blocking, say so plainly. Do not pad: no style nits."`.

`scripts/agent-ready/audit-brief.md:7-17` holds the same ten checks for audits run by hand. No test compares
the two copies (`grep -n "audit-brief" tests/*.ts` prints nothing).

Repository rules: failing test first; never delete or loosen an existing assertion; commit locally only, never
push; no API keys and no paid calls.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| One file | `npx vitest run tests/review-tool.test.ts` | all pass |
| All tests | `npm test` | exit 0 (baseline at `355da7a`: 530 passed, 19 skipped) |

## Scope

**In scope**: `src/review.ts` (one new line in `AUDIT_BRIEF_BODY`), `scripts/agent-ready/audit-brief.md` (the
same line), `tests/review-tool.test.ts`.

**Out of scope**: every other line of the brief, the fix prompt, the repair loop, the compiler.

## Git workflow

Branch `advisor/012-review-checks-delayed-writes`, created from `355da7a`. One commit. Message style:
`feat(review): ...`. Never push.

## Steps

### Step 1: Failing tests

In `tests/review-tool.test.ts`:

1. The review prompt built for a packet (use the builder the existing tests use) contains the new check 11,
   asserted on its full text.
2. The numbered checks of `scripts/agent-ready/audit-brief.md` (the lines that start with a number and a dot
   after "Check specifically:") are equal, in order, to the numbered checks in the review prompt. Read the
   Markdown file with `node:fs` in the test. If the ten existing checks already differ between the two
   copies, STOP and report the differing lines instead of changing either copy.

**Verify**: test 1 fails today; test 2 fails only because check 11 is missing from both (after you add it to
one copy in the test's expectation) or passes for the ten existing checks.

### Step 2: The check

Add this line after check 10, in both files, with exactly this text:

```
11. delayed user input: when a change the user makes is held before it is written (an autosave delay or a debounce), the packet states what happens to the held change when the app or window closes or the screen is left (written at once, or lost by design), names the owner and the mechanism, and has an acceptance criterion for it. A timer that only refreshes data or runs a background job is not a delayed write.
```

(Amended after QA, commit `fb5e054`: the first wording, "when a write waits (an autosave delay, a debounce, a
timer, a queued save)", could match a Waybar refresh or a background job.)

**Verify**: both tests pass; `npm run typecheck` and `npm test` exit 0.

## Done criteria

- [ ] `npm run typecheck` and `npm test` exit 0; the two new tests exist and pass
- [ ] `git diff --stat 355da7a` lists only the three in-scope files; nothing pushed

## STOP conditions

- The ten existing checks differ between `src/review.ts` and `scripts/agent-ready/audit-brief.md`.
- An existing test pins the full brief text and fails (report it; updating a pinned copy of the brief to
  include check 11 is allowed, list it).

## Maintenance notes

- Not verified: no paid review has run with the new check. The next live run of an idea with autosave
  (round 13, T3 "Scratch Pad") is the real test; watch whether the repair states the close rule.
- The root cause stays open: the Tauri compiler has no shape for one record edited in place with autosave,
  so the repair model writes that design itself. The check only makes the reviewer look at the hole.
