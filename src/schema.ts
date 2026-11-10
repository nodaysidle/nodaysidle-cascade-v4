import { z } from "zod"
import { fieldIdentifier } from "./kitText"

const shortMeaning = z.string().trim().min(1).max(120)
const compactMeaning = z.string().trim().min(1).max(480)
const meaning = z.string().trim().min(4).max(1_200)
const meaningList = z.array(compactMeaning).max(8)
const requiredMeaningList = meaningList.min(1)

// Every operating-system source a bar-module feature can read; waybarContracts.ts and waybarKit.ts must cover each one (tests/waybar-sources.test.ts iterates this list).
export const SYSTEM_SOURCES = ["none", "network-received", "network-sent", "load-average", "memory", "swap", "battery", "disk-space", "disk-read", "temperature"] as const
export const PlatformNeedSchema = z.enum([
  "audio-input",
  "camera",
  "clipboard",
  "global-hotkey",
  "accessibility-control",
  "notifications",
  "filesystem",
  "local-storage",
  "network",
  "background-execution",
  "launch-at-login",
  "location",
])

// The provider never sees "filesystem": file access is derived only from userFileAccess and
// declared documents. Removing it from the JSON schema removes the single most common schema
// violation instead of asking the model to remember the exception.
export const ProviderPlatformNeedSchema = PlatformNeedSchema.exclude(["filesystem"])

// File access is never a feature platform need: it comes only from userFileAccess and declared
// document data objects, so the provider has no second place to state it.
export const FeaturePlatformNeedSchema = ProviderPlatformNeedSchema

// A fixed set of options the user picks from, asked as a required field so the options and the
// initial choice are never left for the builder to invent.
const ChoiceListSchema = z.strictObject({
  name: shortMeaning,
  options: z.array(shortMeaning).min(2).max(24),
  initial: shortMeaning,
})

export const FeatureRecoverySchema = z.enum(["retry", "fallback", "exit"])
export const FeatureSurfaceSchema = z.enum([
  "main",
  "item-page",
  "about-page",
  "not-found-page",
  "collection-index",
  "tag-page",
  "search-page",
  "page",
])
export const ClipboardAccessSchema = z.enum(["none", "copy", "read", "read-write"])

const FeatureSchema = z.strictObject({
  name: shortMeaning,
  userOutcome: compactMeaning,
  trigger: compactMeaning,
  behavior: meaning,
  failureOutcome: compactMeaning,
  failureRecovery: FeatureRecoverySchema,
  surface: FeatureSurfaceSchema,
  acceptanceSignals: requiredMeaningList,
  usesPlatformNeeds: z.array(FeaturePlatformNeedSchema).max(12),
  usesTray: z.boolean().default(false),
  clipboardAccess: ClipboardAccessSchema.default("none"),
  clipboardWatch: z.boolean().default(false),
  usesData: z.array(shortMeaning).max(8),
  usesServices: z.array(shortMeaning).max(8),
  userFileAccess: z.enum(["none", "opens", "saves", "opens-and-saves"]),
  choiceLists: z.array(ChoiceListSchema).max(4),
  // Other features whose screen or state this feature extends; fixes the build order.
  buildsOn: z.array(shortMeaning).max(3).default([]),
  // What this feature does to the data it uses; "delete" is promised only when a feature declares it.
  dataOperations: z.array(z.strictObject({ data: shortMeaning, operations: z.array(z.enum(["create", "read", "update", "edit", "delete"])).min(1).max(5) })).max(8).default([]),
  // How a read-only feature narrows the main list: text (type to search), flag (an on/off toggle such as only-not-done), sort (reorder); none for every other feature.
  narrowsListBy: z.enum(["none", "text", "flag", "sort"]).optional(),
  // What starts the feature: the user through a control, a click on the bar module, its own schedule, app launch, or a global shortcut.
  invokedBy: z.enum(["user-control", "click", "schedule", "launch", "shortcut"]).default("user-control"),
  // How often the feature runs by itself; null when the user triggers it. Give the exact interval the idea states.
  runsEverySeconds: z.number().int().min(1).max(604800).nullable().default(null),
  // A fixed local time of day the feature runs, as HH:MM; null otherwise.
  runsDailyAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
  // The operating-system source the feature reads a measurement from; none when it reads no system counter. Only a bar-module preset accepts a value other than none.
  systemSource: z.enum(SYSTEM_SOURCES).default("none"),
  // Severity limits on the raw numeric reading the module label shows (bytes for a size, bits per second for a rate, a plain number otherwise): a reading above or below value turns the module warning (amber) or critical (red). Empty when the idea states no limit. Only a bar-module preset uses it.
  thresholds: z.array(z.strictObject({ state: z.enum(["warning", "critical"]), comparison: z.enum(["above", "below"]), value: z.number().min(-1e15).max(1e15) })).max(4).optional(),
  // The exact module label for a fresh reading, with {value} standing for the formatted reading (for example "{value}" or "Sunset {value}"); empty for a feature that does not compose the label. Only a bar-module preset uses it.
  labelTemplate: z.string().max(80).optional(),
  // The unit symbol the idea shows next to the label's value ("km/h", "MB/s", "%", "°C"); empty when the label shows no unit. A size or rate unit fixes the unit the reading is scaled to (the units rule does not choose); labelTemplate must contain it. Only a bar-module preset uses it.
  unit: z.string().max(24).optional(),
  // Exact number of decimals the label's value is shown with (12.0 is "12.0" when 1); null when the units rule or the stored number decides. Only a bar-module preset uses it.
  valueDecimals: z.number().int().min(0).max(4).nullable().optional(),
  // A reminder whose time of day is a stored record's field: the data object, its time field, the text field that titles the notification, and the constant notification body (quoted in acceptanceSignals); null otherwise.
  // True when the feature shows the current time of day (a clock, a world-clock list), so it must re-read the time while the app is open; leave unset otherwise.
  showsCurrentTime: z.boolean().optional(),
  // True when the feature selects, counts, or filters records by the current calendar day (today's entries), so it must read the clock; leave unset otherwise.
  readsCurrentDay: z.boolean().optional(),
  // Seconds between refreshes of a value the feature shows live while the app is open (a countdown or elapsed time shown in seconds is 1); null when nothing it shows changes by itself.
  refreshesEverySeconds: z.number().int().min(1).max(60).nullable().optional(),
  runsAtField: z.strictObject({ data: shortMeaning, timeField: shortMeaning, titleField: shortMeaning, notificationBody: compactMeaning }).nullable().default(null),
  // The notification a scheduled (runsDailyAt or runsEverySeconds) feature posts: the literal title (quoted in acceptanceSignals) and what its text says (a constant sentence, or a rule such as "the low medicine names joined by ', ', or 'No low medicines' when none"); null otherwise.
  scheduledNotification: z.strictObject({ titleText: compactMeaning, notificationBody: compactMeaning }).nullable().optional(),
})

export const DataStorageSchema = z.enum(["settings", "records", "document", "app-files", "secret", "temporary", "session"])
export const DataWriteModeSchema = z.enum(["direct", "atomic-replace"])

export const DataValueTypeSchema = z.enum(["text", "long-text", "number", "whole-number", "flag", "date", "date-time", "time", "text-list", "reference"])

// A date with initial "today" or a date-time with initial "now" is stamped by the app from the injected clock when the record is created.
export const clockInitial = (field: { readonly valueType: string; readonly initial?: string | null }): "today" | "now" | null =>
  (field.valueType === "date" && field.initial === "today") || (field.valueType === "date-time" && field.initial === "now") ? field.initial : null

const DataFieldSchema = z.strictObject({
  name: shortMeaning,
  valueType: DataValueTypeSchema,
  // True when the value may be absent (for example the end time of a running timer).
  optional: z.boolean().default(false),
  // Lower and upper bound of a number or whole-number field when the idea states a range (a mood from one to five); otherwise null.
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  // The value the app itself stores when it creates a record, so the user never types the field (a status that starts as Not started); "today" on a date and "now" on a date-time mean the injected clock's value at creation; null for a value the user enters.
  initial: z.string().max(80).nullable().optional(),
  // True for a date or date-time that an action of the app writes (a last-watered day a Watered button stamps); the add and edit forms have no input for it. False for every field the user enters.
  appStamped: z.boolean().nullable().optional(),
})

const DataObjectSchema = z.strictObject({
  name: shortMeaning,
  purpose: compactMeaning,
  sensitivity: z.enum(["public", "internal", "personal", "sensitive"]),
  retentionIntent: compactMeaning,
  storage: DataStorageSchema,
  writeMode: DataWriteModeSchema,
  // The stored shape: one entry per value the app keeps for this object (records and documents).
  fields: z.array(DataFieldSchema).max(12).default([]),
  // True when the app keeps exactly one record of this object and updates it in place (for example the latest reading).
  singleRecord: z.boolean().default(false),
  // How many entries the idea states for this object when it names none of them (null when it states no count or names the entries).
  entryCount: z.number().int().min(1).max(12).nullable().default(null),
})

const ExternalServiceSchema = z.strictObject({
  name: shortMeaning,
  purpose: compactMeaning,
  dataSent: meaningList,
  credentialRequired: z.boolean(),
  // The documented HTTPS endpoint the app calls, and the response values it reads. Name a real, documented public API.
  endpoint: z.string().max(300).default(""),
  // The service's human-readable web page, only when a feature opens it for the user; otherwise empty.
  webPage: z.string().max(300).default(""),
  // The name of a saved-setting field whose value replaces {value} in endpoint and webPage (for example a city or station identifier); empty when neither contains {value}.
  requestValueFrom: z.string().max(120).default(""),
  // What {value} must be for the endpoint to work: free text (a name or identifier) or one number. The saved-setting field named by requestValueFrom must have the matching valueType.
  requestValueType: z.enum(["text", "number"]).optional(),
  // Each response value carries the documented key path of the value in the JSON body ("current.wind_speed_10m"); only a bar-module preset requires it.
  responseFields: z.array(DataFieldSchema.extend({ path: z.string().max(120).optional() })).max(12).default([]),
})

export const MAX_IDEA_SENTENCES = 60

// One entry per numbered sentence of the user's idea, so a dropped requirement or an unrequested
// feature is a structural fact the pipeline can check instead of prose it has to trust.
const IdeaCoverageSchema = z.strictObject({
  sentence: z.number().int().min(1).max(MAX_IDEA_SENTENCES),
  features: z.array(shortMeaning).max(12),
  outsideFeatures: z.enum(["none", "product", "non-goal", "constraint"]),
})

export const SemanticBlueprintSchema = z.strictObject({
  productName: z.string().trim().min(1).max(80),
  summary: meaning,
  targetUsers: requiredMeaningList,
  goals: requiredMeaningList,
  nonGoals: meaningList,
  features: z.array(FeatureSchema).min(1).max(12),
  dataObjects: z.array(DataObjectSchema).max(8),
  externalServices: z.array(ExternalServiceSchema).max(8),
  platformNeeds: z.array(ProviderPlatformNeedSchema),
  qualityRequirements: meaningList,
  productConstraints: meaningList,
  ideaCoverage: z.array(IdeaCoverageSchema).min(1).max(MAX_IDEA_SENTENCES),
})

type ParsedBlueprint = z.infer<typeof SemanticBlueprintSchema>
// A parsed blueprint always carries entryCount (default null); hand-built blueprints may omit it.
export type SemanticBlueprint = Omit<ParsedBlueprint, "dataObjects"> & { dataObjects: Array<Omit<ParsedBlueprint["dataObjects"][number], "entryCount"> & { entryCount?: number | null }> }
export type PlatformNeed = z.infer<typeof PlatformNeedSchema>
export type FeaturePlatformNeed = z.infer<typeof FeaturePlatformNeedSchema>
export type DataValueType = z.infer<typeof DataValueTypeSchema>
export type DataStorage = z.infer<typeof DataStorageSchema>
export type DataWriteMode = z.infer<typeof DataWriteModeSchema>
export type FeatureRecovery = z.infer<typeof FeatureRecoverySchema>
export type FeatureSurface = z.infer<typeof FeatureSurfaceSchema>
export type ClipboardAccess = z.infer<typeof ClipboardAccessSchema>

interface ClosedJsonSchema {
  readonly type?: string
  readonly properties?: Readonly<Record<string, unknown>>
  readonly required?: readonly string[]
  readonly additionalProperties?: boolean
  readonly [key: string]: unknown
}

// The provider's strict JSON mode requires every property of an object to be listed as required, so an
// optional zod field is still sent as required; its value is always valid (an empty list, "", false, null).
function requireEveryProperty(node: unknown): void {
  if (!node || typeof node !== "object") return
  const record = node as { type?: string; properties?: Record<string, unknown>; required?: string[] }
  if (record.type === "object" && record.properties) record.required = Object.keys(record.properties)
  for (const value of Object.values(node)) requireEveryProperty(value)
}

export const providerJsonSchema = (() => {
  const schema = z.toJSONSchema(SemanticBlueprintSchema, { target: "draft-7" }) as ClosedJsonSchema
  requireEveryProperty(schema)
  return schema
})()

export interface SemanticIssue {
  readonly path: string
  readonly rule: string
  readonly message: string
}

export type BlueprintParseResult =
  | { readonly ok: true; readonly blueprint: SemanticBlueprint }
  | {
      readonly ok: false
      readonly failure:
        | { readonly kind: "invalid-json"; readonly issues: readonly SemanticIssue[] }
        | { readonly kind: "schema-invalid"; readonly issues: readonly SemanticIssue[] }
    }

export interface BlueprintInstructionInput {
  readonly idea: string
  // From the preset's declared capabilities; false adds the no-tray sentence.
  readonly trayAvailable?: boolean
  // From the preset's declared capabilities; false adds the no-background sentence.
  readonly backgroundAvailable?: boolean
  // Preset-specific sentences for the provider (from the preset's declared providerNotes).
  readonly presetNotes?: readonly string[]
}

function issuePath(path: PropertyKey[]): string {
  const result = path.reduce<string>((current, part) => typeof part === "number"
    ? `${current}[${part}]`
    : current ? `${current}.${String(part)}` : String(part), "")
  return result || "$"
}

function sliceBalancedJsonObject(text: string, start: number): string {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]!
    if (inString) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === "\"") inString = false
      continue
    }
    if (char === "\"") {
      inString = true
      continue
    }
    if (char === "{") depth += 1
    else if (char === "}") {
      depth -= 1
      if (depth === 0) return text.slice(start, index + 1)
    }
  }
  return text.slice(start)
}

export function extractProviderJsonText(text: string): string {
  let candidate = text.replace(/^\uFEFF/, "").trim()
  if (!candidate) return candidate

  const fullFence = candidate.match(/^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```$/i)
  if (fullFence?.[1]) candidate = fullFence[1].trim()

  if (!candidate.startsWith("{")) {
    const inlineFence = candidate.match(/```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```/i)
    if (inlineFence?.[1]) candidate = inlineFence[1].trim()
  }

  if (!candidate.startsWith("{")) {
    const start = candidate.indexOf("{")
    if (start >= 0) candidate = sliceBalancedJsonObject(candidate, start)
  }

  return candidate.trim()
}

function invalidJsonIssue(text: string): SemanticIssue {
  const trimmed = text.trim()
  const looksTruncated = trimmed.startsWith("{") && !trimmed.endsWith("}")
  return {
    path: "$",
    rule: "provider.invalid-json",
    message: looksTruncated
      ? "The completed provider response looks truncated before it became valid JSON."
      : "The completed provider response is not valid JSON.",
  }
}

function parseJsonValue(text: string): unknown {
  const candidates = [text]
  const extracted = extractProviderJsonText(text)
  if (extracted && extracted !== text) candidates.push(extracted)

  for (const candidate of candidates) {
    if (!candidate.trim()) continue
    try {
      let value: unknown = JSON.parse(candidate)
      if (typeof value === "string") {
        const inner = extractProviderJsonText(value)
        value = JSON.parse(inner)
      }
      return value
    } catch {
      continue
    }
  }

  throw new Error("invalid-json")
}

export function parseBlueprintJson(text: string): BlueprintParseResult {
  let value: unknown
  try {
    value = parseJsonValue(text)
  } catch {
    return {
      ok: false,
      failure: {
        kind: "invalid-json",
        issues: [invalidJsonIssue(text)],
      },
    }
  }

  const parsed = SemanticBlueprintSchema.safeParse(withoutRedundantFileNeeds(value))
  if (parsed.success) return { ok: true, blueprint: parsed.data }

  return {
    ok: false,
    failure: {
      kind: "schema-invalid",
      issues: parsed.error.issues.map(issue => ({
        path: issuePath(issue.path),
        rule: `schema.${issue.code}`,
        message: schemaIssueMessage(issue, value),
      })),
    },
  }
}

// The repair request passes these messages to the provider, so each one says what to change: the
// allowed values of a closed field, and where file access belongs. The provider's own text is never
// quoted, because the same message is shown in the app.
function schemaIssueMessage(issue: z.core.$ZodIssue, response: unknown): string {
  const base = "The completed provider response does not match the compact semantic schema."
  if (issue.code === "invalid_value" && issue.values.length) {
    // A short code word (not free text) is safe to name, and it makes the failure diagnosable.
    const received = valueAtPath(response, issue.path)
    const found = typeof received === "string" && /^[a-z0-9][a-z0-9-]{0,39}$/.test(received) ? ` Found ${received}.` : ""
    const allowed = `${found.trim() ? `${found.trim()} ` : ""}Allowed values here: ${issue.values.map(value => String(value)).join(", ")}.`
    const featureNeed = issue.path.length >= 4 && issue.path[0] === "features" && issue.path[2] === "usesPlatformNeeds"
    return featureNeed
      ? `${base} ${allowed} File access is not a feature platform need: remove filesystem here and set this feature's userFileAccess to opens, saves, or opens-and-saves instead.`
      : `${base} ${allowed}`
  }
  return `${base} ${issue.message}`
}

function valueAtPath(value: unknown, path: readonly PropertyKey[]): unknown {
  return path.reduce<unknown>((current, key) => (current && typeof current === "object" ? (current as Record<PropertyKey, unknown>)[key] : undefined), value)
}

// A feature that states its file access in userFileAccess and also lists filesystem among its
// platform needs says the same thing twice; the extra entry is dropped instead of failing the whole
// response. A feature that lists filesystem but declares no file access still fails, because its
// intent is unclear.
function withoutRedundantFileNeeds(value: unknown): unknown {
  if (!value || typeof value !== "object" || !Array.isArray((value as { features?: unknown }).features)) return value
  const root = value as { features: unknown[] }
  return {
    ...root,
    features: root.features.map(feature => {
      if (!feature || typeof feature !== "object") return feature
      const item = feature as { usesPlatformNeeds?: unknown; userFileAccess?: unknown }
      const declaresFiles = typeof item.userFileAccess === "string" && item.userFileAccess !== "none"
      if (!declaresFiles || !Array.isArray(item.usesPlatformNeeds)) return feature
      return { ...item, usesPlatformNeeds: item.usesPlatformNeeds.filter(need => need !== "filesystem") }
    }),
  }
}

function semanticStrings(value: unknown, path = ""): Array<{ path: string; value: string }> {
  if (typeof value === "string") return [{ path: path || "$", value }]
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => semanticStrings(item, `${path}[${index}]`))
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => semanticStrings(item, path ? `${path}.${key}` : key))
  }
  return []
}

const unusableMeaning = /^\s*(?:tbd|todo|n\/?a|unknown|\?+|placeholder(?: text)?)\s*[.!]?\s*$/i
const secretPatterns = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bBearer\s+[A-Za-z0-9._~-]{16,}\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[opusr]_[A-Za-z0-9]{20,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /\b(?:api[_ -]?key|access[_ -]?token|client[_ -]?secret|password)\s*[:=]\s*["']?[A-Za-z0-9._~-]{16,}/i,
]

// Replaces anything that looks like a credential before provider text is sent anywhere again.
export function redactSecretMaterial(text: string): string {
  return secretPatterns.reduce((value, pattern) => value.replace(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`), "[removed secret]"), text)
}

// Two names are one name when their letters and digits match (case, accents, spaces and punctuation ignored); normalization keys on this.
export function nameKey(name: string): string {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "")
}

export function referenceKey(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").replace(/[.]+$/, "").toLocaleLowerCase("en-US")
}

// A temporary atomic-replace data object is the in-progress copy of atomic saves, so it belongs to
// every feature that uses a stored atomic-replace data object. Declared fields decide this, never wording.
export function featureDataUses(blueprint: SemanticBlueprint, feature: SemanticBlueprint["features"][number]): string[] {
  const byKey = new Map(blueprint.dataObjects.map(item => [referenceKey(item.name), item]))
  const writesAtomicData = feature.usesData.some(name => {
    const item = byKey.get(referenceKey(name))
    return item?.writeMode === "atomic-replace" && item.storage !== "temporary"
  })
  if (!writesAtomicData) return [...feature.usesData]
  const scratch = blueprint.dataObjects.filter(item => item.storage === "temporary" && item.writeMode === "atomic-replace").map(item => item.name)
  const listed = new Set(feature.usesData.map(referenceKey))
  return [...feature.usesData, ...scratch.filter(name => !listed.has(referenceKey(name)))]
}

export function featureReferenceIssues(blueprint: SemanticBlueprint): SemanticIssue[] {
  const issues: SemanticIssue[] = []
  const dataKeys = new Set(blueprint.dataObjects.map(item => referenceKey(item.name)))
  const serviceKeys = new Set(blueprint.externalServices.map(item => referenceKey(item.name)))
  const usedData = new Set<string>()
  const usedServices = new Set<string>()
  blueprint.features.forEach((feature, featureIndex) => {
    feature.usesData.forEach((name, index) => {
      if (dataKeys.has(referenceKey(name))) usedData.add(referenceKey(name))
      else issues.push({ path: `features[${featureIndex}].usesData[${index}]`, rule: "semantic.unknown-data-reference", message: `Feature '${feature.name}' references data '${name}', which is not a declared dataObject.` })
    })
    feature.usesServices.forEach((name, index) => {
      if (serviceKeys.has(referenceKey(name))) usedServices.add(referenceKey(name))
      else issues.push({ path: `features[${featureIndex}].usesServices[${index}]`, rule: "semantic.unknown-service-reference", message: `Feature '${feature.name}' references service '${name}', which is not a declared externalService.` })
    })
  })
  blueprint.features.forEach(feature => featureDataUses(blueprint, feature).forEach(name => usedData.add(referenceKey(name))))
  blueprint.dataObjects.forEach((item, index) => {
    if (!usedData.has(referenceKey(item.name))) issues.push({ path: `dataObjects[${index}]`, rule: "semantic.unused-data-object", message: `No feature lists '${item.name}' in usesData, so no feature owns it.` })
  })
  blueprint.externalServices.forEach((item, index) => {
    if (!usedServices.has(referenceKey(item.name))) issues.push({ path: `externalServices[${index}]`, rule: "semantic.unused-external-service", message: `No feature lists '${item.name}' in usesServices, so no feature calls it.` })
  })
  return issues
}

// Declared enums and references are not product meaning, so only prose decides whether a feature is usable.
function featureProse(feature: SemanticBlueprint["features"][number]): string[] {
  return [feature.name, feature.userOutcome, feature.trigger, feature.behavior, feature.failureOutcome, ...feature.acceptanceSignals]
}

// A choice list named exactly like a stored text field fixes that field's values (a difficulty of easy, moderate, or hard).
export function fieldChoiceList<T extends { readonly name: string; readonly options: readonly string[]; readonly initial: string }>(features: readonly { readonly choiceLists?: readonly T[] }[], field: { readonly name: string; readonly valueType: string }): T | undefined {
  return field.valueType === "text" ? features.flatMap(feature => feature.choiceLists ?? []).find(list => referenceKey(list.name) === referenceKey(field.name)) : undefined
}

// The initial choice must be an option, and a list two features share must have the same options.
function choiceListIssues(blueprint: SemanticBlueprint): SemanticIssue[] {
  const issues: SemanticIssue[] = []
  const byName = new Map<string, { readonly feature: string; readonly options: string }>()
  blueprint.features.forEach((feature, featureIndex) => {
    feature.choiceLists.forEach((list, listIndex) => {
      const path = `features[${featureIndex}].choiceLists[${listIndex}]`
      const options = list.options.map(referenceKey)
      if (!options.includes(referenceKey(list.initial))) {
        issues.push({ path, rule: "semantic.choice-initial-not-option", message: `Choice list '${list.name}' in '${feature.name}' starts at '${list.initial}', which is not one of its options.` })
      }
      const signature = [...new Set(options)].sort().join("|")
      const earlier = byName.get(referenceKey(list.name))
      if (earlier && earlier.options !== signature) {
        issues.push({ path, rule: "semantic.choice-list-mismatch", message: `Choice list '${list.name}' has different options in '${earlier.feature}' and '${feature.name}'.` })
      }
      if (!earlier) byName.set(referenceKey(list.name), { feature: feature.name, options: signature })
    })
  })
  return issues
}

// A saved file needs a declared document so its placement and atomic-write rule come from a field.
function savedFileDocumentIssues(blueprint: SemanticBlueprint): SemanticIssue[] {
  const documents = new Set(blueprint.dataObjects.filter(item => item.storage === "document").map(item => referenceKey(item.name)))
  return blueprint.features.flatMap((feature, index) =>
    (feature.userFileAccess === "saves" || feature.userFileAccess === "opens-and-saves") && !feature.usesData.some(name => documents.has(referenceKey(name)))
      ? [{
        path: `features[${index}].usesData`,
        rule: "semantic.saved-file-without-document",
        message: `Feature '${feature.name}' saves a file the user chooses but lists no document dataObject for it.`,
      }]
      : [])
}

function duplicateNameIssues(blueprint: SemanticBlueprint): SemanticIssue[] {
  const issues: SemanticIssue[] = []
  const check = (label: string, values: readonly string[]) => {
    const seen = new Set<string>()
    values.forEach((name, index) => {
      const key = nameKey(name) || referenceKey(name)
      if (seen.has(key)) issues.push({ path: `${label}[${index}]`, rule: "semantic.duplicate-name", message: `${label} contains '${name}' more than once; names must be unique after case and punctuation normalization.` })
      seen.add(key)
    })
  }
  check("features", blueprint.features.map(feature => feature.name))
  check("dataObjects", blueprint.dataObjects.map(item => item.name))
  check("externalServices", blueprint.externalServices.map(item => item.name))
  return issues
}

// Field names become identifiers (SQL columns, Rust fields, settings keys, Astro keys): two that map to one identifier, or one that is the built-in id, cannot coexist.
function fieldNameIssues(blueprint: SemanticBlueprint): SemanticIssue[] {
  return blueprint.dataObjects.flatMap((item, index) => {
    const seen = new Set<string>()
    return item.fields.flatMap((field, position): SemanticIssue[] => {
      const path = `dataObjects[${index}].fields[${position}].name`
      const key = nameKey(field.name) || referenceKey(field.name)
      if (key === "id") return [{ path, rule: "semantic.field-id", message: `Field '${field.name}' of '${item.name}' is the id the compiler adds to every record; remove it.` }]
      const keys = [`name:${key}`, `identifier:${fieldIdentifier(field.name)}`]
      const duplicate = keys.some(entry => seen.has(entry))
      keys.forEach(entry => seen.add(entry))
      return duplicate ? [{ path, rule: "semantic.duplicate-field", message: `Data object '${item.name}' has field '${field.name}' more than once after case, spacing and punctuation normalization; give each field a distinct name.` }] : []
    })
  })
}

function platformNeedIssues(blueprint: SemanticBlueprint): SemanticIssue[] {
  const issues: SemanticIssue[] = []
  const used = new Set(blueprint.features.flatMap(feature => feature.usesPlatformNeeds))
  blueprint.platformNeeds.forEach((need, index) => {
    if (!used.has(need)) issues.push({ path: `platformNeeds[${index}]`, rule: "semantic.unused-platform-need", message: `Product platform need '${need}' is listed by no feature; remove it or list it on the feature that uses it.` })
  })
  blueprint.features.forEach((feature, index) => {
    const needsClipboard = feature.usesPlatformNeeds.includes("clipboard")
    if (needsClipboard && feature.clipboardAccess === "none") {
      issues.push({ path: `features[${index}].clipboardAccess`, rule: "semantic.clipboard-undeclared", message: `Feature '${feature.name}' lists the clipboard need but declares clipboardAccess none.` })
    }
    if (!needsClipboard && feature.clipboardAccess !== "none") {
      issues.push({ path: `features[${index}].clipboardAccess`, rule: "semantic.clipboard-without-need", message: `Feature '${feature.name}' declares clipboardAccess ${feature.clipboardAccess} but does not list the clipboard platform need.` })
    }
  })
  return issues
}

// A feature may build on another feature (its screen or state). Unknown names, self references, and
// cycles are provider mistakes the one repair request can fix; they must not reach the graph.
function buildOrderIssues(blueprint: SemanticBlueprint): SemanticIssue[] {
  const issues: SemanticIssue[] = []
  const byKey = new Map(blueprint.features.map((feature, index) => [referenceKey(feature.name), index]))
  blueprint.features.forEach((feature, index) => {
    feature.buildsOn.forEach((name, position) => {
      const path = `features[${index}].buildsOn[${position}]`
      const target = byKey.get(referenceKey(name))
      if (target === undefined) issues.push({ path, rule: "semantic.unknown-build-dependency", message: `buildsOn names '${name}', which is not a declared feature.` })
      else if (target === index) issues.push({ path, rule: "semantic.self-build-dependency", message: `Feature '${feature.name}' cannot build on itself.` })
    })
  })
  const state = new Map<number, "open" | "done">()
  const visit = (index: number): boolean => {
    if (state.get(index) === "done") return false
    if (state.get(index) === "open") return true
    state.set(index, "open")
    const cyclic = blueprint.features[index]!.buildsOn.some(name => {
      const target = byKey.get(referenceKey(name))
      return target !== undefined && target !== index && visit(target)
    })
    state.set(index, "done")
    return cyclic
  }
  blueprint.features.forEach((feature, index) => {
    if (visit(index)) issues.push({ path: `features[${index}].buildsOn`, rule: "semantic.build-dependency-cycle", message: `Feature '${feature.name}' is part of a buildsOn cycle.` })
  })
  return issues
}

// A stored record or document needs a declared shape, or every task invents its own.
// A credential-looking query parameter in an endpoint that claims to need none.
const CREDENTIAL_QUERY = /[?&](?:token|api[_-]?key|apikey|key|appid|access[_-]?token|auth)=/i

// The {name} placeholders of an endpoint or web page template, each once.
export function templatePlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{([^{}]*)\}/g)].map(match => match[1]!))]
}

// requestValueFrom names either one settings field (the single {value} form) or a whole settings object (named {field} placeholders).
export function requestSettingsObject<T extends { readonly name: string; readonly storage: string }>(dataObjects: readonly T[], source: string): T | undefined {
  return dataObjects.find(item => item.storage === "settings" && referenceKey(item.name) === referenceKey(source.trim()))
}

function serviceRequestIssues(blueprint: SemanticBlueprint): SemanticIssue[] {
  const issues: SemanticIssue[] = []
  const settingFields = new Set(blueprint.dataObjects.filter(item => item.storage === "settings").flatMap(item => item.fields.map(field => referenceKey(field.name))))
  blueprint.externalServices.forEach((item, index) => {
    const path = `externalServices[${index}]`
    if (!item.credentialRequired && CREDENTIAL_QUERY.test(item.endpoint)) {
      issues.push({ path: `${path}.credentialRequired`, rule: "semantic.credential-in-endpoint", message: `Service '${item.name}' puts a token or key in its endpoint but declares credentialRequired false; set it to true, or name an endpoint that works with no registration.` })
    }
    const endpointNames = templatePlaceholders(item.endpoint)
    const pageNames = templatePlaceholders(item.webPage)
    const names = [...new Set([...endpointNames, ...pageNames])]
    const templated = names.length > 0
    const source = item.requestValueFrom.trim()
    if (templated && source === "") {
      issues.push({ path: `${path}.requestValueFrom`, rule: "semantic.request-value-source", message: `Service '${item.name}' uses {value} (or named placeholders) in its endpoint or web page; requestValueFrom must name the saved-setting field (for {value}) or the settings object (for {field} placeholders) that supplies it.` })
    }
    if (source !== "" && !templated) {
      issues.push({ path: `${path}.requestValueFrom`, rule: "semantic.request-value-unused", message: `Service '${item.name}' names requestValueFrom '${source}' but neither its endpoint nor its web page contains a placeholder. Set requestValueFrom to "" or put {value} (or the {field} names) in the endpoint where the saved value goes.` })
    }
    if (source === "") return
    const object = requestSettingsObject(blueprint.dataObjects, source)
    if (object === undefined && !settingFields.has(referenceKey(source))) {
      issues.push({ path: `${path}.requestValueFrom`, rule: "semantic.request-value-unknown", message: `Service '${item.name}' takes its request values from '${source}', which is neither a field of a settings dataObject nor the name of one (a records field does not count); declare a settings dataObject with a field named '${source}', or set requestValueFrom to the name of an existing settings dataObject.` })
      return
    }
    // The stored reading must carry every saved value it was fetched for.
    let carried: string[] = [source]
    if (object === undefined) {
      for (const name of names.filter(candidate => candidate !== "value")) {
        issues.push({ path: `${path}.endpoint`, rule: "semantic.request-placeholder-unknown", message: `Service '${item.name}' uses {${name}} but requestValueFrom '${source}' is a single field, so only {value} is allowed. To fill several placeholders, set requestValueFrom to the name of the settings dataObject whose fields they are.` })
      }
    } else {
      const fieldOf = (name: string) => object.fields.find(field => referenceKey(field.name) === referenceKey(name))
      for (const name of names.filter(candidate => fieldOf(candidate) === undefined)) {
        issues.push({ path: `${path}.endpoint`, rule: "semantic.request-placeholder-unknown", message: `Service '${item.name}' uses {${name}} but '${name}' is not a field of the settings dataObject '${object.name}'; every placeholder is the exact name of one of its fields (${object.fields.map(field => `{${field.name}}`).join(", ") || "it has none"}).` })
      }
      for (const name of pageNames.filter(candidate => !endpointNames.includes(candidate))) {
        issues.push({ path: `${path}.webPage`, rule: "semantic.request-placeholder-inconsistent", message: `Service '${item.name}' uses {${name}} in its web page but not in its endpoint; the page and the request are built from the same saved values, so every web page placeholder must also appear in the endpoint.` })
      }
      carried = names.map(name => fieldOf(name)?.name ?? name)
    }
    for (const feature of blueprint.features.filter(candidate => candidate.usesServices.some(name => referenceKey(name) === referenceKey(item.name)))) {
      for (const name of feature.usesData) {
        const data = blueprint.dataObjects.findIndex(candidate => referenceKey(candidate.name) === referenceKey(name) && candidate.storage === "records")
        if (data < 0) continue
        for (const field of carried) {
          if (!blueprint.dataObjects[data]!.fields.some(candidate => referenceKey(candidate.name) === referenceKey(field))) {
            issues.push({ path: `dataObjects[${data}].fields`, rule: "semantic.record-missing-request-value", message: `Records '${name}' hold what '${item.name}' returned for the saved setting '${field}'; add a field named '${field}' so a changed setting is never shown another value.` })
          }
        }
      }
    }
  })
  return issues
}

function dataShapeIssues(blueprint: SemanticBlueprint): SemanticIssue[] {
  const issues: SemanticIssue[] = []
  blueprint.dataObjects.forEach((item, index) => item.fields.forEach((field, position) => {
    const bounded = field.min != null || field.max != null
    if (bounded && field.valueType !== "number" && field.valueType !== "whole-number") {
      issues.push({ path: `dataObjects[${index}].fields[${position}]`, rule: "semantic.bound-on-non-number", message: `Field '${field.name}' sets min or max but is not a number or whole-number.` })
    }
    const initial = field.initial ?? ""
    const clock = clockInitial(field)
    if (initial !== "" && !clock && (((field.valueType === "number" || field.valueType === "whole-number") && !Number.isFinite(Number(initial))) || (field.valueType === "flag" && initial !== "true" && initial !== "false") || field.valueType === "date-time" || field.valueType === "date" || field.valueType === "time")) {
      issues.push({ path: `dataObjects[${index}].fields[${position}]`, rule: "semantic.initial-value-type", message: `Field '${field.name}' has an initial value that does not fit its type (a number, true or false for a flag; today for a date and now for a date-time that the app stamps from the clock when the record is created; no other date or time text).` })
    }
    if (clock && field.optional) {
      issues.push({ path: `dataObjects[${index}].fields[${position}]`, rule: "semantic.stamped-optional", message: `Field '${field.name}' is stamped from the clock when the record is created, so it is never absent: it must not be optional.` })
    }
    if ((initial === "today" || initial === "now") && !clock) {
      issues.push({ path: `dataObjects[${index}].fields[${position}]`, rule: "semantic.initial-clock-type", message: `Field '${field.name}' has initial '${initial}', which is only for a date (today) or a date-time (now) field.` })
    }
    if (field.appStamped && field.valueType !== "date" && field.valueType !== "date-time") {
      issues.push({ path: `dataObjects[${index}].fields[${position}]`, rule: "semantic.stamped-not-date", message: `Field '${field.name}' is appStamped but is not a date or date-time.` })
    }
    if (field.min != null && field.max != null && field.min > field.max) {
      issues.push({ path: `dataObjects[${index}].fields[${position}]`, rule: "semantic.bound-order", message: `Field '${field.name}' has min above max.` })
    }
  }))
  // A choice list of consecutive whole numbers (a mood from 1 to 5) is a range: a whole-number field the feature uses must declare it as min and max.
  blueprint.features.forEach((feature, index) => feature.choiceLists.forEach((list, position) => {
    const numbers = list.options.map(Number)
    if (!numbers.every((value, at) => Number.isInteger(value) && (at === 0 || value === numbers[at - 1]! + 1))) return
    const fields = blueprint.dataObjects.filter(item => feature.usesData.some(name => referenceKey(name) === referenceKey(item.name))).flatMap(item => item.fields).filter(field => field.valueType === "whole-number")
    if (fields.length && !fields.some(field => field.min === numbers[0] && field.max === numbers[numbers.length - 1])) {
      issues.push({ path: `features[${index}].choiceLists[${position}]`, rule: "semantic.choice-range-bounds", message: `Choice list '${list.name}' of '${feature.name}' is the whole numbers ${numbers[0]} to ${numbers[numbers.length - 1]}; set min ${numbers[0]} and max ${numbers[numbers.length - 1]} on the whole-number field it picks.` })
    }
  }))
  blueprint.externalServices.forEach((item, index) => {
    if (!/^https:\/\/\S+$/.test(item.endpoint)) {
      issues.push({ path: `externalServices[${index}].endpoint`, rule: "semantic.missing-service-endpoint", message: `Service '${item.name}' must declare the documented HTTPS endpoint the app calls.` })
    }
    if (item.responseFields.length === 0) {
      issues.push({ path: `externalServices[${index}].responseFields`, rule: "semantic.missing-service-response", message: `Service '${item.name}' must declare the response values the app reads.` })
    }
  })
  issues.push(...serviceRequestIssues(blueprint))
  blueprint.features.forEach((feature, index) => {
    if ([feature.runsEverySeconds !== null, feature.runsDailyAt !== null, feature.runsAtField !== null].filter(Boolean).length > 1) {
      issues.push({ path: `features[${index}]`, rule: "semantic.two-schedules", message: `Feature '${feature.name}' declares more than one of runsEverySeconds, runsDailyAt, and runsAtField.` })
    }
    const at = feature.runsAtField
    if (at !== null) {
      const path = `features[${index}].runsAtField`
      const data = blueprint.dataObjects.find(item => referenceKey(item.name) === referenceKey(at.data))
      const field = (name: string) => data?.fields.find(item => referenceKey(item.name) === referenceKey(name))
      if (!data || data.storage !== "records" || !feature.usesData.some(name => referenceKey(name) === referenceKey(at.data))) {
        issues.push({ path, rule: "semantic.run-at-data", message: `Feature '${feature.name}' runsAtField.data '${at.data}' must be a records data object in its usesData.` })
      } else {
        if (field(at.timeField)?.valueType !== "time") issues.push({ path, rule: "semantic.run-at-time-field", message: `runsAtField.timeField '${at.timeField}' must be a field of '${data.name}' with valueType time.` })
        if (field(at.titleField)?.valueType !== "text") issues.push({ path, rule: "semantic.run-at-title-field", message: `runsAtField.titleField '${at.titleField}' must be a text field of '${data.name}'.` })
      }
      if (!feature.dataOperations.some(entry => referenceKey(entry.data) === referenceKey(at.data) && entry.operations.includes("read"))) {
        issues.push({ path, rule: "semantic.run-at-read", message: `Feature '${feature.name}' must declare the read operation on '${at.data}' in dataOperations, because it reads every record to find the due ones.` })
      }
      const normal = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase()
      if (!feature.acceptanceSignals.some(signal => normal(signal).includes(normal(at.notificationBody)))) {
        issues.push({ path: `${path}.notificationBody`, rule: "semantic.run-at-body", message: `Feature '${feature.name}' notificationBody must be quoted exactly in one of its acceptanceSignals.` })
      }
    }
    const notice = feature.scheduledNotification
    if (notice) {
      const path = `features[${index}].scheduledNotification`
      if (feature.runsDailyAt === null && feature.runsEverySeconds === null) {
        issues.push({ path, rule: "semantic.notification-schedule", message: `Feature '${feature.name}' declares scheduledNotification but no runsDailyAt or runsEverySeconds; set it to null, or declare the schedule.` })
      }
      const normalTitle = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase()
      if (!feature.acceptanceSignals.some(signal => normalTitle(signal).includes(normalTitle(notice.titleText)))) {
        issues.push({ path: `${path}.titleText`, rule: "semantic.notification-title", message: `Feature '${feature.name}' scheduledNotification.titleText must be quoted exactly in one of its acceptanceSignals.` })
      }
    }
  })
  blueprint.dataObjects.forEach((item, index) => {
    if (item.entryCount != null && item.storage !== "records") {
      issues.push({ path: `dataObjects[${index}].entryCount`, rule: "semantic.entry-count-storage", message: `Data object '${item.name}' sets entryCount but is stored as ${item.storage}; entryCount applies only to records, so set it to null.` })
    }
    if ((item.storage === "records" || item.storage === "document") && item.fields.length === 0) {
      issues.push({ path: `dataObjects[${index}].fields`, rule: "semantic.missing-data-fields", message: `Data object '${item.name}' is stored as ${item.storage} and must declare the fields it keeps.` })
    }
  })
  blueprint.features.forEach((feature, index) => {
    feature.dataOperations.forEach((entry, position) => {
      if (!feature.usesData.some(name => referenceKey(name) === referenceKey(entry.data))) {
        issues.push({ path: `features[${index}].dataOperations[${position}].data`, rule: "semantic.operations-without-data", message: `Feature '${feature.name}' declares operations on '${entry.data}', which is not in its usesData.` })
      }
    })
    const operations = feature.dataOperations.flatMap(entry => entry.operations)
    if ((feature.narrowsListBy ?? "none") !== "none" && (!operations.length || operations.some(operation => operation !== "read") || feature.invokedBy !== "user-control")) {
      issues.push({ path: `features[${index}].narrowsListBy`, rule: "semantic.narrow-not-read-only", message: `Feature '${feature.name}' sets narrowsListBy ${feature.narrowsListBy} but is not a user-started feature that only reads data; set narrowsListBy to none, or declare only the read operation and invokedBy user-control.` })
    }
  })
  return issues
}

export function auditSemanticIntake(blueprint: SemanticBlueprint): SemanticIssue[] {
  const issues: SemanticIssue[] = [...buildOrderIssues(blueprint), ...dataShapeIssues(blueprint), ...featureReferenceIssues(blueprint), ...savedFileDocumentIssues(blueprint), ...choiceListIssues(blueprint), ...duplicateNameIssues(blueprint), ...fieldNameIssues(blueprint), ...platformNeedIssues(blueprint)]
  if (unusableMeaning.test(blueprint.productName)) {
    issues.push({ path: "productName", rule: "semantic.unusable-product", message: "The product name does not contain usable product meaning." })
  }
  if (unusableMeaning.test(blueprint.summary)) {
    issues.push({ path: "summary", rule: "semantic.unusable-summary", message: "The product summary does not contain usable product meaning." })
  }
  if (!blueprint.features.some(feature => featureProse(feature).some(value => !unusableMeaning.test(value)))) {
    issues.push({ path: "features", rule: "semantic.no-meaningful-features", message: "At least one feature must contain usable product behavior." })
  }

  for (const field of semanticStrings(blueprint)) {
    if (secretPatterns.some(pattern => pattern.test(field.value))) {
      issues.push({ path: field.path, rule: "semantic.secret-material", message: "Secret material is not accepted in provider content." })
    }
  }
  return issues
}

// Deterministic sentence split: a break after ., !, ? or ; followed by whitespace. Clauses joined by a
// semicolon become separate sentences so each requirement is mapped on its own.
export function splitIdeaSentences(idea: string): string[] {
  return idea.replace(/\s+/g, " ").trim().split(/(?<=[.!?;])\s+/).map(item => item.trim()).filter(Boolean)
}

export function auditIdeaCoverage(blueprint: SemanticBlueprint, idea: string): SemanticIssue[] {
  const sentences = splitIdeaSentences(idea)
  const featureNames = new Map(blueprint.features.map(feature => [referenceKey(feature.name), feature.name]))
  const covered = new Set<string>()
  const seen = new Set<number>()
  const issues: SemanticIssue[] = []
  blueprint.ideaCoverage.forEach((entry, index) => {
    const path = `ideaCoverage[${index}]`
    if (entry.sentence > sentences.length) {
      issues.push({ path, rule: "semantic.coverage-unknown-sentence", message: `Idea sentence ${entry.sentence} does not exist; the idea has ${sentences.length} numbered sentences.` })
      return
    }
    if (seen.has(entry.sentence)) issues.push({ path, rule: "semantic.coverage-duplicate-sentence", message: `Idea sentence ${entry.sentence} has more than one ideaCoverage entry.` })
    seen.add(entry.sentence)
    entry.features.forEach((name, featureIndex) => {
      const key = referenceKey(name)
      if (featureNames.has(key)) covered.add(key)
      else issues.push({ path: `${path}.features[${featureIndex}]`, rule: "semantic.coverage-unknown-feature", message: `Idea sentence ${entry.sentence} names '${name}', which is not a declared feature.` })
    })
    if (!entry.features.length && entry.outsideFeatures === "none") {
      issues.push({ path, rule: "semantic.coverage-no-feature", message: `Idea sentence ${entry.sentence} ("${sentences[entry.sentence - 1]}") is covered by no feature. List the feature that implements it, or set outsideFeatures to product (it only names the product), non-goal (and add it to nonGoals), or constraint (and add it to productConstraints or qualityRequirements).` })
    }
    if (entry.outsideFeatures === "non-goal" && !blueprint.nonGoals.length) {
      issues.push({ path, rule: "semantic.coverage-missing-non-goal", message: `Idea sentence ${entry.sentence} is marked non-goal but nonGoals is empty.` })
    }
    if (entry.outsideFeatures === "constraint" && !blueprint.productConstraints.length && !blueprint.qualityRequirements.length) {
      issues.push({ path, rule: "semantic.coverage-missing-constraint", message: `Idea sentence ${entry.sentence} is marked constraint but productConstraints and qualityRequirements are empty.` })
    }
  })
  sentences.forEach((sentence, index) => {
    if (!seen.has(index + 1)) issues.push({ path: "ideaCoverage", rule: "semantic.coverage-missing-sentence", message: `Idea sentence ${index + 1} ("${sentence}") has no ideaCoverage entry.` })
  })
  blueprint.features.forEach((feature, index) => {
    if (!covered.has(referenceKey(feature.name))) {
      issues.push({ path: `features[${index}]`, rule: "semantic.feature-not-requested", message: `Feature '${feature.name}' is listed by no idea sentence; map it to the sentence that asks for it or remove it.` })
    }
  })
  return issues
}

export function buildBlueprintInstructions(input: BlueprintInstructionInput): string {
  return [
    "Return exactly one complete JSON value conforming to the strict semantic_blueprint json_schema supplied in the request text.format.",
    "Provide product meaning only: users, outcomes, triggers, behavior, failure outcomes, acceptance signals, data meaning, service meaning, platform needs, quality, and constraints.",
    "Do not provide IDs, file paths, test paths, commands, framework APIs, package names, module ownership, architecture layers, task phases, credential storage mechanics, build instructions, signing instructions, Markdown, or final documents.",
    "Do not choose or recommend a technology stack. The selected local preset is authoritative.",
    "Define features strictly as user-visible functional capabilities and system interactions (e.g. text editing, file persistence, search). Do not create features for pure visual themes, branding, or aesthetic styling; place visual styling requirements under qualityRequirements or productConstraints.",
    "Every feature must correspond to a verb the idea states (add, edit, delete, mark, search, filter, show, total, export, start, stop). Never create an edit, delete, search, filter, or export feature unless the idea uses that verb or a clear synonym (change, modify, or update for edit; remove for delete); a feature that only lets the user reach another feature (selecting a row to see it) is part of that feature, not a new one.",
    "A feature is not a setting, preference, default, destination, or data field. Do not add a feature for a destination folder, a default value, a configuration screen, or an internal data object. Include a settings feature only when the idea explicitly asks the user to change that setting. A destination folder chosen once belongs to the feature that uses it, as a dataObject, not to a separate feature.",
    "The provider schema has no filesystem platform need. File access is declared only by userFileAccess and by document dataObjects. Never emit filesystem anywhere in platformNeeds or usesPlatformNeeds.",
    "For every feature, set usesTray to true only when that feature needs a persistent status icon or tray presence; otherwise false. Set clipboardAccess to none, copy, read, or read-write, and set clipboardWatch true only when the feature reads the clipboard repeatedly in the background. List the clipboard platform need exactly when clipboardAccess is not none, and do not list it otherwise. A preset that cannot watch the clipboard rejects clipboardWatch true before compilation.",
    ...(input.backgroundAvailable === false ? ["The selected preset cannot run work while the app is closed. Declare the background-execution platform need only for work that must continue or start while the app is closed; work the user watches while the app is open, such as a copy with progress and a cancel button, is not background execution."] : []),
    ...(input.trayAvailable === false ? ["The selected preset has no tray surface. Set usesTray to false for every feature: the preset's own surface (a bar module, web page, or mobile screen) is not a tray."] : []),
    "For every feature, set buildsOn to the names of the other features whose screen, list, or state it extends (for example a search or filter feature builds on the feature that shows the list); leave it empty for a feature that stands alone. The first screen a user sees is built by a feature that builds on nothing. Never form a cycle.",
    "For every feature, set dataOperations with one entry per data object the feature changes or reads: data is the exact dataObject name (it must also be in usesData) and operations lists what the feature does to that object: create, read, update (change a stored value through a control, such as marking something done or toggling a flag), edit (open a record and change its fields in a form), delete. A feature that only reads a data object lists read for it. Declare delete only when the idea explicitly asks the user to remove something; then no other text may promise removal. A dataObject's retentionIntent must not mention deleting or removing unless a feature declares delete.",
    "For every dataObject, set entryCount to the number of entries the idea states for it (for example five wild flowers is 5) only when the idea gives that count and names none of the entries; otherwise null. Never invent entry names to fill a count.",
    "For every dataObject stored as records or document, list its fields: one entry per value the app keeps (name and valueType: text, long-text, number, whole-number, flag, date for a calendar day with no time of day, date-time for a moment in time, time for a local time of day written HH:MM, text-list, reference). Do not list an id; the compiler adds one. Give each field of one dataObject a distinct name. Other storage kinds may leave fields empty.",
    "Never invent a keyboard shortcut, key combination, command name, or menu path. Say 'a global shortcut' or 'a keyboard shortcut' unless the idea itself names the keys.",
    "For a feature that runs by itself, set runsEverySeconds to the exact interval the idea states in seconds (30 minutes is 1800), or runsDailyAt to the stated local time as HH:MM; otherwise leave both null. For a reminder whose time of day is a stored field of each record (for example a per-item time), leave both null and set runsAtField to the records data object, its time-valued field, its text field that titles the notification, and the constant notification body, which must be quoted exactly in one of the feature acceptanceSignals; declare no data object to remember which reminders were sent. Mark a record field optional only when a value can legitimately be missing, for example the end time of something still running.",
    "Set readsCurrentDay to true only for a feature whose behavior selects, counts, or totals stored records by the current calendar day (for example today's entries) or by a calendar period that contains today (this week's total), or computes anything relative to today (a streak, days since, overdue); leave it out for a feature that shows stored dates or times without comparing them with the present.",
    "Set showsCurrentTime to true only for a feature that displays the current time of day and keeps it up to date while the app is open (for example the local time in each of several time zones); leave it out for a feature that shows only stored or computed values.",
    "For every external service, set endpoint to the real, documented HTTPS URL of a public API that fits the purpose, and list the response values the app reads in responseFields. Use only an API you are confident exists; the app never needs an API key unless credentialRequired is true, so name only an endpoint that works with no registration unless you set credentialRequired true. When the endpoint or webPage needs a value the user saved (a city, station, or account identifier), write {value} in it and set requestValueFrom to the name of the settings field holding it; the records that keep the fetched result must then include a field with that same name.",
    "Do not create a feature for restoring data after a restart or for loading data when the app starts: persistence and restoring belong to the feature that shows or uses the data. Write failure outcomes and acceptance signals as conditions the finished app can show or a test can assert; never describe an error message for something the stack cannot produce at run time.",
    ...(input.presetNotes ?? []),
    "Set initial on a field only when the app, not the user, gives it its first value when the record is created (a state that starts as Not started); the add form then has no input for it. Give the value as text (true or false for a flag). A date or moment the app records when a record is created (created, added, logged at) is a non-optional field with initial today (a date) or now (a date-time) and is not entered by the user; a date the user chooses (a due date, a last vet visit) has no initial. Leave it null for every field the user enters or that a later action of the app stamps. A state that follows only from time passing (a timer that has run out) is not stored: derive it, and do not list it as an option of a stored field.",
    "Set appStamped to true only on a date or date-time field that an action of the app writes (a last-watered day that a Watered today button stamps); the add and edit forms then have no input for it, and it is false for every date the user enters. For a delete, state in the behavior whether it asks for confirmation: the default is a confirmation dialog, and no confirmation is stated only when the idea says so, once and in the same words everywhere (no rule can detect a contradiction here, so write it once).",
    "Set refreshesEverySeconds on a feature that shows a value changing on its own while the app is open (a countdown or elapsed time shown in seconds is 1); otherwise leave it null.",
    "Set min and max on a number or whole-number field only when the idea states the range (a mood from one to five: min 1, max 5; an amount that cannot be negative: min 0); otherwise leave them null. Never invent a bound the idea does not state. A choice list of consecutive whole numbers (1 to 5) needs the same min and max on the whole-number field it picks. A number field whose acceptance signal states a format (a four-digit year: min 1000, max 9999) takes the bounds that format implies, so the sample values the compiler writes satisfy that signal. Likewise never invent a capacity or performance target (a number of records, a duration) in qualityRequirements that the idea does not state.",
    "When the order of a list depends on when something changed, declare a date-time field for that moment (for example updated at); the compiler orders by it. Without such a field the list is ordered by newest created first.",
    "Coverage is checked structurally. Before finalizing, map every numbered idea sentence in ideaCoverage, then define only the features those mappings name. If a feature is listed by no sentence, remove it. If a sentence asks for behavior, map at least one feature to it. Never add a feature to make the design feel complete.",
    "For web surfaces: main is the home page, so anything the idea says the home page shows (including a list of featured entries) is main; use collection-index only for a separate page that lists all entries, tag-page for a tag or category page, search-page for a search results page, and page for any other page of its own that the idea names (an events page, a services page, an opening hours page). Use each value only when the idea asks for that page.",
    "Every feature acceptance signal must describe a concrete, mechanically verifiable condition (such as state transitions, UI element visibility, disk persistence, error code handling, or measured response under an explicit numerical threshold) that automated unit or integration tests can assert without human subjective impression. Never use subjective or hyperbolic phrases such as 'feels smooth', 'zero latency', 'instantaneous', or 'aesthetic appeal'.",
    "For features that depend on the operating system or device (notifications, reminders, tray or menu bar presence, background operation, permissions, hardware access, launch at login), write acceptance signals as the request the app makes or the app state a test can read, never as what the user sees or notices, and name the concrete request, value, or state.",
    "When a behavior, failure outcome, or acceptance signal depends on a default, interval, or limit, state its concrete value (for example a font family and point size, or a duration in milliseconds). Never write 'documented defaults' or an interval without its value.",
    "For every feature, put each fixed set of options the user picks from in that feature (such as currencies, units, sort orders, or levels) in choiceLists with its name, every option, and the option selected initially. A stored text field whose value is one of a fixed set the idea names (a difficulty of easy, moderate, or hard) gets a choice list too, on the feature that shows or writes it, named exactly like the field, even when nothing is picked on screen. Use an empty array only when the feature offers no fixed options. When two features offer the same list, give it the same name and the same options. Never write 'a fixed list' or 'supported values' without the values.",
    "When one feature's behavior sets or changes what another feature's records contain, such as a default applied when a record is created, state the same rule in both features. Never let two features describe the same record field differently.",
    "When a feature lets the user narrow what is shown, such as a selected category, a filter, or a search, state what is selected initially and exactly how the user returns to seeing everything.",
    "State one decided behavior for every rule. Never leave a choice between two behaviors for the builder to make (for example 'retries or skips'); pick one. Options that the user chooses between, such as a list of billing cycles, are fine. Give every scheduled or repeated action an exact time or interval and state how it avoids acting twice for the same item.",
    "Use no more than twelve features and no more than eight values in each prose list. List a platform need only when a stated feature uses it. Do not add features, settings, or platform needs that the idea does not ask for.",
    "Every acceptance signal checks only the behavior of its own feature. Never repeat a behavior that another feature owns.",
    "Do not declare an externalService for a local command, package-manager query, built-in OS API, or on-device library. Those belong in the feature behavior and local data; declare an externalService only for a remote HTTPS endpoint the product actually calls.",
    "For every feature, list in usesPlatformNeeds each platform need that feature itself exercises (file access is not a platform need; userFileAccess states it), in usesData the exact names of the dataObjects it reads or writes, and in usesServices the exact names of the externalServices it calls. Use empty arrays when a feature uses none. Every name must match a declared dataObject or externalService exactly. Declare a dataObject or externalService only when at least one feature lists it: every dataObject must appear in some feature's usesData and every externalService in some feature's usesServices, or the blueprint is rejected.",
    "For every feature, set userFileAccess to opens when the feature itself asks the user to choose a file or folder in an Open panel or to drop one on the window, saves when it asks the user to choose where to save a file in a Save panel, opens-and-saves when it does both, and none otherwise. Working with the app's own settings, records, app-files, or already loaded content is none.",
    "Declare a document dataObject for every file the user chooses where to save, such as an export, and list it in the usesData of the feature that saves it; a feature whose userFileAccess is saves or opens-and-saves is rejected without one. A file or folder the user opens, imports, or reopens later may also be declared as a document and listed by every feature that opens or reopens it. A feature that only works on loaded content lists a session dataObject for that content instead. Set its writeMode to atomic-replace when a failed write must leave an existing file at that location unchanged.",
    "For every dataObject, set storage to settings for small user preferences, records for structured app-owned records or history, document for files or folders the user opens, imports, or saves at a location the user chooses, app-files for files the app itself copies or creates and keeps in its own folder (such as imported attachments, photos, or recordings), secret for API keys, tokens, or other credentials, temporary for short-lived files removed automatically, and session for values held in memory and never written to disk.",
    "For every feature, set failureRecovery to exit when its failure outcome ends the app or process; fallback when the failure outcome itself names data or a default the app switches to automatically, or when the app simply continues on its own (for example it keeps watching or saves the rest), so the user does nothing; and retry when the operation is rejected, blocked, or shows an error the user must act on, and in every other case. Set surface to main unless the idea itself asks for that feature as its own page per item with a direct link (item-page), an about page (about-page), or a page for unknown links (not-found-page). Never add a feature only to use a surface value.",
    "For every dataObject, set writeMode to atomic-replace when a save must never leave a partially written copy (it is written to a temporary copy and swapped in whole), and direct otherwise. Do not declare that temporary copy as its own dataObject; writeMode atomic-replace on the stored dataObject already covers it.",
    "Return ideaCoverage with exactly one entry for every numbered idea sentence below. In features, list the exact names of every feature that implements what the sentence asks for. Set outsideFeatures to product when the sentence only names the product or its purpose, non-goal when it only rules something out and nonGoals states it, constraint when it only states a constraint or quality that productConstraints or qualityRequirements states, and none otherwise. A sentence that asks for any behavior lists at least one feature, and every feature is listed by at least one sentence.",
    `Software idea: ${input.idea.trim()}`,
    `Idea sentences:\n${splitIdeaSentences(input.idea).map((sentence, index) => `${index + 1}. ${sentence}`).join("\n")}`,
  ].join("\n\n")
}
