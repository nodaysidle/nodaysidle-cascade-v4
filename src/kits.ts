import { androidKit } from "./androidKit"
import { astroKit } from "./astroKit"
import { tauriKitFiles, tauriKitReadme, tauriKitUses } from "./tauriKit"
import type { NormalizedBlueprint } from "./compiler"
import type { PresetId, ProjectIdentity } from "./presets"

export interface KitFile {
  readonly path: string
  readonly content: string
}

function file(path: string, content: string): KitFile {
  return { path, content: content.trimStart() }
}

function crateName(slug: string): string {
  return slug.replaceAll("-", "_")
}

function xmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[character]!)
}

function gtkKit(identity: ProjectIdentity, blueprint: NormalizedBlueprint): KitFile[] {
  const slug = identity.slug
  const crate = crateName(slug)
  const needsBackground = blueprint.platformNeeds.includes("background-execution") || blueprint.platformNeeds.includes("launch-at-login")
  return [
    file("README.md", String.raw`
# Starter kit

Copy the foundation files listed in TASKS.md before TASK-01. Copy a packaging-owned file (PKGBUILD,
scripts/package.sh, resources/, LICENSE) when TASK-08 starts, using the kit content as the starting
point. Keep every helper listed here and extend it; do not replace the composition root, the storage
helpers, or the error path with a test double.

Shipped helpers:
- src/lib.rs, src/main.rs, src/app.rs: AdwApplication entry and one window.
- src/state.rs: AppState.
- src/config.rs, src/paths.rs: atomic JSON settings under XDG config.
- src/platform/atomic_file.rs: same-directory temporary file and rename.
- src/platform/sqlite.rs: SQLite with PRAGMA user_version.
- src/platform/credentials.rs: Secret Service through the keyring crate.
- src/platform/http.rs: one reqwest client.
- src/platform/runtime.rs: one shared tokio runtime for async work.
- tests/contract_tests.rs: storage, path, and SQLite tests.

The task that owns a platform owner adds its module to src/platform/mod.rs; a feature owner adds
its module to src/features/mod.rs and constructs it in src/app.rs.
`),
    file("LICENSE", String.raw`
MIT License

Copyright (c) 2026 ${identity.projectName} contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`),
    file("Cargo.toml", String.raw`
[package]
name = "${slug}"
version = "0.1.0"
edition = "2024"
rust-version = "1.85"

[dependencies]
adw = { package = "libadwaita", version = "0.9", features = ["v1_6"] }
gtk = { package = "gtk4", version = "0.11" }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.41", features = ["bundled"] }
keyring = "4.2"
reqwest = { version = "0.13", default-features = false, features = ["json", "rustls"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync", "time"] }
dirs = "7"
thiserror = "2"
tracing = "0.1"
tracing-subscriber = "0.3"
tempfile = "3"

[dev-dependencies]
tempfile = "3"
`),
    file("src/lib.rs", String.raw`
pub mod app;
pub mod config;
pub mod features;
pub mod paths;
pub mod platform;
pub mod state;
`),
    file("src/main.rs", String.raw`
use adw::prelude::*;

fn main() -> gtk::glib::ExitCode {
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .init();
    let application = adw::Application::builder()
        .application_id("${identity.bundleId}")
        .build();
    application.connect_activate(|application| {
        let window = ${crate}::app::build_window(application);
        window.present();
    });
    application.run()
}
`),
    file("src/app.rs", String.raw`
use adw::prelude::*;

use crate::state::AppState;

pub fn build_window(application: &adw::Application) -> adw::ApplicationWindow {
    let window = adw::ApplicationWindow::builder()
        .application(application)
        .title("${identity.projectName}")
        .default_width(960)
        .default_height(640)
        .build();
    let header = adw::HeaderBar::new();
    let toolbar = adw::ToolbarView::new();
    toolbar.add_top_bar(&header);
    let label = gtk::Label::new(Some("${identity.projectName}"));
    label.set_margin_top(24);
    label.set_margin_bottom(24);
    label.set_margin_start(24);
    label.set_margin_end(24);
    toolbar.set_content(Some(&label));
    let toast = adw::ToastOverlay::new();
    toast.set_child(Some(&toolbar));
    window.set_content(Some(&toast));
    let _state = AppState::default();
    window
}
`),
    file("src/state.rs", String.raw`
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AppState {
    pub schema_version: u32,
    pub last_screen: String,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            schema_version: 1,
            last_screen: String::from("main"),
        }
    }
}
`),
    file("src/config.rs", String.raw`
use serde::{Deserialize, Serialize};

use crate::paths;
use crate::platform::atomic_file;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Settings {
    pub schema_version: u32,
    pub theme: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            schema_version: 1,
            theme: String::from("system"),
        }
    }
}

pub fn load() -> Settings {
    std::fs::read_to_string(paths::settings_path())
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub fn save(settings: &Settings) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(settings).map_err(|error| error.to_string())?;
    atomic_file::write_atomic(&paths::settings_path(), &bytes).map_err(|error| error.to_string())
}
`),
    file("src/paths.rs", String.raw`
use std::path::PathBuf;

pub fn config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from(".config"))
        .join("${identity.bundleId}")
}

pub fn data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from(".local/share"))
        .join("${identity.bundleId}")
}

pub fn runtime_dir() -> PathBuf {
    dirs::runtime_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("${identity.bundleId}")
}

pub fn settings_path() -> PathBuf {
    config_dir().join("settings.json")
}

pub fn database_path() -> PathBuf {
    data_dir().join("records.sqlite3")
}

pub fn app_files_dir() -> PathBuf {
    data_dir().join("files")
}

pub fn downloads_dir() -> PathBuf {
    dirs::download_dir()
        .or_else(|| dirs::home_dir().map(|home| home.join("Downloads")))
        .unwrap_or_else(|| PathBuf::from("Downloads"))
}

pub fn named_folder(name: &str) -> PathBuf {
    downloads_dir().join(name)
}
`),
    file("src/platform/mod.rs", String.raw`
pub mod atomic_file;
pub mod credentials;
pub mod http;
pub mod runtime;
pub mod sqlite;
`),
    file("src/platform/atomic_file.rs", String.raw`
use std::fs;
use std::io::Write;
use std::path::Path;

pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent)?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    temporary.write_all(bytes)?;
    temporary.as_file().sync_all()?;
    temporary.persist(path).map_err(|error| error.error)?;
    Ok(())
}
`),
    file("src/platform/sqlite.rs", String.raw`
use std::path::Path;

use rusqlite::Connection;

pub struct Database {
    connection: Connection,
}

impl Database {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
        }
        let connection = Connection::open(path)?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        let database = Self { connection };
        database.migrate()?;
        Ok(database)
    }

    fn migrate(&self) -> rusqlite::Result<()> {
        let version: i64 = self
            .connection
            .pragma_query_value(None, "user_version", |row| row.get(0))?;
        if version < 1 {
            self.connection.pragma_update(None, "user_version", 1)?;
        }
        Ok(())
    }

    pub fn connection(&self) -> &Connection {
        &self.connection
    }
}
`),
    file("src/platform/credentials.rs", String.raw`
pub trait SecretStore {
    fn get(&self, account: &str) -> Result<Option<String>, String>;
    fn set(&self, account: &str, value: &str) -> Result<(), String>;
    fn delete(&self, account: &str) -> Result<(), String>;
}

pub struct KeyringStore {
    service: String,
}

impl KeyringStore {
    pub fn new(service: impl Into<String>) -> Self {
        Self {
            service: service.into(),
        }
    }
}

impl SecretStore for KeyringStore {
    fn get(&self, account: &str) -> Result<Option<String>, String> {
        let entry =
            keyring::Entry::new(&self.service, account).map_err(|error| error.to_string())?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(error.to_string()),
        }
    }

    fn set(&self, account: &str, value: &str) -> Result<(), String> {
        let entry =
            keyring::Entry::new(&self.service, account).map_err(|error| error.to_string())?;
        entry.set_password(value).map_err(|error| error.to_string())
    }

    fn delete(&self, account: &str) -> Result<(), String> {
        let entry =
            keyring::Entry::new(&self.service, account).map_err(|error| error.to_string())?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }
}
`),
    file("src/platform/http.rs", String.raw`
use std::time::Duration;

pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .expect("HTTP client construction is infallible for the default configuration")
}
`),
    file("src/platform/runtime.rs", String.raw`
use std::sync::OnceLock;

use tokio::runtime::{Builder, Runtime};

static RUNTIME: OnceLock<Runtime> = OnceLock::new();

pub fn runtime() -> &'static Runtime {
    RUNTIME.get_or_init(|| {
        Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("tokio runtime construction is infallible for the default configuration")
    })
}
`),
    file("src/features/mod.rs", String.raw`
// Feature owners are added by the tasks in TASKS.md. Each feature file owns one capability and
// depends only on the platform traits in this crate.
`),
    file("tests/contract_tests.rs", String.raw`
use ${crate}::config::Settings;
use ${crate}::paths;
use ${crate}::platform::atomic_file;
use ${crate}::platform::sqlite::Database;

#[test]
fn settings_round_trip_is_atomic() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let path = directory.path().join("settings.json");
    let bytes = br#"{"schema_version":1,"theme":"system"}"#;
    atomic_file::write_atomic(&path, bytes).expect("write settings");
    let read = std::fs::read(&path).expect("read settings");
    assert_eq!(read, bytes);
}

#[test]
fn sqlite_sets_user_version() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let path = directory.path().join("records.sqlite3");
    let database = Database::open(&path).expect("open database");
    let version: i64 = database
        .connection()
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .expect("read user_version");
    assert!(version >= 1);
    drop(database);
}

#[test]
fn settings_default_is_stable() {
    assert_eq!(Settings::default().theme, "system");
    assert!(paths::settings_path().ends_with("settings.json"));
}
`),
    file(`resources/${slug}.desktop`, String.raw`
[Desktop Entry]
Name=${identity.projectName}
Comment=${identity.projectName} desktop application
Exec=${slug}
Icon=${slug}
Terminal=false
Type=Application
Categories=Utility;
StartupWMClass=${identity.bundleId}
`),
    file(`resources/${slug}.metainfo.xml`, String.raw`
<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>${identity.bundleId}</id>
  <name>${identity.projectName}</name>
  <summary>${xmlEscape(blueprint.productDefinition).slice(0, 80)}</summary>
  <description>
    <p>${xmlEscape(blueprint.productDefinition)}</p>
  </description>
  <metadata_license>MIT</metadata_license>
  <project_license>MIT</project_license>
  <developer id="com.nodaysidle">
    <name>NODAYSIDLE</name>
  </developer>
  <url type="homepage">https://github.com/nodaysidle</url>
  <releases>
    <release version="0.1.0" date="2026-11-09"/>
  </releases>
  <content_rating type="oars-1.1"/>
  <launchable type="desktop-id">${slug}.desktop</launchable>
</component>
`),
    file(`resources/icons/hicolor/scalable/apps/${slug}.svg`, String.raw`
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="24" fill="#0B0F14"/>
  <path d="M30 88V40h12l22 28 22-28h12v48H86V60L64 88 42 60v28z" fill="#4C8C6B"/>
</svg>
`),
    ...(needsBackground ? [file(`resources/${slug}.service`, String.raw`
[Unit]
Description=${identity.projectName}
After=graphical-session.target
PartOf=graphical-session.target

[Service]
ExecStart=%h/.local/bin/${slug}
Restart=on-failure

[Install]
WantedBy=default.target
`)] : []),
    file("PKGBUILD", String.raw`
pkgname=${slug}
pkgver=0.1.0
pkgrel=1
pkgdesc="${identity.projectName}"
arch=('x86_64' 'aarch64')
url="https://github.com/nodaysidle"
license=('MIT')
depends=('gtk4' 'libadwaita' 'dbus')
makedepends=('cargo')
source=()

build() {
  cd "$startdir"
  cargo build --release
}

package() {
  install -Dm755 "$startdir/target/release/${slug}" "$pkgdir/usr/bin/${slug}"
  install -Dm644 "$startdir/resources/${slug}.desktop" "$pkgdir/usr/share/applications/${slug}.desktop"
  install -Dm644 "$startdir/resources/${slug}.metainfo.xml" "$pkgdir/usr/share/metainfo/${slug}.metainfo.xml"
  install -Dm644 "$startdir/resources/icons/hicolor/scalable/apps/${slug}.svg" "$pkgdir/usr/share/icons/hicolor/scalable/apps/${slug}.svg"
  install -Dm644 "$startdir/LICENSE" "$pkgdir/usr/share/licenses/${slug}/LICENSE"
}
`),
    file("scripts/package.sh", String.raw`
#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

install=0
for argument in "$@"; do
  case "$argument" in
    --install) install=1 ;;
    *) echo "Unknown argument: $argument" >&2; exit 2 ;;
  esac
done

install_dir="$HOME/.local"
app_id="${slug}"
binary="target/release/${slug}"

cargo build --release

mkdir -p dist
cp "target/release/${slug}" "dist/${slug}"

if [ "$install" -eq 0 ]; then
  echo "Built dist/${slug}; rerun with --install to install it."
  exit 0
fi

if [ -f "$install_dir/bin/${slug}" ]; then
  mkdir -p dist/rollback
  cp "$install_dir/bin/${slug}" "dist/rollback/${slug}"
fi

mkdir -p "$install_dir/bin" "$install_dir/share/applications" "$install_dir/share/metainfo" "$install_dir/share/icons/hicolor/scalable/apps"
install -m755 "$binary" "$install_dir/bin/${slug}"
install -m644 "resources/${slug}.desktop" "$install_dir/share/applications/${slug}.desktop"
install -m644 "resources/${slug}.metainfo.xml" "$install_dir/share/metainfo/${slug}.metainfo.xml"
install -m644 "resources/icons/hicolor/scalable/apps/${slug}.svg" "$install_dir/share/icons/hicolor/scalable/apps/${slug}.svg"

if [ -f "resources/${slug}.service" ]; then
  mkdir -p "$HOME/.config/systemd/user"
  install -m644 "resources/${slug}.service" "$HOME/.config/systemd/user/${slug}.service"
  systemctl --user daemon-reload
fi

echo "Installed $app_id under $install_dir"
`),
  ]
}

function waybarKit(identity: ProjectIdentity, blueprint: NormalizedBlueprint, options: Readonly<Record<string, string | boolean | readonly string[]>> = {}): KitFile[] {
  const slug = identity.slug
  const crate = crateName(slug)
  const service = true
  const refresh = options.refreshSeconds === "60" || options.refreshSeconds === "5" ? options.refreshSeconds : "15"
  const tooltip = options.tooltip === false ? false : true
  return [
    file("README.md", String.raw`
# Starter kit

Copy the foundation files listed in TASKS.md before TASK-01. Copy a packaging-owned file (PKGBUILD,
scripts/package.sh, resources/, LICENSE) when TASK-08 starts, using the kit content as the starting
point. Keep every helper listed here and extend it; do not replace the composition root or the module
output path with a test double.

Shipped helpers:
- src/lib.rs, src/main.rs: CLI entry with --once, --action, and --service.
- src/module.rs: one JSON object on stdout and the systemd refresh loop.
- src/config.rs, src/paths.rs: atomic JSON settings under XDG config.
- src/platform/atomic_file.rs, sqlite.rs, credentials.rs, http.rs: the same platform boundaries as
  the desktop kit.
- resources/waybar/config.jsonc and style.css: the module fragment.
- tests/contract_tests.rs, tests/module_output_tests.rs: storage and output-shape tests.
`),
    file("LICENSE", String.raw`
MIT License

Copyright (c) 2026 ${identity.projectName} contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`),
    file("Cargo.toml", String.raw`
[package]
name = "${slug}"
version = "0.1.0"
edition = "2024"
rust-version = "1.85"

[dependencies]
clap = { version = "4.6", features = ["derive"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.41", features = ["bundled"] }
keyring = "4.2"
reqwest = { version = "0.13", default-features = false, features = ["json", "rustls"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync", "time"] }
dirs = "7"
thiserror = "2"
tracing = "0.1"
tracing-subscriber = "0.3"
tempfile = "3"

[dev-dependencies]
tempfile = "3"
`),
    file("src/lib.rs", String.raw`
pub mod config;
pub mod features;
pub mod module;
pub mod paths;
pub mod platform;
`),
    file("src/main.rs", String.raw`
use clap::Parser;

#[derive(Parser)]
struct Arguments {
    #[arg(long)]
    once: bool,
    #[arg(long)]
    action: Option<String>,
    #[arg(long)]
    service: bool,
}

fn main() {
    let arguments = Arguments::parse();
    if arguments.service {
        ${crate}::module::run_service();
        return;
    }
    let _ = arguments.once;
    println!(
        "{}",
        ${crate}::module::render(arguments.action.as_deref())
    );
}
`),
    file("src/module.rs", String.raw`
use serde::Serialize;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::config;
use crate::paths;
use crate::platform::atomic_file;

#[derive(Debug, Serialize)]
struct ModuleOutput {
    text: String,
    alt: String,
    tooltip: String,
    class: String,
    percentage: Option<u8>,
}

pub fn render(action: Option<&str>) -> String {
    let settings = config::load();
    let text = match action {
        Some(action) => format!("{}: {}", settings.text, action),
        None => settings.text.clone(),
    };
    let output = ModuleOutput {
        text,
        alt: String::from("module"),
        tooltip: settings.tooltip.clone(),
        class: String::from("ready"),
        percentage: None,
    };
    serde_json::to_string(&output)
        .unwrap_or_else(|_| String::from(r#"{"text":"!","class":"error"}"#))
}

pub fn run_service() {
    loop {
        let interval = config::load().refresh_seconds.max(5);
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let _ = atomic_file::write_atomic(&paths::cache_path(), now.to_string().as_bytes());
        std::thread::sleep(Duration::from_secs(interval as u64));
    }
}
`),
    file("src/config.rs", String.raw`
use serde::{Deserialize, Serialize};

use crate::paths;
use crate::platform::atomic_file;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Settings {
    pub schema_version: u32,
    pub text: String,
    pub tooltip: String,
    pub refresh_seconds: u32,
    pub enabled: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            schema_version: 1,
            text: String::from("${identity.projectName}"),
            tooltip: String::from("${identity.projectName}"),
            refresh_seconds: 900,
            enabled: true,
        }
    }
}

pub fn load() -> Settings {
    std::fs::read_to_string(paths::settings_path())
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub fn save(settings: &Settings) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(settings).map_err(|error| error.to_string())?;
    atomic_file::write_atomic(&paths::settings_path(), &bytes).map_err(|error| error.to_string())
}
`),
    file("src/paths.rs", String.raw`
use std::path::PathBuf;

pub fn config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from(".config"))
        .join("${identity.bundleId}")
}

pub fn data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from(".local/share"))
        .join("${identity.bundleId}")
}

pub fn runtime_dir() -> PathBuf {
    dirs::runtime_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("${identity.bundleId}")
}

pub fn settings_path() -> PathBuf {
    config_dir().join("config.json")
}

pub fn database_path() -> PathBuf {
    data_dir().join("records.sqlite3")
}

pub fn cache_path() -> PathBuf {
    runtime_dir().join("cache.json")
}
`),
    file("src/platform/mod.rs", String.raw`
pub mod atomic_file;
pub mod credentials;
pub mod http;
pub mod runtime;
pub mod sqlite;
`),
    file("src/platform/atomic_file.rs", String.raw`
use std::fs;
use std::io::Write;
use std::path::Path;

pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent)?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    temporary.write_all(bytes)?;
    temporary.as_file().sync_all()?;
    temporary.persist(path).map_err(|error| error.error)?;
    Ok(())
}
`),
    file("src/platform/sqlite.rs", String.raw`
use std::path::Path;

use rusqlite::Connection;

pub struct Database {
    connection: Connection,
}

impl Database {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
        }
        let connection = Connection::open(path)?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        let database = Self { connection };
        database.migrate()?;
        Ok(database)
    }

    fn migrate(&self) -> rusqlite::Result<()> {
        let version: i64 = self
            .connection
            .pragma_query_value(None, "user_version", |row| row.get(0))?;
        if version < 1 {
            self.connection.pragma_update(None, "user_version", 1)?;
        }
        Ok(())
    }

    pub fn connection(&self) -> &Connection {
        &self.connection
    }
}
`),
    file("src/platform/credentials.rs", String.raw`
pub trait SecretStore {
    fn get(&self, account: &str) -> Result<Option<String>, String>;
    fn set(&self, account: &str, value: &str) -> Result<(), String>;
    fn delete(&self, account: &str) -> Result<(), String>;
}

pub struct KeyringStore {
    service: String,
}

impl KeyringStore {
    pub fn new(service: impl Into<String>) -> Self {
        Self {
            service: service.into(),
        }
    }
}

impl SecretStore for KeyringStore {
    fn get(&self, account: &str) -> Result<Option<String>, String> {
        let entry =
            keyring::Entry::new(&self.service, account).map_err(|error| error.to_string())?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(error.to_string()),
        }
    }

    fn set(&self, account: &str, value: &str) -> Result<(), String> {
        let entry =
            keyring::Entry::new(&self.service, account).map_err(|error| error.to_string())?;
        entry.set_password(value).map_err(|error| error.to_string())
    }

    fn delete(&self, account: &str) -> Result<(), String> {
        let entry =
            keyring::Entry::new(&self.service, account).map_err(|error| error.to_string())?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }
}
`),
    file("src/platform/http.rs", String.raw`
use std::time::Duration;

pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .expect("HTTP client construction is infallible for the default configuration")
}
`),
    file("src/platform/runtime.rs", String.raw`
use std::sync::OnceLock;

use tokio::runtime::{Builder, Runtime};

static RUNTIME: OnceLock<Runtime> = OnceLock::new();

pub fn runtime() -> &'static Runtime {
    RUNTIME.get_or_init(|| {
        Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("tokio runtime construction is infallible for the default configuration")
    })
}
`),
    file("src/features/mod.rs", String.raw`
// Feature owners are added by the tasks in TASKS.md. Each feature file owns one capability and
// depends only on the platform traits in this crate.
`),
    file("tests/contract_tests.rs", String.raw`
use ${crate}::config::Settings;
use ${crate}::paths;
use ${crate}::platform::atomic_file;
use ${crate}::platform::sqlite::Database;

#[test]
fn settings_round_trip_is_atomic() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let path = directory.path().join("config.json");
    let bytes = br#"{"schema_version":1,"text":"ok","tooltip":"ok","refresh_seconds":15}"#;
    atomic_file::write_atomic(&path, bytes).expect("write settings");
    let read = std::fs::read(&path).expect("read settings");
    assert_eq!(read, bytes);
}

#[test]
fn sqlite_sets_user_version() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let path = directory.path().join("records.sqlite3");
    let database = Database::open(&path).expect("open database");
    let version: i64 = database
        .connection()
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .expect("read user_version");
    assert!(version >= 1);
    drop(database);
}

#[test]
fn settings_default_is_stable() {
    assert_eq!(Settings::default().refresh_seconds, 900);
    assert!(paths::settings_path().ends_with("config.json"));
}
`),
    file("tests/module_output_tests.rs", String.raw`
use ${crate}::module;

#[test]
fn output_is_one_json_object() {
    let output = module::render(None);
    let value: serde_json::Value = serde_json::from_str(&output).expect("valid JSON");
    assert!(value.get("text").and_then(|item| item.as_str()).is_some());
    assert!(value.get("class").and_then(|item| item.as_str()).is_some());
    assert!(!output.contains("password"));
    assert!(!output.contains("token"));
}
`),
    file("resources/waybar/config.jsonc", String.raw`
{
  "custom/${slug}": {
    "exec": "~/.local/bin/${slug} --once",
    "interval": ${refresh},
    "return-type": "json",
    "tooltip": ${tooltip},
    "on-click": "~/.local/bin/${slug} --action toggle"
  }
}
`),
    file("resources/waybar/style.css", String.raw`
#custom-${slug} {
  padding: 0 8px;
}
`),
    ...(service ? [file(`resources/systemd/${slug}.service`, String.raw`
[Unit]
Description=${identity.projectName}
After=graphical-session.target
PartOf=graphical-session.target

[Service]
ExecStart=%h/.local/bin/${slug} --service
Restart=on-failure

[Install]
WantedBy=default.target
`)] : []),
    file("PKGBUILD", String.raw`
pkgname=${slug}
pkgver=0.1.0
pkgrel=1
pkgdesc="${identity.projectName}"
arch=('x86_64' 'aarch64')
url="https://github.com/nodaysidle"
license=('MIT')
depends=('dbus')
optdepends=('waybar: status bar')
makedepends=('cargo')
source=()

build() {
  cd "$startdir"
  cargo build --release
}

package() {
  install -Dm755 "$startdir/target/release/${slug}" "$pkgdir/usr/bin/${slug}"
  install -Dm644 "$startdir/resources/waybar/config.jsonc" "$pkgdir/etc/xdg/waybar/${slug}.jsonc"
  install -Dm644 "$startdir/resources/waybar/style.css" "$pkgdir/etc/xdg/waybar/${slug}.css"
  install -d "$pkgdir/usr/lib/systemd/user"
  sed 's|%h/.local/bin|/usr/bin|' "$startdir/resources/systemd/${slug}.service" > "$pkgdir/usr/lib/systemd/user/${slug}.service"
  chmod 644 "$pkgdir/usr/lib/systemd/user/${slug}.service"
  install -Dm644 "$startdir/LICENSE" "$pkgdir/usr/share/licenses/${slug}/LICENSE"
}
`),
    file("scripts/package.sh", String.raw`
#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

install=0
for argument in "$@"; do
  case "$argument" in
    --install) install=1 ;;
    *) echo "Unknown argument: $argument" >&2; exit 2 ;;
  esac
done

cargo build --release

mkdir -p "$HOME/.local/bin" "$HOME/.config/waybar" "$HOME/.config/systemd/user"
install -m755 "target/release/${slug}" "$HOME/.local/bin/${slug}"
install -m644 "resources/waybar/config.jsonc" "$HOME/.config/waybar/${slug}.jsonc"
install -m644 "resources/waybar/style.css" "$HOME/.config/waybar/${slug}.css"

if [ -f "resources/systemd/${slug}.service" ]; then
  install -m644 "resources/systemd/${slug}.service" "$HOME/.config/systemd/user/${slug}.service"
  systemctl --user daemon-reload
fi

echo "Installed ${slug} Waybar module under $HOME/.local"
echo "Add include = [\"$HOME/.config/waybar/${slug}.jsonc\"] to ~/.config/waybar/config.jsonc"
echo "Add @import \"$HOME/.config/waybar/${slug}.css\"; to ~/.config/waybar/style.css"
`),
  ]
}

export function presetKit(presetId: PresetId, identity: ProjectIdentity, blueprint: NormalizedBlueprint, options: Readonly<Record<string, string | boolean | readonly string[]>> = {}): readonly KitFile[] {
  if (presetId === "linux-wayland-gtk4-desktop") return gtkKit(identity, blueprint)
  if (presetId === "linux-hyprland-waybar-module") return waybarKit(identity, blueprint, options)
  if (presetId === "astro-web") return astroKit(identity, blueprint, options).map(item => ({ path: item.path, content: item.content }))
  if (presetId === "android-kotlin-compose") return androidKit(identity, blueprint).map(item => ({ path: item.path, content: item.content }))
  if (presetId === "tauri2-rust-typescript-desktop") {
    const uses = tauriKitUses(blueprint, nativeUsageDescriptions(identity, blueprint.platformNeeds))
    const files = tauriKitFiles(identity, uses)
    return [{ path: "README.md", content: tauriKitReadme(identity, files.map(item => item.path), uses) }, ...files]
  }
  return []
}

export function kitProjectPaths(kit: readonly KitFile[]): string[] {
  return kit.map(item => item.path)
}

export function nativeUsageDescriptions(_identity: ProjectIdentity, _platformNeeds: readonly string[]): ReadonlyArray<readonly [string, string]> {
  return []
}
