import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import { auditCapabilities } from "../src/capabilities"
import { auditSemanticIntake } from "../src/schema"
import { PRESETS } from "../src/presets"
import { bareWaybarBlueprint, tideTickBlueprint } from "./fixtures/blueprints"
import { airQualityBlueprint, allSourcesBlueprint, freeSpaceBlueprint, netSpeedBlueprint, sunTimesBlueprint } from "./fixtures/waybarSources"

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
    expect(trd).toContain("with no value saved the click returns Err")
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

  describe("disk space, thresholds, labels, time, and request values (audit round 3)", () => {
    const text = (packet: Awaited<ReturnType<typeof compilePacket>>, name: string) => packet.kit.find(file => file.name === `kit/${name}`)?.content ?? ""
    const task = (packet: Awaited<ReturnType<typeof compilePacket>>, id: string) => packet.documents["TASKS.md"].split(`### ${id}`)[1]!.split("\n### ")[0]!
    const stack = (trd: string) => trd.split("## Locked Stack")[1]!.split("\n## ")[0]!

    it("reads the root disk through a declared source with one stated rule, and ships units.rs for it", async () => {
      expect(rules(freeSpaceBlueprint)).toEqual([])
      const packet = await compilePacket(freeSpaceBlueprint, ID)
      expect(packet.failures).toEqual([])
      const trd = packet.documents["TRD.md"]
      expect(trd).toContain('System source: statvfs("/")')
      expect(trd).toContain("free bytes = f_bavail x f_frsize")
      expect(trd).toContain("used bytes = total - f_bfree x f_frsize")
      expect(trd).not.toContain("A counter that goes backwards")
      expect(text(packet, "src/platform/system_source.rs")).toContain("pub struct DiskSpaceReader")
      expect(text(packet, "src/platform/system_source.rs")).toContain('statvfs("/")')
      expect(text(packet, "Cargo.toml")).toContain("nix = ")
      expect(stack(trd)).toContain("nix (statvfs)")
      expect(stack(trd)).not.toContain("chrono")
      expect(text(packet, "Cargo.toml")).not.toContain("chrono")
      expect(text(packet, "src/platform/mod.rs")).toContain("pub mod units;")
      expect(packet.documents["TASKS.md"]).toContain("src/platform/units.rs")
      expect(trd).toContain("a size is shown with 2 decimals (3.67 GB), a rate with 1 decimal (10.0 Mb/s)")
      expect(trd).not.toContain("(default 1)")
      expect(trd).not.toContain("Units: Units are")
      expect(trd).toContain("Operation to trait method: create is insert, update is update, read is list and get")
      expect(trd).not.toContain("bounded correction or rebuild path")
    })

    it("implements a declared lower-bound threshold in the kit and states red as class critical", async () => {
      const packet = await compilePacket(freeSpaceBlueprint, ID)
      const module = text(packet, "src/module.rs")
      expect(module).toContain("Comparison::Below")
      expect(module).toContain("class: CLASS_CRITICAL")
      expect(module).toContain("value: 10000000000.0")
      expect(module).not.toContain("WARNING_ABOVE")
      expect(module).toContain("Comparison::Below => value < item.value")
      expect(module).toContain("Comparison::Above => value > item.value")
      expect(packet.documents["TRD.md"]).toContain("critical (red) when the raw value is below 10000000000")
      expect(text(packet, "tests/module_output_tests.rs")).toContain("Comparison::Below")
      const tasks = task(packet, "TASK-05-FREE-SPACE-REFRESH")
      expect(tasks).toContain("no task edits it")
      expect(tasks).not.toContain("WARNING_ABOVE")
    })

    it("states the label template and one fixed empty label, set by the kit and not by a task", async () => {
      const packet = await compilePacket(freeSpaceBlueprint, ID)
      expect(packet.documents["TRD.md"]).toContain('Label: exactly "{value} free"')
      expect(packet.documents["TRD.md"]).toContain('the label is "--", the kit default of Settings.text')
      expect(text(packet, "src/config.rs")).toContain('text: String::from("--")')
      expect(text(packet, "tests/module_output_tests.rs")).toContain('assert_eq!(Settings::default().text, "--")')
      expect(packet.documents["TASKS.md"]).not.toContain("set exactly that wording as the default of Settings.text")
    })

    it("gives the label owner a signature and drops the saved-setting sentence when no service request uses a setting", async () => {
      const disk = await compilePacket(freeSpaceBlueprint, ID)
      const label = task(disk, "TASK-04-FREE-SPACE-LABEL")
      expect(label).toContain("export label(reading, settings) -> ModuleOutput")
      expect(label).not.toContain("saved-setting value")
      expect(label).not.toContain("another place")
      const sun = await compilePacket(sunTimesBlueprint, ID)
      expect(task(sun, "TASK-05-SUNSET-LABEL")).toContain("differs from the current saved setting")
    })

    it("tells one lifecycle story without a dangling connection and names notifications only when used", async () => {
      const sun = await compilePacket(sunTimesBlueprint, ID)
      const lifecycle = sun.documents["TASKS.md"].slice(sun.documents["TASKS.md"].indexOf("OWN-LIFECYCLE-COORDINATOR"))
      expect(lifecycle).toContain("a store is opened inside each refresh pass and dropped when the pass ends")
      expect(lifecycle).not.toContain("and close the SQLite connection")
      expect(lifecycle).not.toContain("CON-PERMISSION-NOTIFICATIONS needs no code here")
      const net = await compilePacket(netSpeedBlueprint, ID)
      expect(net.documents["TASKS.md"]).toContain("CON-PERMISSION-NOTIFICATIONS needs no code here")
    })

    it("fixes the time-zone rule, ships local_time.rs and chrono, and rebuilds the cache from the stored record", async () => {
      expect(rules(sunTimesBlueprint)).toEqual([])
      const packet = await compilePacket(sunTimesBlueprint, ID)
      expect(packet.failures).toEqual([])
      const trd = packet.documents["TRD.md"]
      expect(trd).toContain("stored as a UTC epoch in whole milliseconds in a date-time field")
      expect(trd).toContain("converted to the user's local time zone only when the label or tooltip is rendered")
      expect(text(packet, "src/platform/local_time.rs")).toContain("pub fn local_clock")
      expect(text(packet, "tests/local_time_tests.rs")).toContain("clock_at_offset")
      expect(text(packet, "Cargo.toml")).toContain("chrono = ")
      expect(stack(trd)).toContain("chrono (local time zone)")
      expect(stack(trd)).not.toContain("nix")
      expect(trd).toContain("when a refresh fails and no cache.json exists, refresh writes it from stored_output")
      expect(text(packet, "src/module.rs")).toContain("pub fn refresh_with(")
      expect(text(packet, "src/module.rs")).toContain("pub fn stored_output(")
      expect(task(packet, "TASK-06-SCHEDULED-SUNSET-REFRESH")).toContain("Also replace stored_output in src/module.rs")
      expect(trd).toContain("pub fn request_url(origin: &str, value: &str) -> String")
      expect(trd).toContain("reading an unset key returns the error that names the key")
    })

    it("names a kit helper in the docs only when every blueprint that causes the mention ships it", async () => {
      const helpers: [string, string][] = [["units.rs", "src/platform/units.rs"], ["local_time.rs", "src/platform/local_time.rs"], ["system_source.rs", "src/platform/system_source.rs"], ["launcher.rs", "src/platform/launcher.rs"]]
      for (const blueprint of [freeSpaceBlueprint, sunTimesBlueprint, netSpeedBlueprint, airQualityBlueprint, allSourcesBlueprint, tideTickBlueprint, bareWaybarBlueprint]) {
        const packet = await compilePacket(blueprint, ID)
        const docs = Object.values(packet.documents).join("\n")
        for (const [word, file] of helpers) {
          if (docs.includes(word)) expect(packet.kit.map(item => item.name), `${blueprint.productName}: ${word}`).toContain(`kit/${file}`)
        }
      }
      const bare = await compilePacket(bareWaybarBlueprint, ID)
      expect(Object.values(bare.documents).join("\n")).not.toContain("units.rs")
    })

    it("rejects what intake can detect: coordinates, request value types, time of day, stale flags, thresholds, label", () => {
      const coordinates = structuredClone(sunTimesBlueprint)
      coordinates.externalServices[0]!.endpoint = "https://api.example.org/json?lat={value}&lng=0&formatted=0"
      expect(rules(coordinates)).toContain("capability.waybar-request-coordinates")
      const bothTemplated = structuredClone(coordinates)
      bothTemplated.externalServices[0]!.requestValueType = "number"
      expect(rules(bothTemplated)).toContain("capability.waybar-request-coordinates")
      const mismatch = structuredClone(sunTimesBlueprint)
      mismatch.externalServices[0]!.requestValueType = "number"
      expect(rules(mismatch)).toContain("capability.waybar-request-value-type")
      const numeric = structuredClone(sunTimesBlueprint)
      numeric.dataObjects[0]!.fields = [{ name: "City", valueType: "number", optional: false }]
      expect(rules(numeric)).toContain("capability.waybar-request-value-type")
      const timeOfDay = structuredClone(sunTimesBlueprint)
      timeOfDay.dataObjects[1]!.fields[0]!.valueType = "time"
      expect(rules(timeOfDay)).toContain("capability.waybar-time-of-day")
      const stale = structuredClone(sunTimesBlueprint)
      stale.dataObjects[1]!.fields.push({ name: "Is stale", valueType: "flag", optional: false })
      expect(rules(stale)).toContain("capability.waybar-stale-field")
      const twoLimits = structuredClone(freeSpaceBlueprint)
      twoLimits.features[0]!.thresholds = [{ state: "warning", comparison: "above", value: 1 }]
      expect(rules(twoLimits)).toContain("capability.waybar-thresholds-owner")
      const duplicate = structuredClone(freeSpaceBlueprint)
      duplicate.features[1]!.thresholds = [{ state: "critical", comparison: "below", value: 1 }, { state: "critical", comparison: "below", value: 2 }]
      expect(rules(duplicate)).toContain("capability.waybar-thresholds-duplicate")
      const noLabel = structuredClone(freeSpaceBlueprint)
      noLabel.features[1]!.labelTemplate = ""
      expect(rules(noLabel)).toContain("capability.waybar-label-template")
      const noValue = structuredClone(freeSpaceBlueprint)
      noValue.features[1]!.labelTemplate = "free"
      expect(rules(noValue)).toContain("capability.waybar-label-template")
      expect(rules(freeSpaceBlueprint, "linux-wayland-gtk4-desktop")).toContain("capability.waybar-label")
      expect(rules(freeSpaceBlueprint, "linux-wayland-gtk4-desktop")).toContain("capability.system-source")
    })
  })

  describe("temperature source, click page value, and packaging expectation (audit round 4)", () => {
    const heat = (() => {
      const blueprint = structuredClone(freeSpaceBlueprint)
      blueprint.features[0]!.systemSource = "temperature"
      blueprint.features[1]!.thresholds = [{ state: "warning", comparison: "above", value: 70 }]
      return blueprint
    })()

    it("reads the CPU temperature through one declared source with an overridable sensor directory", async () => {
      expect(rules(heat)).toEqual([])
      const packet = await compilePacket(heat, ID)
      expect(packet.failures).toEqual([])
      const trd = packet.documents["TRD.md"]
      expect(trd).toContain("System source: /sys/class/thermal/thermal_zone*/temp")
      expect(trd).toContain("MODULE_THERMAL_DIR")
      expect(trd).toContain("the highest zone is taken")
      expect(trd).toContain("rounds to the nearest degree")
      expect(trd).toContain("The kit defines exactly these environment variables for the binary test: MODULE_THERMAL_DIR and no other")
      const source = packet.kit.find(file => file.name === "kit/src/platform/system_source.rs")!.content
      expect(source).toContain("pub struct TemperatureReader")
      expect(source).toContain("MODULE_THERMAL_DIR")
      expect(source).not.toContain("fn read_text")
      expect(packet.kit.find(file => file.name === "kit/tests/system_source_tests.rs")!.content).toContain("temperature_is_the_highest_zone_in_celsius")
      const tasks = packet.documents["TASKS.md"]
      expect(tasks).toContain("class with severity_class(value)")
    })

    it("drops reader and threshold boilerplate for a fetch-only product and keeps it when declared", async () => {
      const fetchOnly = (await compilePacket(sunTimesBlueprint, ID)).documents["TASKS.md"]
      expect(fetchOnly).not.toContain("SystemReader")
      expect(fetchOnly).not.toContain("bytes for a size")
      const disk = (await compilePacket(freeSpaceBlueprint, ID)).documents["TASKS.md"]
      expect(disk).toContain("the SystemReader named in the contracts")
      expect(disk).toContain("bytes for a size")
    })

    it("requires {value} in the page of a service a click feature opens for a saved setting", () => {
      expect(rules(airQualityBlueprint)).not.toContain("capability.waybar-page-value")
      const root = structuredClone(airQualityBlueprint)
      root.externalServices[0]!.webPage = "https://example.org/"
      expect(rules(root)).toContain("capability.waybar-page-value")
      const noClick = structuredClone(root)
      noClick.features[2]!.invokedBy = "user-control"
      expect(rules(noClick)).not.toContain("capability.waybar-page-value")
    })

    it("rejects a response field that is a bare time of day", () => {
      const timeOfDay = structuredClone(sunTimesBlueprint)
      timeOfDay.externalServices[0]!.responseFields[0]!.valueType = "time"
      expect(rules(timeOfDay)).toContain("capability.waybar-time-of-day")
    })
  })
})
