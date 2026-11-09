import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import { auditCapabilities } from "../src/capabilities"
import { auditSemanticIntake } from "../src/schema"
import { PRESETS } from "../src/presets"
import { airQualityBlueprint, netSpeedBlueprint } from "./fixtures/waybarSources"

const ID = "linux-hyprland-waybar-module" as const

function rules(blueprint: typeof netSpeedBlueprint, presetId: keyof typeof PRESETS = ID): string[] {
  return [...auditSemanticIntake(blueprint), ...auditCapabilities(blueprint, PRESETS[presetId])].map(issue => issue.rule)
}

function taskOrder(tasks: string): string[] {
  return [...tasks.matchAll(/^#{2,4} (TASK-\d+-[A-Z-]+)/gm)].map(match => match[1]!)
}

describe("Waybar system sources, units, and one failure rule", () => {
  it("compiles a counter-reading module with one convention, one source, and one failure rule", async () => {
    const packet = await compilePacket(netSpeedBlueprint, ID)
    expect(packet.failures).toEqual([])
    const names = packet.kit.map(file => file.name)
    expect(names).toEqual(expect.arrayContaining(["kit/src/platform/units.rs", "kit/src/platform/system_source.rs", "kit/tests/units_tests.rs", "kit/tests/system_source_tests.rs"]))
    const text = (name: string) => packet.kit.find(file => file.name === name)?.content ?? ""
    expect(text("kit/src/platform/system_source.rs")).toContain("NetReceivedReader")
    expect(text("kit/src/platform/system_source.rs")).not.toContain("NetSentReader")
    expect(text("kit/tests/units_tests.rs")).toContain('"10.0 Mb/s"')
    const trd = packet.documents["TRD.md"]
    expect(trd).toContain("fixed decimal SI")
    expect(trd).toContain("System source: /proc/net/dev")
    expect(trd).toContain("rx_bytes column over every interface except lo")
    expect(trd).toContain("fetch_output never returns Ok(last value) for a failed read")
    expect(trd).toContain("only the --service loop")
    expect(trd).not.toContain("print a JSON state and exit 0 so Waybar keeps the module; the cache keeps")
    expect(trd).toContain("Cardinality: exactly one record")
    expect(packet.documents["TASKS.md"]).toContain("now_unix * 1000")
  })

  it("gives the lifecycle owner a concrete shutdown API and the right to edit module.rs", async () => {
    const packet = await compilePacket(netSpeedBlueprint, ID)
    const tasks = packet.documents["TASKS.md"]
    const lifecycle = tasks.slice(tasks.indexOf("OWN-LIFECYCLE-COORDINATOR"))
    expect(lifecycle).toContain("module::shutdown_cleanup(settings, cache_path)")
    expect(lifecycle).toContain("src/module.rs")
    expect(tasks).toContain("The service loop (module::serve_until and run_service, SIGTERM handling) belongs to OWN-LIFECYCLE-COORDINATOR")
    const kit = packet.kit.find(file => file.name === "kit/src/module.rs")!.content
    expect(kit).toContain("pub fn serve_until(shutdown: &AtomicBool")
    expect(packet.kit.find(file => file.name === "kit/Cargo.toml")!.content).toContain("signal-hook")
  })

  it("keeps a saved setting in config.json only, carries its identifier in the cached record, and orders label before refresh", async () => {
    const packet = await compilePacket(airQualityBlueprint, ID)
    expect(packet.failures).toEqual([])
    const trd = packet.documents["TRD.md"]
    expect(trd).toContain("lives only in config.json (Settings.values, keys city_name, service_location_identifier)")
    expect(trd).toContain("there is no SQLite table, migration, or generated id for it")
    expect(trd).toContain("Request URL: https://api.example.org/feed/{value}/")
    expect(trd).toContain("the function request_url")
    expect(trd).toContain("the function page_url")
    expect(trd).toContain("when no value is saved the address is https://example.org/")
    const tasks = packet.documents["TASKS.md"]
    const order = taskOrder(tasks)
    const display = order.findIndex(id => id.includes("AIR-QUALITY-INDEX-DISPLAY"))
    const refresh = order.findIndex(id => id.includes("SCHEDULED-INDEX-REFRESH"))
    expect(display).toBeGreaterThan(-1)
    expect(refresh).toBeGreaterThan(display)
    expect(tasks).toContain("You are the refresh-loop owner and the only owner of fetch_output")
    expect(tasks).toContain("The label is built by the pure function exported by Air quality index display")
    expect(tasks).toContain("carries the value of the saved setting 'Service location identifier'")
    expect(tasks).toContain("the address the integration owner's page_url function builds")
    expect(tasks).toContain("click(settings: &Settings, launcher: &dyn Launcher)")
    expect(packet.documents["AGENTS.md"] + trd).not.toContain("no credential")
  })

  it("rejects what intake can detect and says so for the rest", () => {
    const withUnit = structuredClone(netSpeedBlueprint)
    withUnit.features[1]!.acceptanceSignals = ["The body contains 3.42 GB, converted by dividing by 1024."]
    expect(rules(withUnit)).toContain("capability.waybar-unit-base")
    const gib = structuredClone(netSpeedBlueprint)
    gib.features[1]!.behavior = "Shows the size in MiB."
    expect(rules(gib)).toContain("capability.waybar-unit-base")
    expect(rules(netSpeedBlueprint)).not.toContain("capability.waybar-unit-base")

    const token = structuredClone(airQualityBlueprint)
    token.externalServices[0]!.credentialRequired = false
    token.externalServices[0]!.endpoint = "https://api.example.org/feed/{value}/?token=abc"
    expect(rules(token)).toContain("semantic.credential-in-endpoint")

    const missing = structuredClone(airQualityBlueprint)
    missing.externalServices[0]!.requestValueFrom = ""
    expect(rules(missing)).toContain("semantic.request-value-source")
    const unknown = structuredClone(airQualityBlueprint)
    unknown.externalServices[0]!.requestValueFrom = "Nothing"
    expect(rules(unknown)).toContain("semantic.request-value-unknown")
    const unused = structuredClone(airQualityBlueprint)
    unused.externalServices[0]!.endpoint = "https://api.example.org/feed/"
    unused.externalServices[0]!.webPage = ""
    expect(rules(unused)).toContain("semantic.request-value-unused")

    const noIdentifier = structuredClone(airQualityBlueprint)
    noIdentifier.dataObjects[1]!.fields = noIdentifier.dataObjects[1]!.fields.filter(field => field.name !== "Service location identifier")
    expect(rules(noIdentifier)).toContain("semantic.record-missing-request-value")
    expect(rules(airQualityBlueprint)).toEqual([])

    const twoSchedules = structuredClone(airQualityBlueprint)
    twoSchedules.features[1]!.runsEverySeconds = 1200
    expect(rules(twoSchedules)).toContain("capability.waybar-schedule-owner")

    const reversed = structuredClone(airQualityBlueprint)
    reversed.features[0]!.buildsOn = []
    reversed.features[1]!.buildsOn = ["Scheduled index refresh"]
    expect(rules(reversed)).toContain("capability.waybar-build-order")
    expect(rules(airQualityBlueprint)).not.toContain("capability.waybar-build-order")

    expect(rules(netSpeedBlueprint, "linux-wayland-gtk4-desktop")).toContain("capability.system-source")
  })

  it("picks the scheduled feature that measures as the refresh owner even when a reader also declares a schedule", async () => {
    const both = structuredClone(airQualityBlueprint)
    both.features[1]!.runsEverySeconds = 1200
    const packet = await compilePacket(both, ID)
    const tasks = packet.documents["TASKS.md"]
    expect(tasks).toContain("You are the refresh-loop owner and the only owner of fetch_output")
    const owners = [...tasks.matchAll(/the only owner of fetch_output/g)]
    expect(owners).toHaveLength(1)
  })
})
