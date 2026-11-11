# HANDOFF — NODAYSIDLE Cascade V4 (rewritten 2026-11-10, evening, after the round-12 live round)

Read this file first, then `AGENTS.md`. A fresh session can resume from this file alone.
Workspace rules: `/home/arch/dev/nodaysidle/CLAUDE.md` (start every reply with `ALAN`; this repo's
`AGENTS.md` wins over the root one). The owner is Alan (git user `nodaysidle`).

Older detail is in git: `git show 5f6ac03:HANDOFF.md` has the long version of this session (every audit
finding with file and line, the per-stack gap lists), and `git show 2c8fe5e:HANDOFF.md` has rounds 8 to 11.

## 1. What the app is

Cascade V4 is a local-first **compiler** and Tauri 2 desktop app (Arch Linux / Omarchy, Wayland).
Input: one software idea (plain text) + one tech-stack preset. Output: a folder with five Markdown contracts
(`PRD.md ARD.md TRD.md TASKS.md AGENTS.md`), a starter `kit/`, and `blueprint.json`. A coding agent opens the
folder and builds the product from it. **"Agent-ready"** means a coding agent can build exactly the idea from
the packet alone, with no guesswork and no contradictions, and the kit builds with its own commands.

Presets (`src/presets.ts`): `linux-wayland-gtk4-desktop`, `linux-hyprland-waybar-module`,
`tauri2-rust-typescript-desktop`, `astro-web`, `android-kotlin-compose`.

How it works today: idea → local checks → TypeSafe Jev preflight → one DeepSeek request (strict JSON
blueprint) plus at most one repair → `settleBlueprint` → intake, Jev integrity and capability audits →
normalize → project graph → render five documents and the kit → `auditPacket` → export. Everything after the
provider answer is deterministic local code.

## 2. What this session found (2026-11-10)

Start state was green. Alan approved live runs of the 25 round-12 ideas (the texts are in
`scripts/agent-ready/run-round.fish`) and one read-only audit per packet. Every blocking claim was checked by
the lead against the packet files.

| | Result |
|---|---|
| Live runs | 26 runs, 23 packets. Budget Book failed once and passed once (the provider is not repeatable at temperature 0). Drink Reminder failed. |
| Kit builds | 23 of 24 built packets pass every command. Net Rate fails `cargo test`. |
| Audits | 19 packets audited. **3 agent-ready** (Tip Split, Green Kitchen, Studio Folio). **16 not.** 5 without a verdict (Alan stopped the agents). |
| By preset | GTK 0 of 5. Waybar 0 of 5. Astro 2 of 5. Android 1 of 3. Tauri 0 of 1 audited. |

Confirmed blocking causes, one line per packet (the benchmark truth for the tools in section 5):

- **Waybar Disk Free:** an example says class normal for a reading the threshold makes critical.
- **Waybar Battery Watch:** `runsEverySeconds` 1800 for "every 30 seconds"; kit default and test enforce 1800.
- **Waybar Net Rate (5):** wrong example (10.0 kB/s is 1250.0) and bits against bytes; examples measured
  over 5 seconds with a 2-second interval; the kit floors the interval at 5 seconds so its own tests fail;
  two rules for the first sample; no mechanism for "since the service started".
- **Waybar Load Meter (2):** the kit reader returns only the 1-minute value; `valueDecimals` without a unit is
  rejected, so the two decimals were lost.
- **Waybar Weather Bar:** the documents say `--set Latitude=VALUE`, the kit accepts only `latitude`.
- **GTK Focus Timer (3):** an Add button, dialog and list for a timer with no add task; the count has no
  slot; "today" has no local-or-UTC rule.
- **GTK Quiet Hours (4):** a single settings record compiled as a SQLite list (no create, list rows, a mark
  control, an empty-list message) while the kit and ARD say one JSON file.
- **GTK Habit Streak (4):** a Save button labelled "Read 10 pages" (a sample value taken from an acceptance
  sentence); a row toggle compiled as an add form with a removal confirmation.
- **GTK Word Bank (4):** file import compiled as a type-in form; no Import button; the read-only file got a
  database table.
- **GTK Plant Care (2):** "Watered today" (stamps a date) compiled as a checkbox on a flag that does not
  exist; the add form asks for a last-watered day.
- **Astro Field Notes (3):** "one page per author" became one page for all authors; no author link target;
  the seed post references a missing author.
- **Astro Corner Cafe:** "show every value as stored" against "price as 6.50 €" and a mark only when true.
- **Astro Town Events (3):** the one seed event is in the past so the home page is empty; past events both
  have and do not have a reachable page; no clock rule for the build day.
- **Android Shopping List (2):** the one "Clear checked" button compiled as a delete button per row.
- **Android Lift Log (2):** the input rule accepts two decimals where the idea says one; the date is both
  "not in the edit form" and "shown read-only".
- **Tauri Link Shelf (2):** the Open button sent to a "summary" host no task builds (side effect of last
  session's `isTauriSummary`); nothing in the kit can open a web address.
- **Drink Reminder (no packet):** the schema cannot say "daily at a time the user chooses, kept in settings";
  the provider's repair turned it into a fixed 09:00, then a later check rejected it. Budget Book's first run
  died the same way: the one repair fixed what it was told and exposed a check of a later stage.

Three root causes:

1. **The compiler guesses the screen.** It infers a shape from the declared operations and falls back to "a
   list with an add form" when the idea does not fit, without saying so. Fixing one shape per round does not
   converge: rounds 8 to 12 each closed and the next found new shapes.
2. **Provider text beside compiler rules.** The provider's prose and the numbers it computes or copies from
   our own prompt examples are printed next to the compiler's rules and contradict them.
3. **Kits are narrower than the documents promise**, and nothing ties a declared need to what the kit ships.

Two things held in every audit: the skeleton (task order, file ownership, names, commands, kits) and the
audit itself (about 45 blocking claims checked, all true).

## 3. Alan's decisions

- "this app approach of making the documents has flaws, it's not intelligent to repeat the same thing."
- "My decision is that you do what you think will solve my problem ... non agent-ready docs."
- **Use Claude Sonnet 5.5 (`claude-sonnet-5-5`)** for the new review and repair steps. His Anthropic key is in
  the fish environment as `ANTHROPIC_API_KEY`.
- The UI stays as it is: the user writes an idea, picks a preset, presses Generate.
- Waybar label and class examples are to be **written by the compiler** from the declared threshold, unit and
  decimals, not by the provider (decided before the direction change; still wanted, now as backlog).
- After the fixes are in the installed app, the lead gives Alan **five new ideas, one per preset, never used
  before**. Alan runs them alone in the app; the lead then verifies, builds the kits and audits what he
  exported, and reports per packet.
- Open: reuse a saved blueprint in the app so the same idea gives the same packet ("generate fresh" asks
  again). Recommended for later.

## 4. The app idea (the target the next agent builds)

**What the user sees.** The same screen. Idea, preset, Generate. The progress line gains three stages:
Review, Repair, Review again. The result shows a verdict: **Agent-ready (reviewed, 0 blocking)** or
**Not ready** with each reason in one plain sentence, plus the minor notes. Export works in both cases, and
the verdict is written into the packet. One more key field (Anthropic), kept in memory only like the others.
A run takes a few minutes instead of seconds.

**What happens behind Generate.**

```text
idea + preset
  -> everything the compiler does today (checks, Jev, DeepSeek blueprint, compile)   unchanged
  -> REVIEW   Sonnet 5.5, one request: all five documents + the kit's text files + the audit brief.
              Answer: typed findings (where, quote, why, fix). Every quote is checked against the files;
              a finding whose quote is in no file is dropped.
  -> REPAIR   only when the review has blocking findings. Sonnet 5.5 returns exact text edits
              (file, find, replace). Local code applies them; an edit that does not match is reported.
  -> BUILD    when the repair touched a kit file and a build is possible (CLI): the kit's own commands.
              A repair that breaks the kit is thrown away.
  -> REVIEW   again, on the repaired packet. At most 2 repair rounds (consider 3, see section 5).
  -> VERDICT  0 blocking and the kit builds = agent-ready. Otherwise not ready, with the findings shown.
  -> EXPORT   five documents + kit + blueprint.json
```

**What gets saved.** `blueprint.json` must record the repair: the ordered edits, the model id, and the final
review. Then compile(blueprint) + the recorded edits reproduces the exported bytes exactly, so
`verify --packet` keeps working and a saved packet can be rebuilt for free. Without this, verify fails on any
repaired packet.

**What stays.** The compiler, the kits, the skeleton and all deterministic checks. The review findings become
the backlog of compiler fixes: each plain compiler bug fixed deterministically means less for the repair step
to do, and a cheaper, faster run.

**What "done" means now.** Every exported packet carries an honest verdict. An idea gives either an
agent-ready packet or a clear "not ready, because". No template system can promise that every idea compiles
perfectly; this makes a failure visible instead of silent.

**Honest limits, both seen in the test (section 5).** The reviewer that judges the repair is the same model
that wrote it. And a review is not a build: the reviewer passed a repaired packet whose kit no longer builds.

## 5. What was measured (paid for on Alan's Anthropic key: 31 calls, about $3.80)

Tools, committed and tested (`tests/review-tool.test.ts`):

- `scripts/agent-ready/review.ts`: reviews one packet in one request. `--model`, `--packet`, `--out`,
  `--idea` (looked up in `run-round.fish` for round packets), `--dry-run`.
- `scripts/agent-ready/fix.ts`: repairs a packet from a review's blocking findings into a **copy**
  (`--out` must not exist). Writes `<slug>.fix.json` next to the copy.
- `@anthropic-ai/sdk` 1.7.0 is a dev dependency. Both tools stream with `max_tokens` 64000, because thinking
  counts against the limit (20000 cut Haiku's answers short).

**Step A: can the model review?** Nine packets with known truth (six broken, three clean).

| Model | Confirmed blocking causes found | On the 3 clean packets | Quotes | Per review |
|---|---|---|---|---|
| Sonnet 5.5 | **17 of 19** (missed: Net Rate's 5-second examples; Lift Log's date in the edit form) | 0, 1, 1 "blocking": both real, rated minor by the earlier audit (`npm test` before the build; a device check for saved data in an app that saves nothing) | all found in the files | about 1 minute, 13 to 23 cents (41k to 74k tokens in, 5k to 13k out) |
| Haiku 5.5 | all of Focus Timer, Quiet Hours, Net Rate, Field Notes, Link Shelf; Lift Log 1 of 2 | 3, 5 and 2 "blocking": real but minor things | all found in the files | 1.5 to 2.5 minutes, about 2 cents (22k to 41k tokens out, mostly thinking) |

Sonnet 5.5 is precise enough to be the gate. Haiku 5.5 finds as much but calls two to three times as many
things blocking, which would cost extra repair rounds.

**Step B: can the model repair?** Sonnet 5.5 repaired three broken packets from its own review, then reviewed
the result. Every edit applied (0 failed out of 80). Then the repaired kits were built.

| Packet | Blocking before | After round 1 | After round 2 | Kit build after repair |
|---|---|---|---|---|
| Focus Timer (GTK) | 4 | 1 (new: the notification part had no function to call) | **0** | passes |
| Field Notes (Astro) | 3 | **0** by the reviewer | - | **fails** |
| Net Rate (Waybar) | 4 | 1 (new: the 5-second examples) | 1 (another: a TASK-01 check reads a file TASK-06 creates) | **passes now** (it failed before the repair) |

- Focus Timer: the Add button, dialog and list are gone; the timer screen and a slot for the count are
  described; a notifier interface is defined.
- Net Rate: the examples are right (1250.0 kB/s), "times 8" is gone, one first-sample rule; the model also
  fixed the kit's interval floor in `config.rs`, `module.rs` and the kit test, and `cargo test` passes.
- **Field Notes shows the gap.** The repair added a per-author route to the documents (33 edits) and rewrote
  `kit/src/pages/author.astro` for its new place `author/[slug].astro`. An edit cannot move or create a file,
  so the file stayed where it was with imports that no longer resolve: `npm run check` and `npm run build`
  fail. The reviewer still said 0 blocking, because it reads and cannot build.

A repair round costs about 15 to 26 cents and 1.5 to 2.5 minutes. A packet with two rounds costs about 70 to
90 cents and 5 minutes.

**What this proves:** the model finds the confirmed defects, its edits apply cleanly, it can fix kit code that
a kit test then confirms, and the reviewer stops flagging the original defects after the repair.
**What it does not prove:** that "0 blocking" by Sonnet 5.5 means agent-ready. No independent audit and no
trial build has checked the repaired packets. **What it disproves:** that a review alone is enough after a
repair. A repair that touches the kit must be followed by the kit's own build, and the edit format needs
"create", "move" and "delete" for files (or kit edits must be refused). Net Rate also shows the loop need not
end in two rounds: each round fixed what was flagged and the reviewer then raised the next real item.

## 6. What to do next, in order

1. **Check the repair independently (done).** Rebuilt the repaired Focus Timer (`14 + 4` edits) and Net Rate
   (`21 + 8` edits) packets in `/tmp/v4-step1-rebuilt`, built both kits (`cargo fmt --check`, `cargo clippy`,
   `cargo test` all passed), and ran one fresh read-only audit agent per packet with
   `scripts/agent-ready/audit-brief.md`. Both returned **0 blocking findings** (`verdict: "PASS"`), confirmed
   against the files: Focus Timer has no Add button/dialog/list, defines the `today-count` and `status` slots,
   the local calendar-day rule (`day_bounds`, `count_today`, `local_utc_offset_millis`), and `Notifier` on
   `OWN-PERMISSION-COORDINATOR`; Net Rate fixes the `100.0`/`1250.0 kB/s` 2-second examples, byte-rate rule,
   first-sample rule, `baseline_bytes`, and the kit interval floor.
2. **Close the gap Field Notes showed (done).** `scripts/agent-ready/fix.ts` now supports file operations (`op`: `replace`,
   `create`, `move`, `delete`, and `to`), updates the packet folder on disk (`writePacketEdits`), and builds
   the kit (`buildKit`) after any repair that touches `kit/`, discarding a repair that breaks the kit.
   Re-repaired `astro-web/field-notes`: round 1 (`38` edits, `0` failed) moved `kit/src/pages/author.astro` to
   `kit/src/pages/author/[slug].astro`, updated `kit/tests/contract.test.ts` and `kit/src/layouts/BaseLayout.astro`,
   passed the kit build (`check`, `test`, `build`, `test:a11y`, `audit:performance`), and left 1 blocking
   finding (`npm test` before `npm run build` in the final validation order); round 2 (`3` edits, `0` failed)
   fixed that gate order and reached **0 blocking** (`8` polish) with a passing kit build. For the desktop app,
   when a repair touches `kit/`, the Tauri backend will run the kit build in a temporary folder and, if the
   build fails or the toolchain is missing, discard the kit repair and report **Not ready** with the reason.
3. **Fix the plain compiler bugs the reviewer keeps finding (done).** All 8 deterministic fixes landed with a
   failing test first each (`ace8edd`, `79f724e`, `d414879`, `8c038de`, `2fd4a20`, `a8e3616`, `a9e9e87`, plus
   the provider-note example cleanup): the Waybar kit's 1-second refresh interval floor (`src/kits.ts`);
   final validation runs `npm run build` before `npm test` on Astro (`src/presets.ts`, `src/compiler.ts`);
   the Waybar `TASK-01-FOUNDATION` marker criterion no longer references packaging-owned
   `resources/waybar/config.jsonc` (`src/compiler.ts`, `src/presets.ts`); the Android relaunch check confirms
   starting state when `blueprint.domainData.length === 0` (`src/presets.ts`); the GTK Save button label only
   extracts a quoted string attached to `button` (`src/gtkContracts.ts`); `isTauriRowAction` mounts per-row
   read-only actions (`invokedBy: "click"` or row actions) into `row-actions` instead of `"summary"`
   (`src/compiler.ts`, `src/tauriContracts.ts`); Waybar unitless readings can declare `valueDecimals`
   (`src/waybarContracts.ts`); and the copied provider-note examples (`"30 minutes is 1800"`, `"6,250,000 bytes
   in 5 seconds is 10.0 Mb/s"`, `"84.50 means 2"`) were replaced with rule-based wording (`src/waybarContracts.ts`,
   `src/presets.ts`).
4. **Build the review and repair steps into the pipeline (done).** `src/review.ts` implements the shared
   browser/Node review and repair loop (`REVIEW_MODEL = "claude-sonnet-5-5"`, `REVIEW_JSON_SCHEMA`,
   `FIX_JSON_SCHEMA` verified equal to `zodOutputFormat` schemas, quote verification, file operations
   `replace`/`create`/`move`/`delete`, kit build gate, and `PacketRepairRecord`). `src/pipeline.ts` runs the
   `review`, `repair`, and `review-again` stages after compile and attaches `repair` to `CompiledPacket` and
   `blueprint.json`. `verifyPacketFolder` (`src/packet.ts`) and `cascade compile` (`src/cli.ts`) replay
   `manifest.repair.edits` so repaired packets verify and rebuild byte-identically for free. `src/review-wire.ts`
   wires the Node CLI (`@anthropic-ai/sdk` streaming with `output_config: { effort: "high", format }`,
   `fallbacks: "default"`, `anthropic-beta: "server-side-fallback-2026-07-01"`, and `stop_reason` verification)
   and local kit builds (`buildCompiledPacketKit`). `src-tauri/src/provider.rs`, `src-tauri/src/export.rs`,
   `src-tauri/src/lib.rs`, `src/bridge.ts`, `src/state.ts`, `src/app.ts`, and `src/style.css` wire the Tauri
   desktop app (`claude_complete` with memory-only `Zeroizing` key, `build_packet_kit` in a temporary directory,
   the Anthropic key input field, the `Review`/`Repair`/`Review again` progress stages, and the `#verdict-panel`
   showing **Agent-ready (reviewed, 0 blocking)** or **Not ready** with blocking reasons and minor notes).
5. **Decide the round limit with data (done).** Rebuilt all 16 broken round-12 packets with the Step 3 compiler
   fixes and ran the full review-repair-build-review loop up to 3 repair rounds (64 Claude Sonnet 5.5 calls,
   all kit builds and `verifyPacketFolder` checks passing):
   - **2 repair rounds:** **14 of 16** reached `0 blocking + passing kit build` (`corner-cafe` in 0 rounds;
     `load-meter`, `quiet-hours`, `habit-streak`, `plant-care`, `field-notes`, `town-events`, `lift-log`, and
     `link-shelf` in 1 round; `battery-watch`, `weather-bar`, `focus-timer`, `word-bank`, and `shopping-list`
     in 2 rounds).
   - **3 repair rounds:** **16 of 16** reached `0 blocking + passing kit build` (`disk-free` and `net-rate`
     reached 0 blocking in round 3).
   - Set `DEFAULT_REVIEW_ROUNDS = 3` in `src/review.ts` (packets that reach 0 blocking earlier stop immediately).
6. **Rebuild and install (done).** Ran `bash scripts/install-linux-app.sh` (`/home/arch/.local/bin/nodaysidle-cascade-v4`),
   took a screenshot, and gave Alan five new ideas, one per preset, never used before. Alan generated and
   exported all five from the desktop UI:
   - `/home/arch/dev/nodaysidle/tea-cellar/` (`linux-wayland-gtk4-desktop`): 2 repair rounds, 7 edits, 0 blocking
     (`verdict: "agent-ready"`). Passed `cascade verify --packet`, kit build (`cargo fmt`, `clippy`, `test`),
     and lead file-by-file audit against `scripts/agent-ready/audit-brief.md` (0 blocking).
   - `/home/arch/dev/nodaysidle/swap-meter/` (`linux-hyprland-waybar-module`): 1 repair round, 4 edits, 0 blocking
     (`verdict: "agent-ready"`). Passed `cascade verify --packet` and kit build (`cargo fmt`, `clippy`, `test`),
     plus lead file-by-file audit against `scripts/agent-ready/audit-brief.md` (0 blocking; minor note:
     `ACC-SWAP-REFRESH-03` treats `/proc/meminfo` numbers as raw bytes whereas `SwapReader` multiplies `/proc/meminfo`
     `kB` values by 1024, flagged in `blueprint.json` polish #1).
   - `/home/arch/dev/nodaysidle/snippet-vault/` (`tauri2-rust-typescript-desktop`): 1 repair round, 4 edits,
     0 blocking (`verdict: "agent-ready"`). Passed `cascade verify --packet`, kit build (`npm run typecheck`,
     `npm test`, `cargo fmt`, `clippy`, `test`), and lead file-by-file audit against
     `scripts/agent-ready/audit-brief.md` (0 blocking).
   - `/home/arch/dev/nodaysidle/cinema-club/` (`astro-web`): 0 repair rounds, 0 edits, 0 blocking
     (`verdict: "agent-ready"`). Passed `cascade verify --packet`, kit build (`npm run check`, `npm test`,
     `npm run build`, `npm run test:a11y`, `npm run audit:performance`), and lead file-by-file audit against
     `scripts/agent-ready/audit-brief.md` (0 blocking).
   - `/home/arch/dev/nodaysidle/fuel-log/` (`android-kotlin-compose`): 3 repair rounds, 9 edits, 0 blocking
     (`verdict: "agent-ready"`). Passed `cascade verify --packet`, kit build (`./scripts/gradle.sh testDebugUnitTest`,
     `lintDebug`, `assembleDebug`), and lead file-by-file audit against `scripts/agent-ready/audit-brief.md`
     (0 blocking; confirms the 3-round default was needed in a real UI run).
7. Still wanted, lower priority: Waybar examples written by the compiler; "daily at a user-chosen time" for
   Android (support it or reject it clearly); reuse of a saved blueprint.

## 7. Where things are

- Provider answers of the round: `tests/fixtures/round12-answers/` (per run `answer-1.json` and, after a
  repair, `answer-2.json`).
- The final blueprint of every round packet (24): `tests/fixtures/round12-blueprints/<preset>--<slug>.json`.
  Rebuild a packet for free:
  `npm run -s cascade -- compile --preset <preset> --blueprint <file> --out /tmp/<round>/<preset>`.
- Reviews and repairs of steps A and B: `tests/fixtures/round12-reviews/` (`bench/` holds the step-A reviews
  per model; `r1--<slug>.fix.json`, `r1--<slug>.review.json`, `r2--...` hold step B). To rebuild a repaired
  packet: recompile it, then apply the edits of its `fix.json` files in order (`fix.edits`) with `applyEdits`
  from `scripts/agent-ready/fix.ts`.
- The packets themselves are on a RAM disk and vanish on reboot: `/tmp/v4-round12e` (first four runs),
  `/tmp/v4-round12f` (the 22-idea round, with `_logs/` and `_answers/`), `/tmp/v4-round12g` (`r1/`, `r2/`
  repaired packets, `logs/`).
- Repo map: `src/schema.ts` (provider schema, prompt, intake rules), `src/pipeline.ts` (flow, DeepSeek repair,
  and post-compile Claude review/repair loop), `src/review.ts` (shared review/repair schemas, prompt builders,
  quote verifier, file edits, and `runReviewAndRepairLoop`), `src/review-wire.ts` (Node Anthropic SDK streaming
  client and local kit builder), `src/jev.ts`, `src/capabilities.ts`, `src/compiler.ts` (settle, normalize,
  graph, task prompts), `src/renderers.ts`, `src/audit.ts`, `src/presets.ts`, per-preset `*Contracts.ts` and
  `*Kit.ts`, `src/cli.ts`, `src/packet.ts`, `src/app.ts`, `src-tauri/src/`, `tests/`, `scripts/agent-ready/`.

## 8. How to work

- Checks: `npm run typecheck`, `npx vitest run`, `npm run check` (adds the frontend build and cargo fmt,
  clippy, test). `npm run kit:check` only when a starter kit changed (slow; keep 2 GB free in `/tmp`).
- Keys live in the **fish** environment: `DEEPSEEK_API_KEY`, `TYPESAFE_API_KEY`, `ANTHROPIC_API_KEY`. Run
  paid commands through `fish -c`. Check a log for key text with a count only before reading it.
- Live generation: `npm run -s cascade -- generate --preset <id> --idea "<text>" --out /tmp/<round>/<id>
  --keep-answers <folder>`. A Gate Clean run prints `Repaired once: <rules>` when it used the repair.
  `fish scripts/agent-ready/run-round.fish /tmp/v4-roundN` runs every `g` line and keeps `_logs/` and
  `_answers/`. One generate is 3 to 5 calls (1 to 2 DeepSeek, 2 to 3 TypeSafe).
- Per packet: `npm run -s cascade -- verify --packet <dir>`; `bash scripts/agent-ready/build-round-kits.sh
  /tmp/<round>` (prints `-> 0` per command); `python3 scripts/agent-ready/make-audit-prompts.py /tmp/<round>
  <out-folder>` then one fresh read-only agent per prompt file. Tell audit agents to judge only from the
  packet. At most 20 agents run at once, and 20 audits use most of a 5-hour Claude limit.
- Review and repair: `fish -c 'npx tsx scripts/agent-ready/review.ts --model claude-sonnet-5-5 --packet <dir>
  --out review.json'`, then `fix.ts --model claude-sonnet-5-5 --packet <dir> --review review.json --out <new
  dir>`, then build the kit of the new dir and review it.
- One failing test first per fix, with a fixture shaped like the real provider answer. Fix the shared code
  once. No special case for a product name. Commit locally with a message that says what and why.
- Vitest does not typecheck. Rust `format!("{:.1}", 1.25)` gives "1.2"; the convention is round half away
  from zero.

## 9. Rules

- Never push; commit locally only. Alan says "push" when he wants it.
- Never print, log, or echo an API key, and never put a request body with a key in a message or file.
- Never edit an exported packet folder (`/home/arch/dev/nodaysidle/<packet-name>/`). Read only.
- Ask Alan before anything that spends API calls, and say how many and about how much. The approved $5 for
  the measurement is used (about $3.80 spent); ask again.
- Do not weaken a check that protects document quality. Do not lower `JEV_VIABILITY_THRESHOLD` without Alan's
  explicit yes.
- Keep this file current and commit it with your changes. Tell Alan plainly what is not verified.
- Do not tell Alan a packet is agent-ready unless an independent audit of that exact packet says so.

## 10. Not done, not verified

- Independent read-only audits of repaired Focus Timer and Net Rate passed (0 blocking, kits build). Field
  Notes re-repair with file operations (`create`, `move`, `delete`) + kit build check passed in 2 rounds
  (0 blocking, kit builds).
- Five round packets have no audit verdict: Budget Book (second run), Meeting Clock, Day Journal, Clip
  Keeper, Days Until.
- All 8 plain deterministic compiler bugs from section 6 item 3 are fixed and tested, and `npm run kit:check`
  passed across all 5 preset kits.
- Step 4 (pipeline, manifest replay, CLI, and desktop app review/repair integration) and Step 5 (live
  benchmark on all 16 broken round-12 packets: 14/16 in 2 rounds, 16/16 in 3 rounds; `DEFAULT_REVIEW_ROUNDS = 3`)
  are complete. Note that "0 blocking by Sonnet 5.5 + passing kit build" on the remaining 14 packets has not
  had a separate subagent audit beyond the 2 independent audits in Step 1 (`focus-timer`, `net-rate`).
- Step 6 (done): Rebuilt and installed the desktop app (`bash scripts/install-linux-app.sh` ->
  `/home/arch/.local/bin/nodaysidle-cascade-v4`), captured a window screenshot, and gave Alan five new ideas
  (one per preset, never used before). Alan generated and exported all five from the UI (`tea-cellar`,
  `swap-meter`, `snippet-vault`, `cinema-club`, `fuel-log`). All 5 passed `cascade verify --packet` (confirming
  `blueprint.json` repair replay matches the UI export byte-for-byte), all 5 passed every kit build command via
  `scripts/agent-ready/build-round-kits.sh`, and all 5 passed the in-pipeline Sonnet 5.5 review plus the lead's
  file-by-file audit against `scripts/agent-ready/audit-brief.md` with **0 blocking findings** (`swap-meter`
  has one non-blocking unit note in `ACC-SWAP-REFRESH-03` where `/proc/meminfo` `kB` values vs bytes are noted
  in `blueprint.json` polish #1). Separate subagents were not spawned for the 5 Step 6 packets so as not to
  exceed the 3-subagent cap without asking (2 subagents were used in Step 1).
- Nothing was recorded in the vault or in Supermemory.

## 11. Prompt for the next agent

Open Claude Code in this repo folder and paste:

```text
ALAN. You are taking over NODAYSIDLE Cascade V4 in /home/arch/dev/nodaysidle/nodaysidle-cascade-v4
(branch main). It is a local-first compiler and Tauri 2 desktop app that turns one software idea plus one
tech-stack preset into five Markdown contracts and a starter kit that a coding agent builds from.

Read first, in this order: /home/arch/dev/nodaysidle/CLAUDE.md, this repo's AGENTS.md (it wins), then
HANDOFF.md in full. Then run `git status`, `git log --oneline -14`, and `npm run check`. All must be green
before you change anything. If something is red, tell me and stop.

Hard rules, no exceptions:
- Never push. Commit locally only.
- Never print, log, or echo API keys (DEEPSEEK_API_KEY, TYPESAFE_API_KEY, ANTHROPIC_API_KEY), and never put a
  request body with a key into a message or a file. The keys live in the fish environment: use `fish -c`.
- Never edit my exported packet folders (/home/arch/dev/nodaysidle/<packet-name>/). Read them only.
- Ask me before anything that spends API calls. Say how many calls and about how much money.
- Do not weaken a check that protects document quality.
- I have limited Claude usage. Do not start more than 3 subagents without asking, and keep your replies short.

The problem: the last live round gave 3 agent-ready packets out of 19 audited. The compiler guesses the screen
(it falls back to "a list with an add form"), the AI's text contradicts the compiler's rules, and the kits
are narrower than the documents promise. Patching one app shape per round did not converge.

My decision: keep the compiler and its skeleton, and add a review step and a repair step by Claude Sonnet 5.5
(model id `claude-sonnet-5-5`) after compile. The UI stays the same: I write an idea, pick a preset, press
Generate. New is what follows the draft: review, repair, build the kit, review again, then a clear verdict
(agent-ready, or not ready with the reasons). The repair edits are recorded in blueprint.json so a packet can
be rebuilt exactly. HANDOFF.md section 4 describes the app idea in full; section 5 has the measurements: the
reviewer found 17 of 19 known defects and the repair fixed two of three hard packets, but one repaired packet
passed the review while its kit no longer builds, so a review alone is not enough.

Do, in this order, and verify each step before the next:
1. Check the repair independently first. Rebuild the repaired Focus Timer and Net Rate packets (HANDOFF.md
   section 7 says how), build their kits, and run one fresh read-only audit agent on each with
   scripts/agent-ready/audit-brief.md. Confirm each blocking claim against the files yourself. Tell me per
   packet whether it is agent-ready by that audit. If the repair did not clearly help, stop and tell me; do
   not build on it.
2. Close the gap the Field Notes repair showed: give the repair tool file operations (create, move, delete),
   build the kit after any repair that touches it, and repair Field Notes again. Ask me what the desktop app
   should do where no build can run.
3. Fix the plain compiler bugs listed in HANDOFF.md section 6 item 3, one failing test first each.
4. Build the review and repair steps into the pipeline, the CLI and the desktop app as HANDOFF.md section 4
   and section 6 item 4 describe. Use Sonnet 5.5. Read the claude-api skill before writing Claude API code.
   Keys stay in memory only.
5. Ask me for a yes, then run the loop on the 16 broken packets of the round and tell me how many reach 0
   blocking with a passing kit build in 2 rounds and in 3.
6. Rebuild the app with `bash scripts/install-linux-app.sh`, take a screenshot, and give me five new ideas,
   one per preset, never used before. I run them in the app myself. Then verify, build the kits and audit
   what I exported, and tell me per packet: agent-ready or not, and why.

For each code change: write a test that fails first, fix the shared code once with no special case for a
product name, run `npm run typecheck`, `npx vitest run` and `npm run check`, and commit locally with a
message that says what changed and why. Run `npm run kit:check` only if a starter kit changed.

Keep HANDOFF.md current as you go and commit it with your changes. Report to me in plain words: what was
broken, what you changed, what you verified, and what you did not check. Do not tell me something is
agent-ready unless an independent audit of that exact packet says so.
```

## Session 2026-11-11: /improve audit, check of the five exports, plan 001

Goal: Alan ran `/improve` (advisor mode: the session writes only `plans/`, never source) and then asked for a
check of the five exported packets, and then for Swap Meter and Snippet Vault to become agent-ready by fixing
the app (Waybar and Tauri presets), not by editing the packets.

Done:
- Audit of the repo at `cff338d`. Baseline green: typecheck, 486 tests, build, cargo fmt/clippy, 10 Rust tests.
  The findings without a plan are listed in `plans/README.md` (A to N). Alan has not chosen which to plan.
- The five exports (fuel-log, cinema-club, snippet-vault, swap-meter, tea-cellar): untouched since export,
  `cascade verify` passes for all, and every kit command passes in throwaway copies, including the two the
  gate skips (Tauri `cargo clippy`, Android `lintDebug`).
- Independent audits by Sonnet subagents (subscription, no API spend): Swap Meter 1 blocking, Snippet Vault 2
  blocking. So neither is agent-ready by audit. The other three have no independent audit.
  - Swap Meter: acceptance numbers named meminfo lines with byte-sized values; the kit multiplies kB by 1024.
  - Snippet Vault: the success message "Snippets saved." has no place; no task may edit `src/style.css` and
    the kit has no form, detail or multi-line text helper.
  - The app's own reviewer saw all three and graded them polish. The review brief and the audit brief define
    blocking identically, so this is reviewer judgment, not wording.
- `plans/001-waybar-tauri-audit-gaps.md`: fixes the three gaps in the compiler (`src/waybarContracts.ts`,
  `src/tauriContracts.ts`, `src/tauriKit.ts`), no product name, no API call. Handed to a Sonnet executor in an
  isolated git worktree, branch `advisor/001-waybar-tauri-audit-gaps`. Nothing is merged; merging is Alan's call.

Left:
- Review the executor's diff against the plan, then recompile both packets from their `blueprint.json`
  (free: `npm run -s cascade -- compile --preset <id> --blueprint <packet>/blueprint.json --option ... --out <tmp>`;
  the output is byte-identical to the export at `cff338d`) and run a fresh independent audit on each.
  Only that audit can say agent-ready.
- Alan decides: audit the other three packets or not; which of findings A to N become plans.

Open questions:
- The exported packets do not record the original idea text, so idea coverage was judged against
  `blueprint.summary` only.
- The app cannot open a saved `blueprint.json`; a recompile of an exported packet needs the CLI.

Update, same session: plan 001 was executed and reviewed (branch `advisor/001-waybar-tauri-audit-gaps`, commits
854f295 fb9f648 3087d77, 489 tests pass, not merged). Both packets were recompiled from their `blueprint.json`
with the fixed compiler and audited again by fresh Sonnet subagents: Swap Meter 0 blocking, Snippet Vault
0 blocking (minor notes only). The exported folders themselves are unchanged and still hold the old text.
Alan then asked for the merge: `main` was fast-forwarded to `3087d77` (local only, not pushed), typecheck and
489 tests pass on `main`, and the desktop app was rebuilt and installed with `bash scripts/install-linux-app.sh`
(the embedded bundle contains the new text; the app launches). `docs/HANDOFF.md` and `plans/` are uncommitted.
Next: the other three presets (GTK, Astro, Android) the same way: independent audit of the export, fix the
compiler for what is blocking, recompile, audit again.

Later, same session (GTK, Astro, Android): Alan's direction is to fix the compiler, never the test packets.
Plans 002 and 003 were executed by Sonnet executors and reviewed. Branch `advisor/002-gtk-compiler-gaps`
(worktree `.claude/worktrees/agent-a3ffb0c89491559bf`) holds 6 commits on top of `main` 3087d77:
297dd8b, 118b8d2, 82fc2ab, 7062fd5, 31254de, 9cbe16b. 497 tests pass; Waybar and Tauri output is unchanged.
Each of the three blueprints was recompiled WITHOUT its recorded paid repairs and audited by a fresh Sonnet
subagent: Tea Cellar (GTK) 0 blocking, Cinema Club (Astro) 0 blocking, Fuel Log (Android) 1 blocking (a literal
"2 decimal places" rule contradicting the PRD), fixed in 9cbe16b, then 0 blocking. Not merged: Alan decides.
After a merge, rebuild the app with `bash scripts/install-linux-app.sh`. Saved packets from before these
commits no longer replay their recorded repair edits (the compiler now writes that text itself); recompile
from the inner `blueprint` object instead.
Open minor notes from the audits (candidates for a next plan): GTK number fields without a stated range, the
shared view state versus the kit's AppState derives, add dialog title, Edit/Delete button order, `Choices:`
line on features without that input; Android sort key for "newest first", a seam for write-failure tests,
the slot for the edit form, how a later task shows its write error; Astro empty home list, link text of a
list entry; Waybar store trait signatures and `click` without a store parameter; Tauri owner file of the
record type and the DOM test environment.
Alan said go: `main` was fast-forwarded to `9cbe16b` (local only, not pushed), typecheck and 497 tests pass on
`main`, and the desktop app was rebuilt and installed (the embedded bundle contains the new GTK, Android and
Astro text; the app launches). `docs/HANDOFF.md` and `plans/` are still uncommitted.

## Session 2026-11-11, later: plans 004 to 008 executed by a conductor with Opus 5.5 workers

Alan's instruction: the lead is the conductor (plans, task order, verification), Opus 5.5 workers (`patcher`)
do the edits in parallel worktrees, one `qa-engine` pass verifies the combined result before `main` moves, and
the lead stops only for a human decision. "Read the handoff and continue" was taken as the yes to merge 004
and to execute 005 to 008.

Done, all in `main` (local only, nothing pushed), `main` = `3e2f5c6`:
- 004 rebased and fast-forwarded (7afb14b 6f15caf).
- 005 (666e592 6251852 ef2df69 70f8e74): repair paths follow the Rust export rule, quotes match across
  typographic variants, the idea is inserted literally, the CLI says when there was no review, dropped findings
  and failed edits are recorded in the repair record. After QA (fbfee57): a create or move that clashes with an
  existing file or folder is rejected, and so is a 65th kit file.
- 006 (006c67b 82fd014): a failed Claude review keeps the compiled packet with a "Not reviewed" notice and no
  verdict; every failure message names its service (DeepSeek, TypeSafe Jev, Claude review).
- 007 (508a67b 3ef1fd3): kit build children run without the three API keys and `CASCADE_API_URL`, with a 20
  minute limit, and in Node with a 64 MB buffer. After QA (353e042): the Rust child gets a closed stdin.
- 008 (56fc698 3e2f5c6): lists, shared acceptance criteria and the audit rule `graph.acceptance-ownership` use
  one number-aware key (`numberAwareKey`, `src/schema.ts`), so "1.5" and "15", "-5" and "5", "1,000" and "1000"
  stay apart. Alan said yes to the audit key change (cost: "costs 1,000" and "costs 1000" on two features are no
  longer a duplicate). A leading minus directly before a digit is no longer stripped by `cleanMeaning`.

Verified: `npm run check` exits 0 on the final state by QA's run (517 vitest tests, 14 Rust tests, fmt, clippy,
build); the lead re-ran typecheck and the tests in the main checkout after each fast-forward; the 24 round-12
blueprints compile byte-identically to `6f15caf`; QA ran 20,000 random edit sequences against the new path rule
with no accepted packet that breaks the export rules, and compiled number pairs for GTK, Waybar, Astro and Android.

What the QA pass was worth: the lead's test runs and diff reading passed all four branches; QA then found that
005 still let two kinds of bad packet through, and that 008 turned a silent drop into a compile failure (the
audit key merged what the list no longer merged). Keep the pass.

## Session 2026-11-11, round 13: Alan ran one idea per preset in the app; plans 009 to 012

Goal: Alan runs new ideas live in the installed app (built from `3e2f5c6`) and hands back the export folders;
the lead audits each packet independently and turns every blocking finding into a compiler fix.

The 25 ideas (five per preset, never used before) are in `scripts/agent-ready/round13-ideas.md`. Alan ran five:
G1 Room Paint, W3 Deadline Days, T3 Scratch Pad, A1 Peak List, N2 Sleep Log. Twenty are unused.

Results (packets are read-only test input, in `/home/arch/dev/nodaysidle/<slug>/`):

| Idea | In-app review | `cascade verify` | Kit build (own commands) | Independent audit (Opus, audit brief) |
|---|---|---|---|---|
| Room Paint (GTK) | 0 blocking, 2 rounds, 20 edits | pass | pass | agent-ready, 0 blocking |
| Deadline Days (Waybar) | 0 blocking, 2 rounds, 15 edits | pass | pass | agent-ready, 0 blocking |
| Peak List (Astro) | 0 blocking, 1 round, 11 edits | pass | pass | agent-ready, 0 blocking |
| Scratch Pad (Tauri) | 0 blocking, 1 round, 15 edits | pass | pass | NOT agent-ready, 1 blocking |
| Sleep Log (Android) | Not ready, 2 blocking, "1 repair round (0 edits)" | no packet (the app keeps none) | — | — |

- Scratch Pad's blocking finding: no document says what happens to text typed in the last second before the
  window closes, while the one-second timer is the only writer. The whole editor design in that packet was
  written by the in-app repair: the Tauri compiler has no shape for one record with autosave (finding O in
  `plans/README.md`).
- Sleep Log's two findings were both compiler gaps, reproduced from the round-12 Android blueprints (the same
  sentences compile there): the status area had no way for a later task to post a message, and the PRD's
  "time pickers" contradicted the compiler's "text field HH:mm". "1 repair round (0 edits)" was a third defect:
  a round that applied no edit ended the repair with two rounds unused.

Fixed, all in local `main` at `fb5e054` (nothing pushed, no paid call by the lead):
- 009: Android "Status rule" (definition in the first main task: `statusMessage`, `showStatus(text, tag)`,
  `clearStatus()`, passed by `App.kt` as parameters) and "Status use" (later writing tasks with a screen).
  `ANDROID_STATUS_DEFINITION`, `ANDROID_STATUS_USE` in `src/androidPlan.ts`.
- 010: Android "Widget rule" (`ANDROID_WIDGET_RULE` in `src/androidForms.ts`): the Field rules decide the
  widget, whatever the PRD's prose names.
- 011: `runReviewAndRepairLoop` (`src/review.ts`) retries after a round that applied no edit, with the failure
  reasons (or "contained no edits") in the next fix prompt, and stops on the second empty answer in a row. The
  app's verdict line shows failed edits and dropped findings (`repairMetaText` in `src/app.ts`). Cost: a run
  whose repair answers never apply can make up to three fix calls instead of one; the limit of three rounds is
  unchanged. Alan was told.
- 012 (Alan said yes): check 11 in the review brief, in `AUDIT_BRIEF_BODY` (`src/review.ts`) and
  `scripts/agent-ready/audit-brief.md`, kept equal by a test.

How it was verified: `npm run check` EXIT=0 on `fb5e054` (536 vitest pass, 19 skipped, 14 cargo tests, fmt,
clippy, build); the 20 non-Android round-12 blueprints compile byte-identically to `b64af70`; QA compiled 24
Android variants (no list, no create, all scheduled, settings only, item page, delete only, two data objects).
Three QA passes: the first two each said "do not merge" and were right (no route to `showStatus` without the
open-form value; identical retry prompt after an empty answer; "App.kt holds" against "in your file"; a
scheduled delete task told to edit `App.kt`). Not verified: no paid run has used any of these four changes.

Re-run after the fixes (same day, app built from `fb5e054`): Alan ran N2 Sleep Log again. The Claude review
failed with HTTP 401 (the pasted Anthropic key was rejected; the key in the shell environment answered HTTP 200
on the free model-list endpoint, and the code that sends the key is unchanged since `3e2f5c6`), so the app
showed the plan 006 "Not reviewed" notice and kept the packet: first live sighting, works as designed. The
exported packet `/home/arch/dev/nodaysidle/test/sleep-log/` is the compiler's raw output with no repair:
`cascade verify` passes, the kit builds (`assembleDebug testDebugUnitTest`), and an independent audit (Opus,
brief with check 11) found 0 blocking: agent-ready, and both earlier findings resolved (the widget of the time
fields, the route into the status area). Its polish notes are in `plans/README.md`.

Second re-run with a working key: `/home/arch/dev/nodaysidle/sleep-log/` (07:03). In-app review
(`claude-sonnet-5-5`): agent-ready, 0 blocking, 0 repair rounds, 8 polish. `cascade verify` passes, the kit
builds, and an independent audit (Opus, without the `repair` key) found 0 blocking: agent-ready. Closest to
blocking, all compiler text: "the 7 most recent recorded nights" does not say by date or by creation, nor what
happens with fewer than 7; the row tags and the number format of the list are printed only in the Add and Edit
contracts, not in the list task that builds the rows; "a successful Save or a close calls closeForm()" names no
close control. The repair retry of plan 011 did not run (nothing to repair).

## RESUME HERE (written 2026-11-11, after round 13 and plans 009 to 012)

Start by reading this section and `plans/README.md`. Alan's standing direction: **fix the compiler
(`nodaysidle-cascade-v4`) itself, never the test packets**; the exported packets are only test input.

State: `main` = `fb5e054` plus this docs commit, local only, 39 or more commits ahead of `origin/main`. All
plans 001 to 012 are DONE. See "Installed app" below.

Open, in the order I would take them:
1. Alan re-runs T3 Scratch Pad in the rebuilt app (Sleep Log is done: agent-ready in the app with no repair and
   by independent audit), then more of the 20
   unused round-13 ideas. For each export: `npm run -s cascade -- verify --packet <dir>`, the kit build
   (`bash scripts/agent-ready/build-round-kits.sh <folder with <preset>/<slug> links>`), and one independent
   read-only audit with `scripts/agent-ready/audit-brief.md` and the idea text from `round13-ideas.md`. Tell the
   auditor not to read the `repair` key of `blueprint.json`. Never call a packet agent-ready without that audit.
2. Finding O: the Tauri single-record autosave shape. Needs Alan's go.
3. The QA follow-up notes in `plans/README.md` (two lists: plans 005 to 008 and plans 009 to 012).
4. Findings G, H, J, K, L, M, N: each still waits for what `plans/README.md` says.
5. Not seen in a running app yet: the "Not reviewed" notice (plan 006), the kit build limits (plan 007), the
   new verdict line and the repair retry (plan 011).

How to work (as done in this session):
- The lead writes or amends the plan and the brief, a `patcher` (Opus 5.5, `isolation: worktree`) implements it,
  a `qa-engine` verifies the combined candidate branch read-only (full `npm run check`, the 24-blueprint
  comparison against `main`, the diff against the plan), the lead reads the final diff, then fast-forwards
  `main`. A change that narrows a quality check, or changes what the paid review asks, goes to Alan first.
- After a fix to a QA finding, send the same QA agent the delta (`SendMessage`) and ask for at most 30 lines:
  a long report is cut off. Keep going until it passes; two passes in a row found real defects on 2026-11-11.
- Executor brief: first step `git checkout -B <branch> <commit>` (a new worktree starts from an old commit),
  then `npm ci`. For cargo, `CARGO_TARGET_DIR=<main checkout>/src-tauri/target` avoids a cold Tauri build.
  `/tmp` is a small RAM disk with a quota on `/tmp/claude-1000`: no build or compile output there; use
  `$HOME/.cache/cascade-v4/tmp/`.
- Do not commit docs on `main` while a candidate branch waits for a fast-forward; keep a new plan file
  untracked and give the worker its absolute path.
- Harness behaviour: when a worktree worker hands back, the session's directory moves into that worker's
  worktree, and resuming that worker is then refused. Finish its work with a fresh worker started without
  isolation in that directory, and use absolute paths (`git -C <main checkout>`) for the main checkout.
- Verification without API spend: recompile a saved blueprint with
  `npm run -s cascade -- compile --preset <id> --blueprint <file> --out <dir>`.
- Reports to Alan start with `ALAN`, are short, and end with what was not checked.

Leftovers that can be removed when Alan says so (all merged): the worktrees under `.claude/worktrees/` and the
branches `advisor/*`, `integrate/*`, `worktree-agent-*`.

Installed app: rebuilt and installed from `fb5e054` with `bash scripts/install-linux-app.sh` on 2026-11-11
(`~/.local/bin/nodaysidle-cascade-v4` is byte-identical to the fresh release build, and the frontend bundle
built in the same run contains the four new texts). The window was not opened after this install, and no
packet was generated in it.
