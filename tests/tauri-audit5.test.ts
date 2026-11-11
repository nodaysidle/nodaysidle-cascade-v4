import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import { auditSemanticIntake, type SemanticBlueprint } from "../src/schema"

const PRESET = "tauri2-rust-typescript-desktop"
const linux = { linuxPackaging: "binary", wayland: true } as const
const load = (name: string): SemanticBlueprint => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8")) as SemanticBlueprint
const task = (tasks: string, id: string): string => tasks.split("### ").find(block => block.startsWith(id)) ?? ""
const kitFile = (packet: Awaited<ReturnType<typeof compilePacket>>, name: string): string => packet.kit.find(file => file.name === `kit/${name}`)?.content ?? ""

// Round 5 provider output plus the two fields the compiler now asks for: the app-set state and the live refresh.
const recipeTimer = (): SemanticBlueprint => {
  const blueprint = load("tauri-recipe-timer")
  blueprint.dataObjects[0]!.fields.find(field => field.name === "state")!.initial = "Not started"
  blueprint.features.find(feature => feature.name === "Start and count down timer")!.refreshesEverySeconds = 1
  return blueprint
}

describe("Tauri audit round 5: recipe timer", () => {
  it("gives the list a per-row render hook and the countdown task a registration for it", async () => {
    const packet = await compilePacket(recipeTimer(), PRESET, linux)
    expect(packet.failures).toEqual([])
    const tasks = packet.documents["TASKS.md"]
    const list = task(tasks, "TASK-04-TIMER-LIST")
    expect(list).toContain('a per-row action area on every list row, built with slots.row("row-actions", record)')
    expect(list).toContain('slots.mountRow("row-actions", render)')
    expect(list).not.toContain('slots.host("row-actions")')
    const countdown = task(tasks, "TASK-06-START-AND-COUNT-DOWN-TIMER")
    expect(countdown).toContain('register slots.mountRow("row-actions", render)')
    expect(countdown).toContain("renders inside that control next to a Retry button")
    expect(kitFile(packet, "src/store.ts")).toContain("mountRow")
    expect(kitFile(packet, "tests/store.test.ts")).toContain("once per row")
  })

  it("makes the countdown own its injected clock and tick, and fixes the persisted versus derived convention", async () => {
    const packet = await compilePacket(recipeTimer(), PRESET, linux)
    const countdown = task(packet.documents["TASKS.md"], "TASK-06-START-AND-COUNT-DOWN-TIMER")
    expect(countdown).toContain("the shared view state (the store), now")
    expect(countdown).toContain("an injectable interval function every(callback, ms)")
    expect(countdown).toContain("calls every with 1000 ms")
    expect(countdown).toContain("is derived for display from the stored timestamps and now() and is never saved")
    expect(countdown).toContain("rounded up to whole seconds")
    expect(countdown).toContain("write no local-parts test")
    expect(packet.documents["TRD.md"]).toContain('state is set to "Not started" by the app on create and never typed by the user')
  })

  it("keeps the app-set state out of the add form and lets the add task own the form", async () => {
    const tasks = (await compilePacket(recipeTimer(), PRESET, linux)).documents["TASKS.md"]
    const add = task(tasks, "TASK-05-ADD-TIMER")
    expect(add).toContain("(name (text), minutes (whole-number)) and no others")
    expect(add).not.toContain("state (text)")
    expect(add).toContain('The app sets state = "Not started" itself on create')
    expect(add).toContain('You own the whole add flow because the shared screen has no form shell')
    expect(add).not.toContain("or form shell (the packet has none)")
    const list = task(tasks, "TASK-04-TIMER-LIST")
    expect(list).toContain('an "add" area where the add task mounts its own Add button and the form it opens')
    expect(list).not.toContain("opens the entry form shell")
  })

  it("does not list a command and forbid its use, and states the table and launch contracts", async () => {
    const packet = await compilePacket(recipeTimer(), PRESET, linux)
    const tasks = packet.documents["TASKS.md"]
    const countdown = task(tasks, "TASK-06-START-AND-COUNT-DOWN-TIMER")
    expect(countdown).toContain("update_timers(id, input)")
    expect(countdown).not.toContain("list_timers()")
    expect(countdown).toContain("patching it with the record your command returns")
    expect(task(tasks, "TASK-04-TIMER-LIST")).toContain("list_timers()")
    expect(packet.documents["TRD.md"]).toContain("CREATE TABLE timers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, minutes INTEGER NOT NULL, state TEXT NOT NULL, createdat TEXT NOT NULL, startedat TEXT, endsat TEXT)")
    const lifecycle = task(tasks, "TASK-03-LIFECYCLE-COORDINATOR")
    expect(lifecycle).toContain("drops that connection, returns nothing on success")
    expect(lifecycle).toContain("kit_tests.rs is listed only as the shared registration file")
  })

  it("states one write-failure notice when the PRD gives none", async () => {
    const tasks = (await compilePacket(recipeTimer(), PRESET, linux)).documents["TASKS.md"]
    expect(task(tasks, "TASK-05-ADD-TIMER")).toContain('show the fixed notice "Could not save the change. Try again."')
  })
})

describe("Tauri audit round 5: contact book", () => {
  it("builds the form, detail actions, and handlers as named hooks, with no unused row slot", async () => {
    const packet = await compilePacket(load("tauri-contact-book"), PRESET, linux)
    expect(packet.failures).toEqual([])
    const tasks = packet.documents["TASKS.md"]
    const list = task(tasks, "TASK-04-CONTACT-LIST")
    expect(list).toContain('slots.host("status"), slots.host("form"), slots.host("detail"), slots.host("detail-actions"), slots.host("filter")')
    expect(list).not.toContain("row-actions")
    expect(list).not.toContain("inert")
    expect(list).toContain('slots.run(store.get().form)')
    expect(list).not.toContain("get_contacts")
    const add = task(tasks, "TASK-05-ADD-CONTACT")
    expect(add).toContain('Mount the inputs into slots.host("form")')
    expect(add).toContain('slots.handle("add", submit)')
    const edit = task(tasks, "TASK-07-EDIT-CONTACT")
    expect(edit).toContain('mount it into slots.host("detail-actions")')
    expect(edit).toContain('slots.handle("edit", submit)')
    const remove = task(tasks, "TASK-06-DELETE-CONTACT")
    expect(remove).toContain('mount it into slots.host("detail-actions")')
    expect(remove).toContain("the list rows have no delete control")
    expect(remove).not.toContain("row-actions")
  })

  it("states fixed write-failure notices for add, edit, and delete", async () => {
    const tasks = (await compilePacket(load("tauri-contact-book"), PRESET, linux)).documents["TASKS.md"]
    for (const id of ["TASK-05-ADD-CONTACT", "TASK-07-EDIT-CONTACT"]) expect(task(tasks, id)).toContain('show the fixed notice "Could not save the change. Try again."')
    expect(task(tasks, "TASK-06-DELETE-CONTACT")).toContain('show the fixed notice "Could not remove the item. Try again."')
  })
})

describe("Tauri audit round 5: shared conventions", () => {
  it("rejects an initial value that does not fit the field type", () => {
    const bad = recipeTimer()
    bad.dataObjects[0]!.fields.find(field => field.name === "minutes")!.initial = "soon"
    expect(auditSemanticIntake(bad).map(issue => issue.rule)).toContain("semantic.initial-value-type")
    expect(auditSemanticIntake(recipeTimer()).map(issue => issue.rule)).not.toContain("semantic.initial-value-type")
  })

  it("states the delete confirmation default, the empty-state title, the trim rule, and the renamed wire key", async () => {
    const packet = await compilePacket(load("tauri-contact-book"), PRESET, linux)
    const tasks = packet.documents["TASKS.md"]
    expect(task(tasks, "TASK-06-DELETE-CONTACT")).toContain('the message `Delete "${record.name}"?`')
    expect(task(tasks, "TASK-04-CONTACT-LIST")).toContain("emptyState(title)")
    expect(task(tasks, "TASK-04-CONTACT-LIST")).toContain("a filter over zero saved records shows that empty-list text")
    expect(packet.documents["TRD.md"]).toContain("the stored field phoneNumber is the key phonenumber")
    expect(packet.documents["TRD.md"]).toContain("the form trims every text input")
    expect(kitFile(packet, "src/ui.ts")).toContain('hint = ""')
  })

  it("keeps packaging's shared-file rule and the launch signature unambiguous", async () => {
    const tasks = (await compilePacket(load("tauri-contact-book"), PRESET, linux)).documents["TASKS.md"]
    expect(task(tasks, "TASK-09-PACKAGING")).toContain("the one listed shared file you always modify")
    expect(task(tasks, "TASK-03-LIFECYCLE-COORDINATOR")).toContain("launch(folder: &Path)")
  })
})
