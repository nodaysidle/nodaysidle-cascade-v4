import { describe, expect, it } from "vitest"
import { auditCapabilities } from "../src/capabilities"
import { androidFormRules, androidSettingFormRules } from "../src/androidForms"
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
    expect(trd).toContain("Bought: chosen with a Material 3 date picker")
    expect(trd).toContain("the add form starts with no day selected")
    expect(trd).toContain('Save rejects it with "Bought is required"')
    expect(trd).toContain("the Save button is always enabled and never disabled for an invalid form")
    expect(trd).toContain("^[0-9]+([.][0-9]{1,D})?$")
    expect(trd).toContain('"Price must have at most D decimal places"')
    expect(trd).toContain('"Price must be at least 0"')
    expect(trd).toContain("Expiry: a text field in the format yyyy-MM-dd HH:mm in clock.zone")
    expect(trd).toContain("Quantity: a whole number matching ^[0-9]{1,9}$")
    expect(trd).toContain("Price: a number with at most D decimal places")
    expect(trd).toContain('an empty Price (after trimming) is rejected with "Price is required"')
    expect(trd).toContain("Shop: text, trimmed; an empty Shop is allowed and stored as no value")
    expect(trd).toContain("fixing the field and pressing Save again is the retry")
    expect(trd).toContain('whose dismiss button is labelled "Cancel"')
    expect(trd).toContain("the form is an inline section of the main screen above the list, with no dialog")
    expect(trd).toContain("use that quoted label with the same testTag")
    expect(trd).toContain("shows exactly 2")
    const tasks = packet.documents["TASKS.md"]
    expect(tasks).toContain("is verified by that task; your focused test seeds records through the repository")
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
  it("keeps stamped and initial fields out of the forms, makes a same-named choice list a picker, and states each rule once", async () => {
    const fields = [
      { name: "Name", valueType: "text" as const, optional: false },
      { name: "Weekday", valueType: "text" as const, optional: false },
      { name: "Start time", valueType: "time" as const, optional: false },
      { name: "Last watered", valueType: "date" as const, optional: true, appStamped: true },
      { name: "Status", valueType: "text" as const, optional: false, initial: "Open" },
    ]
    const days = ["Monday", "Tuesday", "Wednesday"]
    const blueprint: SemanticBlueprint = {
      ...withForm,
      dataObjects: withForm.dataObjects.map(item => item.name === "Grocery items" ? { ...item, fields } : item),
      features: withForm.features.map(feature => feature.name === "Add grocery item" ? { ...feature, choiceLists: [{ name: "Weekday", options: days, initial: "Monday" }] } : feature),
    }
    expect(auditSemanticIntake({ ...blueprint, dataObjects: blueprint.dataObjects.map(item => ({ ...item, fields: item.fields.map(field => field.name === "Name" ? { ...field, appStamped: true } : field) })) }).map(issue => issue.rule)).toContain("semantic.stamped-not-date")
    const packet = await compilePacket(blueprint, "android-kotlin-compose")
    expect(packet.failures).toEqual([])
    const trd = packet.documents["TRD.md"]
    expect(trd).not.toContain("Last watered: a text field")
    expect(trd).not.toContain("Status: text")
    expect(trd).toContain("Last watered is stamped by an action of the app, so no form (add or edit) has an input for it")
    expect(trd).toContain("Weekday: a single-select picker (not a text field) whose options are Monday, Tuesday, Wednesday")
    expect(trd).not.toContain("Weekday is required")
    expect(trd).toContain("^([01][0-9]|2[0-3]):[0-5][0-9]$")
    expect(trd).toContain('the form shows that one quoted text, once, in the status area (testTag "form-error")')
    expect(trd).toContain("the only exception is a feature whose own behavior says it removes with no confirmation step")
    const tasks = packet.documents["TASKS.md"]
    expect(tasks).toContain("is verified by that task; your focused test seeds records through the repository")
    expect(tasks).toContain('the write-failure message of a later task\'s save, delete, mark, or toggle')
    expect(tasks).toContain('"summary-row-" plus the record id')
    expect(tasks).toContain("asserted by the packaging focused test as well")
    expect(packet.documents["ARD.md"]).not.toContain("the kit's SettingsRepository, built on Jetpack DataStore, holds run and permission state")
  })
})

// Round 13 Sleep Log: the PRD said "time pickers" while the form contract said text fields; the contract must say it wins.
describe("Android: the Field rules fix each input widget (round 13)", () => {
  const fields = [{ name: "Wake-up time", valueType: "time", optional: false }, { name: "Day", valueType: "date", optional: false }]
  const formLine = (lines: string[]) => lines.find(line => line.startsWith("Form ("))!
  it("both Form lines carry one widget rule", () => {
    for (const line of [formLine(androidFormRules("Sleep", fields, { edits: false, itemPage: false })), formLine(androidSettingFormRules("Goal", [fields[0]!]))]) {
      expect(line).toContain("Widget rule:")
      expect(line).toContain("build the widget the Field rule names")
      for (const widget of ["time picker", "slider", "date picker"]) expect(line).toContain(widget)
    }
  })
  it("the task note points at it", async () => {
    const packet = await compilePacket(withForm, "android-kotlin-compose")
    expect(packet.documents["TASKS.md"]).toContain("the Field rules also fix each field's widget, whatever widget the PRD's prose names")
  })
})
