import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { nodeJevProvider } from "../src/jev-wire"
import { writePacketAtomic } from "../src/packet"
import { generatePacket } from "../src/pipeline"
import { deepseekProvider } from "../src/provider"
import { resolvePresetOptions, type PresetId } from "../src/presets"

const cases: ReadonlyArray<{ presetId: PresetId; idea: string }> = [
  {
    presetId: "linux-wayland-gtk4-desktop",
    idea: [
      "Harbor Sort helps people organize downloads into named folders.",
      "Users preview a file before moving it, undo the last move, and search by filename.",
      "The app should stay responsive, keep actions local, and recover cleanly after restart.",
    ].join(" "),
  },
  {
    presetId: "linux-hyprland-waybar-module",
    idea: [
      "Arch Update Watch shows pending official Arch updates in a Waybar module.",
      "It refreshes the count every 15 minutes and shows the count in the bar.",
      "Clicking the module opens a terminal running sudo pacman -Syu.",
    ].join(" "),
  },
  {
    presetId: "tauri2-rust-typescript-desktop",
    idea: [
      "Prompt Shelf keeps reusable text snippets for the user.",
      "It lets the user add, edit, search, and copy a snippet.",
      "The list is stored locally and restored after restart.",
    ].join(" "),
  },
  {
    presetId: "astro-web",
    idea: [
      "Copper Kite is a landing page for a local repair studio.",
      "It presents services, trust evidence, and pricing guidance.",
      "It offers a contact form without collecting analytics.",
    ].join(" "),
  },
  {
    presetId: "android-kotlin-compose",
    idea: [
      "Steady Day helps people build daily habits.",
      "It lets the user add a habit, mark it done for today, and view the current streak.",
      "The habits are stored on the device and restored after restart.",
    ].join(" "),
  },
]

const apiKey = process.env.DEEPSEEK_API_KEY
const jevKey = process.env.TYPESAFE_API_KEY
if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set")
if (!jevKey) throw new Error("TYPESAFE_API_KEY is not set")

const root = "/tmp/v4-live"
mkdirSync(root, { recursive: true })
let failed = 0
for (const item of cases) {
  const resolved = resolvePresetOptions(item.presetId, [])
  if (resolved.issues.length) throw new Error(resolved.issues.join("\n"))
  console.log(`\n=== ${item.presetId}`)
  const result = await generatePacket({
    requestId: `live-${item.presetId}-${crypto.randomUUID()}`,
    idea: item.idea,
    presetId: item.presetId,
    model: "deepseek-flash",
    apiUrl: process.env.CASCADE_API_URL || "https://api.deepseek.com/responses",
    apiKey,
    jevApiKey: jevKey,
    atomicAuditor: true,
    presetOptions: resolved.values,
  }, deepseekProvider, undefined, nodeJevProvider)
  if (result.status !== "gate-clean" || !result.packet || !result.blueprint) {
    failed += 1
    console.error(JSON.stringify({ status: result.status, failure: result.failure, issues: result.issues, repairedIssues: result.repairedIssues }, null, 2))
    continue
  }
  const destination = writePacketAtomic(result.packet, result.blueprint, item.presetId, resolved.values, join(root, item.presetId))
  console.log(`Gate Clean: ${destination}`)
}
if (failed) process.exit(1)
