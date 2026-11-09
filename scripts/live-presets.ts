import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { nodeJevProvider } from "../src/jev-wire"
import { writePacketAtomic } from "../src/packet"
import { generatePacket } from "../src/pipeline"
import { deepseekProvider } from "../src/provider"
import { resolvePresetOptions, type PresetId } from "../src/presets"

// One live idea per preset. Each one exercises a different contract mix: records, file panels,
// a public network service, a global shortcut, a notification, and static content with no data.
const cases: ReadonlyArray<{ presetId: PresetId; idea: string }> = [
  {
    presetId: "linux-wayland-gtk4-desktop",
    idea: [
      "Receipt Shelf keeps a local library of purchase receipts.",
      "The user imports a receipt file, tags it with a store name and an amount, and searches the library by store or tag.",
      "The user exports the receipts that match the current search as a CSV file.",
      "The library is stored on the device and restored after restart.",
    ].join(" "),
  },
  {
    presetId: "linux-hyprland-waybar-module",
    idea: [
      "Tide Tick shows the next high tide for one saved harbor in a Waybar module.",
      "It fetches tide times from a public tide service every 30 minutes and shows the time of the next high tide.",
      "When the service is unreachable it keeps the last good reading and marks it as stale.",
      "Clicking the module opens the harbor's tide table in the default web browser.",
    ].join(" "),
  },
  {
    presetId: "tauri2-rust-typescript-desktop",
    idea: [
      "Focus Ledger tracks time spent on named tasks.",
      "The user starts and stops a timer for a task, sees today's total per task, and edits a past entry.",
      "A global shortcut starts and stops the timer.",
      "Entries are stored on the device and restored after restart.",
      "The user exports one week of entries as a Markdown file.",
    ].join(" "),
  },
  {
    presetId: "astro-web",
    idea: [
      "Lantern Books is a website for a small independent bookshop.",
      "It lists featured books with title, author, and a short note, and gives each book its own page.",
      "An events page lists upcoming readings, and an about page shows the opening hours.",
      "The site collects no visitor data and has no forms.",
    ].join(" "),
  },
  {
    presetId: "android-kotlin-compose",
    idea: [
      "Pantry Pal helps a household track groceries.",
      "The user adds an item with a quantity and an expiry date, marks it as used, and sees the items that expire within three days.",
      "A daily reminder notification lists the items that expire soon.",
      "Items are stored on the device and restored after restart.",
    ].join(" "),
  },
]

const apiKey = process.env.DEEPSEEK_API_KEY
const jevKey = process.env.TYPESAFE_API_KEY
if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set")
if (!jevKey) throw new Error("TYPESAFE_API_KEY is not set")

const root = process.env.CASCADE_LIVE_ROOT ?? "/tmp/v4-live-audit"
const only = process.argv[2]
mkdirSync(root, { recursive: true })
let failed = 0
for (const item of cases) {
  if (only && item.presetId !== only) continue
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
