import type { SemanticBlueprint } from "../../src/schema"
import { habitTrackerBlueprint } from "./blueprints"

// Android scheduling fixture: stored records, a stored setting, and a daily scheduled notification.
const [first] = habitTrackerBlueprint.features
const base = (name: string, behavior: string, extra: Partial<SemanticBlueprint["features"][number]>): SemanticBlueprint["features"][number] => ({
  ...first!,
  name,
  userOutcome: `The user ${name.toLowerCase()}.`,
  trigger: `The user starts ${name.toLowerCase()}.`,
  behavior,
  acceptanceSignals: [`${name} works as described.`],
  usesPlatformNeeds: [],
  usesData: ["Grocery items"],
  dataOperations: [],
  invokedBy: "user-control",
  runsEverySeconds: null,
  runsDailyAt: null,
  runsAtField: null,
  ...extra,
})

const ops = (data: string, ...operations: ("create" | "read" | "update" | "edit" | "delete")[]) => [{ data, operations }]

export const pantryBlueprint: SemanticBlueprint = {
  ...habitTrackerBlueprint,
  productName: "Pantry Pal",
  summary: "A grocery tracker that stores items on the device and reminds the user about food that expires soon.",
  features: [
    base("Add grocery item", "Add an item with a quantity and an expiry date.", { dataOperations: ops("Grocery items", "create"), usesPlatformNeeds: ["local-storage"] }),
    base("Mark item used", "Mark an item as used.", { dataOperations: ops("Grocery items", "read", "update") }),
    base("Expiring soon", "Show items that expire within three days of today.", { dataOperations: ops("Grocery items", "read") }),
    base("Daily reminder", "Send one notification every day at 09:00 listing items that expire within three days.", {
      dataOperations: ops("Grocery items", "read"),
      usesPlatformNeeds: ["notifications", "background-execution"],
      runsDailyAt: "09:00",
      runsAtField: null,
      scheduledNotification: { titleText: "Expiring soon", notificationBody: "the names of the items that expire within three days, joined by ', '" },
      acceptanceSignals: ["The Worker posts one notification titled \"Expiring soon\" listing the expiring item names."],
      usesData: ["Grocery items", "Reminder preferences"],
    }),
  ],
  dataObjects: [
    {
      name: "Grocery items", purpose: "The items on hand with quantity and expiry.", sensitivity: "personal", retentionIntent: "Keep until the user removes the app data.", storage: "records", writeMode: "direct", singleRecord: false,
      fields: [{ name: "Name", valueType: "text", optional: false }, { name: "Quantity", valueType: "whole-number", optional: false }, { name: "Expiry", valueType: "date-time", optional: false }, { name: "Used", valueType: "flag", optional: false }],
    },
    { name: "Reminder preferences", purpose: "Whether the daily reminder is enabled and the notification permission state.", sensitivity: "internal", retentionIntent: "Keep until the user changes it.", storage: "settings", writeMode: "direct", singleRecord: false, fields: [] },
  ],
  externalServices: [],
  platformNeeds: ["local-storage", "notifications", "background-execution"],
  ideaCoverage: [{ sentence: 1, features: ["Add grocery item", "Mark item used", "Expiring soon", "Daily reminder"], outsideFeatures: "none" }],
}
