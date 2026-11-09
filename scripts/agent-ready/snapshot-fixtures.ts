// Prints one hash line per fixture packet (documents + kit), to prove a refactor left compiler output unchanged.
// Usage: npx tsx scripts/agent-ready/snapshot-fixtures.ts > before.txt; (change); ... > after.txt; diff before.txt after.txt
import { createHash } from "node:crypto"
import { readdirSync } from "node:fs"
import { compilePacket } from "../../src/compiler"
import { PRESET_IDS, type PresetId } from "../../src/presets"
import type { SemanticBlueprint } from "../../src/schema"

const isBlueprint = (value: unknown): value is SemanticBlueprint =>
  !!value && typeof value === "object" && "productName" in value && "features" in value && "ideaCoverage" in value
const seen = new Set<string>()
for (const file of readdirSync("tests/fixtures").filter(name => name.endsWith(".ts")).sort()) {
  const module = await import(`../../tests/fixtures/${file}`) as Record<string, unknown>
  for (const [name, value] of Object.entries(module).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (!isBlueprint(value)) continue
    for (const presetId of PRESET_IDS as readonly PresetId[]) {
      const key = `${file}:${name}:${presetId}`
      if (seen.has(key)) continue
      seen.add(key)
      try {
        const packet = await compilePacket(value, presetId)
        const hash = createHash("sha256")
        for (const doc of Object.values(packet.documents)) hash.update(doc)
        for (const kit of packet.kit) hash.update(kit.name).update(kit.content)
        console.log(`${key} ${packet.exportable ? "clean" : "fail"} ${hash.digest("hex").slice(0, 16)}`)
      } catch (error) {
        console.log(`${key} error ${(error as Error).constructor.name}`)
      }
    }
  }
}
