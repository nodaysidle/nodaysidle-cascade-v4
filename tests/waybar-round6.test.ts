import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import { PRESETS } from "../src/presets"
import { SYSTEM_SOURCES } from "../src/schema"
import { WAYBAR_SOURCE_OVERRIDES, WAYBAR_SYSTEM_SOURCES } from "../src/waybarContracts"
import { airQualityBlueprint, freeSpaceBlueprint, sunTimesBlueprint } from "./fixtures/waybarSources"

const ID = "linux-hyprland-waybar-module" as const
type Packet = Awaited<ReturnType<typeof compilePacket>>
const kit = (packet: Packet, name: string) => packet.kit.find(file => file.name === `kit/${name}`)?.content ?? ""
const task = (packet: Packet, id: string) => packet.documents["TASKS.md"].split(`### ${id}`)[1]!.split("\n### ")[0]!

function withSource(source: (typeof SYSTEM_SOURCES)[number]) {
  const blueprint = structuredClone(freeSpaceBlueprint)
  blueprint.features[0]!.systemSource = source
  return blueprint
}

describe("Waybar audit round 6", () => {
  it("covers every systemSource value with a kit reader, a TRD source line, units rules, and a wiring description", async () => {
    const sources = SYSTEM_SOURCES.filter(source => source !== "none")
    expect(Object.keys(WAYBAR_SYSTEM_SOURCES).sort()).toEqual([...sources].sort())
    for (const source of sources) {
      const facts = WAYBAR_SYSTEM_SOURCES[source]
      const packet = await compilePacket(withSource(source), ID)
      expect(packet.failures, source).toEqual([])
      const trd = packet.documents["TRD.md"]
      expect(kit(packet, "src/platform/system_source.rs"), `${source} reader`).toContain(`pub struct ${facts.kit}`)
      expect(kit(packet, "tests/system_source_tests.rs"), `${source} tests`).toContain("#[test]")
      expect(trd, `${source} TRD line`).toContain(`System source: ${facts.path}`)
      expect(trd, `${source} reading`).toContain(`the reading is ${facts.reading}`)
      expect(trd.includes("fixed decimal SI"), `${source} units rule`).toBe(facts.sizes)
      expect(packet.kit.map(file => file.name).includes("kit/src/platform/units.rs"), `${source} units.rs`).toBe(facts.sizes)
      const override = WAYBAR_SOURCE_OVERRIDES[source]
      expect(trd, `${source} wiring`).toContain(override ? `${override.env} names ${override.fixture}` : `${facts.path} has no override variable`)
    }
  })

  it("reads swap from SwapTotal and SwapFree, never RAM", async () => {
    const packet = await compilePacket(withSource("swap"), ID)
    const trd = packet.documents["TRD.md"]
    expect(trd).toContain("SwapTotal and SwapFree (kB lines, multiplied by 1024 to bytes)")
    expect(trd).toContain("usedBytes = totalBytes - SwapFree")
    expect(trd).toContain("a file in /proc/meminfo format with SwapTotal and SwapFree lines")
    expect(trd).toContain("a percentage of a total of 0 is 0 percent")
    expect(trd).not.toContain("MemAvailable (kB lines")
    const source = kit(packet, "src/platform/system_source.rs")
    expect(source).toContain("pub fn parse_swapinfo")
    expect(source).toContain("pub struct SwapReader")
    expect(source).toContain("pub fn from_env() -> Self")
    expect(source).toContain('"MODULE_MEMINFO_PATH"')
    expect(source).not.toContain("MemoryReader")
    expect(kit(packet, "tests/system_source_tests.rs")).toContain("swap_reader_reads_the_fixture_file")
    const both = structuredClone(withSource("swap"))
    both.features[1]!.systemSource = "memory"
    const text = kit(await compilePacket(both, ID), "src/platform/system_source.rs")
    expect(text.match(/fn meminfo_bytes/g)).toHaveLength(1)
    expect(text.match(/MEMINFO_PATH_ENV: &str/g)).toHaveLength(1)
  })

  it("tells the provider how to convert an interval and not to invent request parameters", () => {
    const notes = PRESETS[ID].providerNotes!.join("\n")
    expect(notes).toContain("multiply minutes by 60")
    expect(notes).not.toContain("30 minutes is 1800")
    expect(notes).not.toContain("6,250,000 bytes in 5 seconds is 10.0 Mb/s")
    expect(notes).toContain("never write both numbers in one sentence")
    expect(notes).toContain("never invent a parameter")
    expect(notes).toContain("a place name or one saved identifier directly")
    expect(notes).toContain("first element of the list")
    expect(notes).toContain("insert-or-replace")
    expect(notes).toContain("'{value}%'")
    expect(notes).toContain("Show a numeric size example (3.67 GB) only where a surface")
    const androidNotes = PRESETS["android-kotlin-compose"].providerNotes!.join("\n")
    expect(androidNotes).not.toContain("84.50 means 2")
  })

  it("renders a create-only single record as insert-or-replace with no update or delete", async () => {
    const createOnly = structuredClone(sunTimesBlueprint)
    createOnly.features[0]!.dataOperations = [{ data: "Saved city", operations: ["read"] }, { data: "Sunset reading", operations: ["create"] }]
    const trd = (await compilePacket(createOnly, ID)).documents["TRD.md"]
    expect(trd).toContain("create is insert, which on a single record is insert-or-replace")
    expect(trd).toContain("replaces every stored field of the record returned by list()[0] (the highest id), keeping its id")
    expect(trd).toContain("the trait has no update and no delete method")
    const both = (await compilePacket(sunTimesBlueprint, ID)).documents["TRD.md"]
    expect(both).toContain("create is insert, update is update")
    expect(both).not.toContain("insert-or-replace")
  })

  it("documents array and null response values and ships the parse helper", async () => {
    const packet = await compilePacket(sunTimesBlueprint, ID)
    const trd = packet.documents["TRD.md"]
    expect(trd).toContain("Response shape: every response value is read with http::value_at, http::number_at or http::text_at")
    expect(trd).toContain("read from element 0")
    expect(trd).toContain("null, missing, or an empty array is a failed fetch")
    const http = kit(packet, "src/platform/http.rs")
    expect(http).toContain("pub fn value_at")
    expect(http).toContain("pub fn number_at")
    expect(http).toContain("pub fn text_at")
    expect(kit(packet, "tests/http_tests.rs")).toContain("a_scalar_field_reads_element_zero_of_a_one_element_array")
    expect(trd).toContain("'San José' becomes 'San%20Jos%C3%A9'")
    expect(http).toContain("pub fn percent_encode")
    const bare = await compilePacket(freeSpaceBlueprint, ID)
    expect(bare.kit.map(file => file.name)).not.toContain("kit/src/platform/http.rs")
    expect(bare.documents["TRD.md"]).not.toContain("Response shape")
  })

  it("drops the unused click, time, and units boilerplate and states the click and label tests precisely", async () => {
    const air = await compilePacket(airQualityBlueprint, ID)
    const trd = air.documents["TRD.md"]
    expect(trd).not.toContain("a click action that needs the reading reads the stored record")
    expect(trd).not.toContain("Time: an instant")
    expect(air.kit.map(file => file.name)).not.toContain("kit/src/platform/local_time.rs")
    expect(trd).toContain("returns Err (exit 2, nothing is opened) before page_url is called")
    expect(trd).not.toContain("when no value is saved the address is")
    expect(trd).not.toContain("Units and Time rules above")
    expect(task(air, "TASK-07-OPEN-CITY-PAGE-ON-CLICK")).toContain("return Err before calling page_url when none is saved")
    const label = task(air, "TASK-05-AIR-QUALITY-INDEX-DISPLAY")
    expect(label).toContain("asserted in this task through module::refresh_with(cache_path, settings, now, fetch, stored) and module::render_with(settings, cache, now)")
    expect(task(air, "TASK-08-SCHEDULED-INDEX-REFRESH")).toContain("module::interval_seconds(&Settings::default()) == 1200")
    expect(trd).toContain("inside one single test function")
    const sun = await compilePacket(sunTimesBlueprint, ID)
    expect(sun.documents["TRD.md"]).toContain("Time: an instant")
    expect(sun.kit.map(file => file.name)).toContain("kit/src/platform/local_time.rs")
    const readsRecord = structuredClone(sunTimesBlueprint)
    readsRecord.features[1]!.invokedBy = "click"
    expect((await compilePacket(readsRecord, ID)).documents["TRD.md"]).toContain("a click action that needs the reading reads the stored record")
  })
})
