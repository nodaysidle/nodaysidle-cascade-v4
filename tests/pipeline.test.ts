import { describe, expect, it } from "vitest"
import { generatePacket, MAX_IDEA_CHARS, type BlueprintProvider } from "../src/pipeline"
import { fileOrganizerBlueprint } from "./fixtures/blueprints"
import { fixtureJevProvider, fixtureProvider } from "./fixtures/providers"

const idea = "Harbor Sort helps people organize downloads into named folders with preview, undo, and search."
const baseInput = {
  requestId: "test-request",
  idea,
  presetId: "linux-wayland-gtk4-desktop" as const,
  model: "deepseek-flash" as const,
  apiUrl: "https://api.deepseek.com/responses",
  apiKey: "memory-only",
  jevApiKey: "memory-only-jev",
  atomicAuditor: true,
}

describe("v4 pipeline", () => {
  it("reaches gate-clean with deterministic fixture providers", async () => {
    const result = await generatePacket(baseInput, fixtureProvider(fileOrganizerBlueprint), undefined, fixtureJevProvider)
    expect(result.status).toBe("gate-clean")
    expect(result.exportable).toBe(true)
    expect(result.packet?.kit.length).toBeGreaterThan(0)
  })

  it("repairs one content failure and records the repaired checks", async () => {
    let calls = 0
    const provider: BlueprintProvider = async () => {
      calls += 1
      return calls === 1 ? "{" : JSON.stringify(fileOrganizerBlueprint)
    }
    const result = await generatePacket(baseInput, provider, undefined, fixtureJevProvider)
    expect(calls).toBe(2)
    expect(result.status).toBe("gate-clean")
    expect(result.repairedIssues?.length).toBeGreaterThan(0)
  })

  it("rejects a capability the preset cannot express before compilation", async () => {
    const blocked = structuredClone(fileOrganizerBlueprint)
    blocked.features[0]!.usesPlatformNeeds = ["accessibility-control"]
    const result = await generatePacket(baseInput, fixtureProvider(blocked), undefined, fixtureJevProvider)
    expect(result.status).toBe("capability-rejected")
    expect(result.issues.some(issue => issue.rule === "capability.accessibility-control")).toBe(true)
  })

  it("reports an over-long idea as input-invalid without calling the provider", async () => {
    let calls = 0
    const provider: BlueprintProvider = async () => {
      calls += 1
      return JSON.stringify(fileOrganizerBlueprint)
    }
    const result = await generatePacket({ ...baseInput, idea: "x".repeat(MAX_IDEA_CHARS + 1) }, provider)
    expect(result.status).toBe("input-invalid")
    expect(calls).toBe(0)
  })

  it("works without Jev when no Jev key is configured", async () => {
    const result = await generatePacket({ ...baseInput, jevApiKey: undefined }, fixtureProvider(fileOrganizerBlueprint))
    expect(result.status).toBe("gate-clean")
  })
})
