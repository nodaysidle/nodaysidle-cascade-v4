import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import { auditSemanticIntake } from "../src/schema"
import type { SemanticBlueprint } from "../src/schema"
import { moodDiaryBlueprint } from "./fixtures/moodDiary"

describe("Android bounded choice field", () => {
  it("renders a picker, the declared range rule, a stored initial value for edit, and exact tags", async () => {
    const packet = await compilePacket(moodDiaryBlueprint, "android-kotlin-compose")
    expect(packet.failures).toEqual([])
    const trd = packet.documents["TRD.md"]
    expect(trd).toContain("moodScore: a single-select picker (not a text field) whose options are 1, 2, 3, 4, 5")
    expect(trd).toContain('"field-" plus the field\'s slug plus "-option-" plus its value')
    expect(trd).toContain("the add form starts with the choice list's initial option (else 1) selected and the edit form with the stored value")
    expect(trd).toContain('a stored value outside 1..5 is rejected with "moodScore must be between 1 and 5"')
    expect(trd).not.toContain("moodScore: a whole number matching")
    expect(trd).toContain("Stored fields (one record each, plus a stable generated id): date (calendar day (local, no time)); moodScore (whole number, from 1 to 5)")
    // The add contract keeps its declared initial option; the edit contract starts at the record's stored value.
    expect(trd).toContain("- Choices: Mood: 1, 2, 3, 4, 5; initially 3")
    expect(trd).toContain("- Choices: Mood: 1, 2, 3, 4, 5; initially the stored value of the record being edited")
    // An edit-only form adds no record and invents no identifying-field rule.
    const edit = trd.slice(trd.indexOf("### CON-EDIT-MOOD-ENTRY-INTERFACE"))
    expect(edit.slice(0, edit.indexOf("### CON-", 10))).not.toContain("also adds the record")
    expect(trd).not.toContain("identifies it (a date or name kept once per record)")
    expect(trd).toContain('"row-" plus the record id')
    expect(trd).toContain('"empty-state"')
    expect(packet.documents["TASKS.md"]).toContain('the Add button (testTag "add-entry"; labelled as the PRD or an acceptance signal quotes it, else "Add"), which you build and which calls the shared openAdd(), plus the inline form shell')
  })

  it("states bounds on a typed number field and keeps feature tasks off AppContainer.kt", async () => {
    const typed = { ...moodDiaryBlueprint, dataObjects: moodDiaryBlueprint.dataObjects.map(item => ({ ...item, fields: item.fields.map(field => field.name === "moodScore" ? { ...field, max: 500 } : field) })) }
    const packet = await compilePacket(typed, "android-kotlin-compose")
    expect(packet.documents["TRD.md"]).toContain('moodScore: a whole number matching')
    expect(packet.documents["TRD.md"]).toContain('a value below 1 or above 500 is rejected with "moodScore must be between 1 and 500"')
    const features = packet.graph.phases.flatMap(phase => phase.tasks).filter(task => task.id.startsWith("TASK-") && task.featureIds.length)
    expect(features.length).toBeGreaterThan(0)
    for (const task of features) expect(task.filesToModify.some(path => path.endsWith("/AppContainer.kt")), task.id).toBe(false)
  })

  it("rejects a consecutive whole-number choice list whose field declares no matching bounds", () => {
    const unbounded: SemanticBlueprint = { ...moodDiaryBlueprint, dataObjects: moodDiaryBlueprint.dataObjects.map(item => ({ ...item, fields: item.fields.map(field => ({ ...field, min: null, max: null })) })) }
    expect(auditSemanticIntake(moodDiaryBlueprint).map(issue => issue.rule)).not.toContain("semantic.choice-range-bounds")
    expect(auditSemanticIntake(unbounded).map(issue => issue.rule)).toContain("semantic.choice-range-bounds")
  })
})
