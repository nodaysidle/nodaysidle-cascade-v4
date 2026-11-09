#!/usr/bin/env bash
# Build and install NODAYSIDLE Cascade V4 for the current Linux user, then add the
# Omarchy menu entry and bar widget. Usage: scripts/install-linux-app.sh [--no-build]
set -euo pipefail
cd "$(dirname "$0")/.."

build=true
for arg in "$@"; do
  case "$arg" in
    --no-build) build=false ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

if [ "$build" = true ]; then
  # The Tauri CLI embeds the frontend; a plain cargo build loads the dev URL (localhost:1420) instead.
  npm run tauri -- build --no-bundle
fi

binary="src-tauri/target/release/nodaysidle-cascade-v4"
[ -x "$binary" ] || { echo "Missing $binary; run without --no-build" >&2; exit 1; }

install_dir="$HOME/.local"
app_id="com.nodaysidle.cascade.v4"
mkdir -p "$install_dir/bin" "$install_dir/share/applications" "$install_dir/share/icons/hicolor/128x128/apps"
install -m755 "$binary" "$install_dir/bin/nodaysidle-cascade-v4"
install -m644 src-tauri/icons/128x128.png "$install_dir/share/icons/hicolor/128x128/apps/nodaysidle-cascade-v4.png"
cat > "$install_dir/share/applications/$app_id.desktop" <<DESKTOP
[Desktop Entry]
Name=NODAYSIDLE Cascade V4
Comment=Compile one idea into five agent-ready contracts
Exec=$install_dir/bin/nodaysidle-cascade-v4
Icon=nodaysidle-cascade-v4
Terminal=false
Type=Application
Categories=Development;
StartupWMClass=$app_id
DESKTOP

# Extend the Omarchy menu with a real app row. The file is JSONC with comments.
menu="$HOME/.config/omarchy/extensions/omarchy-menu.jsonc"
if [ -f "$menu" ] && ! grep -q 'apps.cascade-v4' "$menu"; then
  python3 - "$menu" <<'PY'
import sys
from pathlib import Path
path = Path(sys.argv[1])
text = path.read_text()
entry = '''  // Cascade V4
  "apps.cascade-v4": {
    "icon": "󰈙",
    "label": "Cascade V4",
    "description": "One idea into five agent-ready contracts",
    "action": "uwsm-app -- gtk-launch com.nodaysidle.cascade.v4.desktop"
  },
'''
index = text.rfind("}")
if index < 0:
    raise SystemExit("menu file has no closing brace")
head = text[:index].rstrip()
if head and not head.endswith((",", "{")):
    head += ","
path.write_text(head + "\n" + entry + text[index:])
PY
  omarchy-menu refresh >/dev/null 2>&1 || true
fi

# Install the Omarchy bar widget when the shell is present.
if command -v omarchy >/dev/null 2>&1 && [ -d omarchy/plugin ]; then
  plugin_dir="$HOME/.config/omarchy/plugins/nodaysidle.cascade-v4"
  mkdir -p "$plugin_dir"
  cp omarchy/plugin/manifest.json omarchy/plugin/BarWidget.qml "$plugin_dir/"
  omarchy-shell shell rescanPlugins >/dev/null 2>&1 || true
  omarchy plugin enable nodaysidle.cascade-v4 >/dev/null 2>&1 || true
  omarchy bar move nodaysidle.cascade-v4 right >/dev/null 2>&1 || true
fi

echo "Installed NODAYSIDLE Cascade V4 under $install_dir"
