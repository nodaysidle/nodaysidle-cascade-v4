# 013 — The Tauri kit installs the release binary instead of building an AppImage (finding P)

Owner said yes on 2026-11-11 ("do as you recommend").

## Why

Build test of 2026-11-11: a Gemini agent built the Scratch Pad packet. The last task's command
`./scripts/package_linux.sh` cannot pass on the owner's Arch machine with Tauri's stock tools:

- `npm run tauri -- build --bundles appimage` runs linuxdeploy, whose bundled `strip` (binutils 2.35) rejects
  the `.relr.dyn` section of Arch libraries;
- with `NO_STRIP=true`, `linuxdeploy-plugin-gtk.sh` stops on `realpath: /usr/lib/gdk-pixbuf-2.0/2.10.0: No such
  file or directory` (Arch no longer ships that folder).

Reproduced by the lead on a copy of the kit with a fresh tool download. The agent got through only by patching
the tools in `~/.cache/tauri`. The compiler's kit check never ran the script (`bash -n` only,
`tests/kit-build.test.ts`). Cascade V4 itself is installed by `scripts/install-linux-app.sh`, which builds with
`npm run tauri -- build --no-bundle` and installs the plain release binary. The kit does the same from now on.

## Change

No product name anywhere. Failing test first (step 1), then the code.

### 1. Test first — `tests/tauri-linux-binary.test.ts` (new)

Compile one existing Tauri fixture blueprint with `{ linuxPackaging: "binary", wayland: true }` and assert:

- no document and no kit file contains `appimage` in any letter case;
- `kit/scripts/package_linux.sh` contains `npm run tauri -- build --no-bundle`, the line
  `BINARY="${CARGO_TARGET_DIR:-src-tauri/target}/release/$SLUG"`, `install -m755 "dist/$SLUG" "$INSTALL_DIR/bin/$SLUG"`
  and `Exec=env GDK_BACKEND=wayland $INSTALL_DIR/bin/$SLUG`;
- with `wayland: false` the Exec line is `Exec=$INSTALL_DIR/bin/$SLUG`;
- the packet's artifact path is `dist/<slug>` and the validation commands still end with `./scripts/package_linux.sh`;
- `resolvePresetOptions("tauri2-rust-typescript-desktop", [])` gives `linuxPackaging: "binary"`, and
  `["linuxPackaging=appimage"]` gives an issue.

Run it, see it fail, then go on.

### 2. `src/tauriKit.ts` — `packageLinuxScript`

Replace the body so the emitted script is exactly this shape (identity values interpolated as today):

```bash
#!/usr/bin/env bash
# Build the release binary, install it for the current user, and add the desktop entry.
# Usage: scripts/package_linux.sh [--install]
set -euo pipefail

cd "$(dirname "$0")/.."
SLUG="<slug>"
APP_NAME=<shellWord(projectName)>
INSTALL_DIR="$HOME/.local"

install=false
for arg in "$@"; do
  case "$arg" in
    --install) install=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

[ -f src-tauri/icons/128x128.png ] || npm run tauri -- icon app-icon.svg
npm run tauri -- build --no-bundle

BINARY="${CARGO_TARGET_DIR:-src-tauri/target}/release/$SLUG"
if [ ! -x "$BINARY" ]; then
  echo "Release binary was not produced: $BINARY" >&2
  exit 1
fi
mkdir -p dist
cp "$BINARY" "dist/$SLUG"

if [ "$install" = false ]; then
  echo "Built dist/$SLUG; rerun with --install to install it."
  exit 0
fi

mkdir -p "$INSTALL_DIR/bin" "$INSTALL_DIR/share/applications" "$INSTALL_DIR/share/icons/hicolor/128x128/apps"
if [ -f "$INSTALL_DIR/bin/$SLUG" ]; then
  mkdir -p dist/rollback
  cp "$INSTALL_DIR/bin/$SLUG" "dist/rollback/$SLUG"
fi
install -m755 "dist/$SLUG" "$INSTALL_DIR/bin/$SLUG"
install -m644 src-tauri/icons/128x128.png "$INSTALL_DIR/share/icons/hicolor/128x128/apps/$SLUG.png"
cat > "$INSTALL_DIR/share/applications/<bundleId>.desktop" <<DESKTOP
[Desktop Entry]
Name=$APP_NAME
Comment=$APP_NAME
Exec=<"env GDK_BACKEND=wayland " when wayland>$INSTALL_DIR/bin/$SLUG
Icon=$SLUG
Terminal=false
Type=Application
Categories=Utility;
StartupWMClass=<bundleId>
DESKTOP
echo "Installed $APP_NAME under $INSTALL_DIR"
```

The release binary's name is the Cargo package name, which the kit already sets to the slug
(`name = "${identity.slug}"` in the Cargo.toml template). Confirm that and say so in the report; if it is not
the slug in some case, stop and report.

In the same file, the kit README line about the script becomes:

`- scripts/package_linux.sh builds the release binary without a bundle, copies it to dist/, and with --install installs it under ~/.local/bin with a desktop entry and icon. On Arch/Omarchy use it for local proof; the installed desktop entry starts it on Wayland with GDK_BACKEND=wayland.`

`tauri.conf.json` (`bundle` block) stays as it is.

### 3. `src/tauriContracts.ts` — the Linux overrides

- packaging rule 3: `The packet targets Linux only: scripts/package_linux.sh builds the release binary without a bundle, and the installed desktop entry is validated before the launch smoke.`
- packaging rule 5: `Verify the built binary before the launch smoke.`
- installationDecision: `For local proof, run ./scripts/package_linux.sh --install: it builds the release binary, installs it under ~/.local/bin with a desktop entry and icon, and keeps the previous binary in dist/rollback/ as the rollback copy; then launch the installed identity.`
- signingDecision: `Local proof is unsigned. Record the SHA-256 checksum of the built binary in the completion report.`
- outputArtifact: `Linux release binary`
- artifactPath: `` `dist/${identity.slug}` ``
- completion evidence line 3: `scripts/package_linux.sh builds the release binary, which installs and launches.`

### 4. `src/presets.ts` — the option

`{ id: "linuxPackaging", label: "Linux package", type: "select", values: ["binary"], default: "binary", description: "The packaging script installs the release binary under ~/.local/bin." }`

The Linux-only switch stays "any non-empty string" (`src/tauriKit.ts`, `src/tauriContracts.ts`), so a caller that
still passes `"appimage"` to `compilePacket` gets the same Linux packet. Leave the base (non-Linux) preset texts
in `src/presets.ts` alone: they are not reached when the option has its default.

### 5. Existing tests and fixtures

Every test that passes `linuxPackaging: "appimage"` passes `"binary"`. Update the assertions that name the
AppImage (`tests/tauri-expense.test.ts` Exec line, the test title in `tests/tauri-notes.test.ts`, any snapshot or
golden text). Do not touch `tests/fixtures/round12-reviews/`. If Cascade's own `README.md` or `docs/` say that a
Tauri packet builds an AppImage, correct that sentence; leave `docs/HANDOFF.md` and `plans/` to the lead.

### 6. The kit checks run the script for real

- `tests/kit-build.test.ts`: replace `run("bash", ["-n", "scripts/package_linux.sh"], tauriRoot)` with a real run
  of `bash scripts/package_linux.sh` (no `--install`), placed after the `cargo test` line and with the same `env`,
  then assert that `dist/<slug>` exists and is executable.
- `scripts/agent-ready/build-round-kits.sh`: add `./scripts/package_linux.sh` as the last Tauri command.
- Do not add it to the in-app kit build (it would add a release build to every paid run); say in the report
  where that command list lives so the lead can record it.

## Verify (report each with its exit code)

1. The new test fails before step 2 and passes after.
2. `npm run check` exits 0.
3. `CASCADE_KIT_BUILD=1 npx vitest run tests/kit-build.test.ts` exits 0 on this machine (this is the proof that
   the script works with stock tools). Use `CARGO_TARGET_DIR` as that test already does; write no build output
   under `/tmp`.
4. Recompile the saved blueprints of the five round-12 presets from `main` and from the branch
   (`npm run -s cascade -- compile --preset <id> --blueprint <file> --out <dir>`, output under
   `$HOME/.cache/cascade-v4/tmp/`): the four non-Tauri presets are byte-identical; for Tauri, list the changed
   lines (expected: only packaging texts, the script, the option value, the artifact path).
5. `grep -rni appimage src` shows only the base (non-Linux) preset texts in `src/presets.ts`.

## Out of scope

Findings Q to W. The macOS script. The base preset's "AppImage or deb" texts. Any change to an audit check or to
the review brief.
