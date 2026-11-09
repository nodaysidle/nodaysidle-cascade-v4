import { describe, expect, it } from "vitest"
import { generatePacket } from "../src/pipeline"
import {
  JEV_ACCEPTANCE_VERIFIABILITY_THRESHOLD, JEV_INTEGRITY_THRESHOLD, JEV_PRESET_MISMATCH_CONFIDENCE, JEV_VIABILITY_THRESHOLD,
  evaluateJevAtomicAudit, evaluateJevIntake, evaluateJevPostflight, evaluateJevPreflight, jevFeatureCapabilityNoulId, jevFeatureVerifiableNoulId,
  parseJevResponse, type JevNoul, type JevOutcome, type JevRequest,
} from "../src/jev"
import { auditSemanticIntake } from "../src/schema"
import { auditCapabilities } from "../src/capabilities"
import { compilePacket } from "../src/compiler"
import { PRESETS } from "../src/presets"
import { fileOrganizerBlueprint } from "./fixtures/blueprints"
import { fixtureJevProvider, fixtureProvider } from "./fixtures/providers"

const idea = "Harbor Sort helps people organize downloads into named folders with preview, undo, and search."
const input = (atomicAuditor: boolean) => ({ requestId: "r", idea, presetId: "linux-wayland-gtk4-desktop" as const, model: "deepseek-flash" as const, apiUrl: "https://api.deepseek.com/responses", apiKey: "k", jevApiKey: "j", atomicAuditor })

// The fixture Jev, except it is sure the product needs notifications and that the first feature needs the clipboard.
async function inferringJev(request: JevRequest): Promise<string> {
  const response = JSON.parse(await fixtureJevProvider(request)) as { outcomes: { id: string; kind: string; pTrue?: number; choice?: string; probabilities?: Record<string, number> }[] }
  for (const outcome of response.outcomes) {
    if (outcome.id === "platform-need:notifications") outcome.pTrue = 1
    if (outcome.id === jevFeatureCapabilityNoulId(0)) {
      outcome.choice = "clipboard"
      if (outcome.probabilities) outcome.probabilities = Object.fromEntries(Object.keys(outcome.probabilities).map(option => [option, option === "clipboard" ? 1 : 0]))
    }
  }
  return JSON.stringify(response)
}

describe("Jev healing", () => {
  it.each([false, true])("the exported blueprint still passes verify's intake and capability audits (atomic %s)", async atomic => {
    const result = await generatePacket(input(atomic), fixtureProvider(fileOrganizerBlueprint), undefined, inferringJev)
    if (result.status !== "gate-clean") return expect(result.status).toBe("gate-clean")
    const blueprint = result.blueprint!
    expect([...auditSemanticIntake(blueprint), ...auditCapabilities(blueprint, PRESETS["linux-wayland-gtk4-desktop"])]).toEqual([])
    const again = await compilePacket(blueprint, "linux-wayland-gtk4-desktop")
    expect(again.hashes).toEqual(result.packet!.hashes)
  })
})

const yes = (id: string, pTrue: number): JevOutcome => ({ kind: "boolean", id, pTrue })
const pick = (id: string, choice: string, confidence: number): JevOutcome => ({ kind: "choice", id, choice, confidence })
const below = (threshold: number) => threshold - 0.001

describe("Jev thresholds", () => {
  it("preflight: viability and preset mismatch", () => {
    expect(evaluateJevPreflight([yes("viability", JEV_VIABILITY_THRESHOLD)], "astro-web").viable).toBe(true)
    expect(evaluateJevPreflight([yes("viability", below(JEV_VIABILITY_THRESHOLD))], "astro-web").viable).toBe(false)
    expect(evaluateJevPreflight([pick("preset-selection", "android-kotlin-compose", JEV_PRESET_MISMATCH_CONFIDENCE)], "astro-web").presetMismatch?.inferredPresetId).toBe("android-kotlin-compose")
    expect(evaluateJevPreflight([pick("preset-selection", "android-kotlin-compose", below(JEV_PRESET_MISMATCH_CONFIDENCE))], "astro-web").presetMismatch).toBeUndefined()
    expect(evaluateJevPreflight([pick("preset-selection", "astro-web", 1)], "astro-web").presetMismatch).toBeUndefined()
  })

  it("postflight: foreign stack, verifiability, and healing only for needs a feature uses", () => {
    expect(evaluateJevPostflight([yes("foreign-stack", JEV_INTEGRITY_THRESHOLD)], fileOrganizerBlueprint).foreignStackLeakage).toBe(true)
    expect(evaluateJevPostflight([yes("foreign-stack", below(JEV_INTEGRITY_THRESHOLD))], fileOrganizerBlueprint).foreignStackLeakage).toBe(false)
    expect(evaluateJevPostflight([yes("acceptance-verifiability", JEV_ACCEPTANCE_VERIFIABILITY_THRESHOLD)], fileOrganizerBlueprint).unverifiableAcceptance).toBe(false)
    expect(evaluateJevPostflight([yes("acceptance-verifiability", below(JEV_ACCEPTANCE_VERIFIABILITY_THRESHOLD))], fileOrganizerBlueprint).unverifiableAcceptance).toBe(true)
    const usesNotifications = structuredClone(fileOrganizerBlueprint)
    usesNotifications.features[0]!.usesPlatformNeeds = [...usesNotifications.features[0]!.usesPlatformNeeds, "notifications"]
    usesNotifications.platformNeeds = usesNotifications.platformNeeds.filter(need => need !== "notifications")
    expect(evaluateJevPostflight([yes("platform-need:notifications", JEV_INTEGRITY_THRESHOLD)], usesNotifications).addedPlatformNeeds).toEqual(["notifications"])
    expect(evaluateJevPostflight([yes("platform-need:notifications", below(JEV_INTEGRITY_THRESHOLD))], usesNotifications).addedPlatformNeeds).toEqual([])
    expect(evaluateJevPostflight([yes("platform-need:notifications", 1)], fileOrganizerBlueprint).addedPlatformNeeds).toEqual([])
  })

  it("atomic audit: feature capability confidence and verifiability", () => {
    const at = (confidence: number) => evaluateJevAtomicAudit([pick(jevFeatureCapabilityNoulId(0), "notifications", confidence), ...fileOrganizerBlueprint.features.map((_, index) => yes(jevFeatureVerifiableNoulId(index), 1))], fileOrganizerBlueprint)
    expect(at(JEV_INTEGRITY_THRESHOLD).blueprint.features[0]!.usesPlatformNeeds).toContain("notifications")
    expect(at(JEV_INTEGRITY_THRESHOLD).addedPlatformNeeds).toEqual(fileOrganizerBlueprint.platformNeeds.includes("notifications") ? [] : ["notifications"])
    expect(at(below(JEV_INTEGRITY_THRESHOLD)).blueprint.features[0]!.usesPlatformNeeds).not.toContain("notifications")
    const unverifiable = evaluateJevAtomicAudit([yes(jevFeatureVerifiableNoulId(0), below(JEV_ACCEPTANCE_VERIFIABILITY_THRESHOLD))], fileOrganizerBlueprint)
    expect(unverifiable.featureIssues.map(issue => issue.path)).toContain("features[0].acceptanceSignals")
  })

  it("intake: viability, defaults for a missing preset and clarity", () => {
    expect(evaluateJevIntake([yes("viability", JEV_VIABILITY_THRESHOLD)]).viable).toBe(true)
    expect(evaluateJevIntake([yes("viability", below(JEV_VIABILITY_THRESHOLD))]).viable).toBe(false)
    const empty = evaluateJevIntake([])
    expect([empty.recommendedPreset, empty.clarity, empty.presetConfidence]).toEqual(["tauri2-rust-typescript-desktop", "vague", 0])
    expect(evaluateJevIntake([pick("clarity", "clear", 0.9)]).clarityScore).toBe(2)
  })
})

describe("parseJevResponse refuses malformed input", () => {
  const nouls: JevNoul[] = [
    { kind: "boolean", id: "viability", question: "q" } as JevNoul,
    { kind: "choice", id: "preset-selection", question: "q", options: ["astro-web", "android-kotlin-compose"] } as JevNoul,
  ]
  const good = { outcomes: [{ kind: "boolean", id: "viability", pTrue: 0.9 }, { kind: "choice", id: "preset-selection", choice: "astro-web", confidence: 0.8 }] }
  it("accepts a well-formed response", () => {
    expect(parseJevResponse(JSON.stringify(good), nouls).ok).toBe(true)
  })
  it.each([
    ["not a string", 42],
    ["invalid JSON", "{"],
    ["an extra top-level key", JSON.stringify({ ...good, extra: 1 })],
    ["a missing outcome", JSON.stringify({ outcomes: good.outcomes.slice(1) })],
    ["an unknown id", JSON.stringify({ outcomes: [{ ...good.outcomes[0], id: "other" }, good.outcomes[1]] })],
    ["a duplicate id", JSON.stringify({ outcomes: [good.outcomes[0], good.outcomes[0]] })],
    ["a probability above 1", JSON.stringify({ outcomes: [{ ...good.outcomes[0], pTrue: 1.5 }, good.outcomes[1]] })],
    ["a choice outside the options", JSON.stringify({ outcomes: [good.outcomes[0], { ...good.outcomes[1], choice: "linux" }] })],
    ["a kind that does not match the noul", JSON.stringify({ outcomes: [{ kind: "choice", id: "viability", choice: "astro-web", confidence: 1 }, good.outcomes[1]] })],
    ["an extra outcome key", JSON.stringify({ outcomes: [{ ...good.outcomes[0], note: "x" }, good.outcomes[1]] })],
  ])("refuses %s", (_label, text) => {
    expect(parseJevResponse(text, nouls).ok).toBe(false)
  })
})
