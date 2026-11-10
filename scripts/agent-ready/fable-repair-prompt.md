You are taking over NODAYSIDLE Cascade V4, a local-first compiler and Tauri 2 desktop app. It turns one software idea plus one tech-stack preset into five Markdown contracts and a starter kit that a coding agent builds from.

Repo: /home/arch/dev/nodaysidle/nodaysidle-cascade-v4 (branch main). Before anything else, read in order:
1. /home/arch/dev/nodaysidle/CLAUDE.md and this repo's AGENTS.md (workspace rules; this repo's AGENTS.md wins).
2. HANDOFF.md, starting at "RESUME HERE — round 12 live run failed at the intake stage". It has the exact failures, file:line leads, and a diagnosis to verify.

Hard rules from the owner (Alan), no exceptions:
- Never edit his exported packet folders (/home/arch/dev/nodaysidle/<packet-name>/). Read them only.
- Never push. Commit locally only.
- Never print, log, or echo API keys (DEEPSEEK_API_KEY, TYPESAFE_API_KEY), and never put request bodies with keys into messages or files.
- Ask Alan before running anything that spends API calls (the CLI `generate` command or scripts/agent-ready/run-round.fish).

The problem: the document compiler is in good shape (round 11 ended with all five packets agent-ready), but the live run of round 12 from the installed app fails *before* any documents are written:
- Waybar "Disk Free": the AI puts labelTemplate and thresholds on every feature; the one allowed repair does not fix it (capability.waybar-label-template, capability.waybar-thresholds-owner).
- Android "Tip Split" (a calculator): the AI invents a scheduled notification, then after the repair sets valueDecimals, a Waybar-only field (capability.waybar-label).
- Tauri: provider.http-error at step 02. The UI hides the HTTP status.
- Astro: jev.intake-rejected. The UI hides Jev's score and reason.

Your goal: make the intake stage robust, so every one of the 25 round-12 ideas in scripts/agent-ready/run-round.fish either reaches a gate-clean packet or stops with a clear, deliberate rejection of something the preset truly cannot do. Do not weaken checks that protect document quality.

Work in this order, and verify each step before the next:
1. Make failures diagnosable. Show the HTTP status and the provider's safe error code in the provider.http-error issue, and Jev's score and reason in the jev.intake-rejected issue. Never show keys or request bodies. Then tell Alan what the Tauri status was before changing anything else for it.
2. Normalize instead of reject wherever the compiler can decide deterministically:
   - Drop bar-only fields (labelTemplate, unit, valueDecimals, thresholds, systemSource ≠ none) on non-Waybar presets, or stop offering them to the AI there.
   - On Waybar, keep the label fields and thresholds only on the one feature that shows the reading when the copies agree; reject only when they disagree.
   - Set a scheduledNotification to null when no feature needs notifications.
   Find the normalization step in src/compiler.ts, and the checks in src/capabilities.ts, src/waybarContracts.ts and src/schema.ts.
3. Jev rejection: once the reason is visible, report it to Alan. Do not lower JEV_VIABILITY_THRESHOLD (src/jev.ts) without his explicit yes.

For each fix:
- Write a test that fails first, using a fixture shaped like the failing AI response (see tests/round11-*.test.ts and tests/fixtures/*.json).
- Fix the shared code once; no special cases for a product name.
- Run `npm run typecheck`, `npx vitest run`, `npm run check`, and `npm run kit:check` only if a starter kit changed. /tmp is a 7.5 GB RAM disk: keep at least 2 GB free before Android kit builds.
- Commit locally.

When all fixes are in, rebuild the app with `bash scripts/install-linux-app.sh` and ask Alan to re-run the failing ideas in the UI (or, with his yes, the CLI script). Independent fixes may go to parallel subagents in separate git worktrees, one class each, merged one at a time.

Keep HANDOFF.md updated as you go: what is done, what is left, and open questions. Commit it with your changes. Report to Alan in plain words: what was broken, what you changed, what you verified, and what you did not check.
