import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import type { SemanticBlueprint } from "../src/schema"

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as SemanticBlueprint

function task(tasks: string, id: string): string {
  const start = tasks.indexOf(`### ${id}`)
  const next = tasks.indexOf("\n### TASK-", start + 1)
  return tasks.slice(start, next === -1 ? undefined : next)
}

// Round 10: the first main task's slots were sized only for list CRUD, so a whole-list command or a single setting had no host.
describe("main-screen slots fit commands and settings, not only list rows (round 10)", () => {
  it("Tauri: the Save to CSV button mounts into an actions host that the first main task exposes", async () => {
    const packet = await compilePacket(load("tauri-contact-book-csv.json"), "tauri2-rust-typescript-desktop")
    expect(packet.failures).toEqual([])
    const tasks = packet.documents["TASKS.md"]
    const list = task(tasks, "TASK-04-CONTACT-LIST")
    const csv = task(tasks, "TASK-08-SAVE-CONTACTS-TO-CSV")
    expect(list).toContain('an "actions" host')
    expect(csv).toContain('the "actions" host')
    expect(csv).not.toContain("no named slot")
  })

  it("Android: a setting mounts into the actions area, and a tap log is a button with no form, row area, or filter area", async () => {
    const packet = await compilePacket(load("android-water-log.json"), "android-kotlin-compose")
    expect(packet.failures).toEqual([])
    const tasks = packet.documents["TASKS.md"]
    const log = task(tasks, "TASK-04-LOG-A-GLASS-OF-WATER")
    const goal = task(tasks, "TASK-05-SET-DAILY-GOAL")
    expect(log).toContain('testTag "actions"')
    expect(log).toContain("build no entry form shell")
    expect(log).not.toContain("per-row action area")
    expect(log).not.toContain("one area above the list for the features that filter")
    expect(goal).toContain("the actions area")
    expect(goal).not.toContain("per-row action area")
    expect(goal).not.toContain("reuse the form fields and validation that the add task exports")
  })
})

// Round 11 (Book Shelf): on GTK the CSV export's create on the export document counted as adding a record, so the
// export task mounted into the add-entry control and received the add dialog's form facts.
describe("GTK: an export is a whole-list command, not an add form (round 11)", () => {
  it("mounts Save to CSV into the actions area and gives it no entry form", async () => {
    const packet = await compilePacket(load("gtk-book-shelf.json"), "linux-wayland-gtk4-desktop")
    expect(packet.failures).toEqual([])
    const tasks = packet.documents["TASKS.md"]
    const list = task(tasks, "TASK-04-BOOK-LIST")
    const csv = task(tasks, "TASK-08-SAVE-BOOKS-TO-CSV")
    expect(list).toContain("an actions area above the list")
    expect(list).toContain("the actions area is a GtkBox packed at the end of the AdwHeaderBar")
    expect(csv).toContain("(the actions area)")
    expect(csv).not.toContain("Form facts")
    expect(csv).not.toContain("Build the entry form")
    expect(task(tasks, "TASK-05-ADD-BOOK")).toContain("Form facts")
  })
})
