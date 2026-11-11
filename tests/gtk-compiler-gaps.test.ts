import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import type { SemanticBlueprint } from "../src/schema"

const PRESET = "linux-wayland-gtk4-desktop"
const fixture = (): SemanticBlueprint => JSON.parse(readFileSync(new URL("./fixtures/gtk-choice-filter.json", import.meta.url), "utf8")) as SemanticBlueprint

const find = (tasks: string, needle: string): string => tasks.split("### ").find(block => block.includes(needle)) ?? ""

describe("GTK compiler gaps", () => {
  it("states the choice filter, the filter hook, the delete dialog and the edit title", async () => {
    const packet = await compilePacket(fixture(), PRESET)
    expect(packet.failures).toEqual([])
    const tasks = packet.documents["TASKS.md"]
    const first = find(tasks, "You are the first main-surface task")
    const filter = find(tasks, "Narrow the list with")
    const del = find(tasks, "request_delete")
    const edit = find(tasks, "The edit dialog's title is")
    expect(filter).toContain("one single-choice GtkDropDown")
    expect(filter).not.toContain("GtkToggleButton")
    expect(filter).toContain("All, green, black, oolong, herbal")
    expect(first).toContain("Filter hook")
    expect(first).toContain("visible_rows()")
    expect(first).toContain("set_filter_selection")
    expect(first).not.toContain("GtkToggleButton")
    expect(filter).toContain("set_filter_selection")
    expect(del).toContain("\"Cancel\"")
    expect(del).toContain("\"Delete\"")
    expect(del).toContain("its question is")
    expect(edit).toContain("in lower case")
    expect(tasks).toContain("appstreamcli validate --no-net")
  })

  it("keeps the toggle for a flag filter without a choice list", async () => {
    const blueprint = fixture()
    for (const feature of blueprint.features) if (feature.narrowsListBy === "flag") feature.choiceLists = []
    const packet = await compilePacket(blueprint, PRESET)
    expect(packet.failures).toEqual([])
    expect(find(packet.documents["TASKS.md"], "Narrow the list with")).toContain("GtkToggleButton")
  })

  it("names one filter pair per narrowing feature when two features narrow the list", async () => {
    const blueprint = fixture()
    const search = structuredClone(blueprint.features.find(feature => feature.narrowsListBy === "flag")!)
    Object.assign(search, {
      name: "Search teas by name",
      userOutcome: "The user narrows the collection list to teas whose name contains the typed text.",
      trigger: "The user types in the search field.",
      behavior: "The search field narrows the collection list to teas whose name contains the typed text, ignoring case.",
      failureOutcome: "If no tea name matches, the list shows no rows and the app keeps running.",
      acceptanceSignals: ["Typing a name shows only teas whose name contains it.", "Clearing the search shows every stored tea again."],
      choiceLists: [],
      narrowsListBy: "text",
    })
    blueprint.features.push(search)
    const packet = await compilePacket(blueprint, PRESET)
    expect(packet.failures).toEqual([])
    const tasks = packet.documents["TASKS.md"]
    const first = find(tasks, "You are the first main-surface task")
    expect(first).toContain("one pair per narrowing feature")
    expect(first).toContain("filter_selection_filter_teas_by_type")
    expect(first).toContain("row_filter_search_teas_by_name")
    expect(find(tasks, "Narrow the list with a GtkSearchEntry")).toContain("set_filter_selection_search_teas_by_name")
    expect(find(tasks, "Narrow the list with one single-choice GtkDropDown")).toContain("set_filter_selection_filter_teas_by_type")
  })
})
