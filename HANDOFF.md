# HANDOFF — NODAYSIDLE Cascade V4 (rewritten 2026-11-10, after the round-12 repair session)

Read this file first, then `AGENTS.md`. A fresh session can resume from this file alone.
Workspace rules: `/home/arch/dev/nodaysidle/CLAUDE.md` (start every reply with `ALAN`; this repo's
`AGENTS.md` wins over the root one). The owner is Alan (git user `nodaysidle`).

The earlier handoff (rounds 8 to 11, the F1 to F16 code audit, per-round tables) is in git:
`git show 2c8fe5e:HANDOFF.md`. Everything in it marked "to do" is done unless it is repeated below.

## 1. What the app is

Cascade V4 is a local-first **compiler** and Tauri 2 desktop app (Arch Linux / Omarchy, Wayland).
Input: one software idea (plain text) + one locked tech-stack preset + optional preset options.
Output: a folder with five Markdown contracts, a starter kit, and a manifest:

```text
PRD.md  ARD.md  TRD.md  TASKS.md  AGENTS.md   (the five documents)
kit/                                          (real, tested starter code the agent copies)
blueprint.json                                (validated provider blueprint + preset + options + hashes)
```

A coding agent opens that folder, reads `AGENTS.md`, follows `TASKS.md` task by task, and builds the
product. **The product of this repo is the quality of those documents: "agent-ready"** means a coding
agent can build exactly the user's idea from the packet alone, with no guesswork and no contradictions,
and the kit builds with its own commands.

Five presets (`src/presets.ts`): `linux-wayland-gtk4-desktop`, `linux-hyprland-waybar-module`,
`tauri2-rust-typescript-desktop`, `astro-web`, `android-kotlin-compose`.

## 2. How it works

```text
idea + preset
  -> local input checks                                              no money spent if invalid
  -> TypeSafe Jev preflight (src/jev.ts)                             viability score, preset check
  -> ONE DeepSeek request, strict JSON schema (src/pipeline.ts)      schema per preset: providerSchemaFor
  -> settleBlueprint (src/compiler.ts)                               the two deterministic settlements
  -> intake audit (src/schema.ts) + Jev integrity + capability audit (src/capabilities.ts)
       -> on failure: exactly ONE repair request with the failed checks
  -> normalizeBlueprint -> project graph (owners, contracts, phases, tasks, IDs)
  -> render five docs (src/renderers.ts) + kit (src/kits.ts and the per-preset kit files)
  -> auditPacket (src/audit.ts) gates export; preview bytes == export bytes
  -> export with blueprint.json (CLI: src/packet.ts; app: src-tauri/src/export.rs)
```

Everything after the provider answer is deterministic local code. The provider supplies product meaning
only, through **declared fields**. A new fact the documents need is a new declared field, an intake rule,
and one provider-prompt sentence.

Invariants: exactly five docs, then `kit/`, then `blueprint.json`; preview bytes equal export bytes; one
provider request plus at most one repair; keys are memory-only and never logged; every preset has a real
kit; **strict JSON mode needs every schema property in `required`** (`tests/schema.test.ts` guards it).

## 3. Goal and definition of done

Alan wants **a working installed desktop app whose exported packets are agent-ready for every preset.**

1. `npm run typecheck`, `npm test`, `npm run kit:check`, and in `src-tauri`: `cargo fmt --check`,
   `cargo clippy --all-targets -- -D warnings`, `cargo test` are green. (`npm run check` runs all but kit:check.)
2. Two consecutive live rounds on fresh ideas show no *systematic* defect class (the same defect in
   several packets or presets), and every kit builds with its own commands.
3. The app is rebuilt and installed, and has exported one packet per preset **from the app itself**,
   each passing `npm run -s cascade -- verify --packet <dir>`.
4. A final report to Alan: numbers per round, what was fixed, what is not verified, remaining limits.

## 4. Before this session

Round 11 had closed with five of five packets agent-ready. Alan then ran the round-12 ideas
(`scripts/agent-ready/run-round.fish`, 25 ideas, five per preset) from the installed app, and the run
failed **before any document was written**:

| Preset | Idea | What happened |
|---|---|---|
| Waybar | Disk Free | The AI put labelTemplate and thresholds on every feature; the one repair did not remove the copies. |
| Android | Tip Split | The AI invented a scheduled notification, then after the repair set `valueDecimals`, a bar-only field. |
| Tauri | not recorded | `provider.http-error` at the provider step; the UI hid the HTTP status. |
| Astro | not recorded | `jev.intake-rejected`; the UI hid Jev's score. |

After the intake stage was fixed (section 5.1), four ideas were generated live by CLI. All four reached
Gate Clean, verified, and built their kits, and **none was agent-ready**:

| Packet | Blocking | Defect |
|---|---|---|
| Waybar Disk Free | 1, then 1 more | Label acceptance examples said two decimals ("3.67 GB") while the contract and kit said one. A later audit found one example also gave class normal to a reading that the red-below-10-GB rule makes critical. |
| Android Tip Split | 2, one cause | A calculator with no stored data still got the list prompt: status, empty-state and write-error slots, and a test that "seeds records through the repository". |
| Tauri Budget Book | 3, two causes | PRD said selecting a row opens a read-only view with Delete while the tasks built no such view. Monthly totals were compiled as a list filter, with a failure message both required and forbidden. |
| Astro Green Kitchen | 3 | Nothing linked to the meal-type pages; nothing said which pages exist or what an empty one shows; the kit printed ingredients and steps as one comma-joined line. |

## 5. What was fixed this session

All local on `main`, nothing pushed. Commits `f2f4f5c` to `2c8fe5e` (twelve, each fix with a test that
failed first). Tests: `tests/round12-intake.test.ts`, `tests/round12-docs.test.ts`.

### 5.1 Intake stage

- **Failures say why.** `provider.http-error` now carries the HTTP status, a plain-word hint, and the
  allowlisted provider code (`providerIssue`, src/pipeline.ts; the CLI provider forwards `error.code`).
  `jev.intake-rejected` carries the viability score, the 0.65 it needs, and the preset Jev would pick
  (`jevIntakeRejectedIssue`, src/jev.ts). Jev returns numbers only, so there is no text reason.
- **Bar-only keys are offered to the Waybar preset only.** `providerSchemaFor(presetId)` (src/schema.ts)
  leaves `systemSource`, `thresholds`, `labelTemplate`, `unit`, `valueDecimals` out of the response schema
  of the other four presets. Cause of the Tip Split failure: one shared schema plus strict JSON mode made
  the AI fill every key.
- **`settleBlueprint`** (src/compiler.ts) runs on the parsed answer before any check. Waybar: identical
  label or threshold copies stay on one feature (`settleWaybarLabel`, src/waybarContracts.ts: the first
  non-click feature that only shows data, else the scheduled measuring feature); copies that differ are
  rejected as before. All presets: a `scheduledNotification` with no schedule is cleared when no feature
  uses notifications. `AGENTS.md` names these as the only exceptions to "never drop provider content".

### 5.2 Document stage

| Stack | Fix | Where |
|---|---|---|
| Android | Zero data objects means no list: one section per feature, and the first main task tests its own acceptance with no repository. | `androidNoData`, `noListSlotsSentence` (src/compiler.ts); src/androidPlan.ts |
| Waybar | Check `capability.waybar-label-decimals`: a label example whose decimals differ from `valueDecimals` goes back for repair. Check `capability.waybar-class-example`: an example whose class contradicts the thresholds for its reading goes back. The units rule yields to a label that states its decimals. | `waybarValueIssues`, `WAYBAR_UNIT_CONVENTION`, provider notes (src/waybarContracts.ts) |
| Tauri | A later read-only main feature with `narrowsListBy` none is a **summary**: its own "summary" host, writes nothing to the store, one load-failure rule. A Tauri filter now needs `narrowsListBy` other than none. | `isTauriSummary`, `hasFilterFeature`, `slotFor` (src/compiler.ts); src/tauriContracts.ts |
| Tauri | Check `capability.tauri-no-detail-view` (Alan's decision: send the wording back): with no edit feature, text about a view of one selected record goes back for repair. The cause was our own provider note saying a delete always starts from a read-only view; it is now scoped to products with an edit feature. | src/capabilities.ts; Tauri `providerNotes` (src/presets.ts) |
| Astro | A tag page over the collection's one choice field gets a kit shell (one page per option, "No entries yet."), nav links per option, a route line stating the page set, and a task that starts from the kit shell. List fields render as `<ol><li>`; the seed has two items; the test-reading rule covers a list field. | `astroTagPages` (src/astroWeb.ts); `tagPage`, `SHOWN_AS` (src/astroKit.ts) |

### 5.3 Result

| Packet | Re-audit | Basis |
|---|---|---|
| Tip Split | 0 blocking | Recompiled from the AI's own answer. |
| Green Kitchen | 0 blocking | Recompiled from the AI's own answer. |
| Disk Free | 0 blocking | Recompiled from a blueprint repaired by hand as the two new checks ask. Third audit. |
| Budget Book | 0 blocking | Recompiled from a blueprint repaired by hand as the new check asks. The second audit left one sentence; after that fix the packet differs from the audited one only in that sentence and one clause (sentence diff, identical kit). No third audit. |

Verified at `2c8fe5e`: `npm run check` green (467 tests, clippy, cargo test); `npm run kit:check` 18/18;
the four recompiled kits build with their own commands; `verify --packet` passes on each; the app is
rebuilt and installed (`scripts/install-linux-app.sh`, 2026-11-10 15:09).

Not verified:
- **No live run after the document fixes.** Whether the AI repairs Disk Free (decimals and class) and
  Budget Book (two features and an outcome sentence) in its single repair request is unproven.
- `settleWaybarLabel` has never acted in a live run (the AI returned one feature for Disk Free).
- 21 of the 25 round-12 ideas have not been run. GTK was not run at all in round 12.
- The Tauri HTTP status and the Jev score of the rejected Astro idea are still unknown. Budget Book and
  Green Kitchen were stand-ins; Alan never said which ideas failed. Request size is ruled out for Tauri
  (its request is the second smallest; Waybar's is the largest and passed).
- No screenshot of the rebuilt app; no packet exported from the app itself this session.

Test data: `tests/fixtures/waybar-disk-free.json`, `android-tip-split.json`, `tauri-budget-book.json`,
`astro-green-kitchen.json` are the **unrepaired** provider answers. The hand repairs are the `repaired()`
helpers in `tests/round12-docs.test.ts`. The packets were in `/tmp/v4-round12b`, `12c`, `12d` (a RAM disk;
gone after a reboot; recompile with `npm run -s cascade -- compile --preset <id> --blueprint <file> --out <dir>`).

### 5.4 Next session (2026-11-10, later): the four ideas run live again

Start state was green (`npm run check`, 467 tests). Alan said yes to the four live runs (CLI, packets in
`/tmp/v4-round12e`, a RAM disk).

| Idea | Live result | Verify | Kit build | Audit |
|---|---|---|---|---|
| Disk Free (Waybar) | Gate Clean | pass | all commands 0 | see below |
| Green Kitchen (Astro) | Gate Clean | pass | all commands 0 | see below |
| Tip Split (Android) | Gate Clean | pass | all commands 0 | see below |
| Budget Book (Tauri) | **`capability-rejected`, no packet** | - | - | - |

**Budget Book live failure (a repair cascade).** The first answer invented an "Edit expense" feature. The one
repair (`semantic.feature-not-requested`) removed it. The repaired answer then failed
`capability.tauri-no-detail-view` on "Expense list" and "Delete expense": their text about a read-only view was
right while an edit feature existed and wrong once it was removed. No repair was left. Likely trigger: the
Tauri provider note now opens with "When some feature edits a record ..." (the earlier live run, before that
rewording, invented no edit feature). Cause in the pipeline: the repair request lists only the stage that
failed (intake), so the provider never sees the capability check that removing the feature will trip.
Not fixed yet; neither answer was kept, so the next live run of Budget Book (with `--keep-answers`) supplies
the fixture.

No `provider.http-error` appeared in the four runs.

Changed (`c183599`): `generate --keep-answers <folder>` writes `answer-1.json` (and `answer-2.json` after a
repair) with credential-like text removed; a Gate Clean run prints `Repaired once: <rules>`;
`run-round.fish` keeps full output and answers per run under `<round>/_logs/` and `<round>/_answers/`.
Before this the CLI did not record a repair, so **whether Disk Free needed its repair in this run is unknown.**

Confirmed against a real packet (Tip Split), not fixed yet: the Android storage boilerplate in a no-storage
packet (6.3, first Must), and the build-tools version: the docs say 37.0.0, the kit sets no
`buildToolsVersion`, and this machine builds the kit with only build-tools 36.0.0 installed.

## 6. What must be done to make the four stacks agent-ready

"Agent-ready" was shown for one idea per stack. The work left is to prove it on more idea shapes and
close the known gaps. Do the cross-stack steps first; they decide what else is real.

### 6.1 Cross-stack, in this order

1. **Run the four ideas live again** (Disk Free, Tip Split, Budget Book, Green Kitchen; paid, ask Alan).
   Pass = Gate Clean with at most one repair, and an audit with 0 blocking. If the AI does not make a
   repair in one request, shorten or sharpen that check's message first; do not weaken the check.
2. **Run the full 25-idea round** (`fish scripts/agent-ready/run-round.fish /tmp/v4-round12`; paid, ask
   Alan). For each packet: verify, build the kit, one read-only audit agent, confirm every blocking claim
   against the files, then group by class. A clear rejection of something a preset cannot do is a pass.
3. **Fix classes, not packets**, one failing test first per class, then re-audit only the failing packets.
4. Read the Tauri HTTP status and the Astro Jev score when they appear, and tell Alan before changing
   anything for them. Do not lower `JEV_VIABILITY_THRESHOLD` (src/jev.ts) without his explicit yes.
   Suspect to check with the score in hand: the viability question asks for "one coherent application"
   and the Astro ideas are websites.
5. **Alan's own live check (his instruction, 2026-11-10).** After the 25-idea round and its fixes: rebuild
   and install the app (`bash scripts/install-linux-app.sh`) so it has the fixes, then give Alan **five new
   ideas, one per preset, none used in any earlier round**. Alan runs them alone in the app and exports.
   Then verify each exported packet, build its kit from a temporary copy, audit it with one fresh read-only
   agent, and tell Alan per packet whether it is agent-ready. His exported folders are read-only.
6. **Decide with Alan: prose checks.** Three new checks read provider text with a pattern
   (`waybar-label-decimals`, `waybar-class-example`, `tauri-no-detail-view`). They only send text back
   for repair and never shape output, like the older Waybar text checks, but the old rule said "no new
   prose regexes". Keep, or replace with declared fields.

### 6.2 Waybar (`linux-hyprland-waybar-module`)

Must:
- Confirm live that the AI fixes decimals and class together. The provider-note example
  "3,670,016,000 bytes is 3.67 GB" is the likely source of both errors; consider an example that cannot
  be copied into a one-decimal label.
- `capability.waybar-class-example` covers only "N bytes" and a number shown directly before a unit
  that does not scale ("25%"). It skips rates, a label with no unit, and values with trailing zeros
  ("2.50"). Load Meter (amber above 2.00) and Net Rate are therefore unchecked: extend it when one fails.
- `settleWaybarLabel` gives the label to the first declared show-only feature, because no declared field
  tells a label feature from a tooltip feature. Watch Load Meter and Battery Watch; add a declared field
  if an audit finds the label contract on the wrong task.
- Not yet run: Battery Watch, Net Rate, Weather Bar, Load Meter.

Should (audit polish, each seen twice): click clauses in the launch check and completion evidence when
no feature declares a click; "two hooks" where the kit has three; the unrendered `{app-id}` placeholder
and no stated content for `src/platform/lifecyclecoordinator.rs`; no exact tooltip text or rule for
total = 0; no stated signature for the feature function or where the class is asserted (`refresh_with`);
the TASK-01 marker criterion reads a file copied in TASK-05; kit `units.rs` comment and test still say a
size always has 2 decimals; the launch check never imports the module's CSS.

### 6.3 Android (`android-kotlin-compose`)

Must:
- Storage boilerplate in a no-storage packet (each can mislead): Room in the Locked Stack and kit
  dependencies, "the Room database opens on first use", `OWN-DATA-STORE` named in the ARD with no such
  owner, "use SavedStateHandle for process death" against "nothing survives", the relaunch check "confirm
  that the data the app saved is still present", "the shared view state (the loaded records ...)".
  Render these only when a data object exists.
- A feature with entered values and no data object gets no field contract: no messages, no testTags, no
  rule for a third decimal or an empty field, no rounding rule, and "preserve the last valid state"
  against "no results are shown". Give it a Form / Field rules block like a stored form.
- Docs say build-tools 37.0.0 while the kit sets no `buildToolsVersion` (the AGP default is 36.0.0).
  Check and make them agree. This comes from one audit and was not confirmed by the lead.
- Not yet run: Shopping List, Lift Log, Drink Reminder (a real scheduled notification: it exercises the
  notification rule in `settleBlueprint`), Days Until.

### 6.4 Tauri (`tauri2-rust-typescript-desktop`)

Must:
- Confirm live that the AI rewrites all of it when `capability.tauri-no-detail-view` fires.
- A search feature that forgets `narrowsListBy` is now treated as a summary (it would be told to write
  nothing). Add an intake check or a provider sentence so a feature that narrows the list must declare how.
- The current-month rule speaks of a record's "parsed date-time", but the month must use the user-entered
  date field, not `created_at`. Name the field.
- Money has no mechanical rule: accepted input, storage, rounding of sums, and the shown format.
- Kit `src/style.css` styles no number or date input and has no form layout, and no task may edit it
  (a kit change: run `npm run kit:check`).
- Failure texts the PRD describes but does not quote have no fallback; the empty state is not hidden
  while the load error shows; "no category" in an acceptance criterion cannot be reached with a picker
  that always has a value; "Each row has a Delete button" is listed under the list task but built by the
  delete task.
- Not yet run: Link Shelf, Meeting Clock (tray), Day Journal (one entry per day, save to a file),
  Clip Keeper (clipboard watch: expect a clear rejection or real support, never a contradictory packet).

### 6.5 Astro (`astro-web`)

Must:
- `astroTagPages` plans a tag page only when the collection has exactly one choice field. A tag page over
  an open set (one page per author in Field Notes) or with two choice fields gets no shell, no links, and
  no page-set rule: the same defect Green Kitchen had. Handle it or reject it clearly.
- A list field is a one-line flow list, so an item cannot contain a comma ("2 eggs, beaten"). Move to a
  block list, or state the limit where the entry format is described.
- Final validation runs `npm test` before `npm run build`, and the page tests read `dist/`.
- Both seed lists hold the same two items, so a test cannot tell ingredients from steps.
- Not yet run: Studio Folio, Town Events (build-time date filter), Field Notes (two linked collections),
  Corner Cafe (grouped menu, prices with two decimals, about page).

Should: the `/teas/` example route from another product; long-text and MDX wording when neither applies;
the general "every field is rendered as the stored value" rule against list fields; a recovery contract
that no test can assert.

### 6.6 GTK (`linux-wayland-gtk4-desktop`), the fifth preset

Not run in round 12 at all (Plant Care, Habit Streak, Word Bank, Focus Timer, Quiet Hours). The shapes
fixed above for one preset are untested here: a product with no data object, and a read-only feature that
shows derived values. Run it with the full round.

### 6.7 Finish

Rebuild and install, screenshot the app, export one packet per preset from the app itself, verify each,
then report. Still open from this session: the UI does not show that a copy was settled; a Jev transport
failure still hides its HTTP status; nothing was recorded in the vault.

## 7. How to work

- One failing test first per class, with a fixture shaped like the real answer (`tests/fixtures/*.json`
  is the inner `blueprint` object; see `tests/round12-docs.test.ts`). Fix the shared code once. No special
  case for a product name.
- After each fix: `npm run typecheck`, `npx vitest run`, then `npm run check`. `npm run kit:check` only
  when a starter kit changed (slow; keep at least 2 GB free in `/tmp`, a 7.5 GB RAM disk).
- Keys `DEEPSEEK_API_KEY` and `TYPESAFE_API_KEY` live in the **fish** environment, not bash: run paid
  commands through `fish -c`. Live generation: `npm run -s cascade -- generate --preset <id> --idea "<text>"
  --out /tmp/<round>/<preset-id>`.
- Per packet: `npm run -s cascade -- verify --packet <dir>`; `bash scripts/agent-ready/build-round-kits.sh
  /tmp/<round>` (prints `-> 0` per command); one fresh read-only audit agent with
  `scripts/agent-ready/audit-brief.md`. Confirm each blocking claim yourself before acting on it.
- A re-audit can find a defect the first audit missed (Disk Free did). Re-audit after every fix.
- Free regression: recompile a saved blueprint with `cascade -- compile`. It does not call the provider.
- Vitest does not typecheck. Fixtures are typed as the zod output type, so a new schema field breaks
  fixture literals. Rust `format!("{:.1}", 1.25)` gives "1.2"; the convention is round half away from zero.
- Stop rule: two consecutive rounds with no systematic class and every kit building. Strict auditors
  always find a few one-off items; judge by classes, not raw counts.

## 8. Repo map

- `src/schema.ts` provider schema, `providerSchemaFor`, prompt (`buildBlueprintInstructions`), intake rules.
- `src/pipeline.ts` the flow, the one repair, failure messages. `src/jev.ts` Jev decisions.
- `src/capabilities.ts` blueprint against preset. `src/compiler.ts` `settleBlueprint`, normalization,
  graph, owners, tasks, the task-prompt line. `src/renderers.ts` the documents. `src/audit.ts` export gates.
- `src/presets.ts` the five preset contracts and their `providerNotes`.
- Per preset: `gtkContracts.ts`; `waybarContracts.ts` + `waybarKit.ts`; `tauriContracts.ts` + `tauriKit.ts`;
  `astroWeb.ts` + `astroKit.ts`; `androidPlan.ts` + `androidForms.ts` + `androidKit.ts`; shared `kits.ts`.
- `src/cli.ts`, `src/packet.ts` CLI. `src/app.ts`, `state.ts`, `bridge.ts` UI. `src-tauri/src/` Rust.
- `tests/` unit and fixture tests; `tests/kit-build.test.ts` real kit builds.
- `scripts/install-linux-app.sh`; `scripts/agent-ready/` (run-round.fish, build-round-kits.sh, audit-brief.md).

## 9. Rules

- Never push; commit locally only. Alan says "push" when he wants it.
- Never print, log, or echo API keys, and never put a request body with a key in a message or file.
- Never edit an exported packet folder (`/home/arch/dev/nodaysidle/<packet-name>/`). Read only.
- Ask Alan before anything that spends API calls.
- Do not weaken a check that protects document quality. Do not lower `JEV_VIABILITY_THRESHOLD` without
  Alan's explicit yes.
- Keep this file current: what is done, what is left, open questions. Commit it with your changes.
- Tell Alan plainly what is not verified.

## 10. Prompt for the next agent

Open Claude Code in this repo folder and paste:

```text
ALAN. You are taking over NODAYSIDLE Cascade V4 in /home/arch/dev/nodaysidle/nodaysidle-cascade-v4
(branch main). It is a local-first compiler and Tauri 2 desktop app that turns one software idea plus
one tech-stack preset into five Markdown contracts and a starter kit that a coding agent builds from.

Read first, in this order: /home/arch/dev/nodaysidle/CLAUDE.md, this repo's AGENTS.md (it wins), then
HANDOFF.md in full. Then run `git status`, `git log --oneline -14`, and `npm run check`. All must be
green before you change anything. If something is red, tell me and stop.

Hard rules, no exceptions:
- Never push. Commit locally only.
- Never print, log, or echo API keys (DEEPSEEK_API_KEY, TYPESAFE_API_KEY), and never put a request body
  with a key into a message or a file. The keys live in the fish environment: use `fish -c`.
- Never edit my exported packet folders (/home/arch/dev/nodaysidle/<packet-name>/). Read them only.
- Ask me before anything that spends API calls: the CLI `generate` command or
  scripts/agent-ready/run-round.fish. Say how many calls it will make.
- Do not weaken a check that protects document quality, and do not lower JEV_VIABILITY_THRESHOLD
  without my explicit yes.

Goal: every preset produces agent-ready packets. Agent-ready means a coding agent can build exactly the
idea from the packet alone, with no guesswork and no contradictions, and the kit builds with its own
commands. The last session reached 0 blocking defects for one idea per stack on four stacks (Waybar,
Android, Tauri, Astro). Two of those four were recompiled from blueprints repaired by hand, so they are
not yet proven live. GTK was not run.

Do, in this order, and verify each step before the next:
1. Ask me for a yes, then run the four ideas live by CLI: Disk Free, Tip Split, Budget Book, Green
   Kitchen (the exact texts are in scripts/agent-ready/run-round.fish). For each: verify, build the kit
   with scripts/agent-ready/build-round-kits.sh, and run one fresh read-only audit agent with
   scripts/agent-ready/audit-brief.md. Tell me per packet: agent-ready or not, and why.
2. Ask me for a yes, then run the full 25-idea round and audit every packet the same way. Confirm each
   blocking claim against the packet files yourself before you believe it. Group the confirmed defects
   by class. A clear, deliberate rejection of something a preset cannot do counts as a pass.
3. Fix classes, never single packets, starting with the ones that appear in several packets or presets.
   HANDOFF.md section 6 lists the known gaps per stack; treat its "Must" items as the starting list and
   check each against a real packet before fixing it.
4. If a Tauri run fails with provider.http-error, or an Astro idea is rejected by Jev, read me the full
   message (it now shows the HTTP status or the score) before you change anything for it.
5. Ask me whether to keep the three checks that read provider text with a pattern (HANDOFF.md 6.1,
   item 5), or to replace them with declared fields.

For each fix:
- Write a test that fails first, with a fixture shaped like the real provider answer (see
  tests/round12-docs.test.ts and tests/fixtures/*.json).
- Fix the shared code once. No special case for a product name.
- Run `npm run typecheck`, `npx vitest run`, and `npm run check`. Run `npm run kit:check` only if a
  starter kit changed, and keep at least 2 GB free in /tmp first.
- Recompile the affected saved blueprint with `npm run -s cascade -- compile` (free) and re-audit that
  packet. A re-audit can find a defect the first audit missed, so re-audit after every fix.
- Commit locally with a message that says what changed and why.

When two rounds in a row show no systematic defect class and every kit builds: rebuild the app with
`bash scripts/install-linux-app.sh`, take a screenshot, export one packet per preset from the app
itself, and run `npm run -s cascade -- verify --packet <dir>` on each.

Keep HANDOFF.md current as you go (done, left, open questions) and commit it with your changes. Report
to me in plain words: what was broken, what you changed, what you verified, and what you did not check.
Do not tell me something is agent-ready unless an audit of that exact packet says so.
```
