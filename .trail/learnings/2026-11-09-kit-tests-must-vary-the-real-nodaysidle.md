---
title: "Kit tests must vary the real blueprint name field and be checked with typecheck, not just vitest"
author: Nodaysidle
date: 2026-11-09
branch: main
id: l-f8a00a3b
scope: repo
status: active
src: agent
touches:
  - tests/core.test.ts
  - src/kits.ts
  - src/astroKit.ts
  - tests/fixtures/blueprints.ts
---

## Decided
Kit formatting tests compile each kit for a short and a very long product name and run rustfmt on the Rust files. Keep Rust kit templates free of hand-wrapped lines that depend on the crate name length: bind the value first, and put the crate `use` in its own group so rustfmt sorting does not change with the name.

## Tried and ruled out
Wrapping a long println by hand (passed only for long names). Passing `projectName` to compilePacket: vitest does not typecheck, so the unknown field was ignored and the test varied nothing until `npm run typecheck` caught it. The real field is `productName`.

## Watch out
The Astro kit with a content collection needs the native sharp binary unless the image service is the no-op one; under npm 11.20 with Node 26 sharp's install check fails, so a plain `npm install` silently omits it and `astro build` fails. The old fixtures had no collection, so kit:check hid this.

In the code: tests/core.test.ts (rustfmt test), src/kits.ts (waybarKit main.rs), src/astroKit.ts (astro.config.mjs), tests/fixtures/blueprints.ts (bareWaybarBlueprint).
