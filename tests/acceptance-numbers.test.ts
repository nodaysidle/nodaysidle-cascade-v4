import { describe, expect, it } from "vitest"
import { auditProjectGraph } from "../src/audit"
import { compilePacket, type ProjectGraph } from "../src/compiler"
import { fixtureCases } from "./fixtures/blueprints"

const gtk = fixtureCases.find(item => item.presetId === "linux-wayland-gtk4-desktop")!
const compileWith = (signals: readonly (readonly string[])[]) => {
  const blueprint = structuredClone(gtk.blueprint)
  signals.forEach((list, index) => { blueprint.features[index]!.acceptanceSignals = [...list] })
  return compilePacket(blueprint, gtk.presetId)
}
const criteriaOf = (graph: ProjectGraph, featureIndex: number) => graph.acceptance.filter(item => item.kind === "feature" && item.featureIds[0] === graph.features[featureIndex]!.id).map(item => item.criterion)

describe("acceptance criteria that differ only in a number stay apart", () => {
  it("keeps both sentences of one feature through the full compile", async () => {
    const { graph } = await compileWith([["The window shows 1.5 km as the range.", "The window shows 15 km as the range."]])
    expect(criteriaOf(graph, 0)).toEqual(expect.arrayContaining(["The window shows 1.5 km as the range.", "The window shows 15 km as the range."]))
  })

  it("gives each feature its own criterion and makes no integration criterion", async () => {
    const { graph } = await compileWith([["The window shows 1.5 km as the range.", "The offset is -5 minutes."], ["The window shows 15 km as the range.", "The offset is 5 minutes."]])
    expect(criteriaOf(graph, 0)).toEqual(expect.arrayContaining(["The window shows 1.5 km as the range.", "The offset is -5 minutes."]))
    expect(criteriaOf(graph, 1)).toEqual(expect.arrayContaining(["The window shows 15 km as the range.", "The offset is 5 minutes."]))
    expect(graph.acceptance.filter(item => item.kind === "integration")).toEqual([])
  })

  it("still merges the same sentence in different case and spacing into one integration criterion", async () => {
    const { graph } = await compileWith([["The window shows 1.5 km as the range."], ["the  WINDOW shows 1.5 km as the range"]])
    expect(graph.acceptance.filter(item => item.kind === "integration")).toHaveLength(1)
  })

  it("the audit still rejects two acceptance items that differ only in case, spacing or punctuation", async () => {
    const { graph } = await compileWith([])
    const copy = structuredClone(graph) as unknown as { acceptance: { criterion: string }[] }
    copy.acceptance[1]!.criterion = `  ${copy.acceptance[0]!.criterion.toUpperCase().replace(/\.$/, "")}!! `
    expect(auditProjectGraph(copy as unknown as ProjectGraph).map(item => item.rule)).toContain("graph.acceptance-ownership")
  })
})
