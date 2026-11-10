import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import type { SemanticBlueprint } from "../src/schema"

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as SemanticBlueprint

function section(doc: string, heading: string): string {
  const start = doc.indexOf(heading)
  expect(start, heading).toBeGreaterThan(-1)
  const next = doc.indexOf("\n### ", start + 1)
  return doc.slice(start, next === -1 ? undefined : next)
}

// Round 11 (Step Goal): records only created and read for today's total, no feature shows a list, and the first main
// task is a setting edited on the main screen. The first task was still sized for list CRUD and the setting had no form contract.
describe("no list on screen, and a setting edited on the main screen (round 11)", () => {
  it("Android: the first main task builds no list, exposes one slot per feature, and tests its own acceptance", async () => {
    const packet = await compilePacket(load("android-step-goal.json"), "android-kotlin-compose")
    expect(packet.failures).toEqual([])
    const tasks = packet.documents["TASKS.md"]
    const goal = section(tasks, "### TASK-04-SET-DAILY-STEP-GOAL")
    const steps = section(tasks, "### TASK-05-ENTER-TODAY-S-STEPS")
    for (const text of ['testTag "add-entry"', "inline form shell", "empty-state", "main list", "Every list row", "asserts only the list"]) expect(goal).not.toContain(text)
    expect(goal).toContain("The main screen shows no list")
    expect(goal).toContain('an actions area at the top of the screen (testTag "actions")')
    expect(goal).toContain("your own setting control is the first thing mounted there")
    expect(goal).toContain('"Enter today\'s steps" (testTag "section-enter-today-s-steps")')
    expect(goal).toContain("your focused test drives your own acceptance criteria")
    expect(steps).toContain('(your own section, testTag "section-enter-today-s-steps"; a stored setting you read is shown only by its own control in the actions area')
    expect(steps).not.toContain("the add-entry control")
    // No schedule: no WorkManager wording on the lifecycle task.
    const lifecycle = section(tasks, "### TASK-03-LIFECYCLE-COORDINATOR")
    expect(lifecycle).not.toContain("WorkManager")
    expect(lifecycle).not.toContain("enqueue")
  })

  it("Android TRD: the create form is always visible, the setting has a full form contract, and its key has a type and an empty value", async () => {
    const packet = await compilePacket(load("android-step-goal.json"), "android-kotlin-compose")
    const trd = packet.documents["TRD.md"]
    const entry = section(trd, "### CON-ENTER-TODAY-S-STEPS-INTERFACE")
    expect(entry).not.toContain("above the list")
    expect(entry).not.toContain("a successful Save closes the form")
    expect(entry).toContain("the form is always visible in its feature's section of the main screen")
    expect(entry).toContain("a successful Save clears every field and leaves the form on screen")
    // The digits-only pattern already rejects a sign, so a minimum of 0 has no reachable message.
    expect(entry).not.toContain("steps must be at least 0")
    expect(entry).not.toContain("empty-state")

    const setting = section(trd, "### CON-SET-DAILY-STEP-GOAL-INTERFACE")
    expect(setting).toContain("Form (Daily goal, a stored setting): always visible on the main screen in the actions area")
    expect(setting).toContain('goal steps: a whole number matching ^[0-9]{1,9}$')
    expect(setting).toContain('"goal steps is required"')
    expect(setting).toContain('testTag "save-daily-goal"')
    expect(setting).toContain('testTag "current-goal-steps"')
    expect(setting).toContain('"goal steps: none" when no value is stored')
    expect(setting).toContain("a feature that only reads it uses the value and never shows it again")
    expect(setting).toContain("Rejection: the Save button is always enabled")
    expect(setting).toContain("a successful Save stores the value")

    const data = section(trd, "### CON-DATA-DAILY-GOAL")
    expect(data).toContain('goal steps as longPreferencesKey("goal_steps") holding a Long')
    expect(data).toContain("emits null until the first save")
    expect(data).toContain("is not shown until a value is saved")
    expect(section(trd, "### CON-DATA-STEP-ENTRY")).not.toContain("Worker")
  })

  it("Android Water Log: a declared initial value is what the setting key emits before the first save", async () => {
    const packet = await compilePacket(load("android-water-log.json"), "android-kotlin-compose")
    const data = section(packet.documents["TRD.md"], "### CON-DATA-DAILY-GOAL")
    expect(data).toContain('glasses per day as longPreferencesKey("glasses_per_day") holding a Long')
    expect(data).toContain("emits 8 until the first save")
  })
})
