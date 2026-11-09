import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import { exportPacketTo } from "../src/bridge"
import { DOCUMENT_NAMES, compilePacket } from "../src/compiler"
import { auditPacket } from "../src/audit"
import { auditSemanticIntake } from "../src/schema"
import { PRESETS, PRESET_IDS } from "../src/presets"
import { bareGtkBlueprint, bareWaybarBlueprint, fixtureCases } from "./fixtures/blueprints"

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

  it("ships Rust platform helpers and stack entries only for declared storage, secrets, and services", async () => {
    const cases = [
      ...fixtureCases.filter(item => item.presetId === "linux-hyprland-waybar-module" || item.presetId === "linux-wayland-gtk4-desktop"),
      { presetId: "linux-hyprland-waybar-module" as const, blueprint: bareWaybarBlueprint },
      { presetId: "linux-wayland-gtk4-desktop" as const, blueprint: bareGtkBlueprint },
    ]
    for (const { presetId, blueprint } of cases) {
      const packet = await compilePacket(blueprint, presetId)
      const names = packet.kit.map(file => file.name)
      const text = (name: string) => packet.kit.find(file => file.name === name)?.content ?? ""
      const cargo = text("kit/Cargo.toml")
      const mod = text("kit/src/platform/mod.rs")
      const stackText = `${packet.documents["TRD.md"]}\n${packet.documents["AGENTS.md"]}`
      for (const [file, dep, stack] of [["sqlite", "rusqlite", "rusqlite"], ["credentials", "keyring", "keyring (Secret Service)"], ["http", "reqwest", "reqwest with rustls"]] as const) {
        const shipped = names.includes(`kit/src/platform/${file}.rs`)
        const label = `${presetId} ${blueprint.productName}`
        expect(cargo.includes(`${dep} =`), `${label} cargo ${dep}`).toBe(shipped)
        expect(mod.includes(`pub mod ${file};`), `${label} mod ${file}`).toBe(shipped)
        expect(stackText.includes(stack), `${label} stack ${stack}`).toBe(shipped)
      }
      expect(text("kit/tests/contract_tests.rs").includes("platform::sqlite")).toBe(names.includes("kit/src/platform/sqlite.rs"))
      expect(names).toContain("kit/src/platform/atomic_file.rs")
    }
    for (const [presetId, blueprint] of [["linux-hyprland-waybar-module", bareWaybarBlueprint], ["linux-wayland-gtk4-desktop", bareGtkBlueprint]] as const) {
      const bare = await compilePacket(blueprint, presetId)
      expect(bare.kit.map(file => file.name).some(name => /platform\/(sqlite|credentials|http)\.rs$/.test(name))).toBe(false)
    }
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

  it("orders features by buildsOn, rejects bad build references, and requires stored fields", async () => {
    const base = fixtureCases.find(item => item.presetId === "linux-wayland-gtk4-desktop")!.blueprint
    const [first, second, third] = base.features
    const ordered = { ...base, features: [{ ...first!, buildsOn: [third!.name] }, { ...second!, buildsOn: [] }, { ...third!, buildsOn: [] }] }
    const packet = await compilePacket(ordered, "linux-wayland-gtk4-desktop")
    const tasks = packet.documents["TASKS.md"]
    expect(tasks.indexOf("### TASK-")).toBeGreaterThan(-1)
    const order = [...tasks.matchAll(/^### (TASK-\d+-[A-Z0-9-]+)/gm)].map(match => match[1]!)
    const position = (name: string) => order.findIndex(id => id.endsWith(name.toUpperCase().replaceAll(" ", "-")))
    expect(position(third!.name)).toBeLessThan(position(first!.name))
    const unknown = auditSemanticIntake({ ...base, features: [{ ...first!, buildsOn: ["No such feature"] }, second!, third!] })
    expect(unknown.map(issue => issue.rule)).toContain("semantic.unknown-build-dependency")
    const cycle = auditSemanticIntake({ ...base, features: [{ ...first!, buildsOn: [second!.name] }, { ...second!, buildsOn: [first!.name] }, third!] })
    expect(cycle.map(issue => issue.rule)).toContain("semantic.build-dependency-cycle")
    const noFields = auditSemanticIntake({ ...base, dataObjects: base.dataObjects.map(item => ({ ...item, fields: [] })) })
    expect(noFields.map(issue => issue.rule)).toContain("semantic.missing-data-fields")
  })

  it("renders stored fields and operations, and promises deletion only when a feature declares it", async () => {
    const base = fixtureCases.find(item => item.presetId === "linux-wayland-gtk4-desktop")!.blueprint
    const records = base.dataObjects.find(item => item.storage === "records")!
    const usesRecords = (feature: (typeof base.features)[number]) => feature.usesData.some(name => name.toLowerCase() === records.name.toLowerCase())
    const withOps = (operations: ("create" | "read" | "update" | "delete")[]) => ({
      ...base,
      dataObjects: base.dataObjects.map(item => item === records ? { ...item, fields: [{ name: "Recipe name", valueType: "text" as const, optional: false }, { name: "Steps", valueType: "text-list" as const, optional: false }] } : item),
      features: base.features.map(feature => usesRecords(feature) ? { ...feature, dataOperations: operations } : feature),
    })
    const without = await compilePacket(withOps(["create", "read"]), "linux-wayland-gtk4-desktop")
    const trd = without.documents["TRD.md"]
    expect(trd).toContain("Recipe name (short text); Steps (ordered list of text lines)")
    expect(trd).toContain("Store operations, exactly these and no others: create (")
    expect(trd).toContain(`No feature deletes ${records.name}`)
    const withDelete = await compilePacket(withOps(["create", "read", "delete"]), "linux-wayland-gtk4-desktop")
    expect(withDelete.documents["TRD.md"]).not.toContain(`No feature deletes ${records.name}`)
    expect(withDelete.documents["TRD.md"]).toContain("only through the feature that declares delete")
  })

  it("blocks export when the documents disagree in ways an agent cannot work around", async () => {
    const fixture = fixtureCases.find(item => item.presetId === "linux-wayland-gtk4-desktop")!
    const packet = await compilePacket(fixture.blueprint, fixture.presetId)
    const preset = PRESETS[fixture.presetId]
    const rules = (documents: Record<string, string>) => auditPacket(packet.graph, documents, preset).map(item => item.rule)
    const clean = { ...packet.documents } as Record<string, string>
    expect(rules(clean)).not.toEqual(expect.arrayContaining(["agent-ready.shared-files"]))
    const noSharedLines = { ...clean, "AGENTS.md": clean["AGENTS.md"]!.replace(/^- Shared file .*\n/gm, "") }
    expect(rules(noSharedLines)).toContain("agent-ready.shared-files")
    const twoSettings = { ...clean, "TRD.md": `${clean["TRD.md"]}\n- Settings: $XDG_CONFIG_HOME/${packet.graph.identity.bundleId}/other.json.` }
    expect(rules(twoSettings)).toContain("agent-ready.settings-name")
    const wrongDesktop = { ...clean, "TRD.md": `${clean["TRD.md"]}\n- File: resources/${packet.projectSlug}.desktop` }
    expect(rules(wrongDesktop)).toContain("agent-ready.desktop-id")
    const badLaunch = { ...clean, "TRD.md": `${clean["TRD.md"]}\n- Launch: GDK_BACKEND=wayland ./scripts/package.sh --install` }
    expect(rules(badLaunch)).toContain("agent-ready.launch-env")
    const promisedDelete = { ...clean, "TRD.md": `${clean["TRD.md"]}\n- Deletion: Delete Recipe only through an explicit user action.` }
    expect(rules(promisedDelete)).toContain("agent-ready.unrequested-delete")
  })

  it("tells exactly one windowed feature task to build the main window and shared view state", async () => {
    for (const presetId of ["linux-wayland-gtk4-desktop", "tauri2-rust-typescript-desktop", "android-kotlin-compose"] as const) {
      const fixture = fixtureCases.find(item => item.presetId === presetId)!
      const packet = await compilePacket(fixture.blueprint, presetId)
      const hits = packet.documents["TASKS.md"].match(/You are the first main-surface task/g) ?? []
      expect(hits.length, presetId).toBe(1)
    }
    for (const presetId of ["linux-hyprland-waybar-module", "astro-web"] as const) {
      const fixture = fixtureCases.find(item => item.presetId === presetId)!
      const packet = await compilePacket(fixture.blueprint, presetId)
      expect(packet.documents["TASKS.md"]).not.toContain("first main-surface task")
    }
  })

  it("requires service endpoints and renders declared schedules, endpoints, and optional fields", async () => {
    const base = fixtureCases.find(item => item.presetId === "linux-hyprland-waybar-module")!.blueprint
    const service = base.externalServices[0]!
    const noEndpoint = auditSemanticIntake({ ...base, externalServices: [{ ...service, endpoint: "", responseFields: [] }] })
    expect(noEndpoint.map(issue => issue.rule)).toEqual(expect.arrayContaining(["semantic.missing-service-endpoint", "semantic.missing-service-response"]))
    const withSchedule = {
      ...base,
      externalServices: [{ ...service, endpoint: "https://api.open-meteo.com/v1/forecast", responseFields: [{ name: "Temperature", valueType: "number" as const, optional: true }] }],
      features: base.features.map((feature, index) => index === 0 ? { ...feature, runsEverySeconds: 1800 } : feature),
    }
    const packet = await compilePacket(withSchedule, "linux-hyprland-waybar-module")
    const trd = packet.documents["TRD.md"]
    expect(trd).toContain("runs by itself every 1800 seconds")
    expect(trd).toContain("Endpoint: https://api.open-meteo.com/v1/forecast")
    expect(trd).toContain("Temperature (number, optional)")
    const both = auditSemanticIntake({ ...base, features: base.features.map((feature, index) => index === 0 ? { ...feature, runsEverySeconds: 60, runsDailyAt: "09:00" } : feature) })
    expect(both.map(issue => issue.rule)).toContain("semantic.two-schedules")
  })
})

function blueprintSentenceStarts(text: string, summary: string): boolean {
  return text.startsWith(summary.replace(/&amp;/g, "&")) || text.replace(/\s+/g, " ").includes(summary.replace(/&amp;/g, "&"))
}
