import type { GraphContract, NormalizedBlueprint, SystemSource } from "./compiler"
import { referenceKey, type SemanticBlueprint, type SemanticIssue } from "./schema"

// Everything the Waybar preset states once and deterministically: units, system sources, and the rules
// the provider is told and the intake checks. Kit code, TRD wording, and provider notes all read it.

export const WAYBAR_UNIT_CONVENTION = "Units are fixed decimal SI for every size and rate: 1 kB = 1000 B, 1 MB = 1,000,000 B, 1 GB = 1,000,000,000 B (labels B, kB, MB, GB, TB; the largest unit whose value is at least 1, plain B below 1000); a rate in bits per second is bytes x 8 / elapsed seconds, with 1 kb/s = 1000 b/s and 1 Mb/s = 1,000,000 b/s (a byte rate uses B/s, kB/s, MB/s). Decimals are fixed too and no acceptance criterion changes them: a size is shown with 2 decimals (3.67 GB), a rate with 1 decimal (10.0 Mb/s), and a size below 1000 B is a whole number of bytes (999 B), applied with Rust's {:.2} and {:.1} formatting. Binary units (1024, KiB, MiB, GiB) are never used."
export const WAYBAR_UNITS_KIT = " src/platform/units.rs (kit) implements this once."

export const WAYBAR_TIME_CONVENTION = "Time: an instant (a sunset, a fetch time, a sample time) is stored as a UTC epoch in whole milliseconds in a date-time field, never as a time of day, because a time of day has lost its date and cannot be converted later. It is converted to the user's local time zone only when the label or tooltip is rendered, with src/platform/local_time.rs (kit; chrono, the system time zone); a time of day in a label is HH:MM, 24-hour, zero-padded. Nothing else converts a time zone."
export const WAYBAR_EMPTY_LABEL = "--"

export const WAYBAR_FAILURE_RULE = "One failure rule for a refresh (the --service loop or --action refresh): when the measurement or fetch fails, fetch_output returns Err, so refresh keeps the last cache with the class stale and STALE_SUFFIX appended, and no stored record changes; fetch_output never returns Ok(last value) for a failed read. Stale is never a stored field: it is derived when the module renders, from the failed refresh recorded in cache.json or from the reading being older than twice the service interval. cache.json lives under $XDG_RUNTIME_DIR and is lost at reboot, so when a refresh fails and no cache.json exists, refresh writes it from stored_output (the label of the record already stored, marked stale; the refresh-loop owner implements this kit hook); when nothing was ever stored, the failed refresh leaves the empty state (text is settings.text, class empty). A failed click returns Err (exit 2, message on stderr) and changes neither the store nor the cache."

export const WAYBAR_RUNTIME_STORY = "Who measures: only the --service loop (every runsEverySeconds of the one feature that measures or fetches) and --action refresh call fetch_output, which measures, fetches, or reads the system source and writes the cache; the module command with no action or --once never measures or fetches and only re-reads cache.json. A reading therefore reaches the bar at the next fragment re-run after the cache write."

interface SourceFacts {
  readonly path: string
  readonly reading: string
  readonly kit: string
}

export const WAYBAR_SYSTEM_SOURCES: Readonly<Record<Exclude<SystemSource, "none">, SourceFacts>> = {
  "network-received": { path: "/proc/net/dev", reading: "total received bytes since boot: the sum of the rx_bytes column over every interface except lo", kit: "NetReceivedReader" },
  "network-sent": { path: "/proc/net/dev", reading: "total sent bytes since boot: the sum of the tx_bytes column over every interface except lo", kit: "NetSentReader" },
  "load-average": { path: "/proc/loadavg", reading: "the one-minute load average (first field)", kit: "LoadAverageReader" },
  memory: { path: "/proc/meminfo", reading: "MemTotal and MemAvailable (kB lines, multiplied by 1024 to bytes) giving used bytes = total - available", kit: "MemoryReader" },
  battery: { path: "/sys/class/power_supply/BAT*/capacity", reading: "the charge percentage of the first BAT* supply", kit: "BatteryReader" },
  "disk-space": { path: "statvfs(\"/\") (the root file system, through the nix crate)", reading: "free bytes = f_bavail x f_frsize (what a normal user can still write), total bytes = f_blocks x f_frsize, used bytes = total - f_bfree x f_frsize", kit: "DiskSpaceReader" },
}

// Which optional kit helpers a blueprint needs; the kit files, the locked stack, and the docs all read this so a doc never names a helper the kit lacks.
export function waybarKitParts(blueprint: Pick<NormalizedBlueprint, "features" | "domainData" | "externalServices">): { sources: SystemSource[]; sizes: boolean; localTime: boolean; disk: boolean } {
  const sources = waybarSources(blueprint)
  const dateTime = (fields: readonly { readonly valueType: string }[]) => fields.some(field => field.valueType === "date-time")
  return {
    sources,
    sizes: sources.some(source => source === "network-received" || source === "network-sent" || source === "memory" || source === "disk-space"),
    localTime: blueprint.domainData.some(item => dateTime(item.fields)) || blueprint.externalServices.some(item => dateTime(item.responseFields)),
    disk: sources.includes("disk-space"),
  }
}

export function waybarSources(blueprint: Pick<NormalizedBlueprint, "features">): SystemSource[] {
  return [...new Set(blueprint.features.map(feature => feature.systemSource).filter(source => source !== "none"))]
}

// The interface-contract line for a feature that reads a system source.
export function waybarSourceDetail(source: SystemSource): string[] {
  if (source === "none") return []
  const facts = WAYBAR_SYSTEM_SOURCES[source]
  const counter = source === "network-received" || source === "network-sent"
  return [`System source: ${facts.path}, read through the SystemReader trait in src/platform/system_source.rs (kit; implementation ${facts.kit}); the reading is ${facts.reading}.${counter ? " A counter that goes backwards (reset or interface change) counts as a change of 0 for that sample and replaces the stored sample." : ""} A failed read is a failed refresh.`]
}

const BINARY_UNITS = /\b1,?024\b|\b[kmgt]ib\b|\b(?:kibi|mebi|gibi|tebi)bytes?\b/i

function featureTexts(feature: SemanticBlueprint["features"][number]): string[] {
  return [feature.userOutcome, feature.trigger, feature.behavior, feature.failureOutcome, ...feature.acceptanceSignals]
}

export function waybarCapabilityIssues(blueprint: SemanticBlueprint): SemanticIssue[] {
  const issues: SemanticIssue[] = []
  blueprint.features.forEach((feature, index) => {
    if (featureTexts(feature).some(text => BINARY_UNITS.test(text))) {
      issues.push({ path: `features[${index}]`, rule: "capability.waybar-unit-base", message: `Feature '${feature.name}' names a binary unit or 1024. This preset fixes decimal SI (1 kB = 1000 B, 1 Mb = 1,000,000 bits; a rate in bits is bytes x 8 / seconds); state every size and rate example in those units.` })
    }
  })
  blueprint.productConstraints.concat(blueprint.qualityRequirements).forEach((text, index) => {
    if (BINARY_UNITS.test(text)) issues.push({ path: `productConstraints[${index}]`, rule: "capability.waybar-unit-base", message: "A constraint names a binary unit or 1024. This preset fixes decimal SI; state sizes and rates in those units." })
  })
  // Only the feature that measures, fetches, or writes data runs by itself; the feature that shows the result does not repeat the schedule.
  const works = (feature: SemanticBlueprint["features"][number]) => feature.usesServices.length > 0 || feature.systemSource !== "none" || feature.dataOperations.some(entry => entry.operations.some(operation => operation === "create" || operation === "update"))
  const scheduled = blueprint.features.map((feature, index) => ({ feature, index })).filter(item => item.feature.runsEverySeconds !== null || item.feature.runsDailyAt !== null)
  if (scheduled.some(item => works(item.feature))) {
    for (const { feature, index } of scheduled) {
      if (!works(feature)) issues.push({ path: `features[${index}].runsEverySeconds`, rule: "capability.waybar-schedule-owner", message: `Feature '${feature.name}' declares a schedule but only reads data and calls no service or system source; only the feature that measures or fetches runs by itself. Set its runsEverySeconds and runsDailyAt to null; the cache it reads is refreshed by the scheduled feature.` })
    }
  }
  // The feature that shows a stored reading builds first; the feature that stores it builds on it, never the other way round.
  const writers = blueprint.features.filter(feature => feature.runsEverySeconds !== null && works(feature))
  blueprint.features.forEach((feature, index) => {
    for (const writer of writers) {
      const stored = writer.dataOperations.filter(entry => entry.operations.some(operation => operation === "create" || operation === "update")).map(entry => entry.data.trim().toLowerCase())
      const readsIt = feature.dataOperations.some(entry => stored.includes(entry.data.trim().toLowerCase()) && entry.operations.includes("read"))
      if (feature !== writer && readsIt && !works(feature) && feature.buildsOn.some(name => name.trim().toLowerCase() === writer.name.trim().toLowerCase())) {
        issues.push({ path: `features[${index}].buildsOn`, rule: "capability.waybar-build-order", message: `Feature '${feature.name}' only shows what '${writer.name}' stores, so it must not build on it; remove it from buildsOn and list '${feature.name}' in the buildsOn of '${writer.name}', which calls its label code.` })
      }
    }
  })
  issues.push(...waybarValueIssues(blueprint))
  return issues
}

const COORDINATE_PARAMETERS = new Set(["lat", "lng", "lon", "latitude", "longitude"])

// Declared-field checks for what the label, thresholds, stored times, and service request values may be. Whether a
// numeric example or an acceptance sentence is computed correctly is prose and cannot be checked here.
function waybarValueIssues(blueprint: SemanticBlueprint): SemanticIssue[] {
  const issues: SemanticIssue[] = []
  const labelled = blueprint.features.map((feature, index) => ({ feature, index })).filter(item => (item.feature.labelTemplate ?? "").trim() !== "")
  if (labelled.length !== 1) {
    issues.push({ path: "features", rule: "capability.waybar-label-template", message: `Exactly one feature sets labelTemplate, the exact module label with {value} for the formatted reading (for example "Sunset {value}"); ${labelled.length} do. The label is composed by one feature, the one that shows the reading.` })
  }
  for (const { feature, index } of labelled) {
    if (!(feature.labelTemplate ?? "").includes("{value}")) issues.push({ path: `features[${index}].labelTemplate`, rule: "capability.waybar-label-template", message: `Feature '${feature.name}' labelTemplate must contain {value}, where the formatted reading goes.` })
  }
  const limited = blueprint.features.map((feature, index) => ({ feature, index })).filter(item => (item.feature.thresholds ?? []).length > 0)
  if (limited.length > 1) {
    issues.push({ path: `features[${limited[1]!.index}].thresholds`, rule: "capability.waybar-thresholds-owner", message: "One module has one severity: declare thresholds on the single feature that shows the reading, not on several." })
  }
  for (const { feature, index } of limited) {
    const seen = new Set<string>()
    for (const threshold of feature.thresholds ?? []) {
      const key = `${threshold.state}/${threshold.comparison}`
      if (seen.has(key)) issues.push({ path: `features[${index}].thresholds`, rule: "capability.waybar-thresholds-duplicate", message: `Feature '${feature.name}' declares two ${threshold.state} thresholds that compare ${threshold.comparison}; keep one per state and direction.` })
      seen.add(key)
    }
  }
  const fieldsOf = [
    ...blueprint.dataObjects.map((item, index) => ({ path: `dataObjects[${index}]`, fields: item.fields, stored: item.storage === "records" })),
    ...blueprint.externalServices.map((item, index) => ({ path: `externalServices[${index}]`, fields: item.responseFields, stored: false })),
  ]
  for (const { path, fields, stored } of fieldsOf) {
    fields.forEach((field, fieldIndex) => {
      if (field.valueType === "time") issues.push({ path: `${path}.fields[${fieldIndex}]`, rule: "capability.waybar-time-of-day", message: `Field '${field.name}' is a time of day, which has lost its date. Declare it as date-time: the full instant is stored as a UTC epoch and shown in the local time zone when rendered.` })
      if (stored && /\bstale\b/i.test(field.name)) issues.push({ path: `${path}.fields[${fieldIndex}]`, rule: "capability.waybar-stale-field", message: `Field '${field.name}' stores staleness. Stale is derived when the module renders from the last failed refresh and the reading's age; remove the field and describe the stale state only as what the bar shows.` })
    })
  }
  const settingFields = blueprint.dataObjects.filter(item => item.storage === "settings").flatMap(item => item.fields)
  blueprint.externalServices.forEach((service, index) => {
    const source = service.requestValueFrom.trim()
    const wanted = service.requestValueType ?? "text"
    const field = settingFields.find(item => referenceKey(item.name) === referenceKey(source))
    if (field !== undefined && (wanted === "number" ? field.valueType !== "number" && field.valueType !== "whole-number" : field.valueType !== "text")) {
      issues.push({ path: `externalServices[${index}].requestValueType`, rule: "capability.waybar-request-value-type", message: `Service '${service.name}' needs {value} to be ${wanted === "number" ? "a number" : "free text"}, but the saved setting '${field.name}' is ${field.valueType}. Save the identifier the service actually needs, or name a service that takes what the user saves; this preset has no geocoding step.` })
    }
    // A coordinate query parameter takes a number, and one saved value cannot supply a latitude and a longitude.
    const pairs = (service.endpoint.split("?")[1] ?? "").split("&").map(part => part.split("=") as [string, string | undefined])
    const coordinates = pairs.filter(([key]) => COORDINATE_PARAMETERS.has(key.toLowerCase()))
    if (coordinates.some(([, value]) => value?.includes("{value}")) && (wanted !== "number" || coordinates.some(([, value]) => !value?.includes("{value}")))) {
      issues.push({ path: `externalServices[${index}].endpoint`, rule: "capability.waybar-request-coordinates", message: `Service '${service.name}' sends {value} as a coordinate (latitude or longitude). One saved value cannot supply a coordinate pair and a city name is not a coordinate; this preset has no geocoding step, so choose an endpoint that takes the one identifier the user saves (a city name, a station id).` })
    }
  })
  return issues
}

export const WAYBAR_PROVIDER_NOTES: readonly string[] = [
  "Each run of the Waybar module command is a separate process and nothing stays in memory between runs. Anything the module must remember between runs (a last good value, a saved choice) must be a dataObject with storage records or settings, never session or temporary. Set invokedBy to click for the feature that reacts to a click on the module and to schedule for the feature that refreshes by itself. The bar re-reads the cache only on its fragment interval, so state no latency tighter than that: write timings as how soon the cache is written after a successful fetch, never as when the bar label changes.",
  `Runtime story, stated once: ${WAYBAR_RUNTIME_STORY} Never write that each run, invocation, or execution of the module command measures, fetches, or requests; write that each refresh does. Put runsEverySeconds on the one feature that measures or fetches and leave it null on a feature that only shows the result; a bar module has no separate display feature unless the idea asks for one. A feature that only shows what the measuring feature stores is built first: list it in the measuring feature's buildsOn, never the reverse.`,
  `Failure story, stated once: when a measurement or fetch fails the bar shows the last good label marked stale and nothing stored changes; never write that the stored reading is marked stale or add a stale or failed flag to a dataObject (stale is derived when the module renders), never also write that the module shows the last stored value as if fresh, and say what is shown when no reading was ever stored (the empty label is always ${WAYBAR_EMPTY_LABEL}). A failed click shows no JSON; it makes the command exit non-zero.`,
  `${WAYBAR_UNIT_CONVENTION} Give a numeric example (a counter change and its label) only when you computed it with these rules, for example 6,250,000 bytes in 5 seconds is 10.0 Mb/s and 3,670,016,000 bytes is 3.67 GB.`,
  `${WAYBAR_TIME_CONVENTION} Declare an instant as a date-time field, never as a time of day.`,
  "When a feature reads an operating-system source instead of calling a service, set its systemSource to network-received, network-sent, load-average, memory, battery, or disk-space (free, used, and total space of the root file system) and name no file path or command yourself; otherwise leave it none. A system source is not an externalService.",
  `The module label is composed by one feature, the one that shows the reading: set its labelTemplate to the exact label with {value} for the formatted reading ("{value}", "Sunset {value}"); leave labelTemplate empty on every other feature. When the idea states a limit (red below 10 GB free, amber above 80 percent), declare it on that same feature as thresholds {state warning or critical, comparison above or below, value} where value is in the unit of the raw reading (bytes for a size, bits per second for a rate, a plain number otherwise: 10 GB is 10000000000); "above" means strictly greater and "below" strictly less. Never declare a limit the idea does not state.`,
  "An externalService whose endpoint uses {value} sets requestValueType to text (a name or identifier) or number, and the saved setting named by requestValueFrom must have that valueType. A service that needs latitude and longitude cannot take a saved city name or one saved value: this preset has no geocoding step, so choose a service that takes the one identifier the user saves.",
  "Acceptance criteria about a schedule state what a test asserts (the default interval value and the interval the refresh pass returns), not a wall-clock wait. A reading that is only valid for one calendar day is a product limit this preset does not detect; say so in a non-goal instead of promising it.",
  "A value the user saves (a city, a station, a unit) is a settings dataObject with its fields, set by the user with the command's --set KEY=VALUE or by editing config.json; do not add a feature or a records dataObject for it. A records dataObject that keeps the last reading sets singleRecord true when only the latest reading is kept, and a reading fetched for a saved setting includes a field with that setting's name. Compare stored rows by their values, never by file bytes.",
]

export const WAYBAR_COMPOSITION_ROOT = "The composition root of the module is the pair of hooks in src/module.rs: fetch_output and click construct every production dependency (the real record store when a data object is records, the real SystemReader, the real HTTP client, SystemLauncher) and pass them into the feature functions, which take them as parameters; src/main.rs only dispatches the command line to src/module.rs. The packaging focused test therefore asserts on the built binary, not on a function inside main(): in a temporary XDG tree it runs the real binary with --action refresh and then --once and checks the cache output, and it asserts that no production source file under src/ imports a test double."

export function waybarLifecycleNote(blueprint: NormalizedBlueprint): string {
  const background = blueprint.features.some(feature => feature.runsEverySeconds !== null || feature.runsDailyAt !== null)
  const notifies = blueprint.platformNeeds.includes("notifications")
  return ` Lifecycle API (the one interface of this owner): the kit's module::serve_until(shutdown: &AtomicBool, pass) runs one refresh pass per interval until the flag is set and module::run_service registers SIGTERM and SIGINT on that flag; ${background ? "this task adds " : "this task adds, only if a feature later needs the service, "}module::shutdown_cleanup(settings, cache_path), which runs after serve_until returns, removes the temporary files under $XDG_RUNTIME_DIR/{app-id} except cache.json, and is called from run_service. It closes no database: a store is opened inside each refresh pass and dropped when the pass ends, so no connection outlives a pass. You may modify src/module.rs for this and nothing else in it. Its focused test sets the flag from inside the pass closure and asserts that exactly one pass ran and cleanup ran once.${notifies ? " CON-PERMISSION-NOTIFICATIONS needs no code here: it is satisfied by notify in src/platform/launcher.rs, called from the click owner." : ""}`
}

// Settings are the config.json values map and nothing else: no table, migration, or generated id.
export function waybarSettingsInterface(item: NormalizedBlueprint["domainData"][number], operations: readonly string[]): string {
  const record = item.name.replace(/[^A-Za-z0-9]+(.)?/g, (_, next: string | undefined) => (next ?? "").toUpperCase()).replace(/^./, first => first.toUpperCase())
  const keys = item.fields.map(field => field.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")).join(", ")
  const reads = operations.includes("read") ? ` get(settings) returns the ${record} struct built from those keys in Settings.values, or a String error that names a missing key (never a default);` : ""
  const writes = operations.some(operation => operation !== "read") ? " set(key, value) saves through config::set_pair;" : ""
  return `Interface: ${item.name} lives only in config.json (Settings.values, keys ${keys || "none"}); there is no SQLite table, migration, or generated id for it.${reads}${writes} OWN-DATA-STORE adds these functions to src/config.rs and no trait over a database. Its focused test saves a value through config::set_pair (the --set path) and reads it back, and asserts that reading an unset key returns the error that names the key.`
}

export function waybarSingleRecordDetail(item: NormalizedBlueprint["domainData"][number], operations: readonly string[] = []): string[] {
  const methods = [...(operations.includes("create") ? ["create is insert"] : []), ...(operations.includes("update") ? ["update is update"] : []), ...(operations.includes("read") ? ["read is list and get"] : [])]
  return [
    ...(methods.length ? [`Operation to trait method: ${methods.join(", ")}; a feature calls only the methods of its own operations.`] : []),
    ...(item.singleRecord ? ["Cardinality: exactly one record. The first successful write inserts it; every later write updates the record returned by list()[0] (the highest id) in place, so the table never holds two rows."] : []),
  ]
}

// The generic recovery sentence promises a correction or rebuild path no declared operation provides.
export function refineWaybarContracts(contracts: readonly GraphContract[]): GraphContract[] {
  const swap = (text: string): string => text.replace("Preserve the last valid record and expose a bounded correction or rebuild path.", "Keep the last valid record; a failed write changes nothing and the next refresh retries.")
  return contracts.map(item => item.kind === "data" || item.kind === "persistence" ? { ...item, failureBehavior: swap(item.failureBehavior), recovery: item.recovery.map(swap) } : item)
}

// The click page address: {value} replaced by the saved setting, the site root when none is saved.
export function waybarPageDetail(service: NormalizedBlueprint["externalServices"][number]): string[] {
  if (!service.webPage.includes("{value}")) return []
  const root = /^(https?:\/\/[^/]+)/.exec(service.webPage)?.[1] ?? ""
  return [`Page address: the web page template ${service.webPage} with {value} replaced by the saved setting '${service.requestValueFrom}' (percent-encoded); when no value is saved the address is ${root}/. The integration owner exposes the function page_url (it takes the saved value, which may be absent, and returns the address as text) and the click owner calls that function instead of building the address itself.`]
}

export function waybarRequestDetail(service: NormalizedBlueprint["externalServices"][number]): string[] {
  if (!service.endpoint.includes("{value}")) return []
  return [`Request URL: ${service.endpoint} with {value} replaced by the saved setting '${service.requestValueFrom}' (percent-encoded). The integration owner exposes the function request_url (it takes the base, the scheme and host, and the saved value as text and returns the address as text; production passes the documented host and the focused tests pass a local 127.0.0.1 listener, so no test reaches the live service); a response whose status or value is not the documented success shape is a failed fetch.`]
}

// Interface lines for the feature that composes the label and declares severity limits.
export function waybarFeatureDetail(feature: NormalizedBlueprint["features"][number]): string[] {
  const lines: string[] = []
  if (feature.labelTemplate !== "") lines.push(`Label: exactly "${feature.labelTemplate}" with {value} replaced by the formatted reading (formatting follows the Units and Time rules above); before the first successful refresh the label is "${WAYBAR_EMPTY_LABEL}", the kit default of Settings.text in src/config.rs, which no task changes.`)
  if (feature.thresholds.length) {
    const rows = feature.thresholds.map(item => `${item.state === "critical" ? "critical (red)" : "warning (amber)"} when the raw value is ${item.comparison === "above" ? "above" : "below"} ${item.value}`)
    lines.push(`Thresholds on the raw ModuleOutput.value (never the rounded label; the comparison is strict): ${rows.join("; ")}; critical wins over warning. The kit declares them in THRESHOLDS in src/module.rs and its severity function implements both directions, so no task edits them; the label function only sets ModuleOutput.value to the raw reading in the unit these thresholds use.`)
  }
  return lines
}
