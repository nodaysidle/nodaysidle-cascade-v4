import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import { SYSTEM_SOURCES } from "../src/schema"
import { waybarSourceDetail } from "../src/waybarContracts"
import { allSourcesBlueprint } from "./fixtures/waybarSources"

const ID = "linux-hyprland-waybar-module" as const

// Every file or call each system source reads; the source line must name each one and the kit must read it.
const READS: Record<string, { named: string[]; kit: string[] }> = {
  "network-received": { named: ["/proc/net/dev"], kit: ["NET_DEV_PATH"] },
  "network-sent": { named: ["/proc/net/dev"], kit: ["NET_DEV_PATH"] },
  "load-average": { named: ["/proc/loadavg"], kit: ["/proc/loadavg"] },
  memory: { named: ["/proc/meminfo"], kit: ["MEMINFO_PATH"] },
  swap: { named: ["/proc/meminfo"], kit: ["MEMINFO_PATH"] },
  battery: { named: ["BAT*/capacity", "BAT*/status"], kit: ['file("capacity")', 'file("status")'] },
  temperature: { named: ["thermal_zone*/temp"], kit: ['join("temp")'] },
  "disk-space": { named: ['statvfs("/")'], kit: ["statvfs"] },
  "disk-read": { named: ["/proc/diskstats", "MODULE_DISKSTATS_PATH"], kit: ["DISKSTATS_PATH_ENV", "parse_disk_read"] },
}

describe("system source lines name every file they read", () => {
  it("covers every declared systemSource", async () => {
    const sources = SYSTEM_SOURCES.filter(source => source !== "none")
    expect(Object.keys(READS).sort()).toEqual([...sources].sort())
    const packet = await compilePacket(allSourcesBlueprint, ID)
    const kit = packet.kit.find(file => file.name === "kit/src/platform/system_source.rs")!.content
    for (const source of sources) {
      const line = waybarSourceDetail(source).join(" ")
      for (const name of READS[source]!.named) expect(line, `${source} names ${name}`).toContain(name)
      for (const code of READS[source]!.kit) expect(kit, `${source} kit reads ${code}`).toContain(code)
      expect(line).toContain("A failed read is a failed refresh")
    }
  })

  it("states the battery fields, the status mapping, the absent battery, and the override", async () => {
    const line = waybarSourceDetail("battery").join(" ")
    expect(line).toContain("charge_percent is the whole number in BAT*/capacity")
    expect(line).toContain("charging_state is the text in BAT*/status")
    for (const mapped of ["charging (Charging)", "discharging (Discharging)", "full (Full)", "not charging (Not charging)", "unknown (Unknown"]) expect(line).toContain(mapped)
    expect(line).toContain("With no BAT* supply")
    expect(line).toContain("MODULE_POWER_SUPPLY_DIR")
    const packet = await compilePacket(allSourcesBlueprint, ID)
    const kit = packet.kit.find(file => file.name === "kit/src/platform/system_source.rs")!.content
    expect(kit).toContain("pub struct BatteryReading")
    expect(kit).toContain("pub fn parse_status")
    expect(packet.documents["TRD.md"]).toContain("MODULE_POWER_SUPPLY_DIR")
  })
})
