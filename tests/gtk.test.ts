import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import type { SemanticBlueprint } from "../src/schema"
import { giftIdeasBlueprint, wineCellarBlueprint } from "./fixtures/gtkProducts"
import { snippetLibraryBlueprint } from "./fixtures/gtkRecords"

const PRESET = "linux-wayland-gtk4-desktop"

const task = (tasks: string, id: string): string => tasks.split("### ").find(block => block.startsWith(id)) ?? ""
const kitFile = (packet: Awaited<ReturnType<typeof compilePacket>>, name: string): string => packet.kit.find(file => file.name === `kit/${name}`)?.content ?? ""

// The same product with a settings object and a background feature, to show the optional parts come back.
function withSettingsAndBackground(): SemanticBlueprint {
  const blueprint = structuredClone(snippetLibraryBlueprint)
  blueprint.dataObjects.push({ name: "Preferences", purpose: "The user's display choices.", sensitivity: "personal", retentionIntent: "Keep until reset.", storage: "settings", writeMode: "atomic-replace", singleRecord: false, fields: [{ name: "Sort order", valueType: "text", optional: false }] })
  blueprint.features[0]!.usesData = ["Snippets", "Preferences"]
  blueprint.features[0]!.dataOperations = [{ data: "Snippets", operations: ["read"] }, { data: "Preferences", operations: ["read", "update"] }]
  blueprint.features[0]!.usesPlatformNeeds = ["local-storage", "background-execution"]
  blueprint.platformNeeds = ["local-storage", "background-execution"]
  return blueprint
}

describe("GTK packet for an offline records app with no settings", () => {
  it("reaches Gate Clean", async () => {
    const packet = await compilePacket(snippetLibraryBlueprint, PRESET)
    expect(packet.failures).toEqual([])
  })

  it("names settings, credentials, notifications, systemd and the portal only when declared", async () => {
    const packet = await compilePacket(snippetLibraryBlueprint, PRESET)
    const docs = Object.values(packet.documents).join("\n")
    expect(docs).not.toMatch(/settings\.json|theme|Secret Service|notification|systemd|FileChooser|desktop portal|HTTPS client|grouped rows/i)
    expect(docs).toContain("No settings are declared")
    const kit = packet.kit.map(file => file.name)
    expect(kit).not.toContain("kit/src/config.rs")
    expect(kit).not.toContain("kit/src/platform/credentials.rs")
    expect(kit).not.toContain("kit/src/platform/http.rs")
    const kitText = packet.kit.map(file => file.content).join("\n")
    expect(kitText).not.toMatch(/theme|settings_path|systemctl|dbus|keyring|reqwest/)
    expect(kitFile(packet, "src/lib.rs")).not.toContain("config")
    expect(kitFile(packet, "README.md")).toContain("declares no settings")
  })

  it("brings settings and the systemd unit back when the blueprint declares them", async () => {
    const packet = await compilePacket(withSettingsAndBackground(), PRESET)
    expect(packet.failures).toEqual([])
    expect(packet.kit.map(file => file.name)).toContain("kit/src/config.rs")
    expect(kitFile(packet, "tests/contract_tests.rs")).toContain("settings_default_is_stable")
    expect(kitFile(packet, "scripts/package.sh")).toContain("systemctl")
    expect(packet.documents["TRD.md"]).toContain("settings.json")
    expect(packet.documents["TRD.md"]).toContain("systemd user unit")
  })

  it("gives the first main-surface task a detail view with Edit and Delete, and hands each control to its feature task", async () => {
    const { documents } = await compilePacket(snippetLibraryBlueprint, PRESET)
    const list = task(documents["TASKS.md"], "TASK-04-SNIPPET-LIST")
    expect(list).toContain("shows every stored field and holds an Edit button and a Delete button")
    expect(list).toContain("AdwNavigationPage")
    expect(task(documents["TASKS.md"], "TASK-07-EDIT-SNIPPET")).toContain("mount into the slots exposed by TASK-04")

    const readOnly = structuredClone(snippetLibraryBlueprint)
    readOnly.features = readOnly.features.filter(feature => feature.name === "Snippet list")
    readOnly.ideaCoverage = [{ sentence: 1, features: ["Snippet list"], outsideFeatures: "none" }]
    const plain = await compilePacket(readOnly, PRESET)
    expect(task(plain.documents["TASKS.md"], "TASK-04-SNIPPET-LIST")).not.toMatch(/Edit button|Delete button/)
  })

  it("injects the kit Clock into every feature that writes a stored date-time", async () => {
    const packet = await compilePacket(snippetLibraryBlueprint, PRESET)
    const tasks = packet.documents["TASKS.md"]
    for (const id of ["TASK-04-SNIPPET-LIST", "TASK-05-ADD-SNIPPET", "TASK-07-EDIT-SNIPPET"]) expect(task(tasks, id), id).toContain("Clock trait in src/platform/clock.rs")
    expect(task(tasks, "TASK-06-DELETE-SNIPPET")).not.toContain("Time rule")
    expect(kitFile(packet, "src/platform/clock.rs")).toContain("fn now_millis")
    expect(kitFile(packet, "src/platform/mod.rs")).toContain("pub mod clock;")
  })

  it("tells the data owner how to number the first migration", async () => {
    const { documents } = await compilePacket(snippetLibraryBlueprint, PRESET)
    const data = task(documents["TASKS.md"], "TASK-02-DATA-STORE")
    expect(data).toContain("Database::connection()")
    expect(data).toContain("when user_version is below 2")
    expect(documents["TRD.md"]).toContain("i64 epoch milliseconds")
    expect(documents["TRD.md"]).not.toContain("JSON text column")
  })

  it("defines text trimming and length counting once, as a deterministic rule", async () => {
    const { documents } = await compilePacket(snippetLibraryBlueprint, PRESET)
    expect(documents["TRD.md"]).toContain("Unicode scalar values")
    expect(documents["TRD.md"]).toContain("trimming surrounding whitespace")
  })

  it("lists the kit-copied foundation files to verify, not to create", async () => {
    const { documents } = await compilePacket(snippetLibraryBlueprint, PRESET)
    const foundation = task(documents["TASKS.md"], "TASK-01-FOUNDATION")
    expect(foundation).toMatch(/- Files to verify \(kit-copied before this task\): Cargo\.toml;/)
    expect(foundation).not.toMatch(/- Files to create: Cargo\.toml/)
    expect(foundation).toContain("except tests/contract_tests.rs, which you extend")
  })
})

describe("GTK packet precision for search, forms, store interface and lifecycle", () => {
  const compile = async (blueprint: SemanticBlueprint) => {
    const packet = await compilePacket(blueprint, PRESET)
    expect(packet.failures).toEqual([])
    return packet.documents
  }

  it("owns the status, filter, dialog shell and detail slots, and hands the form to the add task", async () => {
    const documents = await compile(wineCellarBlueprint)
    const list = task(documents["TASKS.md"], "TASK-04-BOTTLE-LIST")
    expect(list).toContain("an empty AdwDialog shell")
    expect(list).toContain("the status area is one label or AdwStatusPage")
    expect(list).toContain("the filter area is a GtkSearchEntry")
    expect(list).toContain("activating a row pushes the detail page")
    expect(task(documents["TASKS.md"], "TASK-05-ADD-BOTTLE")).toContain("validate function in your own file and export both")
    const edit = task(documents["TASKS.md"], "TASK-06-EDIT-BOTTLE")
    expect(edit).toContain("reuse the form fields and validation that the add task exports")
    expect(edit).toMatch(/Dependencies: [^\n]*TASK-05-ADD-BOTTLE/)
    expect(task(documents["TASKS.md"], "TASK-08-SEARCH-BOTTLES")).toContain("no-match message in the shared status area")
  })

  it("derives the store signatures, typed error, integer widths and column names from declared fields", async () => {
    const trd = (await compile(wineCellarBlueprint))["TRD.md"]
    expect(trd).toContain("insert(&self, new: NewBottles) returns Ok with the stored Bottles")
    expect(trd).toContain("StoreError")
    expect(trd).toContain("vintage_year INTEGER NOT NULL")
    expect(trd).toContain("table bottles")
    expect(trd).toContain("close(&self)")
  })

  it("makes the lifecycle coordinator depend on the data store and close it through DataStore::close", async () => {
    const documents = await compile(wineCellarBlueprint)
    const lifecycle = task(documents["TASKS.md"], "TASK-03-LIFECYCLE-COORDINATOR")
    expect(lifecycle).toMatch(/Dependencies: [^\n]*TASK-02-DATA-STORE/)
    expect(lifecycle).toContain("Depend only on OWN-DATA-STORE")
    expect(documents["TRD.md"]).toContain("DataStore::close")
  })

  it("passes the current year to a bounded number validator and names the write-failure toast", async () => {
    const documents = await compile(wineCellarBlueprint)
    for (const id of ["TASK-05-ADD-BOTTLE", "TASK-06-EDIT-BOTTLE"]) expect(task(documents["TASKS.md"], id), id).toContain("current_year: i32")
    expect(task(documents["TASKS.md"], "TASK-07-REMOVE-BOTTLE")).not.toContain("current_year")
    expect(task(documents["TASKS.md"], "TASK-05-ADD-BOTTLE")).toContain("AdwToast")
    expect(documents["TRD.md"]).toContain("shows an AdwToast")
    expect(documents["TRD.md"]).not.toMatch(/rebuild path|without duplicating the record/)
  })

  it("uses the adw::Application marker the kit contains, one gate wording, and lists tracing-subscriber", async () => {
    const documents = await compile(wineCellarBlueprint)
    expect(task(documents["TASKS.md"], "TASK-01-FOUNDATION")).toContain("adw::Application")
    expect(documents["TRD.md"]).toContain("tracing-subscriber")
    for (const name of ["TRD.md", "TASKS.md", "AGENTS.md"] as const)expect(documents[name], name).toContain("Arch host only: makepkg --printsrcinfo")
    expect(documents["AGENTS.md"]).not.toMatch(/Run `makepkg --printsrcinfo` and require exit status zero/)
  })

  it("gives a mark-only product no form reuse, and no current-year parameter without a numeric field", async () => {
    const documents = await compile(giftIdeasBlueprint)
    const mark = task(documents["TASKS.md"], "TASK-06-MARK-IDEA-BOUGHT")
    expect(mark).toContain("a single mark or toggle action needs no form")
    expect(mark).toContain("a failed mark leaves the row unchanged")
    expect(documents["TASKS.md"]).not.toContain("current_year")
    expect(task(documents["TASKS.md"], "TASK-04-UNBOUGHT-IDEA-LIST")).not.toContain("a detail view for the selected record")
  })
})
