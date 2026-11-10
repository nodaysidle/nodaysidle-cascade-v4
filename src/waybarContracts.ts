import type { GraphContract, NormalizedBlueprint, SystemSource } from "./compiler"
import { referenceKey, requestSettingsObject, templatePlaceholders, type SemanticBlueprint, type SemanticIssue } from "./schema"
import { fieldIdentifier } from "./kitText"

// Everything the Waybar preset states once and deterministically: units, system sources, and the rules
// the provider is told and the intake checks. Kit code, TRD wording, and provider notes all read it.

export const WAYBAR_UNIT_CONVENTION = "Units are fixed decimal SI for every size and rate: 1 kB = 1000 B, 1 MB = 1,000,000 B, 1 GB = 1,000,000,000 B (labels B, kB, MB, GB, TB; the largest unit whose value is at least 1, plain B below 1000); a rate in bits per second is bytes x 8 / elapsed seconds, with 1 kb/s = 1000 b/s and 1 Mb/s = 1,000,000 b/s (a byte rate uses B/s, kB/s, MB/s). Decimals are fixed too and no acceptance criterion changes them: a size is shown with 2 decimals (3.67 GB), a rate with 1 decimal (10.0 Mb/s), and a size below 1000 B is a whole number of bytes (999 B), rounded half away from zero (f64::round of the value x 10^decimals, then formatted; never Rust's format!({:.1}) on the raw value, which can round a decimal tie down, so 1.25 is shown as 1.3 and 3.675 x 100 rounds as the computed product). A feature that declares a fixed unit shows its number scaled to that unit only (500,000 B/s in MB/s is 0.5, not 500.0 kB/s); the largest-unit choice applies only when no unit is declared. Binary units (1024, KiB, MiB, GiB) are never used."
export const WAYBAR_UNITS_KIT = " src/platform/units.rs (kit) implements this once."

export const WAYBAR_TIME_CONVENTION = "Time: an instant (a sunset, a fetch time, a sample time) is stored as a UTC epoch in whole milliseconds in a date-time field, never as a time of day, because a time of day has lost its date and cannot be converted later. It is converted to the user's local time zone only when the label or tooltip is rendered, with src/platform/local_time.rs (kit; chrono, the system time zone); a time of day in a label is HH:MM, 24-hour, zero-padded. Nothing else converts a time zone."
export const WAYBAR_EMPTY_LABEL = "--"

// runsEverySeconds is in seconds; the idea's own unit is converted once, and the PRD, acceptance, and schedule all carry that one number.
export const WAYBAR_INTERVAL_NOTE = "runsEverySeconds is always in seconds and is the interval the idea states, converted once: 30 seconds is 30, 5 minutes is 300, 30 minutes is 1800, 2 hours is 7200, a day is 86400. Never write 1800 for 'every 30 seconds' or 30 for 'every 30 minutes', and never write both numbers in one sentence ('30 seconds (1800 seconds)'); state the interval once in the unit of the idea and once as the seconds value of runsEverySeconds. This cannot be detected by intake, so check it before answering."

// The one wording of what a failed refresh does to cache.json; it is exactly what refresh_with in the kit does.
export const WAYBAR_FAILED_REFRESH_CACHE = "the cache keeps the last good label text with class stale, and the module output rendered from that cache is that text with STALE_SUFFIX appended and class stale (STALE_SUFFIX is appended when the module renders and is never written into cache.json; cache.json is rewritten only to mark it stale, or rebuilt from the stored record when it is missing; an acceptance criterion never says it stays unchanged, and its class is never anything but stale) and no stored record changes"

export const WAYBAR_FAILURE_RULE = `One failure rule for a refresh (the --service loop or --action refresh): when the measurement or fetch fails, fetch_output returns Err, so refresh leaves this state: ${WAYBAR_FAILED_REFRESH_CACHE}; fetch_output never returns Ok(last value) for a failed read. Stale is never a stored field: it is derived when the module renders, from the failed refresh recorded in cache.json or from the reading being older than twice the service interval. cache.json lives under $XDG_RUNTIME_DIR and is lost at reboot, so when a refresh fails and no cache.json exists, refresh writes it from stored_output (the label of the record already stored, marked stale; the refresh-loop owner implements this kit hook); when nothing was ever stored, the failed refresh leaves the empty state (text is settings.text, class empty). A failed click returns Err (exit 2, message on stderr) and changes neither the store nor the cache.`

export const WAYBAR_RUNTIME_STORY = "Who measures: only the --service loop (every runsEverySeconds of the one feature that measures or fetches) and --action refresh call fetch_output, which measures, fetches, or reads the system source and writes the cache; the module command with no action or --once never measures or fetches and only re-reads cache.json. A reading therefore reaches the bar at the next fragment re-run after the cache write."

interface SourceFacts {
  readonly path: string
  readonly reading: string
  readonly kit: string
  // True when the reading is a size or rate, so the units rules and src/platform/units.rs apply.
  readonly sizes: boolean
}

// Cumulative counters: the label shows a rate, which needs the previous sample.
export const RATE_SOURCES: ReadonlySet<SystemSource> = new Set<SystemSource>(["network-received", "network-sent", "disk-read"])
export const WAYBAR_RATE_RULE = "Rate rule: the previous sample lives in the stored record of the reading, which holds the previous cumulative counter and its sample time (a stored record is always there, also after a restart and in the separate --action refresh process; nothing is kept in memory); a rate is the counter change divided by the whole seconds since that stored sample time, and an elapsed time of 0 or less stores no rate. With no stored record yet, the refresh stores the counter and the time without a rate and the label stays the empty label (class empty); a record without a rate also shows the empty label with class empty."

export const WAYBAR_SYSTEM_SOURCES: Readonly<Record<Exclude<SystemSource, "none">, SourceFacts>> = {
  "network-received": { path: "/proc/net/dev", reading: "total received bytes since boot: the sum of the rx_bytes column over every interface except lo", kit: "NetReceivedReader", sizes: true },
  "network-sent": { path: "/proc/net/dev", reading: "total sent bytes since boot: the sum of the tx_bytes column over every interface except lo", kit: "NetSentReader", sizes: true },
  "load-average": { path: "/proc/loadavg", reading: "the one-minute load average (first field)", kit: "LoadAverageReader", sizes: false },
  memory: { path: "/proc/meminfo (file overridable with the MODULE_MEMINFO_PATH environment variable, so tests point it at a fixture file; build the reader with MemoryReader::from_env())", reading: "MemTotal and MemAvailable (kB lines, multiplied by 1024 to bytes): totalBytes = MemTotal, freeBytes = MemAvailable (never MemFree), usedBytes = totalBytes - freeBytes", kit: "MemoryReader", sizes: true },
  swap: { path: "/proc/meminfo (file overridable with the MODULE_MEMINFO_PATH environment variable, so tests point it at a fixture file; build the reader with SwapReader::from_env())", reading: "SwapTotal and SwapFree (kB lines, multiplied by 1024 to bytes): totalBytes = SwapTotal, usedBytes = totalBytes - SwapFree (swap, never MemTotal or MemAvailable, which are RAM). A machine without swap reports SwapTotal 0: that is a successful read of total 0 and used 0, and a percentage of a total of 0 is 0 percent, never a division by zero", kit: "SwapReader", sizes: true },
  battery: { path: "/sys/class/power_supply/BAT*/capacity and /sys/class/power_supply/BAT*/status (directory /sys/class/power_supply overridable with the MODULE_POWER_SUPPLY_DIR environment variable, so tests point it at a fixture tree; build the reader with BatteryReader::from_env())", reading: "BatteryReading { charge_percent: u8, charging_state: &'static str } of the first BAT* supply in name order: charge_percent is the whole number in BAT*/capacity (0 to 100) and charging_state is the text in BAT*/status mapped to exactly one of charging (Charging), discharging (Discharging), full (Full), not charging (Not charging), unknown (Unknown or any other text); a stored charge percentage comes from capacity only and a stored charging state from status only. With no BAT* supply, or a missing or unreadable capacity or status file, the read fails", kit: "BatteryReader", sizes: false },
  temperature: { path: "/sys/class/thermal/thermal_zone*/temp (directory overridable with the MODULE_THERMAL_DIR environment variable, so tests point it at a fixture tree)", reading: "the CPU temperature in degrees Celsius: every zone file holds millidegrees, the highest zone is taken, and the value is divided by 1000; a whole-number label rounds to the nearest degree (Rust f64::round, half away from zero), never truncates, and severity compares the unrounded value. With no readable zone the read fails (a failed refresh: exit 2 for --action refresh, the empty state in --once)", kit: "TemperatureReader", sizes: false },
  "disk-read": { path: "/proc/diskstats (file overridable with the MODULE_DISKSTATS_PATH environment variable, so tests point it at a fixture file; build the reader with DiskReadReader::from_env())", reading: "total bytes read since boot: the sectors-read column (the sixth field after major, minor, and name) of every whole disk (sdX, hdX, vdX, xvdX, nvmeXnY, mmcblkX; never a partition, loop, ram, or device-mapper device), summed and multiplied by 512", kit: "DiskReadReader", sizes: true },
  "disk-space": { path: "statvfs(\"/\") (the root file system, through the nix crate)", reading: "free bytes = f_bavail x f_frsize (what a normal user can still write), total bytes = f_blocks x f_frsize, used bytes = total - f_bfree x f_frsize", kit: "DiskSpaceReader", sizes: true },
}

// Which optional kit helpers a blueprint needs; the kit files, the locked stack, and the docs all read this so a doc never names a helper the kit lacks.
export function waybarKitParts(blueprint: Pick<NormalizedBlueprint, "features" | "domainData" | "externalServices">): { sources: SystemSource[]; sizes: boolean; units: boolean; localTime: boolean; disk: boolean } {
  const sources = waybarSources(blueprint)
  const dateTime = (fields: readonly { readonly valueType: string }[]) => fields.some(field => field.valueType === "date-time")
  return {
    sources,
    sizes: sources.some(source => WAYBAR_SYSTEM_SOURCES[source as Exclude<SystemSource, "none">].sizes),
    // units.rs also carries the rounding rule, so a declared unit or decimals count needs it without a size or rate source.
    units: sources.some(source => WAYBAR_SYSTEM_SOURCES[source as Exclude<SystemSource, "none">].sizes) || blueprint.features.some(feature => feature.unit !== "" || feature.valueDecimals !== null),
    // shortcut: a date-time stored beside a declared service is read as bookkeeping (a fetched-at stamp) unless the service returns an instant too, and the sample time of a rate source is always bookkeeping; upgrade when a declared field says an instant is shown.
    localTime: blueprint.externalServices.some(item => dateTime(item.responseFields)) || (blueprint.externalServices.length === 0 && !sources.some(source => RATE_SOURCES.has(source)) && blueprint.domainData.some(item => dateTime(item.fields))),
    disk: sources.includes("disk-space"),
  }
}

// True when a click feature reads a records data object; only then does the stored-record click rule apply.
export function waybarClickReadsRecord(blueprint: Pick<NormalizedBlueprint, "features" | "domainData">): boolean {
  const records = new Set(blueprint.domainData.filter(item => item.storage === "records").map(item => referenceKey(item.name)))
  return blueprint.features.some(feature => feature.invokedBy === "click" && Object.entries(feature.operationsByData).some(([key, operations]) => records.has(key) && operations.includes("read")))
}

export function waybarSources(blueprint: Pick<NormalizedBlueprint, "features">): SystemSource[] {
  return [...new Set(blueprint.features.map(feature => feature.systemSource).filter(source => source !== "none"))]
}

// The interface-contract line for a feature that reads a system source.
export function waybarSourceDetail(source: SystemSource): string[] {
  if (source === "none") return []
  const facts = WAYBAR_SYSTEM_SOURCES[source]
  const counter = RATE_SOURCES.has(source)
  return [`System source: ${facts.path}, read through the SystemReader trait in src/platform/system_source.rs (kit; implementation ${facts.kit}); the reading is ${facts.reading}.${counter ? ` A counter that goes backwards (reset or interface change) counts as a change of 0 for that sample and replaces the stored sample. ${WAYBAR_RATE_RULE}` : ""} Every field the reading stores comes from the file or call named here; a stored field this line does not name is never read from the system. A failed read is a failed refresh.`]
}

const CACHE_FILE = /cache\.json/i
// Drop the kit-facing aside that names cache.json: the provider is asked to write this text, and the cache-file check rejects that name.
const FAILED_REFRESH_PLAIN = WAYBAR_FAILED_REFRESH_CACHE.replace(/ \([^)]*cache\.json[^)]*\)/, "")
const BINARY_UNITS = /\b1,?024\b|\b[kmgt]ib\b|\b(?:kibi|mebi|gibi|tebi)bytes?\b/i

function featureTexts(feature: SemanticBlueprint["features"][number]): string[] {
  return [feature.userOutcome, feature.trigger, feature.behavior, feature.failureOutcome, ...feature.acceptanceSignals]
}

export function waybarCapabilityIssues(blueprint: SemanticBlueprint): SemanticIssue[] {
  const issues: SemanticIssue[] = []
  blueprint.features.forEach((feature, index) => {
    if (featureTexts(feature).some(text => BINARY_UNITS.test(text))) {
      issues.push({ path: `features[${index}]`, rule: "capability.waybar-unit-base", message: `Feature '${feature.name}' names a binary unit or the digits 1024. Remove every mention of 1024 (also inside a larger number such as 1,024,000; pick another example value), KiB, MiB, and GiB from its texts, not even to forbid them. This preset fixes decimal SI (1 kB = 1000 B, 1 Mb = 1,000,000 bits; a rate in bits is bytes x 8 / seconds); state every size and rate example in those units.` })
    }
  })
  // cache.json is the kit's derived label file: a feature that names it describes a data source or a failure state the kit does not have.
  blueprint.features.forEach((feature, index) => {
    if (featureTexts(feature).some(text => CACHE_FILE.test(text))) {
      issues.push({ path: `features[${index}]`, rule: "capability.waybar-cache-file", message: `Feature '${feature.name}' names cache.json. That file is a derived copy of the label and never the source of a detail: say that the click action reads the stored record, and that after a failed refresh ${FAILED_REFRESH_PLAIN}. Write 'the cached label' where the label is meant.` })
    }
  })
  for (const key of ["productConstraints", "qualityRequirements"] as const) {
    blueprint[key].forEach((text, index) => {
      if (BINARY_UNITS.test(text)) issues.push({ path: `${key}[${index}]`, rule: "capability.waybar-unit-base", message: "This entry names a binary unit or the digits 1024. Remove every mention of 1024 (also inside a larger number), KiB, MiB, and GiB from it, not even to forbid them; this preset uses decimal SI (powers of 1000) only." })
    })
  }
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

const RESPONSE_PATH = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/
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
    const unit = (feature.unit ?? "").trim()
    if (unit !== "" && !(feature.labelTemplate ?? "").includes(unit)) issues.push({ path: `features[${index}].labelTemplate`, rule: "capability.waybar-label-unit", message: `Feature '${feature.name}' declares the unit '${unit}' but its labelTemplate '${feature.labelTemplate}' does not contain it. {value} is only the number in that unit, so the template carries the unit text (for example "{value} ${unit}").` })
    if (unit === "" && (feature.valueDecimals ?? null) !== null) issues.push({ path: `features[${index}].valueDecimals`, rule: "capability.waybar-label-unit", message: `Feature '${feature.name}' declares valueDecimals without a unit; set unit to the symbol the label shows (or valueDecimals to null).` })
    if (!(feature.labelTemplate ?? "").includes("{value}")) issues.push({ path: `features[${index}].labelTemplate`, rule: "capability.waybar-label-template", message: `Feature '${feature.name}' labelTemplate must contain {value}, where the formatted reading goes.` })
  }
  blueprint.externalServices.forEach((service, index) => {
    service.responseFields.forEach((field, fieldIndex) => {
      const path = (field.path ?? "").trim()
      if (!RESPONSE_PATH.test(path)) issues.push({ path: `externalServices[${index}].responseFields[${fieldIndex}].path`, rule: "capability.waybar-response-path", message: `Response value '${field.name}' of '${service.name}' needs path, the documented key path of the value in the JSON body as dot-separated keys (for example current.wind_speed_10m); got '${path}'.` })
    })
  })
  const rateFeature = blueprint.features.findIndex(feature => RATE_SOURCES.has(feature.systemSource))
  if (rateFeature >= 0) {
    const feature = blueprint.features[rateFeature]!
    const wanted = new Set(feature.usesData.map(name => referenceKey(name)))
    const store = blueprint.dataObjects.find(item => item.storage === "records" && wanted.has(referenceKey(item.name)))
    if (store === undefined || !store.fields.some(field => field.valueType === "date-time") || !store.fields.some(field => field.valueType === "whole-number")) {
      issues.push({ path: `features[${rateFeature}].usesData`, rule: "capability.waybar-rate-sample", message: `Feature '${feature.name}' shows a rate of a cumulative counter, so it must use a records dataObject that stores the previous counter (a whole-number field) and its sample time (a date-time field); the rate is computed from that stored sample.` })
    }
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
    const object = requestSettingsObject(blueprint.dataObjects, source)
    const wanted = service.requestValueType ?? "text"
    const field = object === undefined ? settingFields.find(item => referenceKey(item.name) === referenceKey(source)) : undefined
    if (field !== undefined && (wanted === "number" ? field.valueType !== "number" && field.valueType !== "whole-number" : field.valueType !== "text")) {
      issues.push({ path: `externalServices[${index}].requestValueType`, rule: "capability.waybar-request-value-type", message: `Service '${service.name}' needs {value} to be ${wanted === "number" ? "a number" : "free text"}, but the saved setting '${field.name}' is ${field.valueType}. Save the identifier the service actually needs, or name a service that takes what the user saves; this preset has no geocoding step.` })
    }
    // A named placeholder is a text or number field; a number is substituted as its number text.
    for (const name of object === undefined ? [] : [...new Set([...templatePlaceholders(service.endpoint), ...templatePlaceholders(service.webPage)])]) {
      const named = object!.fields.find(item => referenceKey(item.name) === referenceKey(name))
      if (named !== undefined && !["text", "number", "whole-number"].includes(named.valueType)) {
        issues.push({ path: `externalServices[${index}].endpoint`, rule: "capability.waybar-request-value-type", message: `Service '${service.name}' puts {${name}} in a request address, but the saved setting '${named.name}' is ${named.valueType}; only text and number fields can be placed in an address.` })
      }
    }
    // A click that opens the page of a service keyed by saved settings must say where the saved values go in that page address.
    if (source !== "" && service.webPage.trim() !== "" && templatePlaceholders(service.webPage).length === 0 && blueprint.features.some(feature => feature.invokedBy === "click" && feature.usesServices.some(name => referenceKey(name) === referenceKey(service.name)))) {
      issues.push({ path: `externalServices[${index}].webPage`, rule: "capability.waybar-page-value", message: `A click feature opens the page of service '${service.name}', which is keyed by the saved setting '${source}', but webPage '${service.webPage}' has no placeholder. Put {value} (or the {field} names of the settings object) where the saved values go in the page address (each is percent-encoded), so the click opens that setting's page and not the site root.` })
    }
    // A coordinate query parameter takes a number: the single {value} form cannot supply a pair, a named form needs a bounded number field.
    const pairs = (service.endpoint.split("?")[1] ?? "").split("&").map(part => part.split("=") as [string, string | undefined])
    const coordinates = pairs.filter(([key]) => COORDINATE_PARAMETERS.has(key.toLowerCase()))
    if (object === undefined) {
      if (coordinates.some(([, value]) => value?.includes("{value}")) && (wanted !== "number" || coordinates.some(([, value]) => !value?.includes("{value}")))) {
        issues.push({ path: `externalServices[${index}].endpoint`, rule: "capability.waybar-request-coordinates", message: `Service '${service.name}' sends {value} as a coordinate (latitude or longitude). One saved value cannot supply a coordinate pair and a city name is not a coordinate; for a service keyed by coordinates set requestValueFrom to the name of the settings dataObject and write {latitude} and {longitude} (two number fields with min and max), or choose an endpoint that takes the one identifier the user saves (a city name, a station id).` })
      }
    } else {
      for (const [key, value] of coordinates.filter(([, text]) => (text ?? "").includes("{"))) {
        const only = templatePlaceholders(value ?? "")[0]
        const named = only !== undefined && value === `{${only}}` ? object.fields.find(item => referenceKey(item.name) === referenceKey(only)) : undefined
        const limit = ["lat", "latitude"].includes(key.toLowerCase()) ? 90 : 180
        if (named === undefined || (named.valueType !== "number" && named.valueType !== "whole-number") || named.min == null || named.max == null || named.min < -limit || named.max > limit) {
          issues.push({ path: `externalServices[${index}].endpoint`, rule: "capability.waybar-request-coordinates", message: `Service '${service.name}' sends '${key}=${value}' as a coordinate. The parameter must be exactly one placeholder naming a number field of '${object.name}' that declares min and max within -${limit}..${limit}, so a saved value outside the range is refused before any request.` })
        }
      }
    }
  })
  return issues
}

// The provider copies note text into the blueprint, so its notes never contain a word a check below rejects (cache.json, a binary unit).
const PROVIDER_RUNTIME_STORY = WAYBAR_RUNTIME_STORY.replace("re-reads cache.json", "re-reads the cached label")
const PROVIDER_UNIT_CONVENTION = WAYBAR_UNIT_CONVENTION.replace(/ Binary units \([^)]*\) are never used\./, " Every unit is a power of 1000.")

export const WAYBAR_PROVIDER_NOTES: readonly string[] = [
  "Each run of the Waybar module command is a separate process and nothing stays in memory between runs. Anything the module must remember between runs (a last good value, a saved choice) must be a dataObject with storage records or settings, never session or temporary. Set invokedBy to click for the feature that reacts to a click on the module and to schedule for the feature that refreshes by itself. The bar re-reads the cache only on its fragment interval, so state no latency tighter than that: write timings as how soon the cache is written after a successful fetch, never as when the bar label changes.",
  `Runtime story, stated once: ${PROVIDER_RUNTIME_STORY} Never write that each run, invocation, or execution of the module command measures, fetches, or requests; write that each refresh does. Put runsEverySeconds on the one feature that measures or fetches and leave it null on a feature that only shows the result; a bar module has no separate display feature unless the idea asks for one. A feature that only shows what the measuring feature stores is built first: list it in the measuring feature's buildsOn, never the reverse.`,
  `Cache and store, stated once: SQLite and the settings file are the only source of a detail; the cache is a derived label. A click that shows a detail (a notification with used and total memory) reads the stored record and, with no stored record, sends nothing and exits non-zero; never write that a feature reads the cache file. After a failed refresh the acceptance criteria say: ${FAILED_REFRESH_PLAIN}; never write that the cache is unchanged or untouched.`,
  `Failure story, stated once: when a measurement or fetch fails the bar shows the last good label marked stale and nothing stored changes; never write that the stored reading is marked stale or add a stale or failed flag to a dataObject (stale is derived when the module renders), never also write that the module shows the last stored value as if fresh, and say what is shown when no reading was ever stored (the empty label is always ${WAYBAR_EMPTY_LABEL}). A failed click shows no JSON; it makes the command exit non-zero.`,
  `${PROVIDER_UNIT_CONVENTION} Give a numeric example (a counter change and its label) only when you computed it with these rules, for example 6,250,000 bytes in 5 seconds is 10.0 Mb/s and 3,670,016,000 bytes is 3.67 GB.`,
  `${WAYBAR_TIME_CONVENTION} Declare an instant as a date-time field, never as a time of day.`,
  "When a feature reads an operating-system source instead of calling a service, set its systemSource to network-received, network-sent, load-average, memory (RAM), swap (swap space: SwapTotal and SwapFree), battery (the charge percentage and the charging state: charging, discharging, full, not charging, or unknown), disk-read (cumulative bytes read from the whole disks, /proc/diskstats sectors x 512: use it for a disk read speed), disk-space (free, used, and total space of the root file system), or temperature (the CPU temperature in Celsius, highest thermal zone) and name no file path or command yourself; otherwise leave it none. A system source is not an externalService. A measurement the idea reads from the machine (load, memory, swap, battery, disk, network speed, CPU temperature) must use the matching systemSource; never invent an externalService or leave systemSource none for it, because a feature that reads the machine with systemSource none has no reader in the kit. The module label's class is one of normal, warning, critical, stale, empty (never 'default'); write 'class normal' in an acceptance criterion.",
  "A maximum or minimum kept since the module started is state: a value that only has to live as long as the service process lives in the service process (the --service loop) and reaches the click action only through the cache file the loop writes (the label, tooltip, and value), because a click is a separate process and cannot read the service's memory; a value that must survive a restart is a declared field of a records or settings dataObject, so name that dataObject and field and say when it is reset, and never describe storage no dataObject declares. Say what 'since the module started' means (the start of the --service process).",
  "A response field is never a bare time of day, whether declared as time or as text: a time of day has no date and cannot become an instant. Choose the field that carries the full instant (a date-time, such as an ISO 8601 or epoch value) and declare it date-time. This is checked for fields declared as time; a text field that holds a time of day cannot be detected.",
  "A click feature that opens the page of a service for a saved setting (a city, a station) sets that externalService's webPage to the address template with {value}, filled from the saved setting and percent-encoded; a webPage without {value} opens the site root and ignores the saved value. Say that a stored reading, a stored peak, and a label are each written atomically per record (one write each), never as one transaction across records. Describe the module command as re-reading the cached label, never the stored record.",
  `The module label is composed by one feature, the one that shows the reading: set its labelTemplate to the exact label with {value} for the formatted reading ("{value}", "Sunset {value}"); leave labelTemplate empty on every other feature. When the idea states a limit (red below 10 GB free, amber above 80 percent), declare it on that same feature as thresholds {state warning or critical, comparison above or below, value} where value is in the unit of the raw reading (bytes for a size, bits per second for a rate, a plain number otherwise: 10 GB is 10000000000); "above" means strictly greater and "below" strictly less. Never declare a limit the idea does not state.`,
  "Every response value of a service has a path: the documented key path of the value in the JSON body as dot-separated keys (current.wind_speed_10m), never empty. The saved setting a service needs (a city) is saved with the module's --set KEY=VALUE, and --action refresh applies it immediately; say so in the feature that uses it.",
  "A feature whose label shows a unit sets unit to its symbol ('km/h', 'MB/s', '%') and labelTemplate to the text that carries it ('{value} km/h'): {value} is only the number. A size or rate unit of the unit convention (B, kB, MB, GB, TB, each also per second, and b/s, kb/s, Mb/s, Gb/s) fixes the unit the number is scaled to. Set valueDecimals when the idea shows a fixed number of decimals (12.3 km/h is 1); otherwise null.",
  "A disk read speed or a network speed is a rate of a cumulative counter: the feature uses a records dataObject that stores the previous counter (whole-number) and its sample time (date-time), because the rate is the counter change over the seconds since that stored sample, and a feature that reads the machine never uses the statvfs disk-space source for a speed.",
  "Use only request parameters that the documented API defines: never invent a parameter (a 'location' or 'city' query that the service does not document). Prefer a service that takes a place name or one saved identifier directly in its documented request. Intake checks that a latitude or longitude parameter is filled from a bounded number field, never from {value}; an invented parameter name cannot be detected, so confirm the endpoint's documented parameters before answering.",
  "A service keyed by coordinates (a weather, sun, or moon service that takes latitude and longitude) is supported without any geocoding: save latitude and longitude as two number fields of ONE settings dataObject, each with min and max (latitude -90 to 90, longitude -180 to 180), set the service's requestValueFrom to the NAME OF THAT settings dataObject, and write {Latitude} and {Longitude} (the exact field names) in the endpoint, for example https://api.open-meteo.com/v1/forecast?latitude={Latitude}&longitude={Longitude}&current=wind_speed_10m, and in webPage when a click opens the service page (webPage may use only placeholders the endpoint also uses). Each coordinate parameter is exactly one placeholder; the user sets each value with --set KEY=VALUE, one command per field; the records dataObject that keeps the reading includes a field with each of those names. Do not use {value} in this form. For a service keyed by one name or identifier (a city name, a station id) keep the single {value} form with requestValueFrom naming the one settings field.",
  "A response value is read by its documented path in the JSON body. When the documented value is a list (a daily forecast with one entry, such as a one-element array), declare the field with its scalar type (whole-number, number, text) and say in the behavior that the reading is the first element of the list, and that a null, missing, or empty value is a failed fetch; the kit's http::value_at, number_at and text_at implement exactly that.",
  "A records dataObject with singleRecord true that a refresh feature writes on every run needs only the operation create (the one write is insert-or-replace of the single row); declare update only when a separate feature edits it, and never promise a delete.",
  "Show a numeric size example (3.67 GB) only where a surface of that feature (label, tooltip, notification) shows a size; a label that shows a percent states the percent example instead. A labelTemplate carries the unit symbol of its reading ('{value}%' for a percent, never just '{value}').",
  "An externalService whose endpoint uses {value} sets requestValueType to text (a name or identifier) or number, and the saved setting named by requestValueFrom must have that valueType. A service that needs latitude and longitude uses the named form instead (see the coordinates note); one saved value is never a coordinate pair and a saved city name is never a coordinate, because this preset has no geocoding step.",
  `${WAYBAR_INTERVAL_NOTE}`,
  "Acceptance criteria about a schedule state what a test asserts (the default interval value and the interval the refresh pass returns), not a wall-clock wait. A reading that is only valid for one calendar day is a product limit this preset does not detect; say so in a non-goal instead of promising it.",
  "A value the user saves (a city, a station, a unit) is a settings dataObject with its fields, set by the user with the command's --set KEY=VALUE or by editing config.json; do not add a feature or a records dataObject for it. A records dataObject that keeps the last reading sets singleRecord true when only the latest reading is kept, and a reading fetched for a saved setting includes a field with that setting's name. Compare stored rows by their values, never by file bytes.",
]

const WAYBAR_COMPOSITION_ROOT_BASE = "The composition root of the module is the pair of hooks in src/module.rs: fetch_output and click construct every production dependency (the real record store when a data object is records, the real SystemReader, the real HTTP client, SystemLauncher) and pass them into the feature functions, which take them as parameters; src/main.rs only dispatches the command line to src/module.rs. The packaging focused test therefore asserts on the built binary, not on a function inside main(): in a temporary XDG tree it runs the real binary with --action refresh and then --once and checks the cache output, and it asserts that no production source file under src/ imports a test double. The expected result is stated, not guessed: the test never depends on the host or the network."

// Environment variables the kit defines so a test can point a system source at a fixture; the wiring text lists exactly these.
export const WAYBAR_SOURCE_OVERRIDES: Readonly<Partial<Record<Exclude<SystemSource, "none">, { env: string; fixture: string }>>> = {
  memory: { env: "MODULE_MEMINFO_PATH", fixture: "a file in /proc/meminfo format with MemTotal and MemAvailable lines" },
  swap: { env: "MODULE_MEMINFO_PATH", fixture: "a file in /proc/meminfo format with SwapTotal and SwapFree lines" },
  battery: { env: "MODULE_POWER_SUPPLY_DIR", fixture: "a directory tree with BAT*/capacity and BAT*/status files" },
  temperature: { env: "MODULE_THERMAL_DIR", fixture: "a directory tree with thermal_zone*/temp files in millidegrees" },
}

// The wiring paragraph for one blueprint: only the sources and services it declares, with the exact override variables.
export function waybarWiringTest(blueprint: Pick<NormalizedBlueprint, "features" | "externalServices">): string {
  const sources = waybarSources(blueprint).filter((source): source is Exclude<SystemSource, "none"> => source !== "none")
  const overridable = sources.filter(source => WAYBAR_SOURCE_OVERRIDES[source] !== undefined)
  const fixed = sources.filter(source => WAYBAR_SOURCE_OVERRIDES[source] === undefined)
  const parts: string[] = [WAYBAR_COMPOSITION_ROOT_BASE]
  if (overridable.length) {
    const vars = overridable.map(source => WAYBAR_SOURCE_OVERRIDES[source]!.env)
    parts.push(`The kit defines exactly these environment variables for the binary test: ${vars.join(", ")}${vars.length === 1 ? " and no other" : " and no others"}. ${overridable.map(source => `${WAYBAR_SOURCE_OVERRIDES[source]!.env} names ${WAYBAR_SOURCE_OVERRIDES[source]!.fixture}`).join("; ")}. The test writes the fixture, runs --action refresh (exit 0) and then --once, and asserts the exact label and class the fixture yields; with the variable pointing at a path that does not exist, --action refresh exits 2 with a message on stderr and --once prints the empty state (text ${WAYBAR_EMPTY_LABEL} with class empty) when nothing is stored.`)
  }
  if (fixed.length) parts.push(`${fixed.map(source => WAYBAR_SYSTEM_SOURCES[source].path).join(" and ")} ${fixed.length === 1 ? "has" : "have"} no override variable, so the host value is never asserted: the test asserts only that --action refresh exits 0 or 2 and that --once exits 0 and prints exactly one JSON object whose class is one of normal, warning, critical, stale, empty.`)
  if (blueprint.externalServices.length) parts.push(`With no saved setting or no reachable service, --action refresh exits 2 with a message on stderr and --once prints the empty state (text ${WAYBAR_EMPTY_LABEL} with class empty); a service-backed reading is asserted in the integration owner's focused test against a local listener, never through the binary.`)
  return parts.join(" ")
}

export function waybarLifecycleNote(blueprint: NormalizedBlueprint): string {
  const background = blueprint.features.some(feature => feature.runsEverySeconds !== null || feature.runsDailyAt !== null)
  const notifies = blueprint.platformNeeds.includes("notifications")
  return ` Lifecycle API (the one interface of this owner): the kit's module::serve_until(shutdown: &AtomicBool, pass) runs one refresh pass per interval until the flag is set and module::run_service registers SIGTERM and SIGINT on that flag; ${background ? "this task adds " : "this task adds, only if a feature later needs the service, "}module::shutdown_cleanup(settings, cache_path), which runs after serve_until returns, removes the temporary files under $XDG_RUNTIME_DIR/{app-id} except cache.json, and is called from run_service. It closes no database: a store is opened inside each refresh pass and dropped when the pass ends, so no connection outlives a pass. You may modify src/module.rs for this and nothing else in it. Its focused test calls module::serve_until with a pass closure that sets the flag and asserts that exactly one pass ran, then calls module::shutdown_cleanup(settings, cache_path) directly on a temporary directory and asserts that the temporary files are removed and cache.json is kept.${notifies ? " CON-PERMISSION-NOTIFICATIONS needs no code here: it is satisfied by notify in src/platform/launcher.rs, called from the click owner." : ""}`
}

// Settings are the config.json values map and nothing else: no table, migration, or generated id.
export function waybarSettingsInterface(item: NormalizedBlueprint["domainData"][number], operations: readonly string[]): string {
  const record = item.name.replace(/[^A-Za-z0-9]+(.)?/g, (_, next: string | undefined) => (next ?? "").toUpperCase()).replace(/^./, first => first.toUpperCase())
  const keys = item.fields.map(field => fieldIdentifier(field.name)).join(", ")
  const reads = operations.includes("read") ? ` get(settings) returns the ${record} struct built from those keys in Settings.values, or a String error that names a missing key (never a default);` : ""
  const writes = operations.some(operation => operation !== "read") ? " set(key, value) saves through config::set_pair;" : ""
  return `Interface: ${item.name} lives only in config.json (Settings.values, keys ${keys || "none"}); there is no SQLite table, migration, or generated id for it.${reads}${writes} OWN-DATA-STORE adds these functions to src/config.rs and no trait over a database. Its focused test saves a value through config::set_pair (the --set path) and reads it back; set_pair and load read XDG_CONFIG_HOME, so the test points it at a temporary directory inside one single test function (std::env::set_var is unsafe in edition 2024 and races across parallel tests, so every environment change stays in that one function), and asserts that reading an unset key returns the error that names the key.`
}

export function waybarSingleRecordDetail(item: NormalizedBlueprint["domainData"][number], operations: readonly string[] = []): string[] {
  // A single-record object written repeatedly has no separate update: its one write is insert-or-replace.
  const upsert = item.singleRecord && operations.includes("create") && !operations.includes("update")
  const methods = [...(operations.includes("create") ? [upsert ? "create is insert, which on a single record is insert-or-replace" : "create is insert"] : []), ...(operations.includes("update") ? ["update is update"] : []), ...(operations.includes("read") ? ["read is list and get"] : [])]
  return [
    ...(methods.length ? [`Operation to trait method: ${methods.join(", ")}; a feature calls only the methods of its own operations.`] : []),
    ...(item.singleRecord ? [upsert
      ? "Cardinality: exactly one record. insert is one transaction that inserts the row when the table is empty and otherwise replaces every stored field of the record returned by list()[0] (the highest id), keeping its id, so the table never holds two rows; the trait has no update and no delete method, and no feature may add one."
      : "Cardinality: exactly one record. The first successful write inserts it; every later write updates the record returned by list()[0] (the highest id) in place, so the table never holds two rows."] : []),
  ]
}

// The generic recovery sentence promises a correction or rebuild path no declared operation provides.
export function refineWaybarContracts(contracts: readonly GraphContract[]): GraphContract[] {
  const swap = (text: string): string => text.replace("Preserve the last valid record and expose a bounded correction or rebuild path.", "Keep the last valid record; a failed write changes nothing and the next refresh retries.")
  return contracts.map(item => item.kind === "data" || item.kind === "persistence" ? { ...item, failureBehavior: swap(item.failureBehavior), recovery: item.recovery.map(swap) } : item)
}

type DomainData = NormalizedBlueprint["domainData"]
type Service = NormalizedBlueprint["externalServices"][number]

export interface WaybarSlot {
  readonly name: string
  readonly number: boolean
  readonly min: number | null
  readonly max: number | null
}

// The named placeholders of a service keyed by a settings object, each with the declared field facts; undefined for the single {value} form.
export function waybarRequestSlots(service: Service, domainData: DomainData): WaybarSlot[] | undefined {
  const object = requestSettingsObject(domainData, service.requestValueFrom)
  if (object === undefined) return undefined
  return [...new Set([...templatePlaceholders(service.endpoint), ...templatePlaceholders(service.webPage)])].map(name => {
    const field = object.fields.find(item => referenceKey(item.name) === referenceKey(name))
    return { name, number: field?.valueType === "number" || field?.valueType === "whole-number", min: field?.min ?? null, max: field?.max ?? null }
  })
}

const PERCENT_ENCODING = "percent-encoded: RFC 3986 unreserved characters kept, every other byte of the UTF-8 text as upper-case %XX, a space as %20, so 'San José' becomes 'San%20Jos%C3%A9'; use http::percent_encode (src/platform/http.rs, kit), no other crate"

function slotText(slots: readonly WaybarSlot[]): string {
  return slots.map(slot => `{${slot.name}} (${slot.number ? `a number${slot.min !== null && slot.max !== null ? ` from ${slot.min} to ${slot.max}` : ""}` : "text"})`).join(", ")
}

// How named placeholders are filled, once: the kit's http::fill_url does it and the task passes one slot per placeholder.
function namedFillText(service: Service, slots: readonly WaybarSlot[], template: string): string {
  return `${template} with each placeholder (${slotText(slots)}) replaced by the saved value of the field of the same name in the settings object '${service.requestValueFrom}' (the user saves each with the module's --set KEY=VALUE, one command per field): a number field is substituted as its number text (it must be finite, and inside the field's declared min and max when it has them; a whole number has no decimal point) and a text field is ${PERCENT_ENCODING}. Build the address only with http::fill_url (src/platform/http.rs, kit), passing one http::Slot per placeholder: Slot::Text(value) or Slot::Number { value, min, max }; it returns Err for an empty value, a number that is not finite or is outside min..max, and a placeholder that has no slot`
}

// The click page address: placeholders replaced by the saved values; a click with a missing saved value fails before the address is built.
export function waybarPageDetail(service: Service, domainData: DomainData = []): string[] {
  if (templatePlaceholders(service.webPage).length === 0) return []
  const slots = waybarRequestSlots(service, domainData)
  if (slots !== undefined) {
    return [`Page address: the web page template ${namedFillText(service, slots.filter(slot => templatePlaceholders(service.webPage).includes(slot.name)), service.webPage)}. The integration owner exposes the function page_url, exactly pub fn page_url(values: &BTreeMap) -> Result, with the same BTreeMap and Result as request_url (the saved values as text keyed by field name, never an absent value; the Ok text is the address) and the click owner calls that function instead of building the address itself, after reading every saved setting it needs: with any value not saved the click returns Err (exit 2, nothing is opened) before page_url is called.`]
  }
  return [`Page address: the web page template ${service.webPage} with {value} replaced by the saved setting '${service.requestValueFrom}' (${PERCENT_ENCODING}); the integration owner exposes the function page_url, exactly pub fn page_url(value: &str) -> String (the saved value as text, never an absent value; the returned text is the address) and the click owner calls that function instead of building the address itself, after reading the saved setting: with no value saved the click returns Err (exit 2, nothing is opened) before page_url is called.`]
}

export function waybarRequestDetail(service: Service, domainData: DomainData = []): string[] {
  if (templatePlaceholders(service.endpoint).length === 0) return []
  const slots = waybarRequestSlots(service, domainData)
  const tail = "The integration owner exposes the function request_url, exactly pub fn request_url(origin: &str, values: &BTreeMap) -> Result, where BTreeMap is std::collections::BTreeMap from the field name (String) to its saved text (String) and the Result is Ok with the address (String) or Err with a message (String) (origin is the scheme and host with no trailing slash; values holds the saved value of each field by name; the Ok text is the address; production passes the documented host and the focused tests pass a local 127.0.0.1 listener, so no test reaches the live service); a response whose status or value is not the documented success shape is a failed fetch."
  if (slots !== undefined) {
    return [`Request URL: ${namedFillText(service, slots.filter(slot => templatePlaceholders(service.endpoint).includes(slot.name)), service.endpoint)}. A saved value that is missing or refused is a failed fetch: no request is sent, exactly as with no saved value in the single-value form. ${tail}`]
  }
  return [`Request URL: ${service.endpoint} with {value} replaced by the saved setting '${service.requestValueFrom}' (${PERCENT_ENCODING}). The integration owner exposes the function request_url, exactly pub fn request_url(origin: &str, value: &str) -> String (origin is the scheme and host with no trailing slash; value is the saved value as text; the returned text is the address; production passes the documented host and the focused tests pass a local 127.0.0.1 listener, so no test reaches the live service); a response whose status or value is not the documented success shape is a failed fetch.`]
}

// How a response value is read: a scalar field takes element 0 of a one-element array; null, missing, or empty is a failed fetch.
export function waybarResponseDetail(service: NormalizedBlueprint["externalServices"][number]): string[] {
  if (!service.responseFields.length) return []
  const paths = service.responseFields.filter(field => field.path !== "").map(field => `${field.name} at [${field.path.split(".").map(key => JSON.stringify(key)).join(", ")}]`)
  return [`${paths.length ? `Response paths (the key lists passed to http::number_at or http::text_at): ${paths.join("; ")}. ` : ""}Response shape: every response value is read with http::value_at, http::number_at or http::text_at (src/platform/http.rs, kit), never by deserializing it into a scalar struct field. When the JSON value at the documented path is an array, a field declared with a scalar type is read from element 0 (a daily list that holds one element); a value that is null, missing, or an empty array is a failed fetch, handled exactly as the refresh failure behavior above.`]
}

// Interface lines for the feature that composes the label and declares severity limits.
export function waybarFeatureDetail(feature: NormalizedBlueprint["features"][number]): string[] {
  const lines: string[] = []
  const shown = feature.unit !== ""
    ? `the bare number of the reading in the fixed unit ${feature.unit} (the number is scaled to that unit; the units rule does not choose a unit)${feature.valueDecimals !== null ? ` with exactly ${feature.valueDecimals} decimal${feature.valueDecimals === 1 ? "" : "s"}, rounded half away from zero (12.0 stays "12.0")` : ", with the units rule's decimals"}; the template carries the unit text ${feature.unit}`
    : "the reading as the label shows it (a size or rate in the units rule's format and an instant as HH:MM where this document states those rules; any other number as stored, a whole number without decimals; the template carries any unit symbol such as %)"
  if (feature.labelTemplate !== "") lines.push(`Label: exactly "${feature.labelTemplate}" with {value} replaced by ${shown}; before the first successful refresh the label is "${WAYBAR_EMPTY_LABEL}", the kit default of Settings.text in src/config.rs, which no task changes.`)
  if (feature.thresholds.length) {
    const rows = feature.thresholds.map(item => `${item.state === "critical" ? "critical (red)" : "warning (amber)"} when the raw value is ${item.comparison === "above" ? "above" : "below"} ${item.value}`)
    lines.push(`Thresholds on the raw ModuleOutput.value (never the rounded label; the comparison is strict): ${rows.join("; ")}; critical wins over warning. The kit declares them in THRESHOLDS in src/module.rs and its severity function implements both directions, so no task edits them; the label function only sets ModuleOutput.value to the raw reading in the unit these thresholds use.`)
  }
  return lines
}
