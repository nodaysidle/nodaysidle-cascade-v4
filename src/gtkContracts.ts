import { allocateStableIds, pascal, slug, type GraphContract, type GraphPhase, type NormalizedBlueprint } from "./compiler"
import { appSetInitial, clockInitial, type DataValueType } from "./schema"
import { gtkKitFlags, rustKitHelpers } from "./kits"
import type { PresetContract } from "./presets"
import { fieldIdentifier } from "./kitText"

// The preset names SQLite, settings, a systemd unit, the portal and a text rule only for a product that
// declares them; the kit reads the same flags (gtkKitFlags), so the packet and the kit cannot disagree.
export function gtkSpecialize(preset: PresetContract, blueprint: NormalizedBlueprint): Partial<PresetContract> {
  const flags = gtkKitFlags(blueprint)
  const { records, secrets, http } = rustKitHelpers(blueprint)
  const atomic = flags.settings || blueprint.domainData.some(item => item.writeMode === "atomic-replace" || item.storage === "document" || item.storage === "app-files")
  const temporary = blueprint.persistenceNeeds.some(need => need.temporary || need.storage === "temporary")
  const helpers = [
    ...(atomic ? ["atomic file writes"] : []),
    "XDG paths",
    ...(records ? ["SQLite records"] : []),
    ...(secrets ? ["Secret Service credentials"] : []),
    ...(flags.notifications ? ["notifications"] : []),
    ...(http ? ["the HTTPS client"] : []),
  ]
  const directories = ["data", ...(flags.settings ? ["config"] : []), ...(temporary ? ["runtime"] : [])]
  const boundary = (portal: boolean) => `Read and write only the app's XDG ${directories.join(", ")} ${directories.length > 1 ? "directories" : "directory"}${portal ? " and files or folders the user chooses in the desktop portal" : ""}; never scan another user folder.`
  const details = (portal: boolean) => [
    ...(flags.settings ? ["Settings: $XDG_CONFIG_HOME/{app-id}/settings.json."] : []),
    "Records and app-owned files: $XDG_DATA_HOME/{app-id}/.",
    ...(portal ? ["User-chosen paths come only from org.freedesktop.portal.FileChooser or a path the app saved to reopen."] : []),
    "Every path outside this boundary is rejected and leaves the filesystem unchanged.",
  ]
  const longText = blueprint.domainData.some(item => item.fields.some(field => field.valueType === "long-text"))
  const textRule = flags.textFields
    ? ["Text values: a required text field is empty when nothing is left after trimming surrounding whitespace; a length limit counts Unicode scalar values (Rust chars().count()) of the trimmed value, never bytes; a short text field is stored trimmed and a long text field is stored as entered."]
    : []
  const persistenceKinds = [...(flags.settings ? ["atomic JSON settings in XDG config"] : []), ...(records ? ["SQLite records in XDG data"] : [])]
  const persistence = {
    ...preset.persistence,
    enabledDecision: persistenceKinds.length ? `Persistence: enabled with ${persistenceKinds.join(" and ")}.` : "Persistence: enabled for the declared stored data.",
    settingsDecision: "Persistence: atomic JSON settings in XDG config.",
    recordsDecision: "Persistence: SQLite records in XDG data.",
    settingsPlacement: flags.settings ? preset.persistence.settingsPlacement : "No settings are declared; the app writes no settings file.",
    recordsPlacement: records ? preset.persistence.recordsPlacement : "No records are declared; the app creates no database.",
  }
  // Only what the product has: a database to close, temporary files to remove, network streams to release.
  const cleanup = [
    "cancel active tasks",
    ...(records ? ["close the SQLite connection by calling DataStore::close on the shared std::sync::Arc handle to the DataStore it is constructed with (its test asserts that a store call after shutdown returns StoreError::Closed)"] : []),
    ...(temporary ? ["remove temporary files"] : []),
    ...(http ? ["release streams"] : []),
  ]
  const joinList = (items: readonly string[]): string => items.length > 1 ? `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}` : items[0] ?? ""
  const releases = [...(http ? ["streams"] : []), ...(atomic ? ["file handles"] : []), ...(records ? ["database statements"] : []), ...(temporary ? ["temporary files"] : [])]
  const overrides: { -readonly [K in keyof PresetContract]?: PresetContract[K] } = {
    runtimeArchitecture: [
      ...preset.runtimeArchitecture.slice(0, 2),
      `Rust platform owners implement ${helpers.join(", ")}; features depend on their traits.`,
      `${boundary(flags.portal)}${atomic ? " A file the app replaces is written to a temporary file in the same directory and renamed over the destination." : ""}`,
      ...(records ? ["Store traits are synchronous. A view-model calls a store from the tokio runtime through spawn_blocking (the store owner holds its Database behind a std::sync::Mutex) and returns the result to the main context through glib::MainContext::spawn_local."] : []),
      ...textRule,
    ],
    persistence,
    recoveryRules: preset.recoveryRules.map(rule => rule.replace("Cancel tasks and release streams, file handles, database statements, and temporary files on every terminal path.", `Cancel tasks${releases.length ? ` and release ${joinList(releases)}` : ""} on every terminal path.`)),
    fileBoundary: boundary(flags.portal),
    fileBoundaryDetails: details(flags.portal),
    appOnlyFileBoundary: { boundary: boundary(false), details: details(false) },
    lifecycleRules: [
      "Use adw::Application as the entry point and keep exactly one primary window.",
      `On window close or SIGTERM, ${joinList(cleanup)}.`,
      ...(flags.background ? ["Use a systemd user unit only for a declared background feature; no daemon starts otherwise."] : []),
      "Reopen the main window from the launcher; there is no Dock or menu-bar concept.",
    ],
    wiringRules: preset.wiringRules.map(rule => rule.startsWith("The packaging focused test constructs")
      ? "src/app.rs exposes the display-free `build_services(data_dir: &Path) -> Services` (the kit ships it with an empty Services struct; each owner task adds its owner to Services there) and build_window consumes it. The packaging focused test calls build_services with a temporary directory, never build_window, and asserts that every injected platform dependency in Services is the concrete production type." + (records ? " build_services never panics: when DataStore::open returns Err it logs the error kind without record data and leaves the store out of Services (an Option of the shared Arc, None), so the window still opens, the list loads as empty under the list task's load-error rule, every write shows its failure toast, and the lifecycle close step skips an absent store." : "")
      : rule.includes("an empty list shows one centered message saying how to fill it;")
        ? rule.replace("an empty list shows one centered message saying how to fill it;", "an empty list shows one centered message, which is the exact empty-list text an acceptance criterion gives and otherwise names the Add button, never where it sits;")
        : rule).map(rule => rule.replace("long text in a list is cut to a few lines with the full text available, never a scroll area inside a scrolling list; ", longText ? "long text in a list is cut to 3 lines and ellipsized (a fixed convention) with the full text available as the row tooltip, never a scroll area inside a scrolling list; " : "")).map(rule => rule.startsWith("Kit helpers that no contract names")
      ? `${secrets || http ? "Kit helpers that no contract names are optional; do not call a credential or HTTP helper only to satisfy the wiring gate. " : ""}Every owner named in TRD.md must be reachable from the production composition root.`
      : flags.settings ? rule : rule.replace("settings are grouped rows with the label on the left and the control on the right, a switch or checkbox on the same line as its label, and a short note under each group; ", "")),
  }
  if (!flags.background) {
    overrides.packagingRules = preset.packagingRules.map(rule => rule.replace(", and optional systemd unit.", ".").replace(", license, and optional systemd unit.", ", and license."))
    overrides.installationDecision = identity => preset.installationDecision(identity).replace(", and any declared systemd unit under ~/.config/systemd/user", "")
  }
  return overrides
}

const SAVE_TOAST = "Could not save the change. Try again."
const REMOVE_TOAST = "Could not remove the item. Try again."

const SQL_TYPES: Record<DataValueType, { rust: string; sql: string; note?: string }> = {
  text: { rust: "String", sql: "TEXT" },
  "long-text": { rust: "String", sql: "TEXT" },
  number: { rust: "f64", sql: "REAL" },
  "whole-number": { rust: "i64", sql: "INTEGER" },
  flag: { rust: "bool", sql: "INTEGER", note: "0 or 1" },
  date: { rust: "String", sql: "TEXT", note: "YYYY-MM-DD" },
  "date-time": { rust: "i64", sql: "INTEGER", note: "i64 epoch milliseconds, UTC" },
  time: { rust: "String", sql: "TEXT", note: "HH:MM, 24-hour, zero-padded" },
  "text-list": { rust: "Vec of String", sql: "TEXT", note: "a JSON array" },
  reference: { rust: "i64", sql: "INTEGER" },
}

const referenceKey = (name: string): string => name.normalize("NFKC").trim().replace(/\s+/g, " ").replace(/[.]+$/, "").toLocaleLowerCase("en-US")

type Feature = NormalizedBlueprint["features"][number]
type DataItem = NormalizedBlueprint["domainData"][number]
type Field = DataItem["fields"][number]

const savesFile = (feature: { readonly userFileAccess: string }): boolean => feature.userFileAccess === "saves" || feature.userFileAccess === "opens-and-saves"
const opensFile = (feature: { readonly userFileAccess: string }): boolean => feature.userFileAccess === "opens" || feature.userFileAccess === "opens-and-saves"
const dataBase = (name: string): string => slug(name).replaceAll("-", "_")
const usesData = (feature: { readonly resourceIds: readonly string[] }, item: { readonly name: string }): boolean => feature.resourceIds.includes(`data:${slug(item.name)}`)
type FileFeature = { readonly userFileAccess: string; readonly resourceIds: readonly string[]; readonly operationsByData: Readonly<Record<string, readonly string[]>> }

// The one document a saving feature writes: the one it creates or updates, else the one replaced atomically, else the only document it uses.
export function gtkSavedDocument<T extends { readonly name: string; readonly storage: string; readonly writeMode: string }>(data: readonly T[], feature: FileFeature): T | undefined {
  if (!savesFile(feature)) return undefined
  const used = data.filter(item => item.storage === "document" && usesData(feature, item))
  return used.find(item => (feature.operationsByData[referenceKey(item.name)] ?? []).some(operation => operation === "create" || operation === "update"))
    ?? used.find(item => item.writeMode === "atomic-replace")
    ?? (used.length === 1 ? used[0] : undefined)
}

const isCsv = (item: DataItem, features: readonly Feature[]): boolean => /\bCSV\b/i.test([item.name, item.meaning, ...features.map(feature => feature.behavior)].join(" "))

// The records form of the features that create (or, with edits, edit) one records object: which fields the user enters and which the app sets.
function gtkFormShape(blueprint: NormalizedBlueprint, owned: readonly Feature[], edits = false) {
  const item = blueprint.domainData.find(entry => entry.storage === "records" && owned.some(feature => (feature.operationsByData[referenceKey(entry.name)] ?? []).some(operation => operation === "create" || (edits && feature.editsRecords && operation === "update"))))
  if (!item) return undefined
  const flags = item.fields.filter(field => field.valueType === "flag")
  const itemKey = referenceKey(item.name)
  const marked = blueprint.features.some(feature => (feature.operationsByData[itemKey] ?? []).includes("update") && !feature.editsRecords)
  const edited = blueprint.features.some(feature => feature.editsRecords)
  // A single flag that a mark action flips and no form edits is set by the app (false), so it is not a user-supplied input.
  // The flag a mark action flips is set by the app (false at add) whether or not an edit feature exists: the edit form changes the user-entered fields only.
  // A flag the create feature offers (field.offered) is an input starting at its initial value, mark action or not (round 11).
  const legacyFlag = flags.length === 1 && marked && !flags[0]!.offered ? flags[0]! : undefined
  // A field with a declared initial value that no create feature offers is set by the app at creation, so it is no input and no argument.
  const appSet = item.fields.filter(field => field === legacyFlag || clockInitial(field) || appSetInitial(field))
  const inputs = item.fields.filter(field => !appSet.includes(field))
  // An input with a choice list named like it (any value type, round 11: Rating 1..5) is picked from a GtkDropDown, never typed.
  const pickers = inputs.flatMap(field => {
    const list = blueprint.features.flatMap(feature => feature.choiceLists ?? []).find(entry => referenceKey(entry.name) === referenceKey(field.name))
    return list ? [{ field, list }] : []
  })
  return { item, appSet, inputs, edited, pickers }
}

const pickerPhrase = (picker: { field: Field; list: { readonly options: readonly string[]; readonly initial: string } }, start: string): string =>
  `${fieldIdentifier(picker.field.name)} is a GtkDropDown of ${picker.list.options.join(", ")} that ${start}`

// A document is a file the user picks, not a record: no id, no table, no store trait, no validate function (round 11, Book Shelf).
export function gtkDocumentInterface(item: DataItem, users: readonly (FileFeature & { readonly id: string })[], data: readonly DataItem[]): string {
  const base = dataBase(item.name)
  const writers = users.filter(feature => gtkSavedDocument(data, feature)?.name === item.name)
  const readers = users.filter(opensFile)
  const ids = (list: readonly { readonly id: string }[]) => list.map(feature => feature.id).join(", ")
  const parts = [
    ...(writers.length ? [`write_${base}(path: &Path, content: &str) returns Ok(()) or the std::io::Error (${ids(writers)}): path is the target the user chose in the save dialog and may not exist yet; it calls the kit's crate::platform::atomic_file::write_atomic(path, content.as_bytes()), which writes a temporary file in the target's directory, syncs it, and renames it over the target, so a failure leaves an existing target byte-identical and no partial file; the feature that saves it owns the file's layout and builds the whole content string from its own data; OWN-DATA-STORE only writes the string it is given`] : []),
    ...(readers.length ? [`read_${base}(path: &Path) returns Ok with the file's text or the std::io::Error (${ids(readers)}): path is a file the user chose in the open dialog; it returns the file's text and changes nothing`] : []),
  ]
  const test = writers.length ? ` Its focused test writes twice to one path in a temporary directory and asserts that the second content replaced the first, and writes to a path whose parent is an existing regular file and asserts Err with that file unchanged.` : ""
  return `Interface: ${item.name} is a file the user chooses, not a record: it has no id, no SQLite table, no struct, no store trait, and no validate function. OWN-DATA-STORE owns exactly these plain functions in src/platform/datastore.rs, which need no open database: ${parts.join("; ")}.${test}`
}

const FILE_TOAST = "Could not save the file. Try again."

// The export task: the serializer, the portal save dialog, the cancel rule, the atomic write, and the failure toast.
function gtkExportNote(blueprint: NormalizedBlueprint, feature: Feature): string | undefined {
  const document = gtkSavedDocument(blueprint.domainData, feature)
  if (!document) return undefined
  const source = blueprint.domainData.find(item => item.storage === "records" && usesData(feature, item))
  const base = dataBase(document.name)
  const csv = isCsv(document, [feature])
  const columns = document.fields.map(field => fieldIdentifier(field.name))
  const quoted = feature.acceptanceOutcomes.map(signal => /'([^']*,[^']*)'|"([^"]*,[^"]*)"/.exec(signal)).find(Boolean)
  const header = `'${quoted ? (quoted[1] ?? quoted[2]) : columns.join(",")}'`
  const kinds = new Set(document.fields.map(field => field.valueType))
  const values = [
    ...(kinds.has("flag") ? ["a flag is true or false"] : []),
    ...(kinds.has("whole-number") ? ["a whole number is its decimal digits"] : []),
    ...(kinds.has("number") ? ["a number is Rust's f64 Display"] : []),
    ...(kinds.has("date-time") ? ["a date and time (stored as i64 epoch milliseconds) is RFC 3339 UTC with seconds, for example 2026-01-31T09:30:00Z, formatted with gtk::glib::DateTime::from_unix_utc(ms / 1000) and format(\"%Y-%m-%dT%H:%M:%SZ\"), so the bytes never depend on the time zone"] : []),
    ...(kinds.has("date") || kinds.has("time") ? ["a date or a time is written as stored"] : []),
    ...(kinds.has("text-list") ? ["a text list is its lines joined by \\n"] : []),
    ...(document.fields.some(field => field.optional) ? ["an absent optional value is an empty field"] : []),
  ]
  const signature = source ? `serialize_${base}(records: &[${pascal(source.name)}]) -> String` : `serialize_${base}, which takes the values your feature behavior names and returns the content String,`
  const layout = csv
    ? `The file is CSV per RFC 4180: the first line is the header ${header} exactly (the text between the quote marks), then one line per record; the columns are ${columns.join(", ")} in that order; fields are separated by commas; a field that contains a comma, a double quote, CR or LF is wrapped in double quotes with each inner double quote doubled, and every other field is written bare; every line, the last included, ends with \\r\\n; the file is UTF-8 with no byte-order mark.`
    : `The file layout is the one the feature behavior states${columns.length ? `, holding ${columns.join(", ")} for each record` : ""}.`
  const name = csv ? `${slug(source?.name ?? document.name)}.csv` : slug(document.name)
  return [
    `Export: build the whole file with the display-free function ${signature} in your file; your tests assert on its exact output${csv ? ", including a value that needs quoting" : ""}.`,
    layout,
    values.length ? `Values: ${values.join("; ")}.` : "",
    `Save flow: the button's handler runs on the GTK main context (glib::MainContext::spawn_local) and awaits the PermissionCoordinator's choose_save_path(window.upcast_ref(), "${name}") (window is the window that holds the button; use the file name the behavior states instead, when it states one). Cancel rule: when choose_save_path returns None (Cancel or a closed dialog) the handler writes nothing, shows nothing, and leaves the state as it was. With Some(path) it serializes ${source ? `the loaded ${source.name} records in the order the main list shows them` : "those values"} and calls write_${base}(&path, &content) through the shared tokio runtime's spawn_blocking.`,
    `Write failure: when write_${base} returns Err, show an AdwToast on the window's ToastOverlay reading the failure text an acceptance criterion quotes, otherwise "${FILE_TOAST}"; the file previously at that path is unchanged (write_atomic guarantees it), and the user retries with the same button. A successful save shows a message only when an acceptance criterion quotes one.`,
  ].filter(Boolean).join(" ")
}

// The permission owner's save dialog for an export: FileChooserNative, because the kit's gtk4 0.11 has no v4_10 feature (no gtk::FileDialog).
function gtkPermissionNote(blueprint: NormalizedBlueprint): string | undefined {
  if (!blueprint.features.some(savesFile)) return undefined
  const functions = ["pub async fn choose_save_path(&self, parent: &gtk::Window, suggested_name: &str) returning an Option of PathBuf (FileChooserAction::Save, accept label \"Save\", set_current_name(suggested_name))"]
  return `src/platform/permissioncoordinator.rs defines the unit struct PermissionCoordinator (built in build_services and held in Services) with ${functions.join("; ")}. A caller holding the adw::ApplicationWindow passes window.upcast_ref(). It builds a modal gtk::FileChooserNative transient for parent, which goes through org.freedesktop.portal.FileChooser under Wayland, awaits it with run_future() (gtk::prelude::NativeDialogExtManual) on the GTK main context, and returns Some(path) only for ResponseType::Accept with a local path (file().and_then(|file| file.path())); Cancel, a closed dialog, or a file without a local path returns None. The kit's gtk4 0.11 is built without the v4_10 feature, so gtk::FileDialog does not exist here: do not enable v4_10 and do not use FileDialog. The focused test runs without a display: map the response through the display-free function chosen_path(response: gtk::ResponseType, path: Option of PathBuf) returning an Option of PathBuf and assert it for Accept with a path, Accept without a path, Cancel, and DeleteEvent; never construct the dialog in a test.`
}

// The concrete store interface for the SQLite records of one data object: argument and return types, the one
// typed error, integer widths, and the table and column names, all derived from declared fields.
export function gtkStoreInterface(item: NormalizedBlueprint["domainData"][number], operations: readonly string[], record: string, base: string): string {
  const fields = item.fields.map(field => ({ name: fieldIdentifier(field.name), ...SQL_TYPES[field.valueType], optional: field.optional }))
  const rustFields = fields.map(field => `${field.name}: ${field.optional ? `Option of ${field.rust}` : field.rust}`).join(", ")
  const columns = ["id INTEGER PRIMARY KEY AUTOINCREMENT", ...fields.map(field => `${field.name} ${field.sql}${field.optional ? "" : " NOT NULL"}${field.note ? ` (${field.note})` : ""}`)].join(", ")
  const signatures = [
    ...(operations.includes("read") ? [`list(&self) returns Ok with a Vec of ${record}`, `get(&self, id: i64) returns Ok with an Option of ${record}, None when the id is not stored`] : []),
    ...(operations.includes("create") ? [`insert(&self, new: New${record}) returns Ok with the stored ${record}`] : []),
    ...(operations.includes("update") ? [`update(&self, record: &${record}) returns Ok with the stored ${record}`] : []),
    ...(operations.includes("delete") ? ["delete(&self, id: i64) returns Ok with no value"] : []),
  ]
  return `Interface: OWN-DATA-STORE defines struct ${record} (id: i64, ${rustFields}), struct New${record} (the same fields without id), the one error enum StoreError that every store trait shares (thiserror; variants Sqlite, NotFound(i64), Closed), and trait ${record}Store with exactly these functions, each returning Err(StoreError) on failure: ${signatures.join("; ")}${operations.includes("update") || operations.includes("delete") ? `; ${["update", "delete"].filter(operation => operations.includes(operation)).join(" and ")} return${operations.includes("update") && operations.includes("delete") ? "" : "s"} StoreError::NotFound for an id that is not stored` : ""}. DataStore in src/platform/datastore.rs implements every store trait over one Database held in a std::sync::Mutex around an Option of Database, is created by DataStore::open(path: &Path) returning Ok with the DataStore or Err(StoreError), and has close(&self) that takes the Database out of the mutex and drops it; every later store call returns StoreError::Closed. Feature tasks call the trait and add no other storage access. DataStore creates table ${fieldIdentifier(base)} (${columns}) in its own transactional migration: the kit opens the database at PRAGMA user_version 1 with no tables, so the migration runs when the version is below 2 and sets it to 2; list returns records newest created first, by descending id (convention: an edit keeps the record's place and never moves it); a feature that states another order names a stored field, and any stated order breaks ties by descending id.`
}

// The generic write-failure sentences name no surface; on GTK the owning feature task shows a toast.
export function refineGtkContracts(contracts: readonly GraphContract[], blueprint: NormalizedBlueprint): GraphContract[] {
  const has = (operation: string, edits?: boolean) => blueprint.features.some(feature => feature.dataOperations.includes(operation as never) && (edits === undefined || feature.editsRecords === edits))
  const phrase = (names: string[]) => names.join(" or ")
  const dialog = phrase([...(has("create") ? ["add"] : []), ...(blueprint.features.some(feature => feature.editsRecords) ? ["edit"] : [])])
  const rows = phrase([...(has("delete") ? ["removal"] : []), ...(has("update", false) ? ["mark"] : [])])
  const kept = [...(dialog ? [`a failed ${dialog} leaves its dialog open`] : []), ...(rows ? [`a failed ${rows} leaves the row in the list`] : [])].join(", and ")
  const swap = (text: string): string => text
    .replace("A failed write leaves the prior durable state valid and the new state visibly unsaved.", `A failed write leaves the prior durable state valid and the owning feature task shows an AdwToast reading "${SAVE_TOAST}"${has("delete") ? ` ("${REMOVE_TOAST}" for a removal)` : ""}; that toast is the only message for a store failure.`)
    .replace("Preserve the last valid record and expose a bounded correction or rebuild path.", `Keep the last valid record${kept ? `; ${kept}` : ""}.`)
    .replace("Retry through the same atomic boundary without duplicating the record.", "Retry only from an explicit user action.")
  // Only a document some feature saves gets the file-write contract; a document that is only opened keeps its generic shape.
  const documents = new Set(blueprint.features.flatMap(feature => gtkSavedDocument(blueprint.domainData, feature)?.name ?? []))
  const featureIds = allocateStableIds("FEAT", blueprint.features.map(feature => feature.name))
  // The TRD form rule for a picker: a create starts at the list's initial option, an edit at the record's stored value.
  const formRule = (featureId: string): string[] => {
    const feature = blueprint.features[featureIds.indexOf(featureId)]
    const shape = feature && gtkFormShape(blueprint, [feature], true)
    if (!feature || !shape?.pickers.length) return []
    const creates = (feature.operationsByData[referenceKey(shape.item.name)] ?? []).includes("create")
    return [`Form: ${shape.pickers.map(picker => pickerPhrase(picker, creates ? `starts at ${picker.list.initial}` : "opens at the record's stored value")).join("; ")}; a picker is never a typed GtkEntry or a GtkSpinButton, and validate receives the selected option's text.`]
  }
  return contracts.map(item => {
    if (item.kind === "data" && documents.has(item.name)) {
      return { ...item, failureBehavior: "A failed write returns the std::io::Error, leaves any existing file at the chosen path byte-identical, and creates no partial file.", recovery: ["The saving feature shows its failure toast; the user retries from the same control."] }
    }
    if (item.kind === "data" || item.kind === "persistence") return { ...item, failureBehavior: swap(item.failureBehavior), recovery: item.recovery.map(swap) }
    if (item.kind === "interface" && item.featureIds.length === 1) {
      const rule = formRule(item.featureIds[0]!)
      return rule.length ? { ...item, details: [...item.details, ...rule] } : item
    }
    return item
  })
}

// Task sentences that need the GTK widgets and the kit's migration: the data owner's first migration, the
// first main-surface task's slots, and each writing feature's form, toast, and clock-parameter rules.
export function refineGtkPhases(phases: readonly GraphPhase[], blueprint: NormalizedBlueprint): GraphPhase[] {
  const { records } = rustKitHelpers(blueprint)
  const { clock } = gtkKitFlags(blueprint)
  const operations = new Set(blueprint.features.flatMap(feature => feature.dataOperations))
  const documentKeys = new Set(blueprint.domainData.filter(item => item.storage === "document").map(item => referenceKey(item.name)))
  const permissionNote = gtkPermissionNote(blueprint)
  const featureIds = allocateStableIds("FEAT", blueprint.features.map(feature => feature.name))
  const byId = new Map(blueprint.features.map((feature, index) => [featureIds[index]!, feature]))
  // A bound that depends on today's date needs the date as an argument, so the validator is testable at its limit. Only a user-entered date or
  // date-time, or a four-digit year (declared min 1000 and max 9999), can carry one; a fixed numeric range (name length, a count of at least 1) cannot.
  const dateDependent = (field: NormalizedBlueprint["domainData"][number]["fields"][number]): boolean =>
    ((field.valueType === "date" || field.valueType === "date-time") && !clockInitial(field))
    || (field.valueType === "whole-number" && field.min != null && field.max != null && field.min >= 1000 && field.max <= 9999)
  const writesNumeric = (feature: NormalizedBlueprint["features"][number]) => blueprint.domainData.some(item =>
    item.storage !== "document" && item.fields.some(dateDependent)
    && (feature.operationsByData[referenceKey(item.name)] ?? []).some(operation => operation === "create" || operation === "update"))
  // The slots follow the first main-surface prompt, which the compiler built from the declared operations: a slot it does not expose is not described here.
  const narrowKinds = [...new Set(blueprint.features.map(feature => feature.narrowsListBy).filter(kind => kind !== "none"))]
  const noMatch = narrowKinds.some(kind => kind === "text" || kind === "flag")
  type GtkFeature = NormalizedBlueprint["features"][number]
  // A flag filter that declares a choice list is a choice filter: one single-choice dropdown, not an on/off toggle.
  const choiceListOf = (feature: GtkFeature) => feature.narrowsListBy === "flag" ? feature.choiceLists?.[0] : undefined
  const filterWidget = (feature: GtkFeature): string =>
    feature.narrowsListBy === "text" ? "a GtkSearchEntry"
      : feature.narrowsListBy === "sort" ? "a GtkDropDown of the sort orders"
        : choiceListOf(feature) ? "a GtkDropDown of the declared options" : "a GtkToggleButton (or AdwSwitchRow)"
  const filterWidgets = [...new Set(blueprint.features.filter(feature => feature.narrowsListBy !== "none").map(filterWidget))]
  const hookFeatures = blueprint.features.filter(feature => feature.narrowsListBy === "text" || feature.narrowsListBy === "flag")
  const hookName = (feature: GtkFeature): string => slug(feature.name).replaceAll("-", "_")
  const slotNote = (prompt: string): string => {
    const detail = prompt.includes("a detail view for the selected record")
    const filter = prompt.includes("a filter area above the list")
    return [
      ...(operations.has("create") ? ["the add-entry control is an Add button in the AdwHeaderBar that opens an empty AdwDialog shell (title, Cancel, a content area and a Save slot) that the add task fills with its form and closes on a successful save"] : []),
      `the status area is one label or AdwStatusPage${filter ? " under the filter area" : " above the list"} that shows the ${filter && noMatch ? "empty-state and no-match messages, one at a time" : "empty-state message"}`,
      "each list row is an AdwActionRow whose suffix box is the per-row action area",
      ...(prompt.includes("an actions area above the list") ? ["the actions area is a GtkBox packed at the end of the AdwHeaderBar, beside the Add button, holding one button per whole-list command or setting, each mounted by its own feature's task"] : []),
      ...(filter ? [`the filter area above the list holds ${filterWidgets.join(" and ") || "one control"}, one per narrowing feature, mounted by that feature's task`] : []),
      ...(detail ? ["activating a row pushes the detail page, an AdwNavigationPage on an AdwNavigationView that sits inside the ToastOverlay, so Back returns to the list; the feature tasks connect the buttons on it"] : []),
      ...(!detail && (operations.has("update") || operations.has("delete")) ? ["there is no detail page and no AdwNavigationView: every row control lives in the per-row action area"] : []),
    ].join("; ")
  }
  // A text or number the user types is the &str of one GtkEntry (never a GtkSpinButton, which clamps out-of-range input before validate sees it).
  // Only a create on stored records opens the entry form; an export creates a document file, not a record (round 11, Book Shelf).
  const createsRecord = (feature: NormalizedBlueprint["features"][number]): boolean =>
    blueprint.domainData.some(item => item.storage === "records" && (feature.operationsByData[referenceKey(item.name)] ?? []).includes("create"))
  const formShape = (owned: readonly NormalizedBlueprint["features"][number][]) => gtkFormShape(blueprint, owned)
  const validateNote = (owned: readonly NormalizedBlueprint["features"][number][]): string[] => {
    const shape = formShape(owned)
    if (!shape) return []
    const { item, appSet, inputs, edited, pickers } = shape
    const names = inputs.map(field => `${fieldIdentifier(field.name)}: ${field.valueType === "flag" ? "bool" : "&str"}`)
    const toggles = inputs.filter(field => field.valueType === "flag")
    const toggleNote = toggles.length ? `; ${toggles.map(field => `${field.name.toLowerCase()} is a GtkCheckButton that starts ${field.initial === "true" ? "on" : "off"}`).join(" and ")}, and validate takes its active state as a bool` : ""
    const setNote = (field: typeof appSet[number]): string => clockInitial(field) ? `the add function stamps ${field.name.toLowerCase()} from the Clock trait when the record is created (${field.valueType === "date" ? "today_string(clock), the local YYYY-MM-DD day" : "the current moment"}, from the clock it is given; tests pass a fixed clock)` : `the app sets ${field.name.toLowerCase()} to ${(field.initial ?? "") !== "" ? `"${field.initial}"` : "false"} itself inside validate`
    const numeric = item.fields.some(field => (field.valueType === "number" || field.valueType === "whole-number") && !pickers.some(picker => picker.field === field))
    const pickerNote = pickers.map(picker => `; ${pickerPhrase(picker, `starts at ${picker.list.initial} when the dialog opens and after every reset${edited ? " (an edit dialog opens at the record's stored value)" : ""}`)}, built over a gtk::StringList of exactly those options in that order; validate and form_state receive the selected option's text as the ${fieldIdentifier(picker.field.name)} argument and still check it, and no GtkEntry or GtkSpinButton is built for it`).join("")
    const dates = inputs.filter(field => field.valueType === "date")
    const optionalDates = dates.filter(field => field.optional)
    const dateNote = dates.length || appSet.some(field => field.valueType === "date" && clockInitial(field))
      ? ` Dates: the local day of a Clock is computed once, by the kit's display-free today_string(&dyn Clock) -> String in src/platform/clock.rs (YYYY-MM-DD from glib::DateTime, no extra crate); no other code converts time to a day.${dates.length ? ` A date the user types is the &str of one GtkEntry in YYYY-MM-DD (no GtkCalendar), and validate rejects it when it is empty${optionalDates.length ? ` (except the optional ${optionalDates.map(field => field.name.toLowerCase()).join(", ")}, which is then stored as absent)` : ""} or when the kit's is_calendar_date(text) is false (a real calendar day only: 2024-02-30 is rejected); it has no future or past bound unless an acceptance criterion states one, and a ValidationError variant names each rejected date rule.` : ""}`
      : ""
    return [`The validate function is validate_${slug(item.name).replaceAll("-", "_")}(${names.join(", ")}) returning Ok with New${pascal(item.name)} or Err(ValidationError), where ValidationError is an enum in your file with one variant per rejected rule; it trims a text argument only to check it for emptiness and length, and returns a short text field trimmed and a long text field exactly as entered${numeric ? "; a number is typed in a GtkEntry and parsed by validate, never set through a GtkSpinButton range, so an out-of-range value reaches validate and disables Save; a parsed number must be finite (f64 parsing accepts NaN and inf, which validate rejects)" : ""}${pickerNote}${toggleNote}${edited ? "; an edit task calls the same function" : ""}.${appSet.length ? ` ${appSet.map(setNote).join("; ")}; ${appSet.length === 1 ? "it is" : "they are"} not ${appSet.length === 1 ? "a parameter" : "parameters"} of validate or form_state and the form has no input for ${appSet.length === 1 ? "it" : "them"}${edited ? "; an edit leaves it unchanged" : ""}.`.replace(/^ the/, " The") : ""}${dateNote}`]
  }
  // The dialog's Save button label is the first double-quoted text of an acceptance signal that mentions a button, else "Add".
  const formFacts = (creators: readonly NormalizedBlueprint["features"][number][]): string[] => {
    const shape = formShape(creators)
    const dateInput = shape?.inputs.some(field => field.valueType === "date") ?? false
    const choices = creators.some(feature => (feature.choiceLists ?? []).length > 0)
    const toggle = shape?.inputs.some(field => field.valueType === "flag") ?? false
    const reset = `Reset rule, one per input kind: a text or number input resets to empty${dateInput ? "; a date input resets to empty, except one that an acceptance criterion says opens prefilled with today, which resets to today_string(clock)" : ""}${choices ? "; a choice input resets to its initial option" : ""}${toggle ? "; a toggle resets to its starting state" : ""}; this happens after a successful save and every time the add dialog opens, so a dialog reopened after a Cancel starts from the same values${shape?.edited ? ". The edit dialog is not reset: it opens prefilled from the record being edited" : ""}.`
    const label = creators.flatMap(feature => feature.acceptanceOutcomes).map(signal => {
      const m = /\bbutton\s+(?:label(?:led|ed)\s+)?["“]([^"”]{1,40})["”]|["“]([^"”]{1,40})["”]\s+button\b/i.exec(signal)
      return m?.[1] ?? m?.[2]
    }).find(Boolean) ?? "Add"
    return [`Form facts: the dialog's Save slot button is labelled "${label}" (the Add button in the header bar is not that button and is always enabled). The Save button's enabled state is the display-free function form_state(values) -> {save_enabled, errors}, where values holds the typed text${shape?.pickers.length ? " (or, for a picker, the selected option's text)" : ""} of each input${toggle ? " (a toggle's active state)" : ""} in validate's argument order, save_enabled is true exactly when validate returns Ok, and errors lists the rejected rules; your tests assert it for an empty, a valid and an invalid input. ${reset}`]
  }
  const LOAD_ERROR = "Load error: the store's list returns a Result and you own what an Err renders; no later task re-claims it. Show the exact load-error text when an acceptance criterion of yours gives one; otherwise render an empty list with the empty-state text and no error message, and the status area then shows no separate error."
  const hasFlag = blueprint.domainData.some(item => item.fields.some(field => field.valueType === "flag"))
  const flagFiltered = blueprint.features.some(feature => feature.narrowsListBy === "flag")
  const longText = blueprint.domainData.some(item => item.fields.some(field => field.valueType === "long-text"))
  // The first main-surface feature builds the controls of the operations it declares itself (it owns them); another feature's task builds the rest.
  const controlKinds = (features: readonly NormalizedBlueprint["features"][number][]): string[] => [
    ...(features.some(feature => feature.dataOperations.includes("update") && !feature.editsRecords) ? ["mark"] : []),
    ...(features.some(feature => feature.editsRecords) ? ["Edit"] : []),
    ...(features.some(feature => feature.dataOperations.includes("delete")) ? ["delete"] : []),
  ]
  const rowDisplay = (owned: readonly NormalizedBlueprint["features"][number][]): string => {
    const mine = controlKinds(owned)
    const others = controlKinds(blueprint.features.filter(feature => !owned.includes(feature))).filter(kind => !mine.includes(kind))
    const place = blueprint.features.some(feature => feature.surface === "item-page") ? "per-row action area or the detail page's buttons" : "per-row action area"
    const controls = mine.length
      ? `You build the ${mine.join(", ")} control${mine.length > 1 ? "s" : ""} that your own feature declares and mount ${mine.length > 1 ? "them" : "it"} in the ${place}.${others.length ? ` You build no ${others.join(" or ")} control even when an acceptance criterion mentions one: the task that owns that operation builds it and mounts it in the slot you expose.` : ""}`
      : "You build no edit, mark or delete control even when an acceptance criterion mentions one: the task that owns the operation builds it and mounts it in the slot you expose, which stays empty in your task."
    return `Rows: each row shows its stored fields as read-only text${hasFlag ? (flagFiltered ? ", except a flag field that the list is filtered by, which is left out of the row text because the filter control and the mark control carry it" : ", including a flag field as the row subtitle or a label") : ""}. ${controls}`
  }
  const FLAG_SELECTION = "When your acceptance criteria show only the records with one flag value, that selection is one display-free function over the loaded records, named after its rule, that your tests assert on; the store's list still returns every record."
  const SHARED_HELPERS = "The shared view state exposes two display-free entry points that later tasks call and never re-implement: reload() re-reads the store's list into the loaded records, and show_toast(message) adds an AdwToast to the window's ToastOverlay (build_window stores the overlay in the shared view state)."
  const PREVIEW = "Long text: a row shows a long text field through the display-free function row_preview(text) -> String, which keeps the first 3 lines and appends \"…\" to the last kept line when anything was cut (fixed convention); your tests assert it, and the full text is the row's tooltip."
  const LIST_TEST = "Your tests insert records through the store trait, never through the add form (a later task builds it); an ordering check inserts two records and asserts on the display-free list function."
  const NO_MATCH = "When an acceptance criterion gives a no-match message, show it in the shared status area, never in a second message widget; otherwise show no no-match message."
  const NARROW = {
    text: `Narrow the list with a GtkSearchEntry mounted in the filter area. A row matches when its text .to_lowercase() contains the typed text .to_lowercase(), with no trimming of the typed text (fixed convention). ${NO_MATCH} Clearing is the entry's built-in clear icon only; add no separate clear-search button.`,
    flag: `Narrow the list with a GtkToggleButton (or AdwSwitchRow) mounted in the filter area, off initially and labelled with the wording of your acceptance criterion; turning it off restores the full list and needs no clear control. ${NO_MATCH}`,
    sort: "Reorder the list with a GtkDropDown mounted in the filter area, listing each sort order your acceptance criteria name; the list task's order is the initial choice. A reorder never hides rows, so it has no no-match message and no clear control.",
  } as const
  const choiceNarrow = (list: NonNullable<ReturnType<typeof choiceListOf>>): string => `Narrow the list with one single-choice GtkDropDown mounted in the filter area, built over a gtk::StringList of exactly the options of your declared choice list in their declared order (${list.options.join(", ")}) and opening at its initial option (${list.initial}); build no toggle, switch or clear control. Choosing an option shows only the loaded records that match it by the rule your behavior states, and the initial option shows every loaded record again when your behavior says it stands for all of them. Keep the narrowing in one display-free function that takes the loaded records and the selected option's text and returns the matching records in the loaded order; your tests assert it for every option. ${NO_MATCH}`
  const HOOK_INITIAL = "the narrowing control's initial value: the empty text for a search, the initial option for a choice, \"off\" for a toggle"
  const FILTER_HOOK = hookFeatures.length > 1
    ? `Filter hook (you build it; a narrowing task only sets it): the shared view state holds one pair per narrowing feature, named after the feature (${hookFeatures.map(feature => `filter_selection_${hookName(feature)}: String and row_filter_${hookName(feature)}`).join("; ")}), where each selection starts at ${HOOK_INITIAL} and each row filter is a function from the loaded records and its own selection to the records to show (initially one that returns every record in the loaded order); it also holds the display-free visible_rows(), which applies the row filters one after another to the loaded records with their selections, and one set function per feature (${hookFeatures.map(feature => `set_filter_selection_${hookName(feature)}(selection)`).join("; ")}), which stores that selection and re-renders the list. Your list renders visible_rows(), never the loaded records directly.`
    : `Filter hook (you build it; a narrowing task only sets it): the shared view state holds filter_selection: String (initially ${HOOK_INITIAL}) and row_filter, a function from the loaded records and that selection to the records to show (initially one that returns every record in the loaded order), plus the display-free visible_rows(), which returns row_filter applied to the loaded records and filter_selection, and set_filter_selection(selection), which stores the selection and re-renders the list. Your list renders visible_rows(), never the loaded records directly.`
  const hookApply = (feature: GtkFeature): string => hookFeatures.length > 1
    ? `Apply the narrowing through the filter hook the list task exposes in the shared view state: from the shared registration files set row_filter_${hookName(feature)} to your display-free function, and on every change of your control call set_filter_selection_${hookName(feature)} with its current value; do not edit the list feature file and do not filter there.`
    : "Apply the narrowing through the filter hook the list task exposes in the shared view state: from the shared registration files set row_filter to your display-free function, and on every change of your control call set_filter_selection with its current value; do not edit the list feature file and do not filter there."
  const EDIT_CONTROL = "You build the per-row Edit control (a button) that opens the form for that record, and mount it in the slot named above; the list task builds no edit control. The edit dialog's title is \"Edit\" followed by one space and the record's singular name in lower case (for a record called Note the title is \"Edit note\"), its Save button is labelled \"Save\" (the add dialog's label belongs to the add dialog only), and it opens prefilled from the record."
  const MARK_CONTROL = `You build the mark control (a GtkCheckButton or GtkToggleButton) in the per-row action area; it changes the stored flag and then calls the shared view state's reload entry point${flagFiltered ? ", so a row that no longer matches the active filter leaves the list" : ""}. Add no second state indicator.`
  const CONFIRM_DIALOG = "The per-row control that asks for a removal is a button labelled \"Delete\". A removal confirmation is a custom AdwDialog, not an AdwAlertDialog (which closes on every response): its question is the confirmation text the PRD quotes, or when the PRD quotes none \"Delete this item?\" with the record's singular name in place of \"item\"; its buttons are \"Cancel\" and \"Delete\" (when the PRD or an acceptance criterion quotes another label for one of them, use the quoted label); Delete calls the store and closes the dialog only after it returns Ok; on StoreError show the toast and leave the dialog open; Cancel closes the dialog and changes nothing. The confirmation is built from a display-free function request_delete(id: i64) returning the loaded record to confirm, or None when the id is not in the loaded list; your tests assert it, and the dialog is shown only for Some."
  const editForm = " If your acceptance criteria edit stored fields in a form, reuse the form fields and validation that the add task exports from its own file and do not duplicate them; a single mark or toggle action needs no form."
  return phases.map(phase => ({
    ...phase,
    tasks: phase.tasks.map(task => {
      const owned = task.featureIds.flatMap(id => byId.get(id) ?? [])
      // A document file is written by the export note, not the store, so its create is no store write.
      const writes = owned.flatMap(feature => Object.entries(feature.operationsByData).filter(([key]) => !documentKeys.has(key)).flatMap(([, ops]) => ops)).filter(operation => operation !== "read")
      const firstMain = task.prompt.includes("You are the first main-surface task")
      const notes = [
        ...(records && task.ownerIds[0] === "OWN-DATA-STORE" ? ["The kit's Database::migrate already sets user_version to 1 and creates no table: run the table migration through Database::connection() inside one transaction (unchecked_transaction on the shared connection) when user_version is below 2 and set it to 2. Do not edit src/platform/sqlite.rs.", "Services holds the store as a std::sync::Arc around DataStore, so the lifecycle coordinator can close the same handle; build_services tolerates a failed DataStore::open (the store is then absent, see CON-RUNTIME-WIRING) and never panics."] : []),
        ...(firstMain && records ? [LOAD_ERROR] : []),
        ...(firstMain && (operations.has("update") || operations.has("delete")) ? [rowDisplay(owned)] : []),
        ...(firstMain && hasFlag ? [FLAG_SELECTION] : []),
        ...(firstMain && records && operations.has("create") ? [LIST_TEST] : []),
        ...(firstMain ? [SHARED_HELPERS] : []),
        ...(firstMain && task.prompt.includes("a filter area above the list") && hookFeatures.length > 0 ? [FILTER_HOOK] : []),
        ...(firstMain && longText ? [PREVIEW] : []),
        ...(firstMain ? [`GTK shape of the slots: ${slotNote(task.prompt)}.`, `Empty state: you own the empty-list message of the main screen. Show it in the status area whenever the loaded list has no records, chosen by a display-free function that your tests assert on. Its text is the exact empty-list text that an acceptance criterion gives; when none does, it is one sentence that ${operations.has("create") ? "names the Add button and never says where it sits" : "says how the list gets its records"}.${narrowKinds.length ? " The function reads the unfiltered loaded list, never the filtered rows, so a search or filter with no match shows the no-match message and not this text." : ""}`] : []),
        ...(!firstMain && owned.some(createsRecord) ? ["Build the entry form (one input per field the user supplies; a field the app sets itself is not an input) and its display-free validate function in your own file and export both; the dialog shell from the first main-surface task only hosts the form" + (blueprint.features.some(feature => feature.editsRecords) ? ", and an edit task reuses them" : "") + ".", ...formFacts(owned.filter(createsRecord)), ...validateNote(owned.filter(feature => feature.dataOperations.includes("create")))] : []),
        ...(owned.some(writesNumeric) ? [`Only when an acceptance criterion states a bound that depends on today's date or year, that bound is a parameter of the validate function (for example current_year: i32), never read inside it; a fixed range written as literals stays a constant in validate and adds no parameter; src/app.rs supplies it from ${clock ? "the Clock trait" : "glib::DateTime::now_local()"} and tests pass fixed values at and beyond the bound.`] : []),
        ...(!firstMain ? owned.filter(feature => feature.narrowsListBy !== "none" && feature.dataOperations.length > 0 && feature.dataOperations.every(operation => operation === "read")).slice(0, 1).flatMap(feature => {
          const list = choiceListOf(feature)
          return [list ? choiceNarrow(list) : NARROW[feature.narrowsListBy as "text" | "flag" | "sort"], ...(feature.narrowsListBy === "sort" ? [] : [hookApply(feature)])]
        }) : []),
        ...(!firstMain && owned.some(feature => feature.editsRecords) ? [EDIT_CONTROL] : []),
        ...(owned.some(feature => feature.dataOperations.includes("update") && !feature.editsRecords) ? [MARK_CONTROL] : []),
        ...(writes.includes("delete") ? [CONFIRM_DIALOG] : []),
        ...(task.ownerIds[0] === "OWN-PERMISSION-COORDINATOR" && permissionNote ? [permissionNote] : []),
        ...owned.flatMap(feature => gtkExportNote(blueprint, feature) ?? []),
        ...(writes.length ? [`Write failure: when the store returns StoreError, show an AdwToast on the window's ToastOverlay reading "${writes.every(operation => operation === "delete") ? REMOVE_TOAST : SAVE_TOAST}"; ${[...(writes.includes("create") ? ["a failed add keeps its dialog open with the entered values"] : []), ...(writes.includes("update") ? [owned.some(feature => feature.editsRecords) ? "a failed edit keeps its form open" : "a failed mark leaves the row unchanged"] : []), ...(writes.includes("delete") ? ["a failed removal leaves the row in the list"] : [])].join(", ")}.`] : []),
      ]
      // A mark or toggle has no form, so the edit-form reuse sentence does not apply; the status message of a read-only list follows the exposed filter slot.
      const base = task.prompt
        .replace(editForm, owned.some(feature => feature.editsRecords) ? editForm : "")
        .replace(" (empty state, no match, errors)", task.prompt.includes("a filter area above the list") && noMatch ? " (empty state, no match)" : " (empty state)")
      return notes.length ? { ...task, prompt: `${base} ${notes.join(" ")}` } : { ...task, prompt: base }
    }),
  }))
}
