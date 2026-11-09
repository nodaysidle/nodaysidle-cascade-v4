import { describe, expect, it } from "vitest"
import { NormalizationError, normalizeBlueprint } from "../src/compiler"
import { auditSemanticIntake } from "../src/schema"
import { fixtureCases } from "./fixtures/blueprints"

const gtk = fixtureCases.find(item => item.presetId === "linux-wayland-gtk4-desktop" && item.blueprint.dataObjects.some(data => data.fields.length > 0)) ?? fixtureCases[0]!
const issuesOf = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    if (error instanceof NormalizationError) return error.issues
    throw error
  }
  return []
}

describe("normalization never drops provider content silently", () => {
  it("intake rejects names that differ only in punctuation, so the repair can fix them", () => {
    const blueprint = structuredClone(gtk.blueprint)
    blueprint.features[1]!.name = blueprint.features[0]!.name.replace(" ", "-")
    expect(auditSemanticIntake(blueprint).map(issue => issue.rule)).toContain("semantic.duplicate-name")
  })

  it("refuses two features that become one name after cleaning", () => {
    const blueprint = structuredClone(gtk.blueprint)
    blueprint.features[1]!.name = `${blueprint.features[0]!.name} FEAT-07`
    expect(issuesOf(() => normalizeBlueprint(blueprint, gtk.presetId))).toEqual([expect.objectContaining({ path: "features[1].name", rule: "normalization.duplicate-name" })])
  })

  it("refuses a field, data object, or service text that cleans to nothing", () => {
    const fieldOwner = gtk.blueprint.dataObjects.findIndex(item => item.fields.length > 0)
    expect(fieldOwner).toBeGreaterThanOrEqual(0)
    const field = structuredClone(gtk.blueprint)
    field.dataObjects[fieldOwner]!.fields[0]!.name = "FEAT-01"
    expect(issuesOf(() => normalizeBlueprint(field, gtk.presetId)).map(issue => issue.path)).toEqual([`dataObjects[${fieldOwner}].fields[0].name`])
    const purpose = structuredClone(gtk.blueprint)
    purpose.dataObjects[0]!.purpose = "TASK-02"
    expect(issuesOf(() => normalizeBlueprint(purpose, gtk.presetId)).map(issue => issue.path)).toEqual(["dataObjects[0].purpose"])
  })
})
