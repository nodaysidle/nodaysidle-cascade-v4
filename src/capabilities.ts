import type { PresetContract } from "./presets"
import type { SemanticBlueprint, SemanticIssue } from "./schema"
import { waybarCapabilityIssues } from "./waybarContracts"

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
      if (item.storage === "session" || item.storage === "temporary") {
        issues.push({ path: `dataObjects[${index}].storage`, rule: "capability.waybar-process-memory", message: `Data object '${item.name}' is ${item.storage}, but each Waybar module run is a separate process; use records or settings for anything kept between runs.` })
      }
    })
  }
  const supportedSurfaces = new Set(preset.capabilities.surfaces)
  blueprint.features.forEach((feature, index) => {
    const path = `features[${index}]`
    if (feature.systemSource !== "none" && preset.id !== "linux-hyprland-waybar-module") {
      issues.push({ path: `${path}.systemSource`, rule: "capability.system-source", message: `Feature '${feature.name}' reads an operating-system source, which ${preset.label} does not provide; set systemSource to none.` })
    }
    if (((feature.thresholds ?? []).length > 0 || (feature.labelTemplate ?? "").trim() !== "" || (feature.unit ?? "").trim() !== "" || (feature.valueDecimals ?? null) !== null) && preset.id !== "linux-hyprland-waybar-module") {
      issues.push({ path: `${path}.thresholds`, rule: "capability.waybar-label", message: `Feature '${feature.name}' declares a module label or severity thresholds, which only a bar module has; leave thresholds empty and labelTemplate empty.` })
    }
    if (feature.usesTray && !preset.capabilities.tray) {
      issues.push({ path: `${path}.usesTray`, rule: "capability.tray", message: `Feature '${feature.name}' needs a tray, but ${preset.label} has no tray surface.` })
    }
    if (feature.clipboardWatch && !preset.capabilities.clipboardWatch) {
      issues.push({ path: `${path}.clipboardWatch`, rule: "capability.clipboard-watch", message: `Feature '${feature.name}' watches the clipboard in the background, which ${preset.label} cannot do on this platform.` })
    }
    if (feature.usesPlatformNeeds.includes("audio-input") && !preset.capabilities.microphone) {
      issues.push({ path: `${path}.usesPlatformNeeds`, rule: "capability.microphone", message: `Feature '${feature.name}' needs microphone capture, which ${preset.label} does not provide.` })
    }
    if (feature.usesPlatformNeeds.includes("camera") && !preset.capabilities.camera) {
      issues.push({ path: `${path}.usesPlatformNeeds`, rule: "capability.camera", message: `Feature '${feature.name}' needs camera capture, which ${preset.label} does not provide.` })
    }
    if (feature.usesPlatformNeeds.includes("location") && !preset.capabilities.location) {
      issues.push({ path: `${path}.usesPlatformNeeds`, rule: "capability.location", message: `Feature '${feature.name}' needs location, which ${preset.label} does not provide.` })
    }
    if (feature.usesPlatformNeeds.includes("accessibility-control") && !preset.capabilities.accessibilityControl) {
      issues.push({ path: `${path}.usesPlatformNeeds`, rule: "capability.accessibility-control", message: `Feature '${feature.name}' needs to control another application, which ${preset.label} cannot do.` })
    }
    if (feature.usesPlatformNeeds.includes("global-hotkey") && preset.capabilities.globalShortcuts === "none") {
      issues.push({ path: `${path}.usesPlatformNeeds`, rule: "capability.global-shortcut", message: `Feature '${feature.name}' needs a global shortcut, which ${preset.label} cannot register.` })
    }
    if (feature.usesPlatformNeeds.includes("notifications") && !preset.capabilities.notifications) {
      issues.push({ path: `${path}.usesPlatformNeeds`, rule: "capability.notifications", message: `Feature '${feature.name}' needs notifications, which ${preset.label} does not provide.` })
    }
    if (preset.id === "android-kotlin-compose" && feature.runsAtField === null && feature.usesPlatformNeeds.includes("notifications") && (feature.runsDailyAt !== null || feature.runsEverySeconds !== null) && !feature.scheduledNotification) {
      issues.push({ path: `${path}.scheduledNotification`, rule: "capability.android-notification-text", message: `Feature '${feature.name}' posts a scheduled notification; declare scheduledNotification with the literal titleText (quoted exactly in one acceptanceSignal) and the notificationBody (what its text says, including any literal used when there is nothing to list).` })
    }
    if (preset.id === "android-kotlin-compose" && feature.runsAtField === null && (feature.runsDailyAt !== null || feature.runsEverySeconds !== null)) {
      const remembers = blueprint.dataObjects.find(item => item.storage === "settings" && feature.usesData.some(name => name.trim().toLowerCase() === item.name.trim().toLowerCase()) && item.fields.some(field => field.valueType === "date" || field.valueType === "date-time"))
      if (remembers) {
        issues.push({ path: `${path}.usesData`, rule: "capability.android-run-state", message: `Feature '${feature.name}' runs on a schedule, and the app already keeps the day it last ran in its own settings; remove the settings data object '${remembers.name}' (it only remembers which day was sent) from dataObjects and from the feature's usesData.` })
      }
    }
    if (feature.usesPlatformNeeds.includes("background-execution") && !preset.capabilities.background) {
      issues.push({ path: `${path}.usesPlatformNeeds`, rule: "capability.background", message: `Feature '${feature.name}' needs background execution, which ${preset.label} does not provide.` })
    }
    if (feature.usesPlatformNeeds.includes("launch-at-login") && !preset.capabilities.launchAtLogin) {
      issues.push({ path: `${path}.usesPlatformNeeds`, rule: "capability.launch-at-login", message: `Feature '${feature.name}' needs launch at login, which ${preset.label} does not provide.` })
    }
    if (feature.userFileAccess !== "none" && preset.capabilities.fileAccess === "none") {
      issues.push({ path: `${path}.userFileAccess`, rule: "capability.file-access", message: `Feature '${feature.name}' opens or saves a user file, but ${preset.label} has no file picker.` })
    }
    if (!supportedSurfaces.has(feature.surface)) {
      issues.push({ path: `${path}.surface`, rule: "capability.surface", message: `Feature '${feature.name}' uses surface ${feature.surface}, which ${preset.label} does not render.` })
    }
  })
  return issues
}
