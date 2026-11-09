import { describe, expect, it } from "vitest"
import { auditCapabilities } from "../src/capabilities"
import { compilePacket } from "../src/compiler"
import { PRESETS } from "../src/presets"
import { auditSemanticIntake, type SemanticBlueprint } from "../src/schema"
import { airQualityBlueprint } from "./fixtures/waybarSources"

const ID = "linux-hyprland-waybar-module" as const

// A wind module keyed by coordinates: two bounded number settings fill {Latitude} and {Longitude} in endpoint and page.
function windBlueprint(): SemanticBlueprint {
  const blueprint = structuredClone(airQualityBlueprint)
  blueprint.productName = "Wind Speed"
  blueprint.summary = "Shows the wind speed at one saved place in a Waybar module, fetched every 1200 seconds, and opens the forecast page on click."
  blueprint.features[0]!.usesData = ["Saved place", "Cached wind speed"]
  blueprint.features[0]!.usesServices = ["Wind service"]
  blueprint.features[0]!.dataOperations = [{ data: "Saved place", operations: ["read"] }, { data: "Cached wind speed", operations: ["create", "update"] }]
  blueprint.features[0]!.buildsOn = ["Wind speed display"]
  blueprint.features[1]!.name = "Wind speed display"
  blueprint.features[1]!.usesData = ["Saved place", "Cached wind speed"]
  blueprint.features[1]!.dataOperations = [{ data: "Saved place", operations: ["read"] }, { data: "Cached wind speed", operations: ["read"] }]
  blueprint.features[1]!.labelTemplate = "{value} km/h"
  blueprint.features[2]!.usesData = ["Saved place"]
  blueprint.features[2]!.usesServices = ["Wind service"]
  blueprint.features[2]!.dataOperations = [{ data: "Saved place", operations: ["read"] }]
  blueprint.dataObjects = [
    { name: "Saved place", purpose: "The coordinates the user chose.", sensitivity: "internal", retentionIntent: "Keep until the user changes it.", storage: "settings", writeMode: "atomic-replace", singleRecord: false, fields: [{ name: "Latitude", valueType: "number", optional: false, min: -90, max: 90 }, { name: "Longitude", valueType: "number", optional: false, min: -180, max: 180 }] },
    { name: "Cached wind speed", purpose: "The last good wind speed and the coordinates it was fetched for.", sensitivity: "internal", retentionIntent: "Keep until replaced.", storage: "records", writeMode: "direct", singleRecord: true, fields: [{ name: "Wind speed", valueType: "number", optional: false }, { name: "Fetched at", valueType: "date-time", optional: false }, { name: "Latitude", valueType: "number", optional: false }, { name: "Longitude", valueType: "number", optional: false }] },
  ]
  blueprint.externalServices = [
    { name: "Wind service", purpose: "Provide the current wind speed at a coordinate pair.", dataSent: ["Latitude", "Longitude"], credentialRequired: false, endpoint: "https://api.open-meteo.com/v1/forecast?latitude={Latitude}&longitude={Longitude}&current=wind_speed_10m", webPage: "https://open-meteo.com/en/docs#latitude={Latitude}&longitude={Longitude}", requestValueFrom: "Saved place", responseFields: [{ name: "Wind speed", valueType: "number", optional: false }] },
  ]
  blueprint.productConstraints = ["Send only the saved coordinates to the service."]
  blueprint.ideaCoverage = [{ sentence: 1, features: ["Scheduled index refresh", "Wind speed display", "Open city page on click"], outsideFeatures: "none" }]
  return blueprint
}

function rules(blueprint: SemanticBlueprint): string[] {
  return [...auditSemanticIntake(blueprint), ...auditCapabilities(blueprint, PRESETS[ID])].map(issue => issue.rule)
}

describe("Waybar named request placeholders", () => {
  it("accepts a coordinates-based service and compiles it Gate Clean with the URL builder in the kit", async () => {
    const blueprint = windBlueprint()
    expect(rules(blueprint)).toEqual([])
    const packet = await compilePacket(blueprint, ID)
    expect(packet.failures).toEqual([])
    const docs = Object.values(packet.documents).join("\n")
    expect(docs).toContain("http::fill_url")
    expect(docs).toContain("{Latitude} (a number from -90 to 90)")
    expect(docs).toContain("--set KEY=VALUE")
    const http = packet.kit.find(file => file.name === "kit/src/platform/http.rs")?.content ?? ""
    expect(http).toContain("pub fn fill_url")
    expect(packet.kit.find(file => file.name === "kit/tests/http_tests.rs")?.content).toContain("fill_url_refuses_missing_empty_and_out_of_range_values")
    const tasks = packet.documents["TASKS.md"]!
    expect(tasks).toContain("settings key latitude")
  })

  it("keeps the single {value} form and its coordinate rejection", () => {
    const single = structuredClone(airQualityBlueprint)
    single.externalServices[0]!.endpoint = "https://api.example.org/forecast?lat={value}&lon=0"
    expect(rules(single)).toContain("capability.waybar-request-coordinates")
    expect(rules(airQualityBlueprint)).toEqual([])
  })

  it("rejects unknown names, inconsistent pages, unbounded coordinates, and a root page", () => {
    const unknown = windBlueprint()
    unknown.externalServices[0]!.endpoint = unknown.externalServices[0]!.endpoint.replace("{Longitude}", "{Lon}")
    expect(rules(unknown)).toContain("semantic.request-placeholder-unknown")

    const page = windBlueprint()
    page.externalServices[0]!.webPage = "https://open-meteo.com/en/docs?x={Latitude}&y={Longitude}"
    page.externalServices[0]!.endpoint = "https://api.open-meteo.com/v1/forecast?latitude={Latitude}&longitude=0"
    expect(rules(page)).toContain("semantic.request-placeholder-inconsistent")

    const root = windBlueprint()
    root.externalServices[0]!.webPage = "https://open-meteo.com/en/docs"
    expect(rules(root)).toContain("capability.waybar-page-value")

    const unbounded = windBlueprint()
    delete unbounded.dataObjects[0]!.fields[0]!.min
    expect(rules(unbounded)).toContain("capability.waybar-request-coordinates")

    const wide = windBlueprint()
    wide.dataObjects[0]!.fields[0]!.max = 200
    expect(rules(wide)).toContain("capability.waybar-request-coordinates")

    const text = windBlueprint()
    text.dataObjects[0]!.fields[0] = { name: "Latitude", valueType: "text", optional: false }
    expect(rules(text)).toContain("capability.waybar-request-coordinates")

    const legacy = structuredClone(airQualityBlueprint)
    legacy.externalServices[0]!.endpoint = "https://api.example.org/feed/{value}/?x={city}"
    expect(rules(legacy)).toContain("semantic.request-placeholder-unknown")
  })

  it("requires the stored reading to carry every saved value", () => {
    const missing = windBlueprint()
    missing.dataObjects[1]!.fields = missing.dataObjects[1]!.fields.filter(field => field.name !== "Longitude")
    expect(rules(missing)).toContain("semantic.record-missing-request-value")
  })
})
