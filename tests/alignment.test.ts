import { describe, expect, it } from "vitest"
import { DOCUMENT_NAMES, compilePacket } from "../src/compiler"
import { fixtureCases } from "./fixtures/blueprints"

describe("five-document contract alignment", () => {
  it.each(fixtureCases)("$presetId / $blueprint.productName", async ({ presetId, blueprint }) => {
    const packet = await compilePacket(blueprint, presetId)
    expect(packet.exportable).toBe(true)
    expect(packet.failures).toEqual([])
    expect(packet.ledger.every(entry => entry.status === "pass")).toBe(true)

    const documents = packet.documents
    for (const name of DOCUMENT_NAMES) {
      expect(documents[name].trim().length).toBeGreaterThan(0)
      expect(documents[name]).not.toMatch(/\b(?:TBD|TODO|FIXME)\b/)
    }

    for (const feature of packet.graph.features) {
      for (const name of DOCUMENT_NAMES) expect(documents[name]).toContain(feature.id)
    }
    for (const contract of packet.graph.contracts) {
      for (const name of DOCUMENT_NAMES) expect(documents[name]).toContain(contract.id)
      expect(documents["TRD.md"]).toContain(contract.decision)
      for (const detail of contract.details) expect(documents["TRD.md"]).toContain(detail)
      expect(documents["TRD.md"]).toContain(contract.failureBehavior)
      for (const recovery of contract.recovery) expect(documents["TRD.md"]).toContain(recovery)
    }
    for (const owner of packet.graph.owners) {
      expect(documents["ARD.md"]).toContain(owner.id)
      expect(documents["TASKS.md"]).toContain(owner.id)
    }
    for (const phase of packet.graph.phases) {
      expect(documents["TASKS.md"]).toContain(phase.id)
      for (const task of phase.tasks) expect(documents["TASKS.md"]).toContain(task.id)
    }
    for (const requirement of packet.graph.requirements) {
      expect(documents["PRD.md"]).toContain(requirement.id)
      expect(documents["TASKS.md"]).toContain(requirement.id)
    }
    for (const acceptance of packet.graph.acceptance) {
      expect(documents["PRD.md"]).toContain(acceptance.id)
      expect(documents["TASKS.md"]).toContain(acceptance.id)
    }
  })
})
