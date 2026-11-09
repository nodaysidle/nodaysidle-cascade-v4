import { describe, expect, it } from "vitest"
import { DOCUMENT_NAMES, compilePacket } from "../src/compiler"
import { PRESETS, PRESET_IDS } from "../src/presets"
import { fixtureCases } from "./fixtures/blueprints"

describe("v4 deterministic core", () => {
  it("exposes only the approved presets", () => {
    expect([...PRESET_IDS]).toEqual([
      "linux-wayland-gtk4-desktop",
      "linux-hyprland-waybar-module",
      "tauri2-rust-typescript-desktop",
      "astro-web",
      "android-kotlin-compose",
    ])
    for (const id of PRESET_IDS) expect(PRESETS[id].label.length).toBeGreaterThan(0)
  })

  it.each(fixtureCases)("$presetId / $blueprint.productName reaches Gate Clean", async ({ presetId, blueprint }) => {
    const packet = await compilePacket(blueprint, presetId)
    expect(packet.failures).toEqual([])
    expect(packet.exportable).toBe(true)
    expect(Object.keys(packet.documents)).toEqual([...DOCUMENT_NAMES])
    for (const name of DOCUMENT_NAMES) expect(packet.documents[name].length).toBeGreaterThan(200)
    expect(packet.ledger.every(entry => entry.status === "pass")).toBe(true)
  })

  it("is byte-identical across repeated renders", async () => {
    const fixture = fixtureCases[0]!
    const first = await compilePacket(fixture.blueprint, fixture.presetId)
    const second = await compilePacket(fixture.blueprint, fixture.presetId)
    for (const name of DOCUMENT_NAMES) expect(first.documents[name]).toBe(second.documents[name])
    expect(first.hashes).toEqual(second.hashes)
  })

  it("ships the GTK and Waybar kits", async () => {
    const gtk = fixtureCases.find(item => item.presetId === "linux-wayland-gtk4-desktop")!
    const waybar = fixtureCases.find(item => item.presetId === "linux-hyprland-waybar-module")!
    const gtkPacket = await compilePacket(gtk.blueprint, gtk.presetId)
    const waybarPacket = await compilePacket(waybar.blueprint, waybar.presetId)
    expect(gtkPacket.kit.map(file => file.name)).toContain("kit/Cargo.toml")
    expect(gtkPacket.kit.map(file => file.name)).toContain("kit/PKGBUILD")
    expect(waybarPacket.kit.map(file => file.name)).toContain("kit/resources/waybar/config.jsonc")
    expect(waybarPacket.kit.map(file => file.name)).toContain("kit/resources/waybar/style.css")
  })
})
