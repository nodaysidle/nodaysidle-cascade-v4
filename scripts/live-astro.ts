import { mkdirSync } from "node:fs"
import { nodeJevProvider } from "../src/jev-wire"
import { writePacketAtomic } from "../src/packet"
import { generatePacket } from "../src/pipeline"
import { deepseekProvider } from "../src/provider"
import { resolvePresetOptions } from "../src/presets"

const idea = [
  "Copper Kite is a landing page for a local repair studio.",
  "It presents services, trust evidence, and pricing guidance.",
  "It shows phone and email contact details without collecting form data or analytics.",
].join(" ")
const resolved = resolvePresetOptions("astro-web", [])
const result = await generatePacket({
  requestId: `live-astro-${crypto.randomUUID()}`,
  idea,
  presetId: "astro-web",
  model: "deepseek-flash",
  apiUrl: "https://api.deepseek.com/responses",
  apiKey: process.env.DEEPSEEK_API_KEY!,
  jevApiKey: process.env.TYPESAFE_API_KEY,
  atomicAuditor: true,
  presetOptions: resolved.values,
}, deepseekProvider, undefined, process.env.TYPESAFE_API_KEY ? nodeJevProvider : undefined)
if (result.status !== "gate-clean" || !result.packet || !result.blueprint) {
  console.error(JSON.stringify({ status: result.status, issues: result.issues, repairedIssues: result.repairedIssues }, null, 2))
  process.exit(1)
}
mkdirSync("/tmp/v4-live-final", { recursive: true })
console.log(writePacketAtomic(result.packet, result.blueprint, "astro-web", resolved.values, "/tmp/v4-live-final/astro-web"))
