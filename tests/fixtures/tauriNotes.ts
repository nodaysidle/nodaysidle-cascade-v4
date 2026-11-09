import type { SemanticBlueprint } from "../../src/schema"
import { focusLedgerBlueprint } from "./tauriFocus"

type Feature = SemanticBlueprint["features"][number]

const [first] = focusLedgerBlueprint.features
const feature = (name: string, behavior: string, acceptance: string, uses: Partial<Feature>): Feature => ({
  ...first!,
  name,
  userOutcome: `The user gets ${name.toLowerCase()}.`,
  trigger: `The user starts ${name.toLowerCase()}.`,
  behavior,
  acceptanceSignals: [acceptance],
  usesPlatformNeeds: [],
  usesData: [],
  dataOperations: [],
  buildsOn: [],
  userFileAccess: "none",
  invokedBy: "user-control",
  runsEverySeconds: null,
  runsDailyAt: null,
  systemSource: "none",
  runsAtField: null,
  ...uses,
})

const ops = (data: string, ...operations: ("create" | "read" | "update" | "edit" | "delete")[]) => [{ data, operations }]
const base: Pick<SemanticBlueprint, "targetUsers" | "nonGoals" | "externalServices" | "platformNeeds" | "qualityRequirements" | "productConstraints"> = {
  targetUsers: ["People who jot short notes"],
  nonGoals: ["Cloud sync"],
  externalServices: [],
  platformNeeds: ["local-storage"],
  qualityRequirements: ["Keyboard-operable controls with visible status and accessible labels."],
  productConstraints: ["Everything stays on the device."],
}

// Habit tracker: a calendar-day completion record that references the habit, with no restore feature.
export const habitStreakBlueprint: SemanticBlueprint = {
  ...base,
  productName: "Habit Streak",
  summary: "A habit tracker that lists habits, adds and renames them, marks one done per local day, and shows the streak of consecutive days.",
  goals: ["Track daily habits", "Show streaks"],
  features: [
    feature("Habit list", "List every saved habit with its streak, loading the saved habits when the app launches.", "Saved habits are listed with their streaks after launch.", { usesData: ["Habits", "Habit completions"], dataOperations: [...ops("Habits", "read"), ...ops("Habit completions", "read")], usesPlatformNeeds: ["local-storage"], invokedBy: "launch" }),
    feature("Add habit", "Add a habit with a name.", "A new habit appears in the list.", { usesData: ["Habits"], dataOperations: ops("Habits", "create"), buildsOn: ["Habit list"] }),
    feature("Edit habit name", "Rename a habit and keep its creation time.", "The new name shows after reload.", { usesData: ["Habits"], dataOperations: ops("Habits", "read", "edit"), buildsOn: ["Habit list"] }),
    feature("Mark done today", "Mark a habit done for today's local calendar day; a second mark the same day changes nothing.", "A habit marked twice on one day has one completion.", { usesData: ["Habit completions"], dataOperations: ops("Habit completions", "read", "create"), buildsOn: ["Habit list"] }),
  ],
  dataObjects: [
    { name: "Habits", purpose: "One record per habit.", sensitivity: "personal", retentionIntent: "Keep until the user changes it.", storage: "records", writeMode: "direct", singleRecord: false, fields: [
      { name: "Name", valueType: "text", optional: false },
      { name: "Created at", valueType: "date-time", optional: false },
    ] },
    { name: "Habit completions", purpose: "One record per habit and day done.", sensitivity: "personal", retentionIntent: "Keep until the user changes it.", storage: "records", writeMode: "direct", singleRecord: false, fields: [
      { name: "Habit", valueType: "reference", optional: false },
      { name: "Completed on", valueType: "date", optional: false },
    ] },
  ],
  ideaCoverage: [{ sentence: 1, features: ["Habit list", "Add habit", "Edit habit name", "Mark done today"], outsideFeatures: "none" }],
}

// Notes: a list, an editor reached from list and add control, and a Markdown export document.
export const quickNotesBlueprint: SemanticBlueprint = {
  ...base,
  productName: "Quick Notes",
  summary: "A notes app that lists notes, adds and edits them, and exports all notes as one Markdown file.",
  goals: ["Keep notes on the device"],
  features: [
    feature("Note list", "List notes, most recently edited first; selecting one opens it in the editor.", "Selecting a note opens its text in the editor.", { usesData: ["Notes"], dataOperations: ops("Notes", "read"), usesPlatformNeeds: ["local-storage"] }),
    feature("Add note", "Open an empty editor and save a new note.", "A saved note appears in the list.", { usesData: ["Notes"], dataOperations: ops("Notes", "create"), buildsOn: ["Note list"] }),
    feature("Edit note", "Edit a note's text and save it.", "The edited text shows after reload.", { usesData: ["Notes"], dataOperations: ops("Notes", "read", "edit"), buildsOn: ["Note list"] }),
    feature("Export notes as Markdown", "Write every note into one Markdown file at a path the user chooses.", "The chosen file contains every note text.", { usesData: ["Notes", "Notes export"], dataOperations: [{ data: "Notes", operations: ["read"] }, { data: "Notes export", operations: ["create"] }], userFileAccess: "saves", buildsOn: ["Note list"] }),
  ],
  dataObjects: [
    { name: "Notes", purpose: "One record per note.", sensitivity: "personal", retentionIntent: "Keep until the user changes it.", storage: "records", writeMode: "direct", singleRecord: false, fields: [
      { name: "Text", valueType: "long-text", optional: false },
      { name: "Last edited at", valueType: "date-time", optional: false },
    ] },
    { name: "Notes export", purpose: "The Markdown file the user chooses.", sensitivity: "personal", retentionIntent: "Owned by the user after it is written.", storage: "document", writeMode: "atomic-replace", singleRecord: false, fields: [] },
  ],
  ideaCoverage: [{ sentence: 1, features: ["Note list", "Add note", "Edit note", "Export notes as Markdown"], outsideFeatures: "none" }],
}

// Bug reports: add, an edit form, a one-click mark (update, not edit), and a flag the add behavior sets itself.
export const bugNotesBlueprint: SemanticBlueprint = {
  ...base,
  productName: "Bug Notes",
  summary: "A bug report list that adds, edits, and marks reports as fixed.",
  goals: ["Track bug reports"],
  features: [
    feature("Report list", "List every saved report, newest first.", "Saved reports are listed after launch.", { usesData: ["Bug reports"], dataOperations: ops("Bug reports", "read") }),
    feature("Add report", "Add a report with a title and steps; it starts not fixed.", "A new report appears in the list.", { usesData: ["Bug reports"], dataOperations: ops("Bug reports", "create"), buildsOn: ["Report list"] }),
    feature("Edit report", "Edit a report's title and steps; the fixed state stays as it was.", "The edited title shows after reload.", { usesData: ["Bug reports"], dataOperations: ops("Bug reports", "read", "edit"), buildsOn: ["Report list"] }),
    feature("Mark report fixed", "Toggle a report between fixed and not fixed from its row.", "The row shows the new state after reload.", { usesData: ["Bug reports"], dataOperations: ops("Bug reports", "update"), buildsOn: ["Report list"] }),
  ],
  dataObjects: [
    { name: "Bug reports", purpose: "One record per report.", sensitivity: "personal", retentionIntent: "Keep until the user changes it.", storage: "records", writeMode: "direct", singleRecord: false, fields: [
      { name: "Title", valueType: "text", optional: false },
      { name: "Steps", valueType: "long-text", optional: false },
      { name: "Fixed", valueType: "flag", optional: false },
      { name: "Created at", valueType: "date-time", optional: false },
    ] },
  ],
  ideaCoverage: [{ sentence: 1, features: ["Report list", "Add report", "Edit report", "Mark report fixed"], outsideFeatures: "none" }],
}

// World clock: a city list that shows each city's current time, an add form, and a delete with no edit.
export const timeZonesBlueprint: SemanticBlueprint = {
  ...base,
  productName: "Time Zones",
  summary: "A list of cities with their current local times, where cities are added and removed.",
  goals: ["Show the time in several cities"],
  features: [
    feature("City list", "List the saved cities with the current local time of each, refreshed while the app is open.", "Each city row shows its local time.", { usesData: ["Cities"], dataOperations: ops("Cities", "read"), showsCurrentTime: true }),
    feature("Add city", "Add a city with a name and an IANA time zone.", "The new city appears in the list.", { usesData: ["Cities"], dataOperations: ops("Cities", "create"), buildsOn: ["City list"] }),
    feature("Remove city", "Remove a city after confirmation.", "The city disappears from the list.", { usesData: ["Cities"], dataOperations: ops("Cities", "delete"), buildsOn: ["City list"] }),
  ],
  dataObjects: [
    { name: "Cities", purpose: "One record per city.", sensitivity: "personal", retentionIntent: "Keep until the user changes it.", storage: "records", writeMode: "direct", singleRecord: false, fields: [
      { name: "Name", valueType: "text", optional: false },
      { name: "Time zone", valueType: "text", optional: false },
    ] },
  ],
  ideaCoverage: [{ sentence: 1, features: ["City list", "Add city", "Remove city"], outsideFeatures: "none" }],
}
