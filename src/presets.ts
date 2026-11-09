import { ANDROID_DEVICE_COMMANDS, ANDROID_DEVICE_GATE_RULE } from "./androidPlan"
import { ANDROID_SDK } from "./androidKit"
import type { FeatureSurface } from "./schema"

export const PRESET_IDS = [
  "linux-wayland-gtk4-desktop",
  "linux-hyprland-waybar-module",
  "tauri2-rust-typescript-desktop",
  "astro-web",
  "android-kotlin-compose",
] as const

export type PresetId = (typeof PRESET_IDS)[number]
export type OwnerKind = "feature" | "integration" | "data" | "credential" | "permission" | "lifecycle" | "packaging"
export const PERMISSION_CAPABILITIES = ["microphone", "accessibility", "notifications", "filesystem", "network", "camera", "location", "global-input", "clipboard", "background-startup", "background-execution"] as const
export type PermissionCapability = (typeof PERMISSION_CAPABILITIES)[number]
export type PresetRuntimeMode = "native" | "waybar" | "cross-platform" | "static" | "server" | "android"

export interface PresetSemanticInput {
  readonly externalServices: readonly { readonly credentialRequirement: "none" | "api-key" }[]
}

export interface PresetOption {
  readonly id: string
  readonly label: string
  readonly type: "select" | "toggle" | "multi"
  readonly values?: readonly string[]
  readonly default: string | boolean | readonly string[]
  readonly description: string
}

export type PresetOptionValue = string | boolean | readonly string[]

export interface PresetOptionResolution {
  readonly values: Readonly<Record<string, PresetOptionValue>>
  readonly issues: readonly string[]
}

export function resolvePresetOptions(presetId: PresetId, entries: readonly string[]): PresetOptionResolution {
  const preset = PRESETS[presetId]
  const issues: string[] = []
  const provided = new Map<string, string>()
  for (const entry of entries) {
    const separator = entry.indexOf("=")
    if (separator < 1) {
      issues.push(`Option must be key=value: ${entry}`)
      continue
    }
    const key = entry.slice(0, separator)
    if (provided.has(key)) issues.push(`Option '${key}' is provided more than once.`)
    provided.set(key, entry.slice(separator + 1))
  }
  const values: Record<string, PresetOptionValue> = {}
  for (const option of preset.options) {
    const value = provided.get(option.id)
    if (option.type === "toggle") {
      if (value === undefined) values[option.id] = option.default
      else if (value === "true" || value === "false") values[option.id] = value === "true"
      else issues.push(`Option '${option.id}' must be true or false.`)
      provided.delete(option.id)
      continue
    }
    if (option.type === "select") {
      const selected = value ?? String(option.default)
      if (option.values?.includes(selected)) values[option.id] = selected
      else issues.push(`Option '${option.id}' must be one of ${option.values?.join(", ")}.`)
      provided.delete(option.id)
      continue
    }
    const selected = value === undefined
      ? (Array.isArray(option.default) ? option.default : [])
      : value.split(",").map(item => item.trim()).filter(Boolean)
    const invalid = selected.filter(item => !option.values?.includes(item))
    if (invalid.length) issues.push(`Option '${option.id}' has unknown values: ${invalid.join(", ")}.`)
    else values[option.id] = selected
    provided.delete(option.id)
  }
  for (const key of provided.keys()) issues.push(`Unknown option '${key}'.`)
  return { values, issues }
}

export interface PresetCapabilities {
  readonly windows: boolean
  readonly tray: boolean
  readonly background: boolean
  readonly notifications: boolean
  readonly documents: boolean
  readonly fileAccess: "portal" | "saf" | "dialog" | "web" | "none"
  readonly microphone: boolean
  readonly camera: boolean
  readonly location: boolean
  readonly launchAtLogin: boolean
  readonly network: boolean
  readonly globalShortcuts: "app" | "compositor-bind" | "none"
  readonly clipboardWatch: boolean
  readonly accessibilityControl: boolean
  readonly surfaces: readonly FeatureSurface[]
}

// Every preset's CON-RUNTIME-WIRING carries these: a failure the PRD shows the user must be visible in
// the running app, every screen must be usable as seen, not only reachable through accessibility or
// storage, and the hands-on launch check must not leave its test data in the user's real state.
const SHARED_WIRING_RULES = [
  "The launch check looks at the app, not only its accessibility tree or stored data: with each list holding several entries, one of them longer than the view is wide, it takes a screenshot of every window, menu, panel, and page and confirms by looking at each one that every heading, row, and control lies fully inside the view, long text truncates or wraps inside it, and text is readable against its background. Clipped, overlapping, or off-screen content blocks completion. If no screenshot can be taken, the completion report says so and asks the user to look instead of reporting the screens as checked.",
  "Every screen follows the platform's conventions: an empty list shows one centered message saying how to fill it; a command with nothing to act on is disabled until it has a target; long text in a list is cut to a few lines with the full text available, never a scroll area inside a scrolling list; settings are grouped rows with the label on the left and the control on the right, a switch or checkbox on the same line as its label, and a short note under each group; buttons are sized to their label, not stretched across the window; body text uses the system font. The launch check confirms each of these in its screenshots.",
  "Every failure behavior that shows the user a message is visible in the running app: a view renders the owning feature's error state, and no entry point silently discards an error that the PRD says the user sees. The launch check triggers one such failure per feature that has one and confirms the message appears.",
  "The launch check leaves no test data behind: it restores every setting it changed to its previous value and removes every record and file it created, and the completion report lists anything it could not remove.",
] as const

export const USER_SELECTED_FILE_PLACEMENT = "The exact path the user chooses in the desktop portal; the app keeps no copy."

export interface ProjectIdentity {
  readonly projectName: string
  readonly slug: string
  readonly pascalName: string
  readonly moduleName: string
  readonly bundleId: string
  readonly packageName: string
  readonly packagePath: string
}

export interface OwnerFileInput {
  readonly kind: OwnerKind
  readonly slug: string
  readonly pascalName: string
  readonly identity: ProjectIdentity
  readonly serverIntegration?: boolean
  readonly pageFile?: string
}

export interface OwnerFiles {
  readonly implementationFile: string
  readonly focusedTestFile: string
  readonly focusedTestCommand: string
}

export interface PresetContract {
  readonly id: PresetId
  readonly label: string
  readonly platform: string
  readonly implementationMarker: string
  readonly allowedTechnologies: readonly string[]
  readonly forbiddenTechnologies: readonly string[]
  readonly testFramework: string
  readonly sourceLayout: (identity: ProjectIdentity) => readonly string[]
  readonly packagingFiles: (identity: ProjectIdentity) => readonly string[]
  readonly ownerFiles: (input: OwnerFileInput) => OwnerFiles
  readonly registrationFile: (kind: OwnerKind, identity: ProjectIdentity) => string
  readonly registrationFiles?: (kind: OwnerKind, identity: ProjectIdentity) => readonly string[]
  readonly runtimeMode: (blueprint: PresetSemanticInput) => PresetRuntimeMode
  readonly runtimeArchitecture: readonly string[]
  readonly integrationBoundary: string
  readonly recoveryRules: readonly string[]
  // Used instead of recoveryRules when the blueprint has no service, file access, or other interactive input.
  readonly staticRecoveryRules?: readonly string[]
  readonly persistence: {
    readonly enabledDecision: string
    readonly disabledDecision: string
    readonly settingsPlacement: string
    readonly recordsPlacement: string
    readonly temporaryPlacement: string
    readonly appFilesPlacement: (identity: ProjectIdentity) => string
    readonly documentPlacement: string
    readonly documentAtomicWrite?: string
    // Per-object decision text when one store kind must not be described by the other store's wording.
    readonly settingsDecision?: string
    readonly recordsDecision?: string
  }
  readonly credentialPlacement: string
  readonly permissionPatterns: Readonly<Record<PermissionCapability, string>>
  readonly lifecycleRules: readonly string[]
  readonly accessibilityRules: readonly string[]
  readonly validationCommands: readonly ((identity: ProjectIdentity) => string)[]
  readonly foundationValidationCommands?: readonly string[]
  readonly packagingRules: readonly string[]
  readonly wiringRules: readonly string[]
  readonly wiringManifestFiles?: readonly string[]
  readonly installationDecision: (identity: ProjectIdentity) => string
  readonly signingDecision: (identity: ProjectIdentity) => string
  readonly outputArtifact: string
  readonly artifactPath: (identity: ProjectIdentity) => string
  readonly completionEvidence: readonly string[]
  readonly fileBoundary: string
  readonly fileBoundaryDetails?: readonly string[]
  // Used instead of fileBoundary when no feature touches a user-chosen file.
  readonly appOnlyFileBoundary?: { readonly boundary: string; readonly details: readonly string[] }
  // Replaces the shared purpose sentence of a permission when it names a surface the platform lacks.
  readonly permissionPurposes?: Partial<Readonly<Record<PermissionCapability, string>>>
  // Gates that need hardware: rendered beside the validation commands, never as mandatory exit-zero gates.
  readonly deviceGates?: { readonly rule: string; readonly commands: readonly string[] }
  readonly launchCheck: (identity: ProjectIdentity) => string
  readonly options: readonly PresetOption[]
  readonly capabilities: PresetCapabilities
}

const linuxGtkPermissionPatterns: Readonly<Record<PermissionCapability, string>> = {
  microphone: "Use PipeWire or GStreamer through the XDG desktop portal; request capture only from an explicit recording action and release every stream on stop.",
  accessibility: "Use GTK4 and AT-SPI for the app's own accessibility. The app cannot control another application on Wayland; a feature that needs that is outside this preset.",
  notifications: "Use gio::Notification through the freedesktop notification service; when no daemon is present, keep in-app status and do not retry in a loop.",
  filesystem: "Read and write only the app's XDG config, data, and runtime directories and files or folders chosen in org.freedesktop.portal.FileChooser; never scan another user folder.",
  network: "Use reqwest with rustls and HTTPS only; Linux has no network permission, so the boundary is the declared service list.",
  camera: "Use PipeWire or GStreamer through the portal after an explicit action; release the stream on stop.",
  location: "Use GeoClue2 through the portal only while the feature is visible; manual entry remains available when denied.",
  "global-input": "Do not grab keys. Register a Hyprland bind that runs the app with --action toggle; if that is unavailable, keep in-app controls and state the limitation.",
  clipboard: "Use the GTK clipboard only from an explicit user action; never watch the clipboard in the background on Wayland.",
  "background-startup": "Use a systemd user unit enabled at login; the installer may add a Hyprland exec-once line when the session does not start systemd user units. Manual launch remains available.",
  "background-execution": "Use a systemd user service with Restart=on-failure; keep a StatusNotifierItem tray only when declared; otherwise no daemon runs after the window closes.",
}

const waybarPermissionPatterns: Readonly<Record<PermissionCapability, string>> = {
  microphone: "A status module captures no audio; reject a feature that needs capture.",
  accessibility: "Waybar owns the UI; the module cannot control another application on Wayland.",
  notifications: "Use notify-send or D-Bus only from a click action; never prompt in the background.",
  filesystem: "Read and write only the app's XDG config/data directories and explicit CLI paths; never scan $HOME.",
  network: "Use reqwest with rustls and HTTPS only; the module's output must never contain a secret.",
  camera: "A status module captures no camera; reject a feature that needs capture.",
  location: "A status module does not capture location; reject a feature that needs it.",
  "global-input": "Do not grab keys. Waybar on-click/on-scroll or a Hyprland bind invokes the binary.",
  clipboard: "Use wl-copy only from a click action; never watch the clipboard.",
  "background-startup": "Use a systemd user unit; the installer may add a Hyprland exec-once line. Manual launch remains available.",
  "background-execution": "Use a systemd user service with Restart=on-failure for refresh work; the Waybar exec path stays stateless per invocation.",
}

const tauriPermissionPatterns: Readonly<Record<PermissionCapability, string>> = {
  microphone: "On macOS declare NSMicrophoneUsageDescription in src-tauri/Info.plist; on Linux request capture through the desktop portal and PipeWire; expose one Rust command for platform authorization and never capture before approval.",
  accessibility: "Keep platform accessibility adapters behind one Rust command with denial recovery. On Wayland, controlling another app is outside the compositor's security model.",
  notifications: "Use tauri-plugin-notification with the notification:default permission; check isPermissionGranted() and requestPermission() only from a user action before sendNotification().",
  filesystem: "Use tauri-plugin-dialog only to let the user choose paths; Rust commands read and write only those chosen paths, including paths saved earlier to reopen, with std::fs after canonicalizing each path; the frontend gets no tauri-plugin-fs access.",
  network: "Perform remote calls in Rust with an allowlisted HTTPS destination and privacy-safe errors.",
  camera: "On macOS declare NSCameraUsageDescription in src-tauri/Info.plist; on Linux request capture through the portal and PipeWire; request access only after an explicit action.",
  location: "On macOS declare the location usage strings in src-tauri/Info.plist; on Linux use GeoClue2 through the portal; denial keeps non-location behavior available.",
  "global-input": "Verify the plugin's Wayland behavior at kit-build time. If it is X11-only, provide a Hyprland bind that invokes the app and grant no global-shortcut plugin permission.",
  clipboard: "Use tauri-plugin-clipboard-manager: a copy-only feature gets clipboard-manager:allow-write-text and never reads; grant allow-read-text only to a feature that reads clipboard content from an explicit action.",
  "background-startup": "Use tauri-plugin-autostart behind an explicit setting; on Linux prefer a systemd user unit or a Hyprland exec-once line when the plugin does not work on Wayland.",
  "background-execution": "Keep the Rust process and tray running after the main window closes only when declared; use a systemd user service where the platform requires one.",
}

const webPermissionPatterns: Readonly<Record<PermissionCapability, string>> = {
  microphone: "Call getUserMedia for audio only after an explicit control activation and stop every MediaStream track after use.",
  accessibility: "Rely on semantic HTML, focus management, and assistive-technology compatible DOM behavior; no privileged accessibility access exists on the web.",
  notifications: "Request the Notifications API permission only after an explicit opt-in and retain an in-page alternative when denied.",
  filesystem: "Use a user-initiated file input or File System Access API path with a download fallback; never assume persistent access.",
  network: "Use fetch only for documented HTTPS resources; static output performs no background request unless product semantics require it.",
  camera: "Call getUserMedia for video only after an explicit control activation and stop every MediaStream track after use.",
  location: "Use one foreground Geolocation API request after explicit consent and provide a manual alternative.",
  "global-input": "Web pages cannot register system-wide input; scope keyboard shortcuts to the focused page and state that boundary.",
  clipboard: "Use the Async Clipboard API only from a user action and retain a selectable-text fallback when permission is denied.",
  "background-startup": "Static web output cannot start at operating-system login; provide installable or bookmark guidance without claiming background startup.",
  "background-execution": "A web page cannot run after it is closed; perform background work only while the page is open and state that boundary instead of claiming background operation.",
}

const androidPermissionPatterns: Readonly<Record<PermissionCapability, string>> = {
  microphone: "Declare android.permission.RECORD_AUDIO and request it at runtime immediately before recording; denial leaves non-recording screens usable.",
  accessibility: "Use an AccessibilityService only when the product explicitly needs it, with a dedicated service declaration and a non-service fallback.",
  notifications: "Declare android.permission.POST_NOTIFICATIONS in AndroidManifest.xml. One flow, owned by PermissionCoordinator.kt: MainActivity.onCreate registers one ActivityResultContracts.RequestPermission launcher and calls PermissionCoordinator.requestOnFirstLaunch; on Android 13+, when the permission is not granted and SettingsRepository.notificationPermissionState is \"unasked\", it launches the request once and records \"granted\" or \"denied\" with recordNotificationPermission. No later launch prompts again; the in-app status reads the real grant, so a grant made in system settings is honored. Below Android 13 nothing is requested. Denial keeps every other feature working and shows in-app status that notifications are off; scheduled work is not a retry and keeps its schedule.",
  filesystem: "Use the Storage Access Framework for user-chosen documents; when a feature reopens a saved document URI later, call ContentResolver.takePersistableUriPermission at selection time and releasePersistableUriPermission when the app stops keeping that URI.",
  network: "Declare INTERNET and keep HTTPS calls behind the repository or service boundary with offline and retry states.",
  camera: "Declare CAMERA and request it at runtime from the capture action; denial leaves non-camera behavior available.",
  location: "Declare ACCESS_COARSE_LOCATION and request foreground access only from the location action; provide manual entry when denied.",
  "global-input": "Android does not expose arbitrary system-wide hotkeys to ordinary apps; use supported media, notification, or in-app actions only.",
  clipboard: "Use ClipboardManager only from a user action and never read clipboard contents in the background.",
  "background-startup": "Use WorkManager or exact platform-supported scheduling for bounded work; do not claim unrestricted startup at boot.",
  "background-execution": "Use WorkManager for bounded deferred work that must run while the app is not in the foreground; do not keep a persistent foreground service unless the product needs ongoing user-visible work.",
}

function gtkOwnerFiles(input: OwnerFileInput): OwnerFiles {
  const segment = input.slug.replaceAll("-", "_")
  if (input.kind === "packaging") {
    return {
      implementationFile: "scripts/package.sh",
      focusedTestFile: "tests/packaging_contract_tests.rs",
      focusedTestCommand: "cargo test --test packaging_contract_tests",
    }
  }
  if (input.kind === "feature") {
    return {
      implementationFile: `src/features/${segment}.rs`,
      focusedTestFile: `tests/${segment}_tests.rs`,
      focusedTestCommand: `cargo test --test ${segment}_tests`,
    }
  }
  return {
    implementationFile: `src/platform/${segment}.rs`,
    focusedTestFile: `tests/platform_${segment}_tests.rs`,
    focusedTestCommand: `cargo test --test platform_${segment}_tests`,
  }
}

function waybarOwnerFiles(input: OwnerFileInput): OwnerFiles {
  const segment = input.slug.replaceAll("-", "_")
  if (input.kind === "packaging") {
    return {
      implementationFile: "scripts/package.sh",
      focusedTestFile: "tests/packaging_contract_tests.rs",
      focusedTestCommand: "cargo test --test packaging_contract_tests",
    }
  }
  if (input.kind === "feature") {
    return {
      implementationFile: `src/features/${segment}.rs`,
      focusedTestFile: `tests/${segment}_tests.rs`,
      focusedTestCommand: `cargo test --test ${segment}_tests`,
    }
  }
  return {
    implementationFile: `src/platform/${segment}.rs`,
    focusedTestFile: `tests/platform_${segment}_tests.rs`,
    focusedTestCommand: `cargo test --test platform_${segment}_tests`,
  }
}

function tauriOwnerFiles(input: OwnerFileInput): OwnerFiles {
  if (input.kind === "feature") {
    return {
      implementationFile: `src/features/${input.slug}.ts`,
      focusedTestFile: `tests/features/${input.slug}.test.ts`,
      focusedTestCommand: `npm test -- tests/features/${input.slug}.test.ts`,
    }
  }
  const folder = input.kind === "integration" ? "integrations" : "platform"
  return {
    implementationFile: `src-tauri/src/${folder}/${input.slug}.rs`,
    focusedTestFile: `src-tauri/tests/${input.slug}_tests.rs`,
    focusedTestCommand: `cargo test --manifest-path src-tauri/Cargo.toml --test ${input.slug}_tests`,
  }
}

function astroOwnerFiles(input: OwnerFileInput): OwnerFiles {
  if (input.kind === "feature") {
    if (input.pageFile) {
      return {
        implementationFile: input.pageFile,
        focusedTestFile: `tests/${input.slug}.test.ts`,
        focusedTestCommand: `npm test -- tests/${input.slug}.test.ts`,
      }
    }
    return {
      implementationFile: `src/components/${input.pascalName}.astro`,
      focusedTestFile: `tests/${input.slug}.test.ts`,
      focusedTestCommand: `npm test -- tests/${input.slug}.test.ts`,
    }
  }
  const implementationFile = input.kind === "integration"
    ? input.serverIntegration ? `src/pages/api/${input.slug}.ts` : `src/lib/${input.slug}.ts`
    : `src/lib/${input.slug}.ts`
  const focusedTestFile = `tests/${input.slug}.test.ts`
  return { implementationFile, focusedTestFile, focusedTestCommand: `npm test -- ${focusedTestFile}` }
}

function androidOwnerFiles(input: OwnerFileInput): OwnerFiles {
  const mainRoot = `app/src/main/java/${input.identity.packagePath}`
  const testRoot = `app/src/test/java/${input.identity.packagePath}`
  const folder = input.kind === "feature" ? `feature/${input.slug}` : `platform/${input.slug}`
  const implementationFile = `${mainRoot}/${folder}/${input.pascalName}.kt`
  const focusedTestFile = `${testRoot}/${folder}/${input.pascalName}Test.kt`
  return {
    implementationFile,
    focusedTestFile,
    focusedTestCommand: `./scripts/gradle.sh testDebugUnitTest --tests "${input.identity.packageName}.${folder.replaceAll("/", ".")}.${input.pascalName}Test"`,
  }
}

const linuxGtk: PresetContract = {
  id: "linux-wayland-gtk4-desktop",
  label: "Linux Wayland GTK4 Desktop",
  platform: "Linux (Wayland; Arch, Omarchy, Hyprland)",
  implementationMarker: "AdwApplication",
  allowedTechnologies: ["Rust", "GTK4", "libadwaita", "GLib/GIO", "rusqlite", "reqwest with rustls", "tokio", "keyring (Secret Service)", "serde", "serde_json", "dirs", "thiserror", "tempfile", "tracing", "cargo test", "PKGBUILD"],
  forbiddenTechnologies: ["SwiftUI", "AppKit", "Tauri", "Electron", "GTK3", "Qt", "X11-only APIs", "xdotool", "wmctrl", "libappindicator", "webview UI"],
  testFramework: "cargo test, cargo clippy, and a hands-on Wayland launch check",
  sourceLayout: identity => [
    "Cargo.toml",
    "src/main.rs",
    "src/app.rs",
    "src/state.rs",
    "src/platform/mod.rs",
    "src/features/mod.rs",
    "tests/contract_tests.rs",
  ],
  packagingFiles: identity => [
    `resources/${identity.bundleId}.desktop`,
    `resources/${identity.bundleId}.metainfo.xml`,
    `resources/icons/hicolor/scalable/apps/${identity.slug}.svg`,
    "PKGBUILD",
    "scripts/package.sh",
    "LICENSE",
  ],
  ownerFiles: gtkOwnerFiles,
  registrationFile: () => "src/app.rs",
  registrationFiles: (kind, identity) => kind === "feature"
    ? ["src/features/mod.rs", "src/state.rs", "src/app.rs"]
    : kind === "data"
      ? ["src/platform/mod.rs", "src/state.rs", "src/app.rs"]
      : kind === "packaging"
        ? ["src/app.rs"]
        : ["src/platform/mod.rs", "src/state.rs", "src/app.rs"],
  runtimeMode: () => "native",
  runtimeArchitecture: [
    "Use one AdwApplication with the locked application ID and one AdwApplicationWindow; AdwHeaderBar is the title bar of an AdwToolbarView that holds the window content.",
    "One AppState lives on the GTK main thread; async work runs on a tokio runtime and returns to the main context through glib::MainContext::spawn_local. No blocking I/O runs on the main thread.",
    "Rust platform owners implement atomic file writes and XDG paths, plus SQLite records, Secret Service credentials, notifications, and the HTTPS client only where a contract names them; features depend on their traits.",
    "Read and write only the app's XDG config, data, and runtime directories and paths chosen in org.freedesktop.portal.FileChooser; never scan another user folder. A file the app replaces is written to a temporary file in the same directory and renamed over the destination.",
  ],
  integrationBoundary: "Use one reqwest client with rustls inside each integration owner; HTTPS only, typed serde DTOs, timeouts, and privacy-safe errors. Never pass a raw response body to a view.",
  recoveryRules: [
    "Model every operation as idle, active, succeeded, failed, or cancelled and preserve the last valid user state.",
    "Start a retry only from an explicit user action; a declared automatic fallback is not a retry. Cancel tasks and release streams, file handles, database statements, and temporary files on every terminal path.",
  ],
  persistence: {
    enabledDecision: "Persistence: enabled with atomic JSON settings in XDG config and SQLite records in XDG data.",
    disabledDecision: "Persistence: disabled; keep transient state in memory and write no application records between launches.",
    settingsPlacement: "Atomic JSON at $XDG_CONFIG_HOME/{app-id}/settings.json with versioned keys and explicit reset behavior.",
    recordsPlacement: "SQLite at $XDG_DATA_HOME/{app-id}/records.sqlite3 with PRAGMA user_version and transactional migrations.",
    temporaryPlacement: "One per-operation directory under $XDG_RUNTIME_DIR/{app-id}/; delete on success, discard, cancellation, or exhausted recovery.",
    appFilesPlacement: identity => `Files under $XDG_DATA_HOME/${identity.bundleId}/files/, created only by the app under generated unique names; stored references hold the file name relative to that folder.`,
    documentPlacement: USER_SELECTED_FILE_PLACEMENT,
  },
  credentialPlacement: "Store credentials through the Secret Service (GNOME Keyring or KWallet) with the locked application ID as service and a deterministic account name; fail closed if no Secret Service is available.",
  fileBoundary: "Read and write only the app's XDG config, data, and runtime directories and files or folders the user chooses in the desktop portal; never scan another user folder.",
  fileBoundaryDetails: ["Settings: $XDG_CONFIG_HOME/{app-id}/settings.json.", "Records and app-owned files: $XDG_DATA_HOME/{app-id}/.", "User-chosen paths come only from org.freedesktop.portal.FileChooser or a path the app saved to reopen.", "Every path outside this boundary is rejected and leaves the filesystem unchanged."],
  launchCheck: identity => `./scripts/package.sh --install, then run GDK_BACKEND=wayland ~/.local/bin/${identity.slug} and inspect every window.`,
  permissionPatterns: linuxGtkPermissionPatterns,
  lifecycleRules: [
    "Use AdwApplication as the entry point and keep exactly one primary window.",
    "On window close or SIGTERM, cancel active tasks, close the SQLite connection, remove temporary files, and release streams.",
    "Use a systemd user unit only for a declared background feature; no daemon starts otherwise.",
    "Reopen the main window from the launcher; there is no Dock or menu-bar concept.",
  ],
  accessibilityRules: ["Use GTK4 semantics and AT-SPI, full keyboard operation, visible focus, high-contrast support, scalable text, and reduced-motion-aware transitions."],
  foundationValidationCommands: ["cargo fmt --check", "cargo clippy --all-targets --all-features -- -D warnings", "cargo test"],
  validationCommands: [
    () => "cargo fmt --check",
    () => "cargo clippy --all-targets --all-features -- -D warnings",
    () => "cargo test",
    () => "cargo build --release",
    identity => `desktop-file-validate resources/${identity.bundleId}.desktop`,
    identity => `appstreamcli validate resources/${identity.bundleId}.metainfo.xml`,
    () => "makepkg --printsrcinfo",
  ],
  packagingRules: [
    "scripts/package.sh is the sole packaging authority for local proof: release build, install to ~/.local, desktop entry, icon, metainfo, and optional systemd unit.",
    "PKGBUILD is the Arch distribution authority: cargo build --release, install binary, desktop entry, icon, metainfo, license, and optional systemd unit.",
    "Validate the desktop entry with desktop-file-validate, the metainfo with appstreamcli, and the PKGBUILD with makepkg --printsrcinfo before completion.",
    "Start the installed binary for the launch check with GDK_BACKEND=wayland set on that command; a silent fallback to X11 is a contract violation.",
  ],
  wiringRules: [
    "src/app.rs is the composition root and constructs every feature with the concrete platform owners named in the contracts; test doubles exist only under tests/.",
    "The packaging focused test constructs the production composition root and asserts that every injected platform dependency is the concrete production type.",
    "Before completion, launch the installed binary under Wayland, complete one acceptance outcome per feature, quit, relaunch, and confirm that every declared stored data object is still present.",
    "Keep filtering, ordering, validation, and message selection in display-free view-model functions that the focused tests assert on; cargo test must pass without a display, and widget checks belong to the launch check.",
    "Kit helpers that no contract names are optional; do not call a credential, HTTP, or tray helper only to satisfy the wiring gate. Every owner named in TRD.md must be reachable from the production composition root.",
    ...SHARED_WIRING_RULES,
  ],
  installationDecision: identity => `For local proof, run scripts/package.sh --install: build, install the binary under ~/.local/bin, the desktop entry under ~/.local/share/applications, the icon and metainfo under ~/.local/share, and any declared systemd unit under ~/.config/systemd/user; keep the previous install as a rollback copy. For distribution, run makepkg -si and verify the installed package.`,
  signingDecision: () => "Local proof is unsigned. Distribution signing is a separate release decision using the packager's GPG key; the local packet does not require a signature.",
  outputArtifact: "native Wayland binary and Arch package",
  artifactPath: identity => `dist/${identity.slug}`,
  completionEvidence: ["Cargo format, clippy, test, and release build pass.", "desktop-file-validate and appstreamcli pass, and makepkg --printsrcinfo parses the PKGBUILD.", "The installed binary launches under Wayland.", "Declared stored data survives the restart check."],
  options: [
    { id: "packaging", label: "Packaging", type: "select", values: ["local", "pkgbuild"], default: "local", description: "Recorded in the packet. v4.0 validates the PKGBUILD and local install either way; option-driven packaging selection is next." },
  ],
  capabilities: {
    windows: true,
    tray: false,
    background: false,
    notifications: true,
    documents: true,
    fileAccess: "portal",
    microphone: true,
    camera: true,
    location: true,
    launchAtLogin: false,
    network: true,
    globalShortcuts: "compositor-bind",
    clipboardWatch: false,
    accessibilityControl: false,
    surfaces: ["main", "item-page", "about-page", "not-found-page"],
  },
}

const linuxWaybar: PresetContract = {
  id: "linux-hyprland-waybar-module",
  label: "Hyprland Waybar Module",
  platform: "Linux (Wayland; Hyprland; Waybar)",
  implementationMarker: "custom/",
  allowedTechnologies: ["Rust", "Waybar custom module JSON", "serde", "serde_json", "clap", "dirs", "thiserror", "tempfile", "rusqlite", "reqwest with rustls", "tokio", "keyring (Secret Service)", "systemd user units", "cargo test", "PKGBUILD"],
  forbiddenTechnologies: ["GTK windows", "Qt windows", "Tauri", "Electron", "X11-only APIs", "xdotool", "libappindicator", "background clipboard watching"],
  testFramework: "cargo test, JSON output schema tests, and a hands-on Waybar launch check",
  sourceLayout: identity => [
    "Cargo.toml",
    "src/main.rs",
    "src/module.rs",
    "src/config.rs",
    "src/platform/mod.rs",
    "src/features/mod.rs",
    "tests/contract_tests.rs",
    "tests/module_output_tests.rs",
  ],
  packagingFiles: identity => [
    "resources/waybar/config.jsonc",
    "resources/waybar/style.css",
    `resources/systemd/${identity.slug}.service`,
    "PKGBUILD",
    "scripts/package.sh",
    "LICENSE",
  ],
  ownerFiles: waybarOwnerFiles,
  registrationFile: () => "src/main.rs",
  registrationFiles: (kind, identity) => kind === "feature"
    ? ["src/features/mod.rs", "src/module.rs", "src/main.rs"]
    : kind === "data"
      ? ["src/platform/mod.rs", "src/config.rs", "src/main.rs"]
      : kind === "packaging"
        ? ["src/main.rs", "src/platform/mod.rs"]
        : ["src/platform/mod.rs", "src/main.rs"],
  runtimeMode: () => "waybar",
  runtimeArchitecture: [
    "The binary is a Waybar custom module: with no arguments or --once it prints exactly one JSON object on stdout and exits 0; logs go to stderr only.",
    "A declared background feature may run with --service under a systemd user unit; the Waybar exec path reads the cached value and never blocks the bar.",
    "Click actions run the same binary with --action toggle; no key grabs, no window, and no clipboard watcher.",
    "The Waybar fragment polls the cached value at its preset interval; the systemd service refreshes the source on the feature's stated interval. The service refresh interval is the feature's stated interval in seconds, not the fragment poll interval; the kit's starting refresh_seconds default (900) and the kit test that asserts it must be changed to that stated interval.",
  ],
  integrationBoundary: "Use one reqwest client with rustls inside each integration owner; HTTPS only, typed serde DTOs, timeouts, and privacy-safe errors. The module output never contains a credential or raw response body.",
  recoveryRules: [
    "On failure, print a JSON error state and exit 0 so Waybar keeps the module; keep the last good value in the cache.",
    "A systemd service restarts on failure; the stateless exec path retries on the next interval without a crash loop.",
  ],
  persistence: {
    enabledDecision: "Persistence: enabled with atomic JSON settings in XDG config and SQLite records in XDG data.",
    disabledDecision: "Persistence: disabled; the module keeps only its last value in memory.",
    settingsPlacement: "Atomic JSON at $XDG_CONFIG_HOME/{app-id}/config.json with versioned keys and explicit reset behavior.",
    recordsPlacement: "SQLite at $XDG_DATA_HOME/{app-id}/records.sqlite3 with PRAGMA user_version and transactional migrations.",
    temporaryPlacement: "One per-operation directory under $XDG_RUNTIME_DIR/{app-id}/; delete on success, discard, cancellation, or exhausted recovery.",
    appFilesPlacement: identity => `Files under $XDG_DATA_HOME/${identity.bundleId}/files/, created only by the app under generated unique names.`,
    documentPlacement: "A path passed explicitly on the command line; the module never opens a file picker.",
  },
  credentialPlacement: "Store credentials through the Secret Service with the locked application ID as service and a deterministic account name; output never contains a credential.",
  fileBoundary: "Read and write only the app's XDG config, data, and runtime directories and explicit CLI paths; never scan the user's home directory.",
  fileBoundaryDetails: ["Settings: $XDG_CONFIG_HOME/{app-id}/config.json.", "Records: $XDG_DATA_HOME/{app-id}/records.sqlite3 only when the blueprint declares records.", "Cache: $XDG_RUNTIME_DIR/{app-id}/cache.json.", "Every path outside this boundary is rejected."],
  launchCheck: identity => `./scripts/package.sh --install, add the Waybar include, restart Waybar, and click the ${identity.slug} module.`,
  permissionPatterns: waybarPermissionPatterns,
  lifecycleRules: [
    "The Waybar exec path is stateless per invocation and exits after one JSON object.",
    "A declared background feature runs under a systemd user unit with Restart=on-failure.",
    "On SIGTERM, flush the cache, close the SQLite connection, and remove temporary files.",
    "The installer copies the Waybar fragment and systemd unit; it does not edit other Waybar modules.",
  ],
  accessibilityRules: ["Waybar owns rendering; use text, tooltip, and class fields so state is never color-only, and keep text short enough for a bar."],
  foundationValidationCommands: ["cargo fmt --check", "cargo clippy --all-targets --all-features -- -D warnings", "cargo test"],
  validationCommands: [
    () => "cargo fmt --check",
    () => "cargo clippy --all-targets --all-features -- -D warnings",
    () => "cargo test",
    () => "cargo build --release",
    identity => `systemd-analyze verify resources/systemd/${identity.slug}.service`,
    () => "makepkg --printsrcinfo",
  ],
  packagingRules: [
    "scripts/package.sh is the sole packaging authority for local proof: release build, binary under ~/.local/bin, Waybar fragment under ~/.config/waybar, systemd unit under ~/.config/systemd/user, and daemon-reload.",
    "PKGBUILD is the Arch distribution authority: install binary, Waybar fragment, style fragment, systemd unit, and license.",
    "Validate the systemd unit with systemd-analyze and the PKGBUILD with makepkg --printsrcinfo before completion.",
    "The launch check adds the fragment to the user's Waybar config, restarts Waybar, and confirms the module renders and its click action works.",
  ],
  wiringRules: [
    "src/main.rs is the composition root and constructs every feature with the concrete platform owners named in the contracts; test doubles exist only under tests/.",
    "The packaging focused test constructs the production composition root and asserts that every injected platform dependency is the concrete production type.",
    "Before completion, add the module to Waybar, restart it, confirm the JSON output and click action, and remove any test data.",
    "Kit helpers that no contract names are optional; do not call a credential or HTTP helper only to satisfy the wiring gate. Every owner named in TRD.md must be reachable from the production entry point.",
    ...SHARED_WIRING_RULES,
  ],
  installationDecision: identity => `For local proof, run scripts/package.sh --install: build, install the binary under ~/.local/bin, copy resources/waybar/config.jsonc and style.css into ~/.config/waybar, install the systemd unit, and run systemctl --user daemon-reload. For distribution, run makepkg -si.`,
  signingDecision: () => "Local proof is unsigned. Distribution signing is a separate release decision using the packager's GPG key; the local packet does not require a signature.",
  outputArtifact: "Waybar module binary, fragments, systemd unit, and Arch package",
  artifactPath: identity => `dist/${identity.slug}`,
  completionEvidence: ["Cargo format, clippy, test, and release build pass.", "jq validates the JSON output and systemd-analyze validates the unit.", "Waybar renders the module with the real fragment.", "The click action and restart behavior pass."],
  options: [
    { id: "refreshSeconds", label: "Waybar poll interval", type: "select", values: ["5", "15", "60"], default: "15", description: "Sets the Waybar fragment poll interval in seconds; the service refresh interval is the feature's stated interval." },
    { id: "tooltip", label: "Show tooltip", type: "toggle", default: true, description: "Sets the Waybar tooltip flag in the generated fragment." },
    
  ],
  capabilities: {
    windows: false,
    tray: false,
    background: true,
    notifications: true,
    documents: false,
    fileAccess: "none",
    microphone: false,
    camera: false,
    location: false,
    launchAtLogin: true,
    network: true,
    globalShortcuts: "compositor-bind",
    clipboardWatch: false,
    accessibilityControl: false,
    surfaces: ["main"],
  },
}

const tauriDesktop: PresetContract = {
  id: "tauri2-rust-typescript-desktop",
  label: "Tauri 2 Rust + TypeScript Desktop",
  platform: "macOS, Windows, and Linux (Wayland verified)",
  implementationMarker: "tauri::Builder",
  allowedTechnologies: ["Tauri 2", "Rust", "TypeScript", "Vite", "DOM-driven frontend", "platform-safe Tauri commands and capabilities", "reqwest", "tokio-tungstenite when streaming is required", "Vitest", "Cargo test"],
  forbiddenTechnologies: ["Electron", "Flutter", "SwiftUI application architecture"],
  testFramework: "Vitest for frontend behavior and Cargo test for Rust boundaries",
  sourceLayout: () => [
    "package.json",
    "src/main.ts",
    "src/style.css",
    "tests/contract.test.ts",
    "src-tauri/Cargo.toml",
    "src-tauri/src/main.rs",
    "src-tauri/src/lib.rs",
    "src-tauri/src/platform/mod.rs",
    "src-tauri/tests/contract_tests.rs",
    "src-tauri/tauri.conf.json",
    "src-tauri/capabilities/default.json",
    "app-icon.svg",
  ],
  packagingFiles: () => [],
  ownerFiles: tauriOwnerFiles,
  registrationFile: kind => kind === "feature" ? "src/main.ts" : "src-tauri/src/lib.rs",
  registrationFiles: (kind, identity) => kind === "feature"
    ? ["src/main.ts", "src-tauri/capabilities/default.json"]
    : kind === "packaging"
      ? ["src-tauri/src/lib.rs", "src-tauri/Cargo.toml", "src-tauri/capabilities/default.json", "src-tauri/tauri.conf.json", "src-tauri/tests/kit_tests.rs"]
      : ["src-tauri/src/lib.rs", "src-tauri/Cargo.toml", "src-tauri/capabilities/default.json", "src-tauri/src/platform/mod.rs", "src-tauri/tests/kit_tests.rs"],
  runtimeMode: () => "cross-platform",
  runtimeArchitecture: ["The TypeScript DOM frontend owns presentation and sends typed Tauri invoke requests; Rust commands own filesystem, network, credential, persistence, and platform operations behind least-privilege capabilities.", "Managed Rust state owns cancellable operations and returns allowlisted serializable results; frontend state never receives secrets, raw provider bodies, or unrestricted paths."],
  integrationBoundary: "Use reqwest::Client inside a dedicated Rust integration owner for HTTPS; expose typed DTOs through Tauri commands and keep credentials and raw responses in Rust memory only.",
  recoveryRules: ["Return one allowlisted error enum through each Tauri command and preserve the last valid frontend state.", "Use cancellation tokens and scoped Rust resources; roll back transactions and remove temporary files before reporting a terminal result."],
  persistence: {
    enabledDecision: "Persistence: enabled and local-first; settings use atomic JSON and record collections use SQLite through a Rust repository boundary.",
    disabledDecision: "Persistence: disabled; keep transient state in memory and create no app-data files.",
    settingsPlacement: "Atomic JSON in the Tauri app-data directory through one Rust command boundary.",
    recordsPlacement: "SQLite in the Tauri app-data directory through rusqlite (bundled) in Rust, never tauri-plugin-sql; migrations and transactions are owned by Rust, PRAGMA user_version stores the schema version.",
    temporaryPlacement: "Use the Tauri app-cache directory with one random per-operation file owned by Rust; retain only for explicit recovery and delete on success, discard, cancellation, or exhausted recovery.",
    appFilesPlacement: () => "Files in the files/ subdirectory of the Tauri app-data directory, created only by Rust under generated unique file names; stored references hold the file name relative to that folder.",
    documentPlacement: "Local filesystem at the path the user chooses through tauri-plugin-dialog; Rust reads or writes that exact path and nothing else.",
  },
  credentialPlacement: "Use one Rust SecretStore trait: the macOS login keychain, Linux Secret Service (GNOME Keyring or KWallet), or Windows Credential Manager through the keyring crate; tests use an in-memory store and never the real store; never expose stored values to the frontend after insertion.",
  fileBoundary: "Read and write only paths the user chooses through the dialog; the app never scans a broad folder or keeps a copy of a user document.",
  fileBoundaryDetails: ["Every path comes from tauri-plugin-dialog or a path the app saved to reopen.", "Rust canonicalizes the path and operates on that exact path.", "The frontend receives no unrestricted filesystem scope."],
  launchCheck: identity => `scripts/package_linux.sh --install, then launch the installed ${identity.projectName} app and complete one acceptance outcome per feature.`,
  permissionPatterns: tauriPermissionPatterns,
  lifecycleRules: ["Use tauri::Builder as the cross-platform desktop entry.", "Close managed tasks, database handles, temporary files, and platform listeners on exit.", "Keep platform differences behind Rust commands and capability files."],
  accessibilityRules: ["Use semantic HTML, native controls, ARIA only where native semantics are insufficient, visible focus, full keyboard operation, reduced motion, and Vitest DOM accessibility assertions."],
  validationCommands: [
    () => "npm run typecheck",
    () => "npm test",
    () => "cargo fmt --manifest-path src-tauri/Cargo.toml -- --check",
    () => "cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings",
    () => "cargo test --manifest-path src-tauri/Cargo.toml",
    () => "npm run tauri -- build --no-bundle",
  ],
  packagingRules: ["Build the frontend with Vite and the native boundary with Cargo.", "Set tauri.conf.json productName to the locked project name.", "Local proof builds only the native .app on macOS; on Linux build the AppImage or deb and validate the desktop entry.", "Use least-privilege capabilities for every command and plugin.", "Verify the installer or bundle before the launch smoke."],
  wiringRules: [
    "src-tauri/src/lib.rs defines a public app_builder function, generic over tauri::Runtime, that takes and returns a tauri::Builder, initializes every tauri-plugin crate listed in src-tauri/Cargo.toml and registers every #[tauri::command] with invoke_handler(tauri::generate_handler![...]), and nothing else. run() calls app_builder(tauri::Builder::default()) and owns the only setup closure.",
    "src/main.ts constructs every feature with adapters that call invoke() or the initialized plugin APIs; test doubles exist only under tests/.",
    "Every window the app opens has a fixed label and is listed in the windows array of src-tauri/capabilities/default.json. Only the main window hides when closed; every other window closes for real and is created fresh.",
    "Before completion, launch the installed app, complete one acceptance outcome per feature, quit, relaunch, and confirm that every declared stored data object is still present.",
    ...SHARED_WIRING_RULES,
  ],
  wiringManifestFiles: ["src-tauri/Cargo.toml"],
  installationDecision: () => "For local Linux proof, build the AppImage or deb, install it, and launch the installed identity; for macOS, install the verified .app and launch it. Keep the previous app as the rollback copy.",
  signingDecision: () => "Use Tauri platform signing: macOS codesign/notarization, Windows code signing, and verified Linux package checksums. For local macOS proof without a signing identity, re-sign with codesign --force --deep --sign -.",
  outputArtifact: "Tauri bundle (AppImage, deb, or native .app)",
  artifactPath: () => "src-tauri/target/release/bundle/",
  completionEvidence: ["TypeScript, Vitest, Rust format, Clippy, and Cargo tests pass.", "Tauri builds the bundle from the locked capabilities.", "The built app installs and launches.", "Local data and temporary-resource cleanup survive a restart smoke."],
  foundationValidationCommands: ["npm install", "npm run tauri -- icon app-icon.svg", "npm run typecheck", "npm test"],
  options: [
    { id: "linuxPackaging", label: "Linux package", type: "select", values: ["appimage", "deb", "pkgbuild"], default: "appimage", description: "Recorded in the packet. v4.0 builds the host default bundles; per-choice artifact selection is next." },
    { id: "wayland", label: "Verify native Wayland", type: "toggle", default: true, description: "Recorded in the packet. The launch check already requires native Wayland." },
  ],
  capabilities: {
    windows: true,
    tray: true,
    background: true,
    notifications: true,
    documents: true,
    fileAccess: "dialog",
    microphone: true,
    camera: true,
    location: true,
    launchAtLogin: true,
    network: true,
    globalShortcuts: "app",
    clipboardWatch: false,
    accessibilityControl: false,
    surfaces: ["main", "item-page", "about-page", "not-found-page"],
  },
}

const astroWeb: PresetContract = {
  id: "astro-web",
  label: "Astro Web",
  platform: "Web",
  implementationMarker: "astro.config.mjs",
  allowedTechnologies: ["Astro", "TypeScript", "semantic HTML", "accessible CSS", "minimal client-side JavaScript", "static output by default", "Vitest", "accessibility and performance audits"],
  forbiddenTechnologies: ["Next.js", "Tauri", "Flutter", "native mobile architecture"],
  testFramework: "Vitest plus browser accessibility checks",
  sourceLayout: () => [
    "package.json",
    "astro.config.mjs",
    "tsconfig.json",
    "src/pages/index.astro",
    "src/layouts/BaseLayout.astro",
    "src/styles/global.css",
    "tests/contract.test.ts",
    "tests/accessibility.test.ts",
    "tests/performance.test.ts",
  ],
  packagingFiles: () => [],
  ownerFiles: astroOwnerFiles,
  registrationFile: kind => kind === "feature" ? "src/pages/index.astro" : "astro.config.mjs",
  registrationFiles: (kind, identity) => kind === "data"
    ? ["src/content.config.ts"]
    : kind === "integration"
      ? ["astro.config.mjs", "package.json"]
      : kind === "packaging"
        ? ["astro.config.mjs", "package.json"]
        : ["src/pages/index.astro"],
  runtimeMode: blueprint => blueprint.externalServices.some(service => service.credentialRequirement !== "none") ? "server" : "static",
  runtimeArchitecture: ["Astro components render the content-first shell at build or request time; use client islands only for interaction that cannot be expressed with native HTML and CSS.", "Static output is mandatory unless a server-held credential requires an explicit adapter; browser code never receives deployment secrets."],
  integrationBoundary: "Use standards-based fetch with typed local request and response validators; credentialed calls run only in Astro server endpoints using import.meta.env, while public browser calls use allowlisted HTTPS URLs and AbortController cancellation.",
  staticRecoveryRules: ["A build-time content error fails the build and names the file and field; no page ships with a missing required field.", "Core content never depends on client-side data fetching."],
  recoveryRules: ["Preserve entered form content across validation, transport, timeout, and server failures and require an explicit resubmission.", "Remove event listeners, abort fetches, stop media tracks, and revoke object URLs when an island unmounts."],
  persistence: {
    enabledDecision: "Persistence: enabled through Astro content collections at build time by default; browser IndexedDB is used only when product semantics explicitly require client-side retention without build-time content.",
    disabledDecision: "Persistence: disabled. No application data is retained between visits; static assets use ordinary HTTP caching only.",
    settingsPlacement: "Build-time content schema in src/content.config.ts; browser-only settings use IndexedDB only when semantics explicitly require client-side retention.",
    recordsPlacement: "Public catalog records live in src/content/{collection}/ and compile through getCollection(); authenticated remote records require an explicit server-rendered contract.",
    temporaryPlacement: "Keep temporary values in memory as Blob or structured state and revoke object URLs on completion; do not mirror build-time catalog data into IndexedDB.",
    appFilesPlacement: () => "Blobs in a dedicated IndexedDB object store keyed by generated unique IDs; stored references hold that ID, never a file path or build-time content.",
    documentPlacement: "A file the user picks in a file input or saves through a download the user starts; the site keeps no copy.",
    documentAtomicWrite: "Build the complete file as one Blob before starting the download, so a failed build never starts a partial file.",
  },
  credentialPlacement: "Never ship service credentials to the browser; a required secret switches output to server rendering and reads the deployment secret at request time.",
  fileBoundary: "Use a user-initiated file input or File System Access API path; the site keeps no copy and never assumes persistent access.",
  fileBoundaryDetails: ["A selected file is handled in memory or downloaded explicitly.", "Browser storage is used only when the blueprint declares it.", "No server-side filesystem path is exposed to the browser."],
  launchCheck: () => "npm run build, then npm run preview and open every declared route.",
  permissionPatterns: webPermissionPatterns,
  lifecycleRules: ["Generate static output by default.", "Enable server rendering only when a server-held credential or remote account contract makes it necessary.", "Clean up event listeners, observers, media tracks, and object URLs when interactive components unmount."],
  accessibilityRules: ["Meet WCAG 2.2 AA with semantic landmarks, ordered headings, keyboard access, visible focus, text alternatives, reduced motion, and automated accessibility checks."],
  validationCommands: [
    () => "npm run check",
    () => "npm test",
    () => "npm run build",
    () => "npm run test:a11y",
    () => "npm run audit:performance",
  ],
  packagingRules: ["Generate static output unless the graph records a server-required decision.", "Emit semantic metadata, sitemap, robots rules, and canonical URLs.", "Run accessibility, link, SEO metadata, and performance gates against the production build.", "Deploy the dist/ output or the documented server adapter artifact."],
  wiringRules: [
    "Pages and components render data from the declared content collections, server endpoints, or browser stores named in the contracts; no page or component keeps sample records inline, and test fixtures exist only under tests/.",
    "The packaging focused test builds the site and asserts that every declared route exists in the output and renders its declared data source.",
    "Before completion, serve the production build, open every declared route, and complete one acceptance outcome per feature.",
    ...SHARED_WIRING_RULES,
  ],
  installationDecision: () => "Deploy dist/ or the locked server-adapter artifact to the target HTTPS host, verify the deployed commit and asset hashes, then run link, accessibility, and performance smoke checks against that URL.",
  signingDecision: () => "No application code signature applies; deploy the verified production artifact over HTTPS with immutable asset hashes.",
  outputArtifact: "dist/ static site or explicit server adapter output",
  artifactPath: () => "dist/",
  completionEvidence: ["Type, content, unit, and production build checks pass.", "Accessibility has no critical findings.", "SEO metadata and internal links validate.", "The production performance budget passes."],
  options: [
    { id: "siteKind", label: "Site kind", type: "select", values: ["landing", "portfolio", "docs", "blog", "catalog"], default: "landing", description: "Recorded in the packet. v4.0 renders the landing route set; option-driven Astro route generation is next." },
    { id: "outputMode", label: "Output mode", type: "select", values: ["static", "server"], default: "static", description: "Recorded in the packet. v4.0 keeps static output unless a declared credential switches it; option-driven server output is next." },
    { id: "adapter", label: "Server adapter", type: "select", values: ["node", "cloudflare", "netlify", "vercel"], default: "node", description: "Recorded in the packet; option-driven adapter generation is next." },
    { id: "features", label: "Site features", type: "multi", values: ["content-collections", "search", "rss", "sitemap", "i18n", "dark-mode", "contact-form", "pagination", "tag-pages"], default: ["sitemap"], description: "Recorded in the packet; option-driven feature contracts are next." },
    { id: "palette", label: "Palette", type: "select", values: ["void-black", "light"], default: "void-black", description: "Recorded in the packet; the existing palette rule still applies." },
  ],
  capabilities: {
    windows: false,
    tray: false,
    background: false,
    notifications: true,
    documents: false,
    fileAccess: "web",
    microphone: true,
    camera: true,
    location: true,
    launchAtLogin: false,
    network: true,
    globalShortcuts: "none",
    clipboardWatch: false,
    accessibilityControl: false,
    surfaces: ["main", "item-page", "about-page", "not-found-page", "collection-index", "tag-page", "search-page", "page"],
  },
}

const androidCompose: PresetContract = {
  id: "android-kotlin-compose",
  label: "Android Kotlin Compose",
  platform: "Android",
  implementationMarker: "Jetpack Compose",
  allowedTechnologies: ["Kotlin", "Jetpack Compose", "Material 3", "Navigation 3", "Gradle Kotlin DSL", "coroutines", "StateFlow", "ViewModel", "Room", "DataStore", "WorkManager", "JUnit", "Compose UI tests", "instrumentation tests"],
  forbiddenTechnologies: ["iOS", "Flutter", "React Native", "Tauri", "XML-first UI architecture", "Navigation 2 when Navigation 3 is selected"],
  testFramework: "JUnit unit tests, Compose UI tests, and Android instrumentation tests where platform behavior requires them",
  sourceLayout: identity => [
    "settings.gradle.kts",
    "build.gradle.kts",
    "gradle/libs.versions.toml",
    "app/build.gradle.kts",
    "app/src/main/AndroidManifest.xml",
    `app/src/main/java/${identity.packagePath}/MainActivity.kt`,
    `app/src/main/java/${identity.packagePath}/App.kt`,
    `app/src/test/java/${identity.packagePath}/ContractTest.kt`,
    `app/src/androidTest/java/${identity.packagePath}/LaunchTest.kt`,
  ],
  packagingFiles: () => [],
  ownerFiles: androidOwnerFiles,
  registrationFile: (kind, identity) => kind === "permission" ? "app/src/main/AndroidManifest.xml" : `app/src/main/java/${identity.packagePath}/App.kt`,
  // The kit's AppContainer.kt is where repositories and services are added, so every task that adds one may edit it.
  registrationFiles: (kind, identity) => {
    const root = `app/src/main/java/${identity.packagePath}`
    if (kind === "permission") return ["app/src/main/AndroidManifest.xml"]
    if (kind === "data") return [`${root}/AppContainer.kt`, `${root}/data/SettingsRepository.kt`]
    if (kind === "feature") return [`${root}/App.kt`, `${root}/AppContainer.kt`]
    if (kind === "lifecycle") return [`${root}/${identity.pascalName}Application.kt`, `${root}/AppContainer.kt`]
    if (kind === "packaging") return [`${root}/App.kt`, `${root}/AppContainer.kt`]
    return [`${root}/AppContainer.kt`]
  },
  runtimeMode: () => "android",
  runtimeArchitecture: [
    "MainActivity calls enableEdgeToEdge() before setContent and hosts a Material 3 Compose tree; ViewModels expose immutable StateFlow UI state and call repository or platform-service owners through constructor-injected interfaces.",
    "Navigation 3 uses NavDisplay with rememberNavBackStack and @Serializable NavKey destinations; predictive back is enabled in the manifest and system back pops the NavBackStack.",
    "Collect state with collectAsStateWithLifecycle, run I/O in structured coroutines off the main dispatcher, use SavedStateHandle for process death, and keep Activity instances free of durable state.",
    `SDK levels come from the kit's app/build.gradle.kts: compileSdk ${ANDROID_SDK.compileSdk}, targetSdk ${ANDROID_SDK.targetSdk}, minSdk ${ANDROID_SDK.minSdk}, build-tools ${ANDROID_SDK.buildTools}; change them only there.`,
  ],
  integrationBoundary: "Use HttpsURLConnection or one typed HTTP client inside a coroutine-backed service or repository owner, map JSON into locked Kotlin data classes before returning, close streams in finally blocks, and expose only privacy-safe typed failures to ViewModels.",
  recoveryRules: ["Model loading, success, empty, denied, failed, and cancelled states explicitly in immutable UI state.", "Use structured coroutine cancellation, Room transactions, and cache-file cleanup; retries and provider changes always require an explicit user action; a declared automatic fallback and a declared schedule (runs every N seconds or daily at a time) are not retries."],
  persistence: {
    enabledDecision: "Persistence: enabled with DataStore for settings and Room for record collections behind repository boundaries.",
    settingsDecision: "Persistence: Preferences DataStore behind SettingsRepository.",
    recordsDecision: "Persistence: Room entity and DAO behind a repository.",
    disabledDecision: "Persistence: disabled; ViewModel state is transient and no application records survive process death.",
    settingsPlacement: "Preferences DataStore with typed keys and explicit reset behavior.",
    recordsPlacement: "Room entities, DAO transactions, migrations, and repository APIs for durable records; export the schema and keep PRAGMA user_version-equivalent Room migrations.",
    temporaryPlacement: "Use Context.cacheDir with one per-operation file; retain only for explicit recovery and delete after success, discard, cancellation, or exhausted recovery.",
    appFilesPlacement: () => "Files in File(context.filesDir, \"files\"), created only by the app under generated unique file names; stored references hold the file name relative to that folder.",
    documentPlacement: "The document URI the user chooses through the Storage Access Framework (ActivityResultContracts.CreateDocument to save, OpenDocument to open), accessed only through ContentResolver.",
    documentAtomicWrite: "Write the complete content to one per-operation file in Context.cacheDir first, then copy it to the chosen URI through ContentResolver.openOutputStream(uri, \"wt\") and delete the cache file; a failure before the copy starts leaves the existing document unchanged, and a failed copy is reported honestly because document providers cannot rename in place.",
  },
  credentialPlacement: "Store app-owned credentials with Android Keystore-backed AES-GCM encryption and never expose decrypted values to Compose state.",
  fileBoundary: "Use the Storage Access Framework for user-chosen documents and app-private files for app-owned data; never request broad storage access.",
  fileBoundaryDetails: ["Documents come from ActivityResultContracts.OpenDocument or CreateDocument.", "App files stay in filesDir/files/.", "A persistable URI permission is taken only when the feature reopens a saved document."],
  appOnlyFileBoundary: {
    boundary: "Keep every byte in app-private storage (Room, DataStore, filesDir, cacheDir); no feature opens or saves a user-chosen file and the app requests no storage permission.",
    details: ["App files, when declared, stay in filesDir/files/.", "No document picker is used."],
  },
  permissionPurposes: { "background-execution": "Keep running after the app leaves the foreground only while a declared background feature needs it." },
  deviceGates: { rule: ANDROID_DEVICE_GATE_RULE, commands: ANDROID_DEVICE_COMMANDS },
  launchCheck: identity => `./scripts/gradle.sh assembleDebug on every machine; when an adb device is attached, also adb install -r app/build/outputs/apk/debug/app-debug.apk and launch applicationId ${identity.packageName}; with none attached the completion report is PARTIAL and names the skipped launch check.`,
  permissionPatterns: androidPermissionPatterns,
  lifecycleRules: ["Collect StateFlow with lifecycle-aware Compose APIs.", "Keep durable work in repositories or WorkManager rather than Activity instances.", "Release callbacks and temporary files when lifecycle ownership ends."],
  accessibilityRules: ["Expose Compose semantics for TalkBack, content descriptions for non-text controls, logical traversal, 48dp targets, scalable text, predictive back, and Compose accessibility tests."],
  validationCommands: [
    () => "./scripts/gradle.sh testDebugUnitTest",
    () => "./scripts/gradle.sh lintDebug",
    () => "./scripts/gradle.sh assembleDebug",
  ],
  packagingRules: ["Use Gradle Kotlin DSL and a version catalog.", "Build an Android-only APK with the locked applicationId.", "Declare only required permissions and test denied paths.", "When an adb device is attached, install the debug APK on it for launch smoke; otherwise report PARTIAL."],
  wiringRules: [
    "AppContainer.kt (built in the Application class) is the composition root and provides the concrete repositories, services, and platform adapters named in the contracts; App.kt only reads them from it. Fakes and in-memory stores exist only under app/src/test and app/src/androidTest.",
    "The packaging focused test constructs the production composition root and asserts that every provided dependency is the concrete production type, not a fake.",
    "Before completion, when an adb device is attached: install the APK, complete one acceptance outcome per feature, force-stop the app, relaunch, and confirm that saved records and settings are still present. With no device attached, the completion report is PARTIAL and names this check as skipped; the JVM tests that assert the production container's concrete types still run.",
    ...SHARED_WIRING_RULES,
  ],
  installationDecision: identity => `When \`adb devices\` lists an attached target, re-identify it, run adb install -r app/build/outputs/apk/debug/app-debug.apk, and launch applicationId ${identity.packageName} before collecting device smoke evidence; with no target attached, skip the install and report PARTIAL.`,
  signingDecision: identity => `Sign debug builds with the Gradle debug key and release builds with a protected release keystore for applicationId ${identity.packageName}; never commit keystore material.`,
  outputArtifact: "app-debug.apk",
  artifactPath: () => "app/build/outputs/apk/debug/app-debug.apk",
  completionEvidence: ["Unit tests and lint pass; assembleDebug produces the expected APK.", "The manifest contains only derived permissions.", "With an adb device attached: connectedDebugAndroidTest passes and adb installs and launches the locked applicationId; otherwise the report is PARTIAL and names each skipped device gate."],
  options: [
    { id: "di", label: "Dependency injection", type: "select", values: ["manual", "hilt"], default: "manual", description: "Recorded in the packet. v4.0 ships the manual AppContainer; Hilt generation is next." },
    { id: "navigation", label: "Navigation", type: "select", values: ["navigation3", "navigation-compose"], default: "navigation3", description: "Recorded in the packet. v4.0 documents Navigation 3; option-driven navigation selection is next." },
    { id: "modules", label: "Module layout", type: "select", values: ["single", "feature"], default: "single", description: "Recorded in the packet. v4.0 ships a single app module." },
    { id: "screenshotTests", label: "Screenshot tests", type: "toggle", default: false, description: "Recorded in the packet. Screenshot-test generation is next." },
  ],
  capabilities: {
    windows: true,
    tray: false,
    background: true,
    notifications: true,
    documents: true,
    fileAccess: "saf",
    microphone: true,
    camera: true,
    location: true,
    launchAtLogin: false,
    network: true,
    globalShortcuts: "none",
    clipboardWatch: false,
    accessibilityControl: false,
    surfaces: ["main", "item-page", "about-page", "not-found-page"],
  },
}

export const PRESETS: Readonly<Record<PresetId, PresetContract>> = Object.freeze({
  "linux-wayland-gtk4-desktop": linuxGtk,
  "linux-hyprland-waybar-module": linuxWaybar,
  "tauri2-rust-typescript-desktop": tauriDesktop,
  "astro-web": astroWeb,
  "android-kotlin-compose": androidCompose,
})

export function isPresetId(value: string): value is PresetId {
  return (PRESET_IDS as readonly string[]).includes(value)
}
