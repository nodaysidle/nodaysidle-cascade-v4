# 014 — Cascade V4 is Linux-only in code and text: remove the macOS leftovers

Owner said yes on 2026-11-11 ("yes do remove the macOS branch from this app").

## Why

V4 has no macOS preset, but the Tauri preset and the app still carry code and text from V3. A read-only sweep of
2026-11-11 found two kinds:

- a dead branch: with no `linuxPackaging` option the Tauri preset emits `scripts/package_app.sh`, a `macOS`
  bundle block and "AppImage, deb, or native .app" texts. The app and the CLI always set the option, so only
  tests reach it;
- text that reaches real Linux packets: "On macOS declare ... in src-tauri/Info.plist" (microphone, camera,
  location), "the macOS login keychain ... or Windows Credential Manager" (secrets), "cross-platform desktop
  entry" (every packet), a `KeychainStore` whose comment names the macOS keychain, an Apple font stack in the
  kit CSS, and a Windows line in the kit's `main.rs`.

No product name anywhere. Failing test first. Two workers, disjoint files: part A (compiler) and part B (the
Cascade desktop app itself).

## Part A — the compiler (`src/`, `tests/`)

### A1. Test first — extend `tests/tauri-linux-binary.test.ts`

One test compiles Tauri fixtures that together need a secret, location, microphone and camera (pick existing
fixtures, or spread one blueprint with those `platformNeeds`; `forecastGlanceBlueprint` has a secret and
`trailChecklistBlueprint` has location) TWICE: with `{ linuxPackaging: "binary", wayland: true }` and with `{}`.
For every document and every kit file of every packet assert no match, in any letter case, of:
`macos`, `mac os`, `darwin`, `windows credential`, `info.plist`, `codesign`, `notariz`, `.icns`, `.ico"`,
`keychain`, `-apple-system`, `sf pro`, `blinkmacsystemfont`, `windows_subsystem`, `cross-platform`,
`package_app.sh`, `/applications`, `appimage`. Exceptions that stay and must not be matched by the test:
`MacosLauncher` (tauri-plugin-autostart needs the argument on every OS), `CommandOrControl` / `CmdOrCtrl`
(Tauri accelerators), and the "Forbidden: SwiftUI ..." guard line. Also assert that the `{}` packet and the
Linux-option packet have the same kit file list and the same documents apart from the "Preset options" line.
Replace the plan-013 test "names the macOS bundle after the productName" (the script it reads is deleted).
Run it, see it fail, then go on.

### A2. `src/presets.ts` — the Tauri base preset is the Linux preset

- `platform: "Linux (Wayland verified)"`, `runtimeMode: () => "linux-desktop"`; delete `"cross-platform"` from
  `PresetRuntimeMode` if nothing else uses it.
- `packagingRules`, `installationDecision`, `signingDecision`, `outputArtifact`, `artifactPath`,
  `completionEvidence`, `validationCommands`: take, word for word, the values the `if (linux)` block in
  `src/tauriContracts.ts` sets today (`validationCommands` ends with `./scripts/package_linux.sh`).
- `tauriPermissionPatterns` microphone, camera, location: delete the leading "On macOS declare ... in
  src-tauri/Info.plist; " clause and the words "on Linux"; keep the rest of each sentence and start it with a
  capital letter (for example `Request capture through the desktop portal and PipeWire; expose one Rust command
  for platform authorization and never capture before approval.`).
- `credentialPlacement`: `Use one Rust SecretStore trait backed by the Linux Secret Service (GNOME Keyring or
  KWallet) through the keyring crate; ` then the rest of the sentence unchanged.
- `lifecycleRules[0]`: `Use tauri::Builder as the desktop entry.` `lifecycleRules[2]`: `Keep platform operations
  behind Rust commands and capability files.`
- The option `linuxPackaging` stays as it is (single value `binary`), so the "Preset options" line of exported
  packets does not change.

### A3. `src/tauriContracts.ts`

Delete the `linux` flag and the whole `if (linux)` block (its values now live in the base preset). Nothing else
in `tauriSpecialize` changes.

### A4. `src/tauriKit.ts`

- Delete `linuxOnly` from `TauriKitUses`, the `scripts/package_app.sh` kit entry, its README bullet, the whole
  `packageScript()` macOS script, the `linuxOnly` parameter of `tauriConf` and the `macOS` bundle block.
  `tauriProductName` stays (used by `tauriConf`).
- `tauriConf` icon list: only the PNG entries (`icons/32x32.png`, `icons/128x128.png`,
  `icons/128x128@2x.png`). The real kit build (A7) proves `tauri build --no-bundle` still passes; if it does
  not, put the list back and report.
- `STYLE_CSS`: `font: 13px/1.45 system-ui, sans-serif;` in place of the Apple font stack.
- `mainRs()`: delete the "console window on Windows" comment and the `windows_subsystem` attribute line.
- `VAULT_RS`, `lib.rs` template and the kit README: rename `KeychainStore` to `SecretServiceStore`; comments
  and error strings say "Secret Service" (for example "The Secret Service could not be opened.", "The key could
  not be read from the Secret Service.") and no longer name macOS, apple-native or a keychain. Behaviour and the
  `keyring` dependency line stay exactly as they are. Update every sentence in `src/` that names
  `KeychainStore`.

### A5. Other compiler files

- `src/compiler.ts`: delete the dead `UserDefaults` branch (around line 1671). Delete the "native open and save
  panels" branch only if no preset placement string can match its regex; otherwise reword its text to
  "Persistence: local filesystem at user-selected paths via the file dialog." Reword the comment near line 852
  so it no longer names macOS (the rule itself stays). Do NOT touch the prose-detection regexes near lines
  388-396 (`implementationSuggestion`, `sourcePath`, `command`): they are quality guards.
- `src/renderers.ts:238`: the three Swift fallbacks become `"the foundation file"`, `"the foundation test"`,
  `"npm test"`.
- `src/audit.ts:119` `isRootValidationCommand`: remove `swift`, `codesign`, `open` and the `./Scripts/`
  alternative. This makes the check stricter. If any existing test or fixture then fails, stop and report; do
  not loosen anything else.
- `src/capabilities.ts:10`: reword the comment without "macOS-only".
- `tests/packet.test.ts:93`: the malformed preset id becomes `"no-such-preset"`.

Out of scope for part A (leave untouched, the lead reports them to the owner): `src/jev.ts` storage tiers
(`keychain`, `userdefaults`; it is part of what the paid review asks), `src/schema.ts` provider prompt,
"Forbidden: SwiftUI ..." guard lines in any preset, `src/gtkContracts.ts`, `.gitignore`, `AGENTS.md`,
`README.md` history line, `docs/HANDOFF.md`, `plans/`.

### A6. Tests

Tests that compile the Tauri preset with no option now get the Linux packet; fix the assertions that named the
old base texts or `package_app.sh` (`tests/tauri-focus.test.ts:12-17` and `:66-68` at least). Do not delete an
assertion that protects something still true; change what it expects.

### A7. Verify (report each exit code)

1. The A1 test fails before A2 and passes after.
2. `npm run check` exits 0.
3. `CASCADE_KIT_BUILD=1 npx vitest run tests/kit-build.test.ts` exits 0 (all tests, real builds).
4. Recompile the saved round-12 blueprints from `main` and from the branch with
   `npm run -s cascade -- compile --preset <id> --blueprint <file> --out <dir>` (output under
   `$HOME/.cache/cascade-v4/tmp/`): non-Tauri packets byte-identical; for Tauri list each changed line category.
5. `grep -rniE "macos|codesign|info\.plist|keychain|icns|apple-system|windows_subsystem|cross-platform" src`
   shows only the out-of-scope items above plus `MacosLauncher`.

## Part B — the Cascade desktop app (`src-tauri/`, `src/style.css`)

- `src-tauri/tauri.conf.json`: delete the `macOS` bundle block; the icon list keeps only PNG entries.
- `src-tauri/src/export.rs`: delete `RENAME_EXCL`, the macOS `renamex_np` branch and the non-Linux `fs::rename`
  fallback; the Linux `renameat2` code stays and loses its `cfg` (the crate is Linux-only).
- `src-tauri/src/main.rs`: delete the `windows_subsystem` line and its comment.
- `src-tauri/icons/`: `git rm` everything nothing references: `ios/`, `android/`, `Square*Logo.png`,
  `StoreLogo.png`, `icon.ico`, `icon.icns`. Before deleting, grep the repo (config, scripts, Rust, the install
  script) for each name; keep any file that is referenced.
- `src/style.css:5`: `font-family: Inter, ui-sans-serif, sans-serif;` (same resolved font on Linux).

Verify: `npm run check` exits 0 (it runs cargo fmt, clippy and test for `src-tauri`);
`npm run tauri -- build --no-bundle` exits 0 with `CARGO_TARGET_DIR` unchanged from what
`scripts/install-linux-app.sh` uses; `grep -rniE "macos|darwin|renamex|windows_subsystem|icns" src-tauri/src
src-tauri/tauri.conf.json src-tauri/Cargo.toml` is empty.

## After both parts (lead)

One `qa-engine` pass on the merged result, one fresh read-only sweep for leftovers, rebuild and install the
app, then commit and push to `main` (owner's instruction of 2026-11-11).
