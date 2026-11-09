# NODAYSIDLE Cascade V4 — repo rules

V4 compiles one software idea plus one locked preset into five Markdown contracts, a starter kit where
the preset has one, and `blueprint.json`. It is a local-first CLI plus a compiler core; the desktop
shell is a later milestone.

## Presets

- `linux-wayland-gtk4-desktop` — Rust + GTK4 + libadwaita, XDG paths, Secret Service, systemd,
  `.desktop`, AppStream, PKGBUILD.
- `linux-hyprland-waybar-module` — Rust CLI, Waybar JSON, systemd user unit, Waybar fragments.
- `tauri2-rust-typescript-desktop` — Tauri 2; verify Wayland behavior instead of assuming it.
- `astro-web` — static by default; server output only with a declared endpoint and adapter.
- `android-kotlin-compose` — Navigation 3, Room, DataStore, edge-to-edge, predictive back.
- Every preset ships a starter kit. The app is a Tauri desktop UI installed under `~/.local`; the
  Omarchy menu entry and bar widget live in `omarchy/plugin/` and `scripts/install-linux-app.sh`.

There is no native macOS preset. Do not add one back without an explicit product decision.

## Rules

- Fix the compiler, not a packet. Packets under `/tmp` or the user's project folders are disposable.
- The provider supplies product meaning only. IDs, files, owners, contracts, phases, tasks, and
  Markdown are local deterministic code.
- Declared fields, not prose, link features to data, services, platform needs, and surfaces.
- `filesystem` is never a provider platform need; file access comes from `userFileAccess` and
  document data objects.
- Reject duplicate names, unused platform needs, unsupported capabilities, and unrequested features.
  Never silently drop or dedupe provider content.
- One DeepSeek request plus at most one repair for provider-content failures. A blueprint the selected preset cannot express (capability audit after the provider answered) counts as a
  provider-content failure. Never repair transport, cancellation, input (including a capability problem in the user's own idea), Jev service, compiler, or export failures.
- Keys are memory-only. Never log, persist, export, or print them.
- The output is exactly five documents, then `kit/`, then `blueprint.json`. Preview bytes equal
  export bytes; repeated rendering is byte-identical.
- Kits are real starter code selected from declared fields. A kit change needs a real build.

## Checks

```sh
npm run typecheck
npm test
npm run kit:check        # slow: builds every preset kit (GTK4, Waybar, Tauri, Astro, Android)
# All five kits are built by the live packet output plus the per-kit commands in README.
CASCADE_LIVE_PROBE=1 npm run probe:live   # paid; reads DEEPSEEK_API_KEY and TYPESAFE_API_KEY
```

## DeepSeek

`src/provider.ts` fixes `temperature: 0`, `top_p: 1`, `reasoning.effort: "none"`, strict JSON schema,
`stream: false`, `store: false`, and 16,384 output tokens. Do not add undocumented sampling fields.
The mitigation for drift is structural validation, one targeted repair, and deterministic
normalization, not prompt wording alone.

## Generation output

The CLI writes `PRD.md`, `ARD.md`, `TRD.md`, `TASKS.md`, `AGENTS.md`, `kit/`, and `blueprint.json`.
`blueprint.json` records the preset, options, capabilities, document hashes, kit hashes, and the
validation ledger; it has no timestamp.
