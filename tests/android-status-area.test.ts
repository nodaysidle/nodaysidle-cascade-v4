import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import type { SemanticBlueprint } from "../src/schema"

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as SemanticBlueprint
const blocks = (tasks: string) => tasks.split(/\n(?=### TASK-)/).filter(block => block.startsWith("### TASK-"))

// Round 13 Sleep Log: the packet said later tasks show messages in the shared status area but gave them no way to post one.
describe("Android: a later task can post to the shared status area (round 13)", () => {
  const cases = [
    ["round12-blueprints/android-kotlin-compose--lift-log.json", "list with openForm"],
    ["round12-blueprints/android-kotlin-compose--shopping-list.json", "list"],
    ["android-add-edit-forms.json", "list with edit"],
    ["android-water-log.json", "no list"],
  ] as const
  for (const [file, variant] of cases) {
    it(`${variant} (${file}): definition once, use in each writing task`, async () => {
      const packet = await compilePacket(load(file), "android-kotlin-compose")
      expect(packet.failures).toEqual([])
      const all = blocks(packet.documents["TASKS.md"])
      const first = all.filter(block => block.includes('tag "write-error"'))
      expect(first).toHaveLength(1)
      expect(first[0]).toContain("showStatus(text: String, tag: String)")
      expect(first[0]).toContain("clearStatus()")
      const exposes = first[0]!.match(/exposes exactly these functions: ([^.]*)\./)
      if (exposes) for (const name of ["showStatus", "clearStatus"]) expect(exposes[1], name).toContain(name)
      const later = all.filter(block => block !== first[0] && (block.includes("Form rules:") || block.includes("Delete prompt:")))
      expect(later.length).toBeGreaterThan(0)
      for (const block of later) expect(block).toContain("showStatus(")
    })
  }

  it("a product that stores nothing has no status contract", async () => {
    const packet = await compilePacket(load("android-tip-split.json"), "android-kotlin-compose")
    for (const [name, doc] of Object.entries(packet.documents)) {
      expect(doc, name).not.toContain("showStatus")
      expect(doc, name).not.toContain("clearStatus")
    }
  })
})
