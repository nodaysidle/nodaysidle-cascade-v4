import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
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
