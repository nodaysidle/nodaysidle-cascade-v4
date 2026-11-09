import type { SemanticBlueprint } from "../../src/schema"

type Feature = SemanticBlueprint["features"][number]

function feature(name: string, behavior: string, acceptance: string, uses: Partial<Feature>): Feature {
  return {
    name,
    userOutcome: `The user gets ${name.toLowerCase()}.`,
    trigger: `The user starts ${name.toLowerCase()}.`,
    behavior,
    failureOutcome: "The operation stops without replacing the last valid state and explains what can be retried.",
    failureRecovery: "retry",
    invokedBy: "user-control",
    surface: "main",
    acceptanceSignals: [acceptance],
    usesPlatformNeeds: [],
    usesTray: false,
    clipboardAccess: "none",
    clipboardWatch: false,
    usesData: [],
    usesServices: [],
    userFileAccess: "none",
    choiceLists: [],
    buildsOn: [],
    dataOperations: [],
    runsEverySeconds: null,
    runsDailyAt: null,
    systemSource: "none",
    runsAtField: null,
    ...uses,
  }
}

const ops = (data: string, ...operations: ("create" | "read" | "update" | "edit" | "delete")[]) => [{ data, operations }]

// Offline time tracker: a record with an optional end time, a Markdown document export, and a global shortcut.
export const focusLedgerBlueprint: SemanticBlueprint = {
  productName: "Focus Ledger",
  summary: "An offline time tracker that starts and stops a timer per named task, totals today per task, edits past entries, and exports one week as a Markdown file.",
  targetUsers: ["People who track their own working time"],
  goals: ["Track time per task", "Export a week"],
  nonGoals: ["Cloud sync"],
  features: [
    feature("Timer control", "Start or stop the timer for a named task; stopping within 2 seconds of starting keeps the entry.", "Starting a task shows it running; stopping saves the end time.", { usesData: ["Time entries"], dataOperations: ops("Time entries", "create", "update"), usesPlatformNeeds: ["local-storage"] }),
    feature("Today totals", "Show today's total per task from the stored entries.", "Totals equal the sum of today's entries.", { usesData: ["Time entries"], dataOperations: ops("Time entries", "read"), buildsOn: ["Timer control"] }),
    feature("Entry editing", "Edit the task name or times of a past entry.", "An edited entry shows the new values after reload.", { usesData: ["Time entries"], dataOperations: ops("Time entries", "read", "edit"), buildsOn: ["Today totals"] }),
    feature("Shortcut toggle", "A global shortcut starts or stops the timer for the last task.", "Pressing the shortcut toggles the timer.", { usesPlatformNeeds: ["global-hotkey"], usesData: ["Time entries"], dataOperations: ops("Time entries", "read", "update"), buildsOn: ["Timer control"] }),
    feature("Week export", "Write one week of entries as a Markdown file at a path the user chooses.", "The chosen file lists the week's entries.", { usesData: ["Time entries", "Week report"], dataOperations: [{ data: "Time entries", operations: ["read"] }, { data: "Week report", operations: ["create"] }], userFileAccess: "saves", buildsOn: ["Today totals"] }),
  ],
  dataObjects: [
    { name: "Time entries", purpose: "One entry per timer run.", sensitivity: "personal", retentionIntent: "Keep until the user changes it.", storage: "records", writeMode: "direct", singleRecord: false, fields: [
      { name: "Task name", valueType: "text", optional: false },
      { name: "Started at", valueType: "date-time", optional: false },
      { name: "Ended at", valueType: "date-time", optional: true },
    ] },
    { name: "Week report", purpose: "The Markdown file the user chooses.", sensitivity: "personal", retentionIntent: "Owned by the user after it is written.", storage: "document", writeMode: "atomic-replace", singleRecord: false, fields: [] },
  ],
  externalServices: [],
  platformNeeds: ["local-storage", "global-hotkey"],
  qualityRequirements: ["Keyboard-operable controls with visible status and accessible labels."],
  productConstraints: ["Everything stays on the device."],
  ideaCoverage: [{ sentence: 1, features: ["Timer control", "Today totals", "Entry editing", "Shortcut toggle", "Week export"], outsideFeatures: "none" }],
}
