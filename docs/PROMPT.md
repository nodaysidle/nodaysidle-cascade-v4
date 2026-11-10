# Claude Code prompt for a Cascade V4 packet

Put Claude Code in the exported packet folder and paste this. It is deliberately strict: the packet
already contains the decisions, so the agent's job is execution and evidence, not redesign.

```text
You are the implementation agent for this Cascade V4 packet.

Read, in this order, the whole of:
1. AGENTS.md
2. TRD.md
3. TASKS.md
4. ARD.md
5. PRD.md
6. blueprint.json

AGENTS.md is authoritative. TRD.md owns every contract decision. TASKS.md owns the phase order and
file scope. Do not add, remove, reorder, or merge phases or tasks. Do not invent files, APIs,
dependencies, design decisions, or validation commands. If two documents contradict each other, stop
and report the exact contract ID, task ID, and quoted lines; do not guess.

Start with TASK-01-FOUNDATION. For each task in order:

1. Read the task's filesToCreate, filesToModify, featureIds, requirementIds, contractIds,
   acceptanceIds, acceptanceCriteria, focusedTests, and validationCommands.
2. Copy the matching kit/ file before writing new plumbing. Extend kit files only where the task or
   contract says to; never replace the composition root, the error center, or the storage helpers.
3. Implement only that task's declared scope. Do not modify a file outside filesToCreate and
   filesToModify.
4. Run the task's focused test and every validation command. Capture the exact command and exit
   status. Fix failures before moving to the next task.
5. Report: task ID, files created/modified, commands with exit status, acceptance evidence, and any
   deviation from the packet. A task is not complete until its validation commands pass.

Locked rules:
- Use only the locked stack and the allowed technologies in AGENTS.md/TRD.md. Never substitute a
  forbidden technology.
- Test doubles, in-memory stores, and fake platform clients live only in test files.
- The packaging task owns CON-RUNTIME-WIRING. Run the hands-on launch check exactly as written.
- For a Wayland GTK4 packet: run under Wayland with GDK_BACKEND=wayland, validate the desktop entry,
  AppStream metadata, and PKGBUILD, and take a screenshot of every window before calling it done.
- For a Waybar packet: run --once and validate the JSON, install the fragment, restart Waybar, take a
  screenshot, and verify the click action.
- For an Astro packet: run the type/content, unit, accessibility, build, and performance commands.
- For an Android packet: install and launch the APK on an identified emulator or device, then verify
  process-death restoration.
- Never mark a task complete without running its validation commands. Never leave test data behind.

At the end, run the final validation commands from TASKS.md and produce the completion report required
by AGENTS.md: every command with exit status, every acceptance criterion with evidence, screenshots or
a statement that screenshots could not be taken, anything not removed, and any remaining risk.

Start now with TASK-01-FOUNDATION. Do not start a later task until its dependencies are green.
```
