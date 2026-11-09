import type { SemanticBlueprint } from "../../src/schema"
import { tideTickBlueprint } from "./blueprints"

type Feature = SemanticBlueprint["features"][number]

function base(name: string, behavior: string, acceptance: string, uses: Partial<Feature>): Feature {
  return {
    ...structuredClone(tideTickBlueprint.features[0]!),
    name,
    userOutcome: `The user gets ${name.toLowerCase()}.`,
    trigger: `The user starts ${name.toLowerCase()}.`,
    behavior,
    acceptanceSignals: [acceptance],
    usesPlatformNeeds: [],
    usesData: [],
    usesServices: [],
    dataOperations: [],
    invokedBy: "user-control",
    runsEverySeconds: null,
    runsDailyAt: null,
    systemSource: "none",
    ...uses,
  }
}

// A module that measures a system counter: no service, one single-record sample, a click notification.
export const netSpeedBlueprint: SemanticBlueprint = {
  productName: "Net Speed",
  summary: "Shows the current download speed in a Waybar module, measured from the system network counters every 5 seconds, and notifies the total downloaded since boot on click.",
  targetUsers: ["People who watch their connection in the bar"],
  goals: ["Show the download speed at a glance", "Show the total downloaded since boot"],
  nonGoals: ["Per-interface breakdowns"],
  features: [
    base("Download speed readout", "Every 5 seconds read the total received bytes from the system and show the change since the stored sample as megabits per second.", "After two measurements 5 seconds apart with a received counter increase of 6,250,000 bytes the label is 10.0 Mb/s.", { usesPlatformNeeds: ["background-execution"], usesData: ["Last sample"], dataOperations: [{ data: "Last sample", operations: ["create", "update"] }], invokedBy: "schedule", runsEverySeconds: 5, systemSource: "network-received", labelTemplate: "{value}" }),
    base("Downloaded since boot notification", "Clicking the module sends one notification with the total received bytes since boot.", "With a total received counter of 3,670,016,000 bytes the notification body contains 3.67 GB.", { usesPlatformNeeds: ["notifications"], usesData: ["Last sample"], dataOperations: [{ data: "Last sample", operations: ["read"] }], invokedBy: "click", systemSource: "network-received" }),
  ],
  dataObjects: [
    { name: "Last sample", purpose: "The last received-bytes counter and when it was read.", sensitivity: "internal", retentionIntent: "Keep until replaced by the next sample.", storage: "records", writeMode: "direct", singleRecord: true, fields: [{ name: "Received bytes", valueType: "whole-number", optional: false }, { name: "Sampled at", valueType: "date-time", optional: false }] },
  ],
  externalServices: [],
  platformNeeds: ["background-execution", "notifications"],
  qualityRequirements: ["Text short enough for a bar."],
  productConstraints: ["Everything stays on the device."],
  ideaCoverage: [{ sentence: 1, features: ["Download speed readout", "Downloaded since boot notification"], outsideFeatures: "none" }],
}

// A module that fetches for a saved setting: a templated endpoint and page, a single cached record that carries the identifier.
export const airQualityBlueprint: SemanticBlueprint = {
  productName: "Air Quality",
  summary: "Shows the air quality index of one saved city in a Waybar module, fetched every 1200 seconds, and opens the city page on click.",
  targetUsers: ["People who watch the air quality"],
  goals: ["Show the index of the saved city", "Open the city page"],
  nonGoals: ["Several cities"],
  features: [
    base("Scheduled index refresh", "Every 1200 seconds request the index for the saved city and keep the last good one.", "A failed fetch leaves the cached row unchanged.", { usesPlatformNeeds: ["network", "background-execution"], usesData: ["Saved city", "Cached air quality index"], usesServices: ["Air quality service"], dataOperations: [{ data: "Saved city", operations: ["read"] }, { data: "Cached air quality index", operations: ["create", "update"] }], invokedBy: "schedule", runsEverySeconds: 1200, buildsOn: ["Air quality index display"] }),
    base("Air quality index display", "Show the cached index of the saved city, or -- when none is cached for it.", "With a cached index of 42 for the saved city the label contains 42.", { usesData: ["Saved city", "Cached air quality index"], dataOperations: [{ data: "Saved city", operations: ["read"] }, { data: "Cached air quality index", operations: ["read"] }], labelTemplate: "AQI {value}" }),
    base("Open city page on click", "Clicking the module opens the saved city's page.", "Clicking opens the city page address for the saved identifier.", { usesPlatformNeeds: ["network"], usesData: ["Saved city"], usesServices: ["Air quality service"], dataOperations: [{ data: "Saved city", operations: ["read"] }], invokedBy: "click" }),
  ],
  dataObjects: [
    { name: "Saved city", purpose: "The one city the user chose.", sensitivity: "internal", retentionIntent: "Keep until the user changes it.", storage: "settings", writeMode: "atomic-replace", singleRecord: false, fields: [{ name: "City name", valueType: "text", optional: false }, { name: "Service location identifier", valueType: "text", optional: false }] },
    { name: "Cached air quality index", purpose: "The last good index and the identifier it was fetched for.", sensitivity: "internal", retentionIntent: "Keep until replaced.", storage: "records", writeMode: "direct", singleRecord: true, fields: [{ name: "Index value", valueType: "whole-number", optional: false }, { name: "Fetched at", valueType: "date-time", optional: false }, { name: "Service location identifier", valueType: "text", optional: false }] },
  ],
  externalServices: [
    { name: "Air quality service", purpose: "Provide the air quality index of a location.", dataSent: ["Service location identifier"], credentialRequired: true, endpoint: "https://api.example.org/feed/{value}/", webPage: "https://example.org/city/{value}/", requestValueFrom: "Service location identifier", responseFields: [{ name: "Index value", valueType: "whole-number", optional: false }] },
  ],
  platformNeeds: ["network", "background-execution"],
  qualityRequirements: ["Text short enough for a bar."],
  productConstraints: ["Send only the location identifier to the service."],
  ideaCoverage: [{ sentence: 1, features: ["Scheduled index refresh", "Air quality index display", "Open city page on click"], outsideFeatures: "none" }],
}

// Every declared system source at once, so the kit's readers and parsers are all compiled and tested.
export const allSourcesBlueprint: SemanticBlueprint = (() => {
  const all = structuredClone(netSpeedBlueprint)
  all.productName = "System Glance"
  all.features[1]!.systemSource = "network-sent"
  for (const [name, source] of [["Load readout", "load-average"], ["Memory readout", "memory"], ["Battery readout", "battery"], ["Disk readout", "disk-space"], ["Temperature readout", "temperature"]] as const) {
    all.features.push(base(name, `Shows the ${source} reading.`, `The label shows the ${source} reading.`, { usesData: ["Last sample"], dataOperations: [{ data: "Last sample", operations: ["read"] }], systemSource: source }))
  }
  all.ideaCoverage = [{ sentence: 1, features: all.features.map(feature => feature.name), outsideFeatures: "none" }]
  return all
})()

// Disk free space: a declared disk-space source, one stored reading, and a red limit that is a lower bound.
export const freeSpaceBlueprint: SemanticBlueprint = {
  productName: "Free Space",
  summary: "Shows the free space of the root disk in a Waybar module, measured every 60 seconds, and turns red below 10 GB.",
  targetUsers: ["People who watch their disk"],
  goals: ["Show the free space at a glance"],
  nonGoals: ["Other disks"],
  features: [
    base("Free space refresh", "Every 60 seconds read the free, used, and total space of the root disk and store the reading.", "After a refresh the stored reading holds the free bytes of the root disk.", { usesPlatformNeeds: ["background-execution"], usesData: ["Disk reading"], dataOperations: [{ data: "Disk reading", operations: ["create", "update"] }], invokedBy: "schedule", runsEverySeconds: 60, systemSource: "disk-space", buildsOn: ["Free space label"] }),
    base("Free space label", "Show the stored free space as the module label.", "With 3,670,016,000 free bytes the label is 3.67 GB free.", { usesData: ["Disk reading"], dataOperations: [{ data: "Disk reading", operations: ["read"] }], labelTemplate: "{value} free", thresholds: [{ state: "critical", comparison: "below", value: 10000000000 }] }),
  ],
  dataObjects: [
    { name: "Disk reading", purpose: "The last free, used, and total bytes of the root disk.", sensitivity: "internal", retentionIntent: "Keep until replaced.", storage: "records", writeMode: "direct", singleRecord: true, fields: [{ name: "Free bytes", valueType: "whole-number", optional: false }, { name: "Used bytes", valueType: "whole-number", optional: false }, { name: "Total bytes", valueType: "whole-number", optional: false }] },
  ],
  externalServices: [],
  platformNeeds: ["background-execution"],
  qualityRequirements: ["Text short enough for a bar."],
  productConstraints: ["Everything stays on the device."],
  ideaCoverage: [{ sentence: 1, features: ["Free space refresh", "Free space label"], outsideFeatures: "none" }],
}

// A fetched time of day for a saved city name: a text identifier, an instant stored as date-time, a label template.
export const sunTimesBlueprint: SemanticBlueprint = {
  productName: "Sun Times",
  summary: "Shows today's sunset time of one saved city in a Waybar module, fetched every 21600 seconds.",
  targetUsers: ["People who plan their evening"],
  goals: ["Show the sunset time of the saved city"],
  nonGoals: ["Several cities"],
  features: [
    base("Scheduled sunset refresh", "Every 21600 seconds request the sunset of the saved city and keep the last good one.", "A failed fetch leaves the stored reading unchanged.", { usesPlatformNeeds: ["network", "background-execution"], usesData: ["Saved city", "Sunset reading"], usesServices: ["Sunset service"], dataOperations: [{ data: "Saved city", operations: ["read"] }, { data: "Sunset reading", operations: ["create", "update"] }], invokedBy: "schedule", runsEverySeconds: 21600, buildsOn: ["Sunset label"] }),
    base("Sunset label", "Show the stored sunset of the saved city as a local time, or -- when none is stored for it.", "With a stored sunset of 17:42 UTC and a local time zone of UTC+2 the label is Sunset 19:42.", { usesData: ["Saved city", "Sunset reading"], dataOperations: [{ data: "Saved city", operations: ["read"] }, { data: "Sunset reading", operations: ["read"] }], labelTemplate: "Sunset {value}" }),
  ],
  dataObjects: [
    { name: "Saved city", purpose: "The one city the user chose.", sensitivity: "internal", retentionIntent: "Keep until the user changes it.", storage: "settings", writeMode: "atomic-replace", singleRecord: false, fields: [{ name: "City", valueType: "text", optional: false }] },
    { name: "Sunset reading", purpose: "The last good sunset instant and the city it was fetched for.", sensitivity: "internal", retentionIntent: "Keep until replaced.", storage: "records", writeMode: "direct", singleRecord: true, fields: [{ name: "Sunset instant", valueType: "date-time", optional: false }, { name: "City", valueType: "text", optional: false }] },
  ],
  externalServices: [
    { name: "Sunset service", purpose: "Provide the sunset instant of a city.", dataSent: ["City"], credentialRequired: false, endpoint: "https://api.example.org/sun?city={value}", webPage: "", requestValueFrom: "City", requestValueType: "text", responseFields: [{ name: "Sunset instant", valueType: "date-time", optional: false }] },
  ],
  platformNeeds: ["network", "background-execution"],
  qualityRequirements: ["Text short enough for a bar."],
  productConstraints: ["Send only the city to the service."],
  ideaCoverage: [{ sentence: 1, features: ["Scheduled sunset refresh", "Sunset label"], outsideFeatures: "none" }],
}
