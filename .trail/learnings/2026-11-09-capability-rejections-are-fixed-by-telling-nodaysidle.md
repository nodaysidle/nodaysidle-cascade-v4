---
title: "Capability rejections are fixed by telling the provider what the preset lacks, not by repairing"
author: Nodaysidle
date: 2026-11-09
branch: main
cost: { minutes: 6, tokens: 16076 }
id: l-2be96a33
scope: repo
status: active
src: agent
touches:
  - scripts/live-presets.ts
  - src/pipeline.ts
  - src/schema.ts
  - tests/schema.test.ts
---

## Decided
When a live idea is rejected at the capability gate (tray, background execution), the model misread a preset surface as a capability. Fix it in the provider instructions: add one sentence, driven by the preset's declared capability flag, that says what the preset lacks and what does not count (a bar module is not a tray; a copy with progress while the window is open is not background execution). Capability failures stay unrepaired: one request, at most one repair for content failures only.

## Tried and ruled out
Reading `omarchy-shell shell listPlugins` "active": false as proof the bar widget was broken: every enabled widget shows false, and the widget rendered fine in a screenshot.

## Watch out
Any new capability flag set to false in a preset can cause the same wasted paid request until a matching sentence exists. Check with LIVE_IDEA_INDEX=all live runs.

In the code: src/schema.ts (buildBlueprintInstructions trayAvailable, backgroundAvailable), src/pipeline.ts (providerRequest), scripts/live-presets.ts.
