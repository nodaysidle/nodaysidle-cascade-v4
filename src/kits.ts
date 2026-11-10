import { androidKit } from "./androidKit"
import { astroKit } from "./astroKit"
import { tauriKitFiles, tauriKitReadme, tauriKitUses } from "./tauriKit"
import type { NormalizedBlueprint } from "./compiler"
import type { PresetId, ProjectIdentity } from "./presets"
import { desktopValue, fieldIdentifier, rustString, shellWord, systemdValue, xmlText } from "./kitText"
import { WAYBAR_EMPTY_LABEL, WAYBAR_FAILURE_RULE, waybarKeptExtremeRule, waybarKitParts, waybarRequestSlots, waybarSources } from "./waybarContracts"
import { waybarLocalTimeKit, waybarSystemKit } from "./waybarKit"

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
  // Prefer the last clause that fits, then drop any dangling article or preposition, so the summary never ends mid-phrase.
  const clause = sentence.slice(0, 80).match(/^(.*\S)\s*[,;:]/s)
  if (clause) return clause[1]!
  return sentence.slice(0, 80).replace(/\s+\S*$/, "").replace(/(\s+(?:a|an|the|of|to|for|with|and|or|that|who|which|in|on|by|never))+$/i, "")
}


function gtkKit(identity: ProjectIdentity, blueprint: NormalizedBlueprint): KitFile[] {
  const slug = identity.slug
  const crate = crateName(slug)
  const { records, secrets, http, optionalDeps } = rustKitHelpers(blueprint)
  const { settings, background: needsBackground, clock, dbus } = gtkKitFlags(blueprint)
  const dates = blueprint.domainData.some(item => item.fields.some(field => field.valueType === "date"))
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
${clock ? `- src/platform/clock.rs: the Clock trait and SystemClock${dates ? ", today_string (the local YYYY-MM-DD day of a Clock) and is_calendar_date" : ""}; owners take time only through a Clock they are given.\n` : ""}${records ? "- src/platform/sqlite.rs: SQLite with PRAGMA user_version.\n" : ""}${secrets ? "- src/platform/credentials.rs: Secret Service through the keyring crate.\n" : ""}${http ? "- src/platform/http.rs: one reqwest client.\n" : ""}- src/platform/runtime.rs: one shared tokio runtime for async work.
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

/// The production owners, built without a display so a test can construct them. Each owner task adds its owner here.
#[derive(Default)]
pub struct Services {}

pub fn build_services(_data_dir: &std::path::Path) -> Services {
    Services::default()
}

pub fn build_window(application: &adw::Application) -> adw::ApplicationWindow {
    let window = adw::ApplicationWindow::builder()
        .application(application)
        .title("${rustString(identity.projectName)}")
        .default_width(960)
        .default_height(640)
        .build();
    let header = adw::HeaderBar::new();
    let toolbar = adw::ToolbarView::new();
    toolbar.add_top_bar(&header);
    let label = gtk::Label::new(Some("${rustString(identity.projectName)}"));
    label.set_margin_top(24);
    label.set_margin_bottom(24);
    label.set_margin_start(24);
    label.set_margin_end(24);
    toolbar.set_content(Some(&label));
    let toast = adw::ToastOverlay::new();
    toast.set_child(Some(&toolbar));
    window.set_content(Some(&toast));
    let _state = AppState::default();
    let _services = build_services(&crate::paths::data_dir());
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
${dates ? `
// The one conversion from the Clock to the local calendar day, as YYYY-MM-DD; it uses glib, no extra crate.
// A failed conversion returns an empty string, which every required-date rule rejects.
pub fn today_string(clock: &dyn Clock) -> String {
    gtk::glib::DateTime::from_unix_local(clock.now_millis().div_euclid(1000))
        .and_then(|moment| moment.format("%Y-%m-%d"))
        .map(|text| text.to_string())
        .unwrap_or_default()
}

// True only for a real calendar date written as four-digit year, two-digit month and day (2024-02-30 is false).
pub fn is_calendar_date(text: &str) -> bool {
    let bytes = text.as_bytes();
    let shaped = bytes.len() == 10
        && bytes.iter().enumerate().all(|(index, byte)| {
            if index == 4 || index == 7 {
                *byte == b'-'
            } else {
                byte.is_ascii_digit()
            }
        });
    if !shaped {
        return false;
    }
    match (
        text[0..4].parse::<i32>(),
        text[5..7].parse::<i32>(),
        text[8..10].parse::<i32>(),
    ) {
        (Ok(year), Ok(month), Ok(day)) => {
            year >= 1 && gtk::glib::DateTime::from_local(year, month, day, 0, 0, 0.0).is_ok()
        }
        _ => false,
    }
}
` : ""}`)] : []),
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
${clock ? `use ${crate}::platform::clock::{Clock, SystemClock${dates ? ", is_calendar_date, today_string" : ""}};
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
${dates ? `
struct FixedClock(i64);

impl Clock for FixedClock {
    fn now_millis(&self) -> i64 {
        self.0
    }
}

#[test]
fn today_string_is_a_local_calendar_day() {
    // 2023-11-14T22:13:20Z is the 14th or the 15th depending on the local zone.
    let today = today_string(&FixedClock(1_700_000_000_000));
    assert!(today == "2023-11-14" || today == "2023-11-15", "{today}");
    assert!(is_calendar_date(&today_string(&SystemClock)));
}

#[test]
fn calendar_dates_are_real_days_in_one_shape() {
    assert!(is_calendar_date("2024-02-29"));
    for text in [
        "",
        "2024-02-30",
        "2023-02-29",
        "2024-13-01",
        "2024-00-10",
        "24-02-10",
        "2024-2-10",
        "2024/02/10",
        "2024-02-1x",
        "é024-02-10",
    ] {
        assert!(!is_calendar_date(text), "{text}");
    }
}
` : ""}` : ""}`),
    file(`resources/${identity.bundleId}.desktop`, String.raw`
[Desktop Entry]
Name=${desktopValue(identity.projectName)}
Comment=${desktopValue(identity.projectName)} desktop application
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
  <name>${xmlText(identity.projectName)}</name>
  <summary>${xmlText(shortSummary(blueprint.productDefinition))}</summary>
  <description>
    <p>${xmlText(blueprint.productDefinition)}</p>
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
Description=${systemdValue(identity.projectName)}
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
pkgdesc=${shellWord(identity.projectName)}
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


// The external programs the click action runs, read from declared fields: a service web page the click feature
// uses (xdg-open) and the notifications platform need (notify-send). Both go through src/platform/launcher.rs.
export function waybarLaunchers(blueprint: NormalizedBlueprint): { readonly pages: readonly string[]; readonly notifies: boolean } {
  const click = blueprint.features.find(feature => feature.invokedBy === "click")
  const alnum = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "")
  const pages = click === undefined ? [] : blueprint.externalServices
    .filter(service => service.webPage !== "" && click.resourceIds.some(id => id.startsWith("service:") && alnum(id.slice("service:".length)) === alnum(service.name)))
    .map(service => service.webPage)
  // The notifications permission text names notify in launcher.rs, so a declared notifications need ships it even before a click feature uses it.
  return { pages, notifies: blueprint.platformNeeds.includes("notifications") || (click?.resourceIds.includes("permission:notifications") ?? false) }
}

export interface WaybarRoles {
  // The scheduled feature that measures, fetches, or writes data (else the first scheduled one, else the first that needs background execution).
  readonly refreshOwner?: string
  // Features that only read what the refresh owner stores: each owns the pure label function the refresh owner calls.
  readonly labelOwners: readonly string[]
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
  const works = (feature: (typeof features)[number]) => feature.resourceIds.some(id => id.startsWith("service:")) || feature.systemSource !== "none"
    || Object.values(feature.operationsByData).some(operations => operations.some(operation => operation === "create" || operation === "update"))
  const refreshOwner = features.find(feature => !unscheduled(feature) && works(feature))
    ?? features.find(feature => !unscheduled(feature))
    ?? features.find(feature => feature.resourceIds.includes("permission:background-execution"))
  const clickOwner = features.find(feature => feature.invokedBy === "click")
  const written = new Set(refreshOwner === undefined ? [] : Object.entries(refreshOwner.operationsByData).filter(([, operations]) => operations.some(operation => operation === "create" || operation === "update")).map(([key]) => key))
  const labelOwners = features.filter(feature => feature !== refreshOwner && feature !== clickOwner && Object.entries(feature.operationsByData).some(([key, operations]) => written.has(key) && operations.includes("read"))).map(feature => feature.name)
  const settingKeys = [...new Set(blueprint.domainData.filter(item => item.storage === "settings")
    .flatMap(item => item.fields.length ? item.fields.map(field => fieldIdentifier(field.name)) : [fieldIdentifier(item.name)]))]
  return {
    refreshOwner: refreshOwner?.name,
    labelOwners,
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
    notes.push(`You are the refresh-loop owner and the only owner of fetch_output: replace its body in src/module.rs. It stays the composition root of the refresh path: it builds the production dependencies (${[...(blueprint.externalServices.length ? ["the integration"] : []), ...(waybarSources(blueprint).length ? ["the SystemReader named in the contracts"] : [])].join(" and ") || "no integration or reader, since none is declared"}${blueprint.persistenceNeeds.some(need => need.storage === "records") ? ", and the real store" : ""}) and calls one testable function in this feature's own file that takes the store, the reader or integration, the clock (now in milliseconds; fetch_output receives seconds, so a stored moment is now_unix * 1000), and the interval as parameters, so the focused test calls it at fixed times (for example t=0 and t=5000 ms) with injected readers instead of sleeping. ${WAYBAR_FAILURE_RULE} Keep run_service, render_with, refresh, STALE_SUFFIX, and the loop interval (settings.refresh_seconds) unchanged, and keep cache.json a derived render of the label.`)
    if (roles.labelOwners.length) {
      notes.push(`The label is built by the pure function exported by ${roles.labelOwners.join(", ")} (stored record and saved settings in, ModuleOutput out); those tasks come first, so call that function instead of formatting the label yourself.`)
    }
    for (const service of blueprint.externalServices.filter(item => item.requestValueFrom !== "")) {
      const slots = waybarRequestSlots(service, blueprint.domainData)
      notes.push(slots === undefined
        ? `The stored record carries the value of the saved setting '${service.requestValueFrom}' it was fetched for; write it with every successful fetch.`
        : `The request is built from several saved values: read each of ${slots.map(slot => `'${slot.name}' (settings key ${fieldIdentifier(slot.name)})`).join(", ")} from the saved settings of '${service.requestValueFrom}' and pass them to the integration owner's request_url, which builds the address with http::fill_url (src/platform/http.rs). A value that is not saved, or that fill_url refuses (empty, not a number, outside the field's min..max), is a failed fetch: no request is sent and the failure rule above applies exactly as for a missing single value. The stored record carries every one of those saved values it was fetched for; write them with every successful fetch.`)
    }
    notes.push(`Set ModuleOutput.value to the raw numeric reading as stored${blueprint.features.some(feature => feature.thresholds.length) ? " in the unit the declared thresholds use (bytes for a size)" : ""} when the label shows one; severity is the kit's: THRESHOLDS in src/module.rs is generated from the declared thresholds${blueprint.features.some(feature => feature.thresholds.length) ? "" : " (none are declared, so the class is always normal)"} and no task edits it. Set ModuleOutput.tooltip to the label text unless the acceptance criteria state tooltip wording. The empty label is ${WAYBAR_EMPTY_LABEL}, the kit default of Settings.text; do not change it.`)
    if (blueprint.persistenceNeeds.some(need => need.storage === "records")) {
      notes.push("Also replace stored_output in src/module.rs: it returns the label (through the same label function) for the record already stored, without measuring or fetching, or None when no record is stored; refresh uses it to rebuild cache.json after a reboot when a refresh fails.")
    }
    const interval = blueprint.features.find(feature => feature.name === roles.refreshOwner)?.runsEverySeconds ?? null
    notes.push(...blueprint.domainData.flatMap(item => waybarKeptExtremeRule(item, interval)))
  }
  if (roles.labelOwners.some(name => featureNames.includes(name))) {
    const keyed = blueprint.externalServices.filter(item => item.requestValueFrom !== "")
    notes.push(`You own the pure label function for the stored reading: export label(reading, settings) -> ModuleOutput, where reading is the stored record or none (an Option over a reference to this product's stored record type) and ModuleOutput has text, tooltip, class, value; with no reading it returns the empty state. It never reads cache.json, fetches, measures, or schedules; the refresh-loop owner calls it from fetch_output. It sets value to the raw reading as stored and leaves class to the kit, which sets class with severity_class(value) after the label function returns, so a test of amber (warning) or red (critical) asserts severity_class_with or the refresh path, never label(). A criterion about a failed refresh (class stale, STALE_SUFFIX) or about what the module prints is asserted in this task through module::refresh_with(cache_path, settings, now, fetch, stored) and module::render_with(settings, cache, now) with injected fetch and stored closures, because fetch_output is built in a later task; label() itself stays pure.${keyed.length ? ` When the record's saved-setting value (the field${keyed.some(item => waybarRequestSlots(item, blueprint.domainData) !== undefined) ? "s" : ""} named ${keyed.flatMap(item => (waybarRequestSlots(item, blueprint.domainData)?.map(slot => slot.name) ?? [item.requestValueFrom]).map(name => `'${name}'`)).join(", ")}) differs from the current saved setting, it returns the empty state, never another place's value.` : ""}`)
  }
  if (roles.clickOwner !== undefined && featureNames.includes(roles.clickOwner)) {
    notes.push("You are the click-action owner: replace the body of click in src/module.rs and change its signature to click(settings: &Settings, launcher: &dyn Launcher), updating run_action to pass &SystemLauncher (click is the composition root of the click path); the Waybar fragment (already bound to --action click) needs no change, and no other --action name is added unless a feature declares one. A failed click returns Err (exit 2, message on stderr) and writes neither the store nor the cache.")
    const launchers = waybarLaunchers(blueprint)
    for (const page of launchers.pages) {
      const templated = /\{[^{}]*\}/.test(page)
      const several = templated && page.replace("{value}", "").includes("{")
      notes.push(`Open ${templated ? `the address the integration owner's page_url function builds from the saved ${several ? "settings" : "setting"} (template ${page})` : page} with open_url from src/platform/launcher.rs (xdg-open through std::process::Command) and take the launcher as an injected &dyn Launcher, so the focused test passes a recording launcher and a failing launcher; a launcher error makes click return Err.${templated ? (several ? " Read every saved setting the template uses first and return Err before calling page_url when one is not saved." : " Read the saved setting first and return Err before calling page_url when none is saved.") : ""}`)
    }
    if (launchers.notifies) {
      notes.push("Send the notification with notify from src/platform/launcher.rs (notify-send through std::process::Command) from click only, through an injected &dyn Launcher, so the focused test asserts exactly one request and a failing launcher makes click return Err.")
    }
  }
  for (const feature of blueprint.features.filter(item => featureNames.includes(item.name) && item.runsEverySeconds !== null)) {
    notes.push(`${feature.name} runs every ${feature.runsEverySeconds} seconds: take that interval and the current time as parameters (default ${feature.runsEverySeconds} seconds, the clock injected), so the focused test sets a short interval and a fixed clock instead of sleeping or reading the system clock; the feature function returns the interval it was given, and the test also asserts module::interval_seconds(&Settings::default()) == ${feature.runsEverySeconds}.`)
  }
  return notes.length ? ` ${notes.join(" ")}` : ""
}

// Names the task that replaces each kit hook; appended to the foundation task prompt.
export function waybarHookSummary(blueprint: NormalizedBlueprint, taskIdForFeature: (featureName: string) => string | undefined): string {
  const roles = waybarRoles(blueprint)
  const refreshTask = roles.refreshOwner === undefined ? undefined : taskIdForFeature(roles.refreshOwner)
  const clickTask = roles.clickOwner === undefined ? undefined : taskIdForFeature(roles.clickOwner)
  return ` src/module.rs ships two hooks: fetch_output (the refresh loop body) is replaced by ${refreshTask ?? "no task, because no feature declares a schedule or background work; it stays the empty-state base"}, and click (the --action click body) is replaced by ${clickTask ?? "no task, because no feature declares invokedBy click; it stays a no-op and the fragment binds no on-click"}. The service loop (module::serve_until and run_service, SIGTERM handling) belongs to OWN-LIFECYCLE-COORDINATOR; no other task edits it.`
}

// A Rust f64 literal for a finite declared number (the schema bounds it to +-1e15, so no exponent form appears).
function rustFloat(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value)
}

// rustfmt keeps one struct literal on the opening line of the slice and several one per block.
function rustThresholds(thresholds: NormalizedBlueprint["features"][number]["thresholds"]): string {
  const literal = (item: (typeof thresholds)[number], indent: string) => [`Threshold {`, `    class: ${item.state === "critical" ? "CLASS_CRITICAL" : "CLASS_WARNING"},`, `    comparison: Comparison::${item.comparison === "above" ? "Above" : "Below"},`, `    value: ${rustFloat(item.value)},`, "}"].map((line, index) => index === 0 ? line : indent + line).join("\n")
  if (thresholds.length === 0) return ""
  if (thresholds.length === 1) return literal(thresholds[0]!, "")
  return `\n${thresholds.map(item => `    ${literal(item, "    ")},`).join("\n")}\n`
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
  const parts = waybarKitParts(blueprint)
  const thresholds = blueprint.features.flatMap(feature => feature.thresholds)
  const systemFiles = [...waybarSystemKit(parts.sources, crate, parts.units), ...(parts.localTime ? waybarLocalTimeKit(crate) : [])]
  const extraDeps = [...(parts.disk ? ['nix = { version = "0.30", default-features = false, features = ["fs"] }'] : []), ...(parts.localTime ? ['chrono = { version = "0.4", default-features = false, features = ["clock", "std"] }'] : [])].join("\n")
  const platformMods = systemFiles.filter(item => item.name.startsWith("src/platform/")).map(item => item.name.slice("src/platform/".length, -3))
  const helperNames = [...(records ? ["sqlite.rs"] : []), ...platformMods.map(name => `${name}.rs`), ...(secrets ? ["credentials.rs"] : []), ...(http ? ["http.rs"] : []), ...(launches ? ["launcher.rs"] : [])]
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
  run_service registers SIGTERM and SIGINT and runs serve_until, which loops on settings.refresh_seconds and calls
  refresh, which calls fetch_output; a failed fetch_output returns Err and refresh then marks the cache stale.
  fetch_output (the refresh loop body), stored_output (the label of the already stored record, for the cache
  rebuilt after a reboot) and click (the --action click body) are the hooks that feature tasks replace; the lifecycle task alone adds shutdown cleanup after serve_until; everything else stays.${platformMods.includes("units") ? "\n- src/platform/units.rs: the one decimal SI convention for sizes and rates (1 kB = 1000 B; bits per second = bytes x 8 / seconds); do not format sizes or rates anywhere else." : ""}${platformMods.includes("system_source") ? "\n- src/platform/system_source.rs: the SystemReader trait and one reader per declared system source; a failed read is a failed refresh." : ""}
${platformMods.includes("local_time") ? "- src/platform/local_time.rs: the one place a stored UTC epoch in milliseconds becomes a local HH:MM (chrono); store instants as UTC and call it only when rendering.\n" : ""}- src/config.rs, src/paths.rs: atomic JSON settings under XDG config. refresh_seconds is the service refresh
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
  colours each. render_with sets it: empty before the first successful refresh (text is settings.text, default
  "${WAYBAR_EMPTY_LABEL}"), stale when the last refresh failed or the reading is older than twice the service
  interval (the text keeps the last value plus STALE_SUFFIX, and stale wins over warning and critical; stale is
  derived at render time, never stored), otherwise normal, warning, or critical from ModuleOutput.value against
  THRESHOLDS (strict above or below, critical wins). THRESHOLDS is generated from the declared thresholds${thresholds.length ? "" : " and is empty here, so every fresh reading is normal"}.${launches ? `
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
${optionalDeps}${extraDeps ? "\n" + extraDeps : ""}
${http ? 'tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync", "time"] }\n' : ""}signal-hook = "0.3"
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
        return ExitCode::SUCCESS;
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
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
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
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Comparison {
    Above,
    Below,
}

/// One declared severity limit on ModuleOutput.value: strictly above or strictly below value.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Threshold {
    pub class: &'static str,
    pub comparison: Comparison,
    pub value: f64,
}

/// The declared thresholds (generated from the blueprint; no task edits them). Empty means every fresh
/// reading is "normal".
pub const THRESHOLDS: &[Threshold] = &[${rustThresholds(thresholds)}];
pub const EMPTY_TEXT: &str = "${WAYBAR_EMPTY_LABEL}";
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

/// The class vocabulary is exactly normal, warning, critical, stale, empty. A threshold matches when the
/// raw value is strictly above or strictly below its limit; critical wins over warning.
pub fn severity_class_with(value: Option<f64>, thresholds: &[Threshold]) -> &'static str {
    let Some(value) = value else {
        return CLASS_NORMAL;
    };
    let matches = |class: &str| {
        thresholds.iter().any(|item| {
            item.class == class
                && match item.comparison {
                    Comparison::Above => value > item.value,
                    Comparison::Below => value < item.value,
                }
        })
    };
    if matches(CLASS_CRITICAL) {
        CLASS_CRITICAL
    } else if matches(CLASS_WARNING) {
        CLASS_WARNING
    } else {
        CLASS_NORMAL
    }
}

pub fn severity_class(value: Option<f64>) -> &'static str {
    severity_class_with(value, THRESHOLDS)
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

/// HOOK: the refresh-loop owner task replaces this body with the feature's real measurement or fetch and
/// returns the final label. A failed measurement or fetch returns Err (never Ok with the last value):
/// refresh then keeps the last cache marked stale. The base returns the empty state so the module runs
/// before any feature exists.
pub fn fetch_output(settings: &Settings, _now_unix: u64) -> Result<ModuleOutput, String> {
    Ok(empty_state(settings))
}

/// HOOK: the refresh-loop owner returns the label of the record already stored, without measuring or
/// fetching, or None when nothing is stored. refresh uses it to rebuild cache.json (lost at reboot) when a
/// refresh fails. The base stores nothing.
pub fn stored_output(_settings: &Settings, _now_unix: u64) -> Option<ModuleOutput> {
    None
}

/// One refresh with the fetch and the stored-record label as parameters, so tests inject both: write the
/// label from fetch; on failure keep the last cache marked stale, or with no cache rebuild it from the stored
/// record marked stale. Stale is never stored in a record.
pub fn refresh_with(
    cache_path: &Path,
    settings: &Settings,
    now: u64,
    fetch: impl FnOnce(&Settings, u64) -> Result<ModuleOutput, String>,
    stored: impl FnOnce(&Settings, u64) -> Option<ModuleOutput>,
) -> Result<(), String> {
    match fetch(settings, now) {
        Ok(output) => write_cache(cache_path, &output, now),
        Err(error) => {
            if let Some(mut cache) = read_cache(cache_path) {
                cache.output.class = String::from(CLASS_STALE);
                write_cache(cache_path, &cache.output, cache.updated_unix)?;
            } else if let Some(mut output) = stored(settings, now) {
                output.class = String::from(CLASS_STALE);
                write_cache(cache_path, &output, now)?;
            }
            Err(error)
        }
    }
}

/// One refresh: the production fetch_output and stored_output.
pub fn refresh(cache_path: &Path, settings: &Settings, now: u64) -> Result<(), String> {
    refresh_with(cache_path, settings, now, fetch_output, stored_output)
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

/// The service loop body: run one pass, wait the seconds the pass returns (in one-second slices), and
/// stop after the pass during which the shutdown flag was set. Time and the pass are parameters so tests never sleep.
pub fn serve_until(shutdown: &AtomicBool, mut pass: impl FnMut() -> u64) {
    while !shutdown.load(Ordering::SeqCst) {
        let wait = pass();
        let mut waited = 0;
        while waited < wait && !shutdown.load(Ordering::SeqCst) {
            std::thread::sleep(Duration::from_secs(1));
            waited += 1;
        }
    }
}

/// The systemd --service loop: SIGTERM and SIGINT set the shutdown flag, refresh runs once per interval
/// until it is set, then the function returns so the caller can clean up (the lifecycle owner adds that).
pub fn run_service() {
    let shutdown = Arc::new(AtomicBool::new(false));
    for signal in [signal_hook::consts::SIGTERM, signal_hook::consts::SIGINT] {
        if let Err(error) = signal_hook::flag::register(signal, Arc::clone(&shutdown)) {
            eprintln!("cannot register signal {signal}: {error}");
        }
    }
    serve_until(&shutdown, || {
        let settings = config::load();
        if let Err(error) = refresh(&paths::cache_path(), &settings, now_unix()) {
            eprintln!("refresh failed: {error}");
        }
        interval_seconds(&settings)
    });
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
            text: String::from("${WAYBAR_EMPTY_LABEL}"),
            tooltip: String::from("${rustString(identity.projectName)}"),
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
${["atomic_file", ...(secrets ? ["credentials"] : []), ...(http ? ["http"] : []), ...(launches ? ["launcher"] : []), ...(http ? ["runtime"] : []), ...(records ? ["sqlite"] : []), ...platformMods].sort().map(name => `pub mod ${name};`).join("\n")}
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

/// RFC 3986 unreserved characters (letters, digits, - . _ ~) are kept; every other byte of the UTF-8 text is %XX
/// in upper-case hexadecimal, so a space is %20 and "San José" is "San%20Jos%C3%A9".
pub fn percent_encode(value: &str) -> String {
    let mut out = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            out.push(char::from(byte));
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

/// The saved value that fills one {name} placeholder of an endpoint or page template.
pub enum Slot<'a> {
    Text(&'a str),
    Number {
        value: &'a str,
        min: Option<f64>,
        max: Option<f64>,
    },
}

/// Builds a request or page address from a template whose {name} placeholders each have a slot. Text is
/// percent-encoded; a number must parse, be finite and lie inside min..max, and is written as its number text.
/// An empty value, a refused number, an unclosed brace, or a placeholder with no slot is an Err (a failed fetch).
pub fn fill_url(template: &str, slots: &[(&str, Slot)]) -> Result<String, String> {
    let mut out = String::new();
    let mut rest = template;
    while let Some(open) = rest.find('{') {
        out.push_str(&rest[..open]);
        let after = &rest[open + 1..];
        let close = after
            .find('}')
            .ok_or_else(|| format!("unclosed placeholder in {template}"))?;
        let name = &after[..close];
        let (_, slot) = slots
            .iter()
            .find(|(slot_name, _)| *slot_name == name)
            .ok_or_else(|| format!("no saved value for the placeholder {name}"))?;
        match slot {
            Slot::Text(value) => {
                if value.trim().is_empty() {
                    return Err(format!("the saved value for {name} is empty"));
                }
                out.push_str(&percent_encode(value));
            }
            Slot::Number { value, min, max } => {
                let number: f64 = value
                    .trim()
                    .parse()
                    .map_err(|_| format!("the saved value for {name} is not a number"))?;
                if !number.is_finite() {
                    return Err(format!("the saved value for {name} is not finite"));
                }
                if min.is_some_and(|low| number < low) || max.is_some_and(|high| number > high) {
                    return Err(format!("the saved value for {name} is out of range"));
                }
                out.push_str(&number.to_string());
            }
        }
        rest = &after[close + 1..];
    }
    out.push_str(rest);
    Ok(out)
}

/// The one place a service response value is read: follow the keys, and when the value is a JSON array take
/// element 0 (a one-element daily list). null, a missing key, or an empty array is an Err, which is a failed fetch.
pub fn value_at<'a>(
    root: &'a serde_json::Value,
    path: &[&str],
) -> Result<&'a serde_json::Value, String> {
    let mut current = root;
    for key in path {
        current = current
            .get(*key)
            .ok_or_else(|| format!("missing {key} in the response"))?;
    }
    if let Some(items) = current.as_array() {
        current = items
            .first()
            .ok_or_else(|| String::from("empty list in the response"))?;
    }
    if current.is_null() {
        return Err(String::from("null value in the response"));
    }
    Ok(current)
}

pub fn number_at(root: &serde_json::Value, path: &[&str]) -> Result<f64, String> {
    value_at(root, path)?
        .as_f64()
        .ok_or_else(|| String::from("the response value is not a number"))
}

pub fn text_at(root: &serde_json::Value, path: &[&str]) -> Result<String, String> {
    value_at(root, path)?
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| String::from("the response value is not text"))
}
`)] : []),
    ...(http ? [file("tests/http_tests.rs", String.raw`
use ${crate}::platform::http::*;

fn body(text: &str) -> serde_json::Value {
    serde_json::from_str(text).expect("test json")
}

#[test]
fn percent_encoding_keeps_unreserved_and_encodes_the_rest_as_utf8() {
    assert_eq!(percent_encode("San José"), "San%20Jos%C3%A9");
    assert_eq!(percent_encode("a-b.c_d~e1"), "a-b.c_d~e1");
    assert_eq!(percent_encode("a+b/c?"), "a%2Bb%2Fc%3F");
}

#[test]
fn fill_url_substitutes_numbers_and_encodes_text() {
    let template = "https://x.example/f?latitude={latitude}&longitude={longitude}&q={city}";
    let url = fill_url(
        template,
        &[
            (
                "latitude",
                Slot::Number {
                    value: " 48.85 ",
                    min: Some(-90.0),
                    max: Some(90.0),
                },
            ),
            (
                "longitude",
                Slot::Number {
                    value: "-3",
                    min: Some(-180.0),
                    max: Some(180.0),
                },
            ),
            ("city", Slot::Text("San José")),
        ],
    );
    assert_eq!(
        url,
        Ok(String::from(
            "https://x.example/f?latitude=48.85&longitude=-3&q=San%20Jos%C3%A9"
        ))
    );
}

#[test]
fn fill_url_refuses_missing_empty_and_out_of_range_values() {
    let lat = |value| Slot::Number {
        value,
        min: Some(-90.0),
        max: Some(90.0),
    };
    assert!(fill_url("a/{latitude}", &[("latitude", lat("91"))]).is_err());
    assert!(fill_url("a/{latitude}", &[("latitude", lat("-90.5"))]).is_err());
    assert!(fill_url("a/{latitude}", &[("latitude", lat("north"))]).is_err());
    assert!(fill_url("a/{latitude}", &[("latitude", lat("NaN"))]).is_err());
    assert!(fill_url("a/{latitude}", &[("latitude", lat("inf"))]).is_err());
    assert!(fill_url("a/{latitude}", &[("latitude", lat(""))]).is_err());
    assert!(fill_url("a/{city}", &[("city", Slot::Text("  "))]).is_err());
    assert!(fill_url("a/{longitude}", &[("latitude", lat("1"))]).is_err());
    assert!(fill_url("a/{latitude", &[("latitude", lat("1"))]).is_err());
    assert_eq!(
        fill_url("a/{latitude}", &[("latitude", lat("90"))]),
        Ok(String::from("a/90"))
    );
}

#[test]
fn a_scalar_field_reads_element_zero_of_a_one_element_array() {
    let path = ["daily", "value"];
    let list = body(r#"{"daily":{"value":[40]}}"#);
    let plain = body(r#"{"daily":{"value":40}}"#);
    assert_eq!(number_at(&list, &path), Ok(40.0));
    assert_eq!(number_at(&plain, &path), Ok(40.0));
    let day = body(r#"{"daily":{"day":["Mon"]}}"#);
    assert_eq!(text_at(&day, &["daily", "day"]), Ok(String::from("Mon")));
}

#[test]
fn null_missing_and_empty_are_failed_fetches() {
    let path = ["daily", "value"];
    assert!(number_at(&body(r#"{"daily":{"value":[null]}}"#), &path).is_err());
    assert!(number_at(&body(r#"{"daily":{"value":null}}"#), &path).is_err());
    assert!(number_at(&body(r#"{"daily":{"value":[]}}"#), &path).is_err());
    assert!(number_at(&body(r#"{"daily":{}}"#), &path).is_err());
    assert!(text_at(&body(r#"{"daily":{"day":[7]}}"#), &["daily", "day"]).is_err());
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
    ...(http ? [file("src/platform/runtime.rs", String.raw`
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
`)] : []),
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
use std::sync::atomic::{AtomicBool, Ordering};

use ${crate}::config::Settings;
use ${crate}::module::{self, Cache, ModuleOutput, STALE_SUFFIX};
use ${crate}::module::{Comparison, Threshold};

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
fn severity_comes_from_declared_thresholds_in_both_directions_and_stale_wins() {
    assert_eq!(module::severity_class_with(Some(9.0), &[]), "normal");
    let above = [
        Threshold {
            class: "warning",
            comparison: Comparison::Above,
            value: 1.0,
        },
        Threshold {
            class: "critical",
            comparison: Comparison::Above,
            value: 2.0,
        },
    ];
    for (value, class) in [
        (None, "normal"),
        (Some(1.0), "normal"),
        (Some(1.5), "warning"),
        (Some(2.0), "warning"),
        (Some(2.5), "critical"),
    ] {
        assert_eq!(module::severity_class_with(value, &above), class);
    }
    let below = [
        Threshold {
            class: "warning",
            comparison: Comparison::Below,
            value: 20.0,
        },
        Threshold {
            class: "critical",
            comparison: Comparison::Below,
            value: 10.0,
        },
    ];
    for (value, class) in [
        (None, "normal"),
        (Some(20.0), "normal"),
        (Some(19.9), "warning"),
        (Some(10.0), "warning"),
        (Some(9.9), "critical"),
    ] {
        assert_eq!(module::severity_class_with(value, &below), class);
    }
    assert_eq!(
        module::severity_class(Some(1.0)),
        module::severity_class_with(Some(1.0), module::THRESHOLDS)
    );
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
fn a_failed_refresh_rebuilds_a_lost_cache_from_the_stored_record_and_keeps_an_existing_one() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let path = directory.path().join("cache.json");
    let settings = Settings::default();
    let stored = |_: &Settings, _: u64| Some(cached("14:05", 0).output);
    let failing = |_: &Settings, _: u64| Err(String::from("unreachable"));
    // No cache and nothing stored: the failed refresh leaves no cache (the empty state).
    assert!(module::refresh_with(&path, &settings, 10, failing, |_, _| None).is_err());
    assert!(module::read_cache(&path).is_none());
    // No cache but a stored record: the cache is rebuilt from it, marked stale.
    assert!(module::refresh_with(&path, &settings, 10, failing, stored).is_err());
    let rebuilt = module::read_cache(&path).expect("cache rebuilt");
    assert_eq!(rebuilt.output.text, "14:05");
    assert_eq!(rebuilt.output.class, "stale");
    // An existing cache is kept (marked stale) and the stored record is not consulted.
    module::refresh_with(
        &path,
        &settings,
        20,
        |_, _| Ok(cached("15:00", 0).output),
        stored,
    )
    .expect("fresh refresh");
    assert!(module::refresh_with(&path, &settings, 30, failing, stored).is_err());
    let kept = module::read_cache(&path).expect("cache kept");
    assert_eq!(kept.output.text, "15:00");
    assert_eq!(kept.output.class, "stale");
    assert_eq!(kept.updated_unix, 20);
}

#[test]
fn the_empty_state_is_the_fixed_placeholder() {
    assert_eq!(Settings::default().text, "${WAYBAR_EMPTY_LABEL}");
    assert_eq!(module::EMPTY_TEXT, "${WAYBAR_EMPTY_LABEL}");
}

#[test]
fn unknown_action_is_rejected_and_the_vocabulary_is_fixed() {
    assert_eq!(module::ACTIONS, &["click", "refresh"]);
    assert!(module::run_action("toggle").is_err());
}

#[test]
fn service_loop_stops_after_the_pass_that_sees_the_shutdown_flag() {
    let shutdown = AtomicBool::new(false);
    let mut passes = 0;
    module::serve_until(&shutdown, || {
        passes += 1;
        shutdown.store(true, Ordering::SeqCst);
        5
    });
    assert_eq!(passes, 1);
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
Description=${systemdValue(identity.projectName)}
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
pkgdesc=${shellWord(identity.projectName)}
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
    ...systemFiles.map(item => file(item.name, item.content)),
  ]
}

export function presetKit(presetId: PresetId, identity: ProjectIdentity, blueprint: NormalizedBlueprint, options: Readonly<Record<string, string | boolean | readonly string[]>> = {}): readonly KitFile[] {
  if (presetId === "linux-wayland-gtk4-desktop") return gtkKit(identity, blueprint)
  if (presetId === "linux-hyprland-waybar-module") return waybarKit(identity, blueprint, options)
  if (presetId === "astro-web") return astroKit(identity, blueprint, options).map(item => ({ path: item.path, content: item.content }))
  if (presetId === "android-kotlin-compose") return androidKit(identity, blueprint).map(item => ({ path: item.path, content: item.content }))
  if (presetId === "tauri2-rust-typescript-desktop") {
    const uses = tauriKitUses(blueprint, options)
    const files = tauriKitFiles(identity, uses)
    return [{ path: "README.md", content: tauriKitReadme(identity, files.map(item => item.path), uses) }, ...files]
  }
  return []
}

export function kitProjectPaths(kit: readonly KitFile[]): string[] {
  return kit.map(item => item.path)
}

