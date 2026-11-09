import { auditAgentReadinessGraph, auditMechanicalGraph, auditPacket, auditProjectGraph, buildValidationLedger, type AuditEntry, type AuditFailure } from "./audit"
import { ASTRO_CONTENT_COLLECTION_PERSISTENCE, ASTRO_FOUNDATION_SCRIPT_REQUIREMENTS, planAstroWeb, type AstroRoutePlan } from "./astroWeb"
import { PRESETS, USER_SELECTED_FILE_PLACEMENT, type OwnerKind, type PermissionCapability, type PresetContract, type PresetId, type PresetOptionValue, type PresetRuntimeMode, type ProjectIdentity } from "./presets"
import { androidScheduleContract, androidTaskExtras, type AndroidScheduledFeature } from "./androidPlan"
import { renderPacket } from "./renderers"
import { featureDataUses, featureReferenceIssues, referenceKey, type DataStorage, type DataValueType, type DataWriteMode, type FeatureRecovery, type FeatureSurface, type PlatformNeed, type SemanticBlueprint, type SemanticIssue } from "./schema"
import { kitProjectPaths, nativeUsageDescriptions, presetKit, rustKitHelpers, waybarHookSummary, waybarTaskNotes } from "./kits"
import { buildTaskAcceptanceCriteria } from "./taskAcceptance"
import type { JevAtomicAuditDecision } from "./jev"
import { TAURI_WIRE_FORMAT, tauriDocumentInterface, tauriFeatureOps, tauriStoreInterface, tauriTaskPrompt, type TauriData, type TauriFeatureUse } from "./tauriContracts"

export const DOCUMENT_NAMES = ["PRD.md", "ARD.md", "TRD.md", "TASKS.md", "AGENTS.md"] as const
export type DocumentName = (typeof DOCUMENT_NAMES)[number]
export type ContractKind = "interface" | "data" | "integration" | "lifecycle" | "persistence" | "credential" | "permission" | "recovery" | "security" | "packaging"

export type DataOperation = "create" | "read" | "update" | "delete"
export interface DataField {
  readonly name: string
  readonly valueType: DataValueType
  readonly optional: boolean
}

export interface NormalizedBlueprint {
  readonly projectName: string
  readonly productDefinition: string
  readonly problemStatement: string
  readonly targetUsers: readonly string[]
  readonly goals: readonly string[]
  readonly nonGoals: readonly string[]
  readonly primaryUserJourneys: readonly {
    readonly name: string
    readonly actor: string
    readonly steps: readonly string[]
    readonly outcome: string
  }[]
  readonly features: readonly {
    readonly name: string
    readonly behavior: string
    readonly inputs: readonly string[]
    readonly outputs: readonly string[]
    readonly acceptanceOutcomes: readonly string[]
    readonly failureBehavior: string
    readonly recoveryExpectations: readonly string[]
    readonly providedCapabilities: readonly string[]
    readonly requiredCapabilities: readonly string[]
    readonly dataOperations: readonly DataOperation[]
    readonly runsEverySeconds: number | null
    readonly runsDailyAt: string | null
    readonly resourceIds: readonly string[]
    readonly choices: readonly string[]
    readonly surface: FeatureSurface
    readonly userFileAccess: "none" | "opens" | "saves" | "opens-and-saves"
  }[]
  readonly externalServices: readonly {
    readonly name: string
    readonly purpose: string
    readonly dataSent: readonly string[]
    readonly credentialRequirement: "none" | "api-key"
    readonly endpoint: string
    readonly responseFields: readonly DataField[]
    readonly failureBehavior: string
    readonly recovery: string
  }[]
  readonly domainData: readonly {
    readonly name: string
    readonly meaning: string
    readonly retention: string
    readonly sensitivity: "public" | "internal" | "personal" | "sensitive"
    readonly storage: DataStorage
    readonly writeMode: DataWriteMode
    readonly fields: readonly DataField[]
  }[]
  readonly privacySecurityRequirements: readonly string[]
  readonly permissionNeeds: readonly {
    readonly capability: PermissionCapability
    readonly purpose: string
    readonly deniedBehavior: string
  }[]
  readonly persistenceNeeds: readonly {
    readonly data: string
    readonly purpose: string
    readonly retention: string
    readonly deletionBehavior: string
    readonly sensitivity: "public" | "internal" | "personal" | "sensitive"
    readonly storage: Exclude<DataStorage, "secret">
    readonly writeMode: DataWriteMode
    readonly temporary: boolean
  }[]
  readonly lifecycleRequirements: readonly {
    readonly event: string
    readonly behavior: string
    readonly cleanup: string
  }[]
  readonly uxRequirements: readonly string[]
  readonly operationalConstraints: readonly string[]
  readonly successCriteria: readonly string[]
  readonly assumptions: readonly string[]
  readonly platformNeeds: readonly PlatformNeed[]
}

export class NormalizationError extends Error {
  constructor(readonly issues: readonly SemanticIssue[]) {
    super("Semantic input could not be normalized safely.")
  }
}

export class GraphConstructionError extends Error {
  constructor(readonly failure: AuditFailure) {
    super(failure.message)
    this.name = "GraphConstructionError"
  }
}

export interface GraphFeature {
  readonly id: string
  readonly name: string
  readonly ownerId: string
  readonly behavior: string
  readonly inputs: readonly string[]
  readonly outputs: readonly string[]
  readonly acceptanceOutcomes: readonly string[]
  readonly failureBehavior: string
  readonly recoveryExpectations: readonly string[]
  readonly providedCapabilities: readonly string[]
  readonly requiredCapabilities: readonly string[]
  readonly dataOperations: readonly DataOperation[]
  readonly runsEverySeconds: number | null
  readonly runsDailyAt: string | null
  readonly resourceIds: readonly string[]
  readonly requiredOwnerIds: readonly string[]
  readonly choices: readonly string[]
  readonly surface: FeatureSurface
  readonly userFileAccess: "none" | "opens" | "saves" | "opens-and-saves"
}

export interface GraphAcceptance {
  readonly id: string
  readonly kind: "feature" | "integration"
  readonly criterion: string
  readonly featureIds: readonly string[]
  readonly ownerId: string
}

export interface GraphRequirement {
  readonly id: string
  readonly featureId: string
  readonly statement: string
  readonly acceptanceIds: readonly string[]
  readonly acceptanceCriteria: readonly string[]
}

export interface GraphContract {
  readonly id: string
  readonly kind: ContractKind
  readonly name: string
  readonly featureIds: readonly string[]
  readonly ownerId: string
  readonly decision: string
  readonly details: readonly string[]
  readonly failureBehavior: string
  readonly recovery: readonly string[]
}

export interface GraphOwner {
  readonly id: string
  readonly name: string
  readonly kind: OwnerKind
  readonly featureIds: readonly string[]
  readonly contractIds: readonly string[]
  readonly implementationFile: string
  readonly focusedTestFile: string
  readonly focusedTestCommand: string
  readonly createPhaseId: string
  modifyPhaseIds: string[]
}

export interface GraphTask {
  readonly id: string
  readonly title: string
  readonly ownerIds: readonly string[]
  readonly featureIds: readonly string[]
  readonly requirementIds: readonly string[]
  readonly contractIds: readonly string[]
  readonly dependencies: readonly string[]
  readonly filesToCreate: readonly string[]
  readonly filesToModify: readonly string[]
  readonly focusedTests: readonly string[]
  readonly acceptanceIds: readonly string[]
  readonly acceptanceCriteria: readonly string[]
  readonly prompt: string
  readonly validationCommands: readonly string[]
}

export interface GraphPhase {
  readonly id: string
  readonly title: string
  readonly dependencies: readonly string[]
  readonly tasks: readonly GraphTask[]
}

export interface ProjectGraph {
  readonly blueprint: NormalizedBlueprint
  readonly presetId: PresetId
  readonly presetLabel: string
  readonly identity: ProjectIdentity
  readonly runtimeMode: PresetRuntimeMode
  readonly features: readonly GraphFeature[]
  readonly acceptance: readonly GraphAcceptance[]
  readonly requirements: readonly GraphRequirement[]
  readonly contracts: readonly GraphContract[]
  readonly owners: GraphOwner[]
  readonly phases: readonly GraphPhase[]
  readonly foundationFiles: readonly string[]
  // Project paths the preset's starter kit provides (empty when the preset has no kit).
  readonly kitPaths: readonly string[]
  readonly presetOptions: Readonly<Record<string, PresetOptionValue>>
  readonly lockedStack: readonly string[]
  readonly forbiddenTechnologies: readonly string[]
  readonly testFramework: string
  readonly persistence: {
    readonly enabled: boolean
    readonly decision: string
    readonly settingsPlacement: string
    readonly recordsPlacement: string
    readonly appFilesPlacement?: string
  }
  readonly signingDecision: string
  readonly installationDecision: string
  readonly validationCommands: readonly string[]
  // Gates that need hardware; rendered beside validationCommands, never as mandatory exit-zero gates.
  readonly deviceValidation?: { readonly rule: string; readonly commands: readonly string[] }
  readonly packagingRules: readonly string[]
  readonly lifecycleRules: readonly string[]
  readonly accessibilityRules: readonly string[]
  readonly runtimeArchitecture: readonly string[]
  readonly integrationBoundary: string
  readonly recoveryRules: readonly string[]
  readonly outputArtifact: string
  readonly artifactPath: string
  readonly completionEvidence: readonly string[]
  readonly astroPlan?: AstroRoutePlan
}

export type DocumentPacket = Readonly<Record<DocumentName, string>>
export type DocumentHashes = Readonly<Record<DocumentName, string>>

export interface CompiledPacket {
  readonly presetId: PresetId
  readonly projectSlug: string
  readonly graph: ProjectGraph
  readonly documents: DocumentPacket
  readonly hashes: DocumentHashes
  // Starter-kit files exported under kit/, rendered from templates and hashed like the documents.
  readonly kit: readonly KitExportFile[]
  readonly ledger: readonly AuditEntry[]
  readonly failures: readonly AuditFailure[]
  readonly exportable: boolean
}

export interface KitExportFile {
  readonly name: string
  readonly content: string
  readonly sha256: string
}

export interface ExportFile {
  readonly name: string
  readonly content: string
  readonly sha256: string
}

interface OwnerDraft {
  readonly id: string
  readonly name: string
  readonly kind: OwnerKind
  readonly dependencyIds: readonly string[]
}

export function slug(value: string): string {
  const ascii = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  const normalized = ascii.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  return normalized || `project-${fnv1a(value).toString(16).padStart(8, "0")}`
}

function camelWords(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
}

// Split camelCase and acronym boundaries first so "ExchangeRateAPI" becomes ExchangeRateApi, not Exchangerateapi.
function pascal(value: string): string {
  const result = slug(camelWords(value)).split("-").filter(Boolean).map(part => part[0]!.toUpperCase() + part.slice(1)).join("")
  return /^[A-Za-z]/.test(result) ? result : `Project${result}`
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

function semanticKey(value: string): string {
  const key = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "")
  const trimmed = value.trim()
  return key || (trimmed ? `u${fnv1a(trimmed).toString(16)}` : "")
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, " ")
    const key = semanticKey(normalized)
    if (key && !seen.has(key)) {
      seen.add(key)
      result.push(normalized)
    }
  }
  return result
}

const implementationSuggestion = /\b(?:build|built|implement|implemented|implementation|use|using|written|powered|with)\s+(?:in\s+|on\s+)?(?:React Native|Jetpack Compose|SwiftUI|AppKit|Flutter|Electron|Tauri(?:\s*2)?|Astro|Next\.js|Kotlin|Rust|TypeScript|Swift(?:\s*6)?|React|Vue|Svelte)\b/gi
const genericIdentity = /\b(?:com|org)\.example(?:\.[a-z0-9-]+)+\b|\bexample\.com\b|\byour[-. ](?:company|bundle)\b/gi
const providerId = /\b(?:FEAT|REQ|TASK|PHASE|CONTRACT|CON|CTR|OWN)-[A-Z0-9-]+\b/gi
const sourcePath = /(^|[\s("'`])(?:~\/|\.{0,2}\/|\/(?:Users|Volumes|Applications)\/|(?:src|tests?|Sources|Tests|app\/src|src-tauri)\/)[A-Za-z0-9_./ -]+/gim
const command = /(?:\.\/gradlew|npm|pnpm|yarn|cargo|swift|xcodebuild|adb)\s+(?:run\s+)?[A-Za-z0-9:._-]+(?:\s+--?[A-Za-z0-9:._="'/-]+)*/gi
const documentName = /\b(?:PRD|ARD|TRD|TASKS|AGENTS)\.md\b/gi
// Short lowercase format tokens such as "rates from <date>" become {date}: angle brackets vanish as
// HTML in Markdown viewers. Capitalized or filler tokens such as <Your App Name> stay for the gate.
const formatToken = /<([a-z][a-z0-9]*(?:[ _-][a-z0-9]+){0,2})>/g
const fillerToken = /\b(?:your|insert|placeholder|todo|tbd|example|here)\b/

function cleanMeaning(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/(^|\s)#{1,6}\s+/g, "$1")
    .replace(implementationSuggestion, "under the selected preset")
    .replace(genericIdentity, "the application identity")
    .replace(sourcePath, "$1the local implementation")
    .replace(command, "the local validation command")
    .replace(providerId, "")
    .replace(documentName, "the applicable contract document")
    .replace(formatToken, (token, name: string) => fillerToken.test(name) ? token : `{${name}}`)
    .replace(/\beither\s+/gi, "")
    .replace(/\breject\s+or\s+(?:explicitly\s+)?split\b/gi, "reject")
    .replace(/\bchoose (?:one|between)\b/gi, "select")
    .replace(/\bdecide whether\b/gi, "determine whether")
    .replace(/\s+([,;:!?])/g, "$1")
    .replace(/\s+\.(?![A-Za-z0-9])/g, ".")
    .replace(/([,;:])(?:\s*[,;:])+/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/^\s*[:;,.-]+\s*|\s*[:;,-]+\s*$/g, "")
    .trim()
}

function cleanList(values: readonly string[]): string[] {
  return uniqueStrings(values.map(cleanMeaning).filter(Boolean))
}

function uniqueByName<T extends { readonly name: string }>(values: readonly T[]): T[] {
  const seen = new Set<string>()
  return values.filter(value => {
    const key = semanticKey(value.name)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const permissionByNeed: Partial<Record<PlatformNeed, PermissionCapability>> = {
  "audio-input": "microphone",
  camera: "camera",
  clipboard: "clipboard",
  "global-hotkey": "global-input",
  "accessibility-control": "accessibility",
  notifications: "notifications",
  filesystem: "filesystem",
  network: "network",
  "background-execution": "background-execution",
  "launch-at-login": "background-startup",
  location: "location",
}

const needPurpose: Readonly<Record<PermissionCapability, string>> = {
  microphone: "Capture audio only during an explicit user-initiated recording action.",
  accessibility: "Control or insert content into another application only after explicit authorization.",
  notifications: "Deliver user-enabled status or reminder notifications.",
  filesystem: "Access only user-selected files and folders required by a feature.",
  network: "Contact only the external services declared by the product meaning.",
  camera: "Capture images or video only during an explicit user action.",
  location: "Use foreground location only for the declared user outcome.",
  "global-input": "Receive the explicitly configured system-wide action without broad input capture.",
  clipboard: "Read or write clipboard content only in the features that declare it, and preserve the user's prior clipboard only when the PRD promises it.",
  "background-startup": "Start at login only after the user enables it.",
  "background-execution": "Keep running after the main window closes only while a declared background feature needs it.",
}

const deniedBehavior: Readonly<Record<PermissionCapability, string>> = {
  microphone: "Block capture, create no empty record, and keep non-recording features available.",
  accessibility: "Skip privileged control and provide a manual, non-destructive fallback.",
  notifications: "Keep the product usable with in-app status and no repeated prompt.",
  filesystem: "Leave existing state unchanged and allow another explicit selection.",
  network: "Keep local state usable and offer a bounded explicit retry.",
  camera: "Skip capture and keep non-camera features available.",
  location: "Use manual input or non-location behavior without fabricating a position.",
  "global-input": "Keep in-app controls available and explain the permission recovery path.",
  clipboard: "Stop the denied clipboard access, keep saved data unchanged, and show the user how to allow clipboard access again.",
  "background-startup": "Keep manual launch and foreground behavior available.",
  "background-execution": "Keep foreground behavior available and state that background work stops when the app closes.",
}

function permissionResourceId(capability: PermissionCapability): string {
  return `permission:${capability}`
}

function featureRecovery(name: string, recovery: FeatureRecovery): string {
  switch (recovery) {
    case "exit":
      return `Release partial resources before exiting so a relaunch of ${name} starts from a clean state.`
    case "fallback":
      return `Apply the stated fallback automatically, keep ${name} usable, and require no user retry.`
    case "retry":
      return `Preserve the last valid state, explain the failure, and allow an explicit retry of ${name}.`
  }
}

function dataResourceIds(name: string): string[] {
  return [`data:${slug(name)}`]
}

function serviceResourceIds(name: string): string[] {
  return [`service:${slug(name)}`]
}

function featureResourceIds(usesPlatformNeeds: readonly PlatformNeed[], usesData: readonly string[], usesServices: readonly string[]): string[] {
  return unique([
    ...usesPlatformNeeds.flatMap(need => permissionByNeed[need] ? [permissionResourceId(permissionByNeed[need]!)] : []),
    ...usesData.flatMap(dataResourceIds),
    ...usesServices.flatMap(serviceResourceIds),
  ])
}

function deriveProblemStatement(targetUsers: readonly string[], goals: readonly string[], nonGoals: readonly string[]): string {
  const audience = targetUsers[0] ?? "Users"
  const primaryGoal = goals[0] ?? "achieve the documented outcomes"
  const avoided = nonGoals[0] ?? "unnecessary scope expansion"
  const goalText = primaryGoal.replace(/\.$/, "")
  const avoidText = avoided.replace(/\.$/, "").replace(/^(?:no|never|not|without)\s+/i, "")
  const verb = /^(?:a|an|one|each|every)\b/i.test(audience) ? "needs" : "need"
  // Lowercase only a capitalized ordinary word; acronyms such as OCR or API keep their case.
  const lowerFirst = (text: string) => /^[A-Z][a-z]/.test(text) ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : text
  // A goal that already has a "without" clause gets the avoided scope as a separate trailing clause.
  const joiner = /\bwithout\b/i.test(goalText) ? ", without" : " without"
  return `${audience} ${verb} a focused way to ${lowerFirst(goalText)}${joiner} ${lowerFirst(avoidText)}.`
}

function astroContentSiteSemantics(source: SemanticBlueprint, presetId: PresetId): boolean {
  if (presetId !== "astro-web") return false
  const runtimeWouldBeStatic = !source.externalServices.some(service => service.credentialRequired)
  if (!runtimeWouldBeStatic) return false
  if (source.dataObjects.some(item => item.sensitivity === "public" || item.sensitivity === "internal")) return true
  return source.features.some(feature => feature.surface === "item-page")
}

function normalizationIssue(path: string): never {
  throw new NormalizationError([{ path, rule: "normalization.unusable-meaning", message: "Provider mechanics left no usable product meaning at this path." }])
}

export function normalizeBlueprint(source: SemanticBlueprint, presetId: PresetId, atomicAudits?: JevAtomicAuditDecision): NormalizedBlueprint {
  if (!PRESETS[presetId]) throw new NormalizationError([{ path: "$preset", rule: "normalization.unknown-preset", message: "The selected preset is not available." }])
  const projectName = source.productName.normalize("NFKC").trim().replace(/\s+/g, " ")
  const summary = cleanMeaning(source.summary)
  if (!projectName) normalizationIssue("productName")
  if (!summary) normalizationIssue("summary")

  const targetUsers = cleanList(source.targetUsers)
  const goals = cleanList(source.goals)
  if (!targetUsers.length) normalizationIssue("targetUsers")
  if (!goals.length) normalizationIssue("goals")
  const referenceIssues = featureReferenceIssues(source)
  if (referenceIssues.length) throw new NormalizationError(referenceIssues)
  const dataNameByKey = new Map(source.dataObjects.map(item => [referenceKey(item.name), cleanMeaning(item.name)]))
  const serviceNameByKey = new Map(source.externalServices.map(item => [referenceKey(item.name), cleanMeaning(item.name)]))

  const baseFeatures = uniqueByName(source.features.map((feature, index) => {
    const name = cleanMeaning(feature.name)
    const behavior = cleanMeaning(feature.behavior)
    const userOutcome = cleanMeaning(feature.userOutcome)
    if (!name) normalizationIssue(`features[${index}].name`)
    if (!behavior) normalizationIssue(`features[${index}].behavior`)
    if (!userOutcome) normalizationIssue(`features[${index}].userOutcome`)
    const trigger = cleanMeaning(feature.trigger) || `The user initiates ${name}.`
    const failure = cleanMeaning(feature.failureOutcome) || "The operation stops without losing the last valid state."
    const acceptance = cleanList(feature.acceptanceSignals)
    return {
      name,
      behavior,
      inputs: [trigger],
      outputs: [userOutcome],
      acceptanceOutcomes: acceptance.length ? acceptance : [`${name} produces the documented user outcome.`],
      failureBehavior: failure,
      recoveryExpectations: [featureRecovery(name, feature.failureRecovery)],
      // A feature provides itself, so another feature's buildsOn becomes an owner dependency.
      providedCapabilities: [slug(name)],
      requiredCapabilities: unique(feature.buildsOn.map(other => slug(cleanMeaning(other)))),
      dataOperations: unique(feature.dataOperations),
      runsEverySeconds: feature.runsEverySeconds,
      runsDailyAt: feature.runsDailyAt,
      resourceIds: [],
      usesPlatformNeeds: unique(feature.usesPlatformNeeds),
      usesData: unique(featureDataUses(source, feature).map(name => dataNameByKey.get(referenceKey(name))!)),
      usesServices: unique(feature.usesServices.map(name => serviceNameByKey.get(referenceKey(name))!)),
      userFileAccess: feature.userFileAccess,
      choices: feature.choiceLists.map(list => `${cleanMeaning(list.name)}: ${cleanList(list.options).join(", ")}; initially ${cleanMeaning(list.initial)}`),
      surface: feature.surface,
    }
  }))
  if (!baseFeatures.length) normalizationIssue("features")

  const dataObjects = uniqueByName(source.dataObjects.map(item => {
    const name = cleanMeaning(item.name)
    const purpose = cleanMeaning(item.purpose)
    return {
      name,
      purpose,
      sensitivity: item.sensitivity,
      retentionIntent: cleanMeaning(item.retentionIntent),
      storage: item.storage,
      writeMode: item.writeMode,
      fields: item.fields.map(field => ({ name: cleanMeaning(field.name), valueType: field.valueType, optional: field.optional })).filter(field => field.name),
    }
  }).filter(item => item.name && item.purpose && item.retentionIntent))
  const externalServices = uniqueByName(source.externalServices.map(item => {
    const purpose = cleanMeaning(item.purpose)
    return {
      name: cleanMeaning(item.name),
      purpose,
      dataSent: cleanList(item.dataSent),
      credentialRequirement: item.credentialRequired ? "api-key" as const : "none" as const,
      endpoint: item.endpoint.trim(),
      responseFields: item.responseFields.map(field => ({ name: cleanMeaning(field.name), valueType: field.valueType, optional: field.optional })).filter(field => field.name),
      failureBehavior: "Return a privacy-safe authentication, rate, transport, timeout, filtered, or provider failure without raw response content.",
      recovery: "Preserve recoverable local input and allow only an explicit retry or explicit service change.",
    }
  }).filter(item => item.name && item.purpose))
  // File access is declared per feature by userFileAccess (the feature shows an Open or Save panel or
  // accepts drops); a feature that reopens a declared document by saved path gets it too.
  const documentNames = new Set(dataObjects.filter(item => item.storage === "document").map(item => item.name))
  const features = baseFeatures.map(({ usesPlatformNeeds, usesData, usesServices, ...feature }) => ({
    ...feature,
    resourceIds: featureResourceIds(
      [...usesPlatformNeeds, ...(feature.userFileAccess !== "none" || usesData.some(name => documentNames.has(name)) ? ["filesystem" as const] : [])],
      usesData,
      usesServices,
    ),
  }))
  // File access is derived per feature, so it counts as a product need whenever a feature links it,
  // even when the provider's product-level list omits it.
  const rawPlatformNeeds = unique([
    ...source.platformNeeds,
    ...baseFeatures.flatMap(feature => feature.usesPlatformNeeds),
    ...(features.some(feature => feature.resourceIds.includes(permissionResourceId("filesystem"))) ? ["filesystem" as const] : []),
    ...(atomicAudits?.addedPlatformNeeds ?? []),
  ])
  const permissionCapabilities = unique(rawPlatformNeeds.flatMap(need => permissionByNeed[need] ? [permissionByNeed[need]!] : []))
    .filter(capability => features.some(f => f.resourceIds.includes(permissionResourceId(capability))))
    // A static Astro site with no declared service makes no network request that needs a permission contract.
    .filter(capability => !(presetId === "astro-web" && capability === "network" && !source.externalServices.length))
  const platformNeeds = rawPlatformNeeds
  const permissionNeeds = permissionCapabilities.map(capability => ({ capability, purpose: needPurpose[capability], deniedBehavior: deniedBehavior[capability] }))
  if (presetId === "astro-web") {
    const runtimeStatic = !source.externalServices.some(service => service.credentialRequired)
    const personalRecord = source.dataObjects.find(item => (item.sensitivity === "personal" || item.sensitivity === "sensitive") && item.storage === "records")
    if (runtimeStatic && personalRecord) {
      throw new NormalizationError([{
        path: "dataObjects",
        rule: "normalization.astro-personal-record",
        message: `Static Astro output cannot persist personal records such as '${personalRecord.name}'. Send them to a declared server endpoint, use session storage, or switch the site to server output.`,
      }])
    }
  }
  const contentSite = astroContentSiteSemantics(source, presetId)
  const persistenceRequired = platformNeeds.includes("local-storage") || contentSite
  const persistenceNeeds = dataObjects
    .flatMap(item => item.storage === "secret" ? [] : [{ ...item, storage: item.storage }])
    .filter(item => persistenceRequired || item.storage !== "session")
    .map(item => ({
      data: item.name,
      purpose: item.purpose,
      retention: item.retentionIntent,
      deletionBehavior: item.storage === "temporary"
        ? `Delete ${item.name} automatically at its stated retention boundary without waiting for a user action, verify it is absent, and report a cleanup failure honestly.`
        : item.storage === "session"
          ? `${item.name} is never written to disk and is discarded when the session ends; verify no file for it exists.`
          : source.features.some(feature => feature.dataOperations.includes("delete") && featureDataUses(source, feature).some(name => referenceKey(name) === referenceKey(item.name)))
            ? `Delete ${item.name} only through the feature that declares delete, after an explicit user action, and report deletion failure honestly.`
            : `No feature deletes ${item.name}; build no delete action for it.`,
      sensitivity: item.sensitivity,
      storage: item.storage,
      writeMode: item.writeMode,
      temporary: item.storage === "temporary",
    }))
  const privacySecurityRequirements = uniqueStrings([
    "Minimize collected data and keep it inside the preset-defined owner, storage, and integration boundaries.",
    ...dataObjects.filter(item => item.sensitivity !== "public").map(item => `Protect ${item.name} as ${item.sensitivity} data and never expose it through logs or diagnostics.`),
    ...externalServices.map(item => item.dataSent.length
      ? `Send only ${item.dataSent.join("; ")} to ${item.name} for ${item.purpose}`
      : `Send no product data to ${item.name} beyond the explicit request needed for ${item.purpose}`),
    ...(externalServices.some(item => item.credentialRequirement !== "none")
      ? ["Keep external service credentials out of logs, files, UI state, product records, and rendered documents."]
      : []),
  ])
  const lifecycleRequirements = [
    {
      event: "Application launch",
      // A declared background need means some feature must run from launch, such as clipboard recording.
      behavior: platformNeeds.includes("background-execution")
        ? "Initialize preset-owned state and services and start the declared background features; start no other capture, remote request, or destructive work automatically."
        : "Initialize preset-owned state and services without starting privileged capture, remote requests, or destructive work automatically.",
      cleanup: "Rollback partial initialization and keep a safe retry or manual launch path.",
    },
    {
      event: "Application termination",
      behavior: "Stop new work, cancel active operations, and preserve only state covered by the persistence contracts.",
      cleanup: features.some(feature => feature.resourceIds.includes(permissionResourceId("clipboard")))
        ? "Release permissions, listeners, handles, tasks, clipboard watchers and snapshots, and temporary resources before termination completes."
        : "Release permissions, listeners, handles, tasks, and temporary resources before termination completes.",
    },
    ...(platformNeeds.includes("audio-input") ? [{
      event: "Audio capture termination",
      behavior: "Finalize or cancel the one active capture and make its recovery state explicit.",
      cleanup: "Release microphone resources after success, explicit discard, cancellation, or exhausted recovery.",
    }] : []),
  ]
  const nonGoals = cleanList(source.nonGoals)
  const qualityRequirements = cleanList(source.qualityRequirements)
  const productConstraints = cleanList(source.productConstraints)

  return {
    projectName,
    productDefinition: summary,
    problemStatement: deriveProblemStatement(targetUsers, goals, nonGoals),
    targetUsers,
    goals,
    nonGoals: nonGoals.length ? nonGoals : ["No outcomes beyond the declared features and goals are included."],
    primaryUserJourneys: features.map(feature => ({
      name: `${feature.name} outcome`,
      actor: targetUsers[0]!,
      steps: [feature.inputs[0]!, feature.behavior],
      outcome: feature.outputs[0]!,
    })),
    features,
    externalServices,
    domainData: dataObjects.map(item => ({ name: item.name, meaning: item.purpose, retention: item.retentionIntent, sensitivity: item.sensitivity, storage: item.storage, writeMode: item.writeMode, fields: item.fields })),
    privacySecurityRequirements,
    permissionNeeds,
    persistenceNeeds,
    lifecycleRequirements,
    uxRequirements: qualityRequirements.length ? qualityRequirements : ["Provide accessible, keyboard-operable, visible product states."],
    operationalConstraints: productConstraints.length ? productConstraints : ["Preserve the last valid state when an operation fails."],
    successCriteria: uniqueStrings([...goals, ...features.flatMap(feature => feature.acceptanceOutcomes)]),
    assumptions: ["The selected preset is authoritative for every technology and mechanical decision.", "Omitted mechanics use the conservative preset-defined contract without another provider request."],
    platformNeeds,
  }
}

function bundleSegment(part: string, fallback: string): string {
  const segment = part || fallback
  return /^[a-z]/.test(segment) ? segment : `p${segment}`
}

function projectIdentity(projectName: string): ProjectIdentity {
  const projectSlug = slug(projectName)
  // Split camelCase for the bundle identity only, and never fall back to a trailing ".app":
  // macOS tooling rejects identifiers that end with the bundle extension.
  const parts = slug(camelWords(projectName)).split("-")
  const vendor = bundleSegment(parts[0] ?? "", "project")
  const product = bundleSegment(parts.slice(1).join(""), vendor)
  const packageName = `com.${vendor}.${product}`
  return {
    projectName,
    slug: projectSlug,
    pascalName: pascal(projectName),
    moduleName: pascal(projectName),
    bundleId: packageName,
    packageName,
    packagePath: packageName.replaceAll(".", "/"),
  }
}

function allocateStableIds(prefix: string, names: readonly string[]): string[] {
  const counts = new Map<string, number>()
  return names.map(name => {
    const base = `${prefix}-${slug(name).toUpperCase()}`
    const count = (counts.get(base) ?? 0) + 1
    counts.set(base, count)
    return count === 1 ? base : `${base}-${count}`
  })
}

function graphFailure(rule: string, path: string, message: string): GraphConstructionError {
  return new GraphConstructionError({ rule, path, message })
}

function resolveRequiredOwners(features: readonly GraphFeature[]): GraphFeature[] {
  const providers = new Map<string, Set<string>>()
  for (const feature of features) {
    for (const capability of feature.providedCapabilities) {
      const owners = providers.get(capability) ?? new Set<string>()
      owners.add(feature.ownerId)
      providers.set(capability, owners)
    }
  }

  return features.map(feature => {
    const requiredOwnerIds: string[] = []
    for (const capability of feature.requiredCapabilities) {
      const ownerIds = [...(providers.get(capability) ?? [])].sort((left, right) => left.localeCompare(right))
      if (!ownerIds.length) {
        throw graphFailure("graph.references", feature.id, `${feature.id} requires capability ${capability}, but no implementation owner provides it. Add one provider or remove the requirement before rendering.`)
      }
      if (ownerIds.length > 1) {
        throw graphFailure("graph.ownership", feature.id, `${feature.id} requires capability ${capability}, but multiple implementation owners provide it: ${ownerIds.join(", ")}. Select one owner before rendering.`)
      }
      if (ownerIds[0] !== feature.ownerId) requiredOwnerIds.push(ownerIds[0]!)
    }
    return { ...feature, requiredOwnerIds: unique(requiredOwnerIds) }
  })
}

function lowerAcceptanceOwnership(sourceFeatures: readonly GraphFeature[]): {
  features: GraphFeature[]
  acceptance: GraphAcceptance[]
  requirements: GraphRequirement[]
} {
  const groups = new Map<string, { criteria: string[]; featureIds: string[] }>()
  for (const feature of sourceFeatures) {
    for (const criterion of feature.acceptanceOutcomes) {
      const key = semanticKey(criterion)
      if (!key) continue
      const group = groups.get(key) ?? { criteria: [], featureIds: [] }
      group.criteria.push(criterion)
      group.featureIds.push(feature.id)
      groups.set(key, group)
    }
  }

  const sharedKeys = new Set([...groups].filter(([, group]) => unique(group.featureIds).length > 1).map(([key]) => key))
  const directByFeature = new Map<string, string[]>()
  for (const feature of sourceFeatures) {
    const direct = uniqueStrings(feature.acceptanceOutcomes.filter(criterion => !sharedKeys.has(semanticKey(criterion))))
      .sort((left, right) => semanticKey(left).localeCompare(semanticKey(right)))
    directByFeature.set(feature.id, direct.length ? direct : [`${feature.name} produces its declared output without claiming another feature's behavior.`])
  }

  const acceptance: GraphAcceptance[] = []
  for (const feature of [...sourceFeatures].sort((left, right) => left.id.localeCompare(right.id))) {
    for (const [index, criterion] of directByFeature.get(feature.id)!.entries()) {
      acceptance.push({
        id: `ACC-${feature.id.replace(/^FEAT-/, "")}-${String(index + 1).padStart(2, "0")}`,
        kind: "feature",
        criterion,
        featureIds: [feature.id],
        ownerId: feature.ownerId,
      })
    }
  }
  const shared = [...groups]
    .filter(([key]) => sharedKeys.has(key))
    .sort(([left], [right]) => left.localeCompare(right))
  for (const [index, [key, group]] of shared.entries()) {
    acceptance.push({
      id: `ACC-INTEGRATION-${String(index + 1).padStart(2, "0")}-${fnv1a(key).toString(16).padStart(8, "0").toUpperCase()}`,
      kind: "integration",
      criterion: [...group.criteria].sort((left, right) => left.localeCompare(right))[0]!,
      featureIds: unique(group.featureIds).sort((left, right) => left.localeCompare(right)),
      ownerId: "OWN-PACKAGING",
    })
  }

  const features = sourceFeatures.map(feature => ({ ...feature, acceptanceOutcomes: directByFeature.get(feature.id)! }))
  const requirements = features.map(feature => {
    const ownedAcceptance = acceptance.filter(item => item.kind === "feature" && item.featureIds[0] === feature.id)
    const behaviorText = feature.behavior.trim()
    // A behavior that is already a full sentence stays verbatim; only a bare lowercase predicate
    // gets a subject.
    const statement = /^(?:must\s+|shall\s+)/i.test(behaviorText)
      ? `The product ${behaviorText.charAt(0).toLowerCase()}${behaviorText.slice(1)}`
      : /^[A-Z]/.test(behaviorText) || /^(?:the\s+|this\s+|if\s+|when\s+|after\s+|before\s+|while\s+|during\s+|once\s+|unless\s+|a\s+|an\s+)/i.test(behaviorText)
      ? behaviorText
      : `The product must ${behaviorText}`
    return {
      id: feature.id.replace(/^FEAT-/, "REQ-"),
      featureId: feature.id,
      statement,
      acceptanceIds: ownedAcceptance.map(item => item.id),
      acceptanceCriteria: ownedAcceptance.map(item => item.criterion),
    }
  })
  return { features, acceptance, requirements }
}

function featureIdsForResources(resourceIds: readonly string[], features: readonly GraphFeature[]): string[] {
  const required = new Set(resourceIds)
  return features.filter(feature => feature.resourceIds.some(resourceId => required.has(resourceId))).map(feature => feature.id)
}

function integrationFeatureIds(
  service: NormalizedBlueprint["externalServices"][number],
  features: readonly GraphFeature[],
): string[] {
  const related = featureIdsForResources(serviceResourceIds(service.name), features)
  return related
}

function permissionFeatureIds(
  item: NormalizedBlueprint["permissionNeeds"][number],
  features: readonly GraphFeature[],
): string[] {
  return featureIdsForResources([permissionResourceId(item.capability)], features)
}

function dataFeatureIds(name: string, features: readonly GraphFeature[]): string[] {
  return featureIdsForResources(dataResourceIds(name), features)
}

function lifecycleFeatureIds(event: string, features: readonly GraphFeature[]): string[] {
  return event === "Audio capture termination"
    ? featureIdsForResources([permissionResourceId("microphone")], features)
    : []
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

function compilerIntegrationServices(
  blueprint: NormalizedBlueprint,
): NormalizedBlueprint["externalServices"] {
  return blueprint.externalServices
}

function credentialDetails(presetId: PresetId, identity: ProjectIdentity, serviceName: string, kind: string): string[] {
  const serviceSlug = slug(serviceName)
  if (presetId === "linux-wayland-gtk4-desktop" || presetId === "linux-hyprland-waybar-module") {
    return [
      "Credential placement: Secret Service (GNOME Keyring or KWallet) only; never JSON settings, SQLite, files, logs, UI state, diagnostics, or generated output.",
      `Secret Service label: ${identity.bundleId}.credentials`,
      `Secret Service account: ${serviceSlug}-${kind}`,
    ]
  }
  if (presetId === "astro-web") {
    return [`Server environment variable: ${serviceSlug.replaceAll("-", "_").toUpperCase()}_${kind.replaceAll("-", "_").toUpperCase()}`, "The value never enters browser assets or rendered HTML."]
  }
  if (presetId === "android-kotlin-compose") {
    return [`Android Keystore alias: ${identity.bundleId}.${serviceSlug}.credential`, "Decrypted values remain inside the service boundary and never enter Compose state."]
  }
  return [`Credential vault service: ${identity.bundleId}.credentials`, `Credential account: ${serviceSlug}-${kind}`, "The frontend receives only configured or missing state."]
}

// "Exchange Rate API" + " API key" would read "Exchange Rate API API key".
function credentialLabel(serviceName: string): string {
  return /API$/.test(serviceName) || /\bapi$/i.test(serviceName) ? `${serviceName} key` : `${serviceName} API key`
}

function credentialEntryDetail(presetId: PresetId, serviceName: string): string {
  const blocked = `every ${serviceName} action stays blocked with a prompt to add the key until it is configured.`
  if (presetId === "astro-web") {
    return `Credential entry: the operator sets the ${serviceName} key as a server environment variable before deploy; a missing value makes the server route return a configuration error instead of calling ${serviceName}.`
  }
  return `Credential entry: the user pastes the ${credentialLabel(serviceName)} into a masked settings field; the key goes straight to the placement above, the UI shows only configured or missing state, and ${blocked}`
}

const ATOMIC_WRITE_SENTENCE = "Every write replaces the destination by renaming a temporary file in the same directory; a failed write leaves the previous file intact."
const ATOMIC_TRANSACTION_SENTENCE = "Every write commits in one SQLite transaction; a failed write rolls back and leaves the previous rows intact."

// The atomic guarantee follows the concrete store: files are swapped by rename, SQLite commits
// transactionally, and stores that are already atomic per value need no extra rule.
function atomicWriteDetail(placement: string): string | undefined {
  if (/\bSQLite\b/.test(placement)) return ATOMIC_TRANSACTION_SENTENCE
  if (/\bJSON\b|filesystem|\bfile\b/i.test(placement)) return ATOMIC_WRITE_SENTENCE
  return undefined
}

function documentWriteDetail(storage: string, placement: string, preset: PresetContract): string | undefined {
  if (storage === "document" && preset.persistence.documentAtomicWrite) return preset.persistence.documentAtomicWrite
  return atomicWriteDetail(placement)
}

const SESSION_MEMORY_PLACEMENT = "Held in memory for the session and not written to disk."
const ATOMIC_RENAME_SCRATCH_PLACEMENT = "A temporary file in the destination file's own directory, renamed over the destination on success and removed on failure; never in temporaryDirectory or Application Support."

const VALUE_TYPE_LABEL: Record<DataValueType, string> = {
  text: "short text",
  "long-text": "long text",
  number: "number",
  "whole-number": "whole number",
  flag: "true/false flag",
  "date-time": "date and time",
  "text-list": "ordered list of text lines",
  reference: "reference to another stored item",
}

// The stored shape and the exact operations the declared features perform, so every task that
// touches the store uses one schema and builds no operation nobody asked for.
function dataShapeDetails(presetId: PresetId, item: NormalizedBlueprint["domainData"][number], features: readonly GraphFeature[], allData: NormalizedBlueprint["domainData"] = []): string[] {
  const users = features.filter(feature => dataFeatureIds(item.name, features).includes(feature.id))
  const tauri = presetId === "tauri2-rust-typescript-desktop"
  if (tauri && item.storage === "document") return [tauriDocumentInterface(tauriData(item), users)]
  const documentResources = new Set(allData.filter(other => other.storage === "document").flatMap(other => dataResourceIds(other.name)))
  // A Tauri feature that saves a document writes only that file; its records are read, not created.
  const operationsOf = (feature: GraphFeature): readonly DataOperation[] => tauri ? tauriFeatureOps(item.storage, feature, documentResources) : feature.dataOperations
  const operations = unique(users.flatMap(operationsOf))
  if (item.storage === "app-files" && operations.length && presetId !== "astro-web") {
    const names = operations.flatMap(operation => operation === "create" ? ["import_file(source)"] : operation === "delete" ? ["remove_file(reference)"] : operation === "read" ? ["file_path(reference)"] : [])
    return [`File operations (OWN-DATA-STORE owns them; feature tasks add no other file access): ${names.join(", ")}. A file is copied into the app folder before its record is inserted, and a failed insert removes the copy.`]
  }
  if (presetId === "android-kotlin-compose" && item.storage === "settings") {
    return [`Interface: OWN-DATA-STORE adds one typed Preferences DataStore key per value of ${item.name} to data/SettingsRepository.kt${item.fields.length ? ` (${item.fields.map(field => field.name).join(", ")})` : ""}, each with a Flow reader and a suspend writer; no Room entity or DAO exists for it.`]
  }
  if (!item.fields.length) return []
  const lines = [
    `Stored fields (one record each, plus a stable generated id): ${item.fields.map(field => `${field.name} (${VALUE_TYPE_LABEL[field.valueType]}${field.optional ? ", optional" : ""})`).join("; ")}.`,
  ]
  if (operations.length) {
    lines.push(`Store operations, exactly these and no others: ${operations.map(operation => `${operation} (${users.filter(feature => operationsOf(feature).includes(operation)).map(feature => feature.id).join(", ")})`).join("; ")}.`)
    lines.push(storeInterfaceDetail(presetId, item, operations))
  }
  return lines
}

function tauriData(item: NormalizedBlueprint["domainData"][number]): TauriData {
  return { name: item.name, base: slug(item.name).replaceAll("-", "_"), record: pascal(item.name), resource: dataResourceIds(item.name)[0]!, storage: item.storage, fields: item.fields }
}

// One concrete interface per preset, owned by the data owner, so feature tasks call it and never invent storage access.
function storeInterfaceDetail(presetId: PresetId, item: NormalizedBlueprint["domainData"][number], operations: readonly DataOperation[]): string {
  const base = slug(item.name).replaceAll("-", "_")
  const record = pascal(item.name)
  const methods = (names: Record<DataOperation, string[]>) => operations.flatMap(operation => names[operation])
  if (presetId === "tauri2-rust-typescript-desktop") return tauriStoreInterface(tauriData(item), operations)
  if (presetId === "android-kotlin-compose") {
    const functions = methods({ create: ["insert"], read: ["observeAll", "getById"], update: ["update"], delete: ["delete"] })
    return `Interface: OWN-DATA-STORE owns one Room entity ${record}Entity with the stored fields above, one ${record}Dao with exactly: ${functions.join(", ")}, the one RoomDatabase subclass AppDatabase that lists every records entity (version 1, exportSchema = true, schema JSON committed under app/schemas), and ${record}Repository over the DAO, all in its owner file; it constructs the database and repository in AppContainer.kt. Feature tasks use the repository and add no entity or query of their own.`
  }
  if (presetId === "astro-web") return `Interface: the content collection schema declares exactly the stored fields above; pages read entries through getCollection and no page defines its own schema.`
  const functions = methods({ create: ["insert"], read: ["list", "get"], update: ["update"], delete: ["delete"] })
  return `Interface: OWN-DATA-STORE defines struct ${record} with the stored fields above (id: i64) and trait ${record}Store with exactly: ${functions.join(", ")}; every function returns Result with a typed error, and feature tasks call the trait and add no other storage access. OWN-DATA-STORE creates the table in its own transactional migration that raises PRAGMA user_version by one; ordered lists of text lines are stored as a JSON text column; list returns records by descending id unless a feature states another order, with id as the final tie-break.`
}

function persistencePlacement(
  item: NormalizedBlueprint["persistenceNeeds"][number],
  preset: PresetContract,
  identity: ProjectIdentity,
  astroPlan?: AstroRoutePlan,
): string {
  const collection = astroPlan?.collections.find(candidate => candidate.dataName === item.data)
  if (preset.id === "astro-web" && collection && item.storage === "records") {
    return `src/content/${collection.name}/ as build-time markdown or MDX compiled through src/content.config.ts.`
  }
  if (preset.id === "astro-web" && astroPlan?.browserPersistence && item.storage === "records") return preset.persistence.recordsPlacement
  if (item.storage === "session") return SESSION_MEMORY_PLACEMENT
  if (item.storage === "app-files") return preset.persistence.appFilesPlacement(identity)
  if (item.storage === "temporary") return preset.persistence.temporaryPlacement
  if (item.storage === "document") return preset.persistence.documentPlacement
  return item.storage === "settings" ? preset.persistence.settingsPlacement : preset.persistence.recordsPlacement
}

function contract(
  id: string,
  kind: ContractKind,
  name: string,
  featureIds: readonly string[],
  ownerId: string,
  decision: string,
  details: readonly string[],
  failureBehavior: string,
  recovery: readonly string[],
): GraphContract {
  return { id, kind, name, featureIds: unique(featureIds), ownerId, decision, details, failureBehavior, recovery: unique(recovery) }
}

// Features with a declared schedule, with the files the schedule adds beside the feature's owner file.
function androidScheduledFeatures(preset: PresetContract, identity: ProjectIdentity, features: readonly GraphFeature[]): AndroidScheduledFeature[] {
  return features.filter(feature => feature.runsDailyAt !== null || feature.runsEverySeconds !== null).map(feature => {
    const ownerName = `${pascal(feature.name)}Feature`
    return {
      id: feature.id,
      name: feature.name,
      pascal: pascal(feature.name),
      slug: slug(feature.name),
      implementationFile: preset.ownerFiles({ kind: "feature", slug: slug(ownerName), pascalName: ownerName, identity }).implementationFile,
      runsEverySeconds: feature.runsEverySeconds,
      runsDailyAt: feature.runsDailyAt,
      notifies: feature.resourceIds.includes(permissionResourceId("notifications")),
    }
  })
}

// A feature that is scheduled, or reads a stored date or time, compares with the present moment and needs an injected clock.
function androidClockFeatureIds(blueprint: NormalizedBlueprint, features: readonly GraphFeature[]): Set<string> {
  const ids = new Set(features.filter(feature => feature.runsDailyAt !== null || feature.runsEverySeconds !== null).map(feature => feature.id))
  for (const item of blueprint.domainData.filter(entry => entry.fields.some(field => field.valueType === "date-time"))) {
    for (const featureId of dataFeatureIds(item.name, features)) {
      if (features.find(feature => feature.id === featureId)?.dataOperations.includes("read")) ids.add(featureId)
    }
  }
  return ids
}

function buildOwnersAndContracts(
  blueprint: NormalizedBlueprint,
  preset: PresetContract,
  identity: ProjectIdentity,
  features: readonly GraphFeature[],
  astroPlan?: AstroRoutePlan,
  integrationServices: NormalizedBlueprint["externalServices"] = compilerIntegrationServices(blueprint),
  presetOptions: Readonly<Record<string, PresetOptionValue>> = {},
): { ownerDrafts: OwnerDraft[]; contracts: GraphContract[] } {
  const runtimeMode = preset.runtimeMode(blueprint)
  const staticAstroMinimal = preset.id === "astro-web"
    && runtimeMode === "static"
    // Content collections are build-time files, not runtime persistence, so they keep a site static.
    && blueprint.persistenceNeeds.every(item => astroPlan?.collections.some(collection => collection.dataName === item.data))
    && !blueprint.permissionNeeds.length
    && !integrationServices.some(service => service.credentialRequirement !== "none")
  const lifecycleOwnerId = staticAstroMinimal ? "OWN-PACKAGING" : "OWN-LIFECYCLE-COORDINATOR"
  const integrationDrafts: OwnerDraft[] = integrationServices.map(service => ({
    id: `OWN-INTEGRATION-${slug(service.name).toUpperCase()}`,
    name: `${pascal(service.name)}Integration`,
    kind: "integration",
    dependencyIds: [],
  }))
  const featureDrafts = [...new Map(features.map(feature => [feature.ownerId, {
    id: feature.ownerId,
    name: preset.id === "astro-web"
      ? pascal(feature.name)
      : `${pascal(feature.name)}Feature`,
    kind: "feature" as const,
    dependencyIds: [],
  }])).values()]

  const credentialServices = integrationServices.filter(service => service.credentialRequirement !== "none")
  const credentialOwnerFeatureIds = unique(credentialServices.flatMap(service => integrationFeatureIds(service, features)))
  const hasCredentialDomainData = blueprint.domainData.some(item => item.storage === "secret")
  const coreDrafts: OwnerDraft[] = []
  if (credentialServices.length || hasCredentialDomainData) {
    coreDrafts.push({ id: "OWN-CREDENTIAL-VAULT", name: "CredentialVault", kind: "credential", dependencyIds: [] })
  }
  if (blueprint.domainData.length || blueprint.persistenceNeeds.length) {
    coreDrafts.push({
      id: "OWN-DATA-STORE",
      name: preset.id === "astro-web" && astroPlan?.usesContentCollections ? "ContentCatalog" : "DataStore",
      kind: "data",
      dependencyIds: [],
    })
  }
  if (blueprint.permissionNeeds.length && !preset.permissionOwnerId) {
    coreDrafts.push({
      id: "OWN-PERMISSION-COORDINATOR",
      name: "PermissionCoordinator",
      kind: "permission",
      dependencyIds: [],
    })
  }
  if (!staticAstroMinimal) {
    coreDrafts.push({
      id: "OWN-LIFECYCLE-COORDINATOR",
      name: "LifecycleCoordinator",
      kind: "lifecycle",
      dependencyIds: [],
    })
  }

  const contracts: GraphContract[] = []
  for (const feature of features) {
    const key = feature.id.replace(/^FEAT-/, "")
    const interfaceDetails = [`Inputs: ${feature.inputs.join("; ")}`, `Outputs: ${feature.outputs.join("; ")}`, ...feature.choices.map(choice => `Choices: ${choice}`), ...(feature.runsEverySeconds !== null ? [`Schedule: runs by itself every ${feature.runsEverySeconds} seconds; this exact value is the default that code and tests use.`] : []), ...(feature.runsDailyAt !== null ? [`Schedule: runs by itself every day at ${feature.runsDailyAt} local time.`] : [])]
    contracts.push(contract(
      `CON-${key}-INTERFACE`,
      "interface",
      `${feature.name} interface`,
      [feature.id],
      feature.ownerId,
      feature.behavior,
      interfaceDetails,
      feature.failureBehavior,
      feature.recoveryExpectations,
    ))
    contracts.push(contract(
      `CON-${key}-RECOVERY`,
      "recovery",
      `${feature.name} recovery`,
      [feature.id],
      feature.ownerId,
      `Treat failure as a terminal or recoverable state exactly as the semantic contract describes. ${recoveryRulesFor(preset, blueprint).join(" ")}`,
      recoveryRulesFor(preset, blueprint),
      feature.failureBehavior,
      feature.recoveryExpectations,
    ))
  }

  if (preset.id === "android-kotlin-compose") {
    for (const feature of androidScheduledFeatures(preset, identity, features)) {
      const schedule = androidScheduleContract(identity, feature)
      contracts.push(contract(schedule.id, "lifecycle", schedule.name, [feature.id], features.find(item => item.id === feature.id)!.ownerId, schedule.decision, schedule.details, schedule.failureBehavior, schedule.recovery))
    }
  }

  const dataOwnerId = blueprint.domainData.length || blueprint.persistenceNeeds.length ? "OWN-DATA-STORE" : lifecycleOwnerId
  let wireFormatPending = preset.id === "tauri2-rust-typescript-desktop"
  // The Tauri wire format is stated once, on the first data contract that defines commands.
  const tauriWireFormatFirst = (details: string[]): string[] => {
    if (!wireFormatPending || !details.some(detail => detail.startsWith("Interface: "))) return details
    wireFormatPending = false
    return [...details, TAURI_WIRE_FORMAT]
  }
  for (const item of blueprint.domainData) {
    const credentialData = item.storage === "secret"
    const inMemoryData = item.storage === "session"
    const contentCollection = !!astroPlan?.collections.some(collection => collection.dataName === item.name)
    const ownerId = credentialData ? "OWN-CREDENTIAL-VAULT" : dataOwnerId
    const credentialDataDetails = credentialData
      ? (credentialServices.length
        ? unique(credentialServices.flatMap(service => credentialDetails(preset.id, identity, service.name, service.credentialRequirement)))
        : credentialDetails(preset.id, identity, item.name, "credential"))
      : [...tauriWireFormatFirst(dataShapeDetails(preset.id, item, features, blueprint.domainData)), `Retention: ${item.retention}`, `Sensitivity: ${item.sensitivity}`]
    contracts.push(contract(
      `CON-DATA-${slug(item.name).toUpperCase()}`,
      "data",
      item.name,
      credentialData
        ? [...dataFeatureIds(item.name, features), ...credentialOwnerFeatureIds]
        : dataFeatureIds(item.name, features),
      ownerId,
      credentialData ? `${preset.credentialPlacement} CredentialVault exclusively owns credential storage, retrieval, replacement, and deletion; DataStore receives no secret value.` : item.meaning,
      credentialData ? [...credentialDataDetails, `Retention: ${item.retention}`, `Sensitivity: ${item.sensitivity}`] : credentialDataDetails,
      credentialData ? "Missing, rejected, unreadable, replacement-failed, or deletion-failed credentials block only the affected provider action without exposing or copying a secret." : inMemoryData ? "A failed update leaves the last in-memory state valid." : contentCollection ? "A content file that fails the collection schema fails the build and names the file and field." : "Reject invalid or incomplete records without replacing the last valid state.",
      credentialData ? ["Preserve the prior stored credential after failed replacement, report deletion only after the credential store confirms it, and expose an explicit replacement or provider-selection action."] : inMemoryData ? ["Keep the last in-memory value and rebuild it from its source on the next explicit action."] : contentCollection ? ["Correct the named content file or field and rebuild."] : ["Preserve the last valid record and expose a bounded correction or rebuild path."],
    ))
  }

  for (const service of integrationServices) {
    const ownerId = `OWN-INTEGRATION-${slug(service.name).toUpperCase()}`
    contracts.push(contract(
      `CON-INTEGRATION-${slug(service.name).toUpperCase()}`,
      "integration",
      `${service.name} integration`,
      integrationFeatureIds(service, features),
      ownerId,
      `${service.purpose} ${preset.integrationBoundary}`,
      [...(service.endpoint ? [`Endpoint: ${service.endpoint}`] : []), ...(service.responseFields.length ? [`Response values read (anything else is ignored): ${service.responseFields.map(field => `${field.name} (${VALUE_TYPE_LABEL[field.valueType]}${field.optional ? ", optional" : ""})`).join("; ")}.`] : []), `Data sent: ${service.dataSent.join("; ") || "No product data beyond the explicit request."}`, `Credential requirement: ${service.credentialRequirement}`, `Preset boundary: ${preset.platform}`, `Framework boundary: ${preset.integrationBoundary}`],
      service.failureBehavior,
      [service.recovery],
    ))
  }

  // A static site has no application launch or termination to coordinate.
  for (const item of staticAstroMinimal ? [] : blueprint.lifecycleRequirements) {
    contracts.push(contract(
      `CON-LIFECYCLE-${slug(item.event).toUpperCase()}`,
      "lifecycle",
      item.event,
      lifecycleFeatureIds(item.event, features),
      lifecycleOwnerId,
      item.behavior,
      [`Cleanup: ${item.cleanup}`],
      "An interrupted lifecycle transition must not be reported as complete.",
      [item.cleanup],
    ))
  }

  contracts.push(contract(
    "CON-LIFECYCLE-PRESET",
    "lifecycle",
    `${preset.label} lifecycle`,
    features.map(feature => feature.id),
    lifecycleOwnerId,
    preset.lifecycleRules.join(" "),
    preset.lifecycleRules,
    "A preset lifecycle invariant failure blocks completion and leaves the last safe state active.",
    ["Restore the last safe lifecycle state, release partial resources, and rerun the focused lifecycle checks."],
  ))

  if (blueprint.persistenceNeeds.length) {
    for (const item of blueprint.persistenceNeeds) {
      const placement = persistencePlacement(
        item,
        preset,
        identity,
        astroPlan,
      ).replaceAll("{app-id}", identity.bundleId)
      const memoryResident = /not written to disk/i.test(placement)
      const userDocument = item.storage === "document"
      // A content collection is read-only at run time: its only failure is a build that rejects a bad file.
      const contentFiles = preset.id === "astro-web" && placement.startsWith("src/content/")
      const persistenceDecision = preset.id === "astro-web" && astroPlan?.usesContentCollections
        ? ASTRO_CONTENT_COLLECTION_PERSISTENCE.enabledDecision
        : preset.id === "astro-web" && astroPlan?.browserPersistence
          ? preset.persistence.enabledDecision
          : memoryResident
            ? "Kept in memory for the session and not written to disk."
            : item.storage === "app-files"
            ? "Persistence: app-owned files kept in the app's own data folder."
            : item.storage === "document"
            ? "Persistence: the document location the user chooses; the app keeps no copy."
            : preset.persistence.settingsDecision && item.storage === "settings"
              ? preset.persistence.settingsDecision
            : preset.persistence.recordsDecision && item.storage === "records"
              ? preset.persistence.recordsDecision
            : /\bSQLite\b/.test(placement)
              ? preset.persistence.enabledDecision
              : /\bUserDefaults\b/.test(placement)
                ? "Persistence: lightweight settings in UserDefaults with versioned keys."
                : /open\/save panels|local filesystem/i.test(placement)
                  ? "Persistence: local filesystem at user-selected paths via native open and save panels."
                  : placement === ATOMIC_RENAME_SCRATCH_PLACEMENT
                    ? "Persistence: temporary same-directory write file for atomic replacement."
                    : item.temporary ? "Temporary recovery storage is enabled." : preset.persistence.enabledDecision
      contracts.push(contract(
        `CON-PERSISTENCE-${slug(item.data).toUpperCase()}`,
        "persistence",
        `${item.data} persistence`,
        dataFeatureIds(item.data, features),
        "OWN-DATA-STORE",
        `${persistenceDecision} ${item.purpose}`,
        [
          `Application ID: ${identity.bundleId}`,
          `Placement: ${placement}`,
          ...(item.writeMode === "atomic-replace" && !item.temporary && !memoryResident && documentWriteDetail(item.storage, placement, preset) ? [`Write mode: ${documentWriteDetail(item.storage, placement, preset)}`] : []),
          `Retention: ${item.retention}`,
          `Deletion: ${item.deletionBehavior}`,
          `Sensitivity: ${item.sensitivity}`,
        ],
        contentFiles
          ? "A content file that fails the collection schema fails the build and names the file and field; the site keeps no write path at run time."
          : memoryResident
          ? "A failed update leaves the last in-memory state valid."
          : userDocument
            ? "A failed save leaves the user's existing document unchanged and the new state visibly unsaved."
            : "A failed write leaves the prior durable state valid and the new state visibly unsaved.",
        contentFiles
          ? ["Correct the named file or field and rebuild; no runtime write is retried.", item.deletionBehavior]
          : memoryResident
          ? ["Keep the last in-memory value and allow an explicit retry.", item.deletionBehavior]
          : userDocument
            ? ["Retry through the same save boundary; never truncate or replace the user's file with partial content.", item.deletionBehavior]
            : ["Retry through the same atomic boundary without duplicating the record.", item.deletionBehavior],
      ))
    }
  } else {
    contracts.push(contract(
      "CON-PERSISTENCE-DISABLED",
      "persistence",
      "Persistence disabled",
      features.map(feature => feature.id),
      lifecycleOwnerId,
      preset.persistence.disabledDecision,
      ["No application record repository is created."],
      "Unexpected persistence is a contract violation.",
      ["Remove the write path and rerun the persistence-disabled tests."],
    ))
  }

  for (const service of credentialServices) {
    contracts.push(contract(
      `CON-CREDENTIAL-${slug(service.name).toUpperCase()}`,
      "credential",
      `${service.name} credential`,
      integrationFeatureIds(service, features),
      "OWN-CREDENTIAL-VAULT",
      preset.credentialPlacement,
      [...credentialDetails(preset.id, identity, service.name, service.credentialRequirement), credentialEntryDetail(preset.id, service.name)],
      "Missing or rejected credentials block only the provider action and never expose stored values.",
      ["Accept a replacement credential through the same protected input boundary or select a configured service."],
    ))
  }

  for (const item of blueprint.permissionNeeds) {
    const wording = preset.permissionTexts?.[item.capability]
    const deniedBehavior = wording?.deniedBehavior ?? item.deniedBehavior
    contracts.push(contract(
      `CON-PERMISSION-${slug(item.capability).toUpperCase()}`,
      "permission",
      `${item.capability} permission`,
      permissionFeatureIds(item, features),
      preset.permissionOwnerId ?? "OWN-PERMISSION-COORDINATOR",
      preset.permissionPatterns[item.capability],
      [`Purpose: ${wording?.purpose ?? preset.permissionPurposes?.[item.capability] ?? item.purpose}`, `Denied behavior: ${deniedBehavior}`],
      deniedBehavior,
      [wording?.recovery ?? "Recheck authorization only after an explicit user action and preserve the documented denied path."],
    ))
  }

  contracts.push(contract(
    "CON-SECURITY-BOUNDARY",
    "security",
    "Privacy and security boundary",
    features.map(feature => feature.id),
    "OWN-PACKAGING",
    blueprint.privacySecurityRequirements.join(" "),
    blueprint.privacySecurityRequirements,
    "A privacy or security invariant failure stops the affected operation before data crosses the boundary.",
    ["Restore the last safe state and require explicit user action before retrying."],
  ))

  contracts.push(contract(
    "CON-PACKAGING-RELEASE",
    "packaging",
    `${preset.label} packaging`,
    features.map(feature => feature.id),
    "OWN-PACKAGING",
    preset.packagingRules.join(" "),
    [...preset.packagingRules, `Installation: ${preset.installationDecision(identity)}`, `Output artifact: ${preset.outputArtifact}`],
    "A failed build, signature, package, install, or launch check blocks completion.",
    ["Fix the first failing validation command, rebuild the artifact, and rerun every later release gate."],
  ))

  // A static site has no adapter; recording one would contradict the output mode.
  const optionEntries = Object.entries(presetOptions).filter(([key]) => !(preset.id === "astro-web" && runtimeMode === "static" && key === "adapter"))
  if (optionEntries.length) {
    contracts.push(contract(
      "CON-PRESET-OPTIONS",
      "packaging",
      "Preset options",
      features.map(feature => feature.id),
      "OWN-PACKAGING",
      `Preset options: ${optionEntries.map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(",") : String(value)}`).join("; ")}.${preset.explainOptions ? ` ${optionEntries.map(([key]) => preset.options.find(option => option.id === key)).filter(option => option !== undefined).map(option => `${option.id} is the ${option.label}: ${option.description}`).join(" ")}` : ""}`,
      optionEntries.map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}${preset.explainOptions ? ` (${preset.options.find(option => option.id === key)?.description ?? ""})` : ""}`),
      "An option outside the preset schema blocks generation; the compiler never guesses an option.",
      ["Correct the option and regenerate."],
    ))
  }

  // A site with no file-access feature has no local file boundary to state.
  if (preset.fileBoundary && (preset.id !== "astro-web" || features.some(feature => feature.resourceIds.includes(permissionResourceId("filesystem"))))) {
    const appOnly = preset.appOnlyFileBoundary && !blueprint.permissionNeeds.some(item => item.capability === "filesystem")
    contracts.push(contract(
      "CON-PLATFORM-FILES",
      "security",
      "Local file boundary",
      features.map(feature => feature.id),
      "OWN-PACKAGING",
      appOnly ? preset.appOnlyFileBoundary!.boundary : preset.fileBoundary,
      (appOnly ? preset.appOnlyFileBoundary!.details : preset.fileBoundaryDetails ?? []).map(detail => detail.replaceAll("{app-id}", identity.bundleId)),
      "A path outside the declared boundary is rejected and leaves the filesystem unchanged.",
      ["Return to the declared boundary, explain the rejected path, and retry only with an allowed path."],
    ))
  }

  contracts.push(contract(
    "CON-RUNTIME-WIRING",
    "packaging",
    "Runtime wiring",
    features.map(feature => feature.id),
    "OWN-PACKAGING",
    "The shipped app calls the real owners named in the contracts; test doubles never reach a production entry point.",
    [...preset.wiringRules, `Launch check: ${preset.launchCheck(identity)}`],
    "A production entry point that uses a test double, or a platform owner the running app never calls, blocks completion.",
    ["Replace the stand-in with the concrete owner, rerun the packaging focused test, and repeat the launch check."],
  ))

  const beforePackaging = [...coreDrafts, ...integrationDrafts, ...featureDrafts]
  const dependencyIds = new Map(beforePackaging.map(draft => [draft.id, new Set(draft.dependencyIds)]))
  const addDependency = (ownerId: string, dependencyId: string) => {
    if (ownerId !== dependencyId && dependencyIds.has(ownerId) && dependencyIds.has(dependencyId)) dependencyIds.get(ownerId)!.add(dependencyId)
  }

  for (const feature of features) {
    for (const dependencyId of feature.requiredOwnerIds) addDependency(feature.ownerId, dependencyId)
  }
  for (const item of contracts) {
    if (["interface", "recovery", "security", "packaging"].includes(item.kind) || item.ownerId === "OWN-PACKAGING") continue
    for (const featureId of item.featureIds) {
      const featureOwnerId = features.find(feature => feature.id === featureId)?.ownerId
      if (featureOwnerId) addDependency(featureOwnerId, item.ownerId)
    }
  }
  for (const integration of contracts.filter(item => item.kind === "integration")) {
    const supportingOwners = contracts
      .filter(item => (item.kind === "credential" || item.kind === "permission") && item.featureIds.some(featureId => integration.featureIds.includes(featureId)))
      .map(item => item.ownerId)
    for (const ownerId of supportingOwners) addDependency(integration.ownerId, ownerId)
  }
  if (astroPlan) {
    for (const feature of features) {
      const placement = astroPlan.featurePlacements[feature.id]
      if (placement?.kind !== "component") continue
      const pageOwner = features.find(candidate => {
        const candidatePlacement = astroPlan.featurePlacements[candidate.id]
        return candidatePlacement?.kind === "page" && candidatePlacement.pageFile === placement.registrationFile
      })
      if (pageOwner) addDependency(feature.ownerId, pageOwner.ownerId)
    }
  }

  const prepared = beforePackaging.map(draft => ({
    ...draft,
    dependencyIds: [...dependencyIds.get(draft.id)!].sort((left, right) => left.localeCompare(right)),
  }))
  const packagingDraft: OwnerDraft = {
    id: "OWN-PACKAGING",
    name: "Packaging",
    kind: "packaging",
    dependencyIds: prepared.map(draft => draft.id).sort((left, right) => left.localeCompare(right)),
  }
  return { ownerDrafts: [...prepared, packagingDraft], contracts }
}

function topologicalOwnerDrafts(drafts: readonly OwnerDraft[]): OwnerDraft[] {
  const ids = new Set(drafts.map(draft => draft.id))
  if (ids.size !== drafts.length) {
    throw graphFailure("graph.ids", "owners", "Owner IDs are not unique. Rename the conflicting semantic feature before rendering.")
  }
  for (const draft of drafts) {
    for (const dependencyId of draft.dependencyIds) {
      if (!ids.has(dependencyId)) {
        throw graphFailure("graph.references", draft.id, `Owner ${draft.id} references unknown dependency ${dependencyId}. Define the dependency owner before rendering.`)
      }
    }
  }
  const ordered: OwnerDraft[] = []
  const emitted = new Set<string>()
  while (ordered.length < drafts.length) {
    const next = drafts
      .filter(draft => !emitted.has(draft.id) && draft.dependencyIds.every(dependencyId => emitted.has(dependencyId)))
      .sort((left, right) => left.id.localeCompare(right.id))[0]
    if (!next) {
      const unresolved = drafts.filter(draft => !emitted.has(draft.id)).map(draft => draft.id).sort((left, right) => left.localeCompare(right)).join(", ")
      throw graphFailure("graph.cycles", "owners", `Owner dependency cycle prevents rendering: ${unresolved}. Remove one semantic capability or contract dependency to make the graph acyclic.`)
    }
    ordered.push(next)
    emitted.add(next.id)
  }
  return ordered
}

function buildPhases(
  preset: PresetContract,
  identity: ProjectIdentity,
  ownerDrafts: readonly OwnerDraft[],
  contracts: readonly GraphContract[],
  features: readonly GraphFeature[],
  requirements: readonly GraphRequirement[],
  acceptance: readonly GraphAcceptance[],
  astroPlan?: AstroRoutePlan,
  integrationServices: NormalizedBlueprint["externalServices"] = [],
  kitFoundationFiles: readonly string[] = [],
  blueprint?: NormalizedBlueprint,
): { owners: GraphOwner[]; phases: GraphPhase[] } {
  const foundationFiles = unique([
    ...preset.sourceLayout(identity),
    ...kitFoundationFiles,
    ...(astroPlan?.foundationExtras ?? []),
    ...(astroPlan?.seedContentPaths ?? []),
  ])
  const foundationTest = foundationFiles.find(file => /(?:Tests|tests|test)\//.test(file) || /ContractTest/.test(file)) ?? foundationFiles[0]!
  const foundationCriteria = [
    "Every foundation file exists at the exact listed path.",
    `The locked identity is ${identity.bundleId}.`,
    `The implementation marker is ${preset.implementationMarker}.`,
    ...(preset.id === "astro-web" ? ASTRO_FOUNDATION_SCRIPT_REQUIREMENTS.map(script => `package.json defines npm run ${script}.`) : []),
  ]
  const foundationTask: GraphTask = {
    id: "TASK-01-FOUNDATION",
    title: "Create the locked project foundation",
    ownerIds: [],
    featureIds: [],
    requirementIds: [],
    contractIds: [],
    dependencies: [],
    filesToCreate: foundationFiles,
    filesToModify: [],
    focusedTests: [foundationTest],
    acceptanceIds: [],
    acceptanceCriteria: foundationCriteria,
    prompt: `Create the ${preset.label} foundation with identity ${identity.bundleId}. Use only the locked stack. Kit files are copied before this task (see Working Rules): verify each listed kit file exists unchanged and create every other listed file before any later task modifies it.${preset.id === "astro-web" ? " package.json must define npm run check, test, test:a11y, build, and audit:performance before any later validation gate." : ""} Add a contract test that fails on stack or identity drift.`,
    validationCommands: preset.foundationValidationCommands
      ?? preset.validationCommands.slice(0, 2).map(command => command(identity)),
  }
  const phases: GraphPhase[] = [{ id: "PHASE-01-FOUNDATION", title: "Locked foundation", dependencies: [], tasks: [foundationTask] }]
  const owners: GraphOwner[] = []
  const orderedDrafts = topologicalOwnerDrafts(ownerDrafts)
  // Windowed presets: the first feature that shows the main surface builds the window content and the
  // shared view state; every later feature extends it instead of inventing its own.
  const firstMainOwnerId = preset.capabilities.windows
    ? orderedDrafts.find(draft => draft.kind === "feature" && features.some(feature => feature.ownerId === draft.id && feature.surface === "main"))?.id
    : undefined
  const coordinates = new Map(orderedDrafts.map((draft, index) => {
    const sequence = index + 2
    const suffix = draft.id.replace(/^OWN-/, "")
    return [draft.id, {
      phaseId: `PHASE-${String(sequence).padStart(2, "0")}-${suffix}`,
      taskId: `TASK-${String(sequence).padStart(2, "0")}-${suffix}`,
    }] as const
  }))

  orderedDrafts.forEach(draft => {
    const { phaseId, taskId } = coordinates.get(draft.id)!
    const ownerSlug = draft.kind === "integration"
      ? slug(draft.id.replace(/^OWN-INTEGRATION-/, ""))
      : slug(draft.name)
    const ownedFeature = features.find(feature => feature.ownerId === draft.id)
    const placement = ownedFeature && astroPlan ? astroPlan.featurePlacements[ownedFeature.id] : undefined
    const integrationService = draft.kind === "integration"
      ? integrationServices.find(service => `OWN-INTEGRATION-${slug(service.name).toUpperCase()}` === draft.id)
      : undefined
    const files = preset.ownerFiles({
      kind: draft.kind,
      slug: ownerSlug,
      pascalName: draft.name,
      identity,
      serverIntegration: integrationService?.credentialRequirement !== "none",
      pageFile: placement?.kind === "page" ? placement.pageFile : undefined,
    })
    const ownedContracts = contracts.filter(item => item.ownerId === draft.id)
    const contractIds = ownedContracts.map(item => item.id)
    const ownedFeatures = features.filter(feature => feature.ownerId === draft.id)
    const ownedFeatureIds = ownedFeatures.map(feature => feature.id)
    const ownedAcceptance = acceptance.filter(item => item.ownerId === draft.id)
    const routeExtras = placement?.kind === "page" && placement.pageFile !== files.implementationFile ? [placement.pageFile] : []
    const androidExtras = preset.id === "android-kotlin-compose" && blueprint
      ? androidTaskExtras({
          kind: draft.kind,
          identity,
          scheduled: androidScheduledFeatures(preset, identity, ownedFeatures),
          clockDependent: ownedFeatures.some(feature => androidClockFeatureIds(blueprint, features).has(feature.id)),
          notifications: blueprint.permissionNeeds.some(item => item.capability === "notifications"),
          focusedTestFile: files.focusedTestFile,
        })
      : undefined
    const filesToCreate = unique([
      files.implementationFile,
      files.focusedTestFile,
      ...routeExtras,
      ...(draft.kind === "packaging" ? preset.packagingFiles(identity) : []),
      ...(androidExtras?.create ?? []),
    ])
    const registrationTargets = placement?.registrationFile
      ? [placement.registrationFile]
      : preset.registrationFiles?.(draft.kind, identity)
        ?? [preset.registrationFile(draft.kind, identity)]
    // The packaging task verifies runtime wiring, so it may fix the composition roots it checks.
    const modifyCandidates = draft.kind === "packaging"
      ? unique([
          ...(preset.registrationFiles?.("feature", identity) ?? [preset.registrationFile("feature", identity)]),
          ...(preset.registrationFiles?.("integration", identity) ?? [preset.registrationFile("integration", identity)]),
          ...(preset.wiringManifestFiles ?? []),
          ...(androidExtras?.modify ?? []),
        ])
      : unique([...registrationTargets, ...(androidExtras?.modify ?? [])])
    // A file this task creates is not also a file it modifies.
    const filesToModify = modifyCandidates.filter(file => !filesToCreate.includes(file))
    const acceptanceCriteria = buildTaskAcceptanceCriteria(ownedAcceptance, ownedContracts, [files.focusedTestFile])
    const task: GraphTask = {
      id: taskId,
      title: `Implement ${draft.name}`,
      ownerIds: [draft.id],
      featureIds: ownedFeatureIds,
      requirementIds: requirements.filter(requirement => ownedFeatureIds.includes(requirement.featureId)).map(requirement => requirement.id),
      contractIds,
      dependencies: unique([foundationTask.id, ...draft.dependencyIds.map(dependencyId => coordinates.get(dependencyId)!.taskId)]),
      filesToCreate,
      filesToModify,
      focusedTests: [files.focusedTestFile],
      acceptanceIds: ownedAcceptance.map(item => item.id),
      acceptanceCriteria,
      prompt: `Implement owner ${draft.id} (${draft.name}) in ${files.implementationFile} and its real focused checks in ${files.focusedTestFile}. Cover direct features ${ownedFeatureIds.join(", ") || "none"} and owned contracts ${contractIds.join(", ")}. Depend only on ${draft.dependencyIds.join(", ") || "the locked foundation"}; implement every documented decision, failure, cancellation, cleanup, and recovery branch. Create only these files: ${filesToCreate.join(", ")}. ${filesToModify.length ? `Modify only these files, which earlier tasks created: ${filesToModify.join(", ")}.` : "Modify no existing file."}${draft.kind === "data" && preset.id !== "astro-web" ? " Its focused test must close the store and reopen it at the same location and assert that the stored records are identical." : ""}${draft.id === firstMainOwnerId ? " You are the first main-surface task: also build the main screen content area and the shared view state (the loaded records of every declared data object, plus whatever selection or input state the later feature tasks of this packet need) that later feature tasks extend; later tasks must not replace them." : ""}${preset.id === "linux-hyprland-waybar-module" && draft.kind === "feature" && blueprint ? waybarTaskNotes(blueprint, ownedFeatures.map(feature => feature.name)) : ""}${androidExtras?.note ? ` ${androidExtras.note}` : ""}`,
      validationCommands: draft.kind === "packaging"
        ? [files.focusedTestCommand, ...preset.validationCommands.map(command => command(identity))]
        : [files.focusedTestCommand, ...preset.validationCommands.slice(0, 2).map(command => command(identity))],
    }
    phases.push({ id: phaseId, title: draft.name, dependencies: unique(["PHASE-01-FOUNDATION", ...draft.dependencyIds.map(dependencyId => coordinates.get(dependencyId)!.phaseId)]), tasks: [task] })
    owners.push({
      ...draft,
      featureIds: ownedFeatureIds,
      contractIds,
      implementationFile: files.implementationFile,
      focusedTestFile: files.focusedTestFile,
      focusedTestCommand: files.focusedTestCommand,
      createPhaseId: phaseId,
      modifyPhaseIds: [],
    })
  })

  if (preset.id === "linux-hyprland-waybar-module" && blueprint) {
    const hooks = waybarHookSummary(blueprint, name => {
      const ownerId = features.find(feature => feature.name === name)?.ownerId
      return ownerId === undefined ? undefined : coordinates.get(ownerId)?.taskId
    })
    phases[0] = { ...phases[0]!, tasks: [{ ...foundationTask, prompt: foundationTask.prompt + hooks }] }
  }

  return { owners, phases }
}

// Applies the preset's blueprint- and option-dependent overrides; the graph and the audit both read the result.
export function specializePreset(preset: PresetContract, blueprint: NormalizedBlueprint, options: Readonly<Record<string, PresetOptionValue>>): PresetContract {
  return preset.specialize ? { ...preset, ...preset.specialize(preset, blueprint, options) } : preset
}

// Tauri task prompts name the exact commands, wrapper, wire format, and clock a task needs.
function refineTauriPhases(phases: readonly GraphPhase[], owners: readonly GraphOwner[], features: readonly GraphFeature[], blueprint: NormalizedBlueprint, kitPaths: readonly string[]): GraphPhase[] {
  const data = blueprint.domainData.map(tauriData)
  const hasRecords = blueprint.persistenceNeeds.some(need => need.storage === "records")
  const shortcut = blueprint.platformNeeds.includes("global-hotkey")
  return phases.map(phase => ({
    ...phase,
    tasks: phase.tasks.map(task => {
      const kind = task.id === "TASK-01-FOUNDATION" ? "foundation" as const : owners.find(owner => owner.id === task.ownerIds[0])?.kind
      if (!kind) return task
      const extra = tauriTaskPrompt({
        kind,
        features: features.filter(feature => task.featureIds.includes(feature.id)),
        data,
        hasRecords,
        shortcut,
        ownFiles: kind === "foundation" ? task.filesToCreate.filter(file => !kitPaths.includes(file)) : undefined,
      })
      return extra ? { ...task, prompt: `${task.prompt} ${extra}` } : task
    }),
  }))
}

function recoveryRulesFor(preset: PresetContract, blueprint: NormalizedBlueprint): readonly string[] {
  // Without a declared service, a web page's network need is only its own assets, so it adds no form or fetch recovery.
  const needs = preset.id === "astro-web" && !blueprint.externalServices.length ? blueprint.platformNeeds.filter(need => need !== "network") : blueprint.platformNeeds
  const interactive = blueprint.externalServices.length > 0 || blueprint.permissionNeeds.length > 0 || needs.length > 0
  return preset.staticRecoveryRules && !interactive ? preset.staticRecoveryRules : preset.recoveryRules
}

function lockedStackFor(preset: PresetContract, blueprint: NormalizedBlueprint): readonly string[] {
  if (preset.id === "tauri2-rust-typescript-desktop") {
    const { http } = rustKitHelpers(blueprint)
    return http ? preset.allowedTechnologies : preset.allowedTechnologies.filter(technology => technology !== "reqwest" && !technology.startsWith("tokio-tungstenite"))
  }
  if (preset.id !== "linux-hyprland-waybar-module" && preset.id !== "linux-wayland-gtk4-desktop") return preset.allowedTechnologies
  const { records, secrets, http } = rustKitHelpers(blueprint)
  const omitted = new Set([...(records ? [] : ["rusqlite"]), ...(secrets ? [] : ["keyring (Secret Service)"]), ...(http ? [] : ["reqwest with rustls"])])
  return preset.allowedTechnologies.filter(technology => !omitted.has(technology))
}

export function compileProjectGraph(blueprint: NormalizedBlueprint, presetId: PresetId, presetOptions: Readonly<Record<string, PresetOptionValue>> = {}): ProjectGraph {
  const basePreset = PRESETS[presetId]
  if (!basePreset) throw new Error(`Unknown preset: ${String(presetId)}`)
  const preset = specializePreset(basePreset, blueprint, presetOptions)
  const identity = projectIdentity(blueprint.projectName)
  const featureIds = allocateStableIds("FEAT", blueprint.features.map(feature => feature.name))
  const resolvedFeatures = resolveRequiredOwners(blueprint.features.map((feature, index): GraphFeature => {
    const rawOwnerId = `OWN-${featureIds[index]!.replace(/^FEAT-/, "")}`
    const reservedOwners = new Set([
      "OWN-CREDENTIAL-VAULT",
      "OWN-DATA-STORE",
      "OWN-PERMISSION-COORDINATOR",
      "OWN-LIFECYCLE-COORDINATOR",
      "OWN-PACKAGING",
    ])
    const ownerId = reservedOwners.has(rawOwnerId) || rawOwnerId.startsWith("OWN-INTEGRATION-")
      ? `${rawOwnerId}-FEATURE`
      : rawOwnerId
    return {
      id: featureIds[index]!,
      name: feature.name,
      ownerId,
      behavior: feature.behavior,
      inputs: feature.inputs,
      outputs: feature.outputs,
      acceptanceOutcomes: feature.acceptanceOutcomes,
      failureBehavior: feature.failureBehavior,
      recoveryExpectations: feature.recoveryExpectations,
      providedCapabilities: feature.providedCapabilities,
      requiredCapabilities: feature.requiredCapabilities,
      dataOperations: feature.dataOperations,
      runsEverySeconds: feature.runsEverySeconds,
      runsDailyAt: feature.runsDailyAt,
      resourceIds: feature.resourceIds,
      requiredOwnerIds: [],
      choices: feature.choices,
      surface: feature.surface,
      userFileAccess: feature.userFileAccess,
    }
  }))
  const { features, acceptance, requirements } = lowerAcceptanceOwnership(resolvedFeatures)
  const mode = preset.runtimeMode(blueprint)
  const astroPlan = presetId === "astro-web" ? planAstroWeb(blueprint, features, mode) : undefined

  const integrationServices = compilerIntegrationServices(blueprint)
  const { ownerDrafts, contracts } = buildOwnersAndContracts(blueprint, preset, identity, features, astroPlan, integrationServices, presetOptions)
  // Kit files no other owner claims belong to the foundation, so the "create only" lists stay exact.
  const kitPaths = kitProjectPaths(presetKit(presetId, identity, blueprint, presetOptions))
  const packagingOwned = new Set(["Scripts/package_app.sh", ...preset.packagingFiles(identity)])
  const featureOwnedFiles = new Set(features.flatMap(feature => {
    const placement = astroPlan?.featurePlacements[feature.id]
    const files = preset.ownerFiles({
      kind: "feature",
      slug: slug(feature.name),
      pascalName: pascal(feature.name),
      identity,
      pageFile: placement?.kind === "page" ? placement.pageFile : undefined,
    })
    return [files.implementationFile, files.focusedTestFile]
  }))
  const kitFoundationFiles = kitPaths.filter(path => !preset.sourceLayout(identity).includes(path) && !packagingOwned.has(path) && !featureOwnedFiles.has(path))
  const built = buildPhases(preset, identity, ownerDrafts, contracts, features, requirements, acceptance, astroPlan, integrationServices, kitFoundationFiles, blueprint)
  const owners = built.owners
  const phases = presetId === "tauri2-rust-typescript-desktop" ? refineTauriPhases(built.phases, owners, features, blueprint, kitPaths) : built.phases
  const persistenceEnabled = blueprint.persistenceNeeds.length > 0
  const declaredStorage = new Set(blueprint.persistenceNeeds.map(p => p.storage))
  const kindDecisions = [
    declaredStorage.has("settings") ? preset.persistence.settingsDecision : undefined,
    declaredStorage.has("records") ? preset.persistence.recordsDecision : undefined,
  ].filter((decision): decision is string => Boolean(decision))
  const persistenceDecision = persistenceEnabled
    ? kindDecisions.length
      ? `Persistence: ${kindDecisions.map(decision => decision.replace(/^Persistence: /, "").replace(/\.$/, "")).join("; ")}.`
      : astroPlan?.usesContentCollections
      ? ASTRO_CONTENT_COLLECTION_PERSISTENCE.enabledDecision
      : astroPlan?.browserPersistence
        ? preset.persistence.enabledDecision
        : preset.persistence.enabledDecision
    : preset.persistence.disabledDecision
  const persistenceSettings = (astroPlan?.usesContentCollections
    ? ASTRO_CONTENT_COLLECTION_PERSISTENCE.settingsPlacement
    : preset.persistence.settingsPlacement).replaceAll("{app-id}", identity.bundleId)
  const persistenceRecords = (astroPlan?.usesContentCollections
    ? ASTRO_CONTENT_COLLECTION_PERSISTENCE.recordsPlacement.replace("{collection}", astroPlan.collections.map(item => `src/content/${item.name}/`).join(", "))
    : preset.persistence.recordsPlacement).replaceAll("{app-id}", identity.bundleId)
  // Read back from the rendered contract so the summary always matches the per-object placement.
  const appFilesData = blueprint.persistenceNeeds.find(p => p.storage === "app-files")?.data
  const appFilesPlacement = appFilesData
    ? contracts.find(item => item.kind === "persistence" && item.name === `${appFilesData} persistence`)?.details.find(detail => detail.startsWith("Placement: "))?.slice("Placement: ".length)
    : undefined

  const effectiveIntegrationBoundary = preset.id === "astro-web" && integrationServices.length === 0
    ? "Static site with no external service: pages call no remote endpoint and hold no credential; every request is for the site's own assets."
    : integrationServices.length === 0 && !blueprint.platformNeeds.includes("network")
      ? "Standalone local application: no remote network endpoints, cloud credentials, or third-party web services are used."
      : preset.integrationBoundary

  const graph: ProjectGraph = {
    blueprint,
    presetId,
    presetLabel: preset.label,
    identity,
    runtimeMode: mode,
    features,
    acceptance,
    requirements,
    contracts,
    owners,
    phases,
    foundationFiles: unique([...preset.sourceLayout(identity), ...kitFoundationFiles, ...(astroPlan?.foundationExtras ?? []), ...(astroPlan?.seedContentPaths ?? [])]),
    kitPaths,
    lockedStack: lockedStackFor(preset, blueprint),
    forbiddenTechnologies: preset.forbiddenTechnologies,
    testFramework: preset.testFramework,
    persistence: {
      enabled: persistenceEnabled,
      decision: persistenceDecision,
      settingsPlacement: persistenceSettings,
      recordsPlacement: persistenceRecords,
      ...(appFilesPlacement ? { appFilesPlacement } : {}),
    },
    signingDecision: preset.signingDecision(identity),
    installationDecision: preset.installationDecision(identity),
    validationCommands: preset.validationCommands.map(command => command(identity)),
    ...(preset.deviceGates ? { deviceValidation: preset.deviceGates } : {}),
    packagingRules: preset.packagingRules,
    lifecycleRules: preset.lifecycleRules,
    accessibilityRules: preset.accessibilityRules,
    runtimeArchitecture: preset.runtimeArchitecture,
    integrationBoundary: effectiveIntegrationBoundary,
    recoveryRules: recoveryRulesFor(preset, blueprint),
    outputArtifact: preset.outputArtifact,
    artifactPath: preset.artifactPath(identity),
    completionEvidence: preset.completionEvidence,
    astroPlan,
    presetOptions,
  }
  assertGraphReadyForRendering(graph)
  return graph
}

export function assertGraphReadyForRendering(graph: ProjectGraph): void {
  const firstFailure = auditProjectGraph(graph)[0]
  if (firstFailure) throw new GraphConstructionError(firstFailure)
}

async function sha256(content: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(content))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("")
}

async function hashDocuments(documents: DocumentPacket): Promise<DocumentHashes> {
  const entries = await Promise.all(DOCUMENT_NAMES.map(async name => [name, await sha256(documents[name])] as const))
  return Object.fromEntries(entries) as Record<DocumentName, string>
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

export type LocalCompileStage = "preset-compiler" | "mechanical-audit" | "agent-readiness-audit" | "rendering" | "export-gate"

export async function compileNormalizedPacket(
  blueprint: NormalizedBlueprint,
  presetId: PresetId,
  onProgress?: (stage: LocalCompileStage) => void,
  presetOptions: Readonly<Record<string, PresetOptionValue>> = {},
): Promise<CompiledPacket> {
  onProgress?.("preset-compiler")
  const graph = compileProjectGraph(blueprint, presetId, presetOptions)
  onProgress?.("mechanical-audit")
  const mechanicalIssues = auditMechanicalGraph(graph)
  onProgress?.("agent-readiness-audit")
  const readinessIssues = auditAgentReadinessGraph(graph)
  onProgress?.("rendering")
  const documents = renderPacket(graph)
  const repeatedDocuments = renderPacket(graph)
  onProgress?.("export-gate")
  const packetIssues = auditPacket(graph, documents, specializePreset(PRESETS[presetId], graph.blueprint, graph.presetOptions))
  const renderIssues: AuditFailure[] = DOCUMENT_NAMES
    .filter(name => repeatedDocuments[name] !== documents[name])
    .map(name => ({ rule: "render.deterministic", path: name, message: `${name} changed across repeated local rendering.` }))
  const hashes = await hashDocuments(documents)
  const kit = await Promise.all(presetKit(presetId, graph.identity, graph.blueprint, graph.presetOptions)
    .map(async file => ({ name: `kit/${file.path}`, content: file.content, sha256: await sha256(file.content) })))
  const failures = [...mechanicalIssues, ...readinessIssues, ...renderIssues, ...packetIssues]
  const ledger = buildValidationLedger(failures)
  return deepFreeze({
    presetId,
    projectSlug: graph.identity.slug,
    graph,
    documents,
    hashes,
    kit,
    ledger,
    failures,
    exportable: failures.length === 0,
  })
}

export function compilePacket(blueprint: SemanticBlueprint, presetId: PresetId, presetOptions: Readonly<Record<string, PresetOptionValue>> = {}): Promise<CompiledPacket> {
  return compileNormalizedPacket(normalizeBlueprint(blueprint, presetId), presetId, undefined, presetOptions)
}

export function packetForExport(packet: CompiledPacket): readonly ExportFile[] {
  if (!packet.exportable) return []
  return [
    ...DOCUMENT_NAMES.map(name => ({ name, content: packet.documents[name], sha256: packet.hashes[name] })),
    ...packet.kit,
  ]
}

export interface PacketManifest {
  readonly schema: "nodaysidle.cascade.packet.v4"
  readonly compiler: { readonly version: string }
  readonly preset: {
    readonly id: PresetId
    readonly options: Readonly<Record<string, PresetOptionValue>>
    readonly capabilities: (typeof PRESETS)[PresetId]["capabilities"]
  }
  readonly blueprint: SemanticBlueprint
  readonly documents: Record<string, { readonly sha256: string }>
  readonly kit: readonly { readonly path: string; readonly sha256: string }[]
  readonly validation: { readonly status: "pass" | "fail"; readonly ledger: CompiledPacket["ledger"] }
}

// One manifest shape for the CLI and the desktop app, so `cascade verify` accepts either export.
export function buildPacketManifest(packet: CompiledPacket, blueprint: SemanticBlueprint, presetId: PresetId, options: Readonly<Record<string, PresetOptionValue>>): PacketManifest {
  return {
    schema: "nodaysidle.cascade.packet.v4",
    compiler: { version: "4.0.0" },
    preset: { id: presetId, options, capabilities: PRESETS[presetId].capabilities },
    blueprint,
    documents: Object.fromEntries(DOCUMENT_NAMES.map(name => [name, { sha256: packet.hashes[name]! }])),
    kit: packet.kit.map(file => ({ path: file.name, sha256: file.sha256 })),
    validation: { status: packet.exportable ? "pass" : "fail", ledger: packet.ledger },
  }
}

// blueprint.json: the validated provider blueprint plus preset, options, and every file hash.
export async function blueprintExportFile(packet: CompiledPacket, blueprint: SemanticBlueprint, presetId: PresetId, options: Readonly<Record<string, PresetOptionValue>>): Promise<ExportFile> {
  const content = `${JSON.stringify(buildPacketManifest(packet, blueprint, presetId, options), null, 2)}\n`
  return { name: BLUEPRINT_FILE_NAME, content, sha256: await sha256(content) }
}

export const BLUEPRINT_FILE_NAME = "blueprint.json"

export async function verifyPacketHashes(packet: CompiledPacket): Promise<boolean> {
  const current = await hashDocuments(packet.documents)
  const kitHashes = await Promise.all(packet.kit.map(file => sha256(file.content)))
  return DOCUMENT_NAMES.every(name => current[name] === packet.hashes[name])
    && packet.kit.every((file, index) => kitHashes[index] === file.sha256)
}
