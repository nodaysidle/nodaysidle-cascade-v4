---
title: "GTK export documents use FileChooserNative, not FileDialog"
author: Nodaysidle
date: 2026-11-10
branch: worktree-agent-ac3d6b4ade8a6fde3
cost: { minutes: 53, tokens: 221847 }
id: l-aa5d2870
scope: repo
status: active
src: agent
touches:
  - src/gtkContracts.ts
  - src/compiler.ts
---

## Decided
A GTK document that a feature saves is a file written whole through the kit's write_atomic, never a SQLite table, store trait or validate fn (gtkSavedDocument picks it: the document the feature creates/updates, else the atomic-replace one, else the only one). The save dialog is gtk::FileChooserNative awaited with run_future(), behind PermissionCoordinator::choose_save_path returning an Option of PathBuf. CSV export: RFC 4180 quoting, CRLF on every line, date-time as RFC 3339 UTC so tests never depend on TZ.

## Tried and ruled out
gtk::FileDialog: the kit's gtk4 0.11 has no v4_10 feature, and enabling it would change the kit (needs a real build) and deprecate FileChooserNative under clippy -D warnings. Without v4_10 FileChooserNative carries no deprecation attribute.

## Watch out
Packet Markdown may not contain angle brackets (audit content.unfinished matches <...>): write 'an Option of PathBuf', not Option<PathBuf>. A document that is only opened (a chosen folder) keeps the old generic shape on purpose.
