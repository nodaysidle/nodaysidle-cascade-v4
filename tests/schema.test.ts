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

  it("prompt is coverage-first and forbids settings as features", () => {
    const prompt = buildBlueprintInstructions({ idea: "One sentence." })
    expect(prompt).toContain("Coverage is checked structurally")
    expect(prompt).toContain("A feature is not a setting")
    expect(prompt).toContain("Never emit filesystem")
  })
})
