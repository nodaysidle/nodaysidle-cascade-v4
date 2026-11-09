import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import { exportPacketTo } from "../src/bridge"
import { DOCUMENT_NAMES, compilePacket } from "../src/compiler"
import { auditPacket } from "../src/audit"
import { auditCapabilities } from "../src/capabilities"
import { auditSemanticIntake } from "../src/schema"
import { PRESETS, PRESET_IDS } from "../src/presets"
import { bareGtkBlueprint, bareWaybarBlueprint, fixtureCases, tidePageBlueprint, tideTickBlueprint } from "./fixtures/blueprints"

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

  describe("Waybar module agent-readiness", () => {
    const text = (packet: Awaited<ReturnType<typeof compilePacket>>, name: string) => packet.kit.find(file => file.name === `kit/${name}`)?.content ?? ""
    const waybarStack = (trd: string) => trd.split("## Locked Stack")[1]!.split("\n## ")[0]!.split("\n").filter(line => line.startsWith("- ")).map(line => line.slice(2).toLowerCase())

    it("takes the kit refresh default from the declared schedule and keeps the two intervals apart", async () => {
      const tide = await compilePacket(tideTickBlueprint, "linux-hyprland-waybar-module")
      expect(text(tide, "src/config.rs")).toContain("refresh_seconds: 1800")
      expect(text(tide, "tests/contract_tests.rs")).toContain("refresh_seconds, 1800")
      expect(text(tide, "src/config.rs")).not.toContain("900")
      const glance = fixtureCases.find(item => item.blueprint.productName === "Forecast Glance")!
      const unscheduled = await compilePacket(glance.blueprint, glance.presetId)
      expect(text(unscheduled, "src/config.rs")).toContain("refresh_seconds: 900")
      for (const packet of [tide, unscheduled]) {
        const all = Object.values(packet.documents).join("\n")
        expect(all).not.toContain("service default is 900")
        expect(packet.documents["TRD.md"]).toContain("how often Waybar re-runs the exec path to re-read the cache")
      }
      const withOptions = await compilePacket(tideTickBlueprint, "linux-hyprland-waybar-module", { refreshSeconds: "60" })
      const options = withOptions.documents["TRD.md"].split("### CON-PRESET-OPTIONS")[1]!.split("\n### ")[0]!
      expect(options).toContain("not the service refresh cadence")
      expect(text(withOptions, "resources/waybar/config.jsonc")).toContain('"interval": 60')
      expect(text(withOptions, "src/config.rs")).toContain("refresh_seconds: 1800")
      expect(tide.documents["TASKS.md"]).toContain("Tide refresh runs every 1800 seconds: take that interval and the current time as parameters")
      expect(unscheduled.documents["TASKS.md"]).not.toContain("take that interval and the current time as parameters")
    })

    it("ships a coherent module base with a defined action vocabulary and named hook owners", async () => {
      const tide = await compilePacket(tideTickBlueprint, "linux-hyprland-waybar-module")
      const module = text(tide, "src/module.rs")
      for (const name of ["pub fn render_with", "pub fn fetch_output", "pub fn click", "pub fn run_service", "pub const STALE_SUFFIX", "ACTIONS"]) expect(module).toContain(name)
      expect(module).not.toContain("{}: {}")
      expect(text(tide, "README.md")).toContain("--action click")
      expect(tide.documents["TRD.md"]).toContain("--action click or --action refresh")
      const tasks = tide.documents["TASKS.md"]
      expect(tasks).toContain("fetch_output (the refresh loop body) is replaced by TASK-06-TIDE-REFRESH")
      expect(tasks).toContain("click (the --action click body) is replaced by TASK-07-TIDE-TABLE-LINK")
      const fragment = text(tide, "resources/waybar/config.jsonc")
      expect(fragment).toContain("--action click")
      expect(fragment).not.toMatch(/on-click-(right|middle)|on-scroll/)
      const glance = fixtureCases.find(item => item.blueprint.productName === "Forecast Glance")!
      const bare = await compilePacket(glance.blueprint, glance.presetId)
      expect(text(bare, "resources/waybar/config.jsonc")).not.toContain("on-click")
      expect(bare.documents["TASKS.md"]).toContain("click (the --action click body) is replaced by no task")
    })

    it("states one source-of-truth rule and implements --set for declared settings", async () => {
      const tide = await compilePacket(tideTickBlueprint, "linux-hyprland-waybar-module")
      for (const name of ["TRD.md", "ARD.md"] as const) {
        const rule = tide.documents[name].match(/persisted records \(/g) ?? []
        expect(rule, name).toHaveLength(1)
        expect(tide.documents[name]).toContain("derived render of the final label text")
      }
      expect(text(tide, "src/config.rs")).toContain('SETTING_KEYS: &[&str] = &["harbor_name"]')
      expect(text(tide, "src/config.rs")).toContain("pub fn set_pair")
      expect(text(tide, "src/main.rs")).toContain("config::set_pair")
      expect(tide.documents["TRD.md"]).toContain("--set KEY=VALUE")
    })

    it("lists only locked-stack dependencies in Cargo.toml and a reasoned PKGBUILD depends", async () => {
      for (const item of fixtureCases.filter(entry => entry.presetId === "linux-hyprland-waybar-module")) {
        const packet = await compilePacket(item.blueprint, item.presetId)
        const stack = waybarStack(packet.documents["TRD.md"])
        const cargo = text(packet, "Cargo.toml")
        const dependencies = [...cargo.matchAll(/^([a-z0-9_-]+) = /gm)].map(match => match[1]!).filter(name => !["name", "version", "edition", "rust-version"].includes(name))
        expect(dependencies.length).toBeGreaterThan(4)
        for (const name of dependencies) expect(stack.some(entry => entry.includes(name.replace("_", "_"))), `${item.blueprint.productName}: ${name} not in locked stack`).toBe(true)
        expect(cargo).not.toContain("tracing")
        const secrets = text(packet, "src/platform/mod.rs").includes("credentials")
        expect(text(packet, "PKGBUILD").includes("depends=('dbus')"), item.blueprint.productName).toBe(secrets)
      }
    })

    it("names real task ids in the kit README and packages dist, the installed unit, and the Arch fragment path", async () => {
      const tide = await compilePacket(tideTickBlueprint, "linux-hyprland-waybar-module")
      for (const id of text(tide, "README.md").match(/TASK-\d+(?:-[A-Z-]+)?/g) ?? []) expect(tide.documents["TASKS.md"]).toContain(`### ${id}`)
      const script = text(tide, "scripts/package.sh")
      expect(script).toContain('cp "target/release/tide-tick" "dist/tide-tick"')
      expect(script).toContain('systemctl --user enable --now "tide-tick.service"')
      expect(text(tide, "PKGBUILD")).toContain("sed 's|~/.local/bin|/usr/bin|g'")
      expect(tide.documents["TRD.md"]).toContain("Artifact path: dist/tide-tick")
    })

    it("drops window-oriented boilerplate for Waybar only", async () => {
      const tide = await compilePacket(tideTickBlueprint, "linux-hyprland-waybar-module")
      const docs = Object.values(tide.documents).join("\n")
      for (const phrase of ["screenshot of every window", "empty list shows one centered message", "settings are grouped rows", "after the main window closes", "PermissionCoordinator"]) expect(docs, phrase).not.toContain(phrase)
      expect(tide.documents["TASKS.md"]).not.toContain("TASK-04-PERMISSION-COORDINATOR")
      expect(docs).toContain("jq -e")
      expect(docs).toContain("STALE_SUFFIX")
      const gtk = fixtureCases.find(item => item.presetId === "linux-wayland-gtk4-desktop")!
      const gtkPacket = await compilePacket(gtk.blueprint, gtk.presetId)
      expect(gtkPacket.documents["TRD.md"]).toContain("screenshot of every window")
    })
  })

  describe("Waybar click, classes, persistence, and validation order", () => {
    const text = (packet: Awaited<ReturnType<typeof compilePacket>>, name: string) => packet.kit.find(file => file.name === `kit/${name}`)?.content ?? ""
    const task = (packet: Awaited<ReturnType<typeof compilePacket>>, id: string) => packet.documents["TASKS.md"].split(`### ${id}`)[1]!.split("\n### ")[0]!

    it("gives the click feature the click hook and the fragment binding, and none when no feature clicks", async () => {
      const tide = await compilePacket(tideTickBlueprint, "linux-hyprland-waybar-module")
      expect(text(tide, "resources/waybar/config.jsonc")).toContain('"on-click": "~/.local/bin/tide-tick --action click"')
      expect(task(tide, "TASK-01-FOUNDATION")).toContain("click (the --action click body) is replaced by TASK-07-TIDE-TABLE-LINK")
      expect(task(tide, "TASK-07-TIDE-TABLE-LINK")).toContain("click-action owner")
      expect(tide.documents["TRD.md"]).toContain("only when a feature declares invokedBy click")
      const bare = await compilePacket(bareWaybarBlueprint, "linux-hyprland-waybar-module")
      expect(text(bare, "resources/waybar/config.jsonc")).not.toContain("on-click")
      expect(task(bare, "TASK-01-FOUNDATION")).toContain("no feature declares invokedBy click")
    })

    it("documents one class vocabulary with colours and one stale rule", async () => {
      const tide = await compilePacket(tideTickBlueprint, "linux-hyprland-waybar-module")
      const css = text(tide, "resources/waybar/style.css")
      for (const name of ["warning", "critical", "stale", "empty"]) expect(css).toContain(`#custom-tide-tick.${name}`)
      const module = text(tide, "src/module.rs")
      expect(module).toContain("pub const THRESHOLDS: &[Threshold] = &[];")
      expect(module).not.toContain("WARNING_ABOVE")
      const trd = tide.documents["TRD.md"]
      expect(trd).toContain("exactly one of normal, warning, critical, stale, empty")
      expect(trd).toContain("stale wins over warning and critical")
      expect(task(tide, "TASK-06-TIDE-REFRESH")).toContain("none are declared, so the class is always normal")
      expect(task(tide, "TASK-06-TIDE-REFRESH")).toContain("the kit default of Settings.text; do not change it")
      expect(text(tide, "src/config.rs")).toContain('text: String::from("--")')
      expect(task(tide, "TASK-06-TIDE-REFRESH")).toContain("Modify only these files")
      expect(task(tide, "TASK-06-TIDE-REFRESH")).toContain("src/config.rs")
    })

    it("installs the binary before systemd-analyze verify runs", async () => {
      const tide = await compilePacket(tideTickBlueprint, "linux-hyprland-waybar-module")
      const gates = tide.documents["TASKS.md"].match(/Final Validation Commands[\s\S]*$/)?.[0] ?? ""
      expect(gates.indexOf("./scripts/package.sh --install")).toBeGreaterThan(-1)
      expect(gates.indexOf("./scripts/package.sh --install")).toBeLessThan(gates.indexOf("systemd-analyze verify"))
      expect(gates).toContain("Device gate: `./scripts/package.sh --install`")
      expect(gates).toContain("not run and reports PARTIAL")
      expect(gates.split("Local-only gates")[0]).not.toContain("package.sh --install")
      expect(tide.documents["TRD.md"]).toContain("only after ./scripts/package.sh --install")
      expect(tide.documents["TRD.md"]).toContain("~/.config/waybar/tide-tick.jsonc")
    })

    it("tells one persistence story: records yield SQLite everywhere, no records yield no SQLite", async () => {
      const tide = await compilePacket(tideTickBlueprint, "linux-hyprland-waybar-module")
      expect(text(tide, "Cargo.toml")).toContain("rusqlite")
      expect(text(tide, "src/platform/sqlite.rs")).not.toBe("")
      expect(tide.documents["TRD.md"]).toContain("rusqlite")
      expect(tide.documents["TRD.md"]).toContain("a store is opened inside each pass and dropped at its end")
      const bare = await compilePacket(bareWaybarBlueprint, "linux-hyprland-waybar-module")
      const docs = Object.values(bare.documents).join("\n")
      expect(docs).not.toMatch(/sqlite/i)
      expect(docs).not.toContain("in memory")
    })

    it("names xdg-open, notify-send, the injectable launcher, the web page URL, and the package depends", async () => {
      const page = await compilePacket(tidePageBlueprint, "linux-hyprland-waybar-module")
      expect(text(page, "src/platform/launcher.rs")).toContain("pub fn open_url(launcher: &dyn Launcher")
      expect(text(page, "src/platform/launcher.rs")).toContain("pub fn notify(launcher: &dyn Launcher")
      expect(text(page, "src/platform/mod.rs")).toContain("pub mod launcher;")
      expect(text(page, "PKGBUILD")).toContain("depends=('xdg-utils' 'libnotify')")
      const click = task(page, "TASK-07-TIDE-TABLE-LINK")
      expect(click).toContain("Open https://tides.example.org/harbor with open_url")
      expect(click).toContain("xdg-open through std::process::Command")
      expect(click).toContain("injected &dyn Launcher")
      expect(click).toContain("notify-send through std::process::Command")
      expect(page.documents["TRD.md"]).toContain("Web page opened for the user: https://tides.example.org/harbor")
      expect(page.documents["TRD.md"].toLowerCase()).toContain("xdg-open (xdg-utils)")
      const tide = await compilePacket(tideTickBlueprint, "linux-hyprland-waybar-module")
      expect(text(tide, "src/platform/launcher.rs")).toBe("")
      expect(text(tide, "PKGBUILD")).toContain("depends=()")
      expect(tide.documents["TRD.md"].toLowerCase()).not.toContain("notify-send (libnotify)\n")
    })
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
    const withOps = (operations: ("create" | "read" | "update" | "edit" | "delete")[]) => ({
      ...base,
      dataObjects: base.dataObjects.map(item => item === records ? { ...item, fields: [{ name: "Recipe name", valueType: "text" as const, optional: false }, { name: "Steps", valueType: "text-list" as const, optional: false }] } : item),
      features: base.features.map(feature => usesRecords(feature) ? { ...feature, dataOperations: [{ data: records.name, operations }] } : feature),
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
    const twoSettings = { ...clean, "TRD.md": `${clean["TRD.md"]}\n- Settings: $XDG_CONFIG_HOME/${packet.graph.identity.bundleId}/settings.json and $XDG_CONFIG_HOME/${packet.graph.identity.bundleId}/other.json.` }
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

  it("gives later main-surface tasks the first task's slots, and keeps Waybar state out of process memory", async () => {
    const gtk = fixtureCases.find(item => item.presetId === "linux-wayland-gtk4-desktop")!
    const packet = await compilePacket(gtk.blueprint, gtk.presetId)
    const tasks = packet.documents["TASKS.md"]
    expect(tasks).toContain("Expose exactly these named slots in the shared files")
    expect(tasks).toContain("Your controls mount into the slots exposed by TASK-")
    expect(tasks).toContain("Modify the listed shared files only if the wiring check or a validation command fails")
    const waybar = fixtureCases.find(item => item.presetId === "linux-hyprland-waybar-module")!
    const issues = auditCapabilities({ ...waybar.blueprint, dataObjects: [{ ...waybar.blueprint.dataObjects[0]!, storage: "session" }] }, PRESETS["linux-hyprland-waybar-module"])
    expect(issues.map(issue => issue.rule)).toContain("capability.waybar-process-memory")
  })

  it("states declared number bounds in the data contract and the Astro schema, and rejects bounds on non-numbers", async () => {
    const astro = fixtureCases.find(item => item.presetId === "astro-web")!.blueprint
    const records = { name: "Lighthouses", purpose: "The lighthouses.", sensitivity: "public" as const, retentionIntent: "Kept in the repository.", storage: "records" as const, writeMode: "direct" as const, singleRecord: false, fields: [{ name: "Name", valueType: "text" as const, optional: false }, { name: "Year built", valueType: "whole-number" as const, optional: false, min: 1000, max: 2100 }] }
    const bounded = { ...astro, dataObjects: [records], features: astro.features.map(feature => ({ ...feature, usesData: ["Lighthouses"], dataOperations: [] })) }
    const packet = await compilePacket(bounded, "astro-web")
    const config = packet.kit.find(file => file.name.endsWith("content.config.ts"))!.content
    expect(config).toContain("z.number().int().min(1000).max(2100)")
    expect(packet.documents["TRD.md"]).toContain("whole number, from 1000 to 2100")
    expect(packet.kit.map(file => file.content).join("\n")).toContain("yearBuilt: 1000")
    const bad = { ...bounded, dataObjects: [{ ...records, fields: [{ name: "Name", valueType: "text" as const, optional: false, min: 1, max: 5 }] }] }
    expect(auditSemanticIntake(bad).map(issue => issue.rule)).toContain("semantic.bound-on-non-number")
  })

  it("fails the audit on a dangling clause left by a dropped template fragment", async () => {
    const fixture = fixtureCases.find(item => item.presetId === "linux-wayland-gtk4-desktop")!
    const packet = await compilePacket(fixture.blueprint, fixture.presetId)
    const broken = { ...packet.documents, "TASKS.md": `${packet.documents["TASKS.md"]}\n- Prompt: it trims its text arguments, , and an edit task calls it.` } as Record<string, string>
    expect(auditPacket(packet.graph, broken, PRESETS[fixture.presetId]).map(item => item.rule)).toContain("content.dangling-punctuation")
  })

  it("never builds a package segment from a Java or Kotlin keyword", async () => {
    const base = fixtureCases.find(item => item.presetId === "android-kotlin-compose")!.blueprint
    for (const [name, expected] of [["Class Schedule", "com.classapp.schedule"], ["Package Tracker", "com.packageapp.tracker"], ["Notes Import", "com.notes.importapp"], ["New Notes", "com.newapp.notes"]] as const) {
      const packet = await compilePacket({ ...base, productName: name }, "android-kotlin-compose")
      expect(packet.graph.identity.packageName, name).toBe(expected)
    }
  })
})

function blueprintSentenceStarts(text: string, summary: string): boolean {
  return text.startsWith(summary.replace(/&amp;/g, "&")) || text.replace(/\s+/g, " ").includes(summary.replace(/&amp;/g, "&"))
}
