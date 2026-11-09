import type { SemanticBlueprint } from "../../src/schema"

type Feature = SemanticBlueprint["features"][number]

export function feature(name: string, behavior: string, acceptance: string, uses: Partial<Feature>): Feature {
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

export const ops = (data: string, ...operations: ("create" | "read" | "update" | "delete")[]) => [{ data, operations }]

// Offline records app with no settings, no network, and no secrets; edit and delete come from a detail view.
export const snippetLibraryBlueprint: SemanticBlueprint = {
  productName: "Snippet Library",
  summary: "An offline library that lists code snippets with a title, a language and the code, and lets the user add, edit and delete them.",
  targetUsers: ["Developers who keep reusable code"],
  goals: ["Keep snippets on the device"],
  nonGoals: ["Cloud sync"],
  features: [
    feature("Snippet list", "Show every snippet, most recently updated first; selecting a row opens its detail.", "The list shows the stored snippets.", { usesData: ["Snippets"], dataOperations: ops("Snippets", "read"), usesPlatformNeeds: ["local-storage"] }),
    feature("Add snippet", "Add a snippet with a required title of at most 120 characters, a language and the code.", "A valid snippet appears in the list.", { usesData: ["Snippets"], dataOperations: ops("Snippets", "create"), buildsOn: ["Snippet list"] }),
    feature("Edit snippet", "Edit a snippet from its detail view.", "An edited snippet shows the new values.", { usesData: ["Snippets"], dataOperations: ops("Snippets", "read", "update"), buildsOn: ["Snippet list"] }),
    feature("Delete snippet", "Delete a snippet from its detail view.", "A deleted snippet leaves the list.", { usesData: ["Snippets"], dataOperations: ops("Snippets", "delete"), buildsOn: ["Snippet list"] }),
  ],
  dataObjects: [
    { name: "Snippets", purpose: "One record per snippet.", sensitivity: "personal", retentionIntent: "Keep until the user deletes it.", storage: "records", writeMode: "direct", singleRecord: false, fields: [
      { name: "Title", valueType: "text", optional: false },
      { name: "Code", valueType: "long-text", optional: false },
      { name: "Updated at", valueType: "date-time", optional: false },
    ] },
  ],
  externalServices: [],
  platformNeeds: ["local-storage"],
  qualityRequirements: ["Keyboard-operable controls with visible status and accessible labels."],
  productConstraints: ["Everything stays on the device."],
  ideaCoverage: [{ sentence: 1, features: ["Snippet list", "Add snippet", "Edit snippet", "Delete snippet"], outsideFeatures: "none" }],
}
