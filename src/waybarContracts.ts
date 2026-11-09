import type { NormalizedBlueprint, SystemSource } from "./compiler"
import type { SemanticBlueprint, SemanticIssue } from "./schema"

// Everything the Waybar preset states once and deterministically: units, system sources, and the rules
// the provider is told and the intake checks. Kit code, TRD wording, and provider notes all read it.

export const WAYBAR_UNIT_CONVENTION = "Units are fixed decimal SI for every size and rate: 1 kB = 1000 B, 1 MB = 1,000,000 B, 1 GB = 1,000,000,000 B (labels B, kB, MB, GB, TB; the largest unit whose value is at least 1, plain B below 1000); a rate in bits per second is bytes x 8 / elapsed seconds, with 1 kb/s = 1000 b/s and 1 Mb/s = 1,000,000 b/s (a byte rate uses B/s, kB/s, MB/s); the number of decimals is the one the acceptance criteria state (default 1) and is applied with Rust's {:.N} formatting. Binary units (1024, KiB, MiB, GiB) are never used. src/platform/units.rs (kit) implements this once."

export const WAYBAR_FAILURE_RULE = "One failure rule for a refresh (the --service loop or --action refresh): when the measurement or fetch fails, fetch_output returns Err, so refresh keeps the last cache with the class stale and STALE_SUFFIX appended, and no stored record changes; fetch_output never returns Ok(last value) for a failed read. When no reading was ever stored, the failed refresh leaves the empty state (text is settings.text, class empty). A failed click returns Err (exit 2, message on stderr) and changes neither the store nor the cache."

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
}

export function waybarSources(blueprint: Pick<NormalizedBlueprint, "features">): SystemSource[] {
  return [...new Set(blueprint.features.map(feature => feature.systemSource).filter(source => source !== "none"))]
}

// The interface-contract line for a feature that reads a system source.
export function waybarSourceDetail(source: SystemSource): string[] {
  if (source === "none") return []
  const facts = WAYBAR_SYSTEM_SOURCES[source]
  return [`System source: ${facts.path}, read through the SystemReader trait in src/platform/system_source.rs (kit; implementation ${facts.kit}); the reading is ${facts.reading}. A counter that goes backwards (reset or interface change) counts as a change of 0 for that sample and replaces the stored sample. A failed read is a failed refresh.`]
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
  return issues
}

export const WAYBAR_PROVIDER_NOTES: readonly string[] = [
  "Each run of the Waybar module command is a separate process and nothing stays in memory between runs. Anything the module must remember between runs (a last good value, a saved choice) must be a dataObject with storage records or settings, never session or temporary. Set invokedBy to click for the feature that reacts to a click on the module and to schedule for the feature that refreshes by itself. The bar re-reads the cache only on its fragment interval, so state no latency tighter than that: write timings as how soon the cache is written after a successful fetch, never as when the bar label changes.",
  `Runtime story, stated once: ${WAYBAR_RUNTIME_STORY} Never write that each run, invocation, or execution of the module command measures, fetches, or requests; write that each refresh does. Put runsEverySeconds on the one feature that measures or fetches and leave it null on a feature that only shows the result; a bar module has no separate display feature unless the idea asks for one. A feature that only shows what the measuring feature stores is built first: list it in the measuring feature's buildsOn, never the reverse.`,
  `Failure story, stated once: when a measurement or fetch fails the bar shows the last good label marked stale and nothing stored changes; never also write that the module shows the last stored value as if fresh, and say what is shown when no reading was ever stored. A failed click shows no JSON; it makes the command exit non-zero.`,
  `Units: ${WAYBAR_UNIT_CONVENTION} Give a numeric example (a counter change and its label) only when you computed it with these rules, for example 6,250,000 bytes in 5 seconds is 10.0 Mb/s and 3,670,016,000 bytes is 3.67 GB.`,
  "When a feature reads an operating-system counter instead of calling a service, set its systemSource to network-received, network-sent, load-average, memory, or battery and name no file path or command yourself; otherwise leave it none. A system source is not an externalService.",
  "A value the user saves (a city, a station, a unit) is a settings dataObject with its fields, set by the user with the command's --set KEY=VALUE or by editing config.json; do not add a feature or a records dataObject for it. A records dataObject that keeps the last reading sets singleRecord true when only the latest reading is kept, and a reading fetched for a saved setting includes a field with that setting's name. Compare stored rows by their values, never by file bytes.",
]

export const WAYBAR_COMPOSITION_ROOT = "The composition root of the module is the pair of hooks in src/module.rs: fetch_output and click construct every production dependency (the real record store when a data object is records, the real SystemReader, the real HTTP client, SystemLauncher) and pass them into the feature functions, which take them as parameters; src/main.rs only dispatches the command line to src/module.rs. The packaging focused test therefore asserts on the built binary, not on a function inside main(): in a temporary XDG tree it runs the real binary with --action refresh and then --once and checks the cache output, and it asserts that no production source file under src/ imports a test double."

export function waybarLifecycleNote(blueprint: NormalizedBlueprint): string {
  const background = blueprint.features.some(feature => feature.runsEverySeconds !== null || feature.runsDailyAt !== null)
  const closes = blueprint.persistenceNeeds.some(need => need.storage === "records") ? "close the SQLite connection by dropping the store and " : ""
  return ` Lifecycle API (the one interface of this owner): the kit's module::serve_until(shutdown: &AtomicBool, pass) runs one refresh pass per interval until the flag is set and module::run_service registers SIGTERM and SIGINT on that flag; ${background ? "this task adds " : "this task adds, only if a feature later needs the service, "}module::shutdown_cleanup(settings, cache_path), which runs after serve_until returns and ${closes}removes the temporary files under $XDG_RUNTIME_DIR/{app-id} except cache.json, and calls it from run_service. You may modify src/module.rs for this and nothing else in it. Its focused test sets the flag from inside the pass closure and asserts that exactly one pass ran and cleanup ran once. CON-PERMISSION-NOTIFICATIONS needs no code here: it is satisfied by notify in src/platform/launcher.rs, called from the click owner.`
}

// Settings are the config.json values map and nothing else: no table, migration, or generated id.
export function waybarSettingsInterface(item: NormalizedBlueprint["domainData"][number], operations: readonly string[]): string {
  const record = item.name.replace(/[^A-Za-z0-9]+(.)?/g, (_, next: string | undefined) => (next ?? "").toUpperCase()).replace(/^./, first => first.toUpperCase())
  const keys = item.fields.map(field => field.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")).join(", ")
  const reads = operations.includes("read") ? ` get(settings) returns the ${record} struct built from those keys in Settings.values, or a String error that names a missing key (never a default);` : ""
  const writes = operations.some(operation => operation !== "read") ? " set(key, value) saves through config::set_pair;" : ""
  return `Interface: ${item.name} lives only in config.json (Settings.values, keys ${keys || "none"}); there is no SQLite table, migration, or generated id for it.${reads}${writes} OWN-DATA-STORE adds these functions to src/config.rs and no trait over a database.`
}

export function waybarSingleRecordDetail(item: NormalizedBlueprint["domainData"][number]): string[] {
  return item.singleRecord ? ["Cardinality: exactly one record. The first successful write inserts it; every later write updates the record returned by list()[0] (the highest id) in place, so the table never holds two rows."] : []
}

// The click page address: {value} replaced by the saved setting, the site root when none is saved.
export function waybarPageDetail(service: NormalizedBlueprint["externalServices"][number]): string[] {
  if (!service.webPage.includes("{value}")) return []
  const root = /^(https?:\/\/[^/]+)/.exec(service.webPage)?.[1] ?? ""
  return [`Page address: the web page template ${service.webPage} with {value} replaced by the saved setting '${service.requestValueFrom}' (percent-encoded); when no value is saved the address is ${root}/. The integration owner exposes the function page_url (it takes the saved value, which may be absent, and returns the address as text) and the click owner calls that function instead of building the address itself.`]
}

export function waybarRequestDetail(service: NormalizedBlueprint["externalServices"][number]): string[] {
  if (!service.endpoint.includes("{value}")) return []
  return [`Request URL: ${service.endpoint} with {value} replaced by the saved setting '${service.requestValueFrom}' (percent-encoded). The integration owner exposes the function request_url (it takes the saved value as text and returns the address as text); a response whose status or value is not the documented success shape is a failed fetch.`]
}
