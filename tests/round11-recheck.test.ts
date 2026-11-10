import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { auditCapabilities } from "../src/capabilities"
import { compilePacket } from "../src/compiler"
import { PRESETS } from "../src/presets"
import { auditSemanticIntake, type SemanticBlueprint } from "../src/schema"

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as SemanticBlueprint

// Round 11 re-audit: findings left after the four class fixes merged.
describe("round 11 re-audit", () => {
  it("Reading List: a create feature that offers status while its text says status is not entered is sent back", () => {
    const rules = auditSemanticIntake(load("tauri-reading-list.json")).map(issue => issue.rule)
    expect(rules).toContain("semantic.choice-not-entered")
    const fixed = load("tauri-reading-list.json")
    for (const feature of fixed.features) feature.behavior = feature.behavior.replace(/The status is not entered; a new article starts as unread\./g, "The status is chosen from unread, reading, done, initially unread.")
    expect(auditSemanticIntake(fixed).map(issue => issue.rule)).not.toContain("semantic.choice-not-entered")
  })

  it("Temp Watch: a peak that resets when the process starts is sent back, and the repair wording passes", () => {
    const blueprint = load("waybar-temp-watch.json")
    const issues = auditCapabilities(blueprint, PRESETS["linux-hyprland-waybar-module"])
    const reset = issues.find(issue => issue.rule === "capability.waybar-reset-at-start")!
    expect(reset.path).toMatch(/^dataObjects\[0\]/)
    const wording = reset.message.slice(reset.message.indexOf("Write instead: ") + "Write instead: ".length)
    blueprint.dataObjects[0]!.retentionIntent = `Keeps only the latest reading and the peak; ${wording}`
    expect(auditCapabilities(blueprint, PRESETS["linux-hyprland-waybar-module"]).map(issue => issue.rule)).not.toContain("capability.waybar-reset-at-start")
  })

  it("Waybar kit: a successful refresh writes the severity class into the cache, so the label never sets it", async () => {
    const packet = await compilePacket(load("waybar-temp-watch.json"), "linux-hyprland-waybar-module")
    const module = packet.kit.find(file => file.name === "kit/src/module.rs")!.content
    expect(module).toContain("output.class = String::from(severity_class(output.value));\n            }\n            write_cache(cache_path, &output, now)")
  })
})
