import type { SemanticBlueprint } from "../../src/schema"
import { habitTrackerBlueprint } from "./blueprints"

// Android fixture: stored records with a per-record time of day, a per-record reminder (runsAtField),
// and a row action (mark taken) that is not an edit, so no detail view or Edit slot is wanted.
const [first] = habitTrackerBlueprint.features
const base = (name: string, behavior: string, extra: Partial<SemanticBlueprint["features"][number]>): SemanticBlueprint["features"][number] => ({
  ...first!,
  name,
  userOutcome: `The user ${name.toLowerCase()}.`,
  trigger: `The user starts ${name.toLowerCase()}.`,
  behavior,
  acceptanceSignals: [`${name} works as described.`],
  usesPlatformNeeds: [],
  usesData: ["Medicines"],
  dataOperations: [],
  invokedBy: "user-control",
  runsEverySeconds: null,
  runsDailyAt: null,
  runsAtField: null,
  ...extra,
})

const ops = (data: string, ...operations: ("create" | "read" | "update" | "edit" | "delete")[]) => [{ data, operations }]

export const medicineBlueprint: SemanticBlueprint = {
  ...habitTrackerBlueprint,
  productName: "Medicine Time",
  summary: "A medicine list that stores each medicine with its time of day and reminds the user when a dose is due.",
  features: [
    base("Add medicine", "Add a medicine with a name and a time of day written HH:MM.", { dataOperations: ops("Medicines", "create"), usesPlatformNeeds: ["local-storage"] }),
    base("Medicine list", "Show every medicine with its time of day, ordered by time.", { dataOperations: ops("Medicines", "read") }),
    base("Mark taken", "Mark a medicine as taken today from its row.", { dataOperations: ops("Medicines", "read", "update") }),
    base("Dose reminder", "When a medicine's time of day has passed, notify once for that medicine on that day.", {
      dataOperations: ops("Medicines", "read"),
      usesPlatformNeeds: ["notifications", "background-execution"],
      invokedBy: "schedule",
      acceptanceSignals: ["A notification titled with the medicine name and the body text Time to take your medicine appears once per medicine per day."],
      runsAtField: { data: "Medicines", timeField: "Time of day", titleField: "Name", notificationBody: "Time to take your medicine" },
    }),
  ],
  dataObjects: [
    {
      name: "Medicines", purpose: "The medicines with the time of day each is taken.", sensitivity: "personal", retentionIntent: "Keep until the user removes the app data.", storage: "records", writeMode: "direct", singleRecord: false,
      fields: [{ name: "Name", valueType: "text", optional: false }, { name: "Time of day", valueType: "time", optional: false }, { name: "Taken date", valueType: "date", optional: true }],
    },
  ],
  externalServices: [],
  platformNeeds: ["local-storage", "notifications", "background-execution"],
  ideaCoverage: [{ sentence: 1, features: ["Add medicine", "Medicine list", "Mark taken", "Dose reminder"], outsideFeatures: "none" }],
}
