import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import { auditCapabilities } from "../src/capabilities"
import { auditSemanticIntake } from "../src/schema"
import { PRESETS } from "../src/presets"
import { freeSpaceBlueprint } from "./fixtures/waybarSources"

const ID = "linux-hyprland-waybar-module" as const

function rules(blueprint: typeof freeSpaceBlueprint): string[] {
  return [...auditSemanticIntake(blueprint), ...auditCapabilities(blueprint, PRESETS[ID])].map(issue => issue.rule)
}

describe("memory source wiring, one failure wording, and no inherited boilerplate (audit round 5)", () => {
  const memory = (() => {
    const blueprint = structuredClone(freeSpaceBlueprint)
    blueprint.features[0]!.systemSource = "memory"
    return blueprint
  })()

  it("lists exactly the kit's memory override and none of the thermal or service boilerplate", async () => {
    expect(rules(memory)).toEqual([])
    const packet = await compilePacket(memory, ID)
    expect(packet.failures).toEqual([])
    const trd = packet.documents["TRD.md"]
    expect(trd).toContain("The kit defines exactly these environment variables for the binary test: MODULE_MEMINFO_PATH and no other")
    expect(trd).not.toContain("MODULE_THERMAL_DIR")
    expect(trd).not.toContain("no thermal zone")
    expect(trd).not.toContain("no reachable service")
    expect(trd).toContain("freeBytes = MemAvailable (never MemFree)")
    const source = packet.kit.find(file => file.name === "kit/src/platform/system_source.rs")!.content
    expect(source).toContain('"MODULE_MEMINFO_PATH"')
    expect(source).toContain("pub fn from_env() -> Self")
  })

  it("states the kit's failed-refresh behavior in the TRD and the task prompts, and ships no tokio without a service", async () => {
    const packet = await compilePacket(memory, ID)
    const kitModule = packet.kit.find(file => file.name === "kit/src/module.rs")!.content
    expect(kitModule).toContain("cache.output.class = String::from(CLASS_STALE)")
    for (const name of ["TRD.md", "TASKS.md"] as const) expect(packet.documents[name]).toContain("cache.json is rewritten only to mark it stale, or rebuilt from the stored record when it is missing")
    expect(packet.documents["TRD.md"]).not.toContain("tokio")
    expect(packet.kit.map(file => file.name)).not.toContain("kit/src/platform/runtime.rs")
    expect(packet.kit.find(file => file.name === "kit/Cargo.toml")!.content).not.toContain("tokio")
    expect(packet.kit.find(file => file.name === "kit/src/platform/mod.rs")!.content).not.toContain("runtime")
  })

  it("keeps the data owner's modify list to platform/mod.rs and words the lifecycle test so it can run", async () => {
    const tasks = (await compilePacket(memory, ID)).documents["TASKS.md"]
    const data = tasks.slice(tasks.indexOf("TASK-02-DATA-STORE"), tasks.indexOf("TASK-03-LIFECYCLE-COORDINATOR"))
    expect(data).toContain("src/platform/mod.rs")
    expect(data).not.toMatch(/src\/(config|main)\.rs/)
    expect(tasks).toContain("then calls module::shutdown_cleanup(settings, cache_path) directly")
    expect(tasks).toContain('declares the key "custom/')
  })

  it("rejects a feature that names cache.json, and tells the provider the click reads the stored record", () => {
    const named = structuredClone(memory)
    named.features[1]!.acceptanceSignals = ["After a failed refresh cache.json is unchanged."]
    expect(rules(named)).toContain("capability.waybar-cache-file")
    expect(PRESETS[ID]!.providerNotes?.join(" ")).toContain("reads the stored record and, with no stored record, sends nothing")
  })
})
