import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import { buildBlueprintInstructions } from "../src/schema"
import { expenseLogBlueprint } from "./fixtures/tauriExpense"

const PRESET = "tauri2-rust-typescript-desktop"
const linux = { linuxPackaging: "appimage", wayland: true } as const
const task = (tasks: string, id: string): string => tasks.split("### ").find(block => block.startsWith(id)) ?? ""

// The expense log with its date stamped by the app at creation, the shape of a journal's "date added".
const stamped = () => {
  const blueprint = structuredClone(expenseLogBlueprint)
  blueprint.dataObjects[0]!.fields.find(field => field.name === "Spent on")!.initial = "today"
  return blueprint
}

describe("Tauri round 7: stamped dates and boilerplate", () => {
  it("makes the edit task build a read-only display of an app-stamped field", async () => {
    const { documents, failures } = await compilePacket(stamped(), PRESET, linux)
    expect(failures).toEqual([])
    const edit = task(documents["TASKS.md"], "TASK-06-EDIT-EXPENSE")
    expect(edit).toContain("spent_on (stamped by the app at creation) read-only")
    expect(edit).toContain('absent while form is "add"')
    expect(edit).toContain('sets form to "closed" after a successful save, and returns null')
    expect(task(documents["TASKS.md"], "TASK-04-EXPENSE-LIST")).toContain("Complete the required fields.")
  })

  it("gives no clock to a feature that only shows or sends back a stamped date", async () => {
    const { documents } = await compilePacket(stamped(), PRESET, linux)
    const tasks = documents["TASKS.md"]
    for (const id of ["TASK-04-EXPENSE-LIST", "TASK-06-EDIT-EXPENSE"]) {
      expect(task(tasks, id)).not.toContain("injected clock")
      expect(task(tasks, id)).not.toContain("midnight")
    }
    expect(task(tasks, "TASK-05-ADD-EXPENSE")).toContain("injected clock")
  })

  it("names no Delete control when no feature deletes, and runs cargo fmt where Rust is written", async () => {
    const { documents } = await compilePacket(expenseLogBlueprint, PRESET, linux)
    const tasks = documents["TASKS.md"]
    expect(task(tasks, "TASK-04-EXPENSE-LIST")).toContain('"detail-actions" host for the Edit control')
    expect(task(tasks, "TASK-04-EXPENSE-LIST")).not.toContain("Edit and Delete controls")
    expect(task(tasks, "TASK-02-DATA-STORE")).toContain("cargo fmt --manifest-path src-tauri/Cargo.toml -- --check")
    expect(task(tasks, "TASK-04-EXPENSE-LIST")).not.toContain("cargo fmt")
  })
})

describe("provider prompt: features follow the idea's verbs", () => {
  it("states that a feature needs a verb the idea uses", () => {
    const text = buildBlueprintInstructions({ idea: "One sentence." })
    expect(text).toContain("Every feature must correspond to a verb the idea states")
    expect(text).toContain("Never create an edit, delete, search, filter, or export feature unless the idea uses that verb or a clear synonym (change, modify, or update for edit; remove for delete)")
  })
})
