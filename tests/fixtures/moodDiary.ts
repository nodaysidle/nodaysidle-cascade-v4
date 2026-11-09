import type { SemanticBlueprint } from "../../src/schema"
import { pantryBlueprint } from "./pantry"

// Android: a bounded whole-number field (a mood from 1 to 5) picked from a choice list, edited later, plus a read-only 7-day summary.
const [first] = pantryBlueprint.features
const feature = (name: string, behavior: string, extra: Partial<SemanticBlueprint["features"][number]>): SemanticBlueprint["features"][number] => ({
  ...first!,
  name,
  userOutcome: `The user ${name.toLowerCase()}.`,
  trigger: `The user starts ${name.toLowerCase()}.`,
  behavior,
  acceptanceSignals: [`${name} works as described.`],
  usesPlatformNeeds: ["local-storage"],
  usesData: ["Mood entries"],
  dataOperations: [],
  runsDailyAt: null,
  scheduledNotification: null,
  ...extra,
})
const ops = (...operations: ("create" | "read" | "update" | "edit" | "delete")[]) => [{ data: "Mood entries", operations }]
const moodChoice = (initial: string) => [{ name: "Mood", options: ["1", "2", "3", "4", "5"], initial }]

export const moodDiaryBlueprint: SemanticBlueprint = {
  ...pantryBlueprint,
  productName: "Mood Diary",
  summary: "A diary that stores a date, a mood from 1 to 5 and a short note.",
  features: [
    feature("Mood entry list", "Show every entry, newest first.", { dataOperations: ops("read") }),
    feature("Add mood entry", "Add an entry with a date, a mood and a note.", { dataOperations: ops("create"), choiceLists: moodChoice("3") }),
    feature("Edit mood entry", "Change the mood or note of an entry.", { dataOperations: ops("read", "update", "edit"), choiceLists: moodChoice("3") }),
    feature("Seven day mood average", "Show the average mood of the last seven days.", { dataOperations: ops("read") }),
  ],
  dataObjects: [
    {
      name: "Mood entries", purpose: "The diary entries.", sensitivity: "personal", retentionIntent: "Keep until the user removes the app data.", storage: "records", writeMode: "direct", singleRecord: false,
      fields: [{ name: "date", valueType: "date", optional: false }, { name: "moodScore", valueType: "whole-number", optional: false, min: 1, max: 5 }, { name: "note", valueType: "text", optional: false }],
    },
  ],
  platformNeeds: ["local-storage"],
  ideaCoverage: [{ sentence: 1, features: ["Mood entry list", "Add mood entry", "Edit mood entry", "Seven day mood average"], outsideFeatures: "none" }],
}
