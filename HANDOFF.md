# HANDOFF — NODAYSIDLE Cascade V4 (rewritten 2026-11-09, after a full code audit)

Read this file first, then `AGENTS.md`. It tells you what the app is, what is broken, the order to fix
it in, and how to prove the result. Written for Claude Opus 5.5 taking over with no other context.

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

A coding agent is then opened in that folder, reads `AGENTS.md` first, follows `TASKS.md` task by task,
copies `kit/` instead of inventing plumbing, and builds the product. **The product of this repo is the
quality of those documents: "agent-ready".** `PROMPT.md` is the paste-in prompt for the *builder* agent
(a product file, keep it).

Five presets (`src/presets.ts`): `linux-wayland-gtk4-desktop`, `linux-hyprland-waybar-module`,
`tauri2-rust-typescript-desktop`, `astro-web`, `android-kotlin-compose`. No macOS preset exists.

## 2. How it works

```text
idea + preset
  -> local intake checks (src/schema.ts, src/capabilities.ts)        no money spent if invalid
  -> TypeSafe Jev preflight (src/jev.ts, src-tauri/src/jev.rs)
  -> ONE DeepSeek request, strict JSON schema (src/pipeline.ts, src/provider.ts)
     -> blueprint (declared product meaning only; no IDs, files, commands)
  -> intake audit + capability audit of the blueprint
     -> on failure: exactly ONE repair request
  -> Jev integrity -> normalize (src/compiler.ts normalizeBlueprint) -> project graph
     (owners, contracts, phases, tasks, IDs) -> render five docs (src/renderers.ts)
     + kit (src/kits.ts, tauriKit.ts, astroKit.ts, androidKit.ts, waybarKit.ts)
  -> auditPacket (src/audit.ts) gates export; preview bytes == export bytes
  -> atomic export (CLI: src/packet.ts; desktop app: src-tauri/src/export.rs) with blueprint.json
```

Core philosophy (do not break): everything after the provider answer is **deterministic local code**.
The compiler never guesses from feature prose with regexes. It uses **declared fields** the provider
fills in `src/schema.ts`. A new fact the docs need = a new declared field + an intake rule + one
provider-prompt sentence (`buildBlueprintInstructions`, preset `providerNotes`).

Invariants: exactly five docs then `kit/` then `blueprint.json`; preview bytes equal export bytes;
one provider request + at most one repair; API keys memory-only, never logged/persisted/exported;
no silent drops; no placeholders/TODO; every preset has a real kit; **provider strict JSON mode needs
every schema property in `required`** (`tests/schema.test.ts` guards it — a violation makes the
provider answer HTTP 400 and every generation fail).

## 3. Goal and definition of done

Alan wants, at the end: **a working installed desktop app whose exported packets are agent-ready for
all five presets.** Done means all of these hold:

1. Every finding in section 5 marked MUST is fixed with a test, or reported to Alan with the reason.
2. `npm run typecheck`, `npm test`, `npm run kit:check`, and in `src-tauri`: `cargo fmt --check`,
   `cargo clippy --all-targets -- -D warnings`, `cargo test` are all green.
3. The loop in section 6 has run on fresh ideas and two consecutive rounds show no *systematic* defect
   class (same defect in several packets/presets), and every kit builds with its own commands.
4. The desktop app is rebuilt and installed with `scripts/install-linux-app.sh`, screenshotted, and has
   **exported one packet per preset from the app itself** (not the CLI), including one Android packet
   and one Astro packet with an item page. `npm run -s cascade -- verify --packet <dir>` passes on each.
5. A final report to Alan: numbers per round, what was fixed, what is not verified, remaining limits.

## 4. State of the repo

### RESUME HERE — live round 10 in progress (updated 2026-11-10)

**Where we stopped:** Alan is running round 10 live *from the installed app*, one prompt per preset,
and pastes each export folder path. The agent audits each one. 1 of 5 is done.

| # | Preset | Idea | Export path | Status |
|---|--------|------|-------------|--------|
| 1 | linux-wayland-gtk4-desktop | Recipe Box | `/home/arch/dev/nodaysidle/recipe-box` | **done: clean** (verify ok, kit fmt/clippy/test ok, audit 0 blocking / 10 polish) |
| 2 | linux-hyprland-waybar-module | Memory Watch | `/home/arch/dev/nodaysidle/memory-watch` | **done: agent-ready** (2nd try after c1737ef; verify ok, kit fmt/clippy/test ok, memory source, audit 0 blocking / 9 polish: 0-decimal label example "12.0 stays 12.0", % unit vs format_in_unit, GB fixed unit missing on notification contract, "(bytes for a size)" boilerplate, tooltip rule in wrong task, TASK-06 return shape, kit refresh test hits real XDG data dir, ARD "reset behavior" + CON-RUNTIME-WIRING HTTP boilerplate) |
| 3 | tauri2-rust-typescript-desktop | Contact Book | `/home/arch/dev/nodaysidle/contact-book` | **done: NOT agent-ready** (verify ok, kit 7/7 ok; audit 2 blocking, both confirmed by lead: (a) export button has no host: TASK-04 "Expose exactly these named slots ... no others" has no actions host, TASK-08 says "no named slot ... sit in the main content area" + slots.mount, and kit `host(name)` silently makes a detached div; (b) slots.run returns `unknown`, so the add/edit validation message has no stated path to TASK-04's form message slot. Confirmed compiler bug (polish): `cleanMeaning` genericIdentity (src/compiler.ts:381/399) rewrites fixture `ada@example.com` to "ada@the application identity". 8 more polish: tie-break asc vs desc id, search rule only under TASK-09, CSV line ending, time/TZ + cancellation/start-stop/delete boilerplate, get_contacts/existing_file unused, ACC-INTEGRATION-01 owned by packaging, contract_tests.rs content) |
| 4 | astro-web | Trail Guide (one page per trail) | `/home/arch/dev/nodaysidle/trail-guide` | **done: NOT agent-ready** (verify ok, kit 6/6 ok; audit 2 blocking, both confirmed by lead: (a) closed value set has no field type: blueprint field `difficulty` is `valueType: text`, so kit content.config.ts emits `z.string()` and the frozen seed says `difficulty: Sample text`, while PRD says "limited to easy, moderate, and hard" and ACC-TRAIL-DETAIL-PAGE-02 needs one of them; schema gap, likely all presets; (b) Design System drift (known class): PRD/TRD "1.5 line-height", "--space-1 through --space-8", display face vs kit global.css `16px/1.65`, no spacing tokens, and TASK-01 freezes global.css. 6 polish: km decimals unstated, name sort comparator, sitemap needs SITE_URL never given, Application ID boilerplate on a static site, Signing vs Installation deploy contradiction, `/teas/` example route from another product + cancellation/credential boilerplate) |
| 5 | android-kotlin-compose | Water Log | (Alan will paste) | 1st try failed at generate (capability.waybar-label: message only named thresholds/labelTemplate, likely `unit: glasses` survived the repair); fixed in the commit after 101993c, app reinstalled; retry |

The five prompts (exact text) are the first idea per preset in `scripts/agent-ready/run-round.fish`
(Recipe Box, Memory Watch, Contact Book, Trail Guide, Water Log).

**Per packet, do exactly this** (never edit the exported folder; work on a copy):
1. `npm run -s cascade -- verify --packet <path>` → expect `Verified`.
2. `cp -r <path> /tmp/v4-round10/<preset-id>/` then `bash scripts/agent-ready/build-round-kits.sh /tmp/v4-round10`
   (prints `-> 0` per command; anything else is a failure).
3. One fresh read-only audit agent per packet (general-purpose, background) with the brief in
   `scripts/agent-ready/audit-brief.md` (fill preset, slug, the idea text verbatim). JSON answer:
   `{slug, blocking[], polish[], verdict}`.
4. Tell Alan plainly: agent-ready or not, blocking items, top polish.

**Watch in this round (provider-side fixes never tested live yet):** Android acceptance must not say
"Save is disabled" (prompt note aeb985f); Waybar Memory Watch must use the `memory` system source
(sources fixed in 546ea57).

**After all 5:** group findings by class across packets. Fix each systematic class once in the compiler
(test that fails without the fix, typecheck, `npm test`, `npm run kit:check` if a kit changed, commit),
rebuild the app (`scripts/install-linux-app.sh`), then a round 11 with new ideas. Stop rule: two
consecutive rounds with no systematic compiler class and every kit building.

**Polish classes already seen 3+ times (GTK, fix in a batch after round 10):**
- `show_toast` called "display-free" (it needs GTK); kit `AppState` derives serde/Eq so it can't hold
  the overlay — name a separate non-serde view-state struct.
- f64 parsing sentence emitted for whole-number (i64) fields.
- filter prompt says "its text" instead of the narrowing field name.
- Time rule / Clock boilerplate in tasks that stamp no date-time (e.g. edit).
- CON-PLATFORM-FILES "paths outside the boundary are rejected" when no feature takes a user path.
- New (recipe-box): kit `PKGBUILD` builds in `$startdir`, so `makepkg -c/-C` would clean `src/` (the
  Rust source) — fix in the compiler. Kit `Clock` trait lacks `Send + Sync`.
- Other presets: boilerplate for operations a packet lacks (edit/delete/Worker clauses on Android,
  cancellation tokens on Tauri), Astro Design System tokens vs kit `global.css`.

### Done in session 2 (2026-11-09/10)

- **Section 5 is done**: F8, F1, F2, F3, F6, F4, F7, F11, F15, F5, F10 (+ SQL table names), F9, F12,
  F13, F16, F14 committed on `main` (19f11cf … 0727dcb).
- After section 5: e4b98a5 (kit/ stays in the project root → Astro/Tauri `npm test` exclude `kit/**`,
  Astro tsconfig excludes kit; kit-build test mirrors the packet layout, proven failing without the
  fix), 71534c2 (Tauri desktop Categories=Utility).
- State at 461a362: typecheck green, `npm test` 408 passed / 19 skipped, `npm run check` green,
  `npm run kit:check` 18/18. **Nothing pushed.**
- Round 9 (free regression: round-8 blueprints recompiled into `/tmp/v4-round9`, 9 packets): 6 blocking
  in 3 classes, all kits built. Details in section 6 history.
- App rebuilt and installed at 71534c2; opens from Omarchy menu → Apps → Cascade V4
  (`apps.cascade-v4` in `~/.config/omarchy/extensions/omarchy-menu.jsonc`); screenshot checked.
- Not verified: F2 scripts (manual check only); app.ts stale-intake fix (no DOM test); CI desktop job
  never ran on GitHub; `render.deterministic` has no firing test; generate→export inside the new app
  build is only proven by Alan's live exports.
- `scripts/agent-ready/snapshot-fixtures.ts` hashes every fixture × preset output (proves a refactor
  changed no bytes).

- Branch `main`, head `b55d01f` when this was written, many commits ahead of `origin/main`
  (**not pushed**). Remote `https://github.com/nodaysidle/nodaysidle-cascade-v4` (private). The
  pre-push hook blocks `main`. **Do not push until Alan says "push".** Then:
  `NDS_ALLOW_PUSH=1 git push origin main`.
- Verified green on 2026-11-09 at `b55d01f`: `npm run typecheck`; `npm test` (273 passed, 17 skipped);
  `src-tauri` `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` (4 tests).
- **Not run in the audit:** `npm run kit:check`, `npm run probe:live` (paid), `cargo audit` (not
  installed). CI (`.github/workflows/checks.yml`) has never run on GitHub.
- The **installed desktop app is outdated** (built before most compiler changes).
- Round-8 compiler fixes (GTK, Waybar, Tauri + shared prompt, Android) are merged but **no audit round
  has re-checked them**. Round-8 ideas: Gift Tracker, Reading Goals, Wind Check, Disk IO, Travel
  Journal, Workout Log, Cycle Shop, Seed Library, Subscription Tracker, Vaccine Reminder.
- Learnings live in `.trail/learnings/` (the global git config ignores `.trail/`; use `git add -f`).
- This file was rewritten and is uncommitted; commit it with your first change.

## 5. Audit findings to fix (2026-11-09)

A full read-only audit found the problems below. Each was confirmed by reading the code unless marked
"unconfirmed". Line numbers are from `b55d01f`; if the code moved, find the symbol by name.

Work in this order. **Do F8 first**: it is the safety net that proves later changes did not alter
output by accident. Commit after each finding (message style: `fix(scope): what changed`), with a test.
Before fixing a bug in a shared function, grep its callers.

### Step 1 — safety net

**F8 (MUST). Make determinism and `verify` cover the kit, for every preset.**
- `src/packet.ts:46-51` `verifyPacketFolder` compares documents against both the manifest and the
  recompiled packet, but kit files only against the manifest's own hashes. A kit that the current
  compiler would render differently still says "Verified".
- `src/compiler.ts:2240-2245`: the runtime `render.deterministic` gate re-renders only the five documents.
- `tests/core.test.ts:35-41`: the byte-identical test runs one GTK fixture, documents only.
- Fix: in `verifyPacketFolder` also require each manifest kit hash to equal the recompiled packet's kit
  hash for the same path. Add a test that loops over all `fixtureCases`
  (`tests/fixtures/blueprints.ts:386`), compiles twice, and compares all documents and all kit files.
  Add a test that the export file list equals `packetForExport(packet)` byte for byte.
- Also: `src/cli.ts:95` casts `blueprint.json` unchecked; validate the preset id with `isPresetId` and
  fail with a clear message on a malformed manifest.

### Step 2 — blockers for a working app

**F1 (MUST). The desktop app cannot export Android packets or Astro packets with an item page.**
- `src-tauri/src/export.rs:96-108` `valid_kit_path` allows at most `MAX_KIT_PATH_DEPTH = 8` segments
  (`:17`) and only ASCII letters, digits and `._-+`.
- Android kit paths have 9+ segments (`kit/app/src/main/java/com/steady/day/data/SettingsRepository.kt`).
  Astro emits `src/pages/<collection>/[slug].astro` (`src/astroKit.ts:254`).
- Proven by running the same rule over all 13 fixture packets: both Android fixtures and two of three
  Astro fixtures are rejected. The CLI (`src/packet.ts`) has no such rule, so only the app fails.
- Fix: raise the depth limit (16 is safe; bundle ids can add segments) and allow `[` and `]`. Keep
  empty segments, `..`, and leading-dot segments blocked.
- Tests: `export.rs` has **no** `#[cfg(test)]` block. Add Rust tests for `validate_export_files` and
  `valid_kit_path` (accepts the paths above; rejects traversal, dotfiles, bad hash, too many files) and
  for `write_packet_atomic` (existing destination is refused; `tempfile` is already a dev-dependency).
  Add a TypeScript test that every fixture's kit paths satisfy the same limits, so the two sides
  cannot drift again.

**F2 (MUST). The loop helper scripts can run builds in `$HOME` and delete the wrong folder.**
- `scripts/agent-ready/build-round-kits.sh:2` sets `TMPDIR=$HOME/.cache/cascade-v4/tmp` but never
  creates it (it does not exist on this machine today). `mktemp -d` then fails, `w` is empty, `cd $w`
  goes to `$HOME`, and `npm install`, cargo and gradle run there. No `set -e`, nothing quoted.
- `scripts/agent-ready/run-round.fish:5-6` runs `rm -rf $out` on an unchecked argument.
- Fix: `mkdir -p` both cache folders at the top; stop if `mktemp` or `cd` fails; quote variables. In the
  fish script, refuse to run without an argument and refuse a path that is not under `/tmp`.
- **Fix this before running the loop in section 6.**

**F3 (MUST). Product names are written unescaped into generated kit files.**
- Rust string literals: `src/kits.ts:147,154,1255`. Kotlin: `src/androidKit.ts:295` (`$` starts a
  template). XML: `src/kits.ts:543` (AppStream `<name>`; the summary on the next line *is* escaped),
  `src/androidKit.ts:202`. Shell: `src/tauriKit.ts:807,867`. PKGBUILD: `src/kits.ts:584,2040`.
  systemd `Description=`: `src/kits.ts:569,2025` (`%` is a specifier). TS template: `src/tauriKit.ts:315,317`.
- The schema allows any text up to 80 characters for `productName` (`src/schema.ts:173`), so names like
  `Tom & Jerry Notes`, `Ca$hFlow`, `Say "Hi"` or `100% Focus` produce kits that do not build.
- Also: `slug()` (`src/compiler.ts:330-334`) keeps a leading digit and `crateName` (`src/kits.ts:18-20`)
  uses it as is, so `24h Tracker` gives an invalid crate name and `use 24h_tracker::...`. A product
  named with one Rust keyword (e.g. "Loop") has the same problem (old known limit). `bundleSegment`
  (`src/compiler.ts:785-789`) already shows the prefix pattern to copy.
- Fix: one small escaping helper per target language (Rust/TS literal, Kotlin literal, XML, single-quoted
  shell, systemd value), used at every site; grep `identity.projectName` and `appName` in the kit files
  to find them all. One crate-identifier helper that prefixes a digit-leading or keyword name.
- Tests: compile each preset's kit for a product name containing `"`, `\`, `$`, `&`, `'`, `%` and for a
  digit-leading name, and assert the emitted lines are escaped. Then run `npm run kit:check`; a kit
  change needs a real build (AGENTS.md).

**F6 (MUST). GTK data contract prints `undefined` for `time` fields.**
- `src/gtkContracts.ts:88-98` `SQL_TYPES` is typed `Record<string, ...>` and has no `time` entry;
  `:106` spreads `SQL_TYPES[field.valueType]!`. The TRD then says `start undefined NOT NULL`.
- Fix: type the map by the schema's value-type union so the compiler enforces completeness (as
  `src/tauriContracts.ts:44,57` does) and add `time` (`String` / `TEXT`, note `HH:MM`). Check that the
  GTK kit helpers also handle `time`. Test with a GTK fixture that has a `time` field.

### Step 3 — correctness of the compiler core

**F4 (MUST). Normalization silently drops provider content ("no silent drops" is an invariant).**
- `src/compiler.ts:414-422` `uniqueByName` keeps the first entry per `semanticKey` (letters and digits
  only, `:355-359`) and says nothing. It is applied to features (`:566`), data objects (`:618`) and
  services (`:633`).
- The intake duplicate check (`src/schema.ts:515-529`) uses `referenceKey` (`:431-433`), which keeps
  punctuation. So "To-do list" and "To do list" pass intake and one is dropped later.
- `src/compiler.ts:628,632,644,648` also filter out fields, data objects and services whose text
  becomes empty after `cleanMeaning`.
- Fix: make the intake duplicate rule use the same key as normalization (so it is repairable), and turn
  each silent drop into a `NormalizationError` naming the path.

**F7 (MUST). A paid repair request is sent for failures the provider cannot fix.**
- `src/pipeline.ts:414-418`: any exception from `normalizeBlueprint` that is not a `NormalizationError`
  (a compiler bug) becomes `local-normalization-failed`, which is in `REPAIRABLE_STATUSES` (`:344`).
  Return `local-compiler-failure` for unexpected exceptions instead.
- `src/pipeline.ts:276-287` does not reject an empty idea; `src/cli.ts:48-49` accepts an idea file
  containing only a newline. Return `input-invalid` when `splitIdeaSentences(idea).length === 0`.
- `src/pipeline.ts:324-326`: a cancel after the repair response returns without `withRepair`.
- `src/pipeline.ts:104` comment says the returned blueprint is "before Jev healing"; `:398` and `:450`
  return the healed one. Fix the comment or the code after checking F13.
- Tests (`tests/pipeline.test.ts` has only 6 cases): provider throws → 1 call, `provider-failure`;
  invalid twice → exactly 2 calls; compiler exception → no repair; empty idea → 0 calls; abort →
  `cancelled`; a key-shaped string in the previous response is redacted in `buildRepairInput`; a table
  of good and bad URLs for `isSafeProviderUrl`.

**F11 (MUST). zod 4.5.4 has a high advisory** (GHSA-mrhx-c7xc-m3w5, memory exhaustion on oversized
collections). Pin `zod` to 4.6.7 or later, then run typecheck and `tests/schema.test.ts`.
`npm install` is allowed for this; check `npm audit --omit=dev` is clean after.

**F15 (SHOULD). Sorting depends on the system locale.** Ten `localeCompare` calls with no locale in
`src/compiler.ts` (`:837,871,876,889,894,895,1729,1735,1757,1759`) decide task order and which wording
of a shared criterion is rendered. Replace with a plain code-unit comparator. F8's tests must stay green
(output must not change for the fixtures).

### Step 4 — changes that alter output (F8 must be in place)

**F5 (MUST). `cleanMeaning` rewrites ordinary product prose.** `src/compiler.ts:377-379`:
- `command` has no word boundary and is case-insensitive: "Swift delivery", "yarn stash" and "Cargo
  manifest" become "the local validation command".
- `providerId` with `/i` deletes "task-list", "own-brand", "con-artist"; a feature named "Task-list"
  cleans to empty and fails normalization, which the provider cannot repair.
- `sourcePath` matches a bare ` / `: "Toggle on / off" becomes "Toggle on the local implementation".
- Fix: make `providerId` case-sensitive (uppercase prefixes only); anchor `command` with `\b` and
  require a real subcommand shape; require an actual path segment in `sourcePath`. Add tests with the
  phrases above and with one real command, path and ID that must still be scrubbed.

**F10 (SHOULD). Field and data-object names become invalid or colliding identifiers.**
- No intake rule checks field names for duplicates. A declared field `ID` duplicates the built-in `id`
  column. `Order` / `Group` become unquoted SQL keywords; `Type` becomes a Rust keyword field;
  `2nd phone` becomes `2ndPhone` in Astro (`src/astroWeb.ts:55-59`); "Blog posts" and "Blog-posts" map
  to one Astro collection (`:66-74`).
- Five separate snake_case helpers disagree: `src/gtkContracts.ts:105,184` strip accents;
  `src/tauriContracts.ts:58` and `src/kits.ts:694` do not; `src/waybarContracts.ts:282` has no fallback.
  "Café" gives `cafe` in one place and `caf` in another, so documents can contradict the kit.
- A Waybar settings field named "Refresh seconds" collides with the built-in key (`src/kits.ts:1272`).
- Fix: one shared identifier helper; an intake rule (repairable) that field names are unique after that
  mapping and not `id`; prefix digit-leading names and suffix reserved words per language.

### Step 5 — tests and tooling

**F9 (MUST). CI and scripts do not check everything.**
- `.github/workflows/checks.yml` never builds or tests `src-tauri`. Add a job: Linux webkit deps,
  `npm ci && npm run build`, then `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
  `cargo test` in `src-tauri`.
- `package.json` `kit:check` runs only `tests/kit-build.test.ts`; `tests/gtk-kit-build.test.ts` and
  `tests/tauri-focus-build.test.ts` are gated on the same env flag and never run. Include them.
- Add one `check` script that runs typecheck, tests and the three cargo commands. Add the cargo commands
  to the Checks section of `AGENTS.md` (the old handoff said they were there; they are not).
- `AGENTS.md:4-5` says "the desktop shell is a later milestone"; the app exists. Fix the sentence.

**F12 (SHOULD). Export gates are not shown to fire.** `src/audit.ts` defines 32 rule ids; tests make
only 6 fire. Add one table-driven test: per rule, a minimal bad input and the expected rule id.
`src/compiler.ts:2194-2201` throws on the first graph failure, so the audits at `:2232-2234` can never
fail; remove the dead second pass or route content rules to `failures` (repairable `lint-failure`).
`src/audit.ts:376` computes `text` and never uses it.

**F13 (SHOULD, unconfirmed). Jev healing may break `verify`.** `src/jev.ts:604-618` appends inferred
platform needs after the intake audit ran (`src/pipeline.ts:365` vs `:398`). `verify` re-runs the
intake audit on the exported blueprint (`src/cli.ts:97-101`) and may reject it
(`semantic.unused-platform-need`, `semantic.clipboard-undeclared`). First write a test that reproduces
it; fix only if it fails. No test imports `src/jev.ts` (768 lines; the fake in
`tests/fixtures/providers.ts:9-31` always passes): add threshold tests for each `evaluateJev*`
function and for `parseJevResponse` on malformed input.

**F16 (SHOULD, small).**
- `src-tauri/src/provider.rs:23` derives `Debug` on the struct holding the DeepSeek key; remove it
  (`JevCommandRequest` in `jev.rs` already has none).
- `src-tauri/src/export.rs:171-174`: on Linux the final rename is a plain `fs::rename`, not exclusive.
- `src/app.ts:475-521`: an intake result for an older idea text can still be shown and applied; discard
  the result if the idea changed.
- Dead macOS code: `nativeUsageDescriptions` (`src/kits.ts:2128-2130`) always returns `[]`; remove it
  and the unreachable Info.plist code in `src/tauriKit.ts`. Remove unused imports in `src/cli.ts:1,4,9`.

**F14 (OPTIONAL, last). Split the 4,936-character line.** `src/compiler.ts:1921` holds 8 preset
branches in one template literal, so parallel fix branches always conflict
(`scripts/agent-ready/split-merge.py` exists only for this). Turn it into an array of sentence
functions joined at the end. Output must stay byte-identical: F8's tests are the proof. Do this only
when no fix branches are open.

### Considered and rejected (do not redo)

- Key copies not all wiped from memory: the promise is "never persisted or logged"; it holds.
- Custom API host for the key: user-chosen, HTTPS forced, redirects off. By design.
- Export parent folder not tied to the folder picker: not reachable with the current CSP.
- Performance of the compile path: blueprints are tiny.
- Rewriting the `toContain` assertions wholesale; moving all 80 preset branches out of `compiler.ts`.

## 6. The agent-ready loop (run after section 5, steps 1-4)

Keys: `DEEPSEEK_API_KEY` and `TYPESAFE_API_KEY` exist in the **fish** environment (`fish -lc ...`), not
in bash. Never print or log them. Live generation costs money: tell Alan before the first round.

1. **Ideas.** Write ~10 NEW ideas (2 per preset), never reused. Style: 3-5 plain sentences, no stack
   names (see `scripts/live-presets.ts` and `scripts/agent-ready/run-round.fish`). Run the round-8
   ideas (section 4) once as regression.
2. **Generate live:** `fish scripts/agent-ready/run-round.fish /tmp/v4-roundN` (edit the `g` lines).
   Expect `Gate Clean`. A `capability-rejected` after the repair is a preset limit (document it) or a
   compiler bug.
3. **Verify:** `npm run -s cascade -- verify --packet <dir>` for each packet.
4. **Build every kit with its own commands:** `bash scripts/agent-ready/build-round-kits.sh /tmp/v4-roundN`
   (prints only failures). Fix F2 first.
5. **Independent audits:** one fresh read-only agent per packet using `scripts/agent-ready/audit-brief.md`
   (fill preset/slug/idea; structured JSON output). Collect blocking/polish per packet; group by **class**.
6. **Fix the compiler** (never an exported packet): one agent per preset in an isolated worktree using
   `scripts/agent-ready/fix-brief.md` plus the findings. Merge into `main`
   (`git merge --no-commit --no-ff <branch>`; on conflict
   `python3 scripts/agent-ready/split-merge.py <branch> <file>`; then typecheck, test, commit).
7. Add a test for every fix. When you add a schema field also update fixtures (they are typed as the
   zod output type) and keep `tests/schema.test.ts` green.
8. Repeat from 1.

Stop rule: two consecutive rounds where no finding is a systematic compiler class and every kit builds.
Strict LLM auditors always find a few one-off issues per packet; judge by classes, not raw counts.

History of blocking findings per round (fresh ideas each time): 38, ~45, 26, 20, 17, 19, 3, 16.
Round 9 (recompiled round-8 blueprints, 9 packets): 6 blocking in 3 classes. Android "Save is disabled"
in provider acceptance vs the TRD always-enabled rule (2, blueprints predate the aeb985f prompt note);
Waybar Disk IO picked `disk-space` for a read speed (3, blueprint predates the 546ea57 `disk-read`
source); kit/ inside the project root made Astro `npm test` run kit/tests (1, fixed in e4b98a5).
Recurring polish: boilerplate for operations a packet lacks (time rule, path rejection, edit/delete
clauses), `Categories=Development;` in the Tauri desktop entry, Astro design tokens vs kit global.css.
Round 10 ideas are in run-round.fish (not yet run: paid).

Known unfixed items from round 8: Waybar `src/main.rs` listed in label/click task modify lists; a GTK
list feature that itself declares `edit` while an add feature builds on it gives an "Owner dependency
cycle" graph error; PRD wording the provider writes (two buttons called "Add") is not compiler-fixable.

## 7. Finish: the installed app

1. `scripts/install-linux-app.sh` (it must use the Tauri CLI build; a plain `cargo build` ships a
   window that loads `localhost:1420`).
2. Open via `omarchy menu summon apps.cascade-v4`; screenshot with `grim` and look at it.
3. In the app, generate and export one packet per preset, including Android and an Astro idea with one
   page per item (this is the real check of F1). Run `verify` on each exported folder.
4. Do not ask Alan to test an app that still has known blocking gaps.

## 8. Repo map

- `src/schema.ts` provider schema, prompt (`buildBlueprintInstructions`), intake rules, declared fields.
- `src/capabilities.ts` blueprint vs preset capability audit. `src/pipeline.ts` the flow + one repair.
- `src/compiler.ts` normalization, graph, owners, contracts, phases/tasks, the giant task-prompt line.
  `src/renderers.ts` the five documents. `src/audit.ts` export gates.
- `src/presets.ts` five preset contracts, options, `providerNotes`, wiring rules.
- Per preset: `gtkContracts.ts`; `waybarContracts.ts`+`waybarKit.ts`; `tauriContracts.ts`+`tauriKit.ts`;
  `astroWeb.ts`+`astroKit.ts`; `androidPlan.ts`+`androidForms.ts`+`androidKit.ts`; shared `kits.ts`.
- `src/cli.ts`, `src/packet.ts` CLI and its export/verify. `src/app.ts`, `state.ts`, `bridge.ts` UI.
- `src-tauri/src/` `lib.rs` (commands, HTTP client), `provider.rs`, `jev.rs`, `export.rs` (Rust).
- `tests/` unit + fixture tests; `tests/kit-build.test.ts` real kit builds (`CASCADE_KIT_BUILD=1`).
- `scripts/install-linux-app.sh`; `scripts/live-presets.ts`; `scripts/agent-ready/` loop helpers;
  `omarchy/` bar plugin.

## 9. Known limits (not bugs to fix now)

- Waybar: a service that needs coordinates works only through named `{field}` placeholders backed by
  saved latitude/longitude settings; no geocoding. Services needing an API key are provider mistakes.
- Provider-content defects the compiler cannot detect without prose regexes (forbidden): wrong numeric
  examples, invented extra features, UI placement words. Strategy: a prompt sentence + a deterministic
  intake rule where a declared field exists.
- `deb`/`pkgbuild` Tauri packaging options were removed (only AppImage is built).

## 10. Gotchas learned the hard way

- Provider strict JSON: every property required. Test it after any schema change.
- Vitest does not typecheck: always run `npm run typecheck` too (a wrong field name once made a test vacuous).
- Fixtures are typed as the zod output type: adding a field breaks every fixture literal (add it to the
  fixture helpers).
- `npm` here refuses install scripts, so Astro's optional `sharp` is missing: the Astro kit configures
  the no-op image service. Do not "fix" that by adding sharp.
- Rust `format!("{:.1}", 1.25)` is "1.2"; the compiler convention is round half away from zero.
- `/cd` into an agent worktree changes the shell cwd for everything; use absolute paths to the main repo.
- `.claude/` is git-ignored; delete finished worktrees (`git worktree remove --force`).
- A kit change needs a real build (`npm run kit:check`), not only unit tests.

## 11. Rules

- Never push (Alan says "push"). Never print API keys. Never edit an exported packet to hide a compiler
  defect. Keep the invariants in section 2.
- Never parse feature prose with new regexes; use declared fields.
- Tell Alan plainly what is not verified. Ask before spending on live generation the first time.
- If the session gets long, update this file (what is done, what is left) before continuing.

## 12. Prompt to paste into the next agent

Open Claude Code (Opus 5.5) in this repo folder and paste:

```text
ALAN. You are taking over NODAYSIDLE Cascade V4 in this folder. Read HANDOFF.md fully, then AGENTS.md,
then run `git status`, `git log --oneline -8`, `npm run typecheck && npm test`, and in src-tauri
`cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`. All must be green
before you change anything.

Goal: a working installed desktop app whose exported packets (five Markdown docs + kit +
blueprint.json) are agent-ready for all five presets: a coding agent reading only the packet can build
exactly the user's idea with no guesswork and no contradictions, and every kit builds with its own
commands. The definition of done is section 3 of HANDOFF.md.

Do, in order:
1. Fix the audit findings in HANDOFF.md section 5, in the order given there. Start with F8 (the
   safety net), then F1, F2, F3, F6, then F4, F7, F11, F15, then F5, F10, then F9, F12, F13, F16.
   F14 is optional and last. For each finding: confirm it in the code first, grep the callers of
   anything shared you touch, make the smallest fix, add a test that fails without the fix, run
   typecheck and the tests, commit. If a finding turns out to be wrong, say so and move on.
2. Run `npm run kit:check` after the kit changes (F3, F6, F10). A kit change needs a real build.
3. Run the loop in HANDOFF.md section 6: the round-8 ideas once as regression, then new idea sets
   (two per preset), with parallel read-only audit agents and one fix agent per preset in isolated
   worktrees. Tell me before the first paid generation. Stop when two consecutive rounds show no
   systematic defect class and all kits build.
4. Finish with HANDOFF.md section 7: rebuild and install the app, screenshot it, export one packet
   per preset from the app itself (including Android and an Astro item-page idea), and verify each.
5. Report to me: what you fixed, the numbers per round, what is not verified, and remaining limits.

Rules: never push (I will say "push"); never edit an exported packet to hide a compiler defect; never
print API keys; keep the invariants in HANDOFF.md section 2; no new prose regexes in the compiler; do
not ask me to test an app that still has known blocking gaps; update HANDOFF.md when the session gets
long; tell me plainly what is not verified.
```
