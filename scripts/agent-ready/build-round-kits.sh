# Usage: bash scripts/agent-ready/build-round-kits.sh /tmp/v4-roundN   (builds every kit with its own validation commands; prints only failures)
set -u
export CARGO_TARGET_DIR="$HOME/.cache/cascade-v4/target" TMPDIR="$HOME/.cache/cascade-v4/tmp" ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
mkdir -p "$CARGO_TARGET_DIR" "$TMPDIR" || exit 1
R="${1:?usage: build-round-kits.sh /tmp/v4-roundN}"
[ -d "$R" ] || { echo "not a folder: $R" >&2; exit 1; }
log="$TMPDIR/cascade-step.$$.log"   # one log per run, so several runs can build at once
step(){ "$@" >"$log" 2>&1; c=$?; echo "  $* -> $c"; [ $c -ne 0 ] && tail -12 "$log" | cut -c1-200; }
# Every build runs in a fresh temp copy; stop the whole script rather than build anywhere else.
mk(){ w=$(mktemp -d) && [ -d "$w" ] || { echo "mktemp failed" >&2; exit 1; }; cp -r "$1/kit/." "$w/" || exit 1; chmod +x "$w"/scripts/*.sh 2>/dev/null; cd "$w" || exit 1; }
done_kit(){ cd / && rm -rf -- "$w"; }
shopt -s nullglob
for d in "$R"/linux-wayland-gtk4-desktop/* "$R"/linux-hyprland-waybar-module/*; do echo "== $d"; mk "$d"; step cargo fmt --check; step cargo clippy --all-targets --all-features -- -D warnings; step cargo test; done_kit; done
for d in "$R"/astro-web/*; do echo "== $d"; mk "$d"; for c in "npm install --no-audit --no-fund" "npm run check" "npm test" "npm run build" "npm run test:a11y" "npm run audit:performance"; do step $c; done; done_kit; done
for d in "$R"/tauri2-rust-typescript-desktop/*; do echo "== $d"; mk "$d"; for c in "npm install --no-audit --no-fund" "npm run typecheck" "npm test" "npm run build" "npm run tauri -- icon app-icon.svg" "cargo fmt --manifest-path src-tauri/Cargo.toml -- --check" "cargo test --manifest-path src-tauri/Cargo.toml"; do step $c; done; done_kit; done
for d in "$R"/android-kotlin-compose/*; do echo "== $d"; mk "$d"; step ./scripts/gradle.sh assembleDebug testDebugUnitTest; done_kit; done
echo DONE
