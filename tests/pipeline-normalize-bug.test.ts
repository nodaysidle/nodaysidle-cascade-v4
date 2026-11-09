import { describe, expect, it, vi } from "vitest"

// A normalization bug (any error that is not a NormalizationError) is a compiler failure: never a paid repair.
vi.mock("../src/compiler", async original => ({ ...(await original<typeof import("../src/compiler")>()), normalizeBlueprint: () => { throw new TypeError("normalizer bug") } }))

describe("pipeline normalization bug", () => {
  it("reports local-compiler-failure after one provider call", async () => {
    const { generatePacket } = await import("../src/pipeline")
    const { fileOrganizerBlueprint } = await import("./fixtures/blueprints")
    const { fixtureJevProvider } = await import("./fixtures/providers")
    let calls = 0
    const result = await generatePacket({
      requestId: "test-request",
      idea: "Harbor Sort helps people organize downloads into named folders with preview, undo, and search.",
      presetId: "linux-wayland-gtk4-desktop",
      model: "deepseek-flash",
      apiUrl: "https://api.deepseek.com/responses",
      apiKey: "memory-only",
      jevApiKey: "memory-only-jev",
      atomicAuditor: true,
    }, async () => { calls += 1; return JSON.stringify(fileOrganizerBlueprint) }, undefined, fixtureJevProvider)
    expect(calls).toBe(1)
    expect(result.status).toBe("local-compiler-failure")
  })
})
