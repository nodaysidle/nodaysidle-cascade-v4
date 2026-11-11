import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import type { SemanticBlueprint } from "../src/schema"

const PRESET = "tauri2-rust-typescript-desktop"
const linux = { linuxPackaging: "binary", wayland: true } as const
const load = (name: string): SemanticBlueprint => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8")) as SemanticBlueprint
const task = (tasks: string, id: string): string => tasks.split("### ").find(block => block.startsWith(id)) ?? ""

describe("Tauri audit round 6: break timer (read-only countdown, edit, delete)", () => {
  it("gives the countdown a row slot, an in-memory state field, and no filter or command boilerplate", async () => {
    const packet = await compilePacket(load("tauri-break-timer"), PRESET, linux)
    expect(packet.failures).toEqual([])
    const tasks = packet.documents["TASKS.md"]
    const list = task(tasks, "TASK-04-REMINDER-LIST")
    expect(list).toContain("its shape is { breakReminders: BreakReminders[]")
    expect(list).not.toContain("exactly {")
    expect(list).toContain("countdown: { id: number; startedAt: number } | null")
    expect(list).toContain("written only by TASK-08-START-COUNTDOWN")
    expect(list).toContain('slots.row("row-actions", record)')
    expect(list).not.toContain('slots.host("filter")')
    expect(list).not.toContain("query: string")
    const countdown = task(tasks, "TASK-08-START-COUNTDOWN")
    expect(countdown).toContain('slots.mountRow("row-actions", render)')
    expect(countdown).toContain("Start button and that row's countdown display")
    expect(countdown).toContain("countdown field")
    expect(countdown).toContain("is cleared on the next tick or render; an edit leaves it unchanged")
    expect(countdown).toContain("nothing is persisted")
    expect(countdown).not.toContain("narrows or reorders")
    expect(countdown).not.toContain("filter area")
    expect(countdown).not.toContain("Show only the failure message of your own commands")
    expect(countdown).not.toContain("refresh it after your own writes")
  })

  it("has one owner of the Add button and states that later controls are verified by their own tasks", async () => {
    const tasks = (await compilePacket(load("tauri-break-timer"), PRESET, linux)).documents["TASKS.md"]
    const list = task(tasks, "TASK-04-REMINDER-LIST")
    expect(list).toContain("the Add button, built directly in your layout; no later task builds or mounts one")
    expect(list).not.toContain('slots.host("add")')
    expect(list).toContain("the add task fills the \"form\" host and nothing else")
    expect(list).toContain("are verified by the task that builds that button")
    const add = task(tasks, "TASK-05-ADD-REMINDER")
    expect(add).toContain('the "form" host of the entry form shell; the first main task builds the Add button')
    expect(add).toContain("you build neither and fill the \"form\" host only")
    expect(add).not.toContain("(the add-entry control)")
    expect(task(tasks, "TASK-07-EDIT-REMINDER")).toContain("are verified here, in your focused test")
    expect(task(tasks, "TASK-07-EDIT-REMINDER")).not.toContain("choice picker")
  })
})

describe("Tauri audit round 6: study cards (add owner, key name, boilerplate)", () => {
  it("names the state key as an identifier and tells the delete task to clear the selection", async () => {
    const tasks = (await compilePacket(load("tauri-study-cards"), PRESET, linux)).documents["TASKS.md"]
    expect(task(tasks, "TASK-04-CARD-LIST")).toContain("flashCards: FlashCards[]")
    expect(task(tasks, "TASK-06-DELETE-CARD")).toContain("set the shared view state's selectedId to null")
    expect(task(tasks, "TASK-06-DELETE-CARD")).toContain("PRD's own word for the record")
  })

  it("trims in the add task, drops the date-time paragraph where no time is shown, and states the match-rule split", async () => {
    const tasks = (await compilePacket(load("tauri-study-cards"), PRESET, linux)).documents["TASKS.md"]
    expect(task(tasks, "TASK-05-ADD-CARD")).toContain("means the trimmed values")
    for (const id of ["TASK-06-DELETE-CARD", "TASK-07-EDIT-CARD", "TASK-08-SEARCH-CARDS"]) {
      expect(task(tasks, id)).not.toContain("A stored date-time is a UTC RFC3339 string")
    }
    expect(task(tasks, "TASK-04-CARD-LIST")).toContain("the filter task's own test covers only that its control writes query")
    expect(task(tasks, "TASK-02-DATA-STORE")).toContain("modify it only if a validation command fails")
  })
})
