import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { auditCapabilities } from "../src/capabilities"
import { compilePacket } from "../src/compiler"
import { PRESETS } from "../src/presets"
import { WAYBAR_PROVIDER_NOTES } from "../src/waybarContracts"
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
    expect(packet.documents["TRD.md"]).not.toContain("confirm that the data the app saved is still present")
    expect(packet.documents["TRD.md"]).toContain("confirm that the screen starts from its initial state with nothing stored")
  })
})

// Disk Free: valueDecimals 1 (label line, kit) while the label acceptance signals said "3.67 GB" and "10.00 GB", and
// the units rule said a size always has 2 decimals.
describe("Waybar: label examples use the declared number of decimals (round 12)", () => {
  const WAYBAR = "linux-hyprland-waybar-module" as const
  const rules = (blueprint: SemanticBlueprint) => auditCapabilities(blueprint, PRESETS[WAYBAR]).map(issue => issue.rule)
  const repaired = (): SemanticBlueprint => {
    const blueprint = load("waybar-disk-free.json")
    const feature = blueprint.features[0]!
    feature.acceptanceSignals = feature.acceptanceSignals.map(signal => signal.replace("3.67 GB with class normal", "3.7 GB with class critical").replaceAll("10.00 GB", "10.0 GB"))
    return blueprint
  }

  it("sends a label example with other decimals back for repair, and names the signal", () => {
    const issues = auditCapabilities(load("waybar-disk-free.json"), PRESETS[WAYBAR])
    expect(issues.filter(issue => issue.rule === "capability.waybar-label-decimals")).toHaveLength(3)
    expect(issues[0]!.path).toBe("features[0].acceptanceSignals[0]")
    expect(issues[0]!.message).toContain("3.67 GB")
  })

  // Re-audit: "With 3,670,016,000 free bytes the label text is 3.67 GB with class normal" although red is below 10 GB.
  it("sends back an example whose class disagrees with the declared thresholds for its reading", () => {
    const wrong = auditCapabilities(load("waybar-disk-free.json"), PRESETS[WAYBAR]).filter(issue => issue.rule === "capability.waybar-class-example")
    expect(wrong.map(issue => issue.path)).toEqual(["features[0].acceptanceSignals[0]"])
    expect(wrong[0]!.message).toContain("class critical")
    const percent = repaired()
    Object.assign(percent.features[0]!, { labelTemplate: "{value}%", unit: "%", valueDecimals: 0, thresholds: [{ state: "warning", comparison: "below", value: 30 }, { state: "critical", comparison: "below", value: 15 }], acceptanceSignals: ["With a charge of 25 the label text is 25% with class warning.", "With a charge of 12 the label text is 12% with class warning."] })
    expect(auditCapabilities(percent, PRESETS[WAYBAR]).filter(issue => issue.rule === "capability.waybar-class-example").map(issue => issue.path)).toEqual(["features[0].acceptanceSignals[1]"])
  })

  it("accepts the repaired signals and leaves the tooltip percent alone", () => {
    expect(rules(repaired())).toEqual([])
  })

  it("tells the provider, and the units rule yields to a label that states its decimals", async () => {
    expect(WAYBAR_PROVIDER_NOTES.join(" ")).toContain("never 3.67 GB")
    const packet = await compilePacket(repaired(), WAYBAR)
    expect(packet.failures).toEqual([])
    const trd = packet.documents["TRD.md"]
    expect(trd).not.toContain("no acceptance criterion changes them: a size is shown with 2 decimals")
    expect(trd).toContain("A label whose contract states an exact number of decimals uses that number")
    expect(packet.documents["TASKS.md"]).toContain("the label text is 3.7 GB")
  })
})

// Budget Book: "Monthly category totals" only reads the records and narrows nothing, yet it was compiled as a list
// filter: mounted in "the filter area or the list region", told to write a query, and told it has no failure path
// while the PRD requires a could-not-load state.
describe("Tauri: a read-only feature that derives values is a summary, not a filter (round 12)", () => {
  it("gets its own host, writes nothing to the store, and states its load-failure state", async () => {
    const packet = await compilePacket(load("tauri-budget-book.json"), "tauri2-rust-typescript-desktop")
    expect(packet.failures).toEqual([])
    const tasks = packet.documents["TASKS.md"]
    const list = section(tasks, "### TASK-04-EXPENSE-LIST")
    const totals = section(tasks, "### TASK-07-MONTHLY-CATEGORY-TOTALS")
    expect(list).toContain('a "summary" host above the list')
    expect(list).toContain('slots.host("summary")')
    for (const text of ["query: string", "a filter area above the list", "match rule"]) expect(list, text).not.toContain(text)
    expect(totals).toContain('(the "summary" host)')
    expect(totals).toContain("writes nothing to the shared view state")
    expect(totals).toContain("loadError")
    for (const text of ["narrows or reorders", "the filter area or the list region", "so it has no failure path", "writing its control's value with store.set"]) expect(totals, text).not.toContain(text)
  })

  it("keeps a declared filter a filter", async () => {
    const tasks = (await compilePacket(load("tauri-reading-list.json"), "tauri2-rust-typescript-desktop")).documents["TASKS.md"]
    expect(tasks).toContain("a filter area above the list")
    expect(tasks).not.toContain('"summary" host')
  })

  it("does not treat a per-row read-only action as a summary, and mounts it in the per-row action area", async () => {
    const packet = await compilePacket(load("round12-blueprints/tauri2-rust-typescript-desktop--link-shelf.json"), "tauri2-rust-typescript-desktop")
    expect(packet.failures).toEqual([])
    const tasks = packet.documents["TASKS.md"]
    const list = section(tasks, "### TASK-04-BOOKMARK-LIST")
    const open = section(tasks, "### TASK-06-OPEN-BOOKMARK")
    expect(list).toContain('a per-row action area on every list row, built with slots.row("row-actions", record)')
    expect(list).not.toContain('"summary" host')
    expect(open).toContain("(the per-row action area)")
    expect(open).toContain('slots.mountRow("row-actions", render)')
    expect(open).not.toContain('"summary" host')
    expect(open).not.toContain("Mount your control with slots.mount from src/main.ts")
  })
})

// Budget Book: the provider wrote "Selecting a row shows that expense read-only with a Delete button", but with no
// edit feature the Tauri screen builds no detail view and Delete sits in the row. Alan's decision: send the wording back.
describe("Tauri: a read-only view of a selected record needs an edit feature (round 12)", () => {
  const TAURI = "tauri2-rust-typescript-desktop" as const
  const issues = (blueprint: SemanticBlueprint) => auditCapabilities(blueprint, PRESETS[TAURI])

  it("sends the wording back for repair on every feature that uses it", () => {
    const found = issues(load("tauri-budget-book.json"))
    expect(found.map(issue => `${issue.path} ${issue.rule}`)).toEqual(["features[1] capability.tauri-no-detail-view", "features[2] capability.tauri-no-detail-view"])
    expect(found[0]!.message).toContain("list row")
  })

  it("accepts the repair, and tells the provider up front", () => {
    const blueprint = load("tauri-budget-book.json")
    const [, list, remove] = blueprint.features
    list!.behavior = list!.behavior.replace("Selecting a row shows that expense read-only with a Delete button.", "Each row has a Delete button.")
    list!.acceptanceSignals = list!.acceptanceSignals.map(signal => signal.replace("Selecting a row shows that expense read-only with a Delete button.", "Each row has a Delete button."))
    remove!.trigger = "The user chooses Delete in the row of an expense."
    remove!.failureOutcome = "If the expense cannot be removed, the row stays in the list and shows that the expense was not deleted."
    // Re-audit: the outcome sentence still said "can open one to view it".
    expect(issues(blueprint).map(issue => issue.path)).toEqual(["features[1]"])
    list!.userOutcome = "The user sees all recorded expenses."
    expect(issues(blueprint)).toEqual([])
    expect((PRESETS[TAURI].providerNotes ?? []).join(" ")).toContain("When no feature edits a record there is no read-only view")
  })

  it("leaves a product with an edit feature alone", () => {
    const blueprint = load("tauri-contact-book.json")
    blueprint.features[0]!.behavior += " Selecting a row shows that contact in the detail view."
    expect(issues(blueprint)).toEqual([])
  })
})

// Green Kitchen: nothing linked to the meal-type pages, nothing said which pages exist or what an empty one shows, and
// the kit printed ingredients and steps as one comma-joined line.
describe("Astro: a tag page over a fixed choice has a shell, links, and an empty state; list fields are lists (round 12)", () => {
  const kitFile = (packet: Awaited<ReturnType<typeof compilePacket>>, path: string) => packet.kit.find(item => item.name === `kit/${path}`)?.content ?? ""

  it("ships the tag page shell and links every value from the primary nav", async () => {
    const packet = await compilePacket(load("astro-green-kitchen.json"), "astro-web")
    expect(packet.failures).toEqual([])
    const page = kitFile(packet, "src/pages/recipes/tags/[tag].astro")
    expect(page).toContain('["breakfast", "lunch", "dinner"]')
    expect(page).toContain("entry.data.mealType === tag")
    expect(page).toContain("No entries yet.")
    expect(page).toContain("href={`/recipes/${entry.id}/`}")
    const layout = kitFile(packet, "src/layouts/BaseLayout.astro")
    for (const value of ["breakfast", "lunch", "dinner"]) expect(layout).toContain(`href="/recipes/tags/${value}/"`)
  })

  it("states the page set, the empty state and the links in the documents", async () => {
    const packet = await compilePacket(load("astro-green-kitchen.json"), "astro-web")
    const tasks = packet.documents["TASKS.md"]
    expect(tasks).toContain("/recipes/tags/[tag] — src/pages/recipes/tags/[tag].astro (one page per meal type value: breakfast, lunch, dinner")
    const task = section(tasks, "### TASK-04-MEAL-TYPE-PAGE")
    expect(task).toContain("Start from kit/src/pages/recipes/tags/[tag].astro")
    expect(task).toContain('"No entries yet."')
    expect(task).toContain("the primary nav of the kit layout already links each of these pages")
  })

  it("renders a list field as one li per item and says how a test reads it", async () => {
    const packet = await compilePacket(load("astro-green-kitchen.json"), "astro-web")
    const page = kitFile(packet, "src/pages/recipes/[slug].astro")
    expect(page).toContain("<ol>{entry.data.steps.map(item => <li>{item}</li>)}</ol>")
    expect(page).not.toContain('.join(", ")')
    expect(kitFile(packet, "src/content/recipes/01-sample-entry.md")).toContain("steps: [Sample item one, Sample item two]")
    expect(packet.documents["TRD.md"]).toContain("A list field is one line holding a flow list")
    expect(section(packet.documents["TASKS.md"], "### TASK-05-RECIPE-PAGE")).toContain("a list field as one ol with one li per item")
  })
})
