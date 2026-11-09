import type { DataField, DataOperation, NormalizedBlueprint } from "./compiler"
import type { OwnerKind, PresetContract, PresetOptionValue } from "./presets"
import { clockInitial, type DataValueType, type FeatureRecovery } from "./schema"

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
  readonly failureRecovery: FeatureRecovery
  readonly invokedBy: string
  // The feature edits stored fields in a form (declared 'edit'); a mark or toggle 'update' does not.
  readonly editsRecords: boolean
  // The feature shows the current time of day (declared showsCurrentTime), so it reads an injected clock and refreshes.
  readonly showsCurrentTime?: boolean
  // The feature selects or counts records by the current calendar day (declared readsCurrentDay), so it reads the injected clock on every render.
  readonly readsCurrentDay?: boolean
  // The feature shows a value that changes by itself every N seconds (a countdown), so it owns an injectable tick.
  readonly refreshesEverySeconds?: number | null
  // Rendered "Name: option, option; initially X" lines of the feature's declared choice lists.
  readonly choices: readonly string[]
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
  time: "String",
  "text-list": "list of String",
  reference: "i64",
}

const SQL_TYPE: Record<DataValueType, string> = { text: "TEXT", "long-text": "TEXT", number: "REAL", "whole-number": "INTEGER", flag: "INTEGER", date: "TEXT", "date-time": "TEXT", time: "TEXT", "text-list": "TEXT", reference: "INTEGER" }
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

// What Rust itself rejects, from the declared fields only; a feature's own value rules (a minimum, a fixed set) belong to its form.
function validation(data: TauriData): string {
  const required = data.fields.filter(field => !field.optional && (field.valueType === "text" || field.valueType === "long-text"))
  const days = data.fields.filter(field => field.valueType === "date")
  const stamps = data.fields.filter(field => field.valueType === "date-time")
  const numbers = data.fields.filter(field => field.valueType === "number")
  const rules = [
    ...(required.length ? [`an empty or whitespace-only required text field (${required.map(field => snake(field.name)).join(", ")}; Rust stores the value as given, so the form trims every text input before it validates and sends the trimmed value)`] : []),
    ...(days.length ? [`a date (${days.map(field => snake(field.name)).join(", ")}) that is not a real YYYY-MM-DD calendar day`] : []),
    ...(stamps.length ? [`a date-time (${stamps.map(field => snake(field.name)).join(", ")}) that is not an RFC3339 UTC string (parsed with the time crate: time::OffsetDateTime::parse(value, &Rfc3339), the offset must be UTC, fractional seconds are accepted)`] : []),
    ...(numbers.length ? [`a number (${numbers.map(field => snake(field.name)).join(", ")}) that is not finite (NaN or infinity; the form also rejects text that parses to one)`] : []),
  ]
  return `Validation: create and update return AppError invalid for ${rules.length ? rules.join(", ") : "a body that does not match the Rust shape"}; any other value rule a feature states (a minimum, a fixed set of options) is checked by that feature's form before it calls the command, and Rust checks only what is listed here.`
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
    [`update_${base}`]: `update_${base}(id: i64, input: ${record}Input) returns the updated ${record} and replaces every field with input, so the caller sends the stored value of each field it does not change${data.fields.some(field => field.optional) ? " and null only to clear an optional field" : ""}`,
    [`delete_${base}`]: `delete_${base}(id: i64) returns nothing`,
  }
  const optional = data.fields.filter(field => field.optional)
  const appSet = data.fields.filter(appSets)
  const clocked = data.fields.filter(clockSet)
  return [
    `Interface: OWN-DATA-STORE owns every Tauri command for ${data.name}, registers them in src-tauri/src/lib.rs, and appends one migration that creates the table to database::MIGRATIONS in src-tauri/src/database.rs${data.fields.some(field => field.valueType === "text-list") ? " (a text-list column holds a JSON array)" : ""}; it never hard-codes the schema version.`,
    `Table: CREATE TABLE ${base} (id INTEGER PRIMARY KEY AUTOINCREMENT${data.fields.map(field => `, ${snake(field.name)} ${SQL_TYPE[field.valueType]}${field.optional ? "" : " NOT NULL"}`).join("")}); ${data.fields.some(field => field.valueType === "flag") ? "a flag column holds 0 or 1; " : ""}${data.fields.some(field => field.valueType === "text-list") ? "a text-list column holds a JSON array; " : ""}the list command orders by id DESC.`,
    `Rust shapes: struct ${record} { id: i64, ${data.fields.map(rustField).join(", ")} } and struct ${record}Input with the same fields without id, both deriving Serialize, Deserialize, Clone, Debug, PartialEq; the JSON keys on the wire are exactly id${data.fields.map(field => `, ${snake(field.name)}`).join("")}, so TypeScript reads and writes those keys and no camelCase variant${data.fields.some(keyDiffers) ? ` (${data.fields.filter(keyDiffers).map(field => `the stored field ${field.name} is the key ${snake(field.name)}`).join("; ")})` : ""}.`,
    `Commands, exactly: ${tauriStoreCommands(base, operations).map(name => signatures[name]).join("; ")}. Each returns the AppError enum on failure (not-found for an unknown id); feature tasks reach them only through the call(command, args) wrapper in src/api.ts and add no Rust command of their own.`,
    validation(data),
    ...(appSet.length ? [`Stored versus derived: ${appSet.map(field => `${snake(field.name)} is set to "${field.initial}" by the app on create and never typed by the user`).join("; ")}; a stored field holds only what the user entered or an action set, and a state that follows from time passing is derived for display from the stored timestamps and the injected clock, never persisted.`] : []),
    ...(clocked.length ? [`Clock-set on create: ${clocked.map(field => `${snake(field.name)} is ${field.valueType === "date" ? "today's local day as YYYY-MM-DD" : "the current moment as an RFC3339 UTC string"} from the injected clock`).join("; ")}; the create caller stamps it, it is never typed by the user, and an update carries the stored value back unchanged.`] : []),
    ...(optional.length ? [`Optional: ${optional.map(field => snake(field.name)).join(", ")} ${optional.length === 1 ? "is" : "are"} declared as a Rust Option in ${record} and ${record}Input; a record whose optional value is null is saved and reloaded unchanged, and quitting or relaunching never fills in, edits, or deletes it.`] : []),
  ].join(" ")
}

// A document is a file the user picks, not a record: no id, no list, get, or create command.
export function tauriDocumentInterface(data: TauriData, users: readonly TauriFeatureUse[]): string {
  const writers = users.filter(saves)
  const readers = users.filter(opens)
  const ids = (list: readonly TauriFeatureUse[]) => list.map(feature => feature.id).join(", ")
  const parts = [
    ...(writers.length ? [`write_${data.base}(path: String, content: String) returns nothing (${ids(writers)}): path is the target the user chose in the Save dialog and may not exist yet, so Rust canonicalizes its parent directory (it must exist and be a directory, otherwise AppError invalid), joins the file name onto it, writes the content to a temporary file in that directory, syncs it, and renames it over the target; a failure removes the temporary file and leaves an existing target untouched; the feature that saves it owns the file's layout and builds the whole content string in TypeScript from its own data in the layout its behavior states, writing every date or time it shows in local time (the stored UTC value converted; this is the one time rule for every exported file; its test sets TZ or injects the offset so the exported bytes are deterministic); OWN-DATA-STORE only writes the string it is given`] : []),
    ...(readers.length || !writers.length ? [`read_${data.base}(path: String) returns the file text (${ids(readers)}): path is a file the user chose in the Open dialog or a saved path to reopen; Rust canonicalizes it, requires a regular file, and returns its text`] : []),
  ]
  return `Interface: ${data.name} is a file the user chooses, not a record: it has no id and no list, get, create, update, or delete command. OWN-DATA-STORE owns exactly these Tauri commands and registers them in src-tauri/src/lib.rs: ${parts.join("; ")}.`
}

// The Rust commands a feature calls, so its task names every export it uses.
// The getter is listed only when a detail view needs it: the selected record is otherwise already in the shared view state.
export function tauriFeatureCommands(feature: TauriFeatureUse, data: readonly TauriData[], withGet = true): string[] {
  const documents = new Set(data.filter(item => item.storage === "document").map(item => item.resource))
  return data.filter(item => feature.resourceIds.includes(item.resource)).flatMap(item => {
    if (item.storage === "document") return [...(saves(feature) ? [`write_${item.base}(path, content)`] : []), ...(opens(feature) || !saves(feature) ? [`read_${item.base}(path)`] : [])]
    if (item.storage === "settings") return ["load_settings()", "save_settings(next)"]
    if (item.storage !== "records" || !item.fields.length) return []
    const signatures: Record<string, string> = { create: `create_${item.base}(input)`, list: `list_${item.base}()`, get: `get_${item.base}(id)`, update: `update_${item.base}(id, input)`, delete: `delete_${item.base}(id)` }
    return tauriStoreCommands(item.base, tauriFeatureOps(item.storage, feature.operationsByData[item.key] ?? [], feature, documents)).filter(name => withGet || !name.startsWith("get_")).map(name => signatures[name.split("_")[0]!]!)
  })
}

// The record fields of a given type in the data objects a feature uses.
function usedFields(feature: TauriFeatureUse, data: readonly TauriData[], valueType: DataValueType): { item: TauriData; field: DataField }[] {
  return data.filter(item => item.storage === "records" && feature.resourceIds.includes(item.resource)).flatMap(item => item.fields.filter(field => field.valueType === valueType).map(field => ({ item, field })))
}

// Only a create stamps a date-time: an update, a mark, or a form edit carries the stored date-time back unchanged (a form has no date-time input).
const writes = (feature: TauriFeatureUse, item: TauriData): boolean => (feature.operationsByData[item.key] ?? []).includes("create")

// Time-dependent behavior is declared: a schedule, a calendar-day field (any feature that uses it needs
// today), or a date-time field the feature writes (it stamps the time). Reading a stored date-time
// for display needs no clock.
export function tauriNeedsClock(feature: TauriFeatureUse, data: readonly TauriData[]): boolean {
  return feature.runsEverySeconds !== null || feature.runsDailyAt !== null || feature.showsCurrentTime === true || feature.readsCurrentDay === true || feature.refreshesEverySeconds != null
    || stampsDay(feature, data)
    || usedFields(feature, data, "date-time").some(({ item }) => writes(feature, item))
}

// A date the app stamped at creation (clock-initial) that this feature only shows or sends back unchanged needs no clock; any other date it uses may be compared with today.
const liveDays = (feature: TauriFeatureUse, data: readonly TauriData[]) => usedFields(feature, data, "date").filter(({ item, field }) => !clockSet(field) || writes(feature, item))
const stampsDay = (feature: TauriFeatureUse, data: readonly TauriData[]): boolean => liveDays(feature, data).length > 0

// Calendar days are local YYYY-MM-DD strings; today comes from the injected clock and day logic compares the strings.
export function tauriDayRule(feature: TauriFeatureUse, data: readonly TauriData[]): string {
  const days = liveDays(feature, data)
  if (!days.length) return ""
  return `Calendar-day field${days.length === 1 ? "" : "s"} (${days.map(({ item, field }) => `${item.name}.${snake(field.name)}`).join(", ")}) ${days.length === 1 ? "holds" : "hold"} the user's local YYYY-MM-DD day as a string: derive today from the injected clock's local year, month, and day (never from toISOString() or any UTC value), and decide equality and ordering only by comparing those strings, and do any day arithmetic (the previous or next day, the days between) on calendar dates, not by subtracting 24 hours. Its tests fix the clock and cover a day boundary near local midnight.`
}

// A date-time field is stamped from the clock and a flag is set by the feature's own behavior, so neither is a form input unless a declared choice list names the flag.
// A stored field name whose wire key is spelled differently from its name beyond the first letter's case (phoneNumber is phonenumber).
const keyDiffers = (field: DataField): boolean => field.name !== snake(field.name) && field.name.charAt(0).toLowerCase() + field.name.slice(1) !== snake(field.name)
const appSets = (field: DataField): boolean => field.initial != null && field.initial !== "" && !clockInitial(field)
const clockSet = (field: DataField): boolean => clockInitial(field) !== null
const formFieldsOf = (item: TauriData, choiceNames: ReadonlySet<string>) => item.fields.filter(field => field.valueType !== "date-time" && !appSets(field) && !clockSet(field) && (field.valueType !== "flag" || choiceNames.has(snake(field.name))))
const choiceNamesOf = (features: readonly TauriFeatureUse[]) => new Set(features.flatMap(feature => feature.choices.map(choice => snake(choice.split(":")[0]!))))
// Features that create a record without also updating it (a start and stop timer drives its own controls).
const recordWriters = (features: readonly TauriFeatureUse[], data: readonly TauriData[]) => {
  const recordKeys = new Set(data.filter(item => item.storage === "records").map(item => item.key))
  return features.filter(feature => Object.entries(feature.operationsByData).some(([key, operations]) => recordKeys.has(key) && operations.includes("create") && !operations.includes("update")))
}
// False when the record an add feature creates has no stored field that takes user input: the add control then creates it directly.
export function tauriAddHasForm(features: readonly TauriFeatureUse[], data: readonly TauriData[]): boolean {
  const writers = recordWriters(features, data)
  const choiceNames = choiceNamesOf(writers)
  return data.some(item => item.storage === "records" && writers.some(feature => (feature.operationsByData[item.key] ?? []).includes("create")) && formFieldsOf(item, choiceNames).length > 0)
}

// A read-only feature with a declared tick (refreshesEverySeconds): a countdown. It starts per row and keeps its running state in memory.
export const isCountdown = (feature: Pick<TauriFeatureUse, "invokedBy" | "editsRecords" | "userFileAccess" | "operationsByData" | "refreshesEverySeconds">): boolean =>
  feature.refreshesEverySeconds != null && feature.invokedBy === "user-control" && !feature.editsRecords && feature.userFileAccess === "none"
  && Object.values(feature.operationsByData).length > 0 && Object.values(feature.operationsByData).every(operations => operations.every(operation => operation === "read"))

// A feature that only narrows or reorders the records already in the shared view state calls no command.
const narrowsLoadedState = (feature: TauriFeatureUse): boolean =>
  !isCountdown(feature) && feature.invokedBy === "user-control" && !feature.editsRecords && feature.userFileAccess === "none" && feature.runsEverySeconds === null && feature.runsDailyAt === null
  && !feature.resourceIds.includes("permission:global-input")
  && Object.values(feature.operationsByData).length > 0 && Object.values(feature.operationsByData).every(operations => operations.every(operation => operation === "read"))

// The slots the first main task exposes, from the declared operations (see tauriSlotHosts for their names).
export function tauriMainSlotsSentence(o: { create: boolean; directAdd: boolean; entryForm: boolean; rowArea: boolean; detail: boolean; filter: boolean; countdown?: boolean; delete?: boolean }): string {
  const slots = [
    "a status area shared by every message the main screen shows (empty state, no match; failures go through the errors banner)",
    ...(o.create ? [o.directAdd ? "an add-entry control: a button that the add task connects to the create command (no stored field takes user input, so build no entry form shell)" : o.entryForm ? 'an add-entry control (the Add button, built by you directly in the layout, with no "add" host: no later task builds or mounts an Add button) that sets the shared form state to "add", and the empty entry form shell in the "form" slot (a confirm control, a cancel control, one message slot for field validation, and a field container that the add task fills and nothing else; the add and edit tasks register their submit handlers through slots.handle)' : 'an "add" area where the add task mounts its own Add button and the form it opens; build neither the button nor a form shell'] : []),
    ...(o.rowArea ? [`a per-row action area on every list row, built with slots.row("row-actions", record) (a render hook, not one host)${o.countdown ? "; it carries the Start control and the countdown display that the countdown task renders in each row" : ""}`] : []),
    ...(o.detail ? [`a detail view for the selected record that shows every stored field read-only and holds a "detail-actions" host for the ${o.delete === false ? "Edit control" : "Edit and Delete controls"}, which the tasks declaring ${o.delete === false ? "that operation mount (build no Edit button" : "those operations mount (build no Edit or Delete button"} here); it is always built because the packet has an edit feature: every list row is selectable (activating the row selects the record, marks it aria-selected, and shows this detail view), which is how the user reaches the editor`] : []),
    ...(o.filter ? ["a filter area above the list for read-only features that narrow or reorder it"] : []),
  ]
  return `Expose exactly these named slots in the shared files, no others: ${slots.join("; ")}. Later feature tasks build their controls in their own files and mount them into these slots, editing only the shared registration files; build no control that no later task names.`
}

// The shared view state key of a records object: its declared name as a camelCase identifier ("flash cards" is flashCards).
const stateKey = (name: string): string => name.split(/[^A-Za-z0-9]+/).filter(Boolean).map((word, index) => index === 0 ? word[0]!.toLowerCase() + word.slice(1) : word[0]!.toUpperCase() + word.slice(1)).join("")

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
  // Some feature edits stored fields, so the main screen builds a detail view.
  readonly detailView?: boolean
  // First main task: the named slot hosts the screen builds (status, add, row-actions, detail, filter).
  readonly slotHosts?: readonly string[]
  // First main task: some later feature narrows the list, so the shared view state carries the control's query.
  readonly filters?: boolean
  // A read-only feature with a declared tick exists (see isCountdown); its task id owns the in-memory countdown field of the shared view state.
  readonly countdownTask?: string
  // Foundation only: listed files that are not part of the kit.
  readonly ownFiles?: readonly string[]
}

export function tauriTaskPrompt(input: TauriTaskInput): string {
  const lines: string[] = []
  if (input.kind === "foundation") {
    lines.push(`Every listed file that the kit also contains is already in place from the copy step: leave its content as copied and do not recreate it. The only files you create here are: ${input.ownFiles?.join(", ") || "none"}. The icon command in the validation list also generates src-tauri/icons/, which is output of this task and not a file to write by hand. Finish with npm run build and then cargo test, because the kit tests need the built frontend in dist-web.`)
  }
  if (input.kind === "data" && input.hasRecords) {
    lines.push("Follow the Wire format block at the top of the TRD Data Contracts exactly. Put the table's SQL in the migration list in src-tauri/src/database.rs; src-tauri/tests/kit_tests.rs compares schema_version with database::MIGRATIONS.len(), so it needs no version edit (it is listed only as the shared registration file: modify it only if a validation command fails).")
  }
  const documents = input.data.filter(item => item.storage === "document")
  if (input.kind === "data" && documents.length) {
    lines.push(`Its focused test also covers a failed document write: write_${documents[0]!.base} to a target whose parent directory is missing or is not a directory returns AppError invalid and creates nothing, and a failure after an existing target was chosen leaves that file's bytes identical. Canonicalize inline in src-tauri/src/platform/datastore.rs; the permission coordinator task later replaces that inline code with calls to its helpers, so keep it in two small functions that it can swap out.`)
  }
  if (input.kind === "lifecycle") {
    lines.push(`src-tauri/src/platform/lifecyclecoordinator.rs holds the launch and exit sequence the lifecycle contracts name: ${input.hasRecords ? "a launch(folder: &Path) function that opens the store through database::open (which already applies the migrations), drops that connection, returns nothing on success, and returns the AppError instead of a half-initialized state, and " : "a launch function that creates no file until a feature needs one, and "}${input.hasRecords ? "launch needs no folder to exist beforehand: database::open (from the kit) creates the data folder with create_dir_all before it opens records.sqlite3, so launch works on a fresh install where the app-data folder does not exist yet, and manage_state may run after it. " : ""}an exit function that ${input.data.some(item => item.storage === "temporary") ? "removes the app's temporary files" : "releases what the app holds (the app creates no temporary file)"}. run() in src-tauri/src/lib.rs calls launch(&folder) in its setup closure before manage_state (launch drops its connection; manage_state then opens its own) and exit in the RunEvent::Exit arm of the run callback; both are wired, not only defined. Its tests ${input.hasRecords ? "call launch on a subfolder of a temporary directory that does not exist yet and assert it now exists, drop the connection, call it again, and assert the same user_version, and assert that opening a path that is a file returns an error and leaves nothing behind" : "run launch and exit in a temporary directory and assert nothing is left behind"}. It adds no plugin or capability, so Cargo.toml and capabilities/default.json stay unchanged. src-tauri/tests/kit_tests.rs is listed only as the shared registration file and stays unchanged.`)
  }
  if (input.kind === "permission" && documents.length) {
    lines.push("src-tauri/src/platform/permissioncoordinator.rs holds the two path helpers every document command uses, existing_file(path) and save_target(path) (each canonicalizes as the filesystem contract states and returns AppError invalid for a missing target, a missing or non-directory parent, or a directory where a file is needed). OWN-DATA-STORE runs first and canonicalizes inline in src-tauri/src/platform/datastore.rs: your listed files include that one file so you can replace exactly that inline code with calls to your helpers (change nothing else in it; its own focused test must still pass), then test the helpers in a temporary directory. No plugin or capability is added; the dialog plugin is already initialized and granted by the kit.")
  }
  if (input.kind === "packaging") {
    lines.push("src-tauri/src/platform/packaging.rs holds the runtime wiring check: a function that reads src-tauri/src/lib.rs, Cargo.toml, tauri.conf.json and capabilities/default.json and returns one message per violated CON-RUNTIME-WIRING rule (a #[tauri::command] missing from generate_handler!, a tauri-plugin crate that is not initialized, a window label missing from the capability file, a test double in a production file). src-tauri/tests/packaging_tests.rs asserts it returns nothing and builds app_builder(mock_builder()) with the app's context to call every data-store command through get_ipc_response, as kit_tests.rs does. src-tauri/src/platform/mod.rs is the one listed shared file you always modify: it gets pub mod packaging; (the test reaches the module through it); every other listed shared file (src/main.ts, lib.rs, Cargo.toml, capabilities/default.json, kit_tests.rs) is modified only when the wiring check or a validation command fails. The hands-on launch check cannot run under cargo: after the validation commands pass, run it by hand as CON-RUNTIME-WIRING states.")
  }
  if (input.kind === "feature") {
    if (input.slots === "first") {
      const shell = input.entryForm ? `The entry form is one shell in slots.host("form"), shown whenever the shared view state's form is "add" or "edit": it holds that host (the add task mounts the field inputs and choice pickers into it), a confirm control, a cancel control, and one message slot for field validation only (it shows the PRD's validation message for a blank required field, or when the PRD states none the fixed text "Complete the required fields."; a failed save or load goes through errors.show in the page banner, where its Retry lives). Confirm calls slots.run(store.get().form) (the add task registers slots.handle("add", submit) and the edit task slots.handle("edit", submit) from src/main.ts, so one confirm serves both); cancel sets form back to "closed", and each submit handler (add, edit) sets it to "closed" itself after a successful save and leaves it open with its input when the save fails. Your add-entry control (the Add button, built directly in your layout; no later task builds or mounts one) sets form to "add"; the add task's inputs empty themselves whenever form becomes "add", so you build none; the edit task mounts the Edit button into the detail view's "detail-actions" host and it sets form to "edit". You build only the Add button and the empty shell, no field input, no Edit button, and no Delete button; the add task fills the "form" host and nothing else. ` : ""
      const detail = (input.detailView ? 'Acceptance criteria of yours that name the Edit or Delete button, or what pressing one does, are verified by the task that builds that button: your focused test asserts only the read-only detail view and its empty "detail-actions" host. ' : "No detail view is built for this packet. ") + "Acceptance criteria that name any other control a later task builds are likewise verified by that later task. "
      const recovery = input.features[0]?.failureRecovery ?? "retry"
      const loadFailure = recovery === "retry" ? "with a retry action that repeats the load (errors.show(message, reload), where reload is the load function)" : recovery === "fallback" ? "a notice given after the declared fallback has run, with no retry control" : "given after releasing partial resources, with no retry control"
      const keys = [...input.data.filter(item => item.storage === "records").map(item => `${stateKey(item.key)}: ${item.record}[]`), "loadError: string | null", ...(input.detailView ? ["selectedId: number | null"] : []), ...(input.filters ? ["query: string"] : []), ...(input.entryForm ? ['form: "closed" | "add" | "edit"'] : []), ...(input.countdownTask ? ["countdown: { id: number; startedAt: number } | null"] : [])]
      const hosts = (input.slotHosts ?? []).filter(name => name !== "row-actions").map(name => `slots.host("${name}")`)
      const rowArea = (input.slotHosts ?? []).includes("row-actions") ? ` Build the per-row action area with slots.row("row-actions", record) (not a host): call it inside every list row on every render with that row's record and append the element it returns; a later task registers its row control with slots.mountRow("row-actions", render) from src/main.ts, and slots.row calls render(record) for each row, so a control re-renders with its row and reads the record it is given.` : ""
      lines.push(`Build the shared view state with createStore from src/store.ts (kit) and export it from your file: its shape is { ${keys.join(", ")} }${input.countdownTask ? ` (countdown is in memory only, initially null, never saved, and written only by ${input.countdownTask}; the shape is not otherwise extended)` : ""}. Every task changes it only through store.set and every view re-renders from store.subscribe, so one change shows in the list, status area, and detail view at once${input.filters ? "; the filter feature writes query and your list applies the stated match rule to it itself, with the stated no-match message; the acceptance criteria that say which records match and what the no-match text is are tested in your focused test by setting query with store.set, and the filter task's own test covers only that its control writes query" : ""}. Build the screen with createSlots from src/store.ts and place ${hosts.join(", ") || "no host"} in the layout: those hosts are the only extension points, a later task adds its control with slots.mount(name, element) from src/main.ts and never edits your file, and you export the store and slots for src/main.ts to pass on.${rowArea} Show the empty list with emptyState(title) from src/ui.ts using the PRD's text exactly as the title and no hint unless the PRD states one${input.filters ? "; a filter over zero saved records shows that empty-list text, not the no-match text" : ""}. Sort the rows yourself, never by the command's order (list commands return descending id): by the field and direction the PRD states, ties broken by id in the same direction.`)
      lines.push(`${shell}${detail}You also own the one load of every record list at launch and the single message shown when that load fails, ${loadFailure}; keep the loaded state and that error in the shared view state, and later tasks neither repeat the load nor show another launch-load message.`)
    }
    if (input.slots === "later") {
      const ownsForm = recordWriters(input.features, input.data).length > 0 && !input.entryForm && tauriAddHasForm(input.features, input.data)
      // A feature with no command of its own writes nothing, so it refreshes nothing and shows no command failure.
      const local = input.features.length > 0 && input.features.every(feature => narrowsLoadedState(feature) || isCountdown(feature))
      lines.push(`Read the shared view state that ${input.firstMainTask} loads once at launch${local ? ", never calling a list command" : " and refresh it after your own writes by patching it with the record your command returns (after a delete, remove that id), never by calling a list command"}; do not load the lists again at launch, do not show a launch-load error message (that one belongs to ${input.firstMainTask}), ${input.detailView || input.entryForm ? `and do not build another detail view${input.entryForm ? " or entry-form shell: reuse the ones it exposes" : ": reuse the one it exposes"}` : `and build no detail view${ownsForm ? "" : " or form shell"} (the packet has none)`}.${input.features.every(isCountdown) ? "" : " Mount your control with slots.mount from src/main.ts."}${local ? "" : " Show only the failure message of your own commands."}`)
    }
    const writers = recordWriters(input.features, input.data)
    const formFields = formFieldsOf
    const noInput = (items: readonly TauriData[], choiceNames: ReadonlySet<string>) => items.flatMap(item => item.fields.filter(field => field.valueType === "flag" && !choiceNames.has(snake(field.name))).map(field => snake(field.name)))
    const flagRule = (flags: readonly string[], verb: string) => flags.length ? ` ${flags.join(", ")} (flag) ${flags.length === 1 ? "is" : "are"} no input: ${verb}` : ""
    if (writers.length) {
      const created = input.data.filter(item => item.storage === "records" && writers.some(feature => (feature.operationsByData[item.key] ?? []).includes("create")))
      const choiceNames = choiceNamesOf(writers)
      const fields = created.flatMap(item => formFields(item, choiceNames).map(field => `${snake(field.name)} (${field.valueType})`))
      const choices = [...new Set(writers.flatMap(feature => feature.choices))]
      const stamps = created.flatMap(item => item.fields.filter(field => field.valueType === "date-time").map(field => snake(field.name)))
      const stampedDays = created.flatMap(item => item.fields.filter(field => field.valueType === "date" && clockSet(field)).map(field => snake(field.name)))
      const dayRule = stampedDays.length ? ` ${stampedDays.join(", ")} (date, declared initial today) is no input: create stamps today's local day from the injected now, and an edit sends the stored value unchanged.` : ""
      const preset = created.flatMap(item => item.fields.filter(appSets).map(field => `${snake(field.name)} = "${field.initial}"`))
      const presetRule = (preset.length ? ` The app sets ${preset.join(", ")} itself on create (no input; the value is a constant of your file) and never lets the user type it.` : "") + dayRule
      if (!fields.length) {
        lines.push(`No stored field takes user input, so this feature has no entry form: build no form, no form shell, and no input. Its add-entry control is a button that calls the create command directly with the values your behavior states${stamps.length ? ` (${stamps.join(", ")} stamped from the injected clock at that moment)` : ""}, and a failed create shows the PRD's message with a retry that presses it again.${presetRule}${flagRule(noInput(created, choiceNames), "create sends the initial value your behavior states (false when it states none).")}`)
      } else lines.push(`Build the entry form's field inputs here, one per stored field that takes user input (${fields.join(", ")}) and no others${stamps.length ? `; a date-time field (${stamps.join(", ")}) is stamped from the injected clock` : ""}${choices.length ? `; build each declared choice list as a picker that lists exactly its options and opens with its initial option selected (${choices.join("; ")})` : ""}.${presetRule}${flagRule(noInput(created, choiceNames), "create sends the initial value your behavior states (false when it states none), and an edit sends the stored value unchanged.")}${input.entryForm ? ' Mount the inputs into slots.host("form") from src/main.ts, register slots.handle("add", submit) there (after a successful save it sets form to "closed"), and export the fields, their validation, and a function that prefills them from a record for the edit task to reuse. The first main task builds the Add button and the empty form shell: you build neither and fill the "form" host only, and your inputs clear themselves whenever the shared view state\'s form becomes "add". The form trims every text input, so an acceptance criterion that says a saved record has the entered values means the trimmed values.' : ` You own the whole add flow because the shared screen has no form shell: build the Add button, the form container it opens (closed by its cancel control and after a successful save) and the inputs, and mount the button into slots.host("add") from src/main.ts.`}`)
    }
    const editors = input.features.filter(feature => feature.editsRecords && Object.values(feature.operationsByData).some(operations => operations.includes("update")) && !writers.includes(feature) && feature.invokedBy !== "shortcut" && feature.invokedBy !== "schedule" && !feature.resourceIds.includes("permission:global-input"))
    // A stamped field is no form input, so the edit form shows the stored value read-only and sends it back unchanged.
    const stampedShown = (items: readonly TauriData[]): string => {
      const names = items.flatMap(item => item.fields.filter(field => field.valueType === "date-time" || (field.valueType === "date" && clockSet(field))).map(field => snake(field.name)))
      return names.length ? ` The edit form also shows ${names.join(", ")} (stamped by the app at creation) read-only: build a non-input display (plain text, no input element) that you mount into the form${input.entryForm ? ' host (slots.host("form"))' : ""} and that shows only while the shared view state's form is "edit", with the selected record's stored value formatted for the user; the update sends the stored value back unchanged, and your focused test asserts that display while form is "edit" and that it is absent while form is "add".` : ""
    }
    if (editors.length && input.entryForm) {
      const edited = input.data.filter(item => item.storage === "records" && editors.some(feature => (feature.operationsByData[item.key] ?? []).includes("update")))
      lines.push(`Build the Edit button and mount it into slots.host("detail-actions") from src/main.ts (the first main task builds none): pressing it sets the shared view state's form to "edit" and prefills the shared entry form for the selected record with the add task's prefill function (every input from the record${[...writers, ...editors].some(feature => feature.choices.length) ? ", every choice picker set to the stored option, not the list's initial one" : ""}); register slots.handle("edit", submit) so the shell's confirm calls the update command and, after a successful save, the handler sets form to "closed". Acceptance criteria that name the Edit button, or what pressing it does, are verified here, in your focused test.${flagRule(noInput(edited, choiceNamesOf(editors)), "the form leaves it unchanged and the update sends its stored value.")}${stampedShown(edited)}`)
    } else if (editors.length && input.slots === "later") {
      const edited = input.data.filter(item => item.storage === "records" && editors.some(feature => (feature.operationsByData[item.key] ?? []).includes("update")))
      const choiceNames = choiceNamesOf(editors)
      lines.push(`No task builds an add form, so build the edit form in your own file: one input per stored field of the record you update that takes user input (${edited.flatMap(item => formFields(item, choiceNames).map(field => snake(field.name))).join(", ")}), every choice picker preselecting the stored option${editors.some(feature => feature.choices.length) ? ` (${[...new Set(editors.flatMap(feature => feature.choices))].join("; ")})` : ""}, opened by an Edit button that you mount into slots.host("detail-actions") from src/main.ts (the first main task builds none); confirm calls the update command and, after a successful save, closes the form.${flagRule(noInput(edited, choiceNames), "the form leaves it unchanged and the update sends its stored value.")}${stampedShown(edited)}`)
    }
    const updaters = input.data.filter(item => item.storage === "records" && item.fields.length && input.features.some(feature => (feature.operationsByData[item.key] ?? []).includes("update")))
    if (updaters.length) {
      lines.push(`update_${updaters.map(item => item.base).join("/update_")} replaces every field, so every update you send carries the full stored record (every field of the shared view state's record) with only the field your behavior changes replaced.`)
    }
    const failures = new Map<FeatureRecovery, string[]>()
    for (const feature of input.features) failures.set(feature.failureRecovery, [...(failures.get(feature.failureRecovery) ?? []), feature.id])
    const failureRules: Record<FeatureRecovery, string> = {
      retry: "on a failed command leave the stored and shown state as it was (a form keeps its input, a running activity stays running until its stop is saved, an unsaved change stays pending) and show one message with a retry action that repeats the same command with the same input: pass errors.show(message, repeat) a repeat function that sends the command again (the banner renders its Retry button)",
      fallback: "on a failed command apply the stated fallback automatically, keep the feature usable, and show one notice with no retry control",
      exit: "on a failed command release partial resources and show one message with no retry control; a relaunch starts clean",
    }
    const localOnly = input.slots === "later" && input.features.length > 0 && input.features.every(narrowsLoadedState)
    const changes = (operation: DataOperation) => input.features.some(feature => Object.values(feature.operationsByData).some(operations => operations.includes(operation)))
    // One fixed notice when the PRD states no message for a failed write, the way the GTK preset gives a toast.
    const writeNotice = changes("create") || changes("update") || changes("delete") ? ` Where the PRD states no message for a failed ${changes("delete") && !changes("create") && !changes("update") ? "delete" : "write"}, show the fixed notice "${changes("delete") && !changes("create") && !changes("update") ? "Could not remove the item. Try again." : "Could not save the change. Try again."}"${changes("delete") && (changes("create") || changes("update")) ? ' ("Could not remove the item. Try again." for a delete)' : ""} through errors.show(message, repeat) the same way.` : ""
    // A mark, start, or delete control sits in each list row when no detail view holds it.
    const rowFeature = input.slots === "later" && input.features.some(feature => Object.values(feature.operationsByData).some(operations => (operations.includes("update") && !feature.editsRecords && !operations.includes("create")) || (operations.includes("delete") && input.detailView !== true)))
    if (rowFeature) lines.push('Your control is a per-row control: register slots.mountRow("row-actions", render) from src/main.ts, where render(record) returns the control for that row and the list calls it on every re-render, so read the record it is given, never a captured one. A failure message the PRD places in the row renders inside that control next to a Retry button that repeats the command (errors.show is for messages not tied to a row).')
    const countdownOnly = input.slots === "later" && input.features.length > 0 && input.features.every(isCountdown)
    if (countdownOnly) {
      lines.push(`This feature is a countdown: it calls no Rust command, saves nothing, and has no failure path (show no error message or notice). Instead of mounting one control, register slots.mountRow("row-actions", render) from src/main.ts: render(record) returns that row's Start button and that row's countdown display, so both live in the per-row action area ${input.firstMainTask} builds and re-render with the row (the list calls render on every re-render). The display shows the idle text the PRD states for a row that is not running (the stored duration when it states none) and, for the running row, the countdown readout and the PRD's finished text at zero. Starting a row sets the shared view state's countdown field (declared by ${input.firstMainTask}, the only field you write): { id: that record's id, startedAt: now().getTime() }, which replaces any running countdown; no record is written. A running countdown whose record is no longer in the shared view state's records (it was deleted) is cleared on the next tick or render; an edit leaves it unchanged.`)
    } else if (localOnly) {
      lines.push("This feature calls no Rust command: it narrows or reorders the records already in the shared view state by writing its control's value with store.set, so it has no failure path: show no error message or notice, and keep the previous results if a value cannot be applied.")
    } else lines.push(`Declared failure recovery: ${[...failures].map(([recovery, ids]) => `${failures.size > 1 ? `${ids.join(", ")} (${recovery}) ` : `${recovery}: `}${failureRules[recovery]}`).join("; ")}. Show every failure message the PRD states for your feature exactly as written, through errors.show(message) (or where the feature places it: in the form, in the row, the status area, or the confirmation), never through errors.report(): the PRD's fixed strings win over the AppError message, which a rejected call carries and you ignore.${writeNotice}`)
    const dialogs = input.features.filter(feature => feature.userFileAccess !== "none")
    if (dialogs.length) {
      const verbs = [...(dialogs.some(saves) ? ["save"] : []), ...(dialogs.some(opens) ? ["open"] : [])]
      lines.push(`Obtain the user's path from ${verbs.map(verb => `${verb}()`).join(" and ")} of @tauri-apps/plugin-dialog, passed to your feature as an injected adapter function so its tests fake it; the dialog is not a Rust command and is the only import besides call() that this feature may use. Offer a default file name that fits the document, then call the document command with the chosen path; a cancelled dialog changes nothing and shows no error. When the PRD states what the file holds with nothing to export (an empty list), the control stays enabled then: that statement wins over the rule that disables a command with nothing to act on.`)
    }
    const deletes = input.features.some(feature => Object.values(feature.operationsByData).some(operations => operations.includes("delete")))
    const commands = localOnly || countdownOnly ? [] : [...new Set(input.features.flatMap(feature => tauriFeatureCommands(feature, input.data, false).filter(command => input.slots !== "later" || !command.startsWith("list_"))))]
    if (commands.length) {
      lines.push(`Call Rust only through the call(command, args) function exported by src/api.ts, the one typed invoke wrapper, generic over the result type (import invoke nowhere else). The commands this feature calls, all owned by OWN-DATA-STORE: ${commands.join(", ")}. Pass arguments camelCase and exactly in the TRD wire format; add no Rust command. Export one factory taking its dependencies as a single object: call (the src/api.ts function), errors (the banner object that src/main.ts exports, made by createErrorBanner in src/errors.ts), the shared view state (the store)${input.features.some(feature => tauriNeedsClock(feature, input.data)) ? ", now" : ""}${deletes ? ", confirm (confirmDialog from src/ui.ts)" : ""}${dialogs.length ? ", the dialog adapter" : ""}; main.ts passes the real ones and tests pass fakes, so a test can inject a failing call.`)
    }
    if (deletes && input.detailView === true && input.slots === "later") lines.push('Build the Delete button and mount it into slots.host("detail-actions") from src/main.ts (the first main task builds none): it acts on the selected record, and the list rows have no delete control. After a successful delete set the shared view state\'s selectedId to null, which closes the detail view.')
    if (deletes) {
      const doomed = input.data.find(item => item.storage === "records" && input.features.some(feature => (feature.operationsByData[item.key] ?? []).includes("delete")))
      const label = doomed?.fields.find(field => field.valueType === "text")
      const fallback = label ? `the message \`Delete "\${record.${snake(label.name)}}"?\` built from the selected record's ${snake(label.name)} (never a generic "item")` : `the message "Delete this record?"`
      lines.push(`Ask the PRD's delete confirmation with the confirm dependency (confirmDialog(message, confirmLabel) from src/ui.ts, the kit's in-page dialog with a Cancel button and the confirm button) using the PRD's text exactly, or when the PRD states none ${fallback} with the label "Delete" (a test asserts those strings; in the notice "Could not remove the item. Try again." say the PRD's own word for the record in place of "item"); Cancel and Escape change nothing; a test injects a fake confirm. When an acceptance criterion states a value that the list or status area shows (a total, a count), the focused test builds the first main task's list factory with a fake now next to this feature and asserts the rendered value; otherwise it asserts the stored and shared state. src/style.css already styles the dialog, so no task edits it.`)
    }
    const clocked = input.features.filter(feature => tauriNeedsClock(feature, input.data))
    if (clocked.length) {
      const subjects = [
        ...(clocked.some(feature => feature.runsEverySeconds !== null || feature.runsDailyAt !== null) ? ["its schedule, intervals, and any limit stated in seconds or milliseconds"] : []),
        ...(clocked.some(feature => usedFields(feature, input.data, "date-time").some(({ item }) => writes(feature, item))) ? ["the timestamps it stamps"] : []),
        ...(clocked.some(feature => stampsDay(feature, input.data) || feature.readsCurrentDay === true) ? ["today's local date"] : []),
        ...(clocked.some(feature => feature.showsCurrentTime === true) ? ["the current times it shows"] : []),
        ...(clocked.some(feature => feature.refreshesEverySeconds != null) ? ["the live value it shows"] : []),
      ]
      lines.push(`Its time-dependent behavior (${subjects.join(", ")}) must read time only through one injected clock, a now: () => Date parameter that main.ts supplies from the real clock; its tests pass a fake clock and advance it instead of sleeping or reading Date.now() directly.${clocked.some(feature => feature.showsCurrentTime === true) ? " Displayed current times re-render every 60 seconds from the injected clock: the interval is an injectable function (tests call it directly) and its timer is cleared on teardown." : ""}`)
    }
    const ticking = clocked.filter(feature => feature.refreshesEverySeconds != null)
    if (ticking.length) {
      lines.push(`Clock ownership: this feature's factory owns the tick. Its dependency object also takes every (an injectable interval function every(callback, ms) that returns its stop function; main.ts passes a setInterval-based one and tests call the callback directly or use vi.useFakeTimers), alongside now. It calls every with ${Math.min(...ticking.map(feature => feature.refreshesEverySeconds!)) * 1000} ms, re-renders from now() on each call, and stops it on teardown. ${ticking.every(isCountdown) ? "Persisted versus derived: nothing is persisted: the running record id and its start time live only in the shared view state's countdown field (a relaunch leaves every row idle); a state that follows from time passing (a countdown reaching zero) is derived for display from countdown.startedAt, the record's stored duration and now() and is never saved, and no tick writes it." : "Persisted versus derived: store only what the user entered plus the timestamps an action sets; a state that follows from time passing (a timer reaching zero) is derived for display from the stored timestamps and now() and is never saved, no tick or launch step writes it, and after a relaunch every row shows the same derived value from its stored fields."} A time shown as MM:SS comes from ${ticking.every(isCountdown) ? "countdown.startedAt" : "the stored timestamps"} and now(), rounded up to whole seconds, never below zero, and its minutes are not capped at two digits.`)
    }
    if (clocked.some(feature => feature.readsCurrentDay === true)) {
      lines.push("A feature that selects or counts records by the current day recomputes today from now() on every render, never once at load: a record falls on today when the local year, month, and day of its parsed date-time equal those of now() (for a calendar period the PRD states, this week or this month, it recomputes the period's first and last local day from now() the same way and a record falls in it when its local day lies between them, the PRD's first day of the week winning), so the list, the count, and the views the add and delete tasks refresh agree and roll over at local midnight while the app stays open. src/main.ts passes the same now to every factory.")
    }
    // Only the list screen, a feature that stamps a date-time, or a clocked feature can show or compare one.
    if (input.features.some(feature => usedFields(feature, input.data, "date-time").length > 0) && (input.slots === "first" || clocked.length > 0 || input.features.some(feature => feature.userFileAccess !== "none") || input.features.some(feature => usedFields(feature, input.data, "date-time").some(({ item }) => writes(feature, item))))) {
      lines.push("A stored date-time is a UTC RFC3339 string: show, format, or compare it in local time by parsing it (new Date(value) and the local getters), never by slicing the string; its test fixes the clock and compares the local parts (year, month, day, hours, minutes) of the stored value with the fake clock's, or sets process.env.TZ to a fixed zone, so it passes in every time zone. When no screen shows a date or time of day from it (only a remaining time or an elapsed time), parse it with new Date(value), compare instants, and write no local-parts test.")
    }
    for (const rule of new Set(input.features.map(feature => tauriDayRule(feature, input.data)).filter(Boolean))) lines.push(rule)
    if (input.shortcut && input.features.some(feature => feature.resourceIds.includes("permission:global-input"))) {
      lines.push("Register the system-wide shortcut only through registerShortcut(onPress, onFailure) from src/shortcut.ts and name no key combination yourself: DEFAULT_ACCELERATOR in src/shortcut.ts is the only place it is written. onFailure shows this feature's declared failure message through errors.show() and the in-app controls keep working; do not retry the registration (the one exception to a retry action).")
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
    // The permission task moves the data owner's inline path canonicalization into its helpers, so it edits that one file.
    if (kind === "permission" && blueprint.domainData.some(item => item.storage === "document")) return [...wanted, "src-tauri/src/platform/datastore.rs"]
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
  // The long-text launch-check clauses apply only when a record can hold free text: a long-text or text-list field, or more text fields than fixed choice lists.
  const recordFields = blueprint.domainData.filter(item => item.storage === "records").flatMap(item => item.fields)
  const choiceNames = new Set(blueprint.features.flatMap(feature => feature.choices.map(choice => choice.split(":")[0]!)))
  const freeText = recordFields.some(field => field.valueType === "long-text" || field.valueType === "text-list") || recordFields.filter(field => field.valueType === "text").length > choiceNames.size
  if (!freeText) {
    overrides.wiringRules = (overrides.wiringRules ?? preset.wiringRules).map(rule => rule
      .replace("one of them longer than the view is wide, ", "")
      .replace("long text truncates or wraps inside it, ", "")
      .replace("long text in a list is cut to a few lines with the full text available, never a scroll area inside a scrolling list; ", ""))
  }
  if (!settings) {
    overrides.persistence = {
      ...preset.persistence,
      enabledDecision: "Persistence: enabled and local-first; record collections use SQLite through a Rust repository boundary.",
      settingsPlacement: "No data object uses settings storage, so the app writes no settings file.",
    }
    // The shared wiring rule's settings-row sentence applies only when a settings screen exists.
    overrides.wiringRules = (overrides.wiringRules ?? preset.wiringRules).map(rule => rule.replace(" settings are grouped rows with the label on the left and the control on the right, a switch or checkbox on the same line as its label, and a short note under each group;", ""))
  }
  if (blueprint.features.every(feature => feature.surface === "main")) {
    overrides.wiringRules = (overrides.wiringRules ?? preset.wiringRules).map(rule => rule.startsWith("Every window the app opens") ? "The app opens one window with the fixed label main, listed in the windows array of src-tauri/capabilities/default.json." : rule)
  }
  // Temporary-file wording applies only when a data object is stored as temporary.
  if (!blueprint.domainData.some(item => item.storage === "temporary")) {
    overrides.recoveryRules = preset.recoveryRules.map(rule => rule.replace(" and remove temporary files before", " before"))
    overrides.lifecycleRules = preset.lifecycleRules.map(rule => rule.replace(" database handles, temporary files, and", " database handles, and"))
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
