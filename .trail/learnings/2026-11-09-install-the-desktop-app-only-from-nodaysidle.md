---
title: "Install the desktop app only from a Tauri CLI build, never a plain cargo build"
author: Nodaysidle
date: 2026-11-09
branch: main
cost: { minutes: 2, tokens: 10488 }
id: l-9df55d14
scope: repo
status: active
src: agent
touches:
  - scripts/install-linux-app.sh
  - src-tauri/tauri.conf.json
---

## Decided
The installed binary must come from `npm run tauri -- build --no-bundle` (or a full bundle build). Only the Tauri CLI embeds the frontend.

## Tried and ruled out
A plain `cargo build --release` produced a binary whose window showed "Could not connect to localhost: Connection refused", because it loaded the dev URL instead of the bundled UI.

## Watch out
Both builds look identical on the command line and the binary launches fine; only the window content differs. Always screenshot after an install.

In the code: scripts/install-linux-app.sh, src-tauri/tauri.conf.json (devUrl, frontendDist).
