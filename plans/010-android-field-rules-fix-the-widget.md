# Plan 010: The Android field rules decide each input widget, whatever widget the PRD's prose names

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the
> expected result before moving on. If anything in "STOP conditions" occurs, stop and report — do not improvise.
> The reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**: this plan is stacked on plan 009 on the same branch. `git diff --stat 0fb334f..HEAD -- src/androidForms.ts`
> may show plan 009's change only. Compare the excerpts below with the live code; on a mismatch, STOP.

## Status

- **Priority**: P1 · **Effort**: S · **Risk**: LOW (adds one sentence to Android form contracts)
- **Depends on**: `plans/009-android-status-area-has-a-posting-path.md` (same files, same branch) · **Category**: bug (packet contradiction)
- **Planned at**: commit `0fb334f`, 2026-11-11
- **Source**: round 13, Android idea N2 "Sleep Log", live run in the app: verdict "Not ready", blocking finding 1.

## Why this matters

The PRD's feature text is written by the provider model and may name a widget: the Sleep Log PRD said the
Bedtime and Wake-up time fields "are time pickers". The TRD's form contract is written by the compiler and
said "Bedtime: a text field in the format HH:mm (24-hour)" with a pattern and an error message. Two documents
name two widgets, which give different code, tests and tags, and nothing says which one wins. The reviewer
blocked the packet. The compiler cannot control the provider's prose, so the form contract must say that it
decides the widget.

## Current state

`src/androidForms.ts:90` (`androidFormRules`, the "Form (...)" line) contains:

```
each field is a text field (unless its rule below makes it a picker) whose visible label equals its name and whose testTag is "field-" plus the field's slug (...)
```

`src/androidForms.ts:125` (`androidSettingFormRules`) contains the same clause for a stored setting:
`each value is a text field (unless its rule below makes it a pick...`.

`src/androidForms.ts:56-74` (`fieldRule`) fixes the widget per value type: text field for text, number,
whole-number, date-time and time; a Material 3 date picker for a date; a single-select picker for a choice.

`src/androidPlan.ts:153` (task note): `Form rules: build the form exactly as the Form, Field rules and Rejection details of the owned interface contracts say; ...`

The same form line already has one precedence rule of this kind, for labels: "Exception, one rule for every
label: when an acceptance signal or the PRD quotes the exact label of a field or button of this form ... use
that quoted label". Follow its style.

Repository rules: failing test first; no special case for a product name; never delete or loosen an existing
assertion; commit locally only, never push; no API keys and no paid calls.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| One file | `npx vitest run tests/android-forms.test.ts` | all pass |
| All tests | `npm test` | exit 0 |

## Scope

**In scope**: `src/androidForms.ts` (the two "Form (...)" lines), `src/androidPlan.ts` (the "Form rules:" note),
`tests/android-forms.test.ts`.

**Out of scope**: changing which widget a value type gets (a time stays a text field), the provider prompt in
`src/schema.ts`, rewriting PRD prose, every other preset.

## Git workflow

Same branch as plan 009: `advisor/009-android-status-and-widgets`. One commit for this plan, after plan 009's.
Message style: `fix(android): ...`. Never push.

## Steps

### Step 1: Failing test

In `tests/android-forms.test.ts` add a test that calls `androidFormRules` with a `time` field and a `date`
field, and `androidSettingFormRules` with one value, and asserts that the "Form (" line of each result contains
one widget rule that says: the Field rules fix the input widget of every field; when the PRD or an acceptance
signal describes a field with another widget (a time picker where the rule says a text field, a dropdown, a
slider, a stepper), build the widget the Field rules name; the PRD's label, values and limits still apply.
Assert on a stable part of the sentence, for example `Widget rule:` and `build the widget the Field rules name`.
Add one assertion over a compiled Android fixture with a form that the task note contains the pointer from
Step 2.

**Verify**: the new assertions fail today.

### Step 2: One widget rule

Put the sentence in one exported constant in `src/androidForms.ts` and print it in both "Form (...)" lines,
next to the existing label exception. In `src/androidPlan.ts:153` extend the "Form rules:" note with a short
clause that the Field rules also fix each field's widget, whatever widget the PRD's prose names.

**Verify**: `npx vitest run tests/android-forms.test.ts` passes.

### Step 3: Nothing else moved

`npm run typecheck`, `npm test`, and the byte-identity check of plan 009 Step 3 (non-Android packets
unchanged; the Android diff shows only the sentences of plans 009 and 010).

**Verify**: exit 0; non-Android diff empty.

## Done criteria

- [ ] `npm run typecheck` and `npm test` exit 0; the new assertions exist and pass
- [ ] the widget rule text exists once in `src/` (one constant, printed in two places)
- [ ] `git diff --stat 0fb334f` lists only files in scope of plans 009 and 010; nothing pushed

## STOP conditions

- An excerpt in "Current state" does not match the live code.
- An existing test fails for a reason other than a pinned sentence that this plan extends.

## Maintenance notes

- Open question for the owner, not in this plan: Android enters a date with a Material date picker but a time
  as typed text (HH:mm). Making a time a Material time picker would match what a provider model naturally
  writes, at the cost of new kit and test rules.
- The other presets have the same class of risk (provider prose names a widget, the compiler contract names
  another). None was reported; add the same rule there when one is.
