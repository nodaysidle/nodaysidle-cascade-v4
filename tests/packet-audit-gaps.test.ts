import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import { SYSTEM_SOURCES } from "../src/schema"
import type { SemanticBlueprint } from "../src/schema"
import { freeSpaceBlueprint } from "./fixtures/waybarSources"

type Packet = Awaited<ReturnType<typeof compilePacket>>
const WAYBAR = "linux-hyprland-waybar-module" as const
const TAURI = "tauri2-rust-typescript-desktop" as const
const kitFile = (packet: Packet, name: string): string => packet.kit.find(file => file.name === `kit/${name}`)?.content ?? ""
const blocks = (packet: Packet): string[] => packet.documents["TASKS.md"].split("### ")
const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as SemanticBlueprint

function withSource(source: (typeof SYSTEM_SOURCES)[number]) {
  const blueprint = structuredClone(freeSpaceBlueprint)
  blueprint.features[0]!.systemSource = source
  return blueprint
}

describe("Waybar acceptance figures", () => {
  it("states that meminfo figures are bytes injected through the reader double", async () => {
    const swap = await compilePacket(withSource("swap"), WAYBAR)
    const memory = await compilePacket(withSource("memory"), WAYBAR)
    const loadAverage = await compilePacket(withSource("load-average"), WAYBAR)
    expect(swap.documents["TRD.md"]).toContain("Acceptance figures: a number an acceptance criterion gives for SwapTotal or SwapFree is a byte count")
    expect(swap.documents["TRD.md"]).toContain("SwapUse { total_bytes: SwapTotal, used_bytes: SwapTotal - SwapFree }")
    expect(memory.documents["TRD.md"]).toContain("MemoryUse { total_bytes: MemTotal, used_bytes: MemTotal - MemAvailable }")
    expect(loadAverage.documents["TRD.md"]).not.toContain("Acceptance figures:")
    expect(swap.documents["TRD.md"]).toContain("A failed read is a failed refresh.")
    for (const packet of [swap, memory, loadAverage]) expect(packet.failures).toEqual([])
  })
})

describe("Tauri success message", () => {
  it("gives a stated success message the status host", async () => {
    const packet = await compilePacket(load("tauri-contact-book-csv.json"), TAURI)
    const save = blocks(packet).find(block => block.includes("save() of @tauri-apps/plugin-dialog")) ?? ""
    const first = blocks(packet).find(block => block.includes("You are the first main-surface task")) ?? ""
    expect(save).toContain('mount it into slots.host("status") from src/main.ts with slots.mount')
    expect(save).toContain("it never goes through errors.show")
    expect(first).toContain("never replace or clear the other children of that host")
    expect(packet.failures).toEqual([])
  })
})

describe("Tauri building blocks", () => {
  it("ships field, panel and multilineText and says no task edits the stylesheet", async () => {
    const packet = await compilePacket(load("tauri-contact-book-csv.json"), TAURI)
    const ui = kitFile(packet, "src/ui.ts")
    for (const name of ["field", "panel", "multilineText"]) expect(ui).toContain(`export const ${name}`)
    expect(kitFile(packet, "src/style.css")).toContain(".pre-wrap { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }")
    expect(kitFile(packet, "tests/ui.test.ts")).toContain("multilineText(")
    if (!ui.includes("settingsGroup")) expect(kitFile(packet, "tests/ui.test.ts")).not.toContain("settingsGroup")
    expect(kitFile(packet, "README.md")).toContain("multilineText(text)")
    expect(kitFile(packet, "README.md")).toContain("No task edits src/style.css")
    const save = blocks(packet).find(block => block.includes("save() of @tauri-apps/plugin-dialog")) ?? ""
    const first = blocks(packet).find(block => block.includes("You are the first main-surface task")) ?? ""
    expect(save).toContain("no task edits src/style.css")
    expect(first).toContain("no task edits src/style.css")
  })
})
