import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import { buildBlueprintInstructions, type SemanticBlueprint } from "../src/schema"

const load = (name: string): SemanticBlueprint => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8")) as SemanticBlueprint
const task = (tasks: string, id: string): string => tasks.split("### ").find(block => block.startsWith(id)) ?? ""
const TAURI = "tauri2-rust-typescript-desktop"
const GTK = "linux-wayland-gtk4-desktop"
const linux = { linuxPackaging: "binary", wayland: true } as const

// Round 11: a field with an initial value that the create feature also offers (a choice list, a toggle) was called app-set,
// while the same task built a picker for it (Reading List status) or the PRD put a toggle on the Add form (Book Shelf favorite).
// Rule: a field a create feature offers is an input that starts at its initial value; app-set only when no create feature offers it.
describe("initial value vs create-feature input (round 11)", () => {
  it("Tauri Reading List: the add form offers status as a picker starting at unread, never app-set", async () => {
    const packet = await compilePacket(load("tauri-reading-list"), TAURI, linux)
    expect(packet.failures).toEqual([])
    const add = task(packet.documents["TASKS.md"], "TASK-05-ADD-ARTICLE")
    expect(add).toContain("(title (text), link (text), status (text)) and no others")
    expect(add).toContain("status: unread, reading, done; initially unread")
    expect(add).not.toMatch(/sets status[^.]*itself on create/)
    expect(add).not.toContain("(no input; the value is a constant of your file)")
    const trd = packet.documents["TRD.md"]
    expect(trd).not.toContain('status is set to "unread" by the app')
    expect(trd).not.toContain('set to "unread" by the app when the record is created')
    expect(trd).toContain('status (one of unread, reading, done, starting at "unread" on the add form)')
  })

  it("Tauri Reading List: the edit task sends the form's edited values, not only one changed field", async () => {
    const packet = await compilePacket(load("tauri-reading-list"), TAURI, linux)
    const edit = task(packet.documents["TASKS.md"], "TASK-06-CHANGE-ARTICLE-STATUS")
    expect(edit).not.toContain("with only the field your behavior changes replaced")
    expect(edit).toContain("with every field the edit form shows replaced by its value")
  })

  it("GTK Book Shelf: the add form offers the favorite toggle starting off", async () => {
    const packet = await compilePacket(load("gtk-book-shelf"), GTK)
    const add = task(packet.documents["TASKS.md"], "TASK-05-ADD-BOOK")
    expect(add).toContain("validate_books(title: &str, author: &str, rating: &str, favorite: bool)")
    expect(add).toContain("favorite is a GtkCheckButton that starts off")
    expect(add).not.toMatch(/sets favorite to "false" itself/)
    expect(packet.documents["TRD.md"]).not.toContain('set to "false" by the app when the record is created')
  })

  it("keeps a field with an initial value that no create feature offers app-set", async () => {
    const shelf = load("gtk-book-shelf")
    const addBook = shelf.features.find(feature => feature.name === "Add book")!
    addBook.behavior = addBook.behavior.replace("Opens a dialog with inputs for title, author, rating from 1 to 5, and a favorite toggle.", "Opens a dialog with inputs for title, author, and rating from 1 to 5.").replace(" The favorite toggle starts off.", " A new book is not a favorite.")
    const gtkAdd = task((await compilePacket(shelf, GTK)).documents["TASKS.md"], "TASK-05-ADD-BOOK")
    expect(gtkAdd).toContain('sets favorite to "false" itself inside validate')
    expect(gtkAdd).toContain("validate_books(title: &str, author: &str, rating: &str)")

    const reading = load("tauri-reading-list")
    reading.features.find(feature => feature.name === "Add article")!.choiceLists = []
    const tauriAdd = task((await compilePacket(reading, TAURI, linux)).documents["TASKS.md"], "TASK-05-ADD-ARTICLE")
    expect(tauriAdd).toContain('The app sets status = "unread" itself on create')
    expect(tauriAdd).toContain("(title (text), link (text)) and no others")
  })

  it("tells the provider a create-feature choice list makes the field an input", () => {
    const text = buildBlueprintInstructions({ idea: "Reading List." })
    expect(text).toContain("unless the feature that creates the record offers the field")
    expect(text).toContain("put it on the feature that creates the record only when its add form lets the user pick the value")
  })
})
