import { describe, expect, it } from "vitest"
import { auditCapabilities } from "../src/capabilities"
import { compilePacket } from "../src/compiler"
import { PRESETS } from "../src/presets"
import { auditSemanticIntake, type SemanticBlueprint } from "../src/schema"
import { diskReadBlueprint, unitLabelBlueprint } from "./fixtures/waybarSources"

const ID = "linux-hyprland-waybar-module" as const

function rules(blueprint: SemanticBlueprint): string[] {
  return [...auditSemanticIntake(blueprint), ...auditCapabilities(blueprint, PRESETS[ID])].map(issue => issue.rule)
}

const windLabel = () => structuredClone(unitLabelBlueprint)
const diskRead = () => structuredClone(diskReadBlueprint)

describe("Waybar declared response paths, label units, and rate sources", () => {
  it("rejects a response value without a path and a unit the template drops", () => {
    expect(rules(windLabel())).toEqual([])
    const noPath = windLabel()
    noPath.externalServices[0]!.responseFields[0]!.path = ""
    expect(rules(noPath)).toContain("capability.waybar-response-path")
    const bare = windLabel()
    bare.features[1]!.labelTemplate = "{value}"
    expect(rules(bare)).toContain("capability.waybar-label-unit")
    const orphan = windLabel()
    orphan.features[1]!.unit = ""
    expect(rules(orphan)).toContain("capability.waybar-label-unit")
  })

  it("documents the key path and the fixed-unit label, and ships the rounding rule without a system source", async () => {
    const packet = await compilePacket(windLabel(), ID)
    expect(packet.failures).toEqual([])
    const trd = packet.documents["TRD.md"]
    expect(trd).toContain('Index value at ["data", "aqi"]')
    expect(trd).toContain("the bare number of the reading in the fixed unit km/h")
    expect(trd).toContain('with exactly 1 decimal, rounded half away from zero (12 is shown as "12.0")')
    const names = packet.kit.map(file => file.name)
    expect(names).toContain("kit/src/platform/units.rs")
    expect(names).not.toContain("kit/src/platform/system_source.rs")
    const units = packet.kit.find(file => file.name === "kit/tests/units_tests.rs")!.content
    expect(units).toContain('format_decimals(1.25, 1), "1.3"')
  })

  it("reads disk bytes from /proc/diskstats, keeps the previous sample in the stored record, and ships no statvfs or time zone code", async () => {
    expect(rules(diskRead())).toEqual([])
    const packet = await compilePacket(diskRead(), ID)
    expect(packet.failures).toEqual([])
    const docs = Object.values(packet.documents).join("\n")
    expect(docs).toContain("/proc/diskstats")
    expect(docs).toContain("MODULE_DISKSTATS_PATH")
    expect(docs).toContain("the previous sample lives in the stored record of the reading")
    expect(docs).not.toContain("statvfs")
    expect(docs).not.toContain("chrono")
    const names = packet.kit.map(file => file.name)
    expect(names).not.toContain("kit/src/platform/local_time.rs")
    const source = packet.kit.find(file => file.name === "kit/src/platform/system_source.rs")!.content
    expect(source).toContain("DiskReadReader")
    expect(source).toContain("SECTOR_BYTES: u64 = 512")
    expect(source).not.toContain("statvfs")
    expect(packet.kit.find(file => file.name === "kit/Cargo.toml")!.content).not.toContain("nix")
  })

  it("requires the stored counter and sample time for a rate", () => {
    const blueprint = diskRead()
    blueprint.dataObjects[0]!.fields = blueprint.dataObjects[0]!.fields.filter(field => field.valueType !== "date-time")
    expect(rules(blueprint)).toContain("capability.waybar-rate-sample")
  })

  it("states a failed refresh as the cache class plus the render-time suffix", async () => {
    const packet = await compilePacket(windLabel(), ID)
    expect(packet.documents["TRD.md"]).toContain("STALE_SUFFIX is appended when the module renders and is never written into cache.json")
  })

  it("allows a declared refresh interval below 5 seconds in the Waybar kit", async () => {
    const blueprint = diskRead()
    blueprint.features[0]!.runsEverySeconds = 2
    const packet = await compilePacket(blueprint, ID)
    expect(packet.failures).toEqual([])
    const moduleRs = packet.kit.find(file => file.name === "kit/src/module.rs")!.content
    const configRs = packet.kit.find(file => file.name === "kit/src/config.rs")!.content
    const contractTests = packet.kit.find(file => file.name === "kit/tests/contract_tests.rs")!.content
    expect(moduleRs).toContain("u64::from(settings.refresh_seconds.max(1))")
    expect(configRs).toContain("if seconds < 1")
    expect(configRs).toContain("refresh_seconds must be at least 1")
    expect(contractTests).toContain('assert!(settings.set("refresh_seconds", "0").is_err())')
  })

  it("does not reference packaging-owned resources/waybar/config.jsonc in TASK-01-FOUNDATION", async () => {
    const packet = await compilePacket(diskRead(), ID)
    const task01 = packet.graph.phases[0]!.tasks[0]!
    expect(task01.id).toBe("TASK-01-FOUNDATION")
    expect(task01.acceptanceCriteria.join("\n")).not.toContain("resources/waybar/config.jsonc")
    expect(task01.acceptanceCriteria.join("\n")).toContain("The implementation marker is custom/")
    expect(packet.documents["TRD.md"]).toContain('resources/waybar/config.jsonc declares the key "custom/disk-io"')
  })
})
