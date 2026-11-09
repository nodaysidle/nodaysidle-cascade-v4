import { describe, expect, it } from "vitest"
import { fieldKey } from "../src/astroWeb"
import { auditCapabilities } from "../src/capabilities"
import { compilePacket } from "../src/compiler"
import { fieldIdentifier } from "../src/kitText"
import { PRESETS } from "../src/presets"
import { auditSemanticIntake } from "../src/schema"
import { giftIdeasBlueprint } from "./fixtures/gtkProducts"
import { expenseLogBlueprint } from "./fixtures/tauriExpense"
import { netSpeedBlueprint } from "./fixtures/waybarSources"

describe("field identifiers", () => {
  it.each([
    ["Café", "cafe"],
    ["Order", "order_value"],
    ["Type", "type_value"],
    ["Group", "group_value"],
    ["2nd phone", "field_2nd_phone"],
    ["Due date", "due_date"],
    ["日記", "value"],
  ])("fieldIdentifier(%j) is %j", (name, identifier) => {
    expect(fieldIdentifier(name)).toBe(identifier)
  })

  it("Astro keys never start with a digit", () => {
    expect(fieldKey("2nd phone")).toBe("field2ndPhone")
    expect(fieldKey("Short description")).toBe("shortDescription")
  })

  it("GTK and Tauri documents spell an accented or reserved field the same way", async () => {
    const gtk = structuredClone(giftIdeasBlueprint)
    gtk.dataObjects[0]!.fields = [...gtk.dataObjects[0]!.fields, { name: "Café", valueType: "text", optional: false }, { name: "Order", valueType: "whole-number", optional: false }]
    const gtkTrd = (await compilePacket(gtk, "linux-wayland-gtk4-desktop")).documents["TRD.md"]
    expect(gtkTrd).toContain("cafe TEXT NOT NULL")
    expect(gtkTrd).toContain("order_value INTEGER NOT NULL")
    const tauri = structuredClone(expenseLogBlueprint)
    const records = tauri.dataObjects.find(data => data.storage === "records" && data.fields.length)!
    records.fields = [...records.fields, { name: "Café", valueType: "text", optional: false }, { name: "Order", valueType: "whole-number", optional: false }]
    const tauriPacket = await compilePacket(tauri, "tauri2-rust-typescript-desktop")
    expect(tauriPacket.failures).toEqual([])
    const tauriTrd = tauriPacket.documents["TRD.md"]
    expect(tauriTrd).toContain(", cafe TEXT NOT NULL")
    expect(tauriTrd).toContain(", order_value INTEGER NOT NULL")
  })

  it("intake rejects a field named id and fields that map to one identifier", () => {
    const withId = structuredClone(giftIdeasBlueprint)
    withId.dataObjects[0]!.fields = [...withId.dataObjects[0]!.fields, { name: "ID", valueType: "whole-number", optional: false }]
    expect(auditSemanticIntake(withId).map(issue => issue.rule)).toContain("semantic.field-id")
    for (const pair of [["Due date", "Due-date"], ["Order", "Order value"], ["Short description", "shortDescription"]]) {
      const twice = structuredClone(giftIdeasBlueprint)
      twice.dataObjects[0]!.fields = [...twice.dataObjects[0]!.fields, ...pair.map(name => ({ name, valueType: "text" as const, optional: false }))]
      expect(auditSemanticIntake(twice).map(issue => issue.rule), pair.join(" / ")).toContain("semantic.duplicate-field")
    }
  })

  it("Waybar rejects a setting that is the built-in refresh_seconds", () => {
    const blueprint = structuredClone(netSpeedBlueprint)
    blueprint.dataObjects = [...blueprint.dataObjects, { name: "Module settings", purpose: "How often the module refreshes.", sensitivity: "internal", retentionIntent: "Keep until the user changes it.", storage: "settings", writeMode: "atomic-replace", singleRecord: false, entryCount: null, fields: [{ name: "Refresh seconds", valueType: "whole-number", optional: false }] }]
    expect(auditCapabilities(blueprint, PRESETS["linux-hyprland-waybar-module"]).map(issue => issue.rule)).toContain("capability.waybar-refresh-setting")
  })
})
