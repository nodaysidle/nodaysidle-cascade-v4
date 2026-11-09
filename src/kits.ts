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

// AppStream wants one short sentence; cut at a word boundary, never mid-word.
function shortSummary(text: string): string {
  const sentence = text.split(/(?<=[.!?])\s/)[0]!.replace(/[.!?]$/, "")
  if (sentence.length <= 80) return sentence
  return sentence.slice(0, 80).replace(/\s+\S*$/, "")
}

function xmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[character]!)
}

function gtkKit(identity: ProjectIdentity, blueprint: NormalizedBlueprint): KitFile[] {
  const slug = identity.slug
  const crate = crateName(slug)
  const { records, secrets, http, optionalDeps } = rustKitHelpers(blueprint)
  const { settings, background: needsBackground, clock, dbus } = gtkKitFlags(blueprint)
  return [
    file("README.md", String.raw`
# Starter kit

Copy the foundation files listed in TASKS.md before TASK-01. Copy a packaging-owned file (PKGBUILD,
scripts/package.sh, resources/, LICENSE) when the packaging task starts, using the kit content as the starting
point. Keep every helper listed here and extend it; do not replace the composition root, the storage
helpers, or the error path with a test double.

Shipped helpers:
- src/lib.rs, src/main.rs, src/app.rs: adw::Application entry and one window.
- src/state.rs: AppState.
${settings ? "- src/config.rs, src/paths.rs: atomic JSON settings under XDG config.\n" : "- src/paths.rs: XDG data and runtime paths. This product declares no settings, so there is no settings file or settings type.\n"}- src/platform/atomic_file.rs: same-directory temporary file and rename.
${clock ? "- src/platform/clock.rs: the Clock trait and SystemClock; owners take time only through a Clock they are given.\n" : ""}${records ? "- src/platform/sqlite.rs: SQLite with PRAGMA user_version.\n" : ""}${secrets ? "- src/platform/credentials.rs: Secret Service through the keyring crate.\n" : ""}${http ? "- src/platform/http.rs: one reqwest client.\n" : ""}- src/platform/runtime.rs: one shared tokio runtime for async work.
- tests/contract_tests.rs: atomic write${settings ? ", settings" : ""}${records ? ", SQLite" : ""}${clock ? ", clock" : ""} and path tests.

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
${optionalDeps}
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
${settings ? "pub mod config;\n" : ""}pub mod features;
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
    ...(settings ? [file("src/config.rs", String.raw`
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
`)] : []),
    file("src/paths.rs", String.raw`
use std::path::PathBuf;

${settings ? `pub fn config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from(".config"))
        .join("${identity.bundleId}")
}

` : ""}pub fn data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from(".local/share"))
        .join("${identity.bundleId}")
}

pub fn runtime_dir() -> PathBuf {
    dirs::runtime_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("${identity.bundleId}")
}

${settings ? `pub fn settings_path() -> PathBuf {
    config_dir().join("settings.json")
}

` : ""}${records ? `pub fn database_path() -> PathBuf {
    data_dir().join("records.sqlite3")
}

` : ""}pub fn app_files_dir() -> PathBuf {
    data_dir().join("files")
}
`),
    file("src/platform/mod.rs", String.raw`
pub mod atomic_file;
${[...(clock ? ["pub mod clock;"] : []), ...(secrets ? ["pub mod credentials;"] : []), ...(http ? ["pub mod http;"] : []), "pub mod runtime;", ...(records ? ["pub mod sqlite;"] : [])].join("\n")}
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
    ...(records ? [file("src/platform/sqlite.rs", String.raw`
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
`)] : []),
    ...(secrets ? [file("src/platform/credentials.rs", String.raw`
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
`)] : []),
    ...(http ? [file("src/platform/http.rs", String.raw`
use std::time::Duration;

pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .expect("HTTP client construction is infallible for the default configuration")
}
`)] : []),
    ...(clock ? [file("src/platform/clock.rs", String.raw`
use std::time::{SystemTime, UNIX_EPOCH};

// The one source of time: owners take a Clock as a parameter; tests pass their own stepping or fixed clock.
pub trait Clock {
    fn now_millis(&self) -> i64;
}

pub struct SystemClock;

impl Clock for SystemClock {
    fn now_millis(&self) -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_millis() as i64)
            .unwrap_or(0)
    }
}
`)] : []),
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
${settings ? `use ${crate}::config::Settings;
` : ""}use ${crate}::paths;
use ${crate}::platform::atomic_file;
${clock ? `use ${crate}::platform::clock::{Clock, SystemClock};
` : ""}${records ? `use ${crate}::platform::sqlite::Database;
` : ""}
#[test]
fn atomic_write_replaces_existing_content() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let path = directory.path().join("value.json");
    atomic_file::write_atomic(&path, b"first").expect("first write");
    atomic_file::write_atomic(&path, b"second").expect("second write");
    assert_eq!(std::fs::read(&path).expect("read"), b"second");
}

#[test]
fn data_dir_is_named_after_the_application_id() {
    assert!(paths::data_dir().ends_with("${identity.bundleId}"));
}
${settings ? `
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
fn settings_default_is_stable() {
    assert_eq!(Settings::default().theme, "system");
    assert!(paths::settings_path().ends_with("settings.json"));
}
` : ""}${records ? `
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
` : ""}${clock ? `
#[test]
fn system_clock_reports_epoch_milliseconds() {
    assert!(SystemClock.now_millis() > 1_700_000_000_000);
}
` : ""}`),
    file(`resources/${identity.bundleId}.desktop`, String.raw`
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
    file(`resources/${identity.bundleId}.metainfo.xml`, String.raw`
<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>${identity.bundleId}</id>
  <name>${identity.projectName}</name>
  <summary>${xmlEscape(shortSummary(blueprint.productDefinition))}</summary>
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
  <launchable type="desktop-id">${identity.bundleId}.desktop</launchable>
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
depends=('gtk4' 'libadwaita'${dbus ? " 'dbus'" : ""})
makedepends=('cargo')
source=()

build() {
  cd "$startdir"
  cargo build --release
}

package() {
  install -Dm755 "$startdir/target/release/${slug}" "$pkgdir/usr/bin/${slug}"
  install -Dm644 "$startdir/resources/${identity.bundleId}.desktop" "$pkgdir/usr/share/applications/${identity.bundleId}.desktop"
  install -Dm644 "$startdir/resources/${identity.bundleId}.metainfo.xml" "$pkgdir/usr/share/metainfo/${identity.bundleId}.metainfo.xml"
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
install -m644 "resources/${identity.bundleId}.desktop" "$install_dir/share/applications/${identity.bundleId}.desktop"
install -m644 "resources/${identity.bundleId}.metainfo.xml" "$install_dir/share/metainfo/${identity.bundleId}.metainfo.xml"
install -m644 "resources/icons/hicolor/scalable/apps/${slug}.svg" "$install_dir/share/icons/hicolor/scalable/apps/${slug}.svg"

${needsBackground ? `if [ -f "resources/${slug}.service" ]; then
  mkdir -p "$HOME/.config/systemd/user"
  install -m644 "resources/${slug}.service" "$HOME/.config/systemd/user/${slug}.service"
  systemctl --user daemon-reload
fi

` : ""}echo "Installed $app_id under $install_dir"
`),
  ]
}

// The one place that decides which optional Waybar helpers a blueprint needs; the kit files, Cargo
// dependencies, and the locked stack all read it so they cannot drift apart.
export function rustKitHelpers(blueprint: NormalizedBlueprint): { records: boolean; secrets: boolean; http: boolean; optionalDeps: string } {
  const records = blueprint.persistenceNeeds.some(need => need.storage === "records")
  const secrets = blueprint.externalServices.some(item => item.credentialRequirement !== "none")
    || blueprint.domainData.some(item => item.storage === "secret")
  const http = blueprint.externalServices.length > 0 || blueprint.platformNeeds.includes("network")
  const optionalDeps = [
    ...(records ? ['rusqlite = { version = "0.41", features = ["bundled"] }'] : []),
    ...(secrets ? ['keyring = "4.2"'] : []),
    ...(http ? ['reqwest = { version = "0.13", default-features = false, features = ["json", "rustls"] }'] : []),
  ].join("\n")
  return { records, secrets, http, optionalDeps }
}

// The GTK kit, its locked stack text, and its preset wording all read these flags so they cannot drift apart.
export function gtkKitFlags(blueprint: NormalizedBlueprint): { settings: boolean; background: boolean; notifications: boolean; dbus: boolean; clock: boolean; portal: boolean; textFields: boolean; textLists: boolean } {
  const { secrets } = rustKitHelpers(blueprint)
  const notifications = blueprint.platformNeeds.includes("notifications")
  const fields = blueprint.domainData.flatMap(item => item.fields)
  return {
    settings: blueprint.persistenceNeeds.some(need => need.storage === "settings"),
    background: blueprint.platformNeeds.includes("background-execution") || blueprint.platformNeeds.includes("launch-at-login"),
    notifications,
    // keyring (Secret Service) and desktop notifications talk to the session bus.
    dbus: secrets || notifications,
    clock: fields.some(field => field.valueType === "date" || field.valueType === "date-time")
      || blueprint.features.some(feature => feature.runsEverySeconds !== null || feature.runsDailyAt !== null),
    portal: blueprint.permissionNeeds.some(item => item.capability === "filesystem"),
    textFields: fields.some(field => field.valueType === "text" || field.valueType === "long-text"),
    textLists: fields.some(field => field.valueType === "text-list"),
  }
}

const WAYBAR_DEFAULT_SERVICE_SECONDS = 900
const WAYBAR_STALE_SUFFIX = " (stale)"

function snakeKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "value"
}

// The external programs the click action runs, read from declared fields: a service web page the click feature
// uses (xdg-open) and the notifications platform need (notify-send). Both go through src/platform/launcher.rs.
export function waybarLaunchers(blueprint: NormalizedBlueprint): { readonly pages: readonly string[]; readonly notifies: boolean } {
  const click = blueprint.features.find(feature => feature.invokedBy === "click")
  const alnum = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "")
  const pages = click === undefined ? [] : blueprint.externalServices
    .filter(service => service.webPage !== "" && click.resourceIds.some(id => id.startsWith("service:") && alnum(id.slice("service:".length)) === alnum(service.name)))
    .map(service => service.webPage)
  return { pages, notifies: click?.resourceIds.includes("permission:notifications") ?? false }
}

export interface WaybarRoles {
  // The first feature that declares a schedule, else the first that needs background execution.
  readonly refreshOwner?: string
  // The first unscheduled feature that only reads declared data: the module's click action.
  readonly clickOwner?: string
  // Service refresh seconds: the smallest declared runsEverySeconds, or the kit default when none is declared.
  readonly intervalSeconds: number
  readonly scheduled: boolean
  readonly settingKeys: readonly string[]
}

// Every role is read from declared fields (schedules, resources, data operations), never from prose.
export function waybarRoles(blueprint: NormalizedBlueprint): WaybarRoles {
  const features = blueprint.features
  const intervals = features.flatMap(feature => feature.runsEverySeconds === null ? [] : [feature.runsEverySeconds])
  const unscheduled = (feature: (typeof features)[number]) => feature.runsEverySeconds === null && feature.runsDailyAt === null
  const refreshOwner = features.find(feature => !unscheduled(feature))
    ?? features.find(feature => feature.resourceIds.includes("permission:background-execution"))
  const clickOwner = features.find(feature => feature.invokedBy === "click")
  const settingKeys = [...new Set(blueprint.domainData.filter(item => item.storage === "settings")
    .flatMap(item => item.fields.length ? item.fields.map(field => snakeKey(field.name)) : [snakeKey(item.name)]))]
  return {
    refreshOwner: refreshOwner?.name,
    clickOwner: clickOwner?.name,
    intervalSeconds: intervals.length ? Math.min(...intervals) : WAYBAR_DEFAULT_SERVICE_SECONDS,
    scheduled: intervals.length > 0,
    settingKeys,
  }
}

// Sentences appended to the focused-task prompt of the feature owner named by a role, so each kit hook
// has exactly one task that replaces it.
export function waybarTaskNotes(blueprint: NormalizedBlueprint, featureNames: readonly string[]): string {
  const roles = waybarRoles(blueprint)
  const notes: string[] = []
  if (roles.refreshOwner !== undefined && featureNames.includes(roles.refreshOwner)) {
    notes.push(`You are the refresh-loop owner: replace the body of fetch_output in src/module.rs so the --service loop calls this feature's code and returns the final label as a ModuleOutput; keep run_service, render_with, refresh, STALE_SUFFIX, and the loop interval (settings.refresh_seconds) unchanged, and keep cache.json a derived render of that label. Set ModuleOutput.value to the numeric reading when the label shows one; only when this feature's acceptance criteria state warning or critical thresholds (amber is warning, red is critical), set WARNING_ABOVE and CRITICAL_ABOVE in src/module.rs to them and compare the raw value, otherwise leave both None so the class is normal. Take every external read (service call, file, command) behind an injected trait or closure so the failure test substitutes one that fails. If its acceptance criteria name wording for the state before the first successful refresh, set that as the default of Settings.text in src/config.rs.`)
  }
  if (roles.clickOwner !== undefined && featureNames.includes(roles.clickOwner)) {
    notes.push("You are the click-action owner: replace the body of click in src/module.rs; the Waybar fragment (already bound to --action click) needs no change, and no other --action name is added unless a feature declares one.")
    const launchers = waybarLaunchers(blueprint)
    for (const page of launchers.pages) {
      notes.push(`Open ${page} with open_url from src/platform/launcher.rs (xdg-open through std::process::Command) and take the launcher as an injected &dyn Launcher, so the focused test passes a recording launcher and a failing launcher; a launcher error makes click return Err.`)
    }
    if (launchers.notifies) {
      notes.push("Send the notification with notify from src/platform/launcher.rs (notify-send through std::process::Command) from click only, through an injected &dyn Launcher, so the focused test asserts exactly one request and a failing launcher makes click return Err.")
    }
  }
  for (const feature of blueprint.features.filter(item => featureNames.includes(item.name) && item.runsEverySeconds !== null)) {
    notes.push(`${feature.name} runs every ${feature.runsEverySeconds} seconds: take that interval and the current time as parameters (default ${feature.runsEverySeconds} seconds, the clock injected), so the focused test sets a short interval and a fixed clock instead of sleeping or reading the system clock.`)
  }
  return notes.length ? ` ${notes.join(" ")}` : ""
}

// Names the task that replaces each kit hook; appended to the foundation task prompt.
export function waybarHookSummary(blueprint: NormalizedBlueprint, taskIdForFeature: (featureName: string) => string | undefined): string {
  const roles = waybarRoles(blueprint)
  const refreshTask = roles.refreshOwner === undefined ? undefined : taskIdForFeature(roles.refreshOwner)
  const clickTask = roles.clickOwner === undefined ? undefined : taskIdForFeature(roles.clickOwner)
  return ` src/module.rs ships two hooks: fetch_output (the refresh loop body) is replaced by ${refreshTask ?? "no task, because no feature declares a schedule or background work; it stays the empty-state base"}, and click (the --action click body) is replaced by ${clickTask ?? "no task, because no feature declares invokedBy click; it stays a no-op and the fragment binds no on-click"}.`
}

function waybarKit(identity: ProjectIdentity, blueprint: NormalizedBlueprint, options: Readonly<Record<string, string | boolean | readonly string[]>> = {}): KitFile[] {
  const slug = identity.slug
  const crate = crateName(slug)
  const service = true
  const refresh = options.refreshSeconds === "60" || options.refreshSeconds === "5" ? options.refreshSeconds : "15"
  const tooltip = options.tooltip === false ? false : true
  const { records, secrets, http, optionalDeps } = rustKitHelpers(blueprint)
  const roles = waybarRoles(blueprint)
  const settingKeys = roles.settingKeys.map(key => JSON.stringify(key)).join(", ")
  const launchers = waybarLaunchers(blueprint)
  const launches = launchers.pages.length > 0 || launchers.notifies
  const helperNames = [...(records ? ["sqlite.rs"] : []), ...(secrets ? ["credentials.rs"] : []), ...(http ? ["http.rs"] : []), ...(launches ? ["launcher.rs"] : [])]
  const packageDepends = [...(secrets ? ["dbus"] : []), ...(launchers.pages.length ? ["xdg-utils"] : []), ...(launchers.notifies ? ["libnotify"] : [])].map(name => `'${name}'`).join(" ")
  return [
    file("README.md", String.raw`
# Starter kit

Copy the foundation files listed in TASKS.md before TASK-01-FOUNDATION. Copy a packaging-owned file (PKGBUILD,
scripts/package.sh, resources/, LICENSE) when the packaging task (the last task in TASKS.md) starts, using the
kit content as the starting point. Keep every helper listed here and extend it; do not replace the composition
root or the module output path with a test double.

Shipped helpers:
- src/lib.rs, src/main.rs: CLI entry. The whole command line is: no argument or --once (print one JSON object),
  --service (run the refresh loop), --action click or --action refresh, and --set KEY=VALUE. An unknown action
  or key exits 2 with a message on stderr; --once always exits 0.
- src/module.rs: render_with prints exactly one Waybar JSON object read from the cache (or the empty state when
  there is no cache, or the stale state when the cached reading is older than twice the service interval).
  run_service loops on settings.refresh_seconds and calls refresh, which calls fetch_output. fetch_output (the
  refresh loop body) and click (the --action click body) are the two hooks that feature tasks replace;
  everything else stays.
- src/config.rs, src/paths.rs: atomic JSON settings under XDG config. refresh_seconds is the service refresh
  interval (default ${roles.intervalSeconds} seconds${roles.scheduled ? ", the declared runsEverySeconds" : ", because no feature declares a schedule"}); the Waybar fragment interval is a different value (how often Waybar re-reads the cache).
- src/platform/atomic_file.rs${helperNames.map(name => ", " + name).join("")}: only the platform boundaries this blueprint declares.
- resources/waybar/config.jsonc and style.css: the module fragment.
- tests/contract_tests.rs, tests/module_output_tests.rs: storage and output-shape tests.

Rules the kit encodes:
- Source of truth: persisted ${records ? "records (SQLite records and the settings file" : "values (the settings file"}, per each data object's declared
  storage) are authoritative. cache.json under $XDG_RUNTIME_DIR is only a derived render of the final label
  text, written by the service and read by --once; deleting it loses nothing.
- Saved settings live in the "values" map of config.json and are set with --set KEY=VALUE (declared keys:
  ${roles.settingKeys.length ? roles.settingKeys.join(", ") : "none"}, plus refresh_seconds). Editing the file by hand is equivalent.
- Actions: "click" is the module's click action and the only one the fragment binds (on-click); "refresh" runs
  one refresh now. Right and middle click stay unbound unless a feature declares them.
- STALE_SUFFIX in src/module.rs (default "${WAYBAR_STALE_SUFFIX}") is the one stale marker; use the wording the
  acceptance criteria state if they state one, and change only that constant.
- Classes: the output class is exactly one of normal, warning, critical, stale, empty, and resources/waybar/style.css
  colours each. render_with sets it: empty before the first successful refresh (text is settings.text), stale when
  the last refresh failed or the reading is older than twice the service interval (the text keeps the last value
  plus STALE_SUFFIX, and stale wins over warning and critical), otherwise normal, warning, or critical from
  ModuleOutput.value against WARNING_ABOVE and CRITICAL_ABOVE. Both limits are None, so every fresh reading is
  normal, until a feature's acceptance criteria state thresholds.${launches ? `
- src/platform/launcher.rs: the Launcher trait and SystemLauncher (std::process::Command) with ${[...(launchers.pages.length ? ["open_url (xdg-open)"] : []), ...(launchers.notifies ? ["notify (notify-send)"] : [])].join(" and ")}; features take a &dyn Launcher so tests inject a recording or failing one.` : ""}
- Time is injected: render_with, refresh, and interval_seconds take the clock and the settings as parameters,
  so tests never sleep or read the system clock.
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
${optionalDeps}
tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync", "time"] }
dirs = "7"
thiserror = "2"
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
use std::process::ExitCode;

use clap::Parser;

use ${crate}::{config, module};

#[derive(Parser)]
struct Arguments {
    /// Print one Waybar JSON object and exit 0 (the default).
    #[arg(long)]
    once: bool,
    /// Run one action: click or refresh.
    #[arg(long)]
    action: Option<String>,
    /// Run the refresh loop (systemd user service).
    #[arg(long)]
    service: bool,
    /// Save one declared setting, written KEY=VALUE.
    #[arg(long, value_name = "KEY=VALUE")]
    set: Option<String>,
}

fn report(result: Result<(), String>) -> ExitCode {
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("{message}");
            ExitCode::from(2)
        }
    }
}

fn main() -> ExitCode {
    let arguments = Arguments::parse();
    if arguments.service {
        module::run_service();
    }
    if let Some(pair) = arguments.set.as_deref() {
        return report(config::set_pair(pair));
    }
    if let Some(action) = arguments.action.as_deref() {
        return report(module::run_action(action));
    }
    let _ = arguments.once;
    println!("{}", module::render());
    ExitCode::SUCCESS
}
`),
    file("src/module.rs", String.raw`
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::config::{self, Settings};
use crate::paths;
use crate::platform::atomic_file;

/// Appended to the label of an out-of-date reading; the one stale marker (docs and tests name it).
pub const STALE_SUFFIX: &str = "${WAYBAR_STALE_SUFFIX}";
pub const CLASS_NORMAL: &str = "normal";
pub const CLASS_WARNING: &str = "warning";
pub const CLASS_CRITICAL: &str = "critical";
pub const CLASS_STALE: &str = "stale";
pub const CLASS_EMPTY: &str = "empty";
/// Severity limits on ModuleOutput.value. Both stay None (every fresh reading is "normal") unless a
/// feature's acceptance criteria state thresholds; then the owner task sets them here and nowhere else.
pub const WARNING_ABOVE: Option<f64> = None;
pub const CRITICAL_ABOVE: Option<f64> = None;
pub const ACTION_CLICK: &str = "click";
pub const ACTION_REFRESH: &str = "refresh";
/// The whole --action vocabulary; the Waybar fragment binds only ACTION_CLICK.
pub const ACTIONS: &[&str] = &[ACTION_CLICK, ACTION_REFRESH];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModuleOutput {
    pub text: String,
    pub alt: String,
    pub tooltip: String,
    pub class: String,
    pub percentage: Option<u8>,
    /// The raw numeric reading, when the label shows one; severity compares this, never the rounded text.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<f64>,
}

/// cache.json: a derived render of the final label, never a source of truth.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Cache {
    #[serde(flatten)]
    pub output: ModuleOutput,
    pub updated_unix: u64,
}

pub fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Service refresh interval in seconds, never below 5.
pub fn interval_seconds(settings: &Settings) -> u64 {
    u64::from(settings.refresh_seconds.max(5))
}

pub fn empty_state(settings: &Settings) -> ModuleOutput {
    ModuleOutput {
        text: settings.text.clone(),
        alt: String::from("empty"),
        tooltip: settings.tooltip.clone(),
        class: String::from(CLASS_EMPTY),
        percentage: None,
        value: None,
    }
}

/// The class vocabulary is exactly normal, warning, critical, stale, empty.
pub fn severity_class_with(
    value: Option<f64>,
    warning_above: Option<f64>,
    critical_above: Option<f64>,
) -> &'static str {
    match value {
        Some(value) if critical_above.is_some_and(|limit| value > limit) => CLASS_CRITICAL,
        Some(value) if warning_above.is_some_and(|limit| value > limit) => CLASS_WARNING,
        _ => CLASS_NORMAL,
    }
}

pub fn severity_class(value: Option<f64>) -> &'static str {
    severity_class_with(value, WARNING_ABOVE, CRITICAL_ABOVE)
}

pub fn read_cache(path: &Path) -> Option<Cache> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
}

pub fn write_cache(path: &Path, output: &ModuleOutput, updated_unix: u64) -> Result<(), String> {
    let cache = Cache {
        output: output.clone(),
        updated_unix,
    };
    let bytes = serde_json::to_vec(&cache).map_err(|error| error.to_string())?;
    atomic_file::write_atomic(path, &bytes).map_err(|error| error.to_string())
}

/// The one place that decides what Waybar shows: exactly one JSON object.
pub fn render_with(settings: &Settings, cache: Option<&Cache>, now: u64) -> String {
    let output = match cache {
        None => empty_state(settings),
        Some(cache) => {
            let mut output = cache.output.clone();
            let age = now.saturating_sub(cache.updated_unix);
            if output.class == CLASS_STALE || age > interval_seconds(settings) * 2 {
                // Stale wins over warning and critical: the text keeps the last value plus STALE_SUFFIX.
                output.class = String::from(CLASS_STALE);
                if !output.text.ends_with(STALE_SUFFIX) {
                    output.text.push_str(STALE_SUFFIX);
                }
            } else if output.class != CLASS_EMPTY {
                output.class = String::from(severity_class(output.value));
            }
            output
        }
    };
    serde_json::to_string(&output)
        .unwrap_or_else(|_| String::from(r#"{"text":"!","class":"error"}"#))
}

pub fn render() -> String {
    render_with(
        &config::load(),
        read_cache(&paths::cache_path()).as_ref(),
        now_unix(),
    )
}

/// HOOK: the refresh-loop owner task replaces this body with the feature's real fetch and returns
/// the final label. The base returns the empty state so the module runs before any feature exists.
pub fn fetch_output(settings: &Settings, _now_unix: u64) -> Result<ModuleOutput, String> {
    Ok(empty_state(settings))
}

/// One refresh: write the label from fetch_output, or on failure keep the last cache marked stale.
pub fn refresh(cache_path: &Path, settings: &Settings, now: u64) -> Result<(), String> {
    match fetch_output(settings, now) {
        Ok(output) => write_cache(cache_path, &output, now),
        Err(error) => {
            if let Some(mut cache) = read_cache(cache_path) {
                cache.output.class = String::from(CLASS_STALE);
                write_cache(cache_path, &cache.output, cache.updated_unix)?;
            }
            Err(error)
        }
    }
}

/// HOOK: the click-action owner task replaces this body; the base does nothing.
pub fn click(_settings: &Settings) -> Result<(), String> {
    Ok(())
}

pub fn run_action(action: &str) -> Result<(), String> {
    let settings = config::load();
    match action {
        ACTION_CLICK => click(&settings),
        ACTION_REFRESH => refresh(&paths::cache_path(), &settings, now_unix()),
        other => Err(format!(
            "unknown action {other}; defined actions: {}",
            ACTIONS.join(", ")
        )),
    }
}

/// The systemd --service loop: refresh, then sleep the configured interval.
pub fn run_service() -> ! {
    loop {
        let settings = config::load();
        if let Err(error) = refresh(&paths::cache_path(), &settings, now_unix()) {
            eprintln!("refresh failed: {error}");
        }
        std::thread::sleep(Duration::from_secs(interval_seconds(&settings)));
    }
}
`),
    file("src/config.rs", String.raw`
use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::paths;
use crate::platform::atomic_file;

/// Declared setting keys that --set accepts (from the blueprint's settings data objects).
pub const SETTING_KEYS: &[&str] = &[${settingKeys}];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct Settings {
    pub schema_version: u32,
    pub text: String,
    pub tooltip: String,
    /// Service refresh interval in seconds; not the Waybar fragment interval.
    pub refresh_seconds: u32,
    pub enabled: bool,
    /// Saved settings by key; the config store behind --set.
    pub values: BTreeMap<String, String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            schema_version: 1,
            text: String::from("${identity.projectName}"),
            tooltip: String::from("${identity.projectName}"),
            refresh_seconds: ${roles.intervalSeconds},
            enabled: true,
            values: BTreeMap::new(),
        }
    }
}

impl Settings {
    pub fn get(&self, key: &str) -> Option<&str> {
        self.values.get(key).map(String::as_str)
    }

    pub fn set(&mut self, key: &str, value: &str) -> Result<(), String> {
        if value.is_empty() {
            return Err(format!("{key} needs a value"));
        }
        if key == "refresh_seconds" {
            let seconds: u32 = value
                .parse()
                .map_err(|_| format!("refresh_seconds must be whole seconds, got {value}"))?;
            if seconds < 5 {
                return Err(String::from("refresh_seconds must be at least 5"));
            }
            self.refresh_seconds = seconds;
        } else if SETTING_KEYS.contains(&key) {
            self.values.insert(key.to_string(), value.to_string());
        } else {
            return Err(format!(
                "unknown setting {key}; known: refresh_seconds {}",
                SETTING_KEYS.join(" ")
            ));
        }
        Ok(())
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

/// The --set KEY=VALUE action: validate against the declared keys, then save atomically.
pub fn set_pair(pair: &str) -> Result<(), String> {
    let (key, value) = pair
        .split_once('=')
        .ok_or_else(|| String::from("--set expects KEY=VALUE"))?;
    let mut settings = load();
    settings.set(key.trim(), value.trim())?;
    save(&settings)
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

${records ? `pub fn database_path() -> PathBuf {
    data_dir().join("records.sqlite3")
}

` : ""}pub fn cache_path() -> PathBuf {
    runtime_dir().join("cache.json")
}
`),
    file("src/platform/mod.rs", String.raw`
pub mod atomic_file;
${[...(secrets ? ["pub mod credentials;"] : []), ...(http ? ["pub mod http;"] : []), ...(launches ? ["pub mod launcher;"] : []), "pub mod runtime;", ...(records ? ["pub mod sqlite;"] : [])].join("\n")}
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
    ...(records ? [file("src/platform/sqlite.rs", String.raw`
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
`)] : []),
    ...(secrets ? [file("src/platform/credentials.rs", String.raw`
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
`)] : []),
    ...(http ? [file("src/platform/http.rs", String.raw`
use std::time::Duration;

pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .expect("HTTP client construction is infallible for the default configuration")
}
`)] : []),
    ...(launches ? [file("src/platform/launcher.rs", String.raw`
use std::process::Command;

/// Runs an external program. Production code passes SystemLauncher; tests pass a recording or failing double.
pub trait Launcher {
    fn run(&self, program: &str, arguments: &[&str]) -> Result<(), String>;
}

pub struct SystemLauncher;

impl Launcher for SystemLauncher {
    fn run(&self, program: &str, arguments: &[&str]) -> Result<(), String> {
        let status = Command::new(program)
            .args(arguments)
            .status()
            .map_err(|error| format!("{program}: {error}"))?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("{program} exited with {status}"))
        }
    }
}
${launchers.pages.length ? `
/// Opens an https page in the desktop's default browser through xdg-open.
pub fn open_url(launcher: &dyn Launcher, url: &str) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err(format!("refusing to open a non-https address: {url}"));
    }
    launcher.run("xdg-open", &[url])
}
` : ""}${launchers.notifies ? `
/// Sends one desktop notification through notify-send; call it from a click action only.
pub fn notify(launcher: &dyn Launcher, title: &str, body: &str) -> Result<(), String> {
    launcher.run("notify-send", &["--", title, body])
}
` : ""}
#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    struct Recorder {
        calls: RefCell<Vec<String>>,
        fail: bool,
    }

    impl Launcher for Recorder {
        fn run(&self, program: &str, arguments: &[&str]) -> Result<(), String> {
            self.calls
                .borrow_mut()
                .push(format!("{program} {}", arguments.join(" ")));
            if self.fail {
                Err(String::from("launcher failed"))
            } else {
                Ok(())
            }
        }
    }

    fn recorder(fail: bool) -> Recorder {
        Recorder {
            calls: RefCell::new(Vec::new()),
            fail,
        }
    }
${launchers.pages.length ? `
    #[test]
    fn open_url_runs_xdg_open_once_and_rejects_non_https() {
        let launcher = recorder(false);
        open_url(&launcher, "https://example.org/page").expect("open");
        assert_eq!(
            *launcher.calls.borrow(),
            ["xdg-open https://example.org/page"]
        );
        assert!(open_url(&launcher, "file:///etc/passwd").is_err());
        assert!(open_url(&recorder(true), "https://example.org/page").is_err());
    }
` : ""}${launchers.notifies ? `
    #[test]
    fn notify_runs_notify_send_once_and_reports_failure() {
        let launcher = recorder(false);
        notify(&launcher, "title", "body").expect("notify");
        assert_eq!(*launcher.calls.borrow(), ["notify-send -- title body"]);
        assert!(notify(&recorder(true), "title", "body").is_err());
    }
` : ""}}
`)] : []),
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
use ${crate}::config::{SETTING_KEYS, Settings};
use ${crate}::paths;
use ${crate}::platform::atomic_file;
${records ? `use ${crate}::platform::sqlite::Database;
` : ""}
#[test]
fn settings_round_trip_is_atomic() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let path = directory.path().join("config.json");
    let bytes = br#"{"schema_version":1,"text":"ok","tooltip":"ok","refresh_seconds":15}"#;
    atomic_file::write_atomic(&path, bytes).expect("write settings");
    let read = std::fs::read(&path).expect("read settings");
    assert_eq!(read, bytes);
}

${records ? `#[test]
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

` : ""}#[test]
fn settings_default_is_stable() {
    assert_eq!(Settings::default().refresh_seconds, ${roles.intervalSeconds});
    assert!(paths::settings_path().ends_with("config.json"));
}

#[test]
fn set_accepts_declared_keys_only() {
    let mut settings = Settings::default();
    for key in SETTING_KEYS {
        settings.set(key, "saved").expect("declared key");
        assert_eq!(settings.get(key), Some("saved"));
    }
    assert!(settings.set("not_a_declared_key", "x").is_err());
    assert!(settings.set("refresh_seconds", "4").is_err());
    settings
        .set("refresh_seconds", "30")
        .expect("refresh seconds");
    assert_eq!(settings.refresh_seconds, 30);
}
`),
    file("tests/module_output_tests.rs", String.raw`
use ${crate}::config::Settings;
use ${crate}::module::{self, Cache, ModuleOutput, STALE_SUFFIX};

fn cached(text: &str, updated_unix: u64) -> Cache {
    Cache {
        output: ModuleOutput {
            text: text.to_string(),
            alt: String::from("ok"),
            tooltip: String::from("tip"),
            class: String::from("normal"),
            percentage: None,
            value: None,
        },
        updated_unix,
    }
}

#[test]
fn output_is_one_json_object() {
    let output = module::render_with(&Settings::default(), None, 0);
    let value: serde_json::Value = serde_json::from_str(&output).expect("valid JSON");
    assert!(value.is_object());
    assert!(value.get("text").and_then(|item| item.as_str()).is_some());
    assert_eq!(value["class"], "empty");
    assert!(!output.contains('\n'));
    assert!(!output.contains("password"));
    assert!(!output.contains("token"));
}

#[test]
fn fresh_cache_is_shown_and_old_cache_is_marked_stale() {
    let settings = Settings::default();
    let interval = u64::from(settings.refresh_seconds);
    let fresh = module::render_with(&settings, Some(&cached("14:05", 1000)), 1000 + interval);
    let fresh: serde_json::Value = serde_json::from_str(&fresh).expect("valid JSON");
    assert_eq!(fresh["text"], "14:05");
    assert_eq!(fresh["class"], "normal");
    let old = module::render_with(
        &settings,
        Some(&cached("14:05", 1000)),
        1000 + interval * 2 + 1,
    );
    let old: serde_json::Value = serde_json::from_str(&old).expect("valid JSON");
    assert_eq!(old["text"], format!("14:05{STALE_SUFFIX}"));
    assert_eq!(old["class"], "stale");
}

#[test]
fn severity_comes_from_stated_thresholds_only_and_stale_wins() {
    assert_eq!(module::severity_class_with(Some(9.0), None, None), "normal");
    for (value, class) in [
        (None, "normal"),
        (Some(1.0), "normal"),
        (Some(1.5), "warning"),
        (Some(2.5), "critical"),
    ] {
        assert_eq!(
            module::severity_class_with(value, Some(1.0), Some(2.0)),
            class
        );
    }
    let settings = Settings::default();
    let mut loud = cached("9.9", 1000);
    loud.output.class = String::from("critical");
    loud.output.value = Some(9.9);
    let interval = u64::from(settings.refresh_seconds);
    let old: serde_json::Value = serde_json::from_str(&module::render_with(
        &settings,
        Some(&loud),
        1000 + interval * 2 + 1,
    ))
    .expect("valid JSON");
    assert_eq!(old["class"], "stale");
    assert_eq!(old["text"], format!("9.9{STALE_SUFFIX}"));
}

#[test]
fn refresh_writes_the_cache_with_the_injected_clock() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let path = directory.path().join("cache.json");
    let settings = Settings::default();
    module::refresh(&path, &settings, 42).expect("refresh");
    let cache = module::read_cache(&path).expect("cache written");
    assert_eq!(cache.updated_unix, 42);
}

#[test]
fn unknown_action_is_rejected_and_the_vocabulary_is_fixed() {
    assert_eq!(module::ACTIONS, &["click", "refresh"]);
    assert!(module::run_action("toggle").is_err());
}
`),
    file("resources/waybar/config.jsonc", String.raw`
{
  // interval: seconds between Waybar re-runs of exec, which only re-reads the cache. The service refresh
  // interval is settings.refresh_seconds, a different value.
  "custom/${slug}": {
    "exec": "~/.local/bin/${slug} --once",
    "interval": ${refresh},
    "return-type": "json",
    "tooltip": ${tooltip}${roles.clickOwner === undefined ? "" : `,
    "on-click": "~/.local/bin/${slug} --action click"`}
  }
}
`),
    file("resources/waybar/style.css", String.raw`
#custom-${slug} {
  padding: 0 8px;
}

/* Class vocabulary set by render_with in src/module.rs: normal, warning, critical, stale, empty.
   Stale wins over warning and critical; the text and tooltip also carry the state, so colour is never the only signal. */
#custom-${slug}.warning {
  color: #e5a50a;
}

#custom-${slug}.critical {
  color: #e01b24;
}

#custom-${slug}.stale,
#custom-${slug}.empty {
  opacity: 0.7;
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
depends=(${packageDepends})
optdepends=('waybar: status bar')
makedepends=('cargo')
source=()

build() {
  cd "$startdir"
  cargo build --release
}

package() {
  install -Dm755 "$startdir/target/release/${slug}" "$pkgdir/usr/bin/${slug}"
  install -d "$pkgdir/etc/xdg/waybar"
  sed 's|~/.local/bin|/usr/bin|g' "$startdir/resources/waybar/config.jsonc" > "$pkgdir/etc/xdg/waybar/${slug}.jsonc"
  chmod 644 "$pkgdir/etc/xdg/waybar/${slug}.jsonc"
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

mkdir -p dist
cp "target/release/${slug}" "dist/${slug}"
echo "Built dist/${slug}"

if [ "$install" -eq 0 ]; then
  echo "Run ./scripts/package.sh --install to install it and start the systemd user service."
  exit 0
fi

mkdir -p "$HOME/.local/bin" "$HOME/.config/waybar" "$HOME/.config/systemd/user"
install -m755 "dist/${slug}" "$HOME/.local/bin/${slug}"
install -m644 "resources/waybar/config.jsonc" "$HOME/.config/waybar/${slug}.jsonc"
install -m644 "resources/waybar/style.css" "$HOME/.config/waybar/${slug}.css"
install -m644 "resources/systemd/${slug}.service" "$HOME/.config/systemd/user/${slug}.service"

# The service writes the cache the Waybar exec path reads, so install means it runs now and at login.
systemctl --user daemon-reload
systemctl --user enable --now "${slug}.service"
systemctl --user try-restart "${slug}.service"

echo "Installed ${slug} Waybar module under $HOME/.local and started ${slug}.service"
echo "Add include = [\"$HOME/.config/waybar/${slug}.jsonc\"] and \"custom/${slug}\" to modules-right in ~/.config/waybar/config.jsonc"
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
    const uses = tauriKitUses(blueprint, nativeUsageDescriptions(identity, blueprint.platformNeeds), options)
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
