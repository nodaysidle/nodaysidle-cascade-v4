# HANDOFF — NODAYSIDLE Cascade V4

## What this app is

Cascade V4 is a local-first compiler and Tauri desktop app. It takes:

- one software idea,
- one locked tech-stack preset,
- optional preset options,
- one DeepSeek key and one TypeSafe Jev key (memory only),

and produces exactly five Markdown contracts plus a starter kit and `blueprint.json`:

```text
PRD.md
ARD.md
TRD.md
TASKS.md
AGENTS.md
blueprint.json
kit/
```

The point is **agent-ready contracts**, not generated application source. A coding agent opens the
output folder, reads `AGENTS.md` first, follows `TASKS.md` in order, copies `kit/` where the task says
to, and runs every validation command. The contracts must be concrete, non-contradictory, and aligned
across all five documents.

## What it should do

1. Validate the idea, preset, options, and capabilities locally before spending money.
2. Send one DeepSeek Responses request with a strict JSON schema, temperature 0, `top_p` 1,
   `reasoning.effort: none`, 16,384 output tokens, stream/store false.
3. Run a deterministic intake audit: references, `ideaCoverage`, duplicate names, unused platform
   needs, choice lists, saved-file documents, secrets, and capabilities.
4. Run Jev preflight and integrity decisions, with additive platform-need healing only.
5. Normalize strictly. No silent drops or dedupes.
6. Compile a deterministic project graph: stable IDs, owners, contracts, phases, tasks,
   create-before-modify, focused tests, validation commands.
7. Run mechanical, agent-readiness, and rendered-byte audits.
8. Render the five documents and the preset kit. Preview bytes must equal export bytes.
9. Export atomically: five documents, `kit/`, and `blueprint.json` with document and kit hashes,
   selected options, and resolved capabilities.
10. Offer one repair request only for provider-content failures. Never repair transport, input,
    capability, Jev service, compiler, or export failures.

## Tech-stack presets

| Preset ID | Stack | Kit |
| --- | --- | --- |
| `linux-wayland-gtk4-desktop` | Rust, GTK4, libadwaita, XDG, Secret Service, systemd, PKGBUILD | Yes |
| `linux-hyprland-waybar-module` | Rust CLI, Waybar JSON, systemd user unit, Waybar fragments, PKGBUILD | Yes |
| `tauri2-rust-typescript-desktop` | Tauri 2, Rust, TypeScript, Vite, capabilities, Linux/macOS packaging | Yes |
| `astro-web` | Astro 5, TypeScript, content collections, routes, a11y/performance gates | Yes |
| `android-kotlin-compose` | Kotlin, Compose M3, Navigation 3, Room, DataStore, edge-to-edge, predictive back | Yes |

There is **no native macOS preset**. The macOS SwiftUI presets were removed. Tauri remains
cross-platform, but native macOS is not a preset.

## Repo state

- Local path: `/home/arch/dev/nodaysidle/nodaysidle-cascade-v4`
- Remote: `https://github.com/nodaysidle/nodaysidle-cascade-v4` (private)
- Branch: `main`
- Pushed commits: `27810a9`, `6582197`; many app/UI/kit/live-test changes are **not yet committed**.
- The app is installed at `~/.local/bin/nodaysidle-cascade-v4`; desktop entry at
  `~/.local/share/applications/com.nodaysidle.cascade.v4.desktop`; Omarchy menu entry is in
  `~/.config/omarchy/extensions/omarchy-menu.jsonc`.
- Tauri build artifacts: `src-tauri/target/release/nodaysidle-cascade-v4` and a `.deb` under
  `src-tauri/target/release/bundle/deb/`.

## Commands

```sh
npm install
npm run typecheck
npm test
npm run kit:check                 # builds all five kits; slow
npm run tauri -- build --bundles deb
npm run install:app               # Linux install + Omarchy menu/bar plugin
CASCADE_LIVE_PROBE=1 npm run probe:live
npx tsx scripts/live-presets.ts   # live packets for four presets; needs both keys
npx tsx scripts/live-astro.ts     # live Astro packet; needs both keys
```

## Current verified state

- All five live packets exist under `/tmp/v4-live-final/<preset>/<slug>` and `cascade verify` passes
  for GTK, Waybar, Tauri, Astro, and Android.
- All five output exactly five Markdown files + `blueprint.json` + `kit/`.
- `tests/alignment.test.ts` checks every feature, requirement, contract, owner, phase, task, and
  acceptance ID across all five documents for the fixture matrix.
- GTK, Waybar, Astro, and Android kits build and pass their own tests through `npm run kit:check`.
- Tauri kit was failing only because `mod platform;` was placed before the crate-level `//!` docs in
  `src-tauri/src/lib.rs`; that is fixed, but the Tauri-only kit rerun had not finished when this
  handoff was written.
- The Tauri desktop app builds (`deb`), installs, launches on Wayland, and shows the V4 brand and
  preset-options panel. Screenshot: `/tmp/cascade-ui4.png`.

## Where the remaining problems are

### 1. Tauri kit rerun

`npm run kit:check` had 4/5 pass: GTK, Waybar, Astro, Android. The Tauri failure was:

```text
error[E0753]: expected outer doc comment
src-tauri/src/lib.rs:3: //! Composition root...
```

Fix applied: `tauriKit.ts` now appends `mod platform;` after `libRs` instead of before it. Run:

```sh
CASCADE_KIT_BUILD=1 npx vitest run tests/kit-build.test.ts -t "Tauri 2 kit"
```

If it still fails, the next likely issues are icon generation (`npm run tauri -- icon app-icon.svg`)
and the `keyring` / `vault.rs` API on Linux.

### 2. Omarchy bar widget is enabled but not visibly rendering

- Menu entry works: `omarchy menu summon apps.cascade-v4`.
- Bar plugin installed at `~/.config/omarchy/plugins/nodaysidle.cascade-v4`, manifest validates,
  `omarchy plugin enable` says enabled, `omarchy bar move ... right` says moved.
- `omarchy-shell shell listPlugins` still reports `"active": false`, and screenshots show no C4 icon.
- Shell log warning: `Module path ".../plugins/nodaysidle.cascade-v4" is outside of the config
  folder.` This is likely a Quickshell plugin-scanner path issue. Compare with a working third-party
  bar widget (`reidenxerx.clipboard-shelf`, `colinmcrae.wrc-badge`) and inspect
  `/usr/share/omarchy/shell/plugins/bar/Bar.qml` and `README.md`. Do not break the user's existing
  bar; test with `omarchy-shell shell listPlugins` and a screenshot.

### 3. Remaining contract-quality gaps from live audits

The live audits found these; some are fixed, some need a compiler pass:

- GTK: local file boundary and Downloads/named-folder rules were added as
  `CON-PLATFORM-FILES`; owner map no longer says "modify phases none"; Rust file names are
  snake_case. Regenerate the GTK live packet after the latest changes and confirm the boundary
  contract and launch check are present.
- Waybar: cadence contradiction was fixed (fragment poll 15 s; service refresh 900 s). The kit still
  ships SQLite/keyring/HTTP helpers even when the blueprint declares no records/secrets; either make
  kit file/dependency inclusion conditional or document the helpers as optional. The click action
  in the starter kit toggles a setting; the feature task owns launching the terminal.
- Astro: static personal records are now rejected with
  `normalization.astro-personal-record`; the Astro data owner can edit `src/content.config.ts`.
  The old contact-form live packet is intentionally invalid; the new live Astro idea uses contact
  details without a form. Confirm `src/content.config.ts` (Astro 5 path) and detail route ownership.
- Tauri: platform module root, icon-generation foundation step, and `kit_tests.rs` modification
  ownership were added. Regenerate the Tauri live packet and build its kit.
- Android: validation commands now use `./scripts/gradle.sh`; the kit has Navigation 3, Room,
  DataStore, edge-to-edge, and `App.kt`. `assembleDebug` passed. Regenerate the live Android packet
  so its docs and kit match the current commands.
- All presets: `CON-PLATFORM-FILES` and a `Launch check:` line are added to runtime wiring; verify
  they render in every live packet.

### 4. Not implemented yet

- A single generated `provider-contract.json` shared by TS and Rust, with a build digest handshake.
- Offline replay/verify corpus from failed live requests.
- Dead macOS branches in `src/compiler.ts` / `src/audit.ts` (`NATIVE_MAC`, `nativePersistenceStores`,
  `nativePackagingDetails`) remain for historical reasons; remove them in a cleanup pass.
- CI workflow exists (`.github/workflows/checks.yml`) but has not been run on GitHub.
- `namcap` is not installed (no sudo password); PKGBUILD validation uses
  `makepkg --printsrcinfo`. `waybar` is not installed either; Waybar visual launch is unverified
  because this Omarchy uses `omarchy-shell`.

## Definition of done

Done means **all five presets produce working Markdown packets that an agent can build from with no
contradictions**, not merely that the compiler exits 0.

Concretely:

1. A live DeepSeek + Jev run for each preset reaches Gate Clean.
2. Each exported folder has exactly `PRD.md`, `ARD.md`, `TRD.md`, `TASKS.md`, `AGENTS.md`,
   `blueprint.json`, and a non-empty `kit/` where the preset has one.
3. `cascade verify <folder>` passes for all five.
4. In each packet every FEAT/REQ/ACC/CON/OWN/PHASE/TASK ID resolves in all five documents, every
   contract decision/details/failure/recovery is rendered once in TRD, every task's create/modify
   scope matches its owner, and no task claims another owner's file.
5. Each kit builds with its own validation commands:
   - GTK/Waybar: `cargo fmt --check`, clippy `-D warnings`, `cargo test`, release build.
   - Tauri: npm typecheck/test/build, cargo fmt/test, icon generation.
   - Astro: `npm run check`, `npm test`, `npm run build`, `npm run test:a11y`,
     `npm run audit:performance`.
   - Android: `./scripts/gradle.sh assembleDebug`.
6. The desktop app builds, installs, launches on Wayland, and its UI shows the V4 brand, preset
   options, five preview tabs, ledger, and export.
7. The Omarchy menu entry works; the bar widget is either visibly working or explicitly removed.
8. The latest changes are committed and pushed to the private repo.

## Suggested order for the next agent

1. Finish the Tauri kit rerun and fix any remaining Rust/frontend errors.
2. Regenerate all five live packets from their live blueprints after the latest compiler changes;
   run `cascade verify` and the cross-document alignment checks.
3. Make Waybar/GTK kit helper inclusion conditional on the blueprint, or document the optional
   helpers explicitly.
4. Debug the Omarchy bar widget scanner path with a working third-party widget as the reference.
5. Run CI on GitHub; fix the Android SDK package names if needed.
6. Clean dead macOS code, add the provider contract/offline replay, commit and push.

## Files that matter most

- `src/schema.ts` — provider schema, prompt, intake rules.
- `src/pipeline.ts` — stages, one repair, statuses.
- `src/compiler.ts` — normalization, graph, owners, contracts, phases.
- `src/presets.ts` — five preset contracts, options, capabilities, file boundaries.
- `src/renderers.ts` — the five Markdown documents.
- `src/audit.ts` — graph and rendered-byte gates.
- `src/kits.ts`, `src/tauriKit.ts`, `src/astroKit.ts`, `src/androidKit.ts` — starter kits.
- `src/app.ts`, `src/state.ts`, `src/bridge.ts` — Tauri UI.
- `src-tauri/` — provider/Jev/export boundary.
- `omarchy/plugin/` — bar widget; `scripts/install-linux-app.sh` — Omarchy install.
- `tests/alignment.test.ts` — cross-document contract alignment.
- `tests/kit-build.test.ts` — all five kit builds.
- `tests/live-probe.test.ts` and `scripts/live-presets.ts` — live paid checks.
