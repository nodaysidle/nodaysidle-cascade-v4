# Plan 005: A repair cannot write a file the export rejects, and the verdict stops hiding findings

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the
> expected result before moving on. If anything in "STOP conditions" occurs, stop and report — do not improvise.
> If a reviewer dispatched you, the reviewer maintains `plans/README.md`; otherwise update this plan's row there.
>
> **Drift check (run first)**: `git diff --stat d77242f..HEAD -- src/review.ts src/cli.ts src-tauri/src/export.rs`
> Plan 004 is expected to have changed `src/review.ts` exports only. Any other change: compare the excerpts
> below with the live code; on a mismatch, STOP.

## Status

- **Priority**: P1 · **Effort**: M · **Risk**: MED (changes which repair edits are accepted)
- **Depends on**: `plans/004-one-repair-implementation.md` (must be DONE, so the fix is made once) · **Category**: bug
- **Planned at**: commit `d77242f`, 2026-11-11

## Why this matters

Cascade V4 lets Claude repair a compiled packet with file edits (replace, create, move, delete), then exports
the packet through a Rust command. Four defects sit in that path:

1. The TypeScript check on an edit's path is looser than the Rust export check. A repair can create
   `kit/.gitignore`, a file whose name has a space, or an empty file; the edit is recorded as applied, and the
   later export or kit build rejects the whole packet. A create outside `kit/` (for example `NOTES.md`) is
   recorded as applied and then silently dropped.
2. A review finding whose quote does not match the files character for character is dropped without a trace.
   A blocking finding quoted with "…" where the file has "..." vanishes, and the packet is called agent-ready.
3. The idea text is inserted into the review prompt with `String.replace`, which treats `$'`, `$&` and `$$` in
   the idea as replacement patterns and mangles the prompt.
4. The CLI prints nothing when no Anthropic key is set, so a packet with no review looks the same as one that
   was never meant to be reviewed.

## Current state

`src/review.ts:249-253` (the path check; plan 004 may have added `export`):

```ts
function validPacketPath(path: string | undefined): path is string {
  if (!path || path.startsWith("/") || path.includes("\\") || path === "blueprint.json") return false
  const parts = path.split("/")
  return parts.every(part => part !== "" && part !== "." && part !== "..")
}
```

`src/review.ts:262-270` (inside `applyEdits`):

```ts
  for (const edit of edits) {
    const op = edit.op ?? "replace"
    if (!validPacketPath(edit.file)) { failed.push({ edit, reason: "invalid packet file path" }); continue }
    if (op === "create") {
      if (texts.has(edit.file)) { failed.push({ edit, reason: "the file already exists in the packet" }); continue }
      texts.set(edit.file, edit.replace)
      applied.push(edit)
      continue
    }
```

The move branch (lines 278-296) checks `validPacketPath(edit.to)` and may set the moved file's text to
`edit.replace`. `REQUIRED_DOCS` is the set of the five document names (`PRD.md ARD.md TRD.md TASKS.md AGENTS.md`).

`src-tauri/src/export.rs` (the rule to mirror; do not change this file):

```rust
const MAX_EXPORT_FILE_BYTES: usize = 2_000_000;   // line 13
const KIT_PREFIX: &str = "kit/";                  // line 15
const MAX_KIT_PATH_DEPTH: usize = 16;             // line 18

fn valid_content(file: &ExportFile) -> bool {     // line 101
    !file.content.trim().is_empty()
        && file.content.len() <= MAX_EXPORT_FILE_BYTES
        && file.sha256 == sha256_hex(file.content.as_bytes())
}

fn valid_kit_path(name: &str) -> bool {           // line 107
    let Some(relative) = name.strip_prefix(KIT_PREFIX) else { return false; };
    let parts: Vec<&str> = relative.split('/').collect();
    parts.len() <= MAX_KIT_PATH_DEPTH
        && parts.iter().all(|part| {
            !part.is_empty()
                && !part.starts_with('.')
                && part.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"._-+[]".contains(&byte))
        })
}
```

`src/review.ts:234-247`:

```ts
const flat = (text: string): string => text.replace(/\s+/g, " ").trim()

export function quoteFound(quote: string, files: readonly PacketFile[]): boolean {
  const wanted = flat(quote)
  return wanted !== "" && files.some(file => flat(file.text).includes(wanted))
}

export function filterVerifiedFindings(review: Review, files: readonly PacketFile[]): Review {
  return {
    ...review,
    blocking: review.blocking.filter(item => quoteFound(item.quote, files)),
    polish: review.polish.filter(item => quoteFound(item.quote, files)),
  }
}
```

`src/review.ts:192-195`:

```ts
  const brief = AUDIT_BRIEF_BODY
    .replace("<ROOT>/<preset>/<slug>", slug)
    .replace("<preset>", preset)
    .replace("<idea>", idea)
```

`src/cli.ts:76` passes `anthropicKey ? nodeReviewProvider : undefined`, and lines 85-89 print the verdict only
`if (result.repair)`.

`src/review.ts:121-131` (`PacketRepairRecord`, written into `blueprint.json` and replayed by `cascade verify`)
has the fields `model, rounds, edits, review, kitBuilt?, kitBuildPassed?, kitBuildError?, verdict, agentReady`.

Conventions: vitest, tests in `tests/review-tool.test.ts` (use its existing `describe` blocks as the pattern).
Repository rules: write the failing test first; never delete or loosen an existing assertion or check; commit
locally only, never push; no API keys and no paid calls; never print environment variables.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| One file | `npx vitest run tests/review-tool.test.ts` | all pass |
| All tests | `npm test` | exit 0 |
| Frontend build | `npm run build` | exit 0 |

## Scope

**In scope**: `src/review.ts`, `src/cli.ts`, `tests/review-tool.test.ts`.

**Out of scope**: `src-tauri/**` (the Rust rule is the reference; do not loosen it), `src/pipeline.ts`,
`src/state.ts`, `src/packet.ts`, the review brief text (`AUDIT_BRIEF_BODY`), the definition of blocking.

## Git workflow

Branch `advisor/005-repair-paths-and-honest-verdict`. One commit per step. Message style: `fix(review): ...`.
Never push, no pull request.

## Steps

### Step 1: Failing tests

Add to `tests/review-tool.test.ts`:

1. `applyEdits` rejects, each with a failed entry and an unchanged file list: a create of `kit/.gitignore`;
   a create of `kit/src/my file.ts`; a create of `kit/a/b/.../` deeper than 16 parts after `kit/`; a create of
   `kit/src/empty.ts` with `replace: ""` and with `replace: "   \n"`; a create of `NOTES.md`; a move whose
   `to` is `kit/.hidden/x.ts`; a move of a kit file to `README.md` at the packet root.
2. `applyEdits` still accepts: a create of `kit/src/pages/books/[slug].astro` with text; a replace in `TRD.md`;
   a move between two valid kit paths.
3. A parity test that reads `src-tauri/src/export.rs` as text and asserts that the three numbers and the
   allowed punctuation there (`2_000_000`, `MAX_KIT_PATH_DEPTH: usize = 16`, `b"._-+[]"`) equal the constants
   you export from `src/review.ts`, so the two rules cannot drift apart unnoticed.
4. `quoteFound` finds a quote written with `…`, curly quotes (`“ ” ‘ ’`) or a non-breaking space when the file
   has `...`, straight quotes and a normal space, and the other way round. It still rejects a quote whose words differ.
5. `buildReviewPromptForPacket` with the idea `pay $' now, $& later, $$ total` contains that idea text exactly.

**Verify**: `npx vitest run tests/review-tool.test.ts` → the new tests fail, the existing ones pass.

### Step 2: One path rule, the Rust one

In `src/review.ts` replace the body of `validPacketPath` with: the path is one of the five document names, or
it starts with `kit/` and the part after `kit/` splits on `/` into at most 16 parts, each non-empty, not
starting with `.`, and made only of ASCII letters, digits and `._-+[]`. Export the constants the parity test
needs (`MAX_PACKET_FILE_BYTES = 2_000_000`, `MAX_KIT_PATH_DEPTH = 16`, the allowed punctuation). Then in `applyEdits`:

- create: reject a target that is not under `kit/` with the reason `only files under kit/ can be created`;
  reject text that is empty after trimming, or longer than 2,000,000 bytes (count UTF-8 bytes, not
  characters), with the reason `a packet file cannot be empty` / `the file is larger than the export limit`.
- move: the same target rule and the same content rule for the resulting text.
- replace: reject a result that is empty after trimming with `a packet file cannot be empty`.

Use `new TextEncoder().encode(text).length` for bytes; this file must not import `node:` modules.

**Verify**: tests 1 to 3 pass; all existing tests in the file still pass unchanged.

### Step 3: Quotes match across typographic variants

Change `flat` so that before collapsing whitespace it maps `…` to `...`, the four curly quotes to their
straight forms, and a non-breaking space (U+00A0) and a narrow no-break space (U+202F) to a normal space.
Nothing else: no case folding, no punctuation removal.

**Verify**: test 4 passes.

### Step 4: The idea is inserted literally

Use function replacers for all three replacements, for example `.replace("<idea>", () => idea)`.
If `scripts/agent-ready/review.ts` still has its own `.replace("<idea>", idea)` after plan 004, it is out of
scope here: report it instead of editing it.

**Verify**: test 5 passes.

### Step 5: The CLI says when there was no review

In `src/cli.ts`, after `Gate Clean: ...`, when `result.repair` is undefined print
`Verdict: none (not reviewed: ANTHROPIC_API_KEY is not set)` when no Anthropic key was given. Print the key's
name only, never its value. Do not change the exit code.

**Verify**: `npm run typecheck` exit 0. Read your change once and confirm no code path prints a key.

### Step 6: Dropped findings are counted (only if the manifest allows it)

Read `src/packet.ts` and find how `blueprint.json` → `repair` is parsed on `verify` and on `compile --blueprint`.
If an added optional field in the repair record is preserved and does not break `verifyPacketFolder` (write a
test that proves it: a packet written with the new field verifies), add to `PacketRepairRecord`
`unverifiedFindings?: { blocking: number; polish: number }` (the number of findings of the **last** review that
`filterVerifiedFindings` dropped, omitted when both are 0) and `failedEdits?: number` (edits of all rounds that
did not apply, omitted when 0), fill them in `runReviewAndRepairLoop`, and print them in the CLI verdict line
when present. Do not change how `agentReady` is computed.
If the parse is strict, or the Rust side validates the repair record's shape, skip this step and say so in
your report.

**Verify**: `npm test` exit 0, `npm run build` exit 0.

## Test plan

New tests as listed in Step 1 (and Step 6 if done), all in `tests/review-tool.test.ts`, modelled on the
existing "rejects invalid file operations without touching the files" test at line 113.

## Done criteria

- [ ] `npm run typecheck`, `npm test`, `npm run build` exit 0; the new tests exist and pass
- [ ] `git diff --stat <start>` lists only in-scope files; `src-tauri/` untouched
- [ ] No existing assertion deleted or loosened
- [ ] Nothing pushed

## STOP conditions

- Plan 004 is not DONE (`scripts/agent-ready/fix.ts` still defines its own `applyEdits`).
- An existing test fails because it relied on a path the Rust rule rejects (report the test and the path).
- A fixture's recorded repair edits (`tests/` or a manifest replay test) stop applying under the stricter rule.
- A change would need `src-tauri/**` or `src/packet.ts`.
- A verification fails twice after a reasonable fix.

## Maintenance notes

- The Rust rule is the reference. If it changes, the parity test fails and the TypeScript constants must follow.
- Deliberately not done: making a dropped blocking finding count against "agent-ready". That changes the
  verdict and needs the owner's decision and a few paid runs to see how often it happens.
- `kitBuildError` still writes the build output, which can contain local paths, into `blueprint.json`.
