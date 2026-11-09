import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import { habitStreakBlueprint, quickNotesBlueprint } from "./fixtures/tauriNotes"

const PRESET = "tauri2-rust-typescript-desktop"
const linux = { linuxPackaging: "appimage", wayland: true } as const

const task = (tasks: string, id: string): string => tasks.split("### ").find(block => block.startsWith(id)) ?? ""
const modified = (tasks: string, id: string): string => task(tasks, id).match(/- Files to modify: (.*)/)?.[1] ?? ""
const kitFile = (packet: Awaited<ReturnType<typeof compilePacket>>, name: string): string => packet.kit.find(file => file.name === `kit/${name}`)?.content ?? ""

describe("Tauri habit tracker with a calendar-day record", () => {
  it("reaches Gate Clean and grants commands per data object", async () => {
    const packet = await compilePacket(habitStreakBlueprint, PRESET, linux)
    expect(packet.failures).toEqual([])
    const tasks = packet.documents["TASKS.md"]
    expect(task(tasks, "TASK-07-MARK-DONE-TODAY")).toContain("create_habit_completions(input)")
    expect(task(tasks, "TASK-07-MARK-DONE-TODAY")).not.toContain("create_habits")
    // A feature that reads one object and creates another is granted create only on the second.
    const blueprint = structuredClone(habitStreakBlueprint)
    blueprint.features[3]!.usesData = ["Habits", "Habit completions"]
    blueprint.features[3]!.dataOperations = [{ data: "Habits", operations: ["read"] }, { data: "Habit completions", operations: ["create"] }]
    const mixed = (await compilePacket(blueprint, PRESET, linux)).documents
    const prompt = task(mixed["TASKS.md"], "TASK-07-MARK-DONE-TODAY")
    expect(prompt).toContain("list_habits(), get_habits(id), create_habit_completions(input)")
    expect(prompt).not.toMatch(/create_habits|update_habits/)
    expect(mixed["TRD.md"]).toContain("create (FEAT-MARK-DONE-TODAY)")
    expect(mixed["TRD.md"]).not.toMatch(/create \(FEAT-ADD-HABIT, FEAT-MARK-DONE-TODAY\)/)
  })

  it("states the local YYYY-MM-DD rule wherever a calendar day is used, and only there", async () => {
    const { documents } = await compilePacket(habitStreakBlueprint, PRESET, linux)
    const tasks = documents["TASKS.md"]
    for (const id of ["TASK-04-HABIT-LIST", "TASK-07-MARK-DONE-TODAY"]) {
      const prompt = task(tasks, id)
      expect(prompt).toContain("local YYYY-MM-DD day as a string")
      expect(prompt).toContain("never from toISOString()")
      expect(prompt).toContain("injected clock")
    }
    expect(task(tasks, "TASK-05-ADD-HABIT")).not.toContain("YYYY-MM-DD")
    expect(task(tasks, "TASK-06-EDIT-HABIT-NAME")).not.toContain("YYYY-MM-DD")
    expect(documents["TRD.md"]).toContain("date values are calendar days written YYYY-MM-DD in the user's local calendar")
  })

  it("gives the launch load and its error message to one task", async () => {
    const tasks = (await compilePacket(habitStreakBlueprint, PRESET, linux)).documents["TASKS.md"]
    expect(task(tasks, "TASK-04-HABIT-LIST")).toContain("the single message shown when that load fails")
    for (const id of ["TASK-05-ADD-HABIT", "TASK-06-EDIT-HABIT-NAME", "TASK-07-MARK-DONE-TODAY"]) {
      expect(task(tasks, id)).toContain("do not show a launch-load error message (that one belongs to TASK-04-HABIT-LIST)")
    }
    expect(task(tasks, "TASK-04-HABIT-LIST")).toContain("You build only the shell; the add task builds its field inputs and choice pickers")
  })

  it("names JSON keys, update semantics, and list order in the data contract", async () => {
    const trd = (await compilePacket(habitStreakBlueprint, PRESET, linux)).documents["TRD.md"]
    expect(trd).toContain("the JSON keys on the wire are exactly id, name, created_at")
    expect(trd).toContain("the JSON keys on the wire are exactly id, habit, completed_on")
    expect(trd).toContain("the caller sends the stored value of each field it does not change")
    expect(trd).toContain("a feature that needs another order sorts it there, breaking ties by descending id")
    expect(trd).not.toContain("text-list column")
  })

  it("drops boilerplate for files, settings, windows, and untouched kit files", async () => {
    const packet = await compilePacket(habitStreakBlueprint, PRESET, linux)
    const all = Object.values(packet.documents).join("\n")
    expect(all).not.toMatch(/CON-PLATFORM-FILES|settings are grouped|tauri-plugin-dialog|use atomic JSON|Only the main window hides/)
    expect(all).toContain("Runtime mode: linux-desktop")
    const tasks = packet.documents["TASKS.md"]
    for (const id of ["TASK-02-DATA-STORE", "TASK-03-LIFECYCLE-COORDINATOR", "TASK-04-HABIT-LIST", "TASK-05-ADD-HABIT"]) {
      expect(modified(tasks, id)).not.toMatch(/Cargo\.toml|capabilities/)
    }
    expect(modified(tasks, "TASK-08-PACKAGING")).toContain("src-tauri/capabilities/default.json")
    expect(kitFile(packet, "src/ui.ts")).not.toContain("settingsGroup")
    expect(kitFile(packet, "src/style.css")).not.toContain(".settings")
    expect(kitFile(packet, "tests/ui.test.ts")).not.toContain("settings")
  })

  it("keeps the frontend build output apart from the AppImage and exposes the platform module", async () => {
    const packet = await compilePacket(habitStreakBlueprint, PRESET, linux)
    expect(kitFile(packet, "vite.config.ts")).toContain('outDir: "dist-web"')
    expect(kitFile(packet, "src-tauri/tauri.conf.json")).toContain('"frontendDist": "../dist-web"')
    expect(kitFile(packet, "src-tauri/src/lib.rs")).toContain("pub mod platform;")
  })

  it("gives the lifecycle owner a concrete deliverable", async () => {
    const tasks = (await compilePacket(habitStreakBlueprint, PRESET, linux)).documents["TASKS.md"]
    expect(task(tasks, "TASK-03-LIFECYCLE-COORDINATOR")).toContain("a launch(folder) function that opens the store through database::open")
    expect(task(tasks, "TASK-03-LIFECYCLE-COORDINATOR")).toContain("exit in the RunEvent::Exit arm")
  })
})

describe("Tauri notes app with an editor and a Markdown export", () => {
  it("reaches Gate Clean", async () => {
    expect((await compilePacket(quickNotesBlueprint, PRESET, linux)).failures).toEqual([])
  })

  it("has the first main-surface task own the editor, and the later tasks reuse it", async () => {
    const tasks = (await compilePacket(quickNotesBlueprint, PRESET, linux)).documents["TASKS.md"]
    expect(task(tasks, "TASK-04-NOTE-LIST")).toContain("the add-entry control opens it empty and the Edit button of the detail view (read-only until then, showing every stored field) opens it for the selected record")
    for (const id of ["TASK-05-ADD-NOTE", "TASK-06-EDIT-NOTE"]) expect(task(tasks, id)).toContain("do not build another detail view or entry-form shell")
  })

  it("asks for the injected clock only where a date-time is written", async () => {
    const tasks = (await compilePacket(quickNotesBlueprint, PRESET, linux)).documents["TASKS.md"]
    expect(task(tasks, "TASK-05-ADD-NOTE")).toContain("injected clock")
    expect(task(tasks, "TASK-06-EDIT-NOTE")).toContain("injected clock")
    expect(task(tasks, "TASK-04-NOTE-LIST")).not.toContain("injected clock")
    expect(task(tasks, "TASK-08-EXPORT-NOTES-AS-MARKDOWN")).not.toContain("injected clock")
  })

  it("names the dialog adapter and puts the file layout with the exporting feature", async () => {
    const { documents } = await compilePacket(quickNotesBlueprint, PRESET, linux)
    const exportTask = task(documents["TASKS.md"], "TASK-08-EXPORT-NOTES-AS-MARKDOWN")
    expect(exportTask).toContain("save() of @tauri-apps/plugin-dialog")
    expect(exportTask).toContain("injected adapter function")
    expect(documents["TRD.md"]).toContain("the feature that saves it owns the file's layout")
    expect(documents["TRD.md"]).not.toContain("paths saved earlier to reopen")
    expect(documents["TRD.md"]).not.toContain("saved to reopen")
  })

  it("tests the failed document write in the data store and gives the permission owner real helpers", async () => {
    const tasks = (await compilePacket(quickNotesBlueprint, PRESET, linux)).documents["TASKS.md"]
    expect(task(tasks, "TASK-02-DATA-STORE")).toContain("leaves that file's bytes identical")
    expect(task(tasks, "TASK-07-PERMISSION-COORDINATOR")).toContain("existing_file(path) and save_target(path)")
  })
})
