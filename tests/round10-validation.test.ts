import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import type { SemanticBlueprint } from "../src/schema"

const contactBook = JSON.parse(readFileSync(new URL("./fixtures/tauri-contact-book-csv.json", import.meta.url), "utf8")) as SemanticBlueprint

function task(tasks: string, id: string): string {
  const start = tasks.indexOf(`### ${id}`)
  const next = tasks.indexOf("\n### TASK-", start + 1)
  return tasks.slice(start, next === -1 ? undefined : next)
}

// Round 10 (Contact Book): the add/edit handlers own validation, but slots.run returned unknown and no document said how
// the handler's message reaches the shell's message slot.
describe("the validation message travels from the submit handler to the form shell (round 10)", () => {
  it("states one return contract in the shell, add, and edit tasks, and the kit types it", async () => {
    const packet = await compilePacket(contactBook, "tauri2-rust-typescript-desktop")
    expect(packet.failures).toEqual([])
    const tasks = packet.documents["TASKS.md"]
    expect(task(tasks, "TASK-04-CONTACT-LIST")).toContain("shows the string it returns in that message slot")
    expect(task(tasks, "TASK-05-ADD-CONTACT")).toContain("returns the validation message")
    expect(task(tasks, "TASK-06-EDIT-CONTACT")).toContain("returns the validation message")
    const store = packet.kit.find(file => file.name === "kit/src/store.ts")!.content
    expect(store).toContain("export type SubmitResult = string | null")
    expect(store).toContain("run: async (name: string): Promise<SubmitResult>")
  })
})
