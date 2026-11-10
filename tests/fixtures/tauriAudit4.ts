import type { SemanticBlueprint } from "../../src/schema"
import { quickNotesBlueprint } from "./tauriNotes"

type Feature = SemanticBlueprint["features"][number]

const [first] = quickNotesBlueprint.features
const feature = (name: string, behavior: string, acceptance: string, uses: Partial<Feature>): Feature => ({
  ...first!,
  name,
  userOutcome: `The user gets ${name.toLowerCase()}.`,
  trigger: `The user starts ${name.toLowerCase()}.`,
  behavior,
  acceptanceSignals: [acceptance],
  usesData: [],
  dataOperations: [],
  buildsOn: [],
  userFileAccess: "none",
  ...uses,
})
const ops = (data: string, ...operations: ("create" | "read" | "update" | "edit" | "delete")[]) => [{ data, operations }]
const { targetUsers, nonGoals, externalServices, platformNeeds, qualityRequirements, productConstraints } = quickNotesBlueprint
const base = { targetUsers, nonGoals, externalServices, platformNeeds, qualityRequirements, productConstraints }
const stored = { sensitivity: "personal", retentionIntent: "Keep until the user changes it.", storage: "records", writeMode: "direct", singleRecord: false } as const

// Water log: today's glasses by the current local day, an add button with no form, and a confirmed delete; no edit, so no detail view.
export const waterLogBlueprint: SemanticBlueprint = {
  ...base,
  productName: "Water Log",
  summary: "A log of glasses of water drunk today, with the time of each.",
  goals: ["Count today's glasses"],
  features: [
    feature("Glass log", "List only the glasses drunk on the current local calendar day, in the order they were drunk, with a count.", "A glass from yesterday is not listed.", { usesData: ["Water glasses"], dataOperations: ops("Water glasses", "read"), readsCurrentDay: true }),
    feature("Add a glass", "Add one glass stamped with the moment the button is pressed.", "Add glass stores one record at the injected time.", { usesData: ["Water glasses"], dataOperations: ops("Water glasses", "create"), buildsOn: ["Glass log"] }),
    feature("Delete a glass", "Delete a glass after asking 'Delete this glass?'.", "The glass disappears after confirming.", { usesData: ["Water glasses"], dataOperations: ops("Water glasses", "delete"), buildsOn: ["Glass log"] }),
  ],
  dataObjects: [{ name: "Water glasses", purpose: "One record per glass.", ...stored, fields: [{ name: "Drunk at", valueType: "date-time", optional: false }] }],
  ideaCoverage: [{ sentence: 1, features: ["Glass log", "Add a glass", "Delete a glass"], outsideFeatures: "none" }],
}

// Idea box: list, add, edit through the detail view, a title search over the loaded list, and a Markdown export with a document.
export const ideaBoxBlueprint: SemanticBlueprint = {
  ...base,
  productName: "Idea Box",
  summary: "A box of ideas with a title and notes, searchable by title and exportable as Markdown.",
  goals: ["Keep ideas"],
  features: [
    feature("Idea list", "List ideas newest first by creation time.", "Saved ideas are listed after launch.", { usesData: ["Ideas"], dataOperations: ops("Ideas", "read") }),
    feature("Add idea", "Add an idea with a title and notes.", "A new idea appears in the list.", { usesData: ["Ideas"], dataOperations: ops("Ideas", "create"), buildsOn: ["Idea list"] }),
    feature("Edit idea", "Edit an idea's title and notes; the creation time stays.", "The edited title shows after reload.", { usesData: ["Ideas"], dataOperations: ops("Ideas", "read", "edit"), buildsOn: ["Idea list"] }),
    feature("Search ideas by title", "Narrow the list to ideas whose title contains the typed text, ignoring case.", "Typing 'tea' lists only matching titles.", { usesData: ["Ideas"], dataOperations: ops("Ideas", "read"), buildsOn: ["Idea list"], failureRecovery: "fallback", narrowsListBy: "text" }),
    feature("Export ideas", "Write every idea into one Markdown file at a path the user chooses, with its creation time as YYYY-MM-DD HH:MM.", "An empty list exports only '# Ideas'.", { usesData: ["Ideas", "Ideas export"], dataOperations: [{ data: "Ideas", operations: ["read"] }, { data: "Ideas export", operations: ["create"] }], userFileAccess: "saves", buildsOn: ["Idea list"] }),
  ],
  dataObjects: [
    { name: "Ideas", purpose: "One record per idea.", ...stored, fields: [{ name: "Title", valueType: "text", optional: false }, { name: "Notes", valueType: "long-text", optional: false }, { name: "Created at", valueType: "date-time", optional: false }] },
    { name: "Ideas export", purpose: "The Markdown file the user chooses.", sensitivity: "personal", retentionIntent: "Owned by the user after it is written.", storage: "document", writeMode: "atomic-replace", singleRecord: false, fields: [] },
  ],
  ideaCoverage: [{ sentence: 1, features: ["Idea list", "Add idea", "Edit idea", "Search ideas by title", "Export ideas"], outsideFeatures: "none" }],
}
