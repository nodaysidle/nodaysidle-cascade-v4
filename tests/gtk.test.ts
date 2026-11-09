import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import type { SemanticBlueprint } from "../src/schema"
import { giftIdeasBlueprint, wineCellarBlueprint } from "./fixtures/gtkProducts"
import { ops, snippetLibraryBlueprint } from "./fixtures/gtkRecords"

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

  it("exposes a detail page only when a feature declares the item-page surface, else Edit and Delete live in the per-row action area", async () => {
    const { documents } = await compilePacket(snippetLibraryBlueprint, PRESET)
    const list = task(documents["TASKS.md"], "TASK-04-SNIPPET-LIST")
    expect(list).not.toMatch(/a detail view|pushes the detail page|AdwNavigationPage|AdwNavigationView that sits/)
    expect(list).toContain("there is no detail page and no AdwNavigationView")
    expect(list).toContain("a per-row action area")
    expect(task(documents["TASKS.md"], "TASK-07-EDIT-SNIPPET")).toContain("mount into the slots exposed by TASK-04")
    expect(task(documents["TASKS.md"], "TASK-07-EDIT-SNIPPET")).toContain("the per-row action area")

    const withDetail = structuredClone(snippetLibraryBlueprint)
    withDetail.features.push({ ...withDetail.features[0]!, name: "Snippet page", surface: "item-page", dataOperations: ops("Snippets", "read") })
    withDetail.ideaCoverage = [{ sentence: 1, features: withDetail.features.map(item => item.name), outsideFeatures: "none" }]
    const detail = await compilePacket(withDetail, PRESET)
    expect(detail.failures).toEqual([])
    const detailList = task(detail.documents["TASKS.md"], "TASK-04-SNIPPET-LIST")
    expect(detailList).toContain("AdwNavigationPage")
    expect(detailList).not.toContain("there is no detail page")

    const readOnly = structuredClone(snippetLibraryBlueprint)
    readOnly.features = readOnly.features.filter(feature => feature.name === "Snippet list")
    readOnly.ideaCoverage = [{ sentence: 1, features: ["Snippet list"], outsideFeatures: "none" }]
    const plain = await compilePacket(readOnly, PRESET)
    expect(task(plain.documents["TASKS.md"], "TASK-04-SNIPPET-LIST")).not.toMatch(/Edit button|Delete button|no detail page/)
  })

  it("injects the kit Clock into every feature that writes a stored date-time", async () => {
    const packet = await compilePacket(snippetLibraryBlueprint, PRESET)
    const tasks = packet.documents["TASKS.md"]
    for (const id of ["TASK-05-ADD-SNIPPET", "TASK-07-EDIT-SNIPPET"]) expect(task(tasks, id), id).toContain("Clock trait in src/platform/clock.rs")
    expect(task(tasks, "TASK-04-SNIPPET-LIST")).not.toContain("Time rule")
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
    expect(list).not.toContain("activating a row pushes the detail page")
    expect(list).toContain("Empty state: you own the empty-list message")
    expect(list).toContain("names the Add button")
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
    expect(mark).not.toContain("reuse the form fields")
    expect(mark).not.toContain("a failed edit")
    expect(mark).toContain("a failed mark leaves the row unchanged")
    expect(documents["TASKS.md"]).not.toContain("current_year")
    expect(task(documents["TASKS.md"], "TASK-04-UNBOUGHT-IDEA-LIST")).not.toContain("a detail view for the selected record")
  })

  it("exposes no filter slot, no no-match status and no filter-area wording when no later feature filters the list", async () => {
    const documents = await compile(giftIdeasBlueprint)
    const list = task(documents["TASKS.md"], "TASK-04-UNBOUGHT-IDEA-LIST")
    expect(list).not.toMatch(/filter area|GtkSearchEntry|no match/)
    expect(list).toContain("(empty state, errors)")
    expect(list).toContain("the status area is one label or AdwStatusPage above the list")
    const wine = task((await compile(wineCellarBlueprint))["TASKS.md"], "TASK-04-BOTTLE-LIST")
    expect(wine).toContain("the filter area is a GtkSearchEntry above the list")
    expect(wine).toContain("(empty state, no match, errors)")
  })

  it("states the validate signature, a GtkEntry for numbers and the search-task status wiring", async () => {
    const documents = await compile(wineCellarBlueprint)
    const add = task(documents["TASKS.md"], "TASK-05-ADD-BOTTLE")
    expect(add).toContain("validate_bottles(name: &str, vintage_year: &str, bottle_count: &str) returning Ok with NewBottles or Err(ValidationError)")
    expect(add).toContain("never set through a GtkSpinButton range")
    expect(add).toContain("a fixed range written as literals stays a constant")
    expect(task(documents["TASKS.md"], "TASK-08-SEARCH-BOTTLES")).toContain("clear-search button sits in the status area beside the no-match text")
  })

  it("keeps store-failure wording, delete leftovers and the kit composition function consistent across the docs", async () => {
    const wine = await compile(wineCellarBlueprint)
    expect(wine["TRD.md"]).toContain("update and delete return StoreError::NotFound")
    expect(wine["TRD.md"]).toContain("that toast is the only message for a store failure")
    expect(wine["TRD.md"]).toContain("build_services(data_dir: &Path) -> Services")
    expect(wine["TRD.md"]).toContain("a failed add or edit leaves its dialog open, and a failed removal leaves the row in the list")
    const gift = await compile(giftIdeasBlueprint)
    expect(gift["TRD.md"]).toContain("a failed add leaves its dialog open, and a failed mark leaves the row in the list")
    expect(gift["TRD.md"]).not.toMatch(/update and delete return|failed removal|failed edit/)
    expect(gift["TRD.md"]).toMatch(/update returns StoreError::NotFound/)
    const packet = await compilePacket(giftIdeasBlueprint, PRESET)
    expect(kitFile(packet, "src/app.rs")).toContain("pub fn build_services(")
  })

  it("lists the kit-shipped foundation test under Files to modify and in the Owner Map, never under both", async () => {
    const { documents } = await compilePacket(wineCellarBlueprint, PRESET)
    const foundation = task(documents["TASKS.md"], "TASK-01-FOUNDATION")
    expect(foundation).toMatch(/- Files to modify: tests\/contract_tests\.rs/)
    expect(foundation).not.toMatch(/- Files to create:[^\n]*tests\/contract_tests\.rs/)
    expect(documents["AGENTS.md"]).toMatch(/OWN-FOUNDATION[^\n]*modify tests\/contract_tests\.rs/)
  })

  it("ends the metainfo summary on a clause, never mid-phrase", async () => {
    const blueprint = structuredClone(snippetLibraryBlueprint)
    blueprint.summary = "Password Hints stores short reminders about what a password is for, never the password itself."
    const packet = await compilePacket(blueprint, PRESET)
    expect(kitFile(packet, "resources/com.snippet.library.metainfo.xml")).toContain("<summary>Password Hints stores short reminders about what a password is for</summary>")
  })
})
