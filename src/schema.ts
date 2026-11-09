import { z } from "zod"

const shortMeaning = z.string().trim().min(1).max(120)
const compactMeaning = z.string().trim().min(1).max(480)
const meaning = z.string().trim().min(4).max(1_200)
const meaningList = z.array(compactMeaning).max(8)
const requiredMeaningList = meaningList.min(1)

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
  dataOperations: z.array(z.strictObject({ data: shortMeaning, operations: z.array(z.enum(["create", "read", "update", "delete"])).min(1).max(4) })).max(8).default([]),
  // What starts the feature: the user through a control, a click on the bar module, its own schedule, app launch, or a global shortcut.
  invokedBy: z.enum(["user-control", "click", "schedule", "launch", "shortcut"]).default("user-control"),
  // How often the feature runs by itself; null when the user triggers it. Give the exact interval the idea states.
  runsEverySeconds: z.number().int().min(1).max(604800).nullable().default(null),
  // A fixed local time of day the feature runs, as HH:MM; null otherwise.
  runsDailyAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
  // The operating-system source the feature reads a measurement from; none when it reads no system counter. Only a bar-module preset accepts a value other than none.
  systemSource: z.enum(["none", "network-received", "network-sent", "load-average", "memory", "battery"]).default("none"),
})

export const DataStorageSchema = z.enum(["settings", "records", "document", "app-files", "secret", "temporary", "session"])
export const DataWriteModeSchema = z.enum(["direct", "atomic-replace"])

export const DataValueTypeSchema = z.enum(["text", "long-text", "number", "whole-number", "flag", "date", "date-time", "text-list", "reference"])

const DataFieldSchema = z.strictObject({
  name: shortMeaning,
  valueType: DataValueTypeSchema,
  // True when the value may be absent (for example the end time of a running timer).
  optional: z.boolean().default(false),
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
  responseFields: z.array(DataFieldSchema).max(12).default([]),
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

export type SemanticBlueprint = z.infer<typeof SemanticBlueprintSchema>
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

export const providerJsonSchema = z.toJSONSchema(SemanticBlueprintSchema, {
  target: "draft-7",
}) as ClosedJsonSchema

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
      const key = referenceKey(name)
      if (seen.has(key)) issues.push({ path: `${label}[${index}]`, rule: "semantic.duplicate-name", message: `${label} contains '${name}' more than once; names must be unique after case and punctuation normalization.` })
      seen.add(key)
    })
  }
  check("features", blueprint.features.map(feature => feature.name))
  check("dataObjects", blueprint.dataObjects.map(item => item.name))
  check("externalServices", blueprint.externalServices.map(item => item.name))
  return issues
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

function serviceRequestIssues(blueprint: SemanticBlueprint): SemanticIssue[] {
  const issues: SemanticIssue[] = []
  const settingFields = new Set(blueprint.dataObjects.filter(item => item.storage === "settings").flatMap(item => item.fields.map(field => referenceKey(field.name))))
  blueprint.externalServices.forEach((item, index) => {
    const path = `externalServices[${index}]`
    if (!item.credentialRequired && CREDENTIAL_QUERY.test(item.endpoint)) {
      issues.push({ path: `${path}.credentialRequired`, rule: "semantic.credential-in-endpoint", message: `Service '${item.name}' puts a token or key in its endpoint but declares credentialRequired false; set it to true, or name an endpoint that works with no registration.` })
    }
    const templated = item.endpoint.includes("{value}") || item.webPage.includes("{value}")
    const source = item.requestValueFrom.trim()
    if (templated && source === "") {
      issues.push({ path: `${path}.requestValueFrom`, rule: "semantic.request-value-source", message: `Service '${item.name}' uses {value} in its endpoint or web page; requestValueFrom must name the saved-setting field that supplies it.` })
    }
    if (source !== "" && !templated) {
      issues.push({ path: `${path}.requestValueFrom`, rule: "semantic.request-value-unused", message: `Service '${item.name}' names requestValueFrom '${source}' but neither its endpoint nor its web page contains {value}.` })
    }
    if (source === "") return
    if (!settingFields.has(referenceKey(source))) {
      issues.push({ path: `${path}.requestValueFrom`, rule: "semantic.request-value-unknown", message: `Service '${item.name}' takes {value} from '${source}', which is not a field of a settings dataObject.` })
      return
    }
    // A stored reading must say which setting value it was fetched for, or a changed setting shows another place's value.
    for (const feature of blueprint.features.filter(candidate => candidate.usesServices.some(name => referenceKey(name) === referenceKey(item.name)))) {
      for (const name of feature.usesData) {
        const data = blueprint.dataObjects.findIndex(candidate => referenceKey(candidate.name) === referenceKey(name) && candidate.storage === "records")
        if (data >= 0 && !blueprint.dataObjects[data]!.fields.some(field => referenceKey(field.name) === referenceKey(source))) {
          issues.push({ path: `dataObjects[${data}].fields`, rule: "semantic.record-missing-request-value", message: `Records '${name}' hold what '${item.name}' returned for the saved setting '${source}'; add a field named '${source}' so a changed setting is never shown another value.` })
        }
      }
    }
  })
  return issues
}

function dataShapeIssues(blueprint: SemanticBlueprint): SemanticIssue[] {
  const issues: SemanticIssue[] = []
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
    if (feature.runsEverySeconds !== null && feature.runsDailyAt !== null) {
      issues.push({ path: `features[${index}]`, rule: "semantic.two-schedules", message: `Feature '${feature.name}' declares both an interval and a daily time.` })
    }
  })
  blueprint.dataObjects.forEach((item, index) => {
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
  })
  return issues
}

export function auditSemanticIntake(blueprint: SemanticBlueprint): SemanticIssue[] {
  const issues: SemanticIssue[] = [...buildOrderIssues(blueprint), ...dataShapeIssues(blueprint), ...featureReferenceIssues(blueprint), ...savedFileDocumentIssues(blueprint), ...choiceListIssues(blueprint), ...duplicateNameIssues(blueprint), ...platformNeedIssues(blueprint)]
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
      issues.push({ path, rule: "semantic.coverage-no-feature", message: `Idea sentence ${entry.sentence} ("${sentences[entry.sentence - 1]}") is covered by no feature.` })
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
    "A feature is not a setting, preference, default, destination, or data field. Do not add a feature for a destination folder, a default value, a configuration screen, or an internal data object. Include a settings feature only when the idea explicitly asks the user to change that setting. A destination folder chosen once belongs to the feature that uses it, as a dataObject, not to a separate feature.",
    "The provider schema has no filesystem platform need. File access is declared only by userFileAccess and by document dataObjects. Never emit filesystem anywhere in platformNeeds or usesPlatformNeeds.",
    "For every feature, set usesTray to true only when that feature needs a persistent status icon or tray presence; otherwise false. Set clipboardAccess to none, copy, read, or read-write, and set clipboardWatch true only when the feature reads the clipboard repeatedly in the background. List the clipboard platform need exactly when clipboardAccess is not none, and do not list it otherwise. A preset that cannot watch the clipboard rejects clipboardWatch true before compilation.",
    ...(input.backgroundAvailable === false ? ["The selected preset cannot run work while the app is closed. Declare the background-execution platform need only for work that must continue or start while the app is closed; work the user watches while the app is open, such as a copy with progress and a cancel button, is not background execution."] : []),
    ...(input.trayAvailable === false ? ["The selected preset has no tray surface. Set usesTray to false for every feature: the preset's own surface (a bar module, web page, or mobile screen) is not a tray."] : []),
    "For every feature, set buildsOn to the names of the other features whose screen, list, or state it extends (for example a search or filter feature builds on the feature that shows the list); leave it empty for a feature that stands alone. The first screen a user sees is built by a feature that builds on nothing. Never form a cycle.",
    "For every feature, set dataOperations with one entry per data object the feature changes or reads: data is the exact dataObject name (it must also be in usesData) and operations lists what the feature does to that object: create, read, update, delete. A feature that only reads a data object lists read for it. Declare delete only when the idea explicitly asks the user to remove something; then no other text may promise removal. A dataObject's retentionIntent must not mention deleting or removing unless a feature declares delete.",
    "For every dataObject stored as records or document, list its fields: one entry per value the app keeps (name and valueType: text, long-text, number, whole-number, flag, date for a calendar day with no time of day, date-time for a moment in time, text-list, reference). Do not list an id; the compiler adds one. Other storage kinds may leave fields empty.",
    "Never invent a keyboard shortcut, key combination, command name, or menu path. Say 'a global shortcut' or 'a keyboard shortcut' unless the idea itself names the keys.",
    "For a feature that runs by itself, set runsEverySeconds to the exact interval the idea states in seconds (30 minutes is 1800), or runsDailyAt to the stated local time as HH:MM; otherwise leave both null. Mark a record field optional only when a value can legitimately be missing, for example the end time of something still running.",
    "For every external service, set endpoint to the real, documented HTTPS URL of a public API that fits the purpose, and list the response values the app reads in responseFields. Use only an API you are confident exists; the app never needs an API key unless credentialRequired is true, so name only an endpoint that works with no registration unless you set credentialRequired true. When the endpoint or webPage needs a value the user saved (a city, station, or account identifier), write {value} in it and set requestValueFrom to the name of the settings field holding it; the records that keep the fetched result must then include a field with that same name.",
    "Do not create a feature for restoring data after a restart or for loading data when the app starts: persistence and restoring belong to the feature that shows or uses the data. Write failure outcomes and acceptance signals as conditions the finished app can show or a test can assert; never describe an error message for something the stack cannot produce at run time.",
    ...(input.presetNotes ?? []),
    "Coverage is checked structurally. Before finalizing, map every numbered idea sentence in ideaCoverage, then define only the features those mappings name. If a feature is listed by no sentence, remove it. If a sentence asks for behavior, map at least one feature to it. Never add a feature to make the design feel complete.",
    "For web surfaces: main is the home page, so anything the idea says the home page shows (including a list of featured entries) is main; use collection-index only for a separate page that lists all entries, tag-page for a tag or category page, search-page for a search results page, and page for any other page of its own that the idea names (an events page, a services page, an opening hours page). Use each value only when the idea asks for that page.",
    "Every feature acceptance signal must describe a concrete, mechanically verifiable condition (such as state transitions, UI element visibility, disk persistence, error code handling, or measured response under an explicit numerical threshold) that automated unit or integration tests can assert without human subjective impression. Never use subjective or hyperbolic phrases such as 'feels smooth', 'zero latency', 'instantaneous', or 'aesthetic appeal'.",
    "For features that depend on the operating system or device (notifications, reminders, tray or menu bar presence, background operation, permissions, hardware access, launch at login), write acceptance signals as the request the app makes or the app state a test can read, never as what the user sees or notices, and name the concrete request, value, or state.",
    "When a behavior, failure outcome, or acceptance signal depends on a default, interval, or limit, state its concrete value (for example a font family and point size, or a duration in milliseconds). Never write 'documented defaults' or an interval without its value.",
    "For every feature, put each fixed set of options the user picks from in that feature (such as currencies, units, sort orders, or levels) in choiceLists with its name, every option, and the option selected initially. Use an empty array only when the feature offers no fixed options. When two features offer the same list, give it the same name and the same options. Never write 'a fixed list' or 'supported values' without the values.",
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
