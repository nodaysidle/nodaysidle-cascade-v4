import { allocateStableIds, pascal, slug, type GraphContract, type GraphPhase, type NormalizedBlueprint } from "./compiler"
import { gtkKitFlags, rustKitHelpers } from "./kits"
import type { PresetContract } from "./presets"

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
  const overrides: { -readonly [K in keyof PresetContract]?: PresetContract[K] } = {
    runtimeArchitecture: [
      ...preset.runtimeArchitecture.slice(0, 2),
      `Rust platform owners implement ${helpers.join(", ")}; features depend on their traits.`,
      `${boundary(flags.portal)}${atomic ? " A file the app replaces is written to a temporary file in the same directory and renamed over the destination." : ""}`,
      ...(records ? ["Store traits are synchronous. A view-model calls a store from the tokio runtime through spawn_blocking (the store owner holds its Database behind a std::sync::Mutex) and returns the result to the main context through glib::MainContext::spawn_local."] : []),
      ...textRule,
    ],
    persistence,
    fileBoundary: boundary(flags.portal),
    fileBoundaryDetails: details(flags.portal),
    appOnlyFileBoundary: { boundary: boundary(false), details: details(false) },
    lifecycleRules: [
      "Use adw::Application as the entry point and keep exactly one primary window.",
      `On window close or SIGTERM, cancel active tasks, ${records ? "close the SQLite connection by calling DataStore::close on the shared std::sync::Arc handle to the DataStore it is constructed with (its test asserts that a store call after shutdown returns StoreError::Closed), " : ""}remove temporary files, and release streams.`,
      ...(flags.background ? ["Use a systemd user unit only for a declared background feature; no daemon starts otherwise."] : []),
      "Reopen the main window from the launcher; there is no Dock or menu-bar concept.",
    ],
    wiringRules: preset.wiringRules.map(rule => rule.startsWith("The packaging focused test constructs")
      ? "src/app.rs exposes the display-free `build_services(data_dir: &Path) -> Services` (the kit ships it with an empty Services struct; each owner task adds its owner to Services there) and build_window consumes it. The packaging focused test calls build_services with a temporary directory, never build_window, and asserts that every injected platform dependency in Services is the concrete production type."
      : rule.includes("an empty list shows one centered message saying how to fill it;")
        ? rule.replace("an empty list shows one centered message saying how to fill it;", "an empty list shows one centered message, which is the exact empty-list text an acceptance criterion gives and otherwise says how to fill the list;")
        : rule).map(rule => rule.startsWith("Kit helpers that no contract names")
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

const SQL_TYPES: Record<string, { rust: string; sql: string; note?: string }> = {
  text: { rust: "String", sql: "TEXT" },
  "long-text": { rust: "String", sql: "TEXT" },
  number: { rust: "f64", sql: "REAL" },
  "whole-number": { rust: "i64", sql: "INTEGER" },
  flag: { rust: "bool", sql: "INTEGER", note: "0 or 1" },
  date: { rust: "String", sql: "TEXT", note: "YYYY-MM-DD" },
  "date-time": { rust: "i64", sql: "INTEGER", note: "i64 epoch milliseconds, UTC" },
  "text-list": { rust: "Vec of String", sql: "TEXT", note: "a JSON array" },
  reference: { rust: "i64", sql: "INTEGER" },
}

const referenceKey = (name: string): string => name.normalize("NFKC").trim().replace(/\s+/g, " ").replace(/[.]+$/, "").toLocaleLowerCase("en-US")

// The concrete store interface for the SQLite records of one data object: argument and return types, the one
// typed error, integer widths, and the table and column names, all derived from declared fields.
export function gtkStoreInterface(item: NormalizedBlueprint["domainData"][number], operations: readonly string[], record: string, base: string): string {
  const column = (name: string) => name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "value"
  const fields = item.fields.map(field => ({ name: column(field.name), ...SQL_TYPES[field.valueType]!, optional: field.optional }))
  const rustFields = fields.map(field => `${field.name}: ${field.optional ? `Option of ${field.rust}` : field.rust}`).join(", ")
  const columns = ["id INTEGER PRIMARY KEY AUTOINCREMENT", ...fields.map(field => `${field.name} ${field.sql}${field.optional ? "" : " NOT NULL"}${field.note ? ` (${field.note})` : ""}`)].join(", ")
  const signatures = [
    ...(operations.includes("read") ? [`list(&self) returns Ok with a Vec of ${record}`, `get(&self, id: i64) returns Ok with an Option of ${record}, None when the id is not stored`] : []),
    ...(operations.includes("create") ? [`insert(&self, new: New${record}) returns Ok with the stored ${record}`] : []),
    ...(operations.includes("update") ? [`update(&self, record: &${record}) returns Ok with the stored ${record}`] : []),
    ...(operations.includes("delete") ? ["delete(&self, id: i64) returns Ok with no value"] : []),
  ]
  return `Interface: OWN-DATA-STORE defines struct ${record} (id: i64, ${rustFields}), struct New${record} (the same fields without id), the one error enum StoreError that every store trait shares (thiserror; variants Sqlite, NotFound(i64), Closed), and trait ${record}Store with exactly these functions, each returning Err(StoreError) on failure: ${signatures.join("; ")}${operations.includes("update") || operations.includes("delete") ? `; ${["update", "delete"].filter(operation => operations.includes(operation)).join(" and ")} return${operations.includes("update") && operations.includes("delete") ? "" : "s"} StoreError::NotFound for an id that is not stored` : ""}. DataStore in src/platform/datastore.rs implements every store trait over one Database held in a std::sync::Mutex around an Option of Database, is created by DataStore::open(path: &Path) returning Ok with the DataStore or Err(StoreError), and has close(&self) that takes the Database out of the mutex and drops it; every later store call returns StoreError::Closed. Feature tasks call the trait and add no other storage access. DataStore creates table ${base} (${columns}) in its own transactional migration: the kit opens the database at PRAGMA user_version 1 with no tables, so the migration runs when the version is below 2 and sets it to 2; list returns records by descending id unless a feature states another order, and any stated order breaks ties by descending id.`
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
  return contracts.map(item => item.kind === "data" || item.kind === "persistence" ? { ...item, failureBehavior: swap(item.failureBehavior), recovery: item.recovery.map(swap) } : item)
}

// Task sentences that need the GTK widgets and the kit's migration: the data owner's first migration, the
// first main-surface task's slots, and each writing feature's form, toast, and clock-parameter rules.
export function refineGtkPhases(phases: readonly GraphPhase[], blueprint: NormalizedBlueprint): GraphPhase[] {
  const { records } = rustKitHelpers(blueprint)
  const { clock } = gtkKitFlags(blueprint)
  const operations = new Set(blueprint.features.flatMap(feature => feature.dataOperations))
  const featureIds = allocateStableIds("FEAT", blueprint.features.map(feature => feature.name))
  const byId = new Map(blueprint.features.map((feature, index) => [featureIds[index]!, feature]))
  // A bound that depends on today's date (only a stored date or date-time can have one) needs the date as an argument, so the validator is testable at its limit.
  const writesNumeric = (feature: NormalizedBlueprint["features"][number]) => blueprint.domainData.some(item =>
    item.fields.some(field => field.valueType === "number" || field.valueType === "whole-number" || field.valueType === "date" || field.valueType === "date-time")
    && (feature.operationsByData[referenceKey(item.name)] ?? []).some(operation => operation === "create" || operation === "update"))
  // The slots follow the first main-surface prompt, which the compiler built from the declared operations: a slot it does not expose is not described here.
  const slotNote = (prompt: string): string => {
    const detail = prompt.includes("a detail view for the selected record")
    const filter = prompt.includes("a filter area above the list")
    return [
      ...(operations.has("create") ? ["the add-entry control is an Add button in the AdwHeaderBar that opens an empty AdwDialog shell (title, Cancel, a content area and a Save slot) that the add task fills with its form and closes on a successful save"] : []),
      `the status area is one label or AdwStatusPage${filter ? " under the filter area" : " above the list"} that shows the ${filter ? "empty-state, no-match" : "empty-state"} and load-error messages, one at a time`,
      "each list row is an AdwActionRow whose suffix box is the per-row action area",
      ...(filter ? ["the filter area is a GtkSearchEntry above the list"] : []),
      ...(detail ? ["activating a row pushes the detail page, an AdwNavigationPage on an AdwNavigationView that sits inside the ToastOverlay, so Back returns to the list; the feature tasks connect the buttons on it"] : []),
      ...(!detail && (operations.has("update") || operations.has("delete")) ? ["there is no detail page and no AdwNavigationView: every row control lives in the per-row action area"] : []),
    ].join("; ")
  }
  // A text or number the user types is the &str of one GtkEntry (never a GtkSpinButton, which clamps out-of-range input before validate sees it).
  const validateNote = (owned: readonly NormalizedBlueprint["features"][number][]): string[] => {
    const item = blueprint.domainData.find(entry => owned.some(feature => (feature.operationsByData[referenceKey(entry.name)] ?? []).includes("create")))
    if (!item) return []
    const names = item.fields.map(field => field.name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "value")
    const numeric = item.fields.some(field => field.valueType === "number" || field.valueType === "whole-number")
    return [`The validate function is validate_${slug(item.name).replaceAll("-", "_")}(${names.map(name => `${name}: &str`).join(", ")}) returning Ok with New${pascal(item.name)} or Err(ValidationError), where ValidationError is an enum in your file with one variant per rejected rule; it trims and parses its text arguments${numeric ? " (a number is typed in a GtkEntry and parsed by validate, never set through a GtkSpinButton range, so an out-of-range value reaches validate and disables Save)" : ""}, and an edit task calls the same function.`]
  }
  const editForm = " If your acceptance criteria edit stored fields in a form, reuse the form fields and validation that the add task exports from its own file and do not duplicate them; a single mark or toggle action needs no form."
  return phases.map(phase => ({
    ...phase,
    tasks: phase.tasks.map(task => {
      const owned = task.featureIds.flatMap(id => byId.get(id) ?? [])
      const writes = owned.flatMap(feature => feature.dataOperations).filter(operation => operation !== "read")
      const firstMain = task.prompt.includes("You are the first main-surface task")
      const notes = [
        ...(records && task.ownerIds[0] === "OWN-DATA-STORE" ? ["The kit's Database::migrate already sets user_version to 1 and creates no table: run the table migration through Database::connection() inside one transaction (unchecked_transaction on the shared connection) when user_version is below 2 and set it to 2. Do not edit src/platform/sqlite.rs."] : []),
        ...(firstMain ? [`GTK shape of the slots: ${slotNote(task.prompt)}.`, `Empty state: you own the empty-list message of the main screen. Show it in the status area whenever the loaded list has no records, chosen by a display-free function that your tests assert on. Its text is the exact empty-list text that an acceptance criterion gives; when none does, it is one sentence that ${operations.has("create") ? "names the Add button" : "says how the list gets its records"}.`] : []),
        ...(!firstMain && owned.some(feature => feature.dataOperations.includes("create")) ? ["Build the entry form (one input per field the user supplies; a field the app sets itself, such as a flag with a fixed starting value, is not an input) and its display-free validate function in your own file and export both; the dialog shell from the first main-surface task only hosts the form, and an edit task reuses them.", ...validateNote(owned.filter(feature => feature.dataOperations.includes("create")))] : []),
        ...(owned.some(writesNumeric) ? [`Only when an acceptance criterion states a bound that depends on today's date or year, that bound is a parameter of the validate function (for example current_year: i32), never read inside it; a fixed range written as literals stays a constant in validate and adds no parameter; src/app.rs supplies it from ${clock ? "the Clock trait" : "glib::DateTime::now_local()"} and tests pass fixed values at and beyond the bound.`] : []),
        ...(!firstMain && owned.some(feature => feature.surface === "main" && feature.invokedBy === "user-control" && feature.dataOperations.length > 0 && feature.dataOperations.every(operation => operation === "read")) ? ["Narrow the list through the filter area, and show the no-match message in the shared status area, never in a second message widget; the clear-search button sits in the status area beside the no-match text. The first main-surface task's load returns a Result: you render its Err as the load-error message in that status area."] : []),
        ...(writes.length ? [`Write failure: when the store returns StoreError, show an AdwToast on the window's ToastOverlay reading "${writes.every(operation => operation === "delete") ? REMOVE_TOAST : SAVE_TOAST}"; ${[...(writes.includes("create") ? ["a failed add keeps its dialog open with the entered values"] : []), ...(writes.includes("update") ? [owned.some(feature => feature.editsRecords) ? "a failed edit keeps its form open" : "a failed mark leaves the row unchanged"] : []), ...(writes.includes("delete") ? ["a failed removal leaves the row in the list"] : [])].join(", ")}.`] : []),
      ]
      // A mark or toggle has no form, so the edit-form reuse sentence does not apply; the status message of a read-only list follows the exposed filter slot.
      const base = task.prompt
        .replace(editForm, owned.some(feature => feature.editsRecords) ? editForm : "")
        .replace(" (empty state, no match, errors)", task.prompt.includes("a filter area above the list") ? " (empty state, no match, errors)" : " (empty state, errors)")
      return notes.length ? { ...task, prompt: `${base} ${notes.join(" ")}` } : { ...task, prompt: base }
    }),
  }))
}
