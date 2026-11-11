import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import type { SemanticBlueprint } from "../src/schema"
import { lanternBooksBlueprint } from "./fixtures/blueprints"

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as SemanticBlueprint
const tasks = (text: string) => text.split(/^### TASK-/m).slice(1)
const find = (list: string[], needle: string) => list.filter(block => block.includes(needle))

describe("Android packets share one open-form value", () => {
  it("names the shared openForm, one owner of the Add button, and the tags and properties", async () => {
    const packet = await compilePacket(load("android-add-edit-forms.json"), "android-kotlin-compose")
    expect(packet.failures).toEqual([])
    const text = packet.documents["TASKS.md"]!
    const list = tasks(text)
    const firstMain = find(list, "You are the first main-surface task")
    expect(firstMain).toHaveLength(1)
    for (const part of ["Open-form rule", "OpenForm.None", "OpenForm.Add", "OpenForm.Edit(val id: Long)", "openAdd()", "openEdit(id: Long)", "closeForm()"]) expect(firstMain[0]).toContain(part)
    expect(text).not.toContain("so opening one closes the other")
    expect(text).not.toContain("the open or closed state in its own file")
    expect(firstMain[0]).toContain("which you build and which calls the shared openAdd()")
    expect(find(list, "which you build and which calls the shared openAdd()")).toEqual(firstMain)
    expect(find(list, "build no Add button")).toHaveLength(1)
    const edit = find(list, "openEdit")
    const add = find(list, "Field rules").filter(block => block.includes("OpenForm.Add") && !block.includes("You are the first main-surface task"))
    expect(add).toHaveLength(1)
    expect(add[0]).toContain("the inline form shell of the add-entry area")
    expect(add[0]).not.toContain("(the add-entry control)")
    expect(find(edit, "calls the shared openEdit(id)")).toHaveLength(1)
    const trd = packet.documents["TRD.md"]!
    const del = find(list, "Delete prompt:")
    expect(del).toHaveLength(1)
    expect(del[0]).toContain("When the shared openForm is OpenForm.Edit for the removed record's id, the delete calls closeForm() after the record is removed")
    expect(trd).toContain("When the shared openForm is OpenForm.Edit for the removed record's id")
    for (const part of ["field-station-name", "field-total-cost-eur", "stationName", "totalCostEur"]) expect(trd).toContain(part)
  })

  it("prints the delete-closes-form sentence only when the packet has an edit form", async () => {
    const full = load("android-add-edit-forms.json")
    const edit = full.features.filter(item => /edit/i.test(item.name)).map(item => item.name)
    expect(edit).toHaveLength(1)
    const withoutEdit = {
      ...full,
      features: full.features.filter(item => !edit.includes(item.name)),
      ideaCoverage: full.ideaCoverage.map(item => ({ ...item, features: item.features.filter(name => !edit.includes(name)) })),
    }
    const packet = await compilePacket(withoutEdit, "android-kotlin-compose")
    expect(packet.failures).toEqual([])
    const text = packet.documents["TASKS.md"]!
    expect(text).toContain("Delete prompt:")
    expect(text).toContain("OpenForm.None")
    for (const doc of [text, packet.documents["TRD.md"]!]) {
      expect(doc).not.toContain("OpenForm.Edit")
      expect(doc).not.toContain("the delete calls closeForm()")
    }
  })

  it("leaves OpenForm.Edit out when no feature edits records", async () => {
    const packet = await compilePacket(load("android-step-goal.json"), "android-kotlin-compose")
    expect(packet.documents["TASKS.md"]).not.toContain("OpenForm.Edit")
  })
})

describe("Astro pages of a collection without a detail route", () => {
  it("states one page shape, the tie-break and a real build failure", async () => {
    const packet = await compilePacket(load("astro-plain-collection.json"), "astro-web")
    expect(packet.failures).toEqual([])
    const text = packet.documents["TASKS.md"]!
    expect(text).not.toContain("or one element for a single entry")
    expect(text).toContain("also when the collection has a single entry")
    const home = find(tasks(text), "src/pages/index.astro keeps the one h1")
    expect(home.length).toBeGreaterThan(0)
    for (const block of home) {
      expect(block).toContain("entries with an equal value keep ascending entry id order")
      expect(block).toContain("listScreeningsEntries()")
    }
    expect(find(tasks(text), "has no detail route").every(block => block.includes("throw an Error"))).toBe(true)
  })

  it("states the tie-break for the list of a collection that has a detail route", async () => {
    // The shop's list of featured books gets its own page, so a collection with a detail route also has a list page.
    const listPage = { ...lanternBooksBlueprint, features: lanternBooksBlueprint.features.map(item => item.name === "Featured books" ? { ...item, surface: "page" as const } : item) }
    const packet = await compilePacket(listPage, "astro-web")
    expect(packet.failures).toEqual([])
    expect(packet.documents["TASKS.md"]).toContain("one li containing one a per entry")
    expect(packet.documents["TASKS.md"]).toContain("entries with an equal value keep ascending entry id order")
  })
})
