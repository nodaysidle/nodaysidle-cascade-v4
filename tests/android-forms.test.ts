import { describe, expect, it } from "vitest"
import { auditCapabilities } from "../src/capabilities"
import { compilePacket } from "../src/compiler"
import { PRESETS } from "../src/presets"
import { auditSemanticIntake } from "../src/schema"
import type { SemanticBlueprint } from "../src/schema"
import { pantryBlueprint } from "./fixtures/pantry"

// A car-log-like variant: a records object with a date, a number, and an optional text field entered in a form, plus a delete and a read-only total.
const entered = [
  { name: "Name", valueType: "text", optional: false },
  { name: "Quantity", valueType: "whole-number", optional: false },
  { name: "Bought", valueType: "date", optional: false },
  { name: "Price", valueType: "number", optional: false },
  { name: "Shop", valueType: "text", optional: true },
  { name: "Expiry", valueType: "date-time", optional: false },
  { name: "Used", valueType: "flag", optional: false },
] as const

const withForm: SemanticBlueprint = {
  ...pantryBlueprint,
  dataObjects: pantryBlueprint.dataObjects.map(item => item.name === "Grocery items" ? { ...item, fields: entered.map(field => ({ ...field })) } : item),
  features: [
    ...pantryBlueprint.features.slice(0, 3),
    { ...pantryBlueprint.features[0]!, name: "Remove grocery item", dataOperations: [{ data: "Grocery items", operations: ["delete" as const] }], acceptanceSignals: ["Remove works as described."] },
    { ...pantryBlueprint.features[3]!, invokedBy: "schedule" as const },
  ],
  ideaCoverage: [{ sentence: 1, features: ["Add grocery item", "Mark item used", "Expiring soon", "Remove grocery item", "Daily reminder"], outsideFeatures: "none" }],
}

describe("Android form, validation, and notification contracts", () => {
  it("states input mechanism, format, and rejection once per declared field type", async () => {
    const packet = await compilePacket(withForm, "android-kotlin-compose")
    expect(packet.failures).toEqual([])
    const trd = packet.documents["TRD.md"]
    expect(trd).toContain("Bought: a text field in the ISO format yyyy-MM-dd; the add form starts with LocalDate.now(container.clock)")
    expect(trd).toContain("2026-13-40 and abc are rejected")
    expect(trd).toContain("Expiry: a text field in the format yyyy-MM-dd HH:mm in clock.zone")
    expect(trd).toContain("Quantity: a whole number matching ^[0-9]{1,9}$")
    expect(trd).toContain("Price: a number matching")
    expect(trd).toContain('an empty Price (after trimming) is rejected with "Price is required"')
    expect(trd).toContain("Shop: text, trimmed; an empty Shop is allowed and stored as no value")
    expect(trd).toContain("fixing the field and pressing Save again is the retry")
    expect(trd).toContain('whose dismiss button is labelled "Cancel"')
    expect(trd).toContain("the form is a dialog (AlertDialog) shown over the main screen")
    const tasks = packet.documents["TASKS.md"]
    expect(tasks).toContain("Form rules: build the form exactly as the Form, Field rules and Rejection details")
    expect(tasks).toContain('confirm button is labelled "Delete"')
    expect(tasks).toContain("a date as yyyy-MM-dd, a date and time as yyyy-MM-dd HH:mm")
    // One summary area above the list; the filter-or-list-region choice and the SettingsRepository boilerplate are gone.
    expect(tasks).not.toContain("the filter area or the list region")
    expect(tasks).toContain("one area above the list")
    expect(packet.documents["ARD.md"]).not.toContain("no key is added to SettingsRepository")
  })

  it("names title and text of a scheduled notification, and keeps schedule-only tasks lean", async () => {
    const packet = await compilePacket(withForm, "android-kotlin-compose")
    const trd = packet.documents["TRD.md"]
    expect(trd).toContain('The notification title is exactly "Expiring soon"')
    expect(trd).toContain("joined by ', '")
    expect(trd).not.toContain("uses the feature name as its title")
    expect(trd).toContain('@SuppressLint("MissingPermission")')
    const reminder = packet.graph.phases.flatMap(phase => phase.tasks).find(task => task.id === "TASK-08-DAILY-REMINDER") ?? packet.graph.phases.flatMap(phase => phase.tasks).find(task => task.title.includes("DailyReminder"))!
    expect(reminder.filesToModify.some(path => /\/(App|AppContainer)\.kt$/.test(path))).toBe(false)
    expect(reminder.validationCommands.some(command => command.includes("DailyReminderSchedulerTest"))).toBe(true)
    expect(reminder.prompt).not.toContain("ON_RESUME")
    expect(packet.documents["TASKS.md"]).toContain("the packaging focused test is its only caller")
    expect(packet.documents["TASKS.md"]).toContain("groceryItems is GroceryItemsRepository")
    expect(trd).toContain("read as container.groceryItems by every feature, ViewModel, and Worker")
  })

  it("rejects a scheduled notification without a declared title and text, or whose title no acceptance quotes", () => {
    const android = PRESETS["android-kotlin-compose"]
    const reminder = pantryBlueprint.features.find(feature => feature.name === "Daily reminder")!
    const swap = (patch: Partial<typeof reminder>) => ({ ...pantryBlueprint, features: pantryBlueprint.features.map(feature => feature === reminder ? { ...feature, ...patch } : feature) })
    expect(auditCapabilities(pantryBlueprint, android).map(issue => issue.rule)).not.toContain("capability.android-notification-text")
    expect(auditCapabilities(swap({ scheduledNotification: null }), android).map(issue => issue.rule)).toContain("capability.android-notification-text")
    expect(auditSemanticIntake(swap({ acceptanceSignals: ["Something else happens."] })).map(issue => issue.rule)).toContain("semantic.notification-title")
    expect(auditSemanticIntake(swap({ runsDailyAt: null })).map(issue => issue.rule)).toContain("semantic.notification-schedule")
  })
})
