import type { NormalizedBlueprint } from "./compiler"
import type { ProjectIdentity } from "./presets"
import { shellWord, templateText, xmlText } from "./kitText"

export interface TauriKitFile {
  readonly path: string
  readonly content: string
}

// One Tauri plugin: its crate, its npm package, how lib.rs initializes it, and the only capability
// permissions it gets. Cargo.toml, package.json, lib.rs, and capabilities/default.json are all
// rendered from this list, so a permission can never name a plugin the app does not initialize.
interface TauriPlugin {
  readonly crate: string
  readonly crateVersion: string
  readonly npm: string
  readonly npmVersion: string
  readonly init: string
  readonly permissions: readonly string[]
}

// Versions are the ones the kit is built and tested with (npm run kit:check), all compatible with
// tauri 2.11.5; permission sets checked in the plugins-workspace permission references.
const PLUGINS = {
  clipboard: {
    crate: "tauri-plugin-clipboard-manager", crateVersion: "2.3.3", npm: "@tauri-apps/plugin-clipboard-manager", npmVersion: "2.3.3",
    init: "tauri_plugin_clipboard_manager::init()",
    // The plugin has no default set; copying needs only this. Add allow-read-text only for a feature that reads.
    permissions: ["clipboard-manager:allow-write-text"],
  },
  shortcut: {
    crate: "tauri-plugin-global-shortcut", crateVersion: "2.3.2", npm: "@tauri-apps/plugin-global-shortcut", npmVersion: "2.3.2",
    init: "tauri_plugin_global_shortcut::Builder::new().build()",
    // src/shortcut.ts calls only register and unregister.
    permissions: ["global-shortcut:allow-register", "global-shortcut:allow-unregister"],
  },
  autostart: {
    crate: "tauri-plugin-autostart", crateVersion: "2.5.1", npm: "@tauri-apps/plugin-autostart", npmVersion: "2.5.1",
    init: "tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None)",
    permissions: ["autostart:default"],
  },
  notification: {
    crate: "tauri-plugin-notification", crateVersion: "2.4.0", npm: "@tauri-apps/plugin-notification", npmVersion: "2.4.0",
    init: "tauri_plugin_notification::init()",
    permissions: ["notification:default"],
  },
  dialog: {
    crate: "tauri-plugin-dialog", crateVersion: "2.7.2", npm: "@tauri-apps/plugin-dialog", npmVersion: "2.7.2",
    init: "tauri_plugin_dialog::init()",
    permissions: ["dialog:default"],
  },
} as const satisfies Record<string, TauriPlugin>

export interface TauriKitUses {
  readonly settings: boolean
  readonly records: boolean
  readonly secrets: boolean
  readonly services: boolean
  readonly tray: boolean
  // True when the preset option linuxPackaging is set: the kit ships no macOS packaging or signing.
  readonly linuxOnly: boolean
  // The Wayland option: the installed desktop entry launches with GDK_BACKEND=wayland.
  readonly wayland: boolean
  readonly shortcut: boolean
  // Some records object stores a date-time field: Rust parses its RFC3339 string with the time crate.
  readonly timestamps: boolean
  readonly plugins: readonly TauriPlugin[]
}

export function tauriKitUses(blueprint: NormalizedBlueprint, options: Readonly<Record<string, unknown>> = {}): TauriKitUses {
  const storage = new Set(blueprint.persistenceNeeds.map(need => need.storage))
  const needs = new Set<string>(blueprint.platformNeeds)
  // The normalized needs include filesystem whenever a feature shows a file panel or reopens a document.
  const opensFiles = needs.has("filesystem")
  return {
    settings: storage.has("settings"),
    records: storage.has("records"),
    secrets: blueprint.externalServices.some(service => service.credentialRequirement !== "none")
      || blueprint.domainData.some(item => item.storage === "secret"),
    services: blueprint.externalServices.length > 0,
    tray: needs.has("background-execution"),
    linuxOnly: typeof options.linuxPackaging === "string" && options.linuxPackaging.length > 0,
    wayland: options.wayland === true,
    shortcut: needs.has("global-hotkey"),
    timestamps: blueprint.domainData.some(item => item.storage === "records" && item.fields.some(field => field.valueType === "date-time")),
    plugins: [
      ...(needs.has("clipboard") ? [PLUGINS.clipboard] : []),
      ...(needs.has("global-hotkey") ? [PLUGINS.shortcut] : []),
      ...(needs.has("launch-at-login") ? [PLUGINS.autostart] : []),
      ...(needs.has("notifications") ? [PLUGINS.notification] : []),
      ...(opensFiles ? [PLUGINS.dialog] : []),
    ],
  }
}

export function tauriKitFiles(identity: ProjectIdentity, uses: TauriKitUses): TauriKitFile[] {
  const lib = `${identity.slug.replace(/-/g, "_")}_lib`
  return [
    { path: "package.json", content: packageJson(identity, uses) },
    { path: "tsconfig.json", content: TSCONFIG },
    { path: "vite.config.ts", content: VITE_CONFIG },
    { path: "index.html", content: indexHtml(identity) },
    { path: "src/api.ts", content: API_TS },
    { path: "src/errors.ts", content: ERRORS_TS },
    { path: "src/ui.ts", content: withoutSettingsUi(UI_TS, uses, "let nextControlId = 0") },
    ...(uses.shortcut ? [{ path: "src/shortcut.ts", content: SHORTCUT_TS }, { path: "tests/shortcut.test.ts", content: SHORTCUT_TEST_TS }] : []),
    { path: "src/store.ts", content: STORE_TS },
    { path: "tests/store.test.ts", content: STORE_TEST_TS },
    { path: "src/main.ts", content: mainTs(identity) },
    { path: "src/style.css", content: uses.settings ? STYLE_CSS : STYLE_CSS.replace(/\.settings \{[\s\S]*?\n(?=button:focus-visible)/, "") },
    { path: "tests/kit.test.ts", content: KIT_TEST_TS },
    { path: "tests/ui.test.ts", content: uses.settings ? UI_TEST_TS : UI_TEST_TS.replace(", settingsGroup, settingsRow, switchControl", "").replace(/  it\("names every settings control[\s\S]*?\n  \}\)\n\n/, "") },
    { path: "app-icon.svg", content: APP_ICON_SVG },
    ...(uses.linuxOnly ? [] : [{ path: "scripts/package_app.sh", content: packageScript(identity) }]),
    { path: "scripts/package_linux.sh", content: packageLinuxScript(identity, uses.wayland) },
    { path: "src-tauri/Cargo.toml", content: cargoToml(identity, lib, uses) },
    { path: "src-tauri/build.rs", content: BUILD_RS },
    { path: "src-tauri/rustfmt.toml", content: RUSTFMT_TOML },
    { path: "src-tauri/src/main.rs", content: mainRs(lib) },
    { path: "src-tauri/src/lib.rs", content: `${libRs(uses)}\npub mod platform;\n` },
    { path: "src-tauri/src/platform/mod.rs", content: "// Platform owners are added by TASKS.md. Each owner declares its module here.\n" },
    { path: "src-tauri/src/error.rs", content: ERROR_RS },
    ...(uses.settings ? [{ path: "src-tauri/src/settings.rs", content: SETTINGS_RS }] : []),
    ...(uses.records ? [{ path: "src-tauri/src/database.rs", content: DATABASE_RS }] : []),
    ...(uses.secrets ? [{ path: "src-tauri/src/vault.rs", content: VAULT_RS }] : []),
    { path: "src-tauri/tests/kit_tests.rs", content: kitTestsRs(lib, uses) },
    { path: "src-tauri/tauri.conf.json", content: tauriConf(identity, uses.linuxOnly) },
    { path: "src-tauri/capabilities/default.json", content: capabilities(uses) },
  ]
}

export function tauriKitReadme(identity: ProjectIdentity, paths: readonly string[], uses: TauriKitUses): string {
  return [
    `# ${identity.projectName} starter kit`,
    "",
    "Tested starting code for the Tauri plumbing in TRD.md. Before TASK-01, copy every file below from kit/ to the same path in the project root. The task that owns a file starts from this content and extends it; keep every behavior listed here.",
    "",
    ...paths.map(path => `- ${path}`),
    "",
    "## Behavior to keep",
    "",
    "- src/store.ts: createStore(initial) is the one shared view state (get, set(patch), subscribe) and createSlots() the named mount points (host(name), mount(name, element); mountRow(name, render) and row(name, record) for a control that repeats in every list row; handle(name, action) and run(name) for an action a shared control runs). The task that builds the main screen creates the store and places every host; a later task never edits that task's file: it reads the store, calls store.set, subscribes to re-render its own view, and mounts its control from src/main.ts with slots.mount.",
    "- Time: no kit file reads the clock. A feature that needs the time takes now: () => Date in the dependencies object of its factory; src/main.ts passes () => new Date() to every such factory, so every task sees the same today, and a test passes a fake clock.",
    "- src/errors.ts: errors.show(message, onRetry?) shows a message; passing onRetry adds a Retry button that repeats the failed command (the banner has no other retry control). src/ui.ts confirmDialog(message, confirmLabel) is the in-page confirmation (Cancel and the confirm button; Escape cancels), styled in src/style.css.",
    "- src-tauri/src/lib.rs: app_builder registers every plugin and command and nothing else; run() owns the only setup closure, because Builder::setup replaces any earlier one. Add each new command to generate_handler! and each new store to manage_state.",
    "- manage_state(app, folder) opens every store in one folder: run() passes app_data_dir(), tests pass a temporary folder, so tests never touch real app data.",
    "- src-tauri/tests/kit_tests.rs builds app_builder(mock_builder()) with the app's own context() and calls commands through get_ipc_response from the devUrl origin (http://localhost:1420); a request from any other origin is refused. Keep this test passing as commands are added.",
    "- Every command returns Result<T, AppError>; AppError carries a fallback message written for the user, which errors.report() shows when no feature string applies. Every user-visible string the PRD states (a failure message, a label, an empty state) comes from the PRD and is shown with errors.show(), never errors.report(); the PRD string wins over any AppError message this kit or a command produces. Never show a raw runtime error.",
    "- src-tauri/capabilities/default.json lists only core:default and the permissions of the plugins lib.rs initializes. Add a permission only with the plugin feature that needs it.",
    "- Its windows array starts as [\"main\"]. When a feature opens another window, give it a fixed label and add that label there, or Tauri refuses every command the window calls. Create that window fresh each time it opens (close it, never just hide it), so it always loads current data.",
    ...(uses.settings ? ["- settings.rs replaces settings.json whole: a temporary file in the same folder, synced, then renamed."] : []),
    ...(uses.records ? ["- database.rs applies MIGRATIONS in order and records the schema version in PRAGMA user_version; append new migrations, never edit a shipped one. database::open creates the data folder (create_dir_all) before opening records.sqlite3, so a launch step that opens the store before manage_state still works on a fresh install."] : []),
    ...(uses.timestamps ? ["- src-tauri/Cargo.toml already has the time crate (parsing, formatting) for the RFC3339 date-time fields: validate with time::OffsetDateTime::parse(value, &time::format_description::well_known::Rfc3339) and require a UTC offset; write no parser of your own."] : []),
    ...(uses.services ? ["- src-tauri/Cargo.toml already has reqwest (json) for the declared services; integration owners use one reqwest::Client and add no HTTP crate of their own."] : []),
    ...(uses.secrets ? ["- vault.rs is the only place secrets are stored: generic passwords in the login keychain under the bundle ID's credentials service. Tests use MemoryStore, never the keychain."] : []),
    ...(uses.tray ? ["- The tray keeps the app running: closing the main window hides it, Show brings it back, and Quit (or quitting from outside) exits. RunEvent::ExitRequested with no exit code is prevented; an explicit exit code is not. Only the main window hides: every other window closes for real, so it is created fresh and loads current data each time it opens instead of showing a stale list."] : []),
    ...(uses.shortcut ? ["- src/shortcut.ts is the only file that names the system-wide accelerator (DEFAULT_ACCELERATOR, CommandOrControl+Shift+Space). registerShortcut(onPress, onFailure) registers it; a refused registration calls onFailure and returns false, and the app keeps working through its in-app controls. The capability file grants only global-shortcut register and unregister."] : []),
    ...(uses.records ? ["- src-tauri/tests/kit_tests.rs compares schema_version with database::MIGRATIONS.len(), so adding a migration needs no edit to that test."] : []),
    ...(uses.linuxOnly ? [] : ["- scripts/package_app.sh builds only the macOS .app (no DMG), signs it ad hoc, and verifies it; with --install it waits for the running app to quit, moves the installed copy to src-tauri/target/rollback/ (never inside /Applications), installs, restores the previous copy if verification fails, registers, and launches by bundle ID. The first run generates src-tauri/icons from app-icon.svg."]),
    "- scripts/package_linux.sh builds the AppImage, writes dist/, and with --install installs it under ~/.local/bin with a desktop entry and icon. On Arch/Omarchy use it for local proof; the AppImage runs on Wayland with GDK_BACKEND=wayland.",
    "- Versions are exact (= in Cargo.toml, no ^ in package.json) because they are tested together; keep src-tauri/Cargo.lock and package-lock.json from the first build, and change a version only on purpose, never by a broad update.",
    `- Screens are built from src/ui.ts and the classes in src/style.css, never from unstyled elements: button() is sized to its label (primary for the one main action); toolbar() holds a search field and actions; setEnabled() disables a command until it has something to act on (Edit, Delete, Copy with nothing selected); emptyState(title, hint) fills an empty list with one centered message saying how to fill it; list rows use .row with aria-selected for the selection and clampedText() so long text is cut to a few lines with the full text on hover, never a scroll area inside a scrolling list; ${uses.settings ? "settings are settingsGroup() sections of settingsRow() lines, label on the left and control on the right, a switchControl() on the same line as its label, and a footnote under the group; " : ""}body text uses the system font, and monospace only for code.`,
    "- src/style.css uses the system font and light and dark system colors; the page never scrolls, and .app-content scrolls inside the window.",
    "",
  ].join("\n")
}

function packageJson(identity: ProjectIdentity, uses: TauriKitUses): string {
  const dependencies: Record<string, string> = { "@tauri-apps/api": "2.11.1" }
  for (const plugin of uses.plugins) dependencies[plugin.npm] = plugin.npmVersion
  return `${JSON.stringify({
    name: identity.slug,
    private: true,
    version: "0.1.0",
    type: "module",
    scripts: {
      dev: "vite",
      build: "tsc --noEmit && vite build",
      typecheck: "tsc --noEmit",
      // kit/ stays in the project root while tasks copy from it; its own tests must not run there.
      test: "vitest run --exclude 'kit/**'",
      tauri: "tauri",
    },
    dependencies,
    devDependencies: {
      "@tauri-apps/cli": "2.11.4",
      "happy-dom": "20.14.5",
      typescript: "5.9.3",
      vite: "7.3.6",
      vitest: "4.1.11",
    },
  }, null, 2)}\n`
}

const TSCONFIG = `${JSON.stringify({
  compilerOptions: {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "bundler",
    lib: ["ES2022", "DOM", "DOM.Iterable"],
    strict: true,
    noUncheckedIndexedAccess: true,
    noEmit: true,
    skipLibCheck: true,
    types: ["vite/client"],
  },
  include: ["src", "tests", "vite.config.ts"],
}, null, 2)}\n`

const VITE_CONFIG = `import { defineConfig } from "vite"

// Tauri serves the dev frontend from this fixed port (tauri.conf.json devUrl).
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: "safari16", outDir: "dist-web", emptyOutDir: true },
})
`

function indexHtml(identity: ProjectIdentity): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <link rel="icon" href="data:," />
    <link rel="stylesheet" href="/src/style.css" />
    <title>${xmlText(identity.projectName)}</title>
  </head>
  <body>
    <main id="app"></main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`
}

const API_TS = `import { invoke } from "@tauri-apps/api/core"

/** The error every Rust command returns (AppError): a kind and a message written for the user. */
export interface CommandError {
  kind: string
  message: string
}

const isCommandError = (value: unknown): value is CommandError =>
  typeof value === "object" && value !== null && typeof (value as CommandError).message === "string"

/** The message to show for a failed command; never a raw error string from the runtime. */
export const messageFor = (error: unknown): string =>
  isCommandError(error) ? error.message : "Something went wrong. Try again."

/** Calls a Rust command. Every frontend call goes through here so failures reach the error banner. */
export const call = <T>(command: string, args?: Record<string, unknown>): Promise<T> => invoke<T>(command, args)
`

const ERRORS_TS = `import { messageFor } from "./api"

/** One place for user-visible failures: features report here and the banner shows the message. */
export const createErrorBanner = (host: HTMLElement) => {
  const banner = document.createElement("div")
  banner.className = "error-banner"
  banner.setAttribute("role", "alert")
  banner.hidden = true
  const text = document.createElement("p")
  const retry = document.createElement("button")
  retry.type = "button"
  retry.textContent = "Retry"
  retry.hidden = true
  let repeat: (() => void) | undefined
  retry.addEventListener("click", () => {
    banner.hidden = true
    repeat?.()
  })
  const dismiss = document.createElement("button")
  dismiss.type = "button"
  dismiss.textContent = "Dismiss"
  dismiss.addEventListener("click", () => { banner.hidden = true })
  banner.append(text, retry, dismiss)
  const header = host.querySelector(".app-header")
  if (header) header.after(banner)
  else host.prepend(banner)

  // onRetry gives the message a Retry button that repeats the failed command; omit it for a message with no retry.
  const show = (message: string, onRetry?: () => void) => {
    text.textContent = message
    repeat = onRetry
    retry.hidden = !onRetry
    banner.hidden = false
  }

  return {
    /** A message the frontend wrote for the user, with an optional retry action. */
    show,
    /** A failed command: shows the message Rust wrote, never a raw runtime error. */
    report: (error: unknown, onRetry?: () => void) => show(messageFor(error), onRetry),
    dismiss: () => { banner.hidden = true },
  }
}
`

function mainTs(identity: ProjectIdentity): string {
  return `import { createErrorBanner } from "./errors"

// Composition root: feature tasks add their views to .app-content and call Rust commands through
// call() from ./api; each feature task states how it reports a failure (errors.show).
const root = document.querySelector<HTMLElement>("#app")
if (!root) throw new Error("#app is missing from index.html")

root.innerHTML = \`
  <header class="app-header">
    <h1>${templateText(xmlText(identity.projectName))}</h1>
  </header>
  <section class="app-content" aria-label="${templateText(xmlText(identity.projectName))}"></section>
\`

export const errors = createErrorBanner(root)
`
}

// The settings helpers (and their test and styles) ship only when a data object uses settings storage.
function withoutSettingsUi(source: string, uses: TauriKitUses, marker: string): string {
  return uses.settings ? source : `${source.slice(0, source.indexOf(marker)).trimEnd()}\n`
}

const UI_TS = `// Small building blocks for screens that look native. Features compose these instead of styling raw
// elements, so buttons, empty lists, settings rows, and long text look and behave the same everywhere.

type Handler = () => void

/** A button sized to its label. Use primary for the one main action on a screen. */
export const button = (label: string, onClick: Handler, options: { primary?: boolean; disabled?: boolean } = {}): HTMLButtonElement => {
  const element = document.createElement("button")
  element.type = "button"
  element.className = options.primary ? "button primary" : "button"
  element.textContent = label
  element.disabled = options.disabled ?? false
  element.addEventListener("click", onClick)
  return element
}

/** A command with nothing to act on stays disabled until it has one. */
export const setEnabled = (element: HTMLButtonElement, enabled: boolean): void => {
  element.disabled = !enabled
}

/** A row of controls: a search field or other flexible control grows, buttons keep their size. */
export const toolbar = (...children: HTMLElement[]): HTMLElement => {
  const element = document.createElement("div")
  element.className = "toolbar"
  element.append(...children)
  return element
}

/** What an empty list shows: one centered message and a hint saying how to fill it. */
export const emptyState = (title: string, hint = ""): HTMLElement => {
  const element = document.createElement("div")
  element.className = "empty-state"
  const heading = document.createElement("strong")
  heading.textContent = title
  element.append(heading)
  if (hint) {
    const detail = document.createElement("span")
    detail.textContent = hint
    element.append(detail)
  }
  return element
}

/** Long text in a list, cut to a few lines with an ellipsis; the full text shows on hover. */
export const clampedText = (text: string, lines: 2 | 3 = 2): HTMLElement => {
  const element = document.createElement("p")
  element.className = \`clamp-\${lines}\`
  element.textContent = text
  element.title = text
  return element
}

/**
 * A confirmation inside the page (no browser or plugin dialog): a modal with the message, a Cancel
 * button, and a confirm button labelled confirmLabel. Resolves true on confirm, false on Cancel or Escape.
 */
export const confirmDialog = (message: string, confirmLabel: string): Promise<boolean> =>
  new Promise(resolve => {
    const overlay = document.createElement("div")
    overlay.className = "dialog-overlay"
    const dialog = document.createElement("div")
    dialog.className = "dialog"
    dialog.setAttribute("role", "alertdialog")
    dialog.setAttribute("aria-modal", "true")
    dialog.setAttribute("aria-label", message)
    const text = document.createElement("p")
    text.textContent = message
    const finish = (answer: boolean) => {
      document.removeEventListener("keydown", onKey)
      overlay.remove()
      resolve(answer)
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") finish(false) }
    const actions = document.createElement("div")
    actions.className = "dialog-actions"
    const cancel = button("Cancel", () => finish(false))
    actions.append(cancel, button(confirmLabel, () => finish(true), { primary: true }))
    dialog.append(text, actions)
    overlay.append(dialog)
    document.addEventListener("keydown", onKey)
    document.body.append(overlay)
    cancel.focus()
  })

let nextControlId = 0

/** One settings line: the label (and an optional detail) on the left, the control on the right. */
export const settingsRow = (label: string, control: HTMLElement, detail?: string): HTMLElement => {
  const row = document.createElement("div")
  row.className = "settings-row"
  if (!control.id) control.id = \`setting-\${nextControlId++}\`
  const text = document.createElement("label")
  text.htmlFor = control.id
  text.textContent = label
  if (detail) {
    const small = document.createElement("span")
    small.className = "detail"
    small.textContent = detail
    text.append(small)
  }
  row.append(text, control)
  return row
}

/** A settings section: a heading, its rows in one rounded group, and a footnote that explains it. */
export const settingsGroup = (title: string, rows: HTMLElement[], footnote?: string): HTMLElement => {
  const section = document.createElement("section")
  section.className = "settings-group"
  const heading = document.createElement("h2")
  heading.textContent = title
  const group = document.createElement("div")
  group.className = "settings-rows"
  group.append(...rows)
  section.append(heading, group)
  if (footnote) {
    const note = document.createElement("p")
    note.className = "footnote"
    note.textContent = footnote
    section.append(note)
  }
  return section
}

/** An on/off switch for a settings row; the row's label names it. */
export const switchControl = (checked: boolean, onChange: (checked: boolean) => void): HTMLInputElement => {
  const element = document.createElement("input")
  element.type = "checkbox"
  element.setAttribute("role", "switch")
  element.checked = checked
  element.addEventListener("change", () => onChange(element.checked))
  return element
}
`

const UI_TEST_TS = `// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"
import { button, clampedText, confirmDialog, emptyState, setEnabled, settingsGroup, settingsRow, switchControl } from "../src/ui"

describe("ui building blocks", () => {
  it("disables a command until it has something to act on", () => {
    const edit = button("Edit", () => {}, { disabled: true })
    expect(edit.disabled).toBe(true)
    setEnabled(edit, true)
    expect(edit.disabled).toBe(false)
    expect(edit.type).toBe("button")
  })

  it("fills an empty list with a message and a hint", () => {
    const empty = emptyState("No prompts yet", "Click Add to create one.")
    expect(empty.className).toBe("empty-state")
    expect(empty.textContent).toContain("Click Add to create one.")
  })

  it("names every settings control by its row label and groups rows with a footnote", () => {
    const toggle = switchControl(false, () => {})
    const row = settingsRow("Launch at login", toggle)
    const label = row.querySelector("label")!
    expect(label.htmlFor).toBe(toggle.id)
    expect(toggle.getAttribute("role")).toBe("switch")
    const group = settingsGroup("General", [row], "Off until you turn it on.")
    expect(group.querySelector(".settings-rows")!.children).toHaveLength(1)
    expect(group.querySelector(".footnote")!.textContent).toBe("Off until you turn it on.")
  })

  it("confirms in the page: Delete resolves true, Cancel and Escape resolve false", async () => {
    const asked = confirmDialog("Delete this item?", "Delete")
    const buttons = [...document.querySelectorAll<HTMLButtonElement>(".dialog button")]
    expect(buttons.map(item => item.textContent)).toEqual(["Cancel", "Delete"])
    buttons[1]!.click()
    expect(await asked).toBe(true)
    expect(document.querySelector(".dialog")).toBeNull()
    const cancelled = confirmDialog("Delete this item?", "Delete")
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    expect(await cancelled).toBe(false)
  })

  it("clamps long text and keeps the full text on hover", () => {
    const text = clampedText("A long prompt that goes on and on.", 3)
    expect(text.className).toBe("clamp-3")
    expect(text.title).toBe("A long prompt that goes on and on.")
  })
})
`

const STYLE_CSS = `/* Native-feeling base: system font, system colors in light and dark, no page scroll. Features style
   their own views with these tokens. */
:root {
  color-scheme: light dark;
  --bg: #f5f5f7;
  --surface: #ffffff;
  --text: #1d1d1f;
  --text-2: #6e6e73;
  --line: #d2d2d7;
  --accent: #0a84ff;
  --danger: #d70015;
  --danger-bg: #fff0f0;
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1e1e1e;
    --surface: #2a2a2c;
    --text: #f5f5f7;
    --text-2: #a1a1a6;
    --line: #3a3a3c;
    --danger: #ff6961;
    --danger-bg: #3a1d1d;
  }
}

* { box-sizing: border-box; }
[hidden] { display: none !important; }

html, body { height: 100%; margin: 0; }
body { color: var(--text); background: var(--bg); overflow: hidden; }
#app { display: flex; flex-direction: column; height: 100%; }

.app-header { padding: 14px 20px 10px; border-bottom: 1px solid var(--line); }
.app-header h1 { margin: 0; font-size: 15px; font-weight: 650; }
.app-content { flex: 1; min-height: 0; overflow: auto; padding: 16px 20px; }

.error-banner { display: flex; align-items: flex-start; gap: 12px; margin: 10px 20px 0; padding: 9px 12px; color: var(--danger); background: var(--danger-bg); border-radius: 8px; }
.error-banner p { flex: 1; margin: 0; }
.error-banner button { color: inherit; background: none; border: 0; font: inherit; font-weight: 600; cursor: pointer; }
.dialog-overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.35); }
.dialog { min-width: 260px; max-width: 420px; padding: 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; }
.dialog p { margin: 0 0 14px; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }

/* Building blocks from src/ui.ts. */
.button {
  display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center;
  height: 28px; padding: 0 12px; color: var(--text); background: var(--surface);
  border: 1px solid var(--line); border-radius: 6px; font: inherit; font-weight: 500;
  white-space: nowrap; cursor: pointer;
}
.button:hover:not(:disabled) { border-color: var(--text-2); }
.button.primary { color: #fff; background: var(--accent); border-color: var(--accent); }
.button:disabled { opacity: 0.45; cursor: default; }

.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.toolbar > input, .toolbar > .grow { flex: 1 1 220px; min-width: 0; }

input[type="text"], input[type="search"], input[type="password"], select, textarea {
  color: var(--text); background: var(--surface); border: 1px solid var(--line);
  border-radius: 6px; padding: 5px 8px; font: inherit;
}
textarea { resize: vertical; }

.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 4px; min-height: 180px; height: 100%; text-align: center; color: var(--text-2);
}
.empty-state strong { color: var(--text); font-size: 14px; font-weight: 600; }

.list { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
.row { padding: 10px 12px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; }
.row[aria-selected="true"] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.row p { margin: 4px 0 0; color: var(--text-2); }
.clamp-2, .clamp-3 { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.clamp-2 { -webkit-line-clamp: 2; }
.clamp-3 { -webkit-line-clamp: 3; }
.muted { color: var(--text-2); }

.settings { display: flex; flex-direction: column; gap: 22px; max-width: 620px; margin: 0 auto; }
.settings-group h2 { margin: 0 0 6px 4px; font-size: 13px; font-weight: 600; }
.settings-rows { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; }
.settings-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 42px; padding: 8px 12px; }
.settings-row + .settings-row { border-top: 1px solid var(--line); }
.settings-row label { flex: 1 1 auto; }
.settings-row .detail { display: block; color: var(--text-2); font-size: 12px; }
.settings-row > :last-child { flex: 0 0 auto; }
.footnote { margin: 6px 4px 0; color: var(--text-2); font-size: 12px; }

input[role="switch"] {
  position: relative; flex: 0 0 auto; width: 34px; height: 20px; margin: 0;
  appearance: none; background: var(--line); border-radius: 10px; cursor: pointer; transition: background 0.15s;
}
input[role="switch"]::after {
  content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
  background: #fff; border-radius: 50%; box-shadow: 0 1px 2px rgb(0 0 0 / 30%); transition: transform 0.15s;
}
input[role="switch"]:checked { background: var(--accent); }
input[role="switch"]:checked::after { transform: translateX(14px); }

button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
`

const KIT_TEST_TS = `import { describe, expect, it } from "vitest"
import { messageFor } from "../src/api"

describe("command errors", () => {
  it("shows the message Rust wrote for the user", () => {
    expect(messageFor({ kind: "storage", message: "Settings could not be saved." })).toBe("Settings could not be saved.")
  })

  it("never shows a raw runtime error", () => {
    expect(messageFor("IPC failed: stack trace")).toBe("Something went wrong. Try again.")
  })
})
`

const STORE_TS = `/** The shared view state of the main screen: one object, changed only through set, observed through subscribe. */
export const createStore = <S extends object>(initial: S) => {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get: (): S => state,
    /** Merges the patch into the state and tells every subscriber, so every view re-renders from one source. */
    set: (patch: Partial<S>): void => {
      state = { ...state, ...patch }
      for (const listener of [...listeners]) listener()
    },
    /** Returns the function that unsubscribes. */
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

/**
 * Named mount points of the main screen. The task that builds the screen places each host with host(name);
 * a later task adds its control with mount(name, element) from main.ts and never edits the screen's file.
 */
/** What a form submit handler returns: the validation message for the form's message slot, or null when nothing is shown there. */
export type SubmitResult = string | null

export const createSlots = () => {
  const hosts = new Map<string, HTMLElement>()
  const rowRenders = new Map<string, Array<(record: never) => HTMLElement>>()
  const handlers = new Map<string, () => SubmitResult | Promise<SubmitResult>>()
  const host = (name: string): HTMLElement => {
    let element = hosts.get(name)
    if (!element) {
      element = document.createElement("div")
      element.dataset.slot = name
      hosts.set(name, element)
    }
    return element
  }
  return {
    host,
    mount: (name: string, ...children: HTMLElement[]): void => host(name).append(...children),
    /** A later task registers how its control renders in each row; the list calls row(name, record) once per row on every render. */
    mountRow: <T>(name: string, render: (record: T) => HTMLElement): void => {
      rowRenders.set(name, [...(rowRenders.get(name) ?? []), render as (record: never) => HTMLElement])
    },
    row: <T>(name: string, record: T): HTMLElement => {
      const element = document.createElement("div")
      element.dataset.slot = name
      for (const render of rowRenders.get(name) ?? []) element.append((render as (record: T) => HTMLElement)(record))
      return element
    },
    /** A later task registers the action a shared control runs (the form's confirm runs "add" or "edit"); run(name) calls it. */
    handle: (name: string, action: () => SubmitResult | Promise<SubmitResult>): void => { handlers.set(name, action) },
    /** The handler's validation message for the form's message slot, or null (saved, or failed into the errors banner, or no handler). */
    run: async (name: string): Promise<SubmitResult> => (await handlers.get(name)?.()) ?? null,
  }
}
`

const STORE_TEST_TS = `// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest"
import { createSlots, createStore } from "../src/store"

describe("shared view state and slots", () => {
  it("merges a patch and notifies subscribers until they unsubscribe", () => {
    const store = createStore({ query: "", selectedId: null as number | null })
    const listener = vi.fn()
    const stop = store.subscribe(listener)
    store.set({ query: "tea" })
    expect(store.get()).toEqual({ query: "tea", selectedId: null })
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
    store.set({ selectedId: 3 })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("mounts a control into the host the screen placed, whichever is built first", () => {
    const slots = createSlots()
    const control = document.createElement("button")
    slots.mount("filter", control)
    expect(slots.host("filter").contains(control)).toBe(true)
    expect(slots.host("filter")).toBe(slots.host("filter"))
  })

  it("renders a registered row control once per row with that row's record, and runs a registered handler", async () => {
    const slots = createSlots()
    slots.mountRow("row-actions", (record: { id: number }) => {
      const button = document.createElement("button")
      button.textContent = "Row " + record.id
      return button
    })
    expect(slots.row("row-actions", { id: 1 }).textContent).toBe("Row 1")
    expect(slots.row("row-actions", { id: 2 }).textContent).toBe("Row 2")
    expect(slots.row("row-actions", { id: 2 })).not.toBe(slots.row("row-actions", { id: 2 }))
    const submit = vi.fn(() => "Enter a name.")
    slots.handle("add", submit)
    await expect(slots.run("add")).resolves.toBe("Enter a name.")
    await expect(slots.run("edit")).resolves.toBeNull()
    expect(submit).toHaveBeenCalledTimes(1)
  })
})
`

const SHORTCUT_TS = `import { register, unregister } from "@tauri-apps/plugin-global-shortcut"

/** The one system-wide accelerator the app registers. Change the key combination here and nowhere else. */
export const DEFAULT_ACCELERATOR = "CommandOrControl+Shift+Space"

/**
 * Registers DEFAULT_ACCELERATOR. When registration is refused (another app owns the key, or the
 * session does not allow global shortcuts) onFailure gets the error and this returns false; the app
 * keeps working through its in-app controls. There is no retry.
 */
export const registerShortcut = async (onPress: () => void, onFailure: (error: unknown) => void): Promise<boolean> => {
  try {
    await register(DEFAULT_ACCELERATOR, event => {
      if (event.state === "Pressed") onPress()
    })
    return true
  } catch (error) {
    onFailure(error)
    return false
  }
}

export const unregisterShortcut = (): Promise<void> => unregister(DEFAULT_ACCELERATOR).catch(() => undefined)
`

const SHORTCUT_TEST_TS = `import { beforeEach, describe, expect, it, vi } from "vitest"

const plugin = vi.hoisted(() => ({ register: vi.fn(), unregister: vi.fn() }))
vi.mock("@tauri-apps/plugin-global-shortcut", () => plugin)

import { DEFAULT_ACCELERATOR, registerShortcut } from "../src/shortcut"

describe("global shortcut", () => {
  beforeEach(() => {
    plugin.register.mockReset()
  })

  it("registers the one default accelerator and reacts to key presses only", async () => {
    plugin.register.mockResolvedValue(undefined)
    const onPress = vi.fn()
    expect(await registerShortcut(onPress, vi.fn())).toBe(true)
    const [accelerator, handler] = plugin.register.mock.calls[0]!
    expect(accelerator).toBe(DEFAULT_ACCELERATOR)
    handler({ shortcut: accelerator, id: 1, state: "Released" })
    expect(onPress).not.toHaveBeenCalled()
    handler({ shortcut: accelerator, id: 1, state: "Pressed" })
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it("reports a refused registration once and does not throw", async () => {
    plugin.register.mockRejectedValue(new Error("refused"))
    const onFailure = vi.fn()
    expect(await registerShortcut(vi.fn(), onFailure)).toBe(false)
    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(plugin.register).toHaveBeenCalledTimes(1)
  })
})
`

// A text source for the app icon; the packaging scripts turn it into src-tauri/icons with tauri icon.
const APP_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="224" fill="#1d1d1f"/>
  <rect x="272" y="272" width="480" height="480" rx="96" fill="#0a84ff"/>
</svg>
`

function packageLinuxScript(identity: ProjectIdentity, wayland: boolean): string {
  return `#!/usr/bin/env bash
# Build an AppImage, install it for the current user, and add the desktop entry.
# Usage: scripts/package_linux.sh [--install]
set -euo pipefail

cd "$(dirname "$0")/.."
SLUG="${identity.slug}"
APP_NAME=${shellWord(identity.projectName)}
INSTALL_DIR="$HOME/.local"

install=false
for arg in "$@"; do
  case "$arg" in
    --install) install=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

[ -f src-tauri/icons/128x128.png ] || npm run tauri -- icon app-icon.svg
npm run tauri -- build --bundles appimage

mkdir -p dist
APPIMAGE="$(find src-tauri/target/release/bundle/appimage -maxdepth 1 -name '*.AppImage' | head -1)"
if [ -z "$APPIMAGE" ]; then
  echo "AppImage was not produced" >&2
  exit 1
fi
cp "$APPIMAGE" "dist/$SLUG.AppImage"

if [ "$install" = false ]; then
  echo "Built dist/$SLUG.AppImage; rerun with --install to install it."
  exit 0
fi

mkdir -p "$INSTALL_DIR/bin" "$INSTALL_DIR/share/applications" "$INSTALL_DIR/share/icons/hicolor/128x128/apps"
if [ -f "$INSTALL_DIR/bin/$SLUG.AppImage" ]; then
  mkdir -p dist/rollback
  cp "$INSTALL_DIR/bin/$SLUG.AppImage" "dist/rollback/$SLUG.AppImage"
fi
install -m755 "dist/$SLUG.AppImage" "$INSTALL_DIR/bin/$SLUG.AppImage"
install -m644 src-tauri/icons/128x128.png "$INSTALL_DIR/share/icons/hicolor/128x128/apps/$SLUG.png"
cat > "$INSTALL_DIR/share/applications/${identity.bundleId}.desktop" <<DESKTOP
[Desktop Entry]
Name=$APP_NAME
Comment=$APP_NAME
Exec=${wayland ? "env GDK_BACKEND=wayland " : ""}$INSTALL_DIR/bin/$SLUG.AppImage
Icon=$SLUG
Terminal=false
Type=Application
Categories=Utility;
StartupWMClass=${identity.bundleId}
DESKTOP
echo "Installed $APP_NAME under $INSTALL_DIR"
`;
}

function packageScript(identity: ProjectIdentity): string {
  return `#!/usr/bin/env bash
# Builds the macOS app bundle only (no DMG; that is a release step), signs it ad hoc, and verifies it.
# Usage: scripts/package_app.sh [--install]
#   --install  quit the running app, move any installed copy to src-tauri/target/rollback/ (never
#              inside /Applications), install the verified app, register it, and launch it by bundle ID.
#              If the new copy fails verification, the previous app is put back.
# SIGN_IDENTITY selects a Developer ID; the default "-" signs ad hoc for local proof.
set -euo pipefail

cd "$(dirname "$0")/.."
APP_NAME=${shellWord(identity.projectName)}
BUNDLE_ID="${identity.bundleId}"
SIGN_IDENTITY="\${SIGN_IDENTITY:--}"
APP="src-tauri/target/release/bundle/macos/$APP_NAME.app"
INSTALLED="/Applications/$APP_NAME.app"
ROLLBACK="src-tauri/target/rollback/$APP_NAME.app"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

install=false
for arg in "$@"; do
  case "$arg" in
    --install) install=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

[ -f src-tauri/icons/icon.icns ] || npm run tauri -- icon app-icon.svg
npm run tauri -- build --bundles app
codesign --force --deep --sign "$SIGN_IDENTITY" "$APP"
codesign --verify --deep --strict "$APP"

if [ "$install" = true ]; then
  osascript -e "tell application id \\"$BUNDLE_ID\\" to quit" >/dev/null 2>&1 || true
  # Launching while the old process is still quitting fails with error -600.
  for _ in $(seq 1 50); do
    pgrep -f "$INSTALLED/Contents/MacOS/" >/dev/null || break
    sleep 0.2
  done
  if [ -d "$INSTALLED" ]; then
    rm -rf "$ROLLBACK"
    mkdir -p "$(dirname "$ROLLBACK")"
    mv "$INSTALLED" "$ROLLBACK"
  fi
  cp -R "$APP" "$INSTALLED"
  if ! codesign --verify --deep --strict "$INSTALLED"; then
    rm -rf "$INSTALLED"
    [ -d "$ROLLBACK" ] && mv "$ROLLBACK" "$INSTALLED"
    echo "The new app failed verification; the previous app was restored." >&2
    exit 1
  fi
  # Only the installed bundle stays registered, so open -b always starts it.
  "$LSREGISTER" -u "$APP" >/dev/null 2>&1 || true
  "$LSREGISTER" -f "$INSTALLED"
  open -b "$BUNDLE_ID"
fi
`
}

function cargoToml(identity: ProjectIdentity, lib: string, uses: TauriKitUses): string {
  const tauriFeatures = uses.tray ? `["tray-icon"]` : "[]"
  const testFeatures = uses.tray ? `["tray-icon", "test"]` : `["test"]`
  return `[package]
name = "${identity.slug}"
version = "0.1.0"
edition = "2021"
rust-version = "1.85"

[lib]
name = "${lib}"
crate-type = ["staticlib", "cdylib", "rlib"]

# Exact versions, tested together by the compiler's kit check. Tauri's internal crates are pinned too:
# with caret versions Cargo mixes a newer tauri-runtime into tauri 2.11 and the build breaks.
[build-dependencies]
tauri-build = { version = "=2.6.3", features = [] }
tauri-codegen = "=2.6.3"

[dependencies]
tauri = { version = "=2.11.5", features = ${tauriFeatures} }
tauri-runtime = "=2.11.3"
tauri-runtime-wry = "=2.11.4"
tauri-utils = "=2.9.3"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
${[
    ...(uses.records ? [`rusqlite = { version = "=0.37.0", features = ["bundled"] }`] : []),
    ...(uses.secrets ? [`keyring = "=4.2.0"`] : []),
    // RFC3339 parsing for the date-time fields the data owner validates, so no task hand-rolls a parser or edits Cargo.toml.
    ...(uses.timestamps ? [`time = { version = "0.3", features = ["parsing", "formatting"] }`] : []),
    // The HTTPS client for declared services, here so integration tasks never have to edit Cargo.toml.
    ...(uses.services ? [`reqwest = { version = "=0.12.28", features = ["json"] }`] : []),
    ...uses.plugins.map(plugin => `${plugin.crate} = "=${plugin.crateVersion}"`),
  ].join("\n")}

[dev-dependencies]
tauri = { version = "=2.11.5", features = ${testFeatures} }
tempfile = "3"
`.replace(/\n\n\n/g, "\n\n")
}

// Wrap only past max_width, so layout depends on line length alone and the kit stays formatted.
const RUSTFMT_TOML = `use_small_heuristics = "Max"
`

const BUILD_RS = `fn main() {
    tauri_build::build()
}
`

function mainRs(lib: string): string {
  return `// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ${lib}::run()
}
`
}

function libRs(uses: TauriKitUses): string {
  const modules = ["error", ...(uses.records ? ["database"] : []), ...(uses.settings ? ["settings"] : []), ...(uses.secrets ? ["vault"] : [])].sort()
  const autostart = uses.plugins.some(plugin => plugin.crate === "tauri-plugin-autostart")
  const commands = [...(uses.settings ? ["load_settings", "save_settings"] : []), ...(uses.records ? ["schema_version"] : [])]
  const stateFields = [
    ...(uses.settings ? ["    pub settings: SettingsFile,"] : []),
    ...(uses.records ? ["    pub database: Mutex<rusqlite::Connection>,"] : []),
    ...(uses.secrets ? ["    pub secrets: Box<dyn SecretStore>,"] : []),
  ]
  const stateLets = [
    ...(uses.settings ? ["    let settings = SettingsFile::new(folder);"] : []),
    ...(uses.records ? ["    let database = Mutex::new(database::open(folder)?);"] : []),
  ]
  const stateFieldNames = [...(uses.settings ? ["settings"] : []), ...(uses.records ? ["database"] : []), ...(uses.secrets ? ["secrets"] : [])]
  const imports = [
    ...(uses.records ? ["use std::sync::Mutex;", ""] : []),
    ...(uses.settings ? ["use serde::{Deserialize, Serialize};"] : []),
    ...(uses.tray ? ["use tauri::menu::{Menu, MenuItem};", "use tauri::tray::TrayIconBuilder;"] : []),
    `use tauri::{${["Manager", ...(uses.tray ? ["RunEvent"] : []), "Runtime", ...(commands.length ? ["State"] : []), ...(uses.tray ? ["WindowEvent"] : [])].join(", ")}};`,
    ...(autostart ? ["use tauri_plugin_autostart::MacosLauncher;"] : []),
    "",
    "use crate::error::AppError;",
    ...(uses.settings ? ["use crate::settings::SettingsFile;"] : []),
    ...(uses.secrets ? ["use crate::vault::SecretStore;"] : []),
  ]
  const pluginInit = (plugin: TauriPlugin) => plugin.crate === "tauri-plugin-autostart" ? "tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None)" : plugin.init
  return `//! Composition root. \`app_builder\` registers every plugin and command; \`run()\` and the packaging
//! test both use it, so a command missing from one is missing from both. \`run()\` owns the one
//! \`setup\` closure: \`Builder::setup\` replaces any earlier one, so a second call silently drops the first.

${modules.map(name => `pub mod ${name};`).join("\n")}

${imports.join("\n")}
${uses.settings ? `
/// Every saved setting. Feature tasks add fields; #[serde(default)] keeps older files readable.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct AppSettings {}
` : ""}
/// The stores every command reads through \`State<'_, AppState>\`.
pub struct AppState {
${stateFields.length ? stateFields.join("\n") : "    pub folder: std::path::PathBuf,"}
}
${uses.settings ? `
#[tauri::command]
fn load_settings(state: State<'_, AppState>) -> Result<AppSettings, AppError> {
    state.settings.load()
}

/// Saves the whole settings value and returns what was stored.
#[tauri::command]
fn save_settings(state: State<'_, AppState>, next: AppSettings) -> Result<AppSettings, AppError> {
    state.settings.save(&next)?;
    state.settings.load()
}
` : ""}${uses.records ? `
#[tauri::command]
fn schema_version(state: State<'_, AppState>) -> Result<usize, AppError> {
    let busy = |_| AppError::Storage("The saved records are busy.".into());
    let connection = state.database.lock().map_err(busy)?;
    database::user_version(&connection)
}
` : ""}
/// Opens the stores in \`folder\` and hands them to Tauri. \`run()\` passes the app-data folder; tests
/// pass a temporary one (the mock runtime does not run \`setup\`, and tests must not touch real data).
pub fn manage_state<R: Runtime, M: Manager<R>>(
    manager: &M,
    folder: &std::path::Path,${uses.secrets ? "\n    secrets: Box<dyn SecretStore>," : ""}
) -> Result<(), AppError> {
    let unavailable = |_| AppError::Storage("The app-data folder could not be created.".into());
    std::fs::create_dir_all(folder).map_err(unavailable)?;
${stateLets.length ? `${stateLets.join("\n")}\n` : ""}    manager.manage(AppState { ${stateFieldNames.length ? stateFieldNames.join(", ") : "folder: folder.to_path_buf()"} });
    Ok(())
}

/// The app's one generated context (config, capabilities, icons). Tests build with it too, so a
/// command the capabilities refuse fails in tests exactly as it would in the app.
pub fn context<R: Runtime>() -> tauri::Context<R> {
    tauri::generate_context!()
}

/// Plugins and commands only; \`run()\` adds state and the ${uses.tray ? "tray" : "window behavior"}.
pub fn app_builder<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
${uses.plugins.map(plugin => `    let builder = builder.plugin(${pluginInit(plugin)});`).join("\n")}${uses.plugins.length ? "\n" : ""}    builder.invoke_handler(tauri::generate_handler![${commands.join(", ")}])
}
${uses.tray ? `
/// Closing the window hides it; the tray's Show brings it back and Quit exits.
fn install_tray<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, Some("CmdOrCtrl+Q"))?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    let tooltip = app.package_info().name.clone();
    let mut tray = TrayIconBuilder::with_id("main").menu(&menu).tooltip(tooltip);
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.on_menu_event(|app, event| match event.id.as_ref() {
        "show" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        "quit" => app.exit(0),
        _ => {}
    })
    .build(app)?;
    Ok(())
}
` : ""}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    app_builder(tauri::Builder::default())
        .setup(|app| {
            let folder = app.path().app_data_dir()?;${uses.secrets ? `
            let secrets = Box::new(vault::KeychainStore::new(&app.config().identifier));
            manage_state(app, &folder, secrets)?;` : `
            manage_state(app, &folder)?;`}${uses.tray ? "\n            install_tray(app)?;" : ""}
            Ok(())
        })${uses.tray ? `
        .on_window_event(|window, event| {
            // Only the main window hides; any other window closes, so it opens fresh with current data.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })` : ""}
        .build(context())
        .expect("the app could not start")
        .run(${uses.tray ? `|_app, event| {
            // An explicit Quit passes an exit code; closing the last window does not.
            if let RunEvent::ExitRequested { code: None, api, .. } = event {
                api.prevent_exit();
            }
        }` : "|_app, _event| {}"});
}
`
}

const ERROR_RS = `use serde::Serialize;

/// The only error a command returns. The frontend shows \`message\`; nothing raw crosses the boundary.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "kebab-case")]
pub enum AppError {
    Storage(String),
    NotFound(String),
    Invalid(String),
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Storage(text) | Self::NotFound(text) | Self::Invalid(text) => f.write_str(text),
        }
    }
}

impl std::error::Error for AppError {}
`

const SETTINGS_RS = `use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{de::DeserializeOwned, Serialize};

use crate::error::AppError;

const SAVE_FAILED: &str = "Settings could not be saved. The previous settings were kept.";

/// Settings as one JSON file in the app-data folder, replaced whole: a temporary file in the same
/// folder is written and synced, then renamed over the old one, so a crash never leaves half a file.
pub struct SettingsFile {
    path: PathBuf,
}

impl SettingsFile {
    pub fn new(folder: &Path) -> Self {
        Self { path: folder.join("settings.json") }
    }

    /// A missing file gives the defaults; an unreadable one is an error the caller shows.
    pub fn load<T: DeserializeOwned + Default>(&self) -> Result<T, AppError> {
        let unreadable = || AppError::Storage("Saved settings could not be read.".into());
        match fs::read(&self.path) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| unreadable()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(T::default()),
            Err(_) => Err(unreadable()),
        }
    }

    pub fn save<T: Serialize>(&self, value: &T) -> Result<(), AppError> {
        let failed = || AppError::Storage(SAVE_FAILED.into());
        let folder = self.path.parent().ok_or_else(failed)?;
        fs::create_dir_all(folder).map_err(|_| failed())?;
        let bytes = serde_json::to_vec_pretty(value).map_err(|_| failed())?;
        let temporary = folder.join(format!(".settings-{}.tmp", std::process::id()));
        let result = (|| {
            let mut file = fs::File::create(&temporary)?;
            file.write_all(&bytes)?;
            file.sync_all()?;
            fs::rename(&temporary, &self.path)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result.map_err(|_| failed())
    }
}
`

const DATABASE_RS = `use std::path::Path;

use rusqlite::Connection;

use crate::error::AppError;

/// Schema changes, applied in order. Feature tasks append their tables; never edit one that has shipped.
pub const MIGRATIONS: &[&str] = &[];

/// The records database in the app-data folder (created when missing); PRAGMA user_version holds the schema version.
pub fn open(folder: &Path) -> Result<Connection, AppError> {
    // A fresh install has no app-data folder yet, and launch opens the store before manage_state would create it.
    std::fs::create_dir_all(folder)
        .map_err(|_| AppError::Storage("The app-data folder could not be created.".into()))?;
    let mut connection = Connection::open(folder.join("records.sqlite3"))
        .map_err(|_| AppError::Storage("The saved records could not be opened.".into()))?;
    migrate(&mut connection, MIGRATIONS)?;
    Ok(connection)
}

/// Applies the migrations after the stored version, each in its own transaction with its version.
pub fn migrate(connection: &mut Connection, migrations: &[&str]) -> Result<(), AppError> {
    let failed = |_| AppError::Storage("The saved records could not be upgraded.".into());
    let version = user_version(connection)?;
    for (index, sql) in migrations.iter().enumerate().skip(version) {
        let transaction = connection.transaction().map_err(failed)?;
        transaction.execute_batch(sql).map_err(failed)?;
        transaction.pragma_update(None, "user_version", index + 1).map_err(failed)?;
        transaction.commit().map_err(failed)?;
    }
    Ok(())
}

pub fn user_version(connection: &Connection) -> Result<usize, AppError> {
    connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|_| AppError::Storage("The saved records could not be read.".into()))
}
`

const VAULT_RS = `use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};

use crate::error::AppError;

const SAVE_FAILED: &str = "The key could not be saved. The previous key was kept.";

/// Where secrets live. The app uses the login keychain; tests use MemoryStore, so a test run never
/// touches the user's keychain.
pub trait SecretStore: Send + Sync {
    fn read(&self, account: &str) -> Result<Option<String>, AppError>;
    fn write(&self, account: &str, secret: &str) -> Result<(), AppError>;
    fn delete(&self, account: &str) -> Result<(), AppError>;
}

/// Generic passwords in the macOS login keychain (keyring's apple-native store), under one service
/// named after the bundle identifier. Secrets never go to the frontend after they are saved.
pub struct KeychainStore {
    service: String,
}

impl KeychainStore {
    pub fn new(identifier: &str) -> Self {
        Self { service: format!("{identifier}.credentials") }
    }

    fn entry(&self, account: &str) -> Result<keyring::Entry, AppError> {
        keyring::Entry::new(&self.service, account)
            .map_err(|_| AppError::Storage("The keychain could not be opened.".into()))
    }
}

impl SecretStore for KeychainStore {
    fn read(&self, account: &str) -> Result<Option<String>, AppError> {
        match self.entry(account)?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(AppError::Storage("The key could not be read from the keychain.".into())),
        }
    }

    fn write(&self, account: &str, secret: &str) -> Result<(), AppError> {
        self.entry(account)?.set_password(secret).map_err(|_| AppError::Storage(SAVE_FAILED.into()))
    }

    fn delete(&self, account: &str) -> Result<(), AppError> {
        match self.entry(account)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(AppError::Storage("The key could not be removed.".into())),
        }
    }
}

/// The test double for SecretStore. It lives here so tests can reach it; production code never
/// constructs it (the packaging test checks run() uses KeychainStore).
#[derive(Default)]
pub struct MemoryStore {
    map: Mutex<HashMap<String, String>>,
}

impl MemoryStore {
    fn values(&self) -> Result<MutexGuard<'_, HashMap<String, String>>, AppError> {
        self.map.lock().map_err(|_| AppError::Storage("The test store is busy.".into()))
    }
}

impl SecretStore for MemoryStore {
    fn read(&self, account: &str) -> Result<Option<String>, AppError> {
        Ok(self.values()?.get(account).cloned())
    }

    fn write(&self, account: &str, secret: &str) -> Result<(), AppError> {
        self.values()?.insert(account.into(), secret.into());
        Ok(())
    }

    fn delete(&self, account: &str) -> Result<(), AppError> {
        self.values()?.remove(account);
        Ok(())
    }
}
`

function kitTestsRs(lib: string, uses: TauriKitUses): string {
  const commandChecks = [
    ...(uses.records ? [`    // The data task appends the first migration, so compare with the list instead of a fixed number.
    let migrations = backend::database::MIGRATIONS.len();
    assert_eq!(invoke(&webview, "schema_version", json!({})).unwrap(), json!(migrations));`] : []),
    ...(uses.settings ? [`    assert_eq!(invoke(&webview, "save_settings", json!({ "next": {} })).unwrap(), json!({}));`, `    assert_eq!(invoke(&webview, "load_settings", json!({})).unwrap(), json!({}));`] : []),
  ]
  return `use ${lib} as backend;

use serde_json::{json, Value};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{get_ipc_response, mock_builder, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{WebviewWindow, WebviewWindowBuilder};

fn invoke(webview: &WebviewWindow<MockRuntime>, cmd: &str, body: Value) -> Result<Value, Value> {
    get_ipc_response(
        webview,
        InvokeRequest {
            cmd: cmd.into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            // Debug builds serve the frontend from devUrl; any other origin is remote and refused.
            url: "http://localhost:1420".parse().unwrap(),
            body: InvokeBody::Json(body),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        },
    )
    .map(|response| response.deserialize::<Value>().unwrap())
}

/// The real builder, context, and capabilities, with the stores in a temporary folder.
#[test]
fn every_command_is_registered_and_allowed() {
    let app = backend::app_builder(mock_builder()).build(backend::context()).expect("app builds");
    let folder = tempfile::tempdir().unwrap();${uses.secrets ? `
    let secrets = Box::new(backend::vault::MemoryStore::default());
    backend::manage_state(&app, folder.path(), secrets).unwrap();` : `
    backend::manage_state(&app, folder.path()).unwrap();`}
    let builder = WebviewWindowBuilder::new(&app, "main", Default::default());
    let webview = builder.build().expect("webview");
${commandChecks.join("\n")}${commandChecks.length ? "\n" : ""}    assert!(invoke(&webview, "no_such_command", json!({})).is_err());
}
${uses.settings ? `
#[test]
fn settings_replace_whole_and_a_missing_file_gives_defaults() {
    let folder = tempfile::tempdir().unwrap();
    let file = backend::settings::SettingsFile::new(folder.path());
    assert_eq!(file.load::<Option<Value>>().unwrap(), None);
    file.save(&json!({ "theme": "dark" })).unwrap();
    assert_eq!(file.load::<Option<Value>>().unwrap(), Some(json!({ "theme": "dark" })));
    let files = std::fs::read_dir(folder.path()).unwrap().count();
    assert_eq!(files, 1, "no temporary file is left behind");
}
` : ""}${uses.records ? `
#[test]
fn migrations_apply_in_order_and_record_the_schema_version() {
    use backend::database::{migrate, user_version};
    let mut connection = rusqlite::Connection::open_in_memory().unwrap();
    let create = "CREATE TABLE sample (id INTEGER PRIMARY KEY)";
    let alter = "ALTER TABLE sample ADD COLUMN name TEXT";
    migrate(&mut connection, &[create]).unwrap();
    assert_eq!(user_version(&connection).unwrap(), 1);
    migrate(&mut connection, &[create, alter]).unwrap();
    assert_eq!(user_version(&connection).unwrap(), 2);
    migrate(&mut connection, &[create, alter]).unwrap();
    assert_eq!(user_version(&connection).unwrap(), 2, "applied migrations never run twice");
}

#[test]
fn open_creates_a_missing_data_folder() {
    let parent = tempfile::tempdir().unwrap();
    let folder = parent.path().join("fresh").join("install");
    let connection = backend::database::open(&folder).unwrap();
    assert_eq!(
        backend::database::user_version(&connection).unwrap(),
        backend::database::MIGRATIONS.len()
    );
    assert!(folder.join("records.sqlite3").is_file());
}
` : ""}${uses.secrets ? `
#[test]
fn secrets_round_trip_in_the_test_store() {
    use backend::vault::{MemoryStore, SecretStore};
    let store = MemoryStore::default();
    assert_eq!(store.read("provider").unwrap(), None);
    store.write("provider", "fixture-key").unwrap();
    assert_eq!(store.read("provider").unwrap().as_deref(), Some("fixture-key"));
    store.delete("provider").unwrap();
    assert_eq!(store.read("provider").unwrap(), None);
}
` : ""}`
}

function tauriConf(identity: ProjectIdentity, linuxOnly: boolean): string {
  return `${JSON.stringify({
    $schema: "https://schema.tauri.app/config/2",
    productName: identity.projectName,
    version: "0.1.0",
    identifier: identity.bundleId,
    build: {
      beforeDevCommand: "npm run dev",
      devUrl: "http://localhost:1420",
      beforeBuildCommand: "npm run build",
      frontendDist: "../dist-web",
    },
    app: {
      windows: [{ label: "main", title: identity.projectName, width: 960, height: 640, minWidth: 720, minHeight: 480 }],
      // Remote calls go through Rust, so the webview needs only its own files and the IPC channel.
      security: { csp: "default-src 'self'; connect-src ipc: http://ipc.localhost; img-src 'self' asset: data:; style-src 'self'" },
    },
    bundle: {
      active: true,
      targets: "all",
      icon: ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"],
      ...(linuxOnly ? {} : { macOS: { minimumSystemVersion: "13.0", signingIdentity: "-" } }),
    },
  }, null, 2)}\n`
}

function capabilities(uses: TauriKitUses): string {
  return `${JSON.stringify({
    $schema: "../gen/schemas/desktop-schema.json",
    identifier: "default",
    description: "Permissions for every window listed: core, plus exactly the plugins lib.rs initializes. Add each window label that calls commands.",
    windows: ["main"],
    permissions: ["core:default", ...uses.plugins.flatMap(plugin => plugin.permissions)],
  }, null, 2)}\n`
}
