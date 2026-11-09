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
  readonly dataOperations: readonly DataOperation[]
  readonly userFileAccess: FileAccess
  readonly resourceIds: readonly string[]
  readonly runsEverySeconds: number | null
  readonly runsDailyAt: string | null
}

export interface TauriData {
  readonly name: string
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
  "date-time": "String",
  "text-list": "list of String",
  reference: "i64",
}

const snake = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "value"
const rustField = (field: DataField): string => `${snake(field.name)}: ${field.optional ? `Option(${RUST_TYPE[field.valueType]})` : RUST_TYPE[field.valueType]}`
const saves = (feature: TauriFeatureUse): boolean => feature.userFileAccess === "saves" || feature.userFileAccess === "opens-and-saves"
const opens = (feature: TauriFeatureUse): boolean => feature.userFileAccess === "opens" || feature.userFileAccess === "opens-and-saves"

// Stated once, at the top of the TRD data contracts, for every Tauri command.
export const TAURI_WIRE_FORMAT = "Wire format (every Tauri command of every data object, stated once here): ids are i64 numbers; whole numbers are i64, numbers are f64, flags are booleans; date-time values are RFC3339 UTC strings (for example 2026-01-31T09:30:00Z), created and compared as UTC and converted to local time only for display; a text-list is an array of strings; an optional field is a Rust Option and is sent and received as null when absent, never as an omitted key, an empty string, or a sentinel value; record keys are the snake_case field names, and top-level command arguments are written camelCase from TypeScript (Tauri maps them to snake_case); every failure is the AppError enum serialized as {kind: storage | not-found | invalid, message}, never a raw string. A list command takes no arguments and returns every record by descending id; no declared feature needs a range or limit filter, so a feature that needs a subset (such as one day or one week) filters the returned array in TypeScript."

// A feature that saves a document writes only that file; the records it exports are read, not created.
export function tauriFeatureOps(storage: string, feature: TauriFeatureUse, documentResources: ReadonlySet<string>): readonly DataOperation[] {
  if (storage !== "document" && saves(feature) && feature.dataOperations.length && feature.resourceIds.some(id => documentResources.has(id))) return ["read"]
  return feature.dataOperations
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
    [`update_${base}`]: `update_${base}(id: i64, input: ${record}Input) returns the updated ${record} and replaces every field with input, where null clears an optional field`,
    [`delete_${base}`]: `delete_${base}(id: i64) returns nothing`,
  }
  const optional = data.fields.filter(field => field.optional)
  return [
    `Interface: OWN-DATA-STORE owns every Tauri command for ${data.name}, registers them in src-tauri/src/lib.rs, and appends one migration that creates the table to database::MIGRATIONS in src-tauri/src/database.rs (a text-list column holds a JSON array); it never hard-codes the schema version.`,
    `Rust shapes: struct ${record} { id: i64, ${data.fields.map(rustField).join(", ")} } and struct ${record}Input with the same fields without id, both deriving Serialize, Deserialize, Clone, Debug, PartialEq.`,
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
    ...(writers.length ? [`write_${data.base}(path: String, content: String) returns nothing (${ids(writers)}): path is the target the user chose in the Save dialog and may not exist yet, so Rust canonicalizes its parent directory (it must exist and be a directory, otherwise AppError invalid), joins the file name onto it, writes the content to a temporary file in that directory, syncs it, and renames it over the target; a failure removes the temporary file and leaves an existing target untouched; the feature builds the content string in TypeScript from its own data`] : []),
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
    return tauriStoreCommands(item.base, tauriFeatureOps(item.storage, feature, documents)).map(name => signatures[name.split("_")[0]!]!)
  })
}

// Time-dependent behavior is declared: a schedule, or a record with a date-time field.
export function tauriNeedsClock(feature: TauriFeatureUse, data: readonly TauriData[]): boolean {
  return feature.runsEverySeconds !== null || feature.runsDailyAt !== null
    || data.some(item => item.storage === "records" && feature.resourceIds.includes(item.resource) && item.fields.some(field => field.valueType === "date-time"))
}

export interface TauriTaskInput {
  readonly kind: OwnerKind | "foundation"
  readonly features: readonly TauriFeatureUse[]
  readonly data: readonly TauriData[]
  readonly hasRecords: boolean
  readonly shortcut: boolean
  // Foundation only: listed files that are not part of the kit.
  readonly ownFiles?: readonly string[]
}

export function tauriTaskPrompt(input: TauriTaskInput): string {
  const lines: string[] = []
  if (input.kind === "foundation") {
    lines.push(`Every listed file that the kit also contains is already in place from the copy step: leave its content as copied and do not recreate it. The only files you create here are: ${input.ownFiles?.join(", ") || "none"}. Finish with npm run build and then cargo test, because the kit tests need the built frontend in dist.`)
  }
  if (input.kind === "data" && input.hasRecords) {
    lines.push("Follow the Wire format block at the top of the TRD Data Contracts exactly. Put the table's SQL in the migration list in src-tauri/src/database.rs; src-tauri/tests/kit_tests.rs compares schema_version with database::MIGRATIONS.len(), so it needs no version edit.")
  }
  if (input.kind === "packaging") {
    lines.push("src-tauri/src/platform/packaging.rs holds the runtime wiring check: a function that reads src-tauri/src/lib.rs, Cargo.toml, tauri.conf.json and capabilities/default.json and returns one message per violated CON-RUNTIME-WIRING rule (a #[tauri::command] missing from generate_handler!, a tauri-plugin crate that is not initialized, a window label missing from the capability file, a test double in a production file). src-tauri/tests/packaging_tests.rs asserts it returns nothing and builds app_builder(mock_builder()) with the app's context to call every data-store command through get_ipc_response, as kit_tests.rs does. The hands-on launch check cannot run under cargo: after the validation commands pass, run it by hand as CON-RUNTIME-WIRING states.")
  }
  if (input.kind === "feature") {
    const commands = [...new Set(input.features.flatMap(feature => tauriFeatureCommands(feature, input.data)))]
    if (commands.length) {
      lines.push(`Call Rust only through the call(command, args) function exported by src/api.ts, the one typed invoke wrapper, generic over the result type (import invoke nowhere else). The commands this feature calls, all owned by OWN-DATA-STORE: ${commands.join(", ")}. Pass arguments camelCase and exactly in the TRD wire format; add no Rust command.`)
    }
    if (input.features.some(feature => tauriNeedsClock(feature, input.data))) {
      lines.push("Its time-dependent behavior and acceptance (timestamps, elapsed time, intervals, any limit stated in seconds or milliseconds) must read time only through one injected clock, a now: () => Date parameter that main.ts supplies from the real clock; its tests pass a fake clock and advance it instead of sleeping or reading Date.now() directly.")
    }
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
  // The data owner appends the first migration to database.rs, so it may modify that kit file.
  if (records) {
    overrides.registrationFiles = (kind, identity) => {
      const files = preset.registrationFiles?.(kind, identity) ?? [preset.registrationFile(kind, identity)]
      return kind === "data" ? [...files, "src-tauri/src/database.rs"] : files
    }
  }
  if (!http && !secrets) {
    overrides.runtimeArchitecture = [
      "The TypeScript DOM frontend owns presentation and sends typed Tauri invoke requests; Rust commands own filesystem, persistence, and platform operations behind least-privilege capabilities.",
      "Managed Rust state owns cancellable operations and returns allowlisted serializable results; frontend state never receives unrestricted paths.",
    ]
  }
  if (linux) {
    overrides.platform = "Linux (Wayland verified)"
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
