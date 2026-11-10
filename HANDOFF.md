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

### RESUME HERE — round 12 live run failed at the intake stage (2026-11-10)

**Status after the intake-repair session (2026-11-10, Fable 5.2). Read this first; the older text below it is the
original brief.**

Done (one commit, failing-first tests in `tests/round12-intake.test.ts`, 454 tests pass):
- **Failures say why.** `provider.http-error` now reads "The provider rejected the request. HTTP 429 (rate limit
  reached; wait and retry). Provider code: rate_limit_exceeded." (`providerIssue`, src/pipeline.ts; the CLI provider
  now forwards `error.code` too, and only allowlisted codes survive `normalizeProviderFailure`). `jev.intake-rejected`
  now reads "... Viability score 0.41; it needs 0.65." plus the preset Jev would pick when it differs
  (`jevIntakeRejectedIssue`, src/jev.ts). Jev returns numbers and one preset id, never prose, so there is no text
  reason to show.
- **Bar-only keys are not offered outside Waybar.** `providerSchemaFor(presetId)` (src/schema.ts) removes
  systemSource, thresholds, labelTemplate, unit and valueDecimals from the response schema of the four other presets.
  Cause of the Tip Split failure: the one shared schema made the AI fill `valueDecimals` for "two decimals". The
  capability checks (capability.waybar-label, capability.system-source) stay for hand-made blueprints.
- **`settleBlueprint`** (src/compiler.ts) runs on the parsed answer before any check (src/pipeline.ts
  `compileProviderText`). Waybar: identical labelTemplate/unit/valueDecimals or thresholds copies stay on one feature
  (`settleWaybarLabel`, src/waybarContracts.ts): the first non-click feature that only shows data, else the scheduled
  measuring feature. Copies that differ are untouched and rejected as before. All presets: a `scheduledNotification`
  with no schedule is set to null when no feature uses the notifications need.
- AGENTS.md states these exceptions to "never drop provider content".
- `npm run check` green (454 tests, clippy, cargo test). No kit changed, so `kit:check` was not rerun. App rebuilt and
  installed from f2f4f5c with `scripts/install-linux-app.sh`; an app window opened before 13:50 on 2026-11-10 is the
  old build and must be closed and reopened. Nothing pushed.

Not done / open:
1. **Tauri HTTP status is still unknown.** Nothing records it; it needs one re-run from the rebuilt app. Request size
   is ruled out: the Tauri request is the second smallest (19,150 instruction chars; Waybar is 30,736 and passed
   step 02). Likely transient (429/5xx) or key/balance (401/402). Do not change anything for it before Alan reports
   the status.
2. **Jev rejection (Astro):** needs one re-run to read the score. Suspect to check with the score in hand: the
   viability question asks for "one coherent application" and the Astro ideas are websites. Do not lower
   `JEV_VIABILITY_THRESHOLD` or reword the question without Alan's yes.
3. **No live run yet.** The fixtures are passing blueprints changed into the reported shape; the real failing answers
   were never saved. A live run must confirm Disk Free and Tip Split pass. Ask Alan before any paid run.
4. Label owner limit: with several show-only Waybar features the first declared one gets the label lines (no declared
   field tells a label feature from a tooltip feature). Watch for it in the Disk Free and Load Meter audits.
5. Not built: showing in the UI that a copy was settled; the Jev transport failure still hides its HTTP status.

**Live check of the intake fixes (2026-11-10, CLI, 4 paid runs, Alan said yes):** all four reached Gate Clean on the
first try, `verify --packet` says Verified, and every kit builds (`build-round-kits.sh /tmp/v4-round12b`, all steps 0).
**0 of 4 are agent-ready.** Audits by one read-only agent per packet; every blocking item below was confirmed by the
lead against the packet files. All are document-stage classes on new idea shapes, none from the intake fixes.

| Packet (`/tmp/v4-round12b/<preset>/<slug>`, tmpfs: gone after a reboot) | Blocking | Class |
|---|---|---|
| Waybar Disk Free | 1 | **Label decimals vs acceptance text**: valueDecimals 1 (label line, kit `format_in_unit(.., "GB", 1)`) but the three label acceptance signals say "3.67 GB" / "10.00 GB", and the Units rule says "a size is shown with 2 decimals ... no acceptance criterion changes them". Fix: a check that sends back a label example whose decimals differ from valueDecimals, and a Units rule that yields to a declared valueDecimals (the "3.67 GB" example in the provider note is the likely source). The AI returned ONE feature, so `settleWaybarLabel` was not exercised live. |
| Android Tip Split | 2, one cause | **No data object at all still gets the list prompt**: `noListOnScreen` (src/compiler.ts:1333) needs a feature that creates records, so with zero dataObjects TASK-03 is told "your focused test seeds records through the repository and asserts only the list" and to build status / empty-state / write-error slots. Fix: zero data objects is "no list"; the first main task builds its own screen and its test drives its own acceptance. Polish: Room in kit and Locked Stack, "Room database opens on first use", SavedStateHandle vs "nothing survives", no rounding rule, no field contract for entered values that belong to no data object. |
| Tauri Budget Book | 3, two classes | (a) **Read-only view on row selection has no owner**: PRD/TRD and ACC-EXPENSE-LIST-02 say "Selecting a row shows that expense read-only with a Delete button"; TASK-04 says "No detail view is built" and TASK-06 mounts Delete per row. (b) **A derived-totals feature is compiled as a list filter**: "Monthly category totals" (read only, narrowsListBy none) is told to mount in "the filter area or the list region", to "narrow or reorder" with store.set, and "has no failure path" while PRD/TRD require a totals-could-not-be-loaded message; TASK-04 gets a phantom query + match rule. Polish: money rule (two decimals, cents), current month must name the `date` field not created_at, number/date inputs unstyled in kit style.css. |
| Astro Green Kitchen | 3 | **Tag-page surface has no rules**: (a) no page links to /recipes/tags/<type> and TASK-04 says "Modify no existing file" while kit README says the nav links every route; (b) nothing says what a meal-type page with no recipes shows (seed has one breakfast entry; the three-page set itself is stated); (c) **text-list fields** render as one comma-joined line in kit `[slug].astro` while the PRD asks for an ingredients list and ordered steps, with no test rule for a list. Polish: final validation runs `npm test` before `npm run build`. |

Still unknown after this run: the Tauri HTTP status (Budget Book got no HTTP error, so it was not the request) and the
Jev score of the rejected Astro idea (Green Kitchen passed Jev). Alan never said which Tauri/Astro ideas failed; Budget
Book and Green Kitchen (first of each) were used. The other 21 round-12 ideas have not been run.

Suggested fix order (each: failing test first with a fixture from the packet's blueprint.json, then the shared code):
1. Tip Split: zero data objects = no list (small, one predicate plus the prompt branch).
2. Disk Free: decimals check + Units rule.
3. Budget Book (b): derived read-only feature gets its own host, not the filter area.
4. Budget Book (a): row-selection read-only view (decide: build it, or send the prose back for repair).
5. Green Kitchen: tag-page nav link + empty state, list-field rendering (kit change: needs `npm run kit:check`).

**Document-stage fixes after that live check (2026-11-10, Alan said go; tests in `tests/round12-docs.test.ts`):**

| Packet | Fix (shared code, no product names) | Re-audit |
|---|---|---|
| Tip Split | `androidNoData` (src/compiler.ts): zero data objects = no list; `noListSlotsSentence(.., noData)` gives one section per feature, and src/androidPlan.ts tells the first main task to drive its own acceptance with no repository. Android only: Tauri/GTK with zero data objects are untested. | 0 blocking |
| Disk Free | `capability.waybar-label-decimals` (a label example whose decimals differ from valueDecimals) and `capability.waybar-class-example` (an example whose class disagrees with the thresholds for its reading; only "N bytes" or the one number shown with a non-scaling unit, rates unchecked), both in src/waybarContracts.ts; the Units rule yields to a label that states its decimals; provider note says "never 3.67 GB". | 0 blocking (third audit; the second found the wrong class) |
| Budget Book | (b) `isTauriSummary` (src/compiler.ts): a later read-only main feature with narrowsListBy none gets a "summary" host, writes nothing to the store, one load-failure rule; Tauri filters now need narrowsListBy != none (`hasFilterFeature`). (a) Alan's decision: send the wording back. `capability.tauri-no-detail-view` (src/capabilities.ts) fires when no feature edits a record and a feature text names a view of one selected record ("read-only view", "selecting a row shows", "open one to view"). Root cause was our own Tauri provider note ("a delete starts from the record's read-only view"), now scoped to products with an edit feature. | 1 blocking left by the re-audit (the userOutcome "can open one to view it"); pattern extended, recompiled; the new packet differs from the audited one only in that sentence and one "detail view" clause (sentence diff, kit identical). No third audit. |
| Green Kitchen | `astroTagPages` (src/astroWeb.ts): a tag page over the collection's one choice field gets a kit shell (`tagPage`, src/astroKit.ts: one page per option, "No entries yet."), nav links per option, a route line stating the page set, and a task prompt that starts from the kit shell. Text-list fields render as `<ol><li>`; the seed has two items; the test-reading rule covers a list field. | 0 blocking |

Two of the four (Disk Free, Budget Book) were recompiled from blueprints repaired by hand exactly as the new check
messages ask (scratchpad copies; the fixtures in tests/fixtures are the unrepaired provider answers). **A live run must
confirm the provider makes those repairs in its one repair request**: Disk Free can need three kinds of fix at once
(decimals, class) and Budget Book two features.

Verified at 6938595: `npm run check` green (467 tests, clippy, cargo test), `npm run kit:check` 18/18, all four recompiled
kits build with their own commands (`build-round-kits.sh /tmp/v4-round12c`, every step 0), `verify --packet` Verified on
each, app rebuilt and installed with `scripts/install-linux-app.sh` (15:09; a window opened earlier is the old build).
Nothing pushed.

Polish backlog from these audits (not fixed): Android no-data boilerplate (Room in Locked Stack/kit, "Room database
opens on first use", SavedStateHandle vs "nothing survives", relaunch check "data the app saved", "shared view state
(the loaded records ...)" for one feature), no rounding rule for a calculator; Tauri money rule (two decimals, cents,
row format), current month must name the `date` field, number/date inputs unstyled in kit style.css, ACC "no category"
unreachable with a picker, unquoted failure texts; Astro final validation runs `npm test` before `npm run build`, list
items cannot contain a comma (flow list), both seed lists hold the same items, /teas/ example route, long-text and MDX
boilerplate; Waybar click boilerplate with no click feature, "two hooks", `{app-id}` placeholder, tooltip exact text,
feature function signature, kit units.rs comment still says sizes are fixed at 2 decimals, AGP build-tools 36 vs docs 37.

Next: (1) with Alan's yes, run the 25 round-12 ideas live (`fish scripts/agent-ready/run-round.fish /tmp/v4-round12`)
and audit; (2) still unknown: the Tauri HTTP status and the Jev score of the rejected Astro idea.

**Original brief.** The next session's job is to make the *intake stage* (Jev check, AI provider call, blueprint
checks + the one repair) stop failing on ordinary ideas. The *document stage* is in good shape: round 11 ended 5/5
agent-ready (see the next block). Repo state: `main` at the commit after 7c8b06e, clean, 441 tests pass, `npm run check`
green, kit:check 18/18, app installed from 7134db7 (`scripts/install-linux-app.sh`). Nothing pushed.

Alan pasted the ideas from `scripts/agent-ready/run-round.fish` (round 12) into the installed app. Results he reported:

| Preset | Idea | Where it stopped | What the UI showed |
|---|---|---|---|
| Waybar | Disk Free (2nd Waybar idea) | step 05 (Jev integrity), blueprint checks after the one repair | First response failed capability.waybar-build-order, waybar-label-template, waybar-label-unit, waybar-thresholds-owner. After the repair still: "Exactly one feature sets labelTemplate … 5 do" (path `features`) and "One module has one severity: declare thresholds on the single feature that shows the reading, not on several" (`features[2].thresholds`). |
| Android | Tip Split (5th Android idea, a calculator with no storage) | step 05, after the one repair | First response failed semantic.initial-value-type and semantic.notification-schedule (the AI invented a scheduled notification for a calculator). After the repair: capability.waybar-label on `features[4].valueDecimals` ("sets bar-module label fields … set valueDecimals to null"): the AI used valueDecimals for "two decimals". |
| Tauri | not stated (ask Alan) | step 02 | `$provider` provider.http-error: "The provider rejected the request with a safe HTTP failure classification." The HTTP status is recorded (`ProviderFailure.http_status`, src-tauri/src/provider.rs:252 `classify_http_failure`) but the UI does not show it. |
| Astro | not stated (ask Alan) | Jev step | `$jev` jev.intake-rejected: "Jev did not confirm this idea as viable, so no provider request was made." Threshold `JEV_VIABILITY_THRESHOLD = 0.65` (src/jev.ts:23); the UI shows no reason or score. |

Diagnosis (lead's view, verify before acting):
1. **The checks reject what the compiler could fix itself.** Label/threshold ownership on Waybar and bar-only fields
   (labelTemplate, unit, valueDecimals, thresholds) on non-Waybar presets are deterministic: the compiler knows which
   feature shows the reading (systemSource ≠ none / the bar surface) and that non-Waybar presets ignore bar fields. The
   AI gets ONE repair, and it keeps copying these fields. Prefer normalizing in `src/compiler.ts` normalization (drop bar
   fields on non-Waybar presets; keep labelTemplate/unit/valueDecimals/thresholds only on the one reading feature on
   Waybar when the copies are identical) over rejecting. Keep a rejection only when the copies disagree.
   Rules: src/capabilities.ts:41-49 (capability.waybar-label), src/waybarContracts.ts:160-185 (label-template,
   thresholds-owner) and the provider note at src/waybarContracts.ts:261. The schema comments for these fields
   (src/schema.ts:86-95) say "Only a bar-module preset uses it", but check whether the provider prompt for a non-Waybar
   preset even mentions them; if not, either omit those keys from the non-Waybar response schema or tell the AI to leave them empty.
2. **A scheduledNotification with no schedule** (semantic.notification-schedule, src/schema.ts:766) on an idea that never
   asks for notifications: normalize it to null when no feature uses the notifications platform need, instead of rejecting.
3. **provider.http-error**: first surface the HTTP status (and the provider's safe error code, never the key or the
   request body) in the UI issue message, then reproduce. Candidates: rate limit (429), auth (401/403), request too
   large (400/413) since the instructions grew this session, or a timeout. Do not guess-fix before you see the status.
4. **jev.intake-rejected**: surface Jev's score and reason in the UI issue; then decide with Alan whether the idea text,
   the threshold, or the Jev prompt is wrong. Do not lower the threshold without his yes.
5. Did today's changes cause any of this? The rules that fired all predate today. Today changed provider instructions
   in src/schema.ts (initial value vs choice, choice list placement) and src/waybarContracts.ts (peak/reset notes and two
   new checks: capability.waybar-process-memory, capability.waybar-reset-at-start; semantic.choice-not-entered in
   schema.ts). None of those fired. `git diff 889bf7a..HEAD -- src/schema.ts src/waybarContracts.ts` shows them.

How to work (proven this session): one failing test first per class, using a fixture shaped like the failing AI
response (tests/fixtures/*.json is the inner `blueprint` object; tests/round11-*.test.ts show the pattern), fix the
shared code, `npm run typecheck`, `npx vitest run`, `npm run check`, `npm run kit:check` only if a kit changed (keep
>= 2 GB free in /tmp), commit locally, rebuild the app, then re-run the failing ideas. Independent classes can go to
parallel worktree subagents (one class each, scoped files), merged one at a time by the lead.
The CLI path that matches the app: `npm run -s cascade -- generate --preset <id> --idea "<text>" --out /tmp/<dir>` (needs
DEEPSEEK_API_KEY and TYPESAFE_API_KEY in the fish environment; costs API calls; ask Alan before running the 25-idea
script; never print the keys).

Done criteria for this block: each of the 25 round-12 ideas either reaches a gate-clean packet or stops with a clear,
deliberate capability rejection (an idea the preset truly cannot do, e.g. clipboard watch where unsupported). Then audit
the packets in parallel (scripts/agent-ready/audit-brief.md) as in round 11.

### Round 12 plan (25 ideas, 5 per preset)

**Round 11 closed (2026-11-10): all 5 packets agent-ready after the class fixes.** Four parallel worktree agents fixed
the classes (merged dc3d950, b7bc019, a0ff347, a44975d); re-audits found 5 more blocking defects, all fixed (f241482,
7134db7): kit refresh_with writes the severity class, capability.waybar-reset-at-start, semantic.choice-not-entered,
bare Astro enum seed, Tauri filter query value stated in both tasks, Waybar kit cache test uses refresh_with hooks.
Final state: Book Shelf 0, Step Goal 0, Board Game Club 0, Reading List 0, Temp Watch 0 blocking. Reading List and Temp
Watch passed on blueprints repaired by hand exactly as the new checks' messages ask; a live run must confirm the provider
makes the same repair. 441 tests pass, npm run check green, kit:check 18/18 + Waybar kits rebuilt after the kit change.

**Round 12:** `fish scripts/agent-ready/run-round.fish /tmp/v4-round12` (25 g lines, five per preset, each a new screen or
data shape: due lists, streaks, file import, countdown + notification, settings only, battery/disk/net/load sources,
weather API, monthly totals, tags + open link, tray countdown, one entry per day, clipboard watch, grouped and dated
Astro pages, two linked collections, check-off + bulk clear, scheduled notification, a calculator with no storage).
Audit with parallel agents (one per packet, scripts/agent-ready/audit-brief.md), verify blocking claims, group classes,
fix classes with parallel worktree agents (one class per agent, scoped files), merge, re-audit only the failing packets.
Expect rejections for ideas the presets cannot express (clipboard watch, tray on some presets): a clear rejection
message is a pass, a contradictory packet is a fail. Keep >= 2 GB free in /tmp before Android kit builds.

### Live round 11 (closed) (started 2026-11-10)

Round 10 is closed (results below). Round 11 runs from the app rebuilt at e406560 with new ideas, same per-packet
steps as round 10 (verify, copy to /tmp/v4-round11/<preset-id>/, build-round-kits.sh, one read-only audit agent, tell
Alan plainly). Ideas are the five g lines in scripts/agent-ready/run-round.fish.

| # | Preset | Idea | Exercises | Export path | Status |
|---|--------|------|-----------|-------------|--------|
| 1 | linux-wayland-gtk4-desktop | Book Shelf | export button on GTK (fix #1 untested there), rating 1-5 | `/home/arch/dev/nodaysidle/book-shelf` | **done: NOT agent-ready** (verify ok, kit fmt/clippy/test ok; audit 8 blocking. Fixed in a74b661: export mounted in add-entry + got add Form facts (also Android exports). Still open, GTK compiler gaps: (a) **GTK has no document-export path**: storage "document" becomes a SQLite table + store trait + validate fn; no serializer, no portal save (FileChooserNative; kit gtk4 0.11 lacks v4_10 so no FileDialog), no write_atomic, no CSV format (added as RFC 3339? RFC 4180 quoting, line ending), cancel rule, or PermissionCoordinator API (choose_save_path -> Option<PathBuf>); (b) **flag with initial is app-set** ("never typed by the user") while PRD/ACC put a favorite toggle on the Add form (provider invented it; idea marks favorite separately) — decide: drop toggle from PRD via a check, or make a flag with initial an input; (c) **GTK ignores a numeric choice list**: Rating 1..5 initially 3 is a choice in PRD but a typed GtkEntry in TASK-05. Polish: Time rule on tasks that read no clock, flag shown twice (row label + toggle), validate vs added stamp, metainfo summary truncated, permission dir sets differ) |
| 2 | linux-hyprland-waybar-module | Temp Watch | temperature source, max-since-start state, provider notes (5be0c05) | `/home/arch/dev/nodaysidle/temp-watch` | **done: NOT agent-ready** (verify ok, kit ok, generated first try; audit 3 blocking. (a) **compiler contradiction, confirmed**: provider note "A maximum or minimum kept since the module started ... reaches the click action only through the cache file" (src/waybarContracts.ts WAYBAR_PROVIDER_NOTES) vs the "Cache and store" note (click reads the stored record, never the cache); packet says both (PRD x4, TRD x1) and stores `peak` as a record field. Fix: one rule, peak is a stored field reset at --service start, refresh reads it (read op) and stores max; --action refresh keeps it; add an ACC for 60/80/70 -> 80. (b) refresh has create only, so it cannot read the stored peak; no state location, no rule for --action refresh. (c) temperature stored as whole-number but severity must compare the unrounded value (70.4 -> warning) — store number (REAL) when thresholds apply, or compare the stored value. Polish: "12.0 stays 12.0" at 0 decimals (again), highest thermal zone may not be the CPU (k10temp only in hwmon), non-goal vs kit --set refresh_seconds, size/HTTP/reset boilerplate, TASK-01 says two hooks not three) |
| 3 | tauri2-rust-typescript-desktop | Reading List | export actions host, status choice set, filter, SubmitResult | `/home/arch/dev/nodaysidle/reading-list` | **done: NOT agent-ready** (verify ok, kit 7/7; round-10 fixes worked live: status choice list named like the field, CSV in "actions", SubmitResult/async run in kit, no mangled email. Audit 3 blocking, one class: **a field with an initial value AND a choice list on the add feature** — TASK-05 says "build each declared choice list as a picker ... (status ... initially unread)" and in the same prompt "The app sets status = unread itself on create (no input)". Same class as Book Shelf favorite (flag with initial = app-set vs PRD toggle). Decide one rule: a field the add feature offers as a choice is an input that starts at the initial option; app-set only when no create-feature choice names it. Also: provider used "edit" for "changes its status", so title/link become editable and TASK-06 says "replace only the field your behavior changes" (edit vs mark-update ambiguity). Polish: filter "All" encoding in query, form vs banner for save errors, load error + empty state both shown, CSV line ending, created_at shown in edit form, Choices line on the list feature, cancellation/delete/TZ boilerplate, existing_file unused, contract_tests.rs content) |
| 4 | astro-web | Board Game Club | weight light/medium/heavy as z.enum, Design System tokens | `/home/arch/dev/nodaysidle/board-game-club` | **done: agent-ready** (verify ok, kit 6/6; fixes #2 and #4 confirmed live: provider declared the weight choice list, kit z.enum + seed "light", TRD "one of"; Design System = global.css. Audit 0 blocking / 13 polish: /teas/ example route again, "entry title" vs name, seed body text renders publicly, meta description = weight, name label rule vs h1, sort comparator, player range not representable, blueprint.json still says weight text, README seed name, Application ID, Signing vs Installation, cancellation boilerplate, .mdx without the mdx integration) |
| 5 | android-kotlin-compose | Step Goal | daily goal setting in the actions area, entry form | `/home/arch/dev/nodaysidle/step-goal` | **NOT agent-ready, 6 blocking** (verify ok; kit BUILD SUCCESSFUL once /tmp had >= 2 GB free: the first failure was a full tmpfs, not the kit). The data side is clean: today's entries summed, Clock-stamped date, create/read only, Owner Map = TASKS. New class **"no list on screen"**: records are create/read only, the PRD shows no list (Non-Goal "history beyond today"), yet (a) TASK-04, the goal *setting* and the first main task, is told to build the list, empty-state, Add toggle "add-entry" and an add/edit form shell, and its focused test "asserts only the list" instead of its own ACC-SET-DAILY-STEP-GOAL-01..03; (b) "Expose exactly these named slots ... no others" leaves no slot for the goal field/Save goal/current goal or for TASK-05's today total and Goal reached text, and TASK-05 mounts only into "the add-entry control"; (c) the TRD steps form is "an inline section ... above the list", opened by a toggle, and "a successful Save closes the form", while the PRD keeps the field and 'Add steps' always visible. Plus Android settings gaps: (d) the goal DataStore key has no type or default, and nothing says what shows with no saved goal; (e) the goal setting gets no Form / Field rules / Rejection (no regex, messages or testTags). Polish: the total label is unnamed, the min-0 message cannot be reached under the digits regex, launch-check list/cleanup clauses for create-only records, WorkManager/Worker wording with no schedule, denied/cancelled + settings-row boilerplate, and the goal's own write-failure message |

Watch: does the provider now declare a choice list for a fixed stored value (Reading List status, Board Game weight)?
Does the export button get the "actions" host on GTK and Tauri? Does the goal mount in the Android actions area?

**Round 11 closed: 1 of 5 agent-ready (Board Game Club).** The round found systematic compiler classes, so the stop
rule is not met. Fix order (each with a failing test first, then typecheck, `npm test`, `npm run kit:check` if a kit
changed, commit, `scripts/install-linux-app.sh`, then round 12):
1. **No list on screen** (Step Goal, all presets): when records are create/read only and no feature shows a list,
   the first main task builds no list, empty-state, Add toggle or edit host. It exposes one named slot per feature
   (goal, steps entry, today summary), its focused test drives its own acceptance, and a create form the PRD keeps
   on screen is always visible with its quoted confirm label (Save clears the field instead of closing the form).
   Also check the first main owner being a settings feature.
2. **Settings-setting form contract** (Step Goal, Android): Form / Field rules / Rejection plus testTags for a
   setting edited on the main screen; the DataStore key type, the value before the first save, and what shows with none.
3. **Initial value vs choice vs app-set** (Reading List status, Book Shelf favorite).
4. **GTK document-export path** (Book Shelf) and **GTK numeric choice list as a picker** (rating 1..5).
5. **Waybar peak/max note contradiction**, refresh read access, rounding vs thresholds (Temp Watch).
6. Status-only change vs full edit (Reading List), then the polish batch (/teas/ route, boilerplate for
   WorkManager/denied/cancelled/launch-check cleanup on create-only records, CSV line endings, "12.0 stays 12.0").

**Status (2026-11-10):** all four fix branches merged into main (dc3d950 B, b7bc019 D, a0ff347 C, a44975d A;
436 tests pass; worktrees and branches removed). `npm run check` + `npm run kit:check` running. The five round-11
blueprints were recompiled into the session scratchpad `r11b/` (Temp Watch needed the provider repair that the new
capability.waybar-process-memory check asks for; applied by hand as the repair would) and five parallel audits are
running. Next: verify blocking claims, fix, re-audit; then rebuild the app and run round 12 live.

**Re-audit of the merged compiler (r11b):** Book Shelf 0 blocking (was 8), Step Goal 0 (was 6), Board Game Club 0,
Reading List 1 (stale provider prose "status is not entered"), Temp Watch 2 (kit refresh never wrote the severity class
into the cache; Retention said the peak resets at process start). Fixed in f241482 (kit refresh_with sets class;
capability.waybar-reset-at-start; semantic.choice-not-entered sends the prose contradiction back for repair; Astro seed
`weight: light` unquoted). Final audits of the two repaired packets running. Waybar kit changed: kit:check must be rerun.
Polish backlog from the re-audit: Step Goal no-goal rule not repeated in TASK-05's contract, total/goal-status testTags
unnamed, DataStore reopen + reset() note, unused Time rule in GTK mark/export tasks, GTK metainfo summary cut at a comma,
Tauri existing_file helper unused, Astro /teas/ example route, Signing vs Installation, launch-check list/cleanup and
denied/cancelled/migration boilerplate for create-only apps, Waybar refreshSeconds 15 vs 5 s cadence.

**Earlier plan (done):** four background agents, each in its own git
worktree branch, fixing classes in parallel: A = no list on screen + main-screen setting (Android, fixture
android-step-goal.json), B = initial value vs choice vs app-set + status-only change (fixtures tauri-reading-list.json,
gtk-book-shelf.json), C = GTK document export + numeric choice picker, D = Waybar peak/reset/rounding (fixture
waybar-temp-watch.json). Each commits on its branch with a failing-first test and a fixture-snapshot diff. Lead then:
merge branches into main one at a time (resolve conflicts, full `npx vitest run` after each), `npm run check`,
`npm run kit:check` (>= 2 GB free in /tmp), `scripts/install-linux-app.sh`, then **recompile the five round-11
blueprints by CLI and audit all five in parallel** (no live round needed to prove the fixes). If the session dies,
`git worktree list` / `git branch` shows the agent branches.

### Live round 10 (closed) (updated 2026-11-10)

**Where we stopped:** Alan is running round 10 live *from the installed app*, one prompt per preset,
and pastes each export folder path. The agent audits each one. 1 of 5 is done.

| # | Preset | Idea | Export path | Status |
|---|--------|------|-------------|--------|
| 1 | linux-wayland-gtk4-desktop | Recipe Box | `/home/arch/dev/nodaysidle/recipe-box` | **done: clean** (verify ok, kit fmt/clippy/test ok, audit 0 blocking / 10 polish) |
| 2 | linux-hyprland-waybar-module | Memory Watch | `/home/arch/dev/nodaysidle/memory-watch` | **done: agent-ready** (2nd try after c1737ef; verify ok, kit fmt/clippy/test ok, memory source, audit 0 blocking / 9 polish: 0-decimal label example "12.0 stays 12.0", % unit vs format_in_unit, GB fixed unit missing on notification contract, "(bytes for a size)" boilerplate, tooltip rule in wrong task, TASK-06 return shape, kit refresh test hits real XDG data dir, ARD "reset behavior" + CON-RUNTIME-WIRING HTTP boilerplate) |
| 3 | tauri2-rust-typescript-desktop | Contact Book | `/home/arch/dev/nodaysidle/contact-book` | **done: NOT agent-ready** (verify ok, kit 7/7 ok; audit 2 blocking, both confirmed by lead: (a) export button has no host: TASK-04 "Expose exactly these named slots ... no others" has no actions host, TASK-08 says "no named slot ... sit in the main content area" + slots.mount, and kit `host(name)` silently makes a detached div; (b) slots.run returns `unknown`, so the add/edit validation message has no stated path to TASK-04's form message slot. Confirmed compiler bug (polish): `cleanMeaning` genericIdentity (src/compiler.ts:381/399) rewrites fixture `ada@example.com` to "ada@the application identity". 8 more polish: tie-break asc vs desc id, search rule only under TASK-09, CSV line ending, time/TZ + cancellation/start-stop/delete boilerplate, get_contacts/existing_file unused, ACC-INTEGRATION-01 owned by packaging, contract_tests.rs content) |
| 4 | astro-web | Trail Guide (one page per trail) | `/home/arch/dev/nodaysidle/trail-guide` | **done: NOT agent-ready** (verify ok, kit 6/6 ok; audit 2 blocking, both confirmed by lead: (a) closed value set has no field type: blueprint field `difficulty` is `valueType: text`, so kit content.config.ts emits `z.string()` and the frozen seed says `difficulty: Sample text`, while PRD says "limited to easy, moderate, and hard" and ACC-TRAIL-DETAIL-PAGE-02 needs one of them; schema gap, likely all presets; (b) Design System drift (known class): PRD/TRD "1.5 line-height", "--space-1 through --space-8", display face vs kit global.css `16px/1.65`, no spacing tokens, and TASK-01 freezes global.css. 6 polish: km decimals unstated, name sort comparator, sitemap needs SITE_URL never given, Application ID boilerplate on a static site, Signing vs Installation deploy contradiction, `/teas/` example route from another product + cancellation/credential boilerplate) |
| 5 | android-kotlin-compose | Water Log | `/home/arch/dev/nodaysidle/water-log` | **done: NOT agent-ready** (2nd try after cf7c2aa; verify ok, gradle assembleDebug+testDebugUnitTest ok; no "Save is disabled" (aeb985f confirmed live); audit 2 blocking, both confirmed by lead: TASK-04 is given the list/add-entry/per-row/filter slot set for a count+setting screen with no list, and TASK-05 (daily goal) mounts into "the per-row action area" while PRD puts it "next to the today count". 7 polish: Worker/WorkManager boilerplate, goal key type/default only in PRD prose, "today" zone for the count comparison implicit, write-failure text unquoted, Save control unnamed, launch-check list/cleanup clauses for create-only records) |

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

**Round 10 fixes DONE (2026-11-10, all local, nothing pushed; app rebuilt and installed after e406560):**
a5a9c53 actions area + settings are not list rows (Contact Book export, Water Log goal; also Idea Box / Focus Ledger
exports) · d965a5a fixed value sets via a choice list named like the field (Astro z.enum + quoted seed, TRD "one of")
· d3049e2 Tauri SubmitResult: submit returns the validation message the shell shows · db803e1 Astro Design System
= kit global.css (test checks every named token) · a2879c5 ada@example.com kept (compiler + content.identity gate)
· 5be0c05 + e406560 repair-message audit: Waybar provider notes never contain cache.json/1024/KiB (test), unit-base
path for qualityRequirements, platform-need/tray/surface/coverage/request-value messages say the exact change,
waybar time-of-day path is responseFields. Tests 421 passed; check green; kit:check 18/18 (after d3049e2).
Fixtures added: tests/fixtures/{android-water-log,tauri-contact-book-csv,astro-trail-guide}.json.
**Still open:** (1) Astro light palette: the Color bullet says light-first but kit global.css is always dark.
(2) Android Water Log: the first task still talks about "the main list" (status area, list-row notes) though the
screen shows only a count; directAdd + actions fix the blockers, the list wording is polish. (3) Repair audit
leftovers: Jev-added platform needs the provider never wrote (repair cannot remove them); low-likelihood schema
messages that only state the problem (choice-initial, buildsOn cycle, two-schedules, missing-non-goal, unknown
data reference without the declared names). (4) Polish classes from round 10 and the GTK list below.
**Next:** round 11 with new ideas (one per preset) from the rebuilt app; stop rule unchanged.

**Round 10 result (all 5 audited): 1 agent-ready (Memory Watch) + Recipe Box clean; 3 not ready.** Systematic classes to fix
once in the compiler, in this order:
1. **Main-screen slot set is fixed to list CRUD** (Tauri Contact Book export button has no host; Android Water Log goal
   setting has no host and the list/form slots are invented for a no-list screen). Give the screen-owner task a host for
   list-wide actions / single-value settings, and drop list/form/row slots no feature uses. Check GTK too.
2. **Closed value sets have no field type** (Astro difficulty easy|moderate|hard is `text` -> `z.string()`, seed
   "Sample text"). Needs an enum valueType (schema + every kit/contract renderer), or at least seed/schema from it.
3. **Validation message has no path from handler to the form shell** (Tauri `slots.run` returns unknown).
4. **Design System tokens vs kit global.css** (Astro, known class): render the bullets from the emitted CSS.
5. **Repair messages must name exactly what to change** (2 of 5 generations stopped: c1737ef, cf7c2aa). Audit the
   other capability/semantic messages for the same mistake.
6. `cleanMeaning` genericIdentity rewrites `ada@example.com` (src/compiler.ts:381).
Polish to batch: Worker/cancellation/delete/time-zone boilerplate where unused (Tauri, Android, Astro), plus the GTK list below.

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
