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

const ops = (data: string, ...operations: ("create" | "read" | "update" | "delete")[]) => [{ data, operations }]
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
    feature("Edit habit name", "Rename a habit and keep its creation time.", "The new name shows after reload.", { usesData: ["Habits"], dataOperations: ops("Habits", "read", "update"), buildsOn: ["Habit list"] }),
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
    feature("Edit note", "Edit a note's text and save it.", "The edited text shows after reload.", { usesData: ["Notes"], dataOperations: ops("Notes", "read", "update"), buildsOn: ["Note list"] }),
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
