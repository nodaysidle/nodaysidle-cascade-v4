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
  usesData: ["Expenses"],
  dataOperations: [],
  buildsOn: [],
  userFileAccess: "none",
  invokedBy: "user-control",
  runsEverySeconds: null,
  runsDailyAt: null,
  ...uses,
})

const ops = (...operations: ("create" | "read" | "update" | "edit" | "delete")[]) => [{ data: "Expenses", operations }]
const categories = ["Food", "Rent", "Travel", "Other"]

// Expense log: a list that falls back without a retry, an add form with a choice list, and an edit that reuses it.
export const expenseLogBlueprint: SemanticBlueprint = {
  productName: "Expense Log",
  summary: "An expense log that lists expenses with monthly totals, adds an expense with an amount, date and category, and edits one.",
  targetUsers: ["People who track their spending"],
  goals: ["Track spending"],
  nonGoals: ["Cloud sync"],
  features: [
    feature("Expense list", "List every expense with its amount, date and category, loading them when the app launches, and show this month's total.", "Saved expenses are listed with the monthly total.", { dataOperations: ops("read"), failureRecovery: "fallback", usesPlatformNeeds: ["local-storage"] }),
    feature("Add expense", "Add an expense with an amount above zero, a date, and a category chosen from the list.", "A new expense appears in the list.", { dataOperations: ops("create"), buildsOn: ["Expense list"], choiceLists: [{ name: "Expense category", options: categories, initial: "Other" }] }),
    feature("Edit expense", "Change the amount, date, or category of a saved expense.", "The changed values show after reload.", { dataOperations: ops("read", "edit"), buildsOn: ["Expense list"], choiceLists: [{ name: "Expense category", options: categories, initial: "Other" }] }),
  ],
  dataObjects: [
    { name: "Expenses", purpose: "One record per expense.", sensitivity: "personal", retentionIntent: "Keep until the user changes it.", storage: "records", writeMode: "direct", singleRecord: false, fields: [
      { name: "Amount", valueType: "number", optional: false },
      { name: "Category", valueType: "text", optional: false },
      { name: "Spent on", valueType: "date", optional: false },
    ] },
  ],
  externalServices: [],
  platformNeeds: ["local-storage"],
  qualityRequirements: ["Keyboard-operable controls with visible status and accessible labels."],
  productConstraints: ["Everything stays on the device."],
  ideaCoverage: [{ sentence: 1, features: ["Expense list", "Add expense", "Edit expense"], outsideFeatures: "none" }],
}
