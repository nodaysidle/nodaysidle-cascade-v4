import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import { ideaBoxBlueprint, waterLogBlueprint } from "./fixtures/tauriAudit4"

const PRESET = "tauri2-rust-typescript-desktop"
const linux = { linuxPackaging: "appimage", wayland: true } as const
const task = (tasks: string, id: string): string => tasks.split("### ").find(block => block.startsWith(id)) ?? ""
const kitFile = (packet: Awaited<ReturnType<typeof compilePacket>>, name: string): string => packet.kit.find(file => file.name === `kit/${name}`)?.content ?? ""

describe("Tauri audit round 4: water log", () => {
  it("injects the clock into the day-filtering list and recomputes today on every render", async () => {
    const packet = await compilePacket(waterLogBlueprint, PRESET, linux)
    expect(packet.failures).toEqual([])
    const list = task(packet.documents["TASKS.md"], "TASK-04-GLASS-LOG")
    expect(list).toContain("the shared view state (the store), now")
    expect(list).toContain("recomputes today from now() on every render")
    expect(list).toContain("local year, month, and day of its parsed date-time")
    expect(list).toContain("sets process.env.TZ")
    expect(kitFile(packet, "README.md")).toContain("now: () => Date")
  })

  it("builds a direct add button, no form shell, and no detail view", async () => {
    const tasks = (await compilePacket(waterLogBlueprint, PRESET, linux)).documents["TASKS.md"]
    const list = task(tasks, "TASK-04-GLASS-LOG")
    expect(list).toContain("a button that the add task connects to the create command")
    expect(list).not.toContain("opens the entry form shell")
    expect(task(tasks, "TASK-05-ADD-A-GLASS")).toContain("has no entry form")
    expect(task(tasks, "TASK-05-ADD-A-GLASS")).not.toContain("takes user input ()")
    for (const id of ["TASK-05-ADD-A-GLASS", "TASK-06-DELETE-A-GLASS"]) {
      expect(task(tasks, id)).not.toContain("reuse the one it exposes")
      expect(task(tasks, id)).toContain("build no detail view or form shell")
    }
  })

  it("names the confirmation dialog, the retry control, and the sort rule", async () => {
    const packet = await compilePacket(waterLogBlueprint, PRESET, linux)
    const tasks = packet.documents["TASKS.md"]
    const remove = task(tasks, "TASK-06-DELETE-A-GLASS")
    expect(remove).toContain("confirm (confirmDialog from src/ui.ts)")
    expect(remove).toContain("src/style.css already styles the dialog")
    expect(remove).toContain("errors.show(message, repeat)")
    expect(task(tasks, "TASK-04-GLASS-LOG")).toContain("ties broken by id in the same direction")
    expect(kitFile(packet, "src/ui.ts")).toContain("export const confirmDialog")
    expect(kitFile(packet, "src/errors.ts")).toContain("onRetry")
    expect(kitFile(packet, "src/style.css")).toContain(".dialog-overlay")
  })
})

describe("Tauri audit round 4: idea box", () => {
  it("lets launch create the data folder", async () => {
    const packet = await compilePacket(ideaBoxBlueprint, PRESET, linux)
    expect(packet.failures).toEqual([])
    const lifecycle = task(packet.documents["TASKS.md"], "TASK-03-LIFECYCLE-COORDINATOR")
    expect(lifecycle).toContain("database::open (from the kit) creates the data folder with create_dir_all")
    expect(lifecycle).toContain("subfolder of a temporary directory that does not exist yet")
    expect(kitFile(packet, "src-tauri/src/database.rs")).toMatch(/create_dir_all\(folder\)[\s\S]*Connection::open/)
    expect(kitFile(packet, "src-tauri/tests/kit_tests.rs")).toContain("open_creates_a_missing_data_folder")
  })

  it("lets the permission task edit the data store file it moves code out of, and lists it on the owner map", async () => {
    const packet = await compilePacket(ideaBoxBlueprint, PRESET, linux)
    const permission = task(packet.documents["TASKS.md"], "TASK-07-PERMISSION-COORDINATOR")
    expect(permission).toMatch(/Files to modify: .*src-tauri\/src\/platform\/datastore\.rs/)
    expect(permission).toContain("replace exactly that inline code with calls to your helpers")
    expect(packet.documents["AGENTS.md"]).toMatch(/OWN-DATA-STORE — .*datastore\.rs — .* later phases that edit this owner's own file: PHASE-07-PERMISSION-COORDINATOR/)
  })

  it("states the shared view state, the slot hosts, and the extension points the list task exposes", async () => {
    const tasks = (await compilePacket(ideaBoxBlueprint, PRESET, linux)).documents["TASKS.md"]
    const list = task(tasks, "TASK-04-IDEA-LIST")
    expect(list).toContain("{ ideas: Ideas[], loadError: string | null, selectedId: number | null, query: string, form:")
    expect(list).toContain('slots.host("status"), slots.host("form"), slots.host("detail"), slots.host("detail-actions"), slots.host("filter")')
    expect(list).not.toContain("row-actions")
    expect(list).not.toContain("a per-row action area")
    expect(list).toContain("the filter feature writes query")
    expect(list).toContain("slots.mount(name, element) from src/main.ts and never edits your file")
    expect(list).toContain("errors (the banner object that src/main.ts exports")
    expect(list).not.toContain("errors (src/ui.ts)")
  })

  it("gives edit no clock, search no commands, and keeps an empty export enabled", async () => {
    const tasks = (await compilePacket(ideaBoxBlueprint, PRESET, linux)).documents["TASKS.md"]
    expect(task(tasks, "TASK-06-EDIT-IDEA")).not.toContain("injected clock")
    const search = task(tasks, "TASK-09-SEARCH-IDEAS-BY-TITLE")
    expect(search).toContain("calls no Rust command")
    expect(search).not.toContain("The commands this feature calls")
    expect(search).not.toContain("apply the stated fallback")
    const exported = task(tasks, "TASK-08-EXPORT-IDEAS")
    expect(exported).toContain("the control stays enabled then")
    expect(exported).toContain("sets process.env.TZ")
    expect(task(tasks, "TASK-10-PACKAGING")).toContain("platform/mod.rs is the one listed shared file you always modify")
  })
})
