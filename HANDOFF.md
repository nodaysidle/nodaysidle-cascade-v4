# HANDOFF — NODAYSIDLE Cascade V4 (written 2026-11-09)

Read this file first, then `AGENTS.md`. It tells you what the app is, what has been done, what is
still wrong, and exactly how to continue. Written for Claude Opus 5.5 / Fable 5.1 taking over.

Workspace rules that apply: `/home/arch/dev/nodaysidle/CLAUDE.md` (start every reply with `ALAN`;
this repo's `AGENTS.md` wins over the root one). The owner is Alan (git user `nodaysidle`).

## 1. What the app is

Cascade V4 is a local-first **compiler** and Tauri 2 desktop app (Arch Linux / Omarchy, Wayland).
Input: one software idea (plain text) + one locked tech-stack preset + optional preset options.
Output: a folder with exactly five Markdown contracts + a starter kit + a manifest:

```text
PRD.md  ARD.md  TRD.md  TASKS.md  AGENTS.md   (the five documents)
kit/                                          (real, tested starter code the agent copies, not invents)
blueprint.json                                (validated provider blueprint + preset + options + all hashes)
```

A coding agent (Claude Code etc.) is then opened in that folder, reads `AGENTS.md` first, follows
`TASKS.md` task by task, copies `kit/` instead of inventing plumbing, and builds the product.
**The product of this repo is the quality of those documents: "agent-ready".** This repo is the
compiler, not any app it produced. `PROMPT.md` is the paste-in prompt for the *builder* agent (it is a
product file, keep it).

Five presets (`src/presets.ts`): `linux-wayland-gtk4-desktop` (Rust, GTK4, libadwaita),
`linux-hyprland-waybar-module` (Rust CLI + Waybar JSON + systemd user unit), `tauri2-rust-typescript-desktop`,
`astro-web` (static site, content collections), `android-kotlin-compose`. No macOS preset exists.

## 2. How it works

```text
idea + preset
  -> local intake checks (src/schema.ts, src/capabilities.ts)        no money spent if invalid
  -> TypeSafe Jev preflight (src/jev.ts, src-tauri/src/jev.rs)
  -> ONE DeepSeek request, strict JSON schema (src/pipeline.ts, src/provider.ts)
     -> blueprint (declared product meaning only; no IDs, files, commands)
  -> intake audit + capability audit of the blueprint
     -> on failure: exactly ONE repair request (intake AND capability rejections are repairable)
  -> Jev integrity -> normalize (src/compiler.ts normalizeBlueprint) -> project graph
     (owners, contracts, phases, tasks, IDs) -> render five docs (src/renderers.ts)
     + kit (src/kits.ts, tauriKit.ts, astroKit.ts, androidKit.ts, waybarKit.ts)
  -> auditPacket (src/audit.ts) gates export; preview bytes == export bytes
  -> atomic export (src-tauri/src/export.rs) with blueprint.json manifest
```

Core philosophy (do not break): everything after the provider answer is **deterministic local code**.
The compiler never guesses from feature prose with regexes. It uses **declared fields** the provider
fills in `src/schema.ts` (features: `buildsOn`, `dataOperations` per data object incl. `edit` vs
`update`, `invokedBy`, `runsEverySeconds`/`runsDailyAt`/`runsAtField`, `systemSource`, `thresholds`,
`labelTemplate`, `narrowsListBy`, `refreshesEverySeconds`...; data fields: `valueType` incl. `date`/
`time`, `optional`, `min`/`max`, `initial` (`today`/`now` = clock-stamped); services: `endpoint`,
`responseFields`, `webPage`, `requestValueFrom` ...). A new fact the docs need = a new declared field +
an intake rule + one provider-prompt sentence (`buildBlueprintInstructions`, preset `providerNotes`).

Invariants: exactly five docs then `kit/` then `blueprint.json`; preview bytes equal export bytes;
one provider request + at most one repair; API keys memory-only, never logged/persisted/exported;
no silent drops; no placeholders/TODO; every preset has a real kit; **provider strict JSON mode needs
every schema property in `required`** (`src/schema.ts` forces this; `tests/schema.test.ts` guards it
— a violation makes the provider answer HTTP 400 and every generation fail, it happened once).

## 3. The problem we are solving

Packets passed the compiler's own checks (IDs align, `cascade verify`, kits build) while an agent
reading them would still stall or guess: tasks used screens a later task builds, the data store had no
interface, owners contradicted shared-file lists, boilerplate for other products leaked in, kits were
product-specific, labels/units/dates were ambiguous. **Mechanical checks were not enough; independent
read-throughs by fresh agents found the real defects.** So the loop below (generate fresh ideas ->
build every kit -> independent audits -> fix the compiler -> repeat) is the method.

### History (blocking findings per audit round; fresh ideas every round)

| Round | Packets | Blocking | Notes |
| --- | --- | --- | --- |
| 1 | 10 | 38 | first full audit |
| 2 | 10 | ~45 | new classes found after round-1 fixes |
| 3 | 10 | 26 | |
| 4 | 10 | 20 | one regression: provider rejected the schema (400) — fixed + guarded |
| 5 | 9 | 17 | |
| 6 | 10 | 19 | one real bug: package `com.class.schedule` (keyword) — fixed |
| 7 | 9 | 3 | six of nine packets had **zero** blocking |
| 8 | 10 | 16 | fixes for these are in flight (section 5) |

Honest reading: strict LLM auditors always find a few new idiosyncratic issues per packet; "every
audit of a brand-new idea set returns zero" is statistically unlikely. A reasonable stop rule: two
consecutive rounds where no finding is a *systematic compiler class* (same defect in several
packets/presets) and every kit builds. Judge by classes, not raw counts.

## 4. State of the repo (main at the time of writing)

- Branch `main`, head `00a0a49`, ~96 commits ahead of `origin/main` (**not pushed**; the last push was
  `4900297`). Remote `https://github.com/nodaysidle/nodaysidle-cascade-v4` (private). The pre-push hook
  blocks `main`; Alan said "push" only for earlier work. **Do not push until Alan says push.**
  When he does: `NDS_ALLOW_PUSH=1 git push origin main`.
- `npm run typecheck`, `npm test` (257 passed, 16 skipped build tests), kit builds: green.
- The **installed desktop app is outdated** (built before most compiler changes). Rebuild with
  `scripts/install-linux-app.sh` (it must use the Tauri CLI build; a plain `cargo build` ships a window
  that loads `localhost:1420` — see `.trail/learnings/`). Open via `omarchy menu summon apps.cascade-v4`;
  screenshot to verify (`grim`). The C4 bar widget works (`active:false` in `listPlugins` is normal).
- `src-tauri` Rust checks (`cargo fmt/clippy/test` in AGENTS.md) were **not re-run** after the many
  TypeScript-only changes; run them before release. CI (`.github/workflows/checks.yml`) never ran on GitHub.
- `npm run probe:live` (paid) was **not run** after the schema/prompt changes; live generation via the
  CLI worked for 70+ ideas, so the probe is a formality, but run it once (ask Alan).
- Learnings are force-added in `.trail/learnings/` (the global git config ignores `.trail/`; use
  `git add -f`).

## 5. In-flight work you must pick up first

Round 8 fixes were running in four isolated git worktrees when this was written (branches
`worktree-wf_402c080e-29f-1..4`, directories under `.claude/worktrees/`). Check `git branch --list
'worktree-wf_402c080e*'` and `git log main..<branch>`:

1. `-1` GTK: date-field form reset vs default, local-today conversion for a user date, list feature that
   itself owns the mark control, edit dialog Save label, pending-delete state, empty-state vs filter.
2. `-2` Waybar: response key paths per service field, label template + unit, `disk-read` source,
   rate sources keep the previous counter, round-half-away-from-zero decimals (Rust `{:.1}` rounds 1.25
   to 1.2), fixed unit vs units rule.
3. `-3` Tauri + shared prompt: read-only date-added display in edit forms; provider prompt rule "a
   feature must match a verb the idea states" (the model keeps inventing Edit features).
4. `-4` Android: Save-button/validation mode stated once, Material date picker for user dates, decimal
   places rule, acceptance naming a later task's control.

If a branch has no commits or the agent died, redo that area: the findings were in
`/tmp/claude-1000/audit8/*.json` (may be gone; otherwise regenerate by running the loop). Then run the
loop (section 6) with a fresh idea set and re-run the **same round-8 ideas** once to prove the fixes
hold (round-8 ideas: Gift Tracker, Reading Goals, Wind Check, Disk IO, Travel Journal, Workout Log,
Cycle Shop, Seed Library, Subscription Tracker, Vaccine Reminder).

Merge conflicts are common because `src/compiler.ts` has one enormous task-prompt template line that
every preset appends to. Use `scripts/agent-ready/split-merge.py` (see section 6).

## 6. The loop (copy this process)

Keys: `DEEPSEEK_API_KEY` and `TYPESAFE_API_KEY` exist in the **fish** environment (`fish -lc ...`), not in
bash. Never print or log them.

1. **Ideas.** Write ~10 NEW ideas (2 per preset), never reused. Style: 3-5 plain sentences, no stack names
   (see `scripts/live-presets.ts` and `scripts/agent-ready/run-round.fish`).
2. **Generate live:** `fish scripts/agent-ready/run-round.fish /tmp/v4-roundN` (edit the `g` lines).
   Expect `Gate Clean`. A `capability-rejected` after the repair is a preset limit (document it) or a
   compiler bug.
3. **Verify:** `npm run -s cascade -- verify --packet <dir>` for each packet.
4. **Build every kit with its own commands:** `bash scripts/agent-ready/build-round-kits.sh /tmp/v4-roundN`
   (prints only failures: GTK/Waybar fmt+clippy+test, Astro check/test/build/a11y/perf, Tauri
   typecheck/test/build/icon/cargo, Android `assembleDebug testDebugUnitTest`). Real kit bugs surface
   here (e.g. missing value-type mapping, keyword package names).
5. **Independent audits:** one fresh read-only agent per packet using `scripts/agent-ready/audit-brief.md`
   (fill preset/slug/idea; structured JSON output). Use the Workflow tool or parallel Agent calls.
   Collect blocking/polish per packet; group by **class**.
6. **Fix the compiler** (never an exported packet): one agent per preset in an isolated worktree using
   `scripts/agent-ready/fix-brief.md` plus the findings. Merge branches into `main`
   (`git merge --no-commit --no-ff <branch>`; on conflict `python3 scripts/agent-ready/split-merge.py
   <branch> <file>`; then typecheck, test, commit).
7. Add a test for every fix (`tests/*.test.ts`; fixtures in `tests/fixtures/`). When you add a schema
   field also update fixtures (they are typed as the zod output type) and keep `tests/schema.test.ts` green.
8. Repeat from 1. Re-run old ideas occasionally as regression.

## 7. Repo map

- `src/schema.ts` provider schema, prompt (`buildBlueprintInstructions`), intake rules, declared fields.
- `src/capabilities.ts` blueprint vs preset capability audit. `src/pipeline.ts` the flow + one repair.
- `src/compiler.ts` normalization, graph, owners, contracts, phases/tasks, the giant task-prompt line,
  slots (`mainSlotsSentence`), store interfaces. `src/renderers.ts` the five documents.
- `src/audit.ts` export gates incl. agent-readiness gates (shared-file lines, one settings name, desktop id,
  launch env var, unrequested delete, task order, dangling punctuation).
- `src/presets.ts` five preset contracts, options, `providerNotes`, wiring rules.
- Per-preset: `gtkContracts.ts`; `waybarContracts.ts`+`waybarKit.ts`; `tauriContracts.ts`+`tauriKit.ts`;
  `astroWeb.ts`+`astroKit.ts`; `androidPlan.ts`+`androidForms.ts`+`androidKit.ts`; shared `kits.ts`.
- `src/app.ts`, `state.ts`, `bridge.ts` UI; `src-tauri/` provider/Jev/export boundary (Rust).
- `tests/` unit + fixture tests; `tests/kit-build.test.ts` real kit builds (`CASCADE_KIT_BUILD=1`).
- `scripts/install-linux-app.sh` build + install + Omarchy menu/bar; `scripts/live-presets.ts`;
  `scripts/agent-ready/` the loop helpers; `omarchy/` bar plugin.

## 8. Known limits and open questions

- Waybar: a service that needs coordinates works only through named `{field}` placeholders backed by saved
  latitude/longitude settings; there is no geocoding step. Services needing an API key, or an invented
  query parameter, are provider mistakes the compiler can only warn about in the prompt.
- Provider-content defects the compiler cannot detect without prose regexes (forbidden): wrong numeric
  examples, invented extra features, UI placement words. The strategy is a provider prompt sentence +
  a deterministic intake rule where a declared field exists.
- `deb`/`pkgbuild` Tauri packaging options were removed (only AppImage is built).
- A product name that is a single Rust keyword (e.g. "Loop") would make an invalid crate name (not fixed).
- Kit helpers shipped per blueprint (SQLite, keyring, reqwest, tokio, units, clock...) are conditional;
  `tests/core.test.ts` asserts docs, Cargo and locked stack agree.

## 9. Gotchas learned the hard way

- Provider strict JSON: every property required (see above). Test it after any schema change.
- `/cd` into an agent worktree changes the shell cwd for everything; use absolute paths to the main repo.
- `npm` here refuses to run install scripts, so Astro's optional `sharp` is missing: the Astro kit
  configures the no-op image service. Do not "fix" that by adding sharp.
- Vitest does not typecheck: run `npm run typecheck` as well (a wrong field name once made a test vacuous).
- Fixtures are typed as the zod output type: adding a default field breaks every fixture literal (add it
  to the fixture helpers).
- Rust `format!("{:.1}", 1.25)` is "1.2"; the compiler convention is round half away from zero.
- Install the app only from a Tauri CLI build (`scripts/install-linux-app.sh`), then screenshot it.
- The pre-push hook blocks `main`; never push without Alan's explicit "push".
- `.claude/` is git-ignored; delete finished worktrees (`git worktree remove --force`) to save disk.

## 10. Prompt to paste into the next agent

Open Claude Code (Opus 5.5 or Fable 5.1) in this repo folder and paste:

```text
ALAN. You are taking over NODAYSIDLE Cascade V4 in this folder. Read HANDOFF.md fully, then AGENTS.md,
then run `git status`, `git log --oneline -8`, `git worktree list`, `npm run typecheck && npm test`.

Goal: every preset must produce AGENT-READY packets (five Markdown docs + kit + blueprint.json): a coding
agent reading only the packet can build exactly the user's idea with no guesswork and no contradictions,
and every kit builds with its own commands. Success is measured by independent audits of packets
generated from FRESH ideas, judged by systematic classes of defect, not raw counts.

Do, in order:
1. Finish section 5 of HANDOFF.md: inspect the four in-flight branches `worktree-wf_402c080e-29f-1..4`,
   merge what is committed (use scripts/agent-ready/split-merge.py on conflicts), redo any area whose
   branch is empty, keep typecheck/tests green, commit.
2. Run the loop in section 6 on a NEW set of ten ideas (two per preset), plus the round-8 ideas once as
   regression. Use parallel read-only audit agents (scripts/agent-ready/audit-brief.md) and one fix agent
   per preset in isolated worktrees (scripts/agent-ready/fix-brief.md). Fix the compiler, never an
   exported packet. Add a test for every fix.
3. Stop when two consecutive rounds show no systematic defect class and all kits build; then rebuild and
   install the desktop app (`scripts/install-linux-app.sh`), screenshot it, run the src-tauri cargo checks
   from AGENTS.md, and report to me with the numbers per round and any remaining limits.

Rules: never push (I will say "push"); never edit an exported packet to hide a compiler defect; never
print API keys; keep the invariants in HANDOFF.md section 2; do not ask me to test an app that still has
known blocking gaps; tell me plainly what is not verified.
```
