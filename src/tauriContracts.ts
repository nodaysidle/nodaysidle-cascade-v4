import type { DataField, DataOperation, NormalizedBlueprint } from "./compiler"
import type { OwnerKind, PresetContract, PresetOptionValue } from "./presets"
import type { DataValueType } from "./schema"

// Tauri-only contract text: the Rust/TypeScript wire format, the store and document command
// interfaces, the option-dependent preset text, and the per-task prompt additions. Everything here is
// derived from declared fields (storage, fields, optional, dataOperations, userFileAccess, schedules).
// This file imports only types, so presets.ts and compiler.ts can both use it.

type FileAccess = "none" | "opens" | "saves" | "opens-and-saves"

export interface TauriFeatureUse {
  readonly id: string
  // What the feature does to each data object it uses, keyed like TauriData.key.
  readonly operationsByData: Readonly<Record<string, readonly DataOperation[]>>
  readonly userFileAccess: FileAccess
  readonly resourceIds: readonly string[]
  readonly runsEverySeconds: number | null
  readonly runsDailyAt: string | null
}

export interface TauriData {
  readonly name: string
  readonly key: string
  readonly base: string
  readonly record: string
  readonly resource: string
  readonly storage: string
  readonly fields: readonly DataField[]
}

const RUST_TYPE: Record<DataValueType, string> = {
  text: "String",
  "long-text": "String",
  number: "f64",
  "whole-number": "i64",
  flag: "bool",
  date: "String",
  "date-time": "String",
  "text-list": "list of String",
  reference: "i64",
}

const snake = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "value"
const rustField = (field: DataField): string => `${snake(field.name)}: ${field.optional ? `Option(${RUST_TYPE[field.valueType]})` : RUST_TYPE[field.valueType]}`
const saves = (feature: TauriFeatureUse): boolean => feature.userFileAccess === "saves" || feature.userFileAccess === "opens-and-saves"
const opens = (feature: TauriFeatureUse): boolean => feature.userFileAccess === "opens" || feature.userFileAccess === "opens-and-saves"

// Stated once, at the top of the TRD data contracts, for every Tauri command.
export const TAURI_WIRE_FORMAT = "Wire format (every Tauri command of every data object, stated once here): ids are i64 numbers; whole numbers are i64, numbers are f64, flags are booleans; date-time values are RFC3339 UTC strings (for example 2026-01-31T09:30:00Z), created and compared as UTC and converted to local time only for display; date values are calendar days written YYYY-MM-DD in the user's local calendar and compared as days, never converted through UTC; a text-list is an array of strings; an optional field is a Rust Option and is sent and received as null when absent, never as an omitted key, an empty string, or a sentinel value; record keys are the snake_case field names, and top-level command arguments are written camelCase from TypeScript (Tauri maps them to snake_case); every failure is the AppError enum serialized as {kind: storage | not-found | invalid, message}, never a raw string. A list command takes no arguments and returns every record by descending id, which is the order of creation and not the order of any date or time field; no declared feature needs a range or limit filter, so a feature that needs a subset (such as one day or one week) filters the returned array in TypeScript, and a feature that needs another order sorts it there, breaking ties by descending id."

// A feature that saves a document writes only that file; the records it exports are read, not created.
export function tauriFeatureOps(storage: string, operations: readonly DataOperation[], feature: TauriFeatureUse, documentResources: ReadonlySet<string>): readonly DataOperation[] {
  if (storage !== "document" && saves(feature) && operations.length && feature.resourceIds.some(id => documentResources.has(id))) return ["read"]
  return operations
}

export function tauriStoreCommands(base: string, operations: readonly DataOperation[]): string[] {
  return operations.flatMap(operation => ({ create: [`create_${base}`], read: [`list_${base}`, `get_${base}`], update: [`update_${base}`], delete: [`delete_${base}`] })[operation])
}

export function tauriStoreInterface(data: TauriData, operations: readonly DataOperation[]): string {
  if (data.storage === "settings") {
    return `Interface: the kit already provides load_settings() and save_settings(next), both returning the AppSettings value, in src-tauri/src/lib.rs; OWN-DATA-STORE adds the fields above to AppSettings (with #[serde(default)]) and adds no other command for ${data.name}.`
  }
  const { base, record } = data
  const signatures: Record<string, string> = {
    [`create_${base}`]: `create_${base}(input: ${record}Input) returns ${record}`,
    [`list_${base}`]: `list_${base}() takes no arguments and returns every ${record} by descending id`,
    [`get_${base}`]: `get_${base}(id: i64) returns ${record}`,
    [`update_${base}`]: `update_${base}(id: i64, input: ${record}Input) returns the updated ${record} and replaces every field with input, so the caller sends the stored value of each field it does not change and null only to clear an optional field`,
    [`delete_${base}`]: `delete_${base}(id: i64) returns nothing`,
  }
  const optional = data.fields.filter(field => field.optional)
  return [
    `Interface: OWN-DATA-STORE owns every Tauri command for ${data.name}, registers them in src-tauri/src/lib.rs, and appends one migration that creates the table to database::MIGRATIONS in src-tauri/src/database.rs${data.fields.some(field => field.valueType === "text-list") ? " (a text-list column holds a JSON array)" : ""}; it never hard-codes the schema version.`,
    `Rust shapes: struct ${record} { id: i64, ${data.fields.map(rustField).join(", ")} } and struct ${record}Input with the same fields without id, both deriving Serialize, Deserialize, Clone, Debug, PartialEq; the JSON keys on the wire are exactly id${data.fields.map(field => `, ${snake(field.name)}`).join("")}, so TypeScript reads and writes those keys and no camelCase variant.`,
    `Commands, exactly: ${tauriStoreCommands(base, operations).map(name => signatures[name]).join("; ")}. Each returns the AppError enum on failure (not-found for an unknown id); feature tasks reach them only through the call(command, args) wrapper in src/api.ts and add no Rust command of their own.`,
    ...(optional.length ? [`Optional: ${optional.map(field => snake(field.name)).join(", ")} ${optional.length === 1 ? "is" : "are"} declared as a Rust Option in ${record} and ${record}Input; a record whose optional value is null is saved and reloaded unchanged, and quitting or relaunching never fills in, edits, or deletes it.`] : []),
  ].join(" ")
}

// A document is a file the user picks, not a record: no id, no list, get, or create command.
export function tauriDocumentInterface(data: TauriData, users: readonly TauriFeatureUse[]): string {
  const writers = users.filter(saves)
  const readers = users.filter(opens)
  const ids = (list: readonly TauriFeatureUse[]) => list.map(feature => feature.id).join(", ")
  const parts = [
    ...(writers.length ? [`write_${data.base}(path: String, content: String) returns nothing (${ids(writers)}): path is the target the user chose in the Save dialog and may not exist yet, so Rust canonicalizes its parent directory (it must exist and be a directory, otherwise AppError invalid), joins the file name onto it, writes the content to a temporary file in that directory, syncs it, and renames it over the target; a failure removes the temporary file and leaves an existing target untouched; the feature that saves it owns the file's layout and builds the whole content string in TypeScript from its own data in the layout its behavior states; OWN-DATA-STORE only writes the string it is given`] : []),
    ...(readers.length || !writers.length ? [`read_${data.base}(path: String) returns the file text (${ids(readers)}): path is a file the user chose in the Open dialog or a saved path to reopen; Rust canonicalizes it, requires a regular file, and returns its text`] : []),
  ]
  return `Interface: ${data.name} is a file the user chooses, not a record: it has no id and no list, get, create, update, or delete command. OWN-DATA-STORE owns exactly these Tauri commands and registers them in src-tauri/src/lib.rs: ${parts.join("; ")}.`
}

// The Rust commands a feature calls, so its task names every export it uses.
export function tauriFeatureCommands(feature: TauriFeatureUse, data: readonly TauriData[]): string[] {
  const documents = new Set(data.filter(item => item.storage === "document").map(item => item.resource))
  return data.filter(item => feature.resourceIds.includes(item.resource)).flatMap(item => {
    if (item.storage === "document") return [...(saves(feature) ? [`write_${item.base}(path, content)`] : []), ...(opens(feature) || !saves(feature) ? [`read_${item.base}(path)`] : [])]
    if (item.storage === "settings") return ["load_settings()", "save_settings(next)"]
    if (item.storage !== "records" || !item.fields.length) return []
    const signatures: Record<string, string> = { create: `create_${item.base}(input)`, list: `list_${item.base}()`, get: `get_${item.base}(id)`, update: `update_${item.base}(id, input)`, delete: `delete_${item.base}(id)` }
    return tauriStoreCommands(item.base, tauriFeatureOps(item.storage, feature.operationsByData[item.key] ?? [], feature, documents)).map(name => signatures[name.split("_")[0]!]!)
  })
}

// The record fields of a given type in the data objects a feature uses.
function usedFields(feature: TauriFeatureUse, data: readonly TauriData[], valueType: DataValueType): { item: TauriData; field: DataField }[] {
  return data.filter(item => item.storage === "records" && feature.resourceIds.includes(item.resource)).flatMap(item => item.fields.filter(field => field.valueType === valueType).map(field => ({ item, field })))
}

const writes = (feature: TauriFeatureUse, item: TauriData): boolean => (feature.operationsByData[item.key] ?? []).some(operation => operation === "create" || operation === "update")

// Time-dependent behavior is declared: a schedule, a calendar-day field (any feature that uses it needs
// today), or a date-time field the feature writes (it stamps the time). Reading a stored date-time
// for display needs no clock.
export function tauriNeedsClock(feature: TauriFeatureUse, data: readonly TauriData[]): boolean {
  return feature.runsEverySeconds !== null || feature.runsDailyAt !== null
    || usedFields(feature, data, "date").length > 0
    || usedFields(feature, data, "date-time").some(({ item }) => writes(feature, item))
}

// Calendar days are local YYYY-MM-DD strings; today comes from the injected clock and day logic compares the strings.
export function tauriDayRule(feature: TauriFeatureUse, data: readonly TauriData[]): string {
  const days = usedFields(feature, data, "date")
  if (!days.length) return ""
  return `Calendar-day field${days.length === 1 ? "" : "s"} (${days.map(({ item, field }) => `${item.name}.${snake(field.name)}`).join(", ")}) ${days.length === 1 ? "holds" : "hold"} the user's local YYYY-MM-DD day as a string: derive today from the injected clock's local year, month, and day (never from toISOString() or any UTC value), and decide equality, ordering, and consecutive days (a streak counts each previous local day by calendar arithmetic, not by subtracting 24 hours) only by comparing those strings. Its tests fix the clock and cover a day boundary near local midnight.`
}

export interface TauriTaskInput {
  readonly kind: OwnerKind | "foundation"
  readonly features: readonly TauriFeatureUse[]
  readonly data: readonly TauriData[]
  readonly hasRecords: boolean
  readonly shortcut: boolean
  // Feature tasks: whether this one builds the shared main screen ("first") or mounts into it ("later").
  readonly slots?: "first" | "later"
  readonly firstMainTask?: string
  // Some feature creates and some updates a record: the detail view is then also the entry form.
  readonly entryForm?: boolean
  // Foundation only: listed files that are not part of the kit.
  readonly ownFiles?: readonly string[]
}

export function tauriTaskPrompt(input: TauriTaskInput): string {
  const lines: string[] = []
  if (input.kind === "foundation") {
    lines.push(`Every listed file that the kit also contains is already in place from the copy step: leave its content as copied and do not recreate it. The only files you create here are: ${input.ownFiles?.join(", ") || "none"}. Finish with npm run build and then cargo test, because the kit tests need the built frontend in dist-web.`)
  }
  if (input.kind === "data" && input.hasRecords) {
    lines.push("Follow the Wire format block at the top of the TRD Data Contracts exactly. Put the table's SQL in the migration list in src-tauri/src/database.rs; src-tauri/tests/kit_tests.rs compares schema_version with database::MIGRATIONS.len(), so it needs no version edit.")
  }
  const documents = input.data.filter(item => item.storage === "document")
  if (input.kind === "data" && documents.length) {
    lines.push(`Its focused test also covers a failed document write: write_${documents[0]!.base} to a target whose parent directory is missing or is not a directory returns AppError invalid and creates nothing, and a failure after an existing target was chosen leaves that file's bytes identical.`)
  }
  if (input.kind === "lifecycle") {
    lines.push(`src-tauri/src/platform/lifecyclecoordinator.rs holds the launch and exit sequence the lifecycle contracts name: ${input.hasRecords ? "a launch function that runs database::open and database::migrate and returns the AppError instead of a half-initialized state, and " : "a launch function that creates no file until a feature needs one, and "}an exit function that ${input.hasRecords ? "drops the connection and " : ""}removes the app's temporary files. Its tests ${input.hasRecords ? "open and migrate a store in a temporary directory, close it, reopen it, and assert the same user_version, and assert that opening a path that is a file returns an error and leaves nothing behind" : "run launch and exit in a temporary directory and assert nothing is left behind"}. It adds no plugin or capability, so Cargo.toml and capabilities/default.json stay unchanged.`)
  }
  if (input.kind === "permission" && documents.length) {
    lines.push("src-tauri/src/platform/permissioncoordinator.rs holds the two path helpers every document command uses, existing_file(path) and save_target(path) (each canonicalizes as the filesystem contract states and returns AppError invalid for a missing target, a missing or non-directory parent, or a directory where a file is needed). TASK-02 runs first and may canonicalize inline: move that code into these helpers and make the document commands call them, then test the helpers in a temporary directory. No plugin or capability is added; the dialog plugin is already initialized and granted by the kit.")
  }
  if (input.kind === "packaging") {
    lines.push("src-tauri/src/platform/packaging.rs holds the runtime wiring check: a function that reads src-tauri/src/lib.rs, Cargo.toml, tauri.conf.json and capabilities/default.json and returns one message per violated CON-RUNTIME-WIRING rule (a #[tauri::command] missing from generate_handler!, a tauri-plugin crate that is not initialized, a window label missing from the capability file, a test double in a production file). src-tauri/tests/packaging_tests.rs asserts it returns nothing and builds app_builder(mock_builder()) with the app's context to call every data-store command through get_ipc_response, as kit_tests.rs does. The hands-on launch check cannot run under cargo: after the validation commands pass, run it by hand as CON-RUNTIME-WIRING states.")
  }
  if (input.kind === "feature") {
    if (input.slots === "first") {
      lines.push(`${input.entryForm ? "The detail view is also the entry form and the only editor: it opens empty from the add-entry control and prefilled for the selected record, with a confirm control, a cancel control, and one message slot; the add and edit feature tasks only wire confirm to their create and update commands. " : ""}You also own the one load of every record list at launch and the single message shown when that load fails, with its retry action; keep the loaded state and that error in the shared view state, and later tasks neither repeat the load nor show another launch-load message.`)
    }
    if (input.slots === "later") {
      lines.push(`Read the shared view state that ${input.firstMainTask} loads once at launch and refresh it after your own writes; do not load the lists again at launch, do not show a launch-load error message (that one belongs to ${input.firstMainTask}), and do not build another editor or detail view: reuse the one it exposes. Show only the failure message of your own commands.`)
    }
    const dialogs = input.features.filter(feature => feature.userFileAccess !== "none")
    if (dialogs.length) {
      const verbs = [...(dialogs.some(saves) ? ["save"] : []), ...(dialogs.some(opens) ? ["open"] : [])]
      lines.push(`Obtain the user's path from ${verbs.map(verb => `${verb}()`).join(" and ")} of @tauri-apps/plugin-dialog, passed to your feature as an injected adapter function so its tests fake it; the dialog is not a Rust command and is the only import besides call() that this feature may use. Offer a default file name that fits the document, then call the document command with the chosen path; a cancelled dialog changes nothing and shows no error.`)
    }
    const commands = [...new Set(input.features.flatMap(feature => tauriFeatureCommands(feature, input.data)))]
    if (commands.length) {
      lines.push(`Call Rust only through the call(command, args) function exported by src/api.ts, the one typed invoke wrapper, generic over the result type (import invoke nowhere else). The commands this feature calls, all owned by OWN-DATA-STORE: ${commands.join(", ")}. Pass arguments camelCase and exactly in the TRD wire format; add no Rust command.`)
    }
    if (input.features.some(feature => tauriNeedsClock(feature, input.data))) {
      lines.push("Its time-dependent behavior and acceptance (timestamps, elapsed time, intervals, any limit stated in seconds or milliseconds) must read time only through one injected clock, a now: () => Date parameter that main.ts supplies from the real clock; its tests pass a fake clock and advance it instead of sleeping or reading Date.now() directly.")
    }
    for (const rule of new Set(input.features.map(feature => tauriDayRule(feature, input.data)).filter(Boolean))) lines.push(rule)
    if (input.shortcut && input.features.some(feature => feature.resourceIds.includes("permission:global-input"))) {
      lines.push("Register the system-wide shortcut only through registerShortcut(onPress, onFailure) from src/shortcut.ts and name no key combination yourself: DEFAULT_ACCELERATOR in src/shortcut.ts is the only place it is written. onFailure shows this feature's declared failure message through errors.show() and the in-app controls keep working; do not retry the registration.")
    }
  }
  return lines.join(" ")
}

// Preset text that depends on the blueprint and the selected options.
export function tauriSpecialize(preset: PresetContract, blueprint: NormalizedBlueprint, options: Readonly<Record<string, PresetOptionValue>>): Partial<PresetContract> {
  const http = blueprint.externalServices.length > 0 || blueprint.platformNeeds.includes("network")
  const secrets = blueprint.externalServices.some(service => service.credentialRequirement !== "none") || blueprint.domainData.some(item => item.storage === "secret")
  const records = blueprint.persistenceNeeds.some(need => need.storage === "records")
  const linux = typeof options.linuxPackaging === "string" && options.linuxPackaging.length > 0
  const overrides: { -readonly [K in keyof PresetContract]?: PresetContract[K] } = {}
  // The kit already carries every plugin, dependency, and capability grant the blueprint declares, so only
  // the packaging task touches Cargo.toml and capabilities/default.json, and only when its wiring check fails.
  // The data owner appends the first migration to database.rs, so it may modify that kit file.
  const kitOwned = new Set(["src-tauri/Cargo.toml", "src-tauri/capabilities/default.json"])
  overrides.registrationFiles = (kind, identity) => {
    const files = preset.registrationFiles?.(kind, identity) ?? [preset.registrationFile(kind, identity)]
    const wanted = kind === "packaging" ? files : files.filter(file => !kitOwned.has(file))
    return kind === "data" && records ? [...wanted, "src-tauri/src/database.rs"] : wanted
  }
  overrides.wiringManifestFiles = [...(preset.wiringManifestFiles ?? []), "src-tauri/capabilities/default.json"]
  const reopens = blueprint.features.some(feature => feature.userFileAccess === "opens" || feature.userFileAccess === "opens-and-saves")
  const filesystem = blueprint.permissionNeeds.some(item => item.capability === "filesystem")
  const settings = blueprint.domainData.some(item => item.storage === "settings")
  // No file-access feature: there is no local file boundary to state.
  if (!filesystem) overrides.fileBoundary = ""
  else if (!reopens) {
    overrides.fileBoundaryDetails = (preset.fileBoundaryDetails ?? []).map(detail => detail.replace(" or a path the app saved to reopen", ""))
    overrides.permissionPatterns = { ...preset.permissionPatterns, filesystem: preset.permissionPatterns.filesystem.replace(", including paths saved earlier to reopen,", ",") }
  }
  if (!settings) {
    overrides.persistence = {
      ...preset.persistence,
      enabledDecision: "Persistence: enabled and local-first; record collections use SQLite through a Rust repository boundary.",
      settingsPlacement: "No data object uses settings storage, so the app writes no settings file.",
    }
    // The shared wiring rule's settings-row sentence applies only when a settings screen exists.
    overrides.wiringRules = preset.wiringRules.map(rule => rule.replace(" settings are grouped rows with the label on the left and the control on the right, a switch or checkbox on the same line as its label, and a short note under each group;", ""))
  }
  if (blueprint.features.every(feature => feature.surface === "main")) {
    overrides.wiringRules = (overrides.wiringRules ?? preset.wiringRules).map(rule => rule.startsWith("Every window the app opens") ? "The app opens one window with the fixed label main, listed in the windows array of src-tauri/capabilities/default.json." : rule)
  }
  if (!http && !secrets) {
    overrides.runtimeArchitecture = [
      "The TypeScript DOM frontend owns presentation and sends typed Tauri invoke requests; Rust commands own filesystem, persistence, and platform operations behind least-privilege capabilities.",
      "Managed Rust state owns cancellable operations and returns allowlisted serializable results; frontend state never receives unrestricted paths.",
    ]
  }
  if (linux) {
    overrides.platform = "Linux (Wayland verified)"
    overrides.runtimeMode = () => "linux-desktop"
    overrides.packagingRules = [
      "Build the frontend with Vite and the native boundary with Cargo.",
      "Set tauri.conf.json productName to the locked project name.",
      "The packet targets Linux only: scripts/package_linux.sh builds the AppImage, and the installed desktop entry is validated before the launch smoke.",
      "Use least-privilege capabilities for every command and plugin.",
      "Verify the AppImage before the launch smoke.",
    ]
    overrides.installationDecision = () => "For local proof, run ./scripts/package_linux.sh --install: it builds the AppImage, installs it under ~/.local/bin with a desktop entry and icon, and keeps the previous AppImage in dist/rollback/ as the rollback copy; then launch the installed identity."
    overrides.signingDecision = () => "Local proof is unsigned. Record the SHA-256 checksum of the built AppImage in the completion report."
    overrides.outputArtifact = "Linux AppImage"
    overrides.artifactPath = identity => `dist/${identity.slug}.AppImage`
    overrides.completionEvidence = [
      "TypeScript, Vitest, Rust format, Clippy, and Cargo tests pass.",
      "npm run tauri -- build --no-bundle compiles the release binary with the locked capabilities.",
      "scripts/package_linux.sh builds the AppImage, which installs and launches.",
      "Local data and temporary-resource cleanup survive a restart smoke.",
    ]
    overrides.validationCommands = [...preset.validationCommands, () => "./scripts/package_linux.sh"]
  }
  return overrides
}
