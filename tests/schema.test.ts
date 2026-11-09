import { describe, expect, it } from "vitest"
import { auditSemanticIntake, buildBlueprintInstructions, providerJsonSchema, SemanticBlueprintSchema } from "../src/schema"
import { fileOrganizerBlueprint } from "./fixtures/blueprints"

function clone<T>(value: T): T {
  return structuredClone(value)
}

describe("v4 provider schema and intake", () => {
  it("never exposes filesystem to the provider", () => {
    expect(JSON.stringify(providerJsonSchema)).not.toContain('"filesystem"')
    const invalid = clone(fileOrganizerBlueprint) as unknown as { features: Array<{ usesPlatformNeeds: string[] }> }
    invalid.features[0]!.usesPlatformNeeds = ["filesystem"]
    expect(SemanticBlueprintSchema.safeParse(invalid).success).toBe(false)
  })

  it("rejects duplicate names instead of silently deduping", () => {
    const duplicate = clone(fileOrganizerBlueprint)
    duplicate.features.push(clone(duplicate.features[0]!))
    expect(auditSemanticIntake(duplicate).some(issue => issue.rule === "semantic.duplicate-name")).toBe(true)
  })

  it("rejects a product platform need no feature uses", () => {
    const unused = clone(fileOrganizerBlueprint)
    unused.platformNeeds = ["camera"]
    expect(auditSemanticIntake(unused).some(issue => issue.rule === "semantic.unused-platform-need")).toBe(true)
  })

  it("requires clipboardAccess to match the clipboard need", () => {
    const mismatch = clone(fileOrganizerBlueprint)
    mismatch.features[0]!.usesPlatformNeeds = ["clipboard"]
    mismatch.features[0]!.clipboardAccess = "none"
    expect(auditSemanticIntake(mismatch).some(issue => issue.rule === "semantic.clipboard-undeclared")).toBe(true)
  })

  it("tells the provider when the preset has no tray surface", () => {
    expect(buildBlueprintInstructions({ idea: "One sentence.", trayAvailable: false })).toContain("Set usesTray to false for every feature")
    expect(buildBlueprintInstructions({ idea: "One sentence.", trayAvailable: true })).not.toContain("Set usesTray to false for every feature")
    expect(buildBlueprintInstructions({ idea: "One sentence." })).not.toContain("Set usesTray to false for every feature")
  })

  it("tells the provider when the preset cannot run work while the app is closed", () => {
    expect(buildBlueprintInstructions({ idea: "One sentence.", backgroundAvailable: false })).toContain("is not background execution")
    expect(buildBlueprintInstructions({ idea: "One sentence.", backgroundAvailable: true })).not.toContain("is not background execution")
  })

  it("lists every property of every object as required, as the provider's strict mode demands", () => {
    const bad: string[] = []
    const walk = (node: unknown, path: string): void => {
      if (!node || typeof node !== "object") return
      const record = node as { type?: string; properties?: Record<string, unknown>; required?: string[] }
      if (record.type === "object" && record.properties) {
        const missing = Object.keys(record.properties).filter(key => !(record.required ?? []).includes(key))
        if (missing.length) bad.push(`${path}: ${missing.join(", ")}`)
      }
      for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`)
    }
    walk(providerJsonSchema, "$")
    expect(bad).toEqual([])
  })


  it("prompt is coverage-first and forbids settings as features", () => {
    const prompt = buildBlueprintInstructions({ idea: "One sentence." })
    expect(prompt).toContain("Coverage is checked structurally")
    expect(prompt).toContain("A feature is not a setting")
    expect(prompt).toContain("Never emit filesystem")
  })
})
