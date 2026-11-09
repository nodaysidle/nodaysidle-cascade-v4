import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import { exportPacketTo } from "../src/bridge"
import { DOCUMENT_NAMES, compilePacket } from "../src/compiler"
import { PRESETS, PRESET_IDS } from "../src/presets"
import { bareWaybarBlueprint, fixtureCases } from "./fixtures/blueprints"

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

  it("ships Waybar platform helpers and stack entries only for declared storage, secrets, and services", async () => {
    const waybarBlueprints = [...fixtureCases.filter(item => item.presetId === "linux-hyprland-waybar-module").map(item => item.blueprint), bareWaybarBlueprint]
    for (const blueprint of waybarBlueprints) {
      const packet = await compilePacket(blueprint, "linux-hyprland-waybar-module")
      const names = packet.kit.map(file => file.name)
      const text = (name: string) => packet.kit.find(file => file.name === name)?.content ?? ""
      const cargo = text("kit/Cargo.toml")
      const mod = text("kit/src/platform/mod.rs")
      const stackText = `${packet.documents["TRD.md"]}\n${packet.documents["AGENTS.md"]}`
      for (const [file, dep, stack] of [["sqlite", "rusqlite", "rusqlite"], ["credentials", "keyring", "keyring (Secret Service)"], ["http", "reqwest", "reqwest with rustls"]] as const) {
        const shipped = names.includes(`kit/src/platform/${file}.rs`)
        expect(cargo.includes(`${dep} =`), `${blueprint.productName} cargo ${dep}`).toBe(shipped)
        expect(mod.includes(`pub mod ${file};`), `${blueprint.productName} mod ${file}`).toBe(shipped)
        expect(stackText.includes(stack), `${blueprint.productName} stack ${stack}`).toBe(shipped)
      }
      expect(text("kit/tests/contract_tests.rs").includes("platform::sqlite")).toBe(names.includes("kit/src/platform/sqlite.rs"))
      expect(names).toContain("kit/src/platform/atomic_file.rs")
    }
    const bare = await compilePacket(bareWaybarBlueprint, "linux-hyprland-waybar-module")
    expect(bare.kit.map(file => file.name).some(name => /platform\/(sqlite|credentials|http)\.rs$/.test(name))).toBe(false)
  })

  it("renders create and modify file lists as separate sentences", async () => {
    const waybar = fixtureCases.find(item => item.presetId === "linux-hyprland-waybar-module")!
    const packet = await compilePacket(waybar.blueprint, waybar.presetId)
    expect(packet.documents["TASKS.md"]).toContain("Create only these files: ")
    expect(packet.documents["TASKS.md"]).not.toContain("after its foundation creation")
  })

  it("keeps Rust kit files rustfmt-clean for short and long project names", async () => {
    const probe = spawnSync("rustfmt", ["--version"])
    if (probe.status !== 0) return
    for (const presetId of ["linux-wayland-gtk4-desktop", "linux-hyprland-waybar-module", "tauri2-rust-typescript-desktop"] as const) {
      const fixture = fixtureCases.find(item => item.presetId === presetId)!
      for (const projectName of ["Tide Tick", "Aq", "Quarterly Archive Reconciliation Workbench"]) {
        const packet = await compilePacket({ ...fixture.blueprint, productName: projectName }, presetId)
        const root = mkdtempSync(join(tmpdir(), "cascade-fmt-"))
        try {
          for (const file of packet.kit) {
            const path = join(root, file.name)
            mkdirSync(dirname(path), { recursive: true })
            writeFileSync(path, file.content)
          }
          const rust = packet.kit.filter(file => file.name.endsWith(".rs"))
          const edition = presetId === "tauri2-rust-typescript-desktop" ? "2021" : "2024"
          const result = spawnSync("rustfmt", ["--check", "--edition", edition, ...rust.map(file => join(root, file.name))], { encoding: "utf8" })
          expect(result.status, `${presetId} / ${projectName}\n${result.stdout}`).toBe(0)
        } finally {
          rmSync(root, { recursive: true, force: true })
        }
      }
    }
  })

  it("keeps the Astro kit buildable without the native sharp binary", async () => {
    const astro = fixtureCases.find(item => item.presetId === "astro-web")!
    const packet = await compilePacket(astro.blueprint, astro.presetId)
    expect(packet.kit.find(file => file.name === "kit/astro.config.mjs")?.content).toContain("astro/assets/services/noop")
  })

  it("renders runnable Rust test targets and a single-bullet screen map", async () => {
    for (const presetId of ["linux-wayland-gtk4-desktop", "linux-hyprland-waybar-module", "tauri2-rust-typescript-desktop"] as const) {
      const fixture = fixtureCases.find(item => item.presetId === presetId)!
      const packet = await compilePacket(fixture.blueprint, presetId)
      const tasks = packet.documents["TASKS.md"]
      for (const match of tasks.matchAll(/--test ([A-Za-z0-9_-]+)/g)) {
        expect(tasks, `${presetId}: no file for cargo test target ${match[1]}`).toMatch(new RegExp(`tests/${match[1]}\\.rs`))
      }
      expect(packet.documents["PRD.md"]).not.toContain("- - ")
    }
  })

  it("cuts the GTK metainfo summary at a word boundary", async () => {
    const gtk = fixtureCases.find(item => item.presetId === "linux-wayland-gtk4-desktop")!
    const packet = await compilePacket(gtk.blueprint, gtk.presetId)
    const metainfo = packet.kit.find(file => file.name.endsWith(".metainfo.xml"))!.content
    const summary = /<summary>(.*)<\/summary>/.exec(metainfo)![1]!
    expect(summary.length).toBeLessThanOrEqual(80)
    expect(blueprintSentenceStarts(gtk.blueprint.summary, summary)).toBe(true)
  })

  it("keeps GTK file rules generic, with no Downloads or move logic", async () => {
    const gtk = fixtureCases.find(item => item.presetId === "linux-wayland-gtk4-desktop")!
    const packet = await compilePacket(gtk.blueprint, gtk.presetId)
    const everything = [...Object.values(packet.documents), ...packet.kit.map(file => file.content)].join("\n")
    expect(everything).not.toMatch(/Downloads|EXDEV|named_folder/)
  })

  it("desktop export writes the same blueprint.json manifest the CLI verifies", async () => {
    const fixture = fixtureCases.find(item => item.presetId === "linux-wayland-gtk4-desktop")!
    const packet = await compilePacket(fixture.blueprint, fixture.presetId)
    let sent: { name: string; content: string }[] = []
    await exportPacketTo("/unused", packet, async <T,>(_command: string, args?: Record<string, unknown>) => {
      sent = (args as { files: { name: string; content: string }[] }).files
      return "/unused/out" as T
    }, { blueprint: fixture.blueprint, presetId: fixture.presetId, options: {} })
    const manifest = JSON.parse(sent.find(file => file.name === "blueprint.json")!.content)
    expect(manifest.schema).toBe("nodaysidle.cascade.packet.v4")
    expect(manifest.preset.id).toBe(fixture.presetId)
    expect(manifest.blueprint.productName).toBe(fixture.blueprint.productName)
    expect(Object.keys(manifest.documents)).toEqual([...DOCUMENT_NAMES])
    expect(manifest.kit.length).toBe(packet.kit.length)
    expect(manifest.validation.status).toBe("pass")
  })
})

function blueprintSentenceStarts(text: string, summary: string): boolean {
  return text.startsWith(summary.replace(/&amp;/g, "&")) || text.replace(/\s+/g, " ").includes(summary.replace(/&amp;/g, "&"))
}
