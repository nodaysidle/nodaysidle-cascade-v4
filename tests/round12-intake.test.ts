import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { auditCapabilities } from "../src/capabilities"
import { settleBlueprint } from "../src/compiler"
import { JEV_VIABILITY_THRESHOLD, type JevRequest } from "../src/jev"
import { generatePacket, type BlueprintProvider, type ProviderRequest } from "../src/pipeline"
import { PRESETS, PRESET_IDS } from "../src/presets"
import { auditSemanticIntake, providerJsonSchema, providerSchemaFor, type SemanticBlueprint } from "../src/schema"
import { fixtureJevProvider, fixtureProvider } from "./fixtures/providers"
import { freeSpaceBlueprint } from "./fixtures/waybarSources"

// Round 12 live run: the intake stage failed on ordinary ideas before any document was written. The real failing
// responses were never saved (the app keeps none), so each fixture below is a passing blueprint changed into the shape
// the app reported.
const WAYBAR = "linux-hyprland-waybar-module" as const
const ANDROID = "android-kotlin-compose" as const
const BAR_ONLY = ["systemSource", "thresholds", "labelTemplate", "unit", "valueDecimals"]
const stepGoal = JSON.parse(readFileSync(new URL("./fixtures/android-step-goal.json", import.meta.url), "utf8")) as SemanticBlueprint
const input = {
  requestId: "round12",
  idea: "Free Space shows the free space of the root disk.",
  presetId: WAYBAR,
  model: "deepseek-flash" as const,
  apiUrl: "https://api.deepseek.com/responses",
  apiKey: "memory-only",
  jevApiKey: "memory-only-jev",
  atomicAuditor: true,
}
const featureKeys = (schema: typeof providerJsonSchema): { properties: Record<string, unknown>; required: string[] } =>
  (schema as unknown as { properties: { features: { items: { properties: Record<string, unknown>; required: string[] } } } }).properties.features.items

describe("round 12: a failed request says why", () => {
  it("shows the HTTP status and the provider's safe code, and nothing else from the failure", async () => {
    const provider: BlueprintProvider = async () => { throw { kind: "http", classification: "http-error", httpStatus: 429, providerCode: "rate_limit_exceeded", body: "sk-secret" } }
    const result = await generatePacket(input, provider, undefined, fixtureJevProvider)
    expect(result.status).toBe("provider-failure")
    expect(result.issues[0]!.rule).toBe("provider.http-error")
    expect(result.issues[0]!.message).toContain("HTTP 429")
    expect(result.issues[0]!.message).toContain("rate_limit_exceeded")
    expect(JSON.stringify(result)).not.toContain("sk-secret")
  })

  it("shows Jev's viability score, the score it needs, and the preset Jev would pick", async () => {
    const jev = async (request: JevRequest) => JSON.stringify({ outcomes: [
      { kind: "boolean", id: "viability", pTrue: 0.41 },
      { kind: "choice", id: "preset-selection", choice: "astro-web", confidence: 0.8 },
    ].filter(outcome => request.nouls.some(noul => noul.id === outcome.id)) })
    const result = await generatePacket(input, fixtureProvider(freeSpaceBlueprint), undefined, jev)
    expect(result.status).toBe("intake-rejected")
    expect(result.issues[0]!.rule).toBe("jev.intake-rejected")
    expect(result.issues[0]!.message).toContain("0.41")
    expect(result.issues[0]!.message).toContain(String(JEV_VIABILITY_THRESHOLD))
    expect(result.issues[0]!.message).toContain("astro-web")
  })
})

describe("round 12: bar-only fields are offered only to the Waybar preset", () => {
  it("leaves them out of the response schema of every other preset, with every remaining key required", () => {
    for (const id of PRESET_IDS) {
      const feature = featureKeys(providerSchemaFor(id))
      for (const key of BAR_ONLY) expect(key in feature.properties, `${id} ${key}`).toBe(id === WAYBAR)
      expect(feature.required).toEqual(Object.keys(feature.properties))
    }
    expect(Object.keys(featureKeys(providerJsonSchema).properties)).toEqual(expect.arrayContaining(BAR_ONLY))
  })

  it("sends the preset's schema with the provider request", async () => {
    let sent: ProviderRequest | undefined
    const provider: BlueprintProvider = async request => { sent = request; return JSON.stringify(stepGoal) }
    await generatePacket({ ...input, presetId: ANDROID }, provider, undefined, fixtureJevProvider)
    expect("valueDecimals" in featureKeys(sent!.schema).properties).toBe(false)
  })
})

describe("round 12: Waybar label fields copied onto every feature", () => {
  // Disk Free: the AI repeated labelTemplate and thresholds on every feature, and again after the one repair.
  const copied = (): SemanticBlueprint => {
    const blueprint = structuredClone(freeSpaceBlueprint)
    const label = blueprint.features[1]!
    Object.assign(label, { labelTemplate: "{value} GB free", unit: "GB", valueDecimals: 1 })
    Object.assign(blueprint.features[0]!, { labelTemplate: label.labelTemplate, unit: label.unit, valueDecimals: label.valueDecimals, thresholds: structuredClone(label.thresholds) })
    return blueprint
  }

  it("is rejected as it arrives", () => {
    const rules = auditCapabilities(copied(), PRESETS[WAYBAR]).map(issue => issue.rule)
    expect(rules).toEqual(expect.arrayContaining(["capability.waybar-label-template", "capability.waybar-thresholds-owner"]))
  })

  it("keeps identical copies only on the feature that shows the reading", () => {
    const settled = settleBlueprint(copied(), WAYBAR)
    expect(auditCapabilities(settled, PRESETS[WAYBAR])).toEqual([])
    const [refresh, label] = settled.features
    expect(label).toMatchObject({ labelTemplate: "{value} GB free", unit: "GB", valueDecimals: 1, thresholds: [{ state: "critical", comparison: "below", value: 10000000000 }] })
    expect(refresh).toMatchObject({ labelTemplate: "", unit: "", valueDecimals: null, thresholds: [] })
  })

  it("falls back to the measuring feature when the module has no separate display feature", () => {
    const blueprint = copied()
    blueprint.features.push({ ...structuredClone(blueprint.features[1]!), name: "Free space notification", invokedBy: "click" })
    blueprint.features.splice(1, 1)
    blueprint.features[0]!.buildsOn = []
    const settled = settleBlueprint(blueprint, WAYBAR)
    expect(settled.features.map(feature => feature.labelTemplate)).toEqual(["{value} GB free", ""])
    expect(settled.features.map(feature => (feature.thresholds ?? []).length)).toEqual([1, 0])
  })

  it("still rejects copies that disagree", () => {
    const blueprint = copied()
    blueprint.features[0]!.labelTemplate = "{value} GB"
    blueprint.features[0]!.thresholds = [{ state: "critical", comparison: "below", value: 5000000000 }]
    const settled = settleBlueprint(blueprint, WAYBAR)
    expect(settled).toEqual(blueprint)
    const rules = auditCapabilities(settled, PRESETS[WAYBAR]).map(issue => issue.rule)
    expect(rules).toEqual(expect.arrayContaining(["capability.waybar-label-template", "capability.waybar-thresholds-owner"]))
  })

  it("compiles in one provider request, with no repair", async () => {
    let calls = 0
    const provider: BlueprintProvider = async () => { calls += 1; return JSON.stringify(copied()) }
    const result = await generatePacket(input, provider, undefined, fixtureJevProvider)
    expect(result.issues).toEqual([])
    expect(result.status).toBe("gate-clean")
    expect(calls).toBe(1)
    expect(result.blueprint!.features.filter(feature => feature.labelTemplate !== "")).toHaveLength(1)
  })
})

describe("round 12: a notification text on a product with no notifications", () => {
  // Tip Split: the AI filled scheduledNotification on a calculator that never notifies.
  const invented = (): SemanticBlueprint => {
    const blueprint = structuredClone(stepGoal)
    blueprint.features[1]!.scheduledNotification = { titleText: "Steps", notificationBody: "Remember to enter your steps." }
    return blueprint
  }

  it("is rejected as it arrives", () => {
    expect(auditSemanticIntake(invented()).map(issue => issue.rule)).toContain("semantic.notification-schedule")
  })

  it("is cleared when no feature uses notifications", () => {
    const settled = settleBlueprint(invented(), ANDROID)
    expect(settled.features[1]!.scheduledNotification).toBeNull()
    expect(auditSemanticIntake(settled)).toEqual([])
  })

  it("is still rejected when a feature does use notifications", () => {
    const blueprint = invented()
    blueprint.platformNeeds = [...blueprint.platformNeeds, "notifications"]
    blueprint.features[0]!.usesPlatformNeeds = [...blueprint.features[0]!.usesPlatformNeeds, "notifications"]
    const settled = settleBlueprint(blueprint, ANDROID)
    expect(settled.features[1]!.scheduledNotification).not.toBeNull()
    expect(auditSemanticIntake(settled).map(issue => issue.rule)).toContain("semantic.notification-schedule")
  })

  it("compiles in one provider request, with no repair", async () => {
    let calls = 0
    const provider: BlueprintProvider = async () => { calls += 1; return JSON.stringify(invented()) }
    const result = await generatePacket({ ...input, presetId: ANDROID, idea: "Step Goal counts steps. The user sets a goal. The user enters steps." }, provider, undefined, fixtureJevProvider)
    expect(result.issues).toEqual([])
    expect(result.status).toBe("gate-clean")
    expect(calls).toBe(1)
  })
})
