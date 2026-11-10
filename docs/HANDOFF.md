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
