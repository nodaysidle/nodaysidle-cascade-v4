import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import type { SemanticBlueprint } from "../src/schema"

// Round 12 live check: four packets reached Gate Clean and none was agent-ready. Each fixture is the blueprint the
// provider returned for that idea (blueprint.json of the audited packet).
const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as SemanticBlueprint

function section(doc: string, heading: string): string {
  const start = doc.indexOf(heading)
  expect(start, heading).toBeGreaterThan(-1)
  const next = doc.indexOf("\n### ", start + 1)
  return doc.slice(start, next === -1 ? undefined : next)
}

// Tip Split: a calculator that stores nothing still got the list prompt (status, empty-state and write-error slots, and
// a focused test that seeds a repository the packet says does not exist).
describe("Android: a product with no data object builds no list (round 12)", () => {
  it("the first main task builds its own section and tests its own acceptance", async () => {
    const packet = await compilePacket(load("android-tip-split.json"), "android-kotlin-compose")
    expect(packet.failures).toEqual([])
    const task = section(packet.documents["TASKS.md"], "### TASK-03-SPLIT-CALCULATOR")
    for (const text of ["main list", 'tag "empty-state"', 'tag "write-error"', 'testTag "status"', "seeds records through the repository", "asserts only the list", "Every list row", "store is reopened", "later task's  ("]) expect(task, text).not.toContain(text)
    expect(task).toContain("stores nothing")
    expect(task).toContain('"Split calculator" (testTag "section-split-calculator"), yours: build its content in this task')
    expect(task).toContain("your focused test drives your own acceptance criteria through the real screen")
  })
})
