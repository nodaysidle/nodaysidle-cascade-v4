import { auditAgentReadinessGraph, auditMechanicalGraph, auditPacket, auditProjectGraph, buildValidationLedger, type AuditEntry, type AuditFailure } from "./audit"
import { CATALOG_PATH } from "./astroKit"
import { ASTRO_CONTENT_COLLECTION_PERSISTENCE, ASTRO_FOUNDATION_SCRIPT_REQUIREMENTS, astroStaticContentSite, dataKey, planAstroWeb, type AstroRoutePlan } from "./astroWeb"
import { PRESETS, USER_SELECTED_FILE_PLACEMENT, type OwnerKind, type PermissionCapability, type PresetContract, type PresetId, type PresetOptionValue, type PresetRuntimeMode, type ProjectIdentity } from "./presets"
import { androidKitNeeds } from "./androidKit"
import { ANDROID_DELETE_PROMPT, androidChoiceMatchesPicker, androidFormRules } from "./androidForms"
import { androidScheduleContract, androidTaskExtras, type AndroidScheduledFeature } from "./androidPlan"
import { renderPacket } from "./renderers"
import { featureDataUses, featureReferenceIssues, referenceKey, type DataStorage, type DataValueType, type DataWriteMode, type FeatureRecovery, type FeatureSurface, type PlatformNeed, type SemanticBlueprint, type SemanticIssue } from "./schema"
import { gtkStoreInterface, refineGtkContracts, refineGtkPhases } from "./gtkContracts"
import { kitProjectPaths, nativeUsageDescriptions, presetKit, rustKitHelpers, waybarHookSummary, waybarLaunchers, waybarRoles, waybarTaskNotes } from "./kits"
import { waybarFeatureDetail, waybarKitParts, waybarLifecycleNote, refineWaybarContracts, waybarPageDetail, waybarRequestDetail, waybarResponseDetail, waybarSettingsInterface, waybarSingleRecordDetail, waybarSourceDetail } from "./waybarContracts"
import { buildTaskAcceptanceCriteria } from "./taskAcceptance"
import type { JevAtomicAuditDecision } from "./jev"
import { TAURI_WIRE_FORMAT, isCountdown, tauriAddHasForm, tauriDocumentInterface, tauriFeatureOps, tauriMainSlotsSentence, tauriStoreInterface, tauriTaskPrompt, type TauriData, type TauriFeatureUse } from "./tauriContracts"

export const DOCUMENT_NAMES = ["PRD.md", "ARD.md", "TRD.md", "TASKS.md", "AGENTS.md"] as const
export type DocumentName = (typeof DOCUMENT_NAMES)[number]
export type ContractKind = "interface" | "data" | "integration" | "lifecycle" | "persistence" | "credential" | "permission" | "recovery" | "security" | "packaging"

export type SystemSource = "none" | "network-received" | "network-sent" | "load-average" | "memory" | "swap" | "battery" | "disk-space" | "temperature"
export type InvokedBy = "user-control" | "click" | "schedule" | "launch" | "shortcut"
export type DataOperation = "create" | "read" | "update" | "delete"
export interface DataField {
  readonly name: string
  readonly valueType: DataValueType
  readonly optional: boolean
  readonly min?: number | null
  readonly max?: number | null
  // The value the app sets itself when it creates a record (a status such as Not started); null for a field the user types.
  readonly initial?: string | null
  // True when an action of the app (not the user's typing) writes the field (a last-watered day).
  readonly appStamped?: boolean
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
    readonly failureRecovery: FeatureRecovery
    readonly providedCapabilities: readonly string[]
    readonly requiredCapabilities: readonly string[]
    readonly dataOperations: readonly DataOperation[]
    readonly operationsByData: Readonly<Record<string, readonly DataOperation[]>>
    readonly editsRecords: boolean
    readonly narrowsListBy: "none" | "text" | "flag" | "sort"
    readonly showsCurrentTime?: boolean
    readonly readsCurrentDay?: boolean
    readonly refreshesEverySeconds?: number | null
    readonly invokedBy: InvokedBy
    readonly runsEverySeconds: number | null
    readonly runsDailyAt: string | null
    readonly systemSource: SystemSource
    readonly thresholds: NonNullable<SemanticBlueprint["features"][number]["thresholds"]>
    readonly labelTemplate: string
    readonly runsAtField: SemanticBlueprint["features"][number]["runsAtField"]
    readonly scheduledNotification: { readonly titleText: string; readonly notificationBody: string } | null
    readonly resourceIds: readonly string[]
    readonly choices: readonly string[]
    readonly choiceLists?: readonly { readonly name: string; readonly options: readonly string[]; readonly initial: string }[]
    readonly surface: FeatureSurface
    readonly userFileAccess: "none" | "opens" | "saves" | "opens-and-saves"
  }[]
  readonly externalServices: readonly {
    readonly name: string
    readonly purpose: string
    readonly dataSent: readonly string[]
    readonly credentialRequirement: "none" | "api-key"
    readonly endpoint: string
    readonly webPage: string
    readonly requestValueFrom: string
    readonly requestValueType: "text" | "number"
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
    readonly singleRecord: boolean
    // How many entries the idea states when it names none; null otherwise.
    readonly entryCount: number | null
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
  readonly failureRecovery: FeatureRecovery
  readonly providedCapabilities: readonly string[]
  readonly requiredCapabilities: readonly string[]
  readonly dataOperations: readonly DataOperation[]
  readonly operationsByData: Readonly<Record<string, readonly DataOperation[]>>
  readonly editsRecords: boolean
  readonly narrowsListBy: "none" | "text" | "flag" | "sort"
  readonly showsCurrentTime?: boolean
  readonly readsCurrentDay?: boolean
  readonly refreshesEverySeconds?: number | null
  readonly invokedBy: InvokedBy
  readonly runsEverySeconds: number | null
  readonly runsDailyAt: string | null
  readonly systemSource: SystemSource
  readonly thresholds: NormalizedBlueprint["features"][number]["thresholds"]
  readonly labelTemplate: string
  readonly runsAtField: SemanticBlueprint["features"][number]["runsAtField"]
  readonly scheduledNotification: { readonly titleText: string; readonly notificationBody: string } | null
  readonly resourceIds: readonly string[]
  readonly requiredOwnerIds: readonly string[]
  readonly choices: readonly string[]
  readonly choiceLists?: readonly { readonly name: string; readonly options: readonly string[]; readonly initial: string }[]
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
export function pascal(value: string): string {
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
    .replace(/\beither\s+(?=[a-z]+\s+(?:is|are|has|have|was|were|contains)\b)/gi, "any ")
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

const STATIC_SITE_RECOVERY = "A bad content file fails npm run build and names the file and field; a finished page has no runtime failure, retry, or last valid state. Fix the file and rebuild."

// An edit that creates nothing starts from the stored record, so its picker preselects the stored option, not the list's initial one.
const tauriEditsOnly = (feature: SemanticBlueprint["features"][number], presetId: PresetId): boolean =>
  presetId === "tauri2-rust-typescript-desktop" && feature.dataOperations.some(entry => entry.operations.includes("update") || entry.operations.includes("edit")) && !feature.dataOperations.some(entry => entry.operations.includes("create"))

function featureRecovery(name: string, recovery: FeatureRecovery, staticSite = false, presetId?: PresetId): string {
  if (staticSite) return STATIC_SITE_RECOVERY
  switch (recovery) {
    case "exit":
      if (presetId === "linux-hyprland-waybar-module") return `A failed ${name} action returns Err (exit 2, message on stderr); the bar output and everything stored stay as they were.`
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

// Mirrors astroStaticContentSite for a provider blueprint, before normalization has resolved platform needs.
function astroStaticSource(source: SemanticBlueprint, presetId: PresetId): boolean {
  return presetId === "astro-web" && !source.externalServices.length && !source.features.some(feature => feature.usesPlatformNeeds.includes("local-storage"))
}

function normalizationIssue(path: string): never {
  throw new NormalizationError([{ path, rule: "normalization.unusable-meaning", message: "Provider mechanics left no usable product meaning at this path." }])
}

// A static Astro site's content is build-time records: public or internal data with declared fields is always a records
// collection, whatever storage the provider wrote (intake rejects a document no feature opens; this keeps a direct call
// correct too). With no service and no feature that opens or saves a file, the browser needs a provider listed for it
// (notifications, camera, storage...) have no owner, contract, or task on such a site, so they are dropped.
function astroStaticContentSource(source: SemanticBlueprint): SemanticBlueprint {
  const opensFiles = source.features.some(feature => feature.userFileAccess !== "none")
  const isContent = (item: SemanticBlueprint["dataObjects"][number]) => item.fields.length > 0 && (item.sensitivity === "public" || item.sensitivity === "internal")
  const dataObjects = source.dataObjects.map(item => !opensFiles && isContent(item) && (item.storage === "document" || item.storage === "app-files") ? { ...item, storage: "records" as const } : item)
  const hasCollections = dataObjects.some(item => item.storage === "records" && isContent(item))
  if (source.externalServices.length || opensFiles || !hasCollections) return { ...source, dataObjects }
  return { ...source, dataObjects, platformNeeds: [], features: source.features.map(feature => ({ ...feature, usesPlatformNeeds: [] })) }
}

export function normalizeBlueprint(input: SemanticBlueprint, presetId: PresetId, atomicAudits?: JevAtomicAuditDecision): NormalizedBlueprint {
  const source = presetId === "astro-web" ? astroStaticContentSource(input) : input
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
      recoveryExpectations: [featureRecovery(name, feature.failureRecovery, astroStaticSource(source, presetId), presetId)],
      failureRecovery: feature.failureRecovery,
      // A feature provides itself, so another feature's buildsOn becomes an owner dependency.
      providedCapabilities: [slug(name)],
      requiredCapabilities: unique(feature.buildsOn.map(other => slug(cleanMeaning(other)))),
      // "edit" (change fields in a form) is an update of the stored record; the flag below keeps the difference for the screen.
      dataOperations: unique(feature.dataOperations.flatMap(entry => entry.operations.map(operation => operation === "edit" ? "update" as const : operation))),
      operationsByData: Object.fromEntries(feature.dataOperations.map(entry => [referenceKey(entry.data), unique(entry.operations.map(operation => operation === "edit" ? "update" as const : operation))])),
      editsRecords: feature.dataOperations.some(entry => entry.operations.includes("edit")),
      narrowsListBy: feature.narrowsListBy ?? "none",
      showsCurrentTime: feature.showsCurrentTime === true,
      readsCurrentDay: feature.readsCurrentDay === true,
      refreshesEverySeconds: feature.refreshesEverySeconds ?? null,
      invokedBy: feature.invokedBy,
      runsEverySeconds: feature.runsEverySeconds,
      runsDailyAt: feature.runsDailyAt,
      systemSource: feature.systemSource,
      thresholds: feature.thresholds ?? [],
      labelTemplate: (feature.labelTemplate ?? "").trim(),
      runsAtField: feature.runsAtField,
      scheduledNotification: feature.scheduledNotification ?? null,
      resourceIds: [],
      usesPlatformNeeds: unique(feature.usesPlatformNeeds),
      usesData: unique(featureDataUses(source, feature).map(name => dataNameByKey.get(referenceKey(name))!)),
      usesServices: unique(feature.usesServices.map(name => serviceNameByKey.get(referenceKey(name))!)),
      userFileAccess: feature.userFileAccess,
      choices: feature.choiceLists.map(list => `${cleanMeaning(list.name)}: ${cleanList(list.options).join(", ")}${astroStaticSource(source, presetId) ? "" : `; initially ${tauriEditsOnly(feature, presetId) || androidEditsPicker(feature, list.options, source, presetId, list.name) ? "the stored value of the record being edited" : cleanMeaning(list.initial)}`}`),
      choiceLists: feature.choiceLists.map(list => ({ name: cleanMeaning(list.name), options: cleanList(list.options), initial: cleanMeaning(list.initial) })),
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
      fields: item.fields.map(field => ({ name: cleanMeaning(field.name), valueType: field.valueType, optional: field.optional, min: field.min ?? null, max: field.max ?? null, initial: field.initial ?? null, appStamped: field.appStamped ?? false })).filter(field => field.name),
      singleRecord: item.singleRecord,
      entryCount: item.entryCount ?? null,
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
      webPage: item.webPage.trim(),
      requestValueFrom: cleanMeaning(item.requestValueFrom),
      requestValueType: item.requestValueType ?? "text",
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
          : source.features.some(feature => feature.dataOperations.some(entry => entry.operations.includes("delete") && referenceKey(entry.data) === referenceKey(item.name)))
            ? `Delete ${item.name} only through the feature that declares delete, after an explicit user action, and report deletion failure honestly.`
            : `No feature deletes ${item.name}; build no delete action for it.`,
      sensitivity: item.sensitivity,
      storage: item.storage,
      writeMode: item.writeMode,
      temporary: item.storage === "temporary",
    }))
  const privacySecurityRequirements = uniqueStrings([
    astroStaticSource(source, presetId)
      ? "The site collects no visitor data and has no forms; a built page with a form, input or textarea fails the packaging test."
      : "Minimize collected data and keep it inside the preset-defined owner, storage, and integration boundaries.",
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
      behavior: presetId === "android-kotlin-compose"
        ? `The Application's onCreate builds the AppContainer and calls the lifecycle owner's start(container), which starts nothing (${features.some(feature => feature.runsDailyAt !== null || feature.runsEverySeconds !== null || feature.runsAtField !== null) ? "each declared schedule is started by the Application's onCreate alone, as its schedule contract says, so no schedule has two starters" : "no schedule is declared"}); nothing starts a remote request or a deletion, and the Room database opens on first use.`
        : platformNeeds.includes("background-execution")
        ? "Initialize preset-owned state and services and start the declared background features; start no other capture, remote request, or destructive work automatically."
        : "Initialize preset-owned state and services without starting privileged capture, remote requests, or destructive work automatically.",
      cleanup: "Rollback partial initialization and keep a safe retry or manual launch path.",
    },
    {
      event: "Application termination",
      behavior: presetId === "android-kotlin-compose"
        ? "Android gives no reliable process-termination callback: every durable change is committed when the user acts, and the lifecycle owner's stop() cancels only the coroutines it started."
        : "Stop new work, cancel active operations, and preserve only state covered by the persistence contracts.",
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
    domainData: dataObjects.map(item => ({ name: item.name, meaning: item.purpose, retention: item.retentionIntent, sensitivity: item.sensitivity, storage: item.storage, writeMode: item.writeMode, fields: item.fields, singleRecord: item.singleRecord, entryCount: item.entryCount })),
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

// A package segment must not be a Java or Kotlin keyword ("com.class.schedule" is not a valid Android package).
const RESERVED_SEGMENTS = new Set([
  "abstract", "as", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const", "continue", "default", "do", "double",
  "else", "enum", "extends", "false", "final", "finally", "float", "for", "fun", "goto", "if", "implements", "import", "in", "instanceof", "int",
  "interface", "is", "long", "native", "new", "null", "object", "package", "private", "protected", "public", "return", "short", "static",
  "strictfp", "super", "switch", "synchronized", "this", "throw", "throws", "transient", "true", "try", "typealias", "val", "var", "void",
  "volatile", "when", "while",
])

function bundleSegment(part: string, fallback: string): string {
  const segment = part || fallback
  const named = /^[a-z]/.test(segment) ? segment : `p${segment}`
  return RESERVED_SEGMENTS.has(named) ? `${named}app` : named
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

export function allocateStableIds(prefix: string, names: readonly string[]): string[] {
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

// Android: an edit feature's choice list that is the picker of a bounded field starts at that record's stored value.
function androidEditsPicker(feature: SemanticBlueprint["features"][number], options: readonly string[], source: SemanticBlueprint, presetId: PresetId, listName = ""): boolean {
  return presetId === "android-kotlin-compose" && feature.dataOperations.some(entry => entry.operations.includes("edit")) && source.dataObjects.some(item => androidChoiceMatchesPicker(options, item.fields, listName))
}

// A declared bound is part of the field's type everywhere it is stated.
function rangeNote(field: DataField): string {
  const initial = field.initial != null && field.initial !== "" ? `, set to "${field.initial}" by the app when the record is created (never typed by the user)` : ""
  if (field.min != null && field.max != null) return `, from ${field.min} to ${field.max}${initial}`
  if (field.min != null) return `, at least ${field.min}${initial}`
  if (field.max != null) return `, at most ${field.max}${initial}`
  return initial
}

const VALUE_TYPE_LABEL: Record<DataValueType, string> = {
  text: "short text",
  "long-text": "long text",
  number: "number",
  "whole-number": "whole number",
  flag: "true/false flag",
  date: "calendar day (local, no time)",
  "date-time": "date and time",
  time: "time of day, HH:MM 24-hour zero-padded",
  "text-list": "ordered list of text lines",
  reference: "reference to another stored item",
}

// What one feature does to one data object, as declared per object.
function opsOn(feature: GraphFeature, dataName: string): readonly DataOperation[] {
  return feature.operationsByData[referenceKey(dataName)] ?? []
}

// The stored shape and the exact operations the declared features perform, so every task that
// touches the store uses one schema and builds no operation nobody asked for.
function dataShapeDetails(presetId: PresetId, item: NormalizedBlueprint["domainData"][number], features: readonly GraphFeature[], allData: NormalizedBlueprint["domainData"] = []): string[] {
  const users = features.filter(feature => dataFeatureIds(item.name, features).includes(feature.id))
  const tauri = presetId === "tauri2-rust-typescript-desktop"
  if (tauri && item.storage === "document") return [tauriDocumentInterface(tauriData(item), users)]
  const documentResources = new Set(allData.filter(other => other.storage === "document").flatMap(other => dataResourceIds(other.name)))
  // A Tauri feature that saves a document writes only that file; its records are read, not created.
  const operationsOf = (feature: GraphFeature): readonly DataOperation[] => tauri ? tauriFeatureOps(item.storage, opsOn(feature, item.name), feature, documentResources) : opsOn(feature, item.name)
  const operations = unique(users.flatMap(operationsOf))
  if (item.storage === "app-files" && operations.length && presetId !== "astro-web") {
    const names = operations.flatMap(operation => operation === "create" ? ["import_file(source)"] : operation === "delete" ? ["remove_file(reference)"] : operation === "read" ? ["file_path(reference)"] : [])
    return [`File operations (OWN-DATA-STORE owns them; feature tasks add no other file access): ${names.join(", ")}. A file is copied into the app folder before its record is inserted, and a failed insert removes the copy.`]
  }
  if (presetId === "android-kotlin-compose" && item.storage === "settings") {
    const runState = users.filter(feature => feature.runsDailyAt !== null || feature.runsEverySeconds !== null)
    if (runState.length && item.fields.some(field => field.valueType === "date" || field.valueType === "date-time")) {
      return [`Interface: the date ${item.name} keeps is the kit's schedule run state, SettingsRepository.lastRunEpochDay("${slug(runState[0]!.name)}") and recordRun("${slug(runState[0]!.name)}", epochDay), already provided and tested; OWN-DATA-STORE adds no key, no writer, and no file for it and only tests that reading it returns what the schedule recorded.`]
    }
    return [`Interface: OWN-DATA-STORE adds one typed Preferences DataStore key per value of ${item.name} to data/SettingsRepository.kt${item.fields.length ? ` (${item.fields.map(field => field.name).join(", ")})` : ""}, each with a Flow reader and a suspend writer; no Room entity or DAO exists for it.`]
  }
  if (!item.fields.length) return []
  if (presetId === "linux-hyprland-waybar-module" && item.storage === "settings") return [waybarSettingsInterface(item, operations)]
  const lines = [
    `Stored fields (one record each, plus ${presetId === "astro-web" ? "its entry id, the file name without extension" : "a stable generated id"}): ${item.fields.map(field => `${field.name} (${VALUE_TYPE_LABEL[field.valueType]}${rangeNote(field)}${field.optional ? ", optional" : ""})`).join("; ")}.`,
  ]
  if (operations.length) {
    lines.push(`Store operations, exactly these and no others: ${operations.map(operation => `${operation} (${users.filter(feature => operationsOf(feature).includes(operation)).map(feature => feature.id).join(", ")})`).join("; ")}.`)
    lines.push(storeInterfaceDetail(presetId, item, operations))
    if (presetId === "linux-hyprland-waybar-module") lines.push(...waybarSingleRecordDetail(item, operations))
  } else if (presetId === "astro-web") {
    lines.push(storeInterfaceDetail(presetId, item, operations))
  }
  return lines
}

// The records a feature saves through a form (create, or edit), and whether it deletes: the form, field, and delete-prompt rules of its interface contract.
function androidFormFeature(feature: GraphFeature, item: NormalizedBlueprint["domainData"][number]): { creates: boolean; edits: boolean } | null {
  if (item.storage !== "records") return null
  const ops = opsOn(feature, item.name)
  const creates = ops.includes("create")
  const edits = feature.editsRecords && ops.includes("update")
  return creates || edits ? { creates, edits } : null
}

function androidFeatureFormDetails(feature: GraphFeature, data: NormalizedBlueprint["domainData"], features: readonly GraphFeature[]): string[] {
  const itemPage = features.some(other => other.surface === "item-page")
  const details = data.flatMap(item => {
    const form = androidFormFeature(feature, item)
    return form ? androidFormRules(item.name, item.fields, { edits: form.edits, creates: form.creates, itemPage, choices: feature.choiceLists }) : []
  })
  if (data.some(item => item.storage === "records" && opsOn(feature, item.name).includes("delete"))) details.push(ANDROID_DELETE_PROMPT)
  return details
}

// The concrete production type of every AppContainer property the kit and the data owner provide.
function androidContainerTypes(blueprint: NormalizedBlueprint): string[] {
  const needs = androidKitNeeds(blueprint)
  return [
    "clock is a java.time.Clock (Clock.systemDefaultZone() in production)",
    ...(needs.settings ? ["settings is SettingsRepository"] : []),
    ...(needs.schedule ? ["workManager is WorkManager"] : []),
    ...(needs.reminders ? ["reminderLog is ReminderLogRepository"] : []),
    ...blueprint.domainData.filter(item => item.storage === "records").map(item => `${androidRepositoryProperty(item.name)} is ${pascal(item.name)}Repository`),
  ]
}

// The AppContainer property that holds a records object's repository: the camelCase data object name.
function androidRepositoryProperty(name: string): string {
  const words = pascal(name)
  return words[0]!.toLowerCase() + words.slice(1)
}

function tauriData(item: NormalizedBlueprint["domainData"][number]): TauriData {
  return { name: item.name, key: referenceKey(item.name), base: slug(item.name).replaceAll("-", "_"), record: pascal(item.name), resource: dataResourceIds(item.name)[0]!, storage: item.storage, fields: item.fields }
}

// One concrete interface per preset, owned by the data owner, so feature tasks call it and never invent storage access.
function storeInterfaceDetail(presetId: PresetId, item: NormalizedBlueprint["domainData"][number], operations: readonly DataOperation[]): string {
  const base = slug(item.name).replaceAll("-", "_")
  const record = pascal(item.name)
  const methods = (names: Record<DataOperation, string[]>) => operations.flatMap(operation => names[operation])
  if (presetId === "tauri2-rust-typescript-desktop") return tauriStoreInterface(tauriData(item), operations)
  if (presetId === "linux-wayland-gtk4-desktop") return gtkStoreInterface(item, operations, record, base)
  if (presetId === "android-kotlin-compose") {
    const functions = methods({ create: ["insert"], read: ["observeAll", "getById"], update: ["update"], delete: ["delete"] })
    const signatures = operations.flatMap(operation => ({ create: [`suspend fun insert(entity: ${record}Entity): Long`], read: [`fun observeAll() returning a Flow of the list of every ${record}Entity`, `suspend fun getById(id: Long): ${record}Entity?`], update: [`suspend fun update(entity: ${record}Entity)`], delete: [`suspend fun delete(entity: ${record}Entity)`] })[operation])
    return `Interface: OWN-DATA-STORE owns one Room entity ${record}Entity with the stored fields above, one ${record}Dao with exactly: ${functions.join(", ")}, the one RoomDatabase subclass AppDatabase that lists every records entity (version 1, exportSchema = true; Room writes the schema JSON under app/schemas when the project builds, and that generated file is committed with the data task and exempt from its create-only list), and ${record}Repository over the DAO, all in its owner file; it constructs the database and repository in AppContainer.kt. Kotlin types: id is Long (autoGenerate), text and long-text are String, number is Double, whole-number is Long, flag is Boolean, a date is a Long epoch day (LocalDate.toEpochDay), a date and time is a Long in epoch milliseconds (UTC), a time of day is a String HH:MM (zero-padded, validated 00:00 through 23:59 before it is stored, parsed with LocalTime.parse), a reference is the referenced Long id, an ordered list of text lines is one String joined by newlines; an optional field is nullable. observeAll returns the rows ordered by id ascending (creation order); the feature ViewModel does every filter and other sort over that list, and a sort breaks ties by id in the sort's own direction. ${record}Repository has exactly these members, with the DAO's semantics: ${signatures.join("; ")}. Feature tasks use the repository and add no entity or query of their own. AppContainer.kt holds it as \`val ${androidRepositoryProperty(item.name)}\` (read as container.${androidRepositoryProperty(item.name)} by every feature, ViewModel, and Worker) and takes the Room database as an optional constructor parameter after the clock (\`database: AppDatabase = the production Room builder\`), so a test builds the container with Room.inMemoryDatabaseBuilder and a fixed Clock.`
  }
  if (presetId === "astro-web") {
    const name = `${record}Entries`
    return `Interface: src/content.config.ts (from the kit) declares exactly the stored fields above and no page defines its own schema. OWN-DATA-STORE creates src/lib/contentcatalog.ts, starting from kit/src/lib/contentcatalog.ts, exporting list${name}() (all entries of the "${dataKey(item.name)}" collection read with getCollection, sorted ascending by id, the file name without extension) and get${record}Entry(id) (one entry or undefined; covered by the catalog test, pages read the list). Every page and component reads this data only through these functions and never calls getCollection itself; render(entry) from astro:content is the one other use, on a detail page. Its test mocks astro:content with vi.mock and covers an empty collection, the sort order, and an unknown id.`
  }
  const functions = methods({ create: ["insert"], read: ["list", "get"], update: ["update"], delete: ["delete"] })
  const kinds = new Set(item.fields.map(field => field.valueType))
  const storageTypes = [
    ...(kinds.has("date-time") ? ["date-time values are stored as i64 epoch milliseconds (UTC)"] : []),
    ...(kinds.has("date") ? ["date values as YYYY-MM-DD text"] : []),
    ...(kinds.has("text-list") ? ["ordered lists of text lines as a JSON text column"] : []),
  ].map(part => `; ${part}`).join("")
  return `Interface: OWN-DATA-STORE defines struct ${record} with the stored fields above (id: i64) and trait ${record}Store with exactly: ${functions.join(", ")}; every function returns Result with a typed error, and feature tasks call the trait and add no other storage access. OWN-DATA-STORE creates the table in its own transactional migration: the kit opens the database at PRAGMA user_version 1 with no tables, so the migration runs when the version is below 2 and sets it to 2${storageTypes}; list returns records by descending id unless a feature states another order, and any stated order breaks ties by descending id.`
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
function androidScheduledFeatures(preset: PresetContract, identity: ProjectIdentity, features: readonly GraphFeature[], data: NormalizedBlueprint["domainData"]): AndroidScheduledFeature[] {
  return features.filter(feature => feature.runsDailyAt !== null || feature.runsEverySeconds !== null || feature.runsAtField !== null).map(feature => {
    const ownerName = `${pascal(feature.name)}Feature`
    const declared = feature.runsAtField
    const record = declared ? data.find(item => referenceKey(item.name) === referenceKey(declared.data)) : undefined
    const fieldName = (name: string) => record?.fields.find(item => referenceKey(item.name) === referenceKey(name))?.name ?? name
    return {
      id: feature.id,
      name: feature.name,
      pascal: pascal(feature.name),
      slug: slug(feature.name),
      implementationFile: preset.ownerFiles({ kind: "feature", slug: slug(ownerName), pascalName: ownerName, identity }).implementationFile,
      runsEverySeconds: feature.runsEverySeconds,
      runsDailyAt: feature.runsDailyAt,
      at: declared && record ? { record: pascal(record.name), timeField: fieldName(declared.timeField), titleField: fieldName(declared.titleField), body: declared.notificationBody } : null,
      notifies: feature.resourceIds.includes(permissionResourceId("notifications")),
      notice: feature.scheduledNotification,
      selectionFiles: features.filter(other => other.ownerId !== feature.ownerId && feature.requiredOwnerIds.includes(other.ownerId)).map(other => {
        const name = `${pascal(other.name)}Feature`
        return preset.ownerFiles({ kind: "feature", slug: slug(name), pascalName: name, identity }).implementationFile
      }),
    }
  })
}

// A feature that is scheduled or reads a stored date or time compares with the present moment and needs an injected clock; one that only writes a date or time stamps it (androidStampFeatureIds).
function androidClockFeatureIds(blueprint: NormalizedBlueprint, features: readonly GraphFeature[]): Set<string> {
  const ids = new Set(features.filter(feature => feature.runsDailyAt !== null || feature.runsEverySeconds !== null || feature.runsAtField !== null).map(feature => feature.id))
  for (const item of blueprint.domainData.filter(entry => entry.fields.some(field => field.valueType === "date-time" || field.valueType === "date"))) {
    for (const featureId of dataFeatureIds(item.name, features)) {
      const reader = features.find(feature => feature.id === featureId)
      if (reader && opsOn(reader, item.name).includes("read")) ids.add(featureId)
    }
  }
  return ids
}

// A feature that writes a stored date or time without reading one only stamps it from the injected clock.
function androidStampFeatureIds(blueprint: NormalizedBlueprint, features: readonly GraphFeature[]): Set<string> {
  const compares = androidClockFeatureIds(blueprint, features)
  const ids = new Set<string>()
  for (const item of blueprint.domainData.filter(entry => entry.fields.some(field => field.valueType === "date-time" || field.valueType === "date"))) {
    for (const feature of features.filter(candidate => dataFeatureIds(item.name, features).includes(candidate.id) && !compares.has(candidate.id))) {
      if (opsOn(feature, item.name).some(operation => operation === "create" || operation === "update")) ids.add(feature.id)
    }
  }
  return ids
}

// GTK gives the clock to the features that write a stored date or time and to the scheduled ones; a feature that only reads and shows a stored date compares nothing with now.
function gtkClockFeatureIds(blueprint: NormalizedBlueprint, features: readonly GraphFeature[]): Set<string> {
  const ids = new Set(features.filter(feature => feature.runsDailyAt !== null || feature.runsEverySeconds !== null || feature.runsAtField !== null).map(feature => feature.id))
  for (const item of blueprint.domainData.filter(entry => entry.fields.some(field => field.valueType === "date" || field.valueType === "date-time"))) {
    for (const feature of features.filter(candidate => dataFeatureIds(item.name, features).includes(candidate.id))) {
      if (opsOn(feature, item.name).some(operation => operation === "create" || operation === "update")) ids.add(feature.id)
    }
  }
  return ids
}

// The detail view holds the Edit and Delete controls when a feature declares them.
function mainDetailControls(features: readonly GraphFeature[]): string {
  const controls = [
    ...(features.some(feature => feature.editsRecords) ? ["an Edit button"] : []),
    ...(features.some(feature => feature.dataOperations.includes("delete")) ? ["a Delete button"] : []),
  ]
  return controls.length ? ` and holds ${controls.join(" and ")}, built here as inert controls that the feature task declaring the operation connects` : ""
}

const opsOnAny = (feature: GraphFeature): readonly DataOperation[] => feature.dataOperations

// Tauri: a feature that both creates and updates one data object (a timer's start and stop) drives it with its own controls, so the shared
// add-entry control and entry form are not built for it. Its create and update are left out of what the shared screen is sized for.
function ownsItsControls(feature: GraphFeature): boolean {
  return Object.values(feature.operationsByData).some(operations => operations.includes("create") && operations.includes("update"))
}
function sharedScreenView(features: readonly GraphFeature[], presetId: PresetId): readonly GraphFeature[] {
  if (presetId !== "tauri2-rust-typescript-desktop") return features
  // A feature that saves a file, or is started by a shortcut or schedule, has no row, form, or filter control of the shared screen either.
  return features.map(feature => feature.userFileAccess === "saves" || feature.userFileAccess === "opens-and-saves" || feature.invokedBy === "shortcut" || feature.invokedBy === "schedule" || feature.resourceIds.includes("permission:global-input") ? { ...feature, dataOperations: [], operationsByData: {} } : ownsItsControls(feature) ? { ...feature, dataOperations: feature.dataOperations.filter(operation => operation === "read" || operation === "delete"), operationsByData: Object.fromEntries(Object.entries(feature.operationsByData).map(([key, operations]) => [key, operations.filter(operation => operation === "read" || operation === "delete")])) } : feature)
}

// Some later main-surface feature only reads: it narrows, sorts, or summarises the list from the area above it.
function hasFilterFeature(features: readonly GraphFeature[], firstMainOwnerId: string | undefined, presetId: PresetId): boolean {
  return sharedScreenView(features, presetId).some(feature => feature.ownerId !== firstMainOwnerId && feature.surface === "main" && feature.invokedBy === "user-control" && !(presetId === "tauri2-rust-typescript-desktop" && isCountdown(feature)) && feature.dataOperations.length > 0 && (feature.dataOperations.every(operation => operation === "read") || (presetId === "android-kotlin-compose" && feature.dataOperations.includes("read") && !feature.dataOperations.includes("create") && !feature.dataOperations.includes("delete"))) && (presetId !== "linux-wayland-gtk4-desktop" || feature.narrowsListBy !== "none"))
}

// Tauri: the per-row action area exists only for a feature that acts on a row without the detail view's Edit button (a mark or toggle, a delete).
// Delete lives in the detail view when the packet has one (an edit feature builds it), else in the row area.
// A countdown (a read-only feature with a tick) keeps its Start control and display in the row too.
const needsRowArea = (features: readonly GraphFeature[]): boolean =>
  features.some(feature => (feature.dataOperations.includes("delete") && !features.some(other => other.editsRecords)) || (feature.dataOperations.includes("update") && !feature.editsRecords) || isCountdown(feature))

// The slots the first main-surface task exposes are the ones the declared operations of the other features need.
// rowOpensEditor (Tauri): a packet with an edit feature always builds the detail view and opens it from the row.
function mainSlotsSentence(features: readonly GraphFeature[], detailView = true, filterSlot = true, rowOpensEditor = false, android = false, directAdd = false): string {
  const ops = new Set(features.flatMap(feature => feature.dataOperations))
  const changes = ops.has("update") || ops.has("delete")
  if (rowOpensEditor) return tauriMainSlotsSentence({ create: ops.has("create"), directAdd, entryForm: !directAdd && ops.has("create") && features.some(feature => feature.editsRecords && feature.dataOperations.includes("update")), rowArea: needsRowArea(features), detail: changes && features.some(feature => feature.editsRecords), filter: filterSlot, countdown: features.some(isCountdown) })
  const slots = [
    android ? "a status area (testTag \"status\") that carries only the main list's empty message (the exact text an acceptance signal quotes, else a short plain sentence; tag \"empty-state\"), the form errors, and the write-failure message of a later task's save, delete, mark, or toggle (the text its acceptance quotes, else \"Could not save changes\" or \"Could not delete\"; tag \"write-error\"; the row stays as it was); a section a later feature mounts above the list renders its own empty text inside itself, never in this area, and its rows are compact name-only rows tagged \"summary-row-\" plus the record id, so no \"row-\" tag or message appears twice" : "a status area shared by every message the main screen shows (empty state, no match, errors)",
    ...(ops.has("create") ? [directAdd ? "an add-entry control: a button that the add task connects to the create command (no stored field takes user input, so build no entry form shell)" : android && !detailView ? "the add-entry area on the main screen above the list: the Add button (testTag \"add-entry\") plus the inline form shell, which hosts whichever form (add or edit) is open, one at a time, so opening one closes the other (the add task builds the form fields, validation, and the open or closed state in its own file; an edit task reuses them)" : "an add-entry control that opens the entry form shell (the add task builds the form fields and validation; an edit task reuses them)"] : []),
    ...(ops.has("update") || ops.has("delete") ? [...(rowOpensEditor && !needsRowArea(features) ? [] : [android ? "a per-row action area on every row of the main list (rows a later feature shows in the area above the list get none)" : "a per-row action area on every list row"]), ...(detailView ? [`a detail view for the selected record that shows every stored field
${mainDetailControls(features)}, ${rowOpensEditor && features.some(feature => feature.editsRecords) ? "it is always built because the packet has an edit feature: every list row is selectable (activating the row selects the record, marks it aria-selected, and shows this detail view), which is how the user reaches the editor; a single mark or toggle action belongs in the per-row action area and never uses the Edit button" : "built only if an acceptance criterion of a later task opens a record to edit or delete it"}`] : [])] : []),
    ...(filterSlot ? [android ? "one area above the list for the features that filter, sort, total, or summarise it, including a feature that also marks rows (each mounts its one control or section there; the shared view state holds the selected filter and the list applies it, and a total or summary is built from a display-free function its owner exports)" : "a filter area above the list for read-only features that narrow or reorder it"] : []),
  ]
  return `Expose exactly these named slots in the shared files, no others: ${slots.join("; ")}. Later feature tasks build their controls in their own files and mount them into these slots, editing only the shared registration files; build no control that no later task names.`
}

// Tauri: the names the first main task gives its slot hosts, in the order of mainSlotsSentence.
function tauriSlotHosts(features: readonly GraphFeature[], detailView: boolean, filterSlot: boolean, entryForm = false): string[] {
  const ops = new Set(features.flatMap(feature => feature.dataOperations))
  const changes = ops.has("update") || ops.has("delete")
  // With an entry form shell the first task builds the Add button itself, so there is no "add" host for a later task.
  return ["status", ...(ops.has("create") && !entryForm ? ["add"] : []), ...(entryForm ? ["form"] : []), ...(needsRowArea(features) ? ["row-actions"] : []), ...(changes && detailView ? ["detail", "detail-actions"] : []), ...(filterSlot ? ["filter"] : [])]
}

// The slot a later feature task mounts into, from its declared operations.
function slotFor(owned: readonly GraphFeature[], presetId: PresetId, detailView = true): string {
  const android = presetId === "android-kotlin-compose"
  const ops = new Set(owned.flatMap(feature => feature.dataOperations))
  if (!ops.size && presetId === "tauri2-rust-typescript-desktop") return "no named slot: your own controls, if any (start and stop, an export button), sit in the main content area"
  if (ops.has("create")) return "the add-entry control"
  if (presetId === "tauri2-rust-typescript-desktop" && owned.length > 0 && owned.every(isCountdown)) return "the per-row action area (its Start control and the row's countdown display)"
  if (owned.some(feature => feature.editsRecords)) return detailView ? (presetId === "tauri2-rust-typescript-desktop" ? 'the detail view\'s "detail-actions" slot (its Edit control)' : "the detail view (its Edit control)") : "the per-row action area"
  if (presetId === "tauri2-rust-typescript-desktop" && ops.has("delete") && !ops.has("update")) return detailView ? 'the detail view\'s "detail-actions" slot (the list rows have no delete control)' : "the per-row action area"
  if (ops.has("update") || ops.has("delete")) return detailView && ops.has("delete") ? "the per-row action area or the detail view, whichever your acceptance criteria describe" : "the per-row action area"
  return android ? "the one area above the list" : "the filter area or the list region"
}

// Files several tasks modify, or that one task modifies although the foundation (or its kit) created them: AGENTS.md lists each with its editing tasks.
export function sharedModifyEditors(graph: Pick<ProjectGraph, "phases" | "foundationFiles">): Map<string, string[]> {
  const editors = new Map<string, string[]>()
  for (const task of graph.phases.flatMap(phase => phase.tasks)) {
    for (const path of task.filesToModify) editors.set(path, [...(editors.get(path) ?? []), task.id])
  }
  return new Map([...editors].filter(([path, tasks]) => tasks.length > 1 || graph.foundationFiles.includes(path)))
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
  // A static content site has no operation, state, signature, or install step for the generic failure wording to describe.
  const staticAstro = preset.id === "astro-web" && !!astroPlan?.staticSite
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
      // The GTK lifecycle owner closes the data store's connection, so it builds after the store.
      dependencyIds: preset.id === "linux-wayland-gtk4-desktop" && rustKitHelpers(blueprint).records && coreDrafts.some(draft => draft.id === "OWN-DATA-STORE") ? ["OWN-DATA-STORE"] : [],
    })
  }

  const contracts: GraphContract[] = []
  for (const feature of features) {
    const key = feature.id.replace(/^FEAT-/, "")
    const androidFormDetails = preset.id === "android-kotlin-compose" ? androidFeatureFormDetails(feature, blueprint.domainData, features) : []
    const interfaceDetails = [`Inputs: ${feature.inputs.join("; ")}`, `Outputs: ${feature.outputs.join("; ")}`, ...feature.choices.map(choice => `Choices: ${choice}`), ...(feature.runsEverySeconds !== null ? [`Schedule: runs by itself every ${feature.runsEverySeconds} seconds; this exact value is the default that code and tests use.`] : []), ...(feature.runsDailyAt !== null ? [`Schedule: runs by itself every day at ${feature.runsDailyAt} local time.`] : []), ...waybarSourceDetail(feature.systemSource), ...(preset.id === "linux-hyprland-waybar-module" ? waybarFeatureDetail(feature) : []), ...androidFormDetails]
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
    for (const feature of androidScheduledFeatures(preset, identity, features, blueprint.domainData)) {
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
      credentialData ? ["Preserve the prior stored credential after failed replacement, report deletion only after the credential store confirms it, and expose an explicit replacement or provider-selection action."] : inMemoryData ? ["Keep the last in-memory value and rebuild it from its source on the next explicit action."] : contentCollection ? ["Correct the named content file or field and rebuild."] : preset.id === "tauri2-rust-typescript-desktop" ? ["Preserve the last valid record: a failed command returns the AppError, leaves every stored row as it was, and the owning feature shows that message."] : ["Preserve the last valid record and expose a bounded correction or rebuild path."],
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
      [...(service.endpoint ? [`Endpoint: ${service.endpoint}`] : []), ...(service.webPage ? [`Web page opened for the user: ${service.webPage}`] : []), ...(preset.id === "linux-hyprland-waybar-module" ? [...waybarRequestDetail(service, blueprint.domainData), ...waybarPageDetail(service, blueprint.domainData)] : []), ...(service.responseFields.length ? [`Response values read (anything else is ignored): ${service.responseFields.map(field => `${field.name} (${VALUE_TYPE_LABEL[field.valueType]}${field.optional ? ", optional" : ""})`).join("; ")}.`] : []), ...(preset.id === "linux-hyprland-waybar-module" ? waybarResponseDetail(service) : []), `Data sent: ${service.dataSent.join("; ") || "No product data beyond the explicit request."}`, `Credential requirement: ${service.credentialRequirement}`, `Preset boundary: ${preset.platform}`, `Framework boundary: ${preset.integrationBoundary}`],
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
    staticAstro ? "A failed build or lifecycle check blocks completion." : "A preset lifecycle invariant failure blocks completion and leaves the last safe state active.",
    staticAstro ? ["Fix the first failing check and rebuild."] : ["Restore the last safe lifecycle state, release partial resources, and rerun the focused lifecycle checks."],
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
    staticAstro ? "A built page that contains a form, input, or textarea fails the packaging test and blocks completion." : "A privacy or security invariant failure stops the affected operation before data crosses the boundary.",
    staticAstro ? ["Remove the element and rebuild; the site collects no data, so nothing else needs restoring."] : ["Restore the last safe state and require explicit user action before retrying."],
  ))

  contracts.push(contract(
    "CON-PACKAGING-RELEASE",
    "packaging",
    `${preset.label} packaging`,
    features.map(feature => feature.id),
    "OWN-PACKAGING",
    preset.packagingRules.join(" "),
    [...preset.packagingRules, `Installation: ${preset.installationDecision(identity)}`, `Output artifact: ${preset.outputArtifact}`],
    staticAstro ? "A failed build or validation command blocks completion." : "A failed build, signature, package, install, or launch check blocks completion.",
    ["Fix the first failing validation command, rebuild the artifact, and rerun every later release gate."],
  ))

  // A static site has no adapter, and no Astro kit file reads siteKind; recording either would claim an effect that does not exist.
  const optionEntries = Object.entries(presetOptions).filter(([key]) => !(preset.id === "astro-web" && ((runtimeMode === "static" && key === "adapter") || key === "siteKind")))
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
    [...preset.wiringRules.map(rule => features.some(feature => feature.surface === "search-page") ? rule : rule.replace(", except the input of a declared search page", "")), `Launch check: ${preset.launchCheck(identity)}`],
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
  // An edit reuses the add feature's form and validation, so it builds after it.
  for (const editor of features) {
    for (const data of blueprint.domainData) {
      if (!editor.editsRecords || !opsOn(editor, data.name).includes("update")) continue
      const adder = features.find(candidate => candidate.ownerId !== editor.ownerId && opsOn(candidate, data.name).includes("create") && !(preset.id === "tauri2-rust-typescript-desktop" && ownsItsControls(candidate)))
      if (adder) addDependency(editor.ownerId, adder.ownerId)
    }
  }
  // The refresh owner calls the label function of the features that show what it stores, so they build first (unless that would form a cycle).
  if (preset.id === "linux-hyprland-waybar-module") {
    const roles = waybarRoles(blueprint)
    const refreshOwnerId = features.find(feature => feature.name === roles.refreshOwner)?.ownerId
    const reaches = (from: string, target: string, seen = new Set<string>()): boolean => from === target || (!seen.has(from) && (seen.add(from), [...(dependencyIds.get(from) ?? [])].some(next => reaches(next, target, seen))))
    for (const name of roles.labelOwners) {
      const labelOwnerId = features.find(feature => feature.name === name)?.ownerId
      if (refreshOwnerId && labelOwnerId && !reaches(labelOwnerId, refreshOwnerId)) addDependency(refreshOwnerId, labelOwnerId)
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
  kitPaths: readonly string[] = [],
): { owners: GraphOwner[]; phases: GraphPhase[] } {
  const foundationFiles = unique([
    ...preset.sourceLayout(identity),
    ...kitFoundationFiles,
    ...(astroPlan?.foundationExtras ?? []),
    ...(astroPlan?.seedContentPaths ?? []),
  ])
  const foundationTest = foundationFiles.find(file => /(?:Tests|tests|test)\//.test(file) || /ContractTest/.test(file)) ?? foundationFiles[0]!
  // A foundation test that the kit already ships is extended, not created.
  const kitFoundationTest = kitPaths.includes(foundationTest)
  const foundationCriteria = [
    "Every foundation file exists at the exact listed path.",
    `The locked identity is ${identity.bundleId}${preset.id === "astro-web" ? ', recorded as the "identity" field of package.json' : ""}.`,
    preset.id === "android-kotlin-compose"
      ? `ContractTest reads build.gradle.kts relative to the test working directory (Gradle runs unit tests with the app/ module directory as the working directory, so the file is app/build.gradle.kts from the project root) and asserts that it declares ${identity.bundleId} as the namespace and applicationId, and reads src/main/java/${identity.packagePath}/App.kt the same way and asserts that it declares the App composable.`
      : `The implementation marker is ${preset.implementationMarker}${preset.id === "linux-hyprland-waybar-module" ? ` (the Waybar module key prefix; resources/waybar/config.jsonc declares the key "custom/${identity.slug}")` : preset.id === "linux-wayland-gtk4-desktop" ? ` (adw::Application::builder() with application_id ${identity.bundleId} in src/main.rs)` : ""}.`,
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
    prompt: `Create the ${preset.label} foundation with identity ${identity.bundleId}. Use only the locked stack. Kit files are copied before this task (see Working Rules): verify each listed kit file exists unchanged${kitFoundationTest ? ` (except ${foundationTest}, which you extend)` : ""}${foundationFiles.some(file => !kitPaths.includes(file)) ? " and create every other listed file before any later task modifies it" : ""}.${preset.id === "astro-web" ? " package.json must define npm run check, test, test:a11y, build, and audit:performance before any later validation gate." : ""} Add a test to ${foundationTest} that fails on stack or identity drift${kitFoundationTest ? "; keep the kit tests in it passing" : ""}.`,
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
    // Android exposes a detail view (and an edit that reuses the add form) only when a feature declares the item-page surface.
    // A filter slot is exposed only when a feature other than the first main-surface one narrows or reorders the list (reads only, user-started).
    const filterSlot = hasFilterFeature(features, firstMainOwnerId, preset.id)
    const detailView = preset.id === "android-kotlin-compose" || preset.id === "linux-wayland-gtk4-desktop" ? features.some(feature => feature.surface === "item-page") : preset.id === "tauri2-rust-typescript-desktop" ? features.some(feature => feature.editsRecords) : features.some(feature => feature.editsRecords || feature.dataOperations.includes("delete"))
    const androidExtras = preset.id === "android-kotlin-compose" && blueprint
      ? androidTaskExtras({
          kind: draft.kind,
          identity,
          scheduled: androidScheduledFeatures(preset, identity, ownedFeatures, blueprint.domainData),
          clockDependent: ownedFeatures.some(feature => androidClockFeatureIds(blueprint, features).has(feature.id)),
          stamps: ownedFeatures.some(feature => androidStampFeatureIds(blueprint, features).has(feature.id)),
          notifications: blueprint.permissionNeeds.some(item => item.capability === "notifications"),
          screen: ownedFeatures.length === 0 || ownedFeatures.some(feature => feature.invokedBy !== "schedule"),
          form: ownedFeatures.some(feature => androidFeatureFormDetails(feature, blueprint.domainData, features).some(detail => detail.startsWith("Form (")) ),
          deletes: ownedFeatures.some(feature => blueprint.domainData.some(item => item.storage === "records" && opsOn(feature, item.name).includes("delete"))),
          containerTypes: draft.kind === "packaging" ? androidContainerTypes(blueprint) : undefined,
          focusedTestFile: files.focusedTestFile,
          firstMain: draft.id === firstMainOwnerId,
          detailView,
          selectionFor: androidScheduledFeatures(preset, identity, features, blueprint.domainData).filter(item => item.at === null && item.selectionFiles.includes(files.implementationFile)).map(item => ({ name: item.name, pascal: item.pascal })),
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
    // A static Astro site has no composition root beyond the pages, which the build test already covers: its packaging task edits nothing.
    const modifyCandidates = draft.kind === "packaging" && astroPlan?.staticSite
      ? []
      : draft.kind === "packaging"
      ? unique([
          ...(preset.registrationFiles?.("feature", identity) ?? [preset.registrationFile("feature", identity)]),
          ...(preset.registrationFiles?.("integration", identity) ?? [preset.registrationFile("integration", identity)]),
          ...(preset.wiringManifestFiles ?? []),
          ...(androidExtras?.modify ?? []),
        ])
      : unique([...registrationTargets, ...(androidExtras?.modify ?? [])])
    // A file this task creates is not also a file it modifies.
    const androidScheduleOnly = preset.id === "android-kotlin-compose" && draft.kind === "feature" && ownedFeatures.length > 0 && ownedFeatures.every(feature => feature.invokedBy === "schedule")
    const filesToModify = modifyCandidates.filter(file => !filesToCreate.includes(file) && !(preset.id === "android-kotlin-compose" && blueprint && !androidKitNeeds(blueprint).settingsData && file.endsWith("/data/SettingsRepository.kt")) && !(androidScheduleOnly && /\/(App|AppContainer)\.kt$/.test(file)))
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
      prompt: `Implement owner ${draft.id} (${draft.name}) in ${files.implementationFile} and its real focused checks in ${files.focusedTestFile}. Cover direct features ${ownedFeatureIds.join(", ") || "none"} and owned contracts ${contractIds.join(", ")}. Depend only on ${draft.dependencyIds.join(", ") || "the locked foundation"}; implement every documented decision, failure, cancellation, cleanup, and recovery branch. Create only these files: ${filesToCreate.join(", ")}. ${filesToModify.length ? `Modify only these files, which earlier tasks created: ${filesToModify.join(", ")}.` : "Modify no existing file."}${draft.kind === "data" && preset.id !== "astro-web" ? " Its focused test must close the store and reopen it at the same location and assert that the stored records are identical." : ""}${draft.id === firstMainOwnerId ? ` You are the first main-surface task: also build the main screen content area and the shared view state (the loaded records of every declared data object, plus whatever selection or input state the later feature tasks of this packet need) that later feature tasks extend; later tasks must not replace them. ${mainSlotsSentence(sharedScreenView(features, preset.id), detailView, filterSlot, preset.id === "tauri2-rust-typescript-desktop", preset.id === "android-kotlin-compose", preset.id === "tauri2-rust-typescript-desktop" && blueprint !== undefined && !tauriAddHasForm(features, blueprint.domainData.map(tauriData)))}` : ""}
${firstMainOwnerId && draft.kind === "feature" && draft.id !== firstMainOwnerId && ownedFeatures.length > 0 && ownedFeatures.every(feature => feature.invokedBy === "schedule") ? " This feature runs by itself and adds no control to the main screen: it mounts into no slot." : ""}${firstMainOwnerId && draft.kind === "feature" && draft.id !== firstMainOwnerId && ownedFeatures.some(feature => feature.surface === "main") && !ownedFeatures.every(feature => feature.invokedBy === "schedule") ? ` Your controls mount into the slots exposed by ${coordinates.get(firstMainOwnerId)!.taskId} (${slotFor(sharedScreenView(ownedFeatures, preset.id), preset.id, detailView)}): build them in ${files.implementationFile} and mount them from the shared registration file; do not rebuild the screen.${sharedScreenView(ownedFeatures, preset.id).some(feature => (preset.id === "tauri2-rust-typescript-desktop" ? feature.editsRecords : true) && opsOnAny(feature).includes("update")) && sharedScreenView(features, preset.id).some(feature => opsOnAny(feature).includes("create")) ? ` If your acceptance criteria edit stored fields in a form, reuse the form fields and validation that the add task exports from its own file and do not duplicate them${preset.id === "tauri2-rust-typescript-desktop" ? "" : "; a single mark or toggle action needs no form"}.` : ""}` : ""}${draft.kind === "packaging" && filesToModify.length ? " Modify the listed shared files only if the wiring check or a validation command fails; otherwise leave them unchanged." : ""}${draft.kind === "feature" && ownedFeature && placement?.kind === "page" && kitPaths.includes(placement.pageFile) ? ` Start from kit/${placement.pageFile}, a shell with the layout and one h1${(astroPlan?.collections ?? []).filter(item => item.dataName && ownedFeature.resourceIds.includes(`data:${dataKey(item.dataName)}`)).map(item => placement.pageFile.includes("[slug]") ? `; it reads ${item.dataName} only through list${pascal(item.dataName)}Entries() from src/lib/contentcatalog.ts and renders the declared fields (a long-text field in one element)` : `; it reads no data yet, so add the read of ${item.dataName} through list${pascal(item.dataName)}Entries() from src/lib/contentcatalog.ts and render the declared fields (a long-text field in one element)${astroPlan?.detailCollections.includes(item.name) ? "; when it lists entries, it renders one li containing one a per entry, href the detail route plus the entry id and a trailing slash" : `; ${item.name} has no detail route, so it renders the declared fields of every entry in ascending id order, one li per entry or one element for a single entry, with no a and no href; its focused test asserts that the built HTML contains each field value read from the content files, whatever the values are, and hardcodes no wording the content owner supplies`}`).join("")}.` : ""}${draft.kind === "feature" && preset.id === "astro-web" && placement?.kind === "component" && placement.registrationFile === "src/pages/index.astro" ? " The component renders its part of the page only; src/pages/index.astro keeps the one h1." : ""}${draft.kind === "data" && preset.id === "astro-web" && astroPlan?.usesContentCollections && kitPaths.includes(CATALOG_PATH) ? ` Start from kit/${CATALOG_PATH}.` : ""}${draft.kind === "data" && preset.id === "astro-web" && astroPlan?.usesContentCollections ? ` Content entry files under src/content/ are also yours, in addition to the create-only list above: ${astroPlan.collections.filter(item => item.entryCount).map(item => `src/content/${item.name}/ already holds exactly ${item.entryCount} numbered sample entries (the idea states that count and names none): keep all ${item.entryCount}, invent no names, add or delete none; `).join("")}for a collection whose idea names entries, create one file per named entry, named with a two-digit numeric prefix in the order the idea lists them (01-, 02-), and delete that collection's sample entries; keep the sample entry when the idea names none (see Content Seed Requirements).` : ""}${preset.id === "linux-wayland-gtk4-desktop" && blueprint && ownedFeatures.some(feature => gtkClockFeatureIds(blueprint, features).has(feature.id)) ? " Time rule: take the current time only from the Clock trait in src/platform/clock.rs (the kit ships it and SystemClock), passed in as a parameter and constructed once in src/app.rs with SystemClock; stored date-time values are i64 epoch milliseconds. Tests define their own Clock in tests/ that returns a fixed time or advances on every call, so two saves in a row never share a timestamp." : ""}${preset.id === "linux-hyprland-waybar-module" && draft.kind === "feature" && blueprint ? waybarTaskNotes(blueprint, ownedFeatures.map(feature => feature.name)) : ""}${preset.id === "linux-hyprland-waybar-module" && draft.kind === "lifecycle" && blueprint ? waybarLifecycleNote(blueprint) : ""}${androidExtras?.note ? ` ${androidExtras.note}` : ""}`,
      // An Astro page or packaging test asserts on the HTML that a production build emits into dist/, so the build runs first.
      validationCommands: unique([
        ...(preset.id === "astro-web" && (draft.kind === "feature" || draft.kind === "packaging") ? ["npm run build"] : []),
        files.focusedTestCommand,
        ...(androidExtras?.create.filter(file => file.endsWith("SchedulerTest.kt")).map(file => `./scripts/gradle.sh testDebugUnitTest --tests "${file.replace(/^app\/src\/test\/java\//, "").replace(/\.kt$/, "").replaceAll("/", ".")}"`) ?? []),
        ...preset.validationCommands.slice(0, draft.kind === "packaging" ? undefined : 2).map(command => command(identity)),
      ]),
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

  // An owner's own file that a later task edits is listed on its owner-map line.
  for (const phase of phases) {
    for (const task of phase.tasks) {
      for (const file of task.filesToModify) {
        const owner = owners.find(candidate => candidate.implementationFile === file && candidate.createPhaseId !== phase.id)
        if (owner && !owner.modifyPhaseIds.includes(phase.id)) owner.modifyPhaseIds.push(phase.id)
      }
    }
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
  const allTasks = phases.flatMap(phase => phase.tasks)
  const firstMain = allTasks.find(task => task.prompt.includes("You are the first main-surface task"))
  const operations = features.flatMap(feature => Object.values(feature.operationsByData).flat())
  const shared = sharedScreenView(features, "tauri2-rust-typescript-desktop").flatMap(feature => Object.values(feature.operationsByData).flat())
  const addHasForm = tauriAddHasForm(features, data)
  const firstMainOwner = firstMain?.ownerIds[0]
  const detailView = features.some(feature => feature.editsRecords)
  const filters = hasFilterFeature(features, firstMainOwner, "tauri2-rust-typescript-desktop")
  const entryForm = addHasForm && shared.includes("create") && sharedScreenView(features, "tauri2-rust-typescript-desktop").some(feature => feature.editsRecords && Object.values(feature.operationsByData).some(operations => operations.includes("update")))
  const slotHosts = tauriSlotHosts(sharedScreenView(features, "tauri2-rust-typescript-desktop"), detailView, filters, entryForm)
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
        slots: task === firstMain ? "first" : task.prompt.includes("Your controls mount into the slots") ? "later" : undefined,
        firstMainTask: firstMain?.id,
        entryForm,
        detailView,
        slotHosts,
        filters,
        countdownTask: features.some(isCountdown) ? allTasks.find(candidate => candidate.featureIds.some(id => features.some(feature => feature.id === id && isCountdown(feature))))?.id : undefined,
        ownFiles: kind === "foundation" ? task.filesToCreate.filter(file => !kitPaths.includes(file)) : undefined,
      })
      // With an entry form shell the first main task owns the Add button: the add task's slot is the shell's form host.
      const prompt = entryForm && task !== firstMain ? task.prompt.replace("(the add-entry control)", '(the "form" host of the entry form shell; the first main task builds the Add button)') : task.prompt
      return extra ? { ...task, prompt: `${prompt} ${extra}` } : { ...task, prompt }
    }),
  }))
}

function recoveryRulesFor(preset: PresetContract, blueprint: NormalizedBlueprint): readonly string[] {
  // Without a declared service, a web page's network need is only its own assets, so it adds no form or fetch recovery.
  const needs = preset.id === "astro-web" && !blueprint.externalServices.length ? blueprint.platformNeeds.filter(need => need !== "network") : blueprint.platformNeeds
  const interactive = blueprint.externalServices.length > 0 || blueprint.permissionNeeds.length > 0 || needs.length > 0
  // A static content site has no form, island, or fetch, whatever platform needs the provider listed.
  const staticSite = preset.id === "astro-web" && astroStaticContentSite(blueprint, preset.runtimeMode(blueprint))
  return preset.staticRecoveryRules && (!interactive || staticSite) ? preset.staticRecoveryRules : preset.recoveryRules
}

function lockedStackFor(preset: PresetContract, blueprint: NormalizedBlueprint): readonly string[] {
  if (preset.id === "tauri2-rust-typescript-desktop") {
    const { http } = rustKitHelpers(blueprint)
    const stamps = blueprint.domainData.some(item => item.storage === "records" && item.fields.some(field => field.valueType === "date-time"))
    return preset.allowedTechnologies.filter(technology => (stamps || !technology.startsWith("time (")) && (http || (technology !== "reqwest" && !technology.startsWith("tokio-tungstenite"))))
  }
  // The kit declares WorkManager only for a declared schedule.
  if (preset.id === "android-kotlin-compose") {
    const needs = androidKitNeeds(blueprint)
    return preset.allowedTechnologies.filter(technology => (needs.schedule || technology !== "WorkManager") && (needs.settings || technology !== "DataStore"))
  }
  if (preset.id !== "linux-hyprland-waybar-module" && preset.id !== "linux-wayland-gtk4-desktop") return preset.allowedTechnologies
  const { records, secrets, http } = rustKitHelpers(blueprint)
  const launchers = preset.id === "linux-hyprland-waybar-module" ? waybarLaunchers(blueprint) : { pages: [], notifies: false }
  const parts = preset.id === "linux-hyprland-waybar-module" ? waybarKitParts(blueprint) : { disk: false, localTime: false }
  const omitted = new Set([...(preset.id === "linux-hyprland-waybar-module" && !http ? ["tokio"] : []), ...(parts.disk ? [] : ["nix (statvfs)"]), ...(parts.localTime ? [] : ["chrono (local time zone)"]), ...(records ? [] : ["rusqlite"]), ...(secrets ? [] : ["keyring (Secret Service)"]), ...(http ? [] : ["reqwest with rustls"]), ...(launchers.pages.length ? [] : ["xdg-open (xdg-utils)"]), ...(launchers.notifies ? [] : ["notify-send (libnotify)"])])
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
      failureRecovery: feature.failureRecovery,
      providedCapabilities: feature.providedCapabilities,
      requiredCapabilities: feature.requiredCapabilities,
      dataOperations: feature.dataOperations,
      operationsByData: feature.operationsByData,
      editsRecords: feature.editsRecords,
      narrowsListBy: feature.narrowsListBy,
      showsCurrentTime: feature.showsCurrentTime,
      readsCurrentDay: feature.readsCurrentDay,
      refreshesEverySeconds: feature.refreshesEverySeconds,
      invokedBy: feature.invokedBy,
      runsEverySeconds: feature.runsEverySeconds,
      runsDailyAt: feature.runsDailyAt,
      systemSource: feature.systemSource,
      thresholds: feature.thresholds,
      labelTemplate: feature.labelTemplate,
      runsAtField: feature.runsAtField,
      scheduledNotification: feature.scheduledNotification,
      resourceIds: feature.resourceIds,
      requiredOwnerIds: [],
      choices: feature.choices,
      choiceLists: feature.choiceLists,
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
  const kitFoundationFiles = kitPaths.filter(path => !preset.sourceLayout(identity).includes(path) && !packagingOwned.has(path) && !featureOwnedFiles.has(path) && !(preset.id === "astro-web" && (path === CATALOG_PATH || path === "README.md")))
  const built = buildPhases(preset, identity, ownerDrafts, contracts, features, requirements, acceptance, astroPlan, integrationServices, kitFoundationFiles, blueprint, kitPaths)
  const owners = built.owners
  const phases = presetId === "tauri2-rust-typescript-desktop" ? refineTauriPhases(built.phases, owners, features, blueprint, kitPaths) : presetId === "linux-wayland-gtk4-desktop" ? refineGtkPhases(built.phases, blueprint) : built.phases
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
  const androidWithoutSettings = presetId === "android-kotlin-compose" && !androidKitNeeds(blueprint).settingsData
  const persistenceSettings = (astroPlan?.usesContentCollections
    ? ASTRO_CONTENT_COLLECTION_PERSISTENCE.settingsPlacement
    : androidWithoutSettings ? `No setting is declared. OWN-DATA-STORE is Room only: it adds no Jetpack DataStore key of its own${androidKitNeeds(blueprint).settings ? " (the kit's SettingsRepository, built on Jetpack DataStore, holds run and permission state)" : ""}.` : preset.persistence.settingsPlacement).replaceAll("{app-id}", identity.bundleId)
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
    contracts: presetId === "linux-wayland-gtk4-desktop" ? refineGtkContracts(contracts, blueprint) : presetId === "linux-hyprland-waybar-module" ? refineWaybarContracts(contracts) : contracts,
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
    ...(preset.deviceGates ? { deviceValidation: { ...preset.deviceGates, commands: preset.deviceGates.commands.map(command => command.replace("{slug}", identity.slug)) } } : {}),
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
  // A static site records what it is: no server adapter, and none of the browser capabilities the preset could offer.
  const staticSite = !!packet.graph.astroPlan?.staticSite
  return {
    schema: "nodaysidle.cascade.packet.v4",
    compiler: { version: "4.0.0" },
    preset: { id: presetId, options: staticSite ? Object.fromEntries(Object.entries(options).filter(([key]) => key !== "adapter")) : options, capabilities: staticSite ? { ...PRESETS[presetId].capabilities, notifications: false, microphone: false, camera: false, location: false, network: false, fileAccess: "none" } : PRESETS[presetId].capabilities },
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
