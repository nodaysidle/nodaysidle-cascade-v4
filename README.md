# NODAYSIDLE Cascade V4

One software idea plus one locked preset becomes exactly five Markdown contracts, a starter kit
where the preset has one, and `blueprint.json` that records what compiled.

V4 targets Arch Linux / Omarchy / Hyprland directly:

- **Linux Wayland GTK4 Desktop** — Rust, GTK4, libadwaita, XDG paths, Secret Service, systemd,
  `.desktop`, AppStream, PKGBUILD.
- **Hyprland Waybar Module** — Rust CLI, Waybar JSON, systemd user unit, Waybar fragments, PKGBUILD.
- **Tauri 2 Desktop** — Rust + TypeScript, Wayland verification, Linux packaging.
- **Astro Web** — static by default, server output by option, content collections, routes, a11y and
  performance gates.
- **Android Kotlin Compose** — Navigation 3, Room, DataStore, edge-to-edge, predictive back, adaptive
  layouts, baseline profile.

The macOS SwiftUI presets are gone. MacOS remains a host for the Cascade app and for Tauri, but no
preset emits a native macOS app.

## Pipeline

```
idea + preset + options + keys
  -> local input validation
  -> capability intent check
  -> Jev preflight (viability, preset fit)
  -> one DeepSeek Responses request (strict JSON schema)
  -> tolerant parse + intake audit (references, coverage, duplicates, unused needs)
  -> capability audit (declared needs vs preset)
  -> Jev integrity (stack leakage, acceptance verifiability, additive needs)
  -> deterministic normalization (no silent drops)
  -> project graph (owners, contracts, phases, tasks, create-before-modify)
  -> mechanical audit
  -> agent-readiness audit
  -> render five documents + kit
  -> byte audit + SHA-256 + deterministic re-render
  -> Gate Clean preview
  -> atomic export
```

One repair request is allowed for provider-content failures: schema, intake, integrity leakage or
verifiability, normalization, readiness. Transport, cancellation, input, capability, Jev service,
compiler bugs, and export failures are never repaired.

## Output

```
<project-slug>/
  PRD.md
  ARD.md
  TRD.md
  TASKS.md
  AGENTS.md
  blueprint.json
  kit/
    ...preset starter files
```

`blueprint.json` contains the provider blueprint, the preset id, the selected options, the resolved
capabilities, document hashes, kit hashes, and the validation ledger. It has no timestamp, so the same
blueprint compiles to identical bytes.

## Prerequisites

On Arch / Omarchy:

```sh
sudo pacman -S --needed base-devel cargo gtk4 libadwaita desktop-file-utils appstream
```

`base-devel` provides `makepkg` for the PKGBUILD gate. `waybar` is needed to run a Waybar module
packet; the module builds without it.

## Desktop app

The Tauri desktop app is the authoring surface: preset + options, idea, model and two memory-only
keys, live progress, five preview tabs, validation ledger, and export.

```sh
npm run tauri:dev
npm run tauri:build      # deb bundle
npm run install:app      # build and install the Linux binary under ~/.local
```

`install:app` also writes the desktop entry, the Omarchy menu entry, and the `Cascade V4` bar widget
from `omarchy/plugin/`. The app is installed at `~/.local/bin/nodaysidle-cascade-v4`.

## Commands

```sh
npm install
npm run typecheck
npm test

# Offline compile from a blueprint you already have
npm run cascade -- compile --preset linux-wayland-gtk4-desktop \
  --blueprint blueprint.json --out /tmp/packets

# Live generation (reads DEEPSEEK_API_KEY and TYPESAFE_API_KEY from the environment)
npm run cascade -- generate --preset linux-wayland-gtk4-desktop \
  --idea-file idea.md --out /tmp/packets

# Re-render a packet and compare every hash
npm run cascade -- verify --packet /tmp/packets/<project-slug>

# List presets and their options
npm run cascade -- presets

# Kit build (slow: real cargo builds)
npm run kit:check
```

## DeepSeek settings

The request is fixed in `src/provider.ts`: `temperature: 0`, `top_p: 1`, `reasoning.effort: "none"`,
`stream: false`, `store: false`, `max_output_tokens: 16384`, and a strict JSON schema. DeepSeek's
Responses API documents `temperature` 0–2 (0 recommended for coding/math) and `top_p` 0–1; with
`deepseek-flash` in non-thinking mode `top_p` is fixed at 1.0 and the value passed is ignored. The
API does not document `seed`, `frequency_penalty`, or `presence_penalty` on `/responses`, so the
client does not send them.

Deterministic gates matter more than sampling:

- strict schema, closed enums, all fields required;
- `filesystem` is absent from the provider schema entirely; file access is derived from
  `userFileAccess` and documents;
- coverage is structural (`ideaCoverage` per sentence, every feature mapped, no unrequested feature);
- the repair request names failed paths, rules, and allowed values, and reruns every check;
- normalization rejects duplicates and unused platform needs instead of dropping them;
- the compiler never trusts the model for IDs, files, contracts, phases, or Markdown.

## Testing keys

The live probe is gated and never runs in the normal suite:

```sh
# fish
CASCADE_LIVE_PROBE=1 npm run probe:live
```

It reads `DEEPSEEK_API_KEY` and, when present, `TYPESAFE_API_KEY`. The key is never printed or
written. The fixture suite is deterministic and costs nothing.

## Claude Code in the output folder

The generated `AGENTS.md` is the operating manual. Open Claude Code in the packet folder and paste the
prompt in `PROMPT.md`. It tells the agent to read `AGENTS.md`, follow `TASKS.md` in order, copy the
kit instead of inventing plumbing, and report every command and acceptance result.

## Scope

V4.0 implements the core, CLI, Tauri desktop app, GTK4 kit, Waybar kit, Tauri kit, Astro kit, Android
kit, and all five preset contracts. The live runs under `/tmp/v4-live-final` (or a new run of
`scripts/live-presets.ts` + `scripts/live-astro.ts`) are the evidence set.
