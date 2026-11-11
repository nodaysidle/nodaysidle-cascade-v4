import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import { auditSemanticIntake, type SemanticBlueprint } from "../src/schema"
import { snippetLibraryBlueprint } from "./fixtures/gtkRecords"
import { pantryBlueprint } from "./fixtures/pantry"

const rules = (blueprint: SemanticBlueprint): string[] => auditSemanticIntake(blueprint).map(issue => issue.rule)
const task = (tasks: string, id: string): string => tasks.split("### ").find(block => block.startsWith(id)) ?? ""
const withField = (blueprint: SemanticBlueprint, dataName: string, name: string, patch: Record<string, unknown>): SemanticBlueprint => {
  const copy = structuredClone(blueprint)
  const item = copy.dataObjects.find(entry => entry.name === dataName)!
  Object.assign(item.fields.find(field => field.name === name)!, patch)
  return copy
}

describe("a date or date-time stamped from the clock at creation (initial today or now)", () => {
  it("accepts today on a date and now on a date-time, and rejects every other use", () => {
    expect(rules(withField(snippetLibraryBlueprint, "Snippets", "Updated at", { initial: "now" }))).not.toContain("semantic.initial-value-type")
    expect(rules(withField(snippetLibraryBlueprint, "Snippets", "Updated at", { initial: "today" }))).toContain("semantic.initial-value-type")
    expect(rules(withField(snippetLibraryBlueprint, "Snippets", "Title", { initial: "now" }))).toContain("semantic.initial-clock-type")
    expect(rules(withField(snippetLibraryBlueprint, "Snippets", "Updated at", { initial: "now", optional: true }))).toContain("semantic.stamped-optional")
    expect(rules(withField(snippetLibraryBlueprint, "Snippets", "Updated at", { initial: "2026-01-01" }))).toContain("semantic.initial-value-type")
  })

  it("Android: no form input, no validate argument, Add stamps it from the clock", async () => {
    const blueprint = structuredClone(pantryBlueprint)
    const item = blueprint.dataObjects.find(entry => entry.name === "Grocery items")!
    item.fields.push({ name: "Added on", valueType: "date", optional: false, initial: "today" })
    const packet = await compilePacket(blueprint, "android-kotlin-compose")
    expect(packet.failures).toEqual([])
    const trd = packet.documents["TRD.md"]
    expect(trd).toContain("Added on (calendar day (local, no time), set at creation from the clock (never typed by the user))")
    expect(trd).toContain("Added on is set from the clock when the record is created (Add stamps it: LocalDate.now(clock)")
    expect(trd).not.toContain("Added on: a text field")
    expect(trd).not.toContain("Add stores Added on as no value")
    expect(packet.documents["TASKS.md"]).toContain("no input and no argument of the validate or form functions: the add function takes the clock")
  })

  it("GTK: validate and form_state do not take it and the add function stamps it from the Clock trait", async () => {
    const blueprint = withField(snippetLibraryBlueprint, "Snippets", "Updated at", { initial: "now" })
    const packet = await compilePacket(blueprint, "linux-wayland-gtk4-desktop")
    expect(packet.failures).toEqual([])
    const add = task(packet.documents["TASKS.md"], "TASK-05-ADD-SNIPPET")
    expect(add).toContain("validate_snippets(title: &str, code: &str)")
    expect(add).toContain("stamps updated at from the Clock trait")
    expect(add).toContain("not a parameter of validate or form_state")
  })

  it("Tauri: the create caller stamps a date from the injected clock and a number must be finite", async () => {
    const blueprint = JSON.parse(readFileSync(new URL("./fixtures/tauri-recipe-timer.json", import.meta.url), "utf8")) as SemanticBlueprint
    blueprint.dataObjects[0]!.fields.push({ name: "added", valueType: "date", optional: false, initial: "today" }, { name: "weight", valueType: "number", optional: true })
    const packet = await compilePacket(blueprint, "tauri2-rust-typescript-desktop", { linuxPackaging: "binary", wayland: true })
    expect(packet.failures).toEqual([])
    const trd = packet.documents["TRD.md"]
    expect(trd).toContain("Clock-set on create: added is today's local day as YYYY-MM-DD from the injected clock")
    expect(trd).toContain("that is not finite")
    const add = task(packet.documents["TASKS.md"], "TASK-05-ADD-TIMER")
    expect(add).toContain("added (date, declared initial today) is no input")
  })
})
