# Usage: bash scripts/agent-ready/build-round-kits.sh /tmp/v4-roundN   (builds every kit with its own validation commands; prints only failures)
export CARGO_TARGET_DIR=$HOME/.cache/cascade-v4/target TMPDIR=$HOME/.cache/cascade-v4/tmp ANDROID_HOME=${ANDROID_HOME:-$HOME/Android/Sdk}
R=$1
step(){ "$@" >${TMPDIR:-/tmp}/cascade-step.log 2>&1; c=$?; echo "  $* -> $c"; [ $c -ne 0 ] && tail -12 ${TMPDIR:-/tmp}/cascade-step.log | cut -c1-200; }
mk(){ w=$(mktemp -d); cp -r $1/kit/. $w/; chmod +x $w/scripts/*.sh 2>/dev/null; cd $w; }
for d in $R/linux-wayland-gtk4-desktop/* $R/linux-hyprland-waybar-module/*; do echo "== $d"; mk $d; step cargo fmt --check; step cargo clippy --all-targets --all-features -- -D warnings; step cargo test; cd /; rm -rf $w; done
for d in $R/astro-web/*; do echo "== $d"; mk $d; for c in "npm install --no-audit --no-fund" "npm run check" "npm test" "npm run build" "npm run test:a11y" "npm run audit:performance"; do step $c; done; cd /; rm -rf $w; done
for d in $R/tauri2-rust-typescript-desktop/*; do echo "== $d"; mk $d; for c in "npm install --no-audit --no-fund" "npm run typecheck" "npm test" "npm run build" "npm run tauri -- icon app-icon.svg" "cargo fmt --manifest-path src-tauri/Cargo.toml -- --check" "cargo test --manifest-path src-tauri/Cargo.toml"; do step $c; done; cd /; rm -rf $w; done
for d in $R/android-kotlin-compose/*; do echo "== $d"; mk $d; step ./scripts/gradle.sh assembleDebug testDebugUnitTest; cd /; rm -rf $w; done
echo DONE
