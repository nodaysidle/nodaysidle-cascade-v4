import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import { buildBlueprintInstructions } from "../src/schema"
import type { SemanticBlueprint } from "../src/schema"

const trailGuide = JSON.parse(readFileSync(new URL("./fixtures/astro-trail-guide.json", import.meta.url), "utf8")) as SemanticBlueprint

// Round 10 (Trail Guide): difficulty easy|moderate|hard was a plain text field, so the kit schema took any string and the frozen seed said "Sample text".
describe("a stored field limited to a fixed set of values (round 10)", () => {
  const withChoices = (() => {
    const blueprint = structuredClone(trailGuide)
    blueprint.features[1]!.choiceLists = [{ name: "difficulty", options: ["easy", "moderate", "hard"], initial: "easy" }]
    return blueprint
  })()

  it("Astro: the content schema is an enum, the sample entry uses an allowed value, and the TRD names the set", async () => {
    const packet = await compilePacket(withChoices, "astro-web")
    expect(packet.failures).toEqual([])
    const config = packet.kit.find(file => file.name === "kit/src/content.config.ts")!.content
    expect(config).toContain('difficulty: z.enum(["easy", "moderate", "hard"])')
    const seed = packet.kit.find(file => file.name.startsWith("kit/src/content/trails/"))!.content
    // Quoted, so a YAML-special option (yes, no, on) stays a string.
    expect(seed).toContain('difficulty: "easy"')
    expect(packet.documents["TRD.md"]).toContain("difficulty (one of easy, moderate, hard)")
  })

  it("tells the provider that such a field gets a choice list named like the field", () => {
    expect(buildBlueprintInstructions({ idea: "Trail Guide." })).toContain("A stored text field whose value is one of a fixed set")
  })
})

// Round 10 (Trail Guide): the Design System promised --space-1..--space-8 and a 1.5 line-height; the kit global.css
// that TASK-01 freezes has neither. Every token the section names must be in the emitted stylesheet.
describe("Astro Design System matches the kit global.css (round 10)", () => {
  it("names only custom properties and values the kit stylesheet defines", async () => {
    const packet = await compilePacket(trailGuide, "astro-web")
    const css = packet.kit.find(file => file.name === "kit/src/styles/global.css")!.content
    for (const name of ["PRD.md", "TRD.md"] as const) {
      const doc = packet.documents[name]
      const section = doc.slice(doc.indexOf("## Design System"), doc.indexOf("\n## ", doc.indexOf("## Design System") + 1))
      expect(section).toContain("1.65")
      for (const token of section.match(/--[a-z][a-z0-9-]*/g) ?? []) expect(css, token).toContain(`${token}:`)
    }
  })
})
