import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import type { SemanticBlueprint } from "../src/schema"
import { feature, ops } from "./fixtures/gtkRecords"
import { giftIdeasBlueprint } from "./fixtures/gtkProducts"

const PRESET = "linux-wayland-gtk4-desktop"
const task = (tasks: string, id: string): string => tasks.split("### ").find(block => block.startsWith(id) || block.split(" ")[0]!.endsWith(id)) ?? ""
type Operation = "create" | "read" | "update" | "edit" | "delete"

// Gifts with a typed date. Each feature is (name, operations); the first is the list.
function gifts(features: readonly (readonly [string, readonly Operation[]])[], extra: Partial<SemanticBlueprint["features"][number]>[] = []): SemanticBlueprint {
  const blueprint = structuredClone(giftIdeasBlueprint)
  blueprint.dataObjects[0]!.name = "Gifts"
  blueprint.dataObjects[0]!.fields = [
    { name: "Person", valueType: "text", optional: false },
    { name: "Date given", valueType: "date", optional: false },
  ]
  blueprint.features = features.map(([name, operations], index) => feature(name, `${name} for the gifts.`, `${name} works.`, {
    usesData: ["Gifts"],
    dataOperations: ops("Gifts", ...operations),
    usesPlatformNeeds: ["local-storage"],
    buildsOn: index === 0 ? [] : [features[0]![0]],
    ...extra[index],
  }))
  blueprint.ideaCoverage = [{ sentence: 1, features: features.map(([name]) => name), outsideFeatures: "none" }]
  return blueprint
}

async function tasksOf(blueprint: SemanticBlueprint): Promise<string> {
  const packet = await compilePacket(blueprint, PRESET)
  expect(packet.failures).toEqual([])
  return packet.documents["TASKS.md"]
}

const LIST = "TASK-04-GIFT-LIST"
const ADD = "TASK-05-ADD-GIFT"

describe("GTK dates, resets, and who builds the row controls", () => {
  it("states one reset rule per input kind, the date input, the conversion and the validation once", async () => {
    const tasks = await tasksOf(gifts([["Gift list", ["read"]], ["Add gift", ["create"]], ["Edit gift", ["read", "edit"]]]))
    const add = task(tasks, ADD)
    expect(add).toContain("Reset rule, one per input kind: a text or number input resets to empty; a date input resets to empty, except one that an acceptance criterion says opens prefilled with today, which resets to today_string(clock)")
    expect(add).toContain("The edit dialog is not reset: it opens prefilled from the record being edited")
    expect(add).not.toContain("starts empty")
    expect(add).toContain("today_string(&dyn Clock) -> String in src/platform/clock.rs")
    expect(add).toContain("one GtkEntry in YYYY-MM-DD")
    expect(add).toContain("is_calendar_date(text) is false")
    expect(add).toContain("no future or past bound unless an acceptance criterion states one")
    expect(tasks.match(/today_string\(&dyn Clock\)/g)).toHaveLength(1)
  })

  it("converts a clock-stamped date with the same helper and has no date input for it", async () => {
    const blueprint = gifts([["Gift list", ["read"]], ["Add gift", ["create"]]])
    blueprint.dataObjects[0]!.fields[1]!.initial = "today"
    const add = task(await tasksOf(blueprint), ADD)
    expect(add).toContain("today_string(clock), the local YYYY-MM-DD day")
    expect(add).toContain("today_string(&dyn Clock) -> String")
    expect(add).not.toContain("one GtkEntry in YYYY-MM-DD")
    expect(add).not.toContain("Reset rule, one per input kind: a text or number input resets to empty; a date input")
  })

  it("ships the date helpers in the kit only when a date field is declared", async () => {
    const dated = await compilePacket(gifts([["Gift list", ["read"]], ["Add gift", ["create"]]]), PRESET)
    const clockRs = dated.kit.find(file => file.name === "kit/src/platform/clock.rs")?.content ?? ""
    expect(clockRs).toContain("pub fn today_string(clock: &dyn Clock) -> String")
    expect(clockRs).toContain("pub fn is_calendar_date(text: &str) -> bool")
    expect(dated.kit.find(file => file.name === "kit/tests/contract_tests.rs")?.content).toContain("calendar_dates_are_real_days_in_one_shape")
    const plain = await compilePacket(giftIdeasBlueprint, PRESET)
    expect(plain.kit.map(file => file.content).join("\n")).not.toContain("today_string")
  })

  it("lets the list feature build the mark it declares and tells the add task nothing else about it", async () => {
    const blueprint = structuredClone(giftIdeasBlueprint)
    blueprint.features = [
      feature("Goal list", "Show the goals not yet reached.", "A goal marked as reached no longer appears in the list.", { usesData: ["Gift ideas"], dataOperations: ops("Gift ideas", "read", "update"), usesPlatformNeeds: ["local-storage"] }),
      feature("Add goal", "Add a goal with a required person name and description.", "A valid goal appears in the list.", { usesData: ["Gift ideas"], dataOperations: ops("Gift ideas", "create"), buildsOn: ["Goal list"] }),
    ]
    blueprint.ideaCoverage = [{ sentence: 1, features: ["Goal list", "Add goal"], outsideFeatures: "none" }]
    const list = task(await tasksOf(blueprint), "TASK-04-GOAL-LIST")
    expect(list).toContain("You build the mark control that your own feature declares and mount it in the per-row action area.")
    expect(list).not.toContain("You build no")
    expect(list).toContain("You build the mark control (a GtkCheckButton or GtkToggleButton)")
    expect(list).toContain("one display-free function over the loaded records")
    expect(list).toContain("a failed mark leaves the row unchanged")
    expect(list).not.toContain("today's date or year")
  })

  it("covers every ownership combination of mark, edit and delete between the list and later tasks", async () => {
    const combos: { name: string; features: [string, readonly Operation[]][]; own: string; others: string }[] = [
      { name: "list owns delete", features: [["Gift list", ["read", "delete"]], ["Add gift", ["create"]]], own: "delete control that your own", others: "" },
      { name: "list owns delete, edit is later", features: [["Gift list", ["read", "delete"]], ["Add gift", ["create"]], ["Edit gift", ["read", "edit"]]], own: "delete control that your own", others: "You build no Edit control" },
      { name: "list owns mark and delete, edit is later", features: [["Gift list", ["read", "update", "delete"]], ["Add gift", ["create"]], ["Edit gift", ["read", "edit"]]], own: "mark, delete controls that your own", others: "You build no Edit control" },
      { name: "later features own all", features: [["Gift list", ["read"]], ["Add gift", ["create"]], ["Edit gift", ["read", "edit"]], ["Delete gift", ["delete"]]], own: "", others: "" },
    ]
    for (const combo of combos) {
      const list = task(await tasksOf(gifts(combo.features)), LIST)
      if (combo.own) {
        expect(list, combo.name).toContain(combo.own)
        expect(list, combo.name).not.toContain("which stays empty in your task")
      } else {
        expect(list, combo.name).toContain("You build no edit, mark or delete control")
      }
      if (combo.others) expect(list, combo.name).toContain(combo.others)
      expect(list.includes("request_delete(id: i64)"), combo.name).toBe(combo.features[0]![1].includes("delete"))
    }
  })

  it("names the edit title and Save label, the pending-delete state and the unfiltered empty state", async () => {
    const tasks = await tasksOf(gifts(
      [["Gift list", ["read"]], ["Add gift", ["create"]], ["Edit gift", ["read", "edit"]], ["Delete gift", ["delete"]], ["Search gifts", ["read"]]],
      [{}, {}, {}, {}, { narrowsListBy: "text" }],
    ))
    expect(task(tasks, "-EDIT-GIFT")).toContain("Save button is labelled \"Save\" (the add dialog's label belongs to the add dialog only)")
    expect(task(tasks, "-DELETE-GIFT")).toContain("request_delete(id: i64) returning the loaded record to confirm")
    expect(task(tasks, LIST)).toContain("reads the unfiltered loaded list, never the filtered rows")
    expect(task(tasks, ADD)).not.toContain("unfiltered")
  })

  it("adds no date or year parameter paragraph for a fixed numeric range", async () => {
    const blueprint = gifts([["Gift list", ["read"]], ["Add gift", ["create"]]])
    blueprint.dataObjects[0]!.fields = [{ name: "Person", valueType: "text", optional: false }, { name: "Books", valueType: "whole-number", optional: false, min: 1 }]
    expect(await tasksOf(blueprint)).not.toContain("depends on today's date or year")
    blueprint.dataObjects[0]!.fields[1] = { name: "Published", valueType: "whole-number", optional: false, min: 1000, max: 9999 }
    expect(await tasksOf(blueprint)).toContain("depends on today's date or year")
  })
})

describe("GTK time fields", () => {
  it("types a time field as TEXT HH:MM in the store contract, never undefined", async () => {
    const blueprint = structuredClone(giftIdeasBlueprint)
    blueprint.dataObjects[0]!.fields = [...blueprint.dataObjects[0]!.fields, { name: "Start", valueType: "time", optional: false }]
    const packet = await compilePacket(blueprint, PRESET)
    expect(packet.failures).toEqual([])
    expect(Object.values(packet.documents).join("\n")).not.toContain("undefined")
    expect(packet.documents["TRD.md"]).toContain("start TEXT NOT NULL (HH:MM, 24-hour, zero-padded)")
  })
})
