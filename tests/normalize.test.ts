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

  it("keeps list entries apart when they differ in a decimal point, minus sign or thousands separator", () => {
    const blueprint = structuredClone(gtk.blueprint)
    const owner = blueprint.features[0]!
    owner.choiceLists = [{ name: "Size", options: ["0.5", "5", "1.5", "15", "-5", "1,000", "1000", "Large", "large", "LARGE "], initial: "0.5" }]
    const normalized = normalizeBlueprint(blueprint, gtk.presetId).features.find(feature => feature.name === owner.name)!
    expect(normalized.choiceLists![0]!.options).toEqual(["0.5", "5", "1.5", "15", "-5", "1,000", "1000", "Large"])
    owner.choiceLists = [{ name: "Size", options: ["- Large", "Small"], initial: "Small" }]
    const bulleted = normalizeBlueprint(blueprint, gtk.presetId).features.find(feature => feature.name === owner.name)!
    expect(bulleted.choiceLists![0]!.options).toEqual(["Large", "Small"])
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

  it("keeps ordinary prose that only looks like a command, path, or ID", () => {
    const blueprint = structuredClone(gtk.blueprint)
    const prose = "Swift delivery for a yarn stash and the Cargo manifest; the task-list and own-brand items toggle on / off"
    blueprint.features[0]!.behavior = prose
    blueprint.features[0]!.name = "Task-list"
    blueprint.ideaCoverage = blueprint.ideaCoverage.map(entry => ({ ...entry, features: entry.features.map(name => name === gtk.blueprint.features[0]!.name ? "Task-list" : name) }))
    for (const other of blueprint.features) other.buildsOn = other.buildsOn.map(name => name === gtk.blueprint.features[0]!.name ? "Task-list" : name)
    const normalized = normalizeBlueprint(blueprint, gtk.presetId)
    expect(normalized.features[0]!.name).toBe("Task-list")
    expect(normalized.features[0]!.behavior).toBe(prose)
  })

  it("still scrubs a real command, source path, and provider ID", () => {
    const blueprint = structuredClone(gtk.blueprint)
    blueprint.features[0]!.behavior = "Run npm run build --watch and cargo test, edit src/main.rs, see FEAT-02 for the rest"
    const behavior = normalizeBlueprint(blueprint, gtk.presetId).features[0]!.behavior
    expect(behavior).not.toMatch(/npm run|cargo test|src\/main|FEAT-02/)
    expect(behavior).toContain("the local validation command")
    expect(behavior).toContain("the local implementation")
  })
})

