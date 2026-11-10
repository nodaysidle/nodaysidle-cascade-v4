import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { applyEdits, buildFixPrompt, touchedKit, writePacketEdits } from "../scripts/agent-ready/fix"
import { buildReviewPrompt, quoteFound, readPacket } from "../scripts/agent-ready/review"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function packet(): string {
  const root = mkdtempSync(join(tmpdir(), "cascade-review-"))
  roots.push(root)
  const folder = join(root, "astro-web", "tea-shop")
  mkdirSync(join(folder, "kit", "src"), { recursive: true })
  for (const name of ["PRD.md", "ARD.md", "TRD.md", "TASKS.md", "AGENTS.md"]) writeFileSync(join(folder, name), `# ${name}\nThe list shows\n  every tea.\n`)
  writeFileSync(join(folder, "kit", "src", "page.astro"), "<h1>Teas</h1>\n")
  writeFileSync(join(folder, "kit", "icon.png"), Buffer.from([137, 80, 78, 71, 0, 1]))
  writeFileSync(join(folder, "kit", "package-lock.json"), "{}")
  writeFileSync(join(folder, "blueprint.json"), "{}")
  return folder
}

describe("packet review tool", () => {
  it("reads the five documents and the kit's text files, and names what it leaves out", () => {
    const { files, notShown } = readPacket(packet())
    expect(files.map(file => file.path)).toEqual(["PRD.md", "ARD.md", "TRD.md", "TASKS.md", "AGENTS.md", "kit/src/page.astro"])
    expect(notShown.map(item => item.split(" ")[0])).toEqual(["blueprint.json", "kit/icon.png", "kit/package-lock.json"])
  })

  it("puts the idea, the preset and every file into the request", () => {
    const folder = packet()
    const { files, notShown } = readPacket(folder)
    const prompt = buildReviewPrompt(folder, "Tea Shop lists teas.", files, notShown)
    expect(prompt).toContain('<file path="kit/src/page.astro">\n<h1>Teas</h1>')
    expect(prompt).toContain('Preset: astro-web. The user\'s idea: "Tea Shop lists teas."')
    expect(prompt).toContain("kit/icon.png (binary)")
    expect(prompt).not.toContain("<idea>")
  })

  it("accepts a quote only when some file holds it, whatever the line breaks", () => {
    const { files } = readPacket(packet())
    expect(quoteFound("The list shows every tea.", files)).toBe(true)
    expect(quoteFound("The list shows every coffee.", files)).toBe(false)
    expect(quoteFound("  ", files)).toBe(false)
  })
})

describe("packet repair tool", () => {
  const files = [{ path: "PRD.md", text: "The class is normal. The class is normal." }, { path: "kit/a.rs", text: "let floor = 5;" }]
  const edit = (file: string, find: string, replace: string, all = false) => ({ finding: 1, file, find, replace, all })

  it("replaces exact text, once or everywhere as the edit says", () => {
    const result = applyEdits(files, [edit("kit/a.rs", "floor = 5", "floor = 2"), edit("PRD.md", "is normal", "is critical", true)])
    expect(result.failed).toEqual([])
    expect(result.files).toEqual([{ path: "PRD.md", text: "The class is critical. The class is critical." }, { path: "kit/a.rs", text: "let floor = 2;" }])
  })

  it("reports an edit that does not match as it says and leaves the file alone", () => {
    const result = applyEdits(files, [edit("PRD.md", "is normal", "is critical"), edit("PRD.md", "is stale", "x"), edit("TRD.md", "a", "b"), edit("kit/a.rs", "", "x")])
    expect(result.failed.map(item => item.reason)).toEqual(["the find text occurs 2 times and all is false", "the find text is not in the file", "no such file in the packet", "the find text is not in the file"])
    expect(result.files).toEqual(files)
  })

  it("gives the model the files, the idea and each numbered finding", () => {
    const prompt = buildFixPrompt("Disk Free shows free space.", "linux-hyprland-waybar-module", files, [{ where: "PRD.md", quote: "The class is normal.", why: "It is below the limit.", fix: "Say critical." }])
    expect(prompt).toContain('<file path="kit/a.rs">\nlet floor = 5;')
    expect(prompt).toContain('The user\'s idea: "Disk Free shows free space."')
    expect(prompt).toContain("1. Where: PRD.md\n   Quote: The class is normal.")
    expect(prompt).toContain("create")
    expect(prompt).toContain("move")
    expect(prompt).toContain("delete")
  })

  it("creates, moves and deletes kit files and updates the packet folder on disk", () => {
    const folder = packet()
    const before = readPacket(folder).files
    const edits = [
      { finding: 1, op: "move" as const, file: "kit/src/page.astro", to: "kit/src/pages/author/[slug].astro", find: "<h1>Teas</h1>", replace: "<h1>Author</h1>", all: false },
      { finding: 1, op: "create" as const, file: "kit/src/lib/helper.ts", find: "", replace: "export const ok = true\n", all: false },
      { finding: 1, op: "delete" as const, file: "kit/src/lib/helper.ts", find: "", replace: "", all: false },
      { finding: 1, op: "create" as const, file: "kit/src/lib/kept.ts", find: "", replace: "export const kept = 1\n", all: false },
    ]
    const result = applyEdits(before, edits)
    expect(result.failed).toEqual([])
    expect(touchedKit(edits, result.failed)).toBe(true)
    expect(result.files.map(file => file.path)).toEqual(["PRD.md", "ARD.md", "TRD.md", "TASKS.md", "AGENTS.md", "kit/src/lib/kept.ts", "kit/src/pages/author/[slug].astro"])
    writePacketEdits(folder, before, result.files)
    expect(existsSync(join(folder, "kit", "src", "page.astro"))).toBe(false)
    expect(readFileSync(join(folder, "kit", "src", "pages", "author", "[slug].astro"), "utf8")).toBe("<h1>Author</h1>\n")
    expect(readFileSync(join(folder, "kit", "src", "lib", "kept.ts"), "utf8")).toBe("export const kept = 1\n")
  })

  it("rejects invalid file operations without touching the files", () => {
    const result = applyEdits(files, [
      { finding: 1, op: "create", file: "PRD.md", find: "", replace: "x", all: false },
      { finding: 1, op: "create", file: "../escape.txt", find: "", replace: "x", all: false },
      { finding: 1, op: "move", file: "kit/a.rs", to: "PRD.md", find: "", replace: "", all: false },
      { finding: 1, op: "move", file: "kit/a.rs", find: "", replace: "", all: false },
      { finding: 1, op: "delete", file: "PRD.md", find: "", replace: "", all: false },
      { finding: 1, op: "delete", file: "kit/missing.rs", find: "", replace: "", all: false },
    ])
    expect(result.failed.map(item => item.reason)).toEqual([
      "the file already exists in the packet",
      "invalid packet file path",
      "the target file already exists in the packet",
      "move requires a valid target path in to",
      "cannot delete a required contract document",
      "no such file in the packet",
    ])
    expect(result.files).toEqual(files)
    expect(touchedKit([{ finding: 1, file: "PRD.md", find: "is normal", replace: "is critical", all: true }], [])).toBe(false)
  })
})
