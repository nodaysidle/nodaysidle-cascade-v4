import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { auditCapabilities } from "../src/capabilities"
import { compilePacket } from "../src/compiler"
import { PRESETS } from "../src/presets"
import { auditSemanticIntake, type SemanticBlueprint } from "../src/schema"
import { WAYBAR_PROVIDER_NOTES } from "../src/waybarContracts"

const ID = "linux-hyprland-waybar-module" as const
const raw = JSON.parse(readFileSync(new URL("./fixtures/waybar-temp-watch.json", import.meta.url), "utf8")) as SemanticBlueprint
const capability = (blueprint: SemanticBlueprint) => auditCapabilities(blueprint, PRESETS[ID])

// The repair a provider would send for the round-11 packet: the peak is a stored field, not process state.
function repaired(): SemanticBlueprint {
  const blueprint = structuredClone(raw)
  const refresh = blueprint.features[1]!
  refresh.behavior = refresh.behavior.replace(/The refresh pass also tracks[^.]*\./, "Each refresh reads the stored record and stores the larger of the stored peak and the new reading.")
  refresh.dataOperations = [{ data: "Temperature reading", operations: ["read", "create"] }]
  blueprint.productConstraints = blueprint.productConstraints.map(text => text.startsWith("The peak") ? "The peak is a field of the stored Temperature reading record; the click reads it from the stored record." : text)
  // Round 11 re-audit: the retention line said the peak resets when the process starts, which contradicted the reset rule.
  blueprint.dataObjects[0]!.retentionIntent = "Keeps only the latest reading and the peak; the peak starts again at the new reading on the first successful refresh after the module was stopped for more than twice the refresh interval."
  return blueprint
}

// Round 11 (Temp Watch): one provider note kept a peak in the service's memory and sent it to the click through the
// cache, while the cache note says a click reads the stored record. The packet said both and stored the peak too.
describe("Waybar: a peak since start is one stored field (round 11)", () => {
  it("gives the provider one story: no note sends a value to the click through the cache or keeps it in process memory", () => {
    const notes = WAYBAR_PROVIDER_NOTES.join(" ")
    expect(notes).not.toMatch(/only through the cache/i)
    expect(notes).not.toMatch(/process memory|service's memory/i)
    expect(notes).toContain("stores the larger of the stored peak and the new reading")
  })

  it("provider notes copied into a blueprint trip no Waybar check", () => {
    const blueprint = repaired()
    expect(capability(blueprint)).toEqual([])
    blueprint.productConstraints = [...blueprint.productConstraints, ...WAYBAR_PROVIDER_NOTES]
    blueprint.features[0]!.acceptanceSignals = [...blueprint.features[0]!.acceptanceSignals, ...WAYBAR_PROVIDER_NOTES]
    expect(capability(blueprint).map(issue => issue.rule)).toEqual([])
  })

  it("rejects the round-11 answer that keeps the peak in the service's memory, with a repair wording that passes", () => {
    const issues = capability(raw).filter(issue => issue.rule === "capability.waybar-process-memory")
    expect(issues.map(issue => issue.path).sort()).toEqual(["features[1]", "productConstraints[1]"])
    const fixed = structuredClone(raw)
    fixed.productConstraints = [issues[0]!.message]
    fixed.features[1]!.behavior = issues[0]!.message
    expect(capability(fixed).filter(issue => issue.rule === "capability.waybar-process-memory")).toEqual([])
  })

  it("lets the refresh read the stored peak, states the reset rule, and compares thresholds with the stored value", async () => {
    const blueprint = repaired()
    blueprint.features[1]!.dataOperations = [{ data: "Temperature reading", operations: ["create"] }]
    expect([...auditSemanticIntake(blueprint), ...capability(blueprint)]).toEqual([])
    const packet = await compilePacket(blueprint, ID)
    expect(packet.failures).toEqual([])
    const trd = packet.documents["TRD.md"]
    const tasks = packet.documents["TASKS.md"]
    expect(trd).toMatch(/Store operations, exactly these and no others: read \([^)]*FEAT-TEMPERATURE-REFRESH[^)]*\)/)
    expect(trd).toContain("read is list and get")
    for (const doc of [trd, tasks]) {
      expect(doc).toContain("peak keeps the highest reading since the module started")
      expect(doc).toContain("reads the stored record first and stores the larger of the stored peak and the new reading")
      expect(doc).toContain("when the stored sampled at is more than twice the refresh interval before now")
    }
    expect(trd).toContain("70.4 is stored as 70")
    expect(trd).not.toContain("severity compares the unrounded value")
    expect(trd).not.toContain('12.0 stays "12.0"')
    expect(trd).toContain('12.5 is shown as "13"')
  })
})
