# Plan 008: Cleaning a list no longer merges "1.5" with "15"

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the
> expected result before moving on. If anything in "STOP conditions" occurs, stop and report — do not improvise.
> If a reviewer dispatched you, the reviewer maintains `plans/README.md`; otherwise update this plan's row there.
>
> **Drift check (run first)**: `git diff --stat d77242f..HEAD -- src/compiler.ts src/schema.ts`
> Any change in the lines named below: compare the excerpts with the live code; on a mismatch, STOP.

## Status

- **Priority**: P2 · **Effort**: S · **Risk**: MED (changes how every list in a blueprint is de-duplicated)
- **Depends on**: none · **Category**: bug
- **Planned at**: commit `d77242f`, 2026-11-11

## Why this matters

Before compiling, Cascade V4 cleans every list in the blueprint (choice options, acceptance signals, goals,
constraints) and drops duplicates. Two entries count as the same when their letters and digits match, with
all punctuation ignored. So the options `1.5` and `15` are one entry, as are `-5` and `5`, or `1,000` and `1000`
next to `10.00`. The second one is dropped silently, and the packet then describes a picker with a missing
option or loses an acceptance criterion, with no warning.

## Current state

`src/schema.ts:459-462` (used for names and references across the compiler; **must not change**):

```ts
// Two names are one name when their letters and digits match (case, accents, spaces and punctuation ignored); normalization keys on this.
export function nameKey(name: string): string {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "")
}
```

`src/compiler.ts:364-382`:

```ts
function semanticKey(value: string): string {
  const key = nameKey(value)
  const trimmed = value.trim()
  return key || (trimmed ? `u${fnv1a(trimmed).toString(16)}` : "")
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, " ")
    const key = semanticKey(normalized)
    if (key && !seen.has(key)) {
      seen.add(key)
      result.push(normalized)
    }
  }
  return result
}
```

`src/compiler.ts:423-425`:

```ts
function cleanList(values: readonly string[]): string[] {
  return uniqueStrings(values.map(cleanMeaning).filter(Boolean))
}
```

`cleanList` is called for `targetUsers`, `goals`, `acceptanceSignals` (line 609), choice list options (lines
645-646), `dataSent`, `nonGoals`, `qualityRequirements`, `productConstraints`; `uniqueStrings` directly at lines
747 and 811. Run `grep -n "semanticKey(" src/compiler.ts` to see every other user of `semanticKey` before you
change anything.

Conventions: vitest; fixtures in `tests/fixtures/`; normalization tests in `tests/normalize.test.ts`.
Repository rules: failing test first; fix the shared code once with no special case for a product name; never
delete or loosen an existing assertion; commit locally only, never push; no API keys and no paid calls.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| One file | `npx vitest run tests/normalize.test.ts` | all pass |
| All tests | `npm test` | exit 0 (baseline at `d77242f`: 497 passed, 19 skipped) |

## Scope

**In scope**: `src/compiler.ts` (the dedupe key used by `uniqueStrings` only), `tests/normalize.test.ts`.

**Out of scope**: `nameKey` and `referenceKey` in `src/schema.ts`, `cleanMeaning`, every other caller of
`semanticKey` (leave them on the old key unless Step 2 shows they share the bug in a list context).

## Git workflow

Branch `advisor/008-list-dedupe-keeps-numbers-apart`. One commit. Message style: `fix(compiler): ...`.
Never push, no pull request.

## Steps

### Step 1: Failing test

In `tests/normalize.test.ts` add a test that compiles (or normalizes, whichever the file's existing tests do)
a copy of an existing fixture in which one feature's choice list has the options
`["0.5", "5", "1.5", "15", "-5", "1,000", "1000", "Large", "large", "LARGE "]`, and asserts the resulting
options are exactly `["0.5", "5", "1.5", "15", "-5", "1,000", "1000", "Large"]`. That is: entries that differ
in a decimal point, a minus sign or a thousands separator stay apart, while case and spacing duplicates still
merge. If the blueprint schema rejects such a list for another reason, use an `acceptanceSignals` list with
sentences that differ only in such a number (`"shows 1.5 km"`, `"shows 15 km"`).

**Verify**: the test fails today (it returns fewer entries).

### Step 2: A list key that keeps what separates numbers

Add a function next to `semanticKey`, for example `listKey(value)`, and use it in `uniqueStrings` instead of
`semanticKey`. It works like `nameKey` (NFKD, accents removed, lower case, everything that is not a letter or
digit removed) with one difference: a `.` or `,` that stands directly between two digits is kept, and a `-`
that stands directly before a digit and is not directly after a letter or digit is kept. Keep the existing
fallback for a value with no letters or digits (the `u<hash>` key). Do not change `semanticKey` itself.

**Verify**: the new test passes; `npx vitest run tests/normalize.test.ts` all pass.

### Step 3: Nothing else moved

Run `npm run typecheck` and `npm test`.

**Verify**: exit 0, 497 plus your new test pass, and **no existing assertion needed a change**. If an existing
test fails, the new key changed the output of a real fixture: do not edit that test; STOP and report the
fixture, the list, and the two entries that are now kept apart.

## Test plan

One new test in `tests/normalize.test.ts`, modelled on the existing tests in that file.

## Done criteria

- [ ] `npm run typecheck` and `npm test` exit 0; the new test exists and passes
- [ ] `git diff d77242f -- src/schema.ts` is empty
- [ ] `git diff --stat d77242f` lists only `src/compiler.ts` and `tests/normalize.test.ts`; nothing pushed

## STOP conditions

- An excerpt in "Current state" does not match the live code.
- Any existing test fails after Step 2 (see Step 3).
- A caller other than `uniqueStrings` needs the new key to make the test pass.

## Maintenance notes

- A dropped duplicate is still silent. A follow-up could record dropped list entries in the validation ledger
  so the user sees them; not in this plan.
- `cleanMeaning` also rewrites text inside quotes (finding K); separate plan when the owner wants it.
