import type { PresetContract } from "./presets"
import type { SemanticBlueprint, SemanticIssue } from "./schema"
import { fieldIdentifier } from "./kitText"
import { featureTexts, waybarCapabilityIssues } from "./waybarContracts"

// Prose that puts a record in a view of its own, reached by selecting its row.
const SELECTED_RECORD_VIEW = /\b(read-only|details?) (view|pane|panel|page)\b|\bselecting (a|an|the) \w+ (shows|opens|displays)\b/i

// The preset declares what the platform can express. The blueprint declares what the product
// needs. This is the gate that stops a Wayland packet from promising macOS-only automation.
export function auditCapabilities(blueprint: SemanticBlueprint, preset: PresetContract): SemanticIssue[] {
  const issues: SemanticIssue[] = []
  if (preset.id === "astro-web") {
    const opensFiles = blueprint.features.some(feature => feature.userFileAccess !== "none")
    blueprint.dataObjects.forEach((item, index) => {
      if (item.storage === "document" && !opensFiles) {
        issues.push({ path: `dataObjects[${index}].storage`, rule: "capability.astro-content-storage", message: `Data object '${item.name}' is content of the site; declare it as records. A document is a file the visitor opens or saves, and no feature does that.` })
      }
    })
  }
  if (preset.id === "linux-hyprland-waybar-module") {
    issues.push(...waybarCapabilityIssues(blueprint))
    blueprint.dataObjects.forEach((item, index) => {
      // The kit's Settings already owns refresh_seconds (the module's own refresh interval, set with `config set refresh_seconds`).
      item.fields.forEach((field, position) => {
        if (item.storage === "settings" && fieldIdentifier(field.name) === "refresh_seconds") {
          issues.push({ path: `dataObjects[${index}].fields[${position}].name`, rule: "capability.waybar-refresh-setting", message: `Setting '${field.name}' is the module's built-in refresh_seconds setting; remove the field (the refresh interval already exists).` })
        }
      })
      if (item.storage === "session" || item.storage === "temporary") {
        issues.push({ path: `dataObjects[${index}].storage`, rule: "capability.waybar-process-memory", message: `Data object '${item.name}' is ${item.storage}, but each Waybar module run is a separate process; use records or settings for anything kept between runs.` })
      }
    })
  }
  // The Tauri main screen builds a detail view only for a feature that edits a record; without one a delete or mark
  // control is a button in the list row, so prose about a view of the selected record has no owner.
  if (preset.id === "tauri2-rust-typescript-desktop" && !blueprint.features.some(feature => feature.dataOperations.some(entry => entry.operations.includes("edit")))) {
    blueprint.features.forEach((feature, index) => {
      if (featureTexts(feature).some(text => SELECTED_RECORD_VIEW.test(text))) {
        issues.push({ path: `features[${index}]`, rule: "capability.tauri-no-detail-view", message: `Feature '${feature.name}' describes a view of one selected record, but no feature of this product edits a record, so the main screen has no such view: the list is the only place a record is shown. Rewrite this feature without it: a Delete or mark control is a button in the record's list row, and a failed delete leaves the row in place and shows its message there. Remove every mention of selecting a row, a read-only view, or a detail view from its behavior, trigger, failureOutcome, and acceptanceSignals.` })
      }
    })
  }
  const supportedSurfaces = new Set(preset.capabilities.surfaces)
  // A repair that only drops the need from the feature leaves it in platformNeeds, which then fails semantic.unused-platform-need.
  const dropNeed = (need: string): string => `Remove '${need}' from this feature's usesPlatformNeeds, and from platformNeeds unless another feature still lists it, and rewrite the behavior that needed it.`
  blueprint.features.forEach((feature, index) => {
    const path = `features[${index}]`
    if (feature.systemSource !== "none" && preset.id !== "linux-hyprland-waybar-module") {
      issues.push({ path: `${path}.systemSource`, rule: "capability.system-source", message: `Feature '${feature.name}' reads an operating-system source, which ${preset.label} does not provide; set systemSource to none.` })
    }
    // Name only the fields actually set: a repair told to clear fields that are already empty leaves the real one in place.
    const barFields = [
      (feature.thresholds ?? []).length > 0 && "thresholds to []",
      (feature.labelTemplate ?? "").trim() !== "" && "labelTemplate to \"\"",
      (feature.unit ?? "").trim() !== "" && "unit to \"\"",
      (feature.valueDecimals ?? null) !== null && "valueDecimals to null",
    ].filter((field): field is string => field !== false)
    if (barFields.length > 0 && preset.id !== "linux-hyprland-waybar-module") {
      issues.push({ path: `${path}.${barFields[0]!.split(" ")[0]}`, rule: "capability.waybar-label", message: `Feature '${feature.name}' sets bar-module label fields, which only a Waybar module uses; set ${barFields.join(", ")}. State a count, goal, or unit in the feature's behavior and acceptance signals instead.` })
    }
    if (feature.usesTray && !preset.capabilities.tray) {
      issues.push({ path: `${path}.usesTray`, rule: "capability.tray", message: `Feature '${feature.name}' needs a tray, but ${preset.label} has no tray surface. Set usesTray to false and show it on the preset's own surface instead.` })
    }
    if (feature.clipboardWatch && !preset.capabilities.clipboardWatch) {
      issues.push({ path: `${path}.clipboardWatch`, rule: "capability.clipboard-watch", message: `Feature '${feature.name}' watches the clipboard in the background, which ${preset.label} cannot do on this platform. Set clipboardWatch to false.` })
    }
    if (feature.usesPlatformNeeds.includes("audio-input") && !preset.capabilities.microphone) {
      issues.push({ path: `${path}.usesPlatformNeeds`, rule: "capability.microphone", message: `Feature '${feature.name}' needs microphone capture, which ${preset.label} does not provide. ${dropNeed("audio-input")}` })
    }
    if (feature.usesPlatformNeeds.includes("camera") && !preset.capabilities.camera) {
      issues.push({ path: `${path}.usesPlatformNeeds`, rule: "capability.camera", message: `Feature '${feature.name}' needs camera capture, which ${preset.label} does not provide. ${dropNeed("camera")}` })
    }
    if (feature.usesPlatformNeeds.includes("location") && !preset.capabilities.location) {
      issues.push({ path: `${path}.usesPlatformNeeds`, rule: "capability.location", message: `Feature '${feature.name}' needs location, which ${preset.label} does not provide. ${dropNeed("location")}` })
    }
    if (feature.usesPlatformNeeds.includes("accessibility-control") && !preset.capabilities.accessibilityControl) {
      issues.push({ path: `${path}.usesPlatformNeeds`, rule: "capability.accessibility-control", message: `Feature '${feature.name}' needs to control another application, which ${preset.label} cannot do. ${dropNeed("accessibility-control")}` })
    }
    if (feature.usesPlatformNeeds.includes("global-hotkey") && preset.capabilities.globalShortcuts === "none") {
      issues.push({ path: `${path}.usesPlatformNeeds`, rule: "capability.global-shortcut", message: `Feature '${feature.name}' needs a global shortcut, which ${preset.label} cannot register. ${dropNeed("global-hotkey")}` })
    }
    if (feature.usesPlatformNeeds.includes("notifications") && !preset.capabilities.notifications) {
      issues.push({ path: `${path}.usesPlatformNeeds`, rule: "capability.notifications", message: `Feature '${feature.name}' needs notifications, which ${preset.label} does not provide. ${dropNeed("notifications")}` })
    }
    if (preset.id === "android-kotlin-compose" && feature.runsAtField === null && feature.usesPlatformNeeds.includes("notifications") && (feature.runsDailyAt !== null || feature.runsEverySeconds !== null) && !feature.scheduledNotification) {
      issues.push({ path: `${path}.scheduledNotification`, rule: "capability.android-notification-text", message: `Feature '${feature.name}' posts a scheduled notification; declare scheduledNotification with the literal titleText (quoted exactly in one acceptanceSignal) and the notificationBody (what its text says, including any literal used when there is nothing to list).` })
    }
    if (preset.id === "android-kotlin-compose" && feature.runsAtField === null && (feature.runsDailyAt !== null || feature.runsEverySeconds !== null)) {
      const remembers = blueprint.dataObjects.find(item => item.storage === "settings" && feature.usesData.some(name => name.trim().toLowerCase() === item.name.trim().toLowerCase()) && item.fields.some(field => field.valueType === "date" || field.valueType === "date-time"))
      if (remembers) {
        issues.push({ path: `${path}.usesData`, rule: "capability.android-run-state", message: `Feature '${feature.name}' runs on a schedule, and the app already keeps the day it last ran in its own settings; remove its ${remembers.fields.filter(field => field.valueType === "date" || field.valueType === "date-time").map(field => `'${field.name}'`).join(", ")} from the settings data object '${remembers.name}', and remove '${remembers.name}' itself only if that leaves it no fields, together with every reference to it (usesData, dataOperations, and other features).` })
      }
    }
    if (feature.usesPlatformNeeds.includes("background-execution") && !preset.capabilities.background) {
      issues.push({ path: `${path}.usesPlatformNeeds`, rule: "capability.background", message: `Feature '${feature.name}' needs background execution, which ${preset.label} does not provide. ${dropNeed("background-execution")}` })
    }
    if (feature.usesPlatformNeeds.includes("launch-at-login") && !preset.capabilities.launchAtLogin) {
      issues.push({ path: `${path}.usesPlatformNeeds`, rule: "capability.launch-at-login", message: `Feature '${feature.name}' needs launch at login, which ${preset.label} does not provide. ${dropNeed("launch-at-login")}` })
    }
    if (feature.userFileAccess !== "none" && preset.capabilities.fileAccess === "none") {
      issues.push({ path: `${path}.userFileAccess`, rule: "capability.file-access", message: `Feature '${feature.name}' opens or saves a user file, but ${preset.label} has no file picker. Set userFileAccess to none; the app reads and writes only its own files.` })
    }
    if (!supportedSurfaces.has(feature.surface)) {
      issues.push({ path: `${path}.surface`, rule: "capability.surface", message: `Feature '${feature.name}' uses surface ${feature.surface}, which ${preset.label} does not render. Set surface to one of: ${[...supportedSurfaces].join(", ")}.` })
    }
  })
  return issues
}
