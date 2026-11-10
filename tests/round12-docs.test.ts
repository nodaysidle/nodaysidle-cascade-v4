import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { auditCapabilities } from "../src/capabilities"
import { compilePacket } from "../src/compiler"
import { PRESETS } from "../src/presets"
import { WAYBAR_PROVIDER_NOTES } from "../src/waybarContracts"
import type { SemanticBlueprint } from "../src/schema"

// Round 12 live check: four packets reached Gate Clean and none was agent-ready. Each fixture is the blueprint the
// provider returned for that idea (blueprint.json of the audited packet).
const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as SemanticBlueprint

function section(doc: string, heading: string): string {
  const start = doc.indexOf(heading)
  expect(start, heading).toBeGreaterThan(-1)
  const next = doc.indexOf("\n### ", start + 1)
  return doc.slice(start, next === -1 ? undefined : next)
}

// Tip Split: a calculator that stores nothing still got the list prompt (status, empty-state and write-error slots, and
// a focused test that seeds a repository the packet says does not exist).
describe("Android: a product with no data object builds no list (round 12)", () => {
  it("the first main task builds its own section and tests its own acceptance", async () => {
    const packet = await compilePacket(load("android-tip-split.json"), "android-kotlin-compose")
    expect(packet.failures).toEqual([])
    const task = section(packet.documents["TASKS.md"], "### TASK-03-SPLIT-CALCULATOR")
    for (const text of ["main list", 'tag "empty-state"', 'tag "write-error"', 'testTag "status"', "seeds records through the repository", "asserts only the list", "Every list row", "store is reopened", "later task's  ("]) expect(task, text).not.toContain(text)
    expect(task).toContain("stores nothing")
    expect(task).toContain('"Split calculator" (testTag "section-split-calculator"), yours: build its content in this task')
    expect(task).toContain("your focused test drives your own acceptance criteria through the real screen")
  })
})

// Disk Free: valueDecimals 1 (label line, kit) while the label acceptance signals said "3.67 GB" and "10.00 GB", and
// the units rule said a size always has 2 decimals.
describe("Waybar: label examples use the declared number of decimals (round 12)", () => {
  const WAYBAR = "linux-hyprland-waybar-module" as const
  const rules = (blueprint: SemanticBlueprint) => auditCapabilities(blueprint, PRESETS[WAYBAR]).map(issue => issue.rule)
  const repaired = (): SemanticBlueprint => {
    const blueprint = load("waybar-disk-free.json")
    const feature = blueprint.features[0]!
    feature.acceptanceSignals = feature.acceptanceSignals.map(signal => signal.replace("3.67 GB", "3.7 GB").replaceAll("10.00 GB", "10.0 GB"))
    return blueprint
  }

  it("sends a label example with other decimals back for repair, and names the signal", () => {
    const issues = auditCapabilities(load("waybar-disk-free.json"), PRESETS[WAYBAR])
    expect(issues.map(issue => issue.rule)).toEqual(["capability.waybar-label-decimals", "capability.waybar-label-decimals", "capability.waybar-label-decimals"])
    expect(issues[0]!.path).toBe("features[0].acceptanceSignals[0]")
    expect(issues[0]!.message).toContain("3.67 GB")
  })

  it("accepts the repaired signals and leaves the tooltip percent alone", () => {
    expect(rules(repaired())).toEqual([])
  })

  it("tells the provider, and the units rule yields to a label that states its decimals", async () => {
    expect(WAYBAR_PROVIDER_NOTES.join(" ")).toContain("never 3.67 GB")
    const packet = await compilePacket(repaired(), WAYBAR)
    expect(packet.failures).toEqual([])
    const trd = packet.documents["TRD.md"]
    expect(trd).not.toContain("no acceptance criterion changes them: a size is shown with 2 decimals")
    expect(trd).toContain("A label whose contract states an exact number of decimals uses that number")
    expect(packet.documents["TASKS.md"]).toContain("the label text is 3.7 GB")
  })
})
