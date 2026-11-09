import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { nodeJevProvider } from "../src/jev-wire"
import { writePacketAtomic } from "../src/packet"
import { generatePacket } from "../src/pipeline"
import { deepseekProvider } from "../src/provider"
import { resolvePresetOptions, type PresetId } from "../src/presets"

// Four live ideas per preset; the first of each is the one used for the committed evidence set.
// Each exercises a different contract mix: records, file panels, a public network service, a global
// shortcut, a notification, a credential, or static content with no data.
const ideas: Readonly<Record<PresetId, readonly string[]>> = {
  "linux-wayland-gtk4-desktop": [
    "Receipt Shelf keeps a local library of purchase receipts. The user imports a receipt file, tags it with a store name and an amount, and searches the library by store or tag. The user exports the receipts that match the current search as a CSV file. The library is stored on the device and restored after restart.",
    "Quiet Notes is a notebook for short text notes. The user creates, edits, and deletes a note, pins a note to the top, and searches note text. Notes are stored on the device and restored after restart.",
    "Mirror Backup copies a folder the user picks to a backup folder the user picks. The user starts a backup, sees progress with a cancel button, and sees the list of the last ten backups with their result. The backup history is stored on the device.",
    "Pocket Weather shows the current temperature and the next six hours for one saved city. It fetches the data from a public weather service when the user presses refresh, and keeps the last good reading when the service is unreachable. The saved city is kept after restart.",
  ],
  "linux-hyprland-waybar-module": [
    "Tide Tick shows the next high tide for one saved harbor in a Waybar module. It fetches tide times from a public tide service every 30 minutes and shows the time of the next high tide. When the service is unreachable it keeps the last good reading and marks it as stale. Clicking the module opens the harbor's tide table in the default web browser.",
    "Battery Guard shows the battery percentage in a Waybar module and turns the text red below 20 percent. It reads the percentage from the system every 30 seconds. Clicking the module sends a desktop notification with the estimated time remaining.",
    "Pomodoro Pip shows a countdown in a Waybar module. Left click starts or pauses a 25 minute focus session, right click resets it. When a session ends, a desktop notification is sent and the completed session count for today is shown in the module tooltip. The count is kept until midnight.",
    "Mail Count shows the number of unread messages of one mail account in a Waybar module. It checks the account every 5 minutes with an app password the user stores once, and shows a warning state when the check fails. Clicking the module opens the mail web page in the default browser.",
  ],
  "tauri2-rust-typescript-desktop": [
    "Focus Ledger tracks time spent on named tasks. The user starts and stops a timer for a task, sees today's total per task, and edits a past entry. A global shortcut starts and stops the timer. Entries are stored on the device and restored after restart. The user exports one week of entries as a Markdown file.",
    "Prompt Shelf keeps reusable text snippets. The user adds, edits, searches, and copies a snippet to the clipboard. The list is stored on the device and restored after restart.",
    "Dropzone Renamer renames many files at once. The user drops files onto the window, sees a preview of the new names built from a pattern the user types, and applies the rename. The user can undo the last rename. The last pattern is remembered after restart.",
    "Feed Digest shows the latest headlines of up to five feeds the user adds by address. The user refreshes manually, marks a headline as read, and hides read headlines. Feeds and read marks are stored on the device and restored after restart.",
  ],
  "astro-web": [
    "Lantern Books is a website for a small independent bookshop. It lists featured books with title, author, and a short note, and gives each book its own page. An events page lists upcoming readings, and an about page shows the opening hours. The site collects no visitor data and has no forms.",
    "Copper Kite is a landing page for a local repair studio. It presents the services, customer testimonials, and pricing guidance, and shows phone and email contact details. It collects no data and has no forms.",
    "Field Notes Docs is a documentation site for a small command line tool. It has a getting started page, one page per command, a changelog page, and a search page that finds pages by title. Content is written as markdown.",
    "Harvest Menu is a seasonal menu site for a small restaurant. It shows the current menu grouped by course, one page per dish with allergens, and a page with opening hours and the address. The site collects no visitor data.",
  ],
  "android-kotlin-compose": [
    "Pantry Pal helps a household track groceries. The user adds an item with a quantity and an expiry date, marks it as used, and sees the items that expire within three days. A daily reminder notification lists the items that expire soon. Items are stored on the device and restored after restart.",
    "Steady Day helps people build daily habits. The user adds a habit, marks it done for today, and views the current streak. Habits are stored on the device and restored after restart.",
    "Coin Jar tracks small daily spending. The user adds an expense with an amount and a category, sees today's total and the total for the current month, and deletes an expense. Expenses are stored on the device and restored after restart.",
    "Trail Log records hikes. The user starts a hike, adds a short note and a rating when it ends, and browses past hikes newest first with their duration. Hikes are stored on the device and restored after restart.",
  ],
}
const cases: ReadonlyArray<{ presetId: PresetId; idea: string }> = (Object.keys(ideas) as PresetId[]).flatMap(presetId => {
  const index = process.env.LIVE_IDEA_INDEX
  return ideas[presetId].flatMap((idea, position) => index === "all" || String(position) === (index ?? "0") ? [{ presetId, idea }] : [])
})

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
