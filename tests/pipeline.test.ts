import { describe, expect, it } from "vitest"
import { buildRepairInput, generatePacket, isSafeProviderUrl, MAX_IDEA_CHARS, type BlueprintProvider } from "../src/pipeline"
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

  it("repairs a capability the preset cannot express once, then compiles the corrected blueprint", async () => {
    const blocked = structuredClone(fileOrganizerBlueprint)
    blocked.features[0]!.usesPlatformNeeds = ["accessibility-control"]
    let calls = 0
    const provider: BlueprintProvider = async () => {
      calls += 1
      return JSON.stringify(calls === 1 ? blocked : fileOrganizerBlueprint)
    }
    const result = await generatePacket(baseInput, provider, undefined, fixtureJevProvider)
    expect(calls).toBe(2)
    expect(result.status).toBe("gate-clean")
    expect(result.repairedIssues?.some(issue => issue.rule === "capability.accessibility-control")).toBe(true)
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

  const counting = (answer: () => string) => {
    const state = { calls: 0 }
    const provider: BlueprintProvider = async () => {
      state.calls += 1
      return answer()
    }
    return { state, provider }
  }

  it("does not repair a provider transport failure", async () => {
    const state = { calls: 0 }
    const provider: BlueprintProvider = async () => {
      state.calls += 1
      throw { kind: "transport", classification: "connect" }
    }
    const result = await generatePacket(baseInput, provider, undefined, fixtureJevProvider)
    expect(state.calls).toBe(1)
    expect(result.status).toBe("provider-failure")
  })

  it("sends at most one repair when the provider stays invalid", async () => {
    const { state, provider } = counting(() => "{")
    const result = await generatePacket(baseInput, provider, undefined, fixtureJevProvider)
    expect(state.calls).toBe(2)
    expect(result.status).toBe("blueprint-validation-failed")
    expect(result.repairedIssues?.length).toBeGreaterThan(0)
  })

  it("does not repair a local compiler failure", async () => {
    const { state, provider } = counting(() => JSON.stringify(fileOrganizerBlueprint))
    const result = await generatePacket(baseInput, provider, async () => { throw new TypeError("compiler bug") }, fixtureJevProvider)
    expect(state.calls).toBe(1)
    expect(result.status).toBe("local-compiler-failure")
  })

  it.each(["", "\n", "   \n\t "])("rejects an empty idea %j without calling the provider", async emptyIdea => {
    const { state, provider } = counting(() => JSON.stringify(fileOrganizerBlueprint))
    const result = await generatePacket({ ...baseInput, idea: emptyIdea }, provider)
    expect(state.calls).toBe(0)
    expect(result.status).toBe("input-invalid")
    expect(result.issues[0]?.rule).toBe("input.idea-empty")
  })

  it("returns cancelled when aborted, keeping the repaired checks after a repair", async () => {
    const before = new AbortController()
    before.abort()
    expect((await generatePacket({ ...baseInput, signal: before.signal }, counting(() => "{").provider)).status).toBe("cancelled")
    const during = new AbortController()
    let calls = 0
    const provider: BlueprintProvider = async () => {
      calls += 1
      if (calls === 2) during.abort()
      return calls === 1 ? "{" : JSON.stringify(fileOrganizerBlueprint)
    }
    const result = await generatePacket({ ...baseInput, signal: during.signal }, provider, undefined, fixtureJevProvider)
    expect(result.status).toBe("cancelled")
    expect(result.repairedIssues?.length).toBeGreaterThan(0)
  })

  it("redacts a key-shaped string from the previous response in the repair input", () => {
    const text = buildRepairInput({ previousText: `{"summary":"uses sk-${"a".repeat(32)} and Bearer ${"b".repeat(24)}"}`, issues: [] })
    expect(text).not.toContain("sk-aaaa")
    expect(text).not.toContain("bbbbbbbbbbbbbbbb")
    expect(text).toContain("[removed secret]")
  })

  it.each([
    ["https://api.deepseek.com/responses", true],
    ["https://api.deepseek.com/responses/", true],
    ["https://proxy.example.net/v1/responses", false],
    ["http://api.deepseek.com/responses", false],
    ["https://user:pass@api.deepseek.com/responses", false],
    ["https://api.deepseek.com/responses?key=1", false],
    ["https://api.deepseek.com/responses#x", false],
    ["https://api.deepseek.com/chat/completions", false],
    ["not a url", false],
    ["", false],
  ])("isSafeProviderUrl(%j) is %s", (url, safe) => {
    expect(isSafeProviderUrl(url)).toBe(safe)
  })
})
