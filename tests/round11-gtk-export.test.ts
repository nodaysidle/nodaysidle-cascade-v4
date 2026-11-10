import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import type { SemanticBlueprint } from "../src/schema"

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as SemanticBlueprint

function section(text: string, heading: string): string {
  const start = text.indexOf(heading)
  expect(start).toBeGreaterThan(-1)
  const next = text.indexOf("\n### ", start + 1)
  return text.slice(start, next === -1 ? undefined : next)
}

// Round 11 (Book Shelf): the CSV export document became a SQLite table with a store trait, the export task had no
// serializer, save dialog, atomic write or cancel rule, and the 1..5 rating choice list was a typed GtkEntry.
describe("GTK document export path and numeric choice picker (round 11, Book Shelf)", () => {
  it("an export document is a file written through write_atomic, not a SQLite table or store", async () => {
    const packet = await compilePacket(load("gtk-book-shelf.json"), "linux-wayland-gtk4-desktop")
    expect(packet.failures).toEqual([])
    const trd = packet.documents["TRD.md"]
    const tasks = packet.documents["TASKS.md"]
    expect(trd).not.toContain("books_csv_export (id INTEGER")
    expect(trd).not.toContain("BooksCsvExportStore")
    expect(trd).not.toContain("NewBooksCsvExport")
    const data = section(trd, "### CON-DATA-BOOKS-CSV-EXPORT")
    expect(data).toContain("not a record")
    expect(data).toContain("write_books_csv_export(path: &Path, content: &str)")
    expect(data).toContain("write_atomic")
    expect(data).not.toContain("a failed add leaves its dialog open")

    const permission = section(tasks, "### TASK-07-PERMISSION-COORDINATOR")
    expect(permission).toContain("choose_save_path")
    expect(permission).toContain("returning an Option of PathBuf")
    expect(permission).toContain("gtk::FileChooserNative")
    expect(permission).toContain("v4_10")

    const exportTask = section(tasks, "### TASK-08-SAVE-BOOKS-TO-CSV")
    expect(exportTask).toContain("serialize_books_csv_export(")
    expect(exportTask).toContain("RFC 4180")
    expect(exportTask).toContain("\\r\\n")
    expect(exportTask).toContain("'title,author,rating,favorite,added'")
    expect(exportTask).toContain("choose_save_path")
    expect(exportTask).toContain("write_books_csv_export")
    expect(exportTask).toMatch(/returns None.*writes nothing/)
    expect(exportTask).not.toContain("a failed add keeps its dialog open")
    expect(exportTask).not.toContain("bound that depends on today's date")
  })

  it("a numeric choice list is a GtkDropDown of its options starting at the initial option", async () => {
    const packet = await compilePacket(load("gtk-book-shelf.json"), "linux-wayland-gtk4-desktop")
    const trd = packet.documents["TRD.md"]
    const tasks = packet.documents["TASKS.md"]
    const iface = section(trd, "### CON-ADD-BOOK-INTERFACE")
    expect(iface).toContain("Form: rating is a GtkDropDown of 1, 2, 3, 4, 5 that starts at 3")
    const add = section(tasks, "### TASK-05-ADD-BOOK")
    expect(add).toContain("rating is a GtkDropDown")
    expect(add).toContain("1, 2, 3, 4, 5")
    expect(add).toContain("starts at 3")
    expect(add).not.toContain("a number is typed in a GtkEntry")
  })
})
