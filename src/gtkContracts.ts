import type { GraphPhase, NormalizedBlueprint } from "./compiler"
import { gtkKitFlags, rustKitHelpers } from "./kits"
import type { PresetContract } from "./presets"

// The preset names SQLite, settings, a systemd unit, the portal and a text rule only for a product that
// declares them; the kit reads the same flags (gtkKitFlags), so the packet and the kit cannot disagree.
export function gtkSpecialize(preset: PresetContract, blueprint: NormalizedBlueprint): Partial<PresetContract> {
  const flags = gtkKitFlags(blueprint)
  const { records, secrets, http } = rustKitHelpers(blueprint)
  const atomic = flags.settings || blueprint.domainData.some(item => item.writeMode === "atomic-replace" || item.storage === "document" || item.storage === "app-files")
  const temporary = blueprint.persistenceNeeds.some(need => need.temporary || need.storage === "temporary")
  const helpers = [
    ...(atomic ? ["atomic file writes"] : []),
    "XDG paths",
    ...(records ? ["SQLite records"] : []),
    ...(secrets ? ["Secret Service credentials"] : []),
    ...(flags.notifications ? ["notifications"] : []),
    ...(http ? ["the HTTPS client"] : []),
  ]
  const directories = ["data", ...(flags.settings ? ["config"] : []), ...(temporary ? ["runtime"] : [])]
  const boundary = (portal: boolean) => `Read and write only the app's XDG ${directories.join(", ")} ${directories.length > 1 ? "directories" : "directory"}${portal ? " and files or folders the user chooses in the desktop portal" : ""}; never scan another user folder.`
  const details = (portal: boolean) => [
    ...(flags.settings ? ["Settings: $XDG_CONFIG_HOME/{app-id}/settings.json."] : []),
    "Records and app-owned files: $XDG_DATA_HOME/{app-id}/.",
    ...(portal ? ["User-chosen paths come only from org.freedesktop.portal.FileChooser or a path the app saved to reopen."] : []),
    "Every path outside this boundary is rejected and leaves the filesystem unchanged.",
  ]
  const textRule = flags.textFields
    ? ["Text values: a required text field is empty when nothing is left after trimming surrounding whitespace; a length limit counts Unicode scalar values (Rust chars().count()) of the trimmed value, never bytes; a short text field is stored trimmed and a long text field is stored as entered."]
    : []
  const persistenceKinds = [...(flags.settings ? ["atomic JSON settings in XDG config"] : []), ...(records ? ["SQLite records in XDG data"] : [])]
  const persistence = {
    ...preset.persistence,
    enabledDecision: persistenceKinds.length ? `Persistence: enabled with ${persistenceKinds.join(" and ")}.` : "Persistence: enabled for the declared stored data.",
    settingsDecision: "Persistence: atomic JSON settings in XDG config.",
    recordsDecision: "Persistence: SQLite records in XDG data.",
    settingsPlacement: flags.settings ? preset.persistence.settingsPlacement : "No settings are declared; the app writes no settings file.",
    recordsPlacement: records ? preset.persistence.recordsPlacement : "No records are declared; the app creates no database.",
  }
  const overrides: { -readonly [K in keyof PresetContract]?: PresetContract[K] } = {
    runtimeArchitecture: [
      ...preset.runtimeArchitecture.slice(0, 2),
      `Rust platform owners implement ${helpers.join(", ")}; features depend on their traits.`,
      `${boundary(flags.portal)}${atomic ? " A file the app replaces is written to a temporary file in the same directory and renamed over the destination." : ""}`,
      ...(records ? ["Store traits are synchronous. A view-model calls a store from the tokio runtime through spawn_blocking (the store owner holds its Database behind a std::sync::Mutex) and returns the result to the main context through glib::MainContext::spawn_local."] : []),
      ...textRule,
    ],
    persistence,
    fileBoundary: boundary(flags.portal),
    fileBoundaryDetails: details(flags.portal),
    appOnlyFileBoundary: { boundary: boundary(false), details: details(false) },
    lifecycleRules: [
      "Use AdwApplication as the entry point and keep exactly one primary window.",
      `On window close or SIGTERM, cancel active tasks, ${records ? "close the SQLite connection, " : ""}remove temporary files, and release streams.`,
      ...(flags.background ? ["Use a systemd user unit only for a declared background feature; no daemon starts otherwise."] : []),
      "Reopen the main window from the launcher; there is no Dock or menu-bar concept.",
    ],
    wiringRules: preset.wiringRules.map(rule => rule.startsWith("Kit helpers that no contract names")
      ? `${secrets || http ? "Kit helpers that no contract names are optional; do not call a credential or HTTP helper only to satisfy the wiring gate. " : ""}Every owner named in TRD.md must be reachable from the production composition root.`
      : flags.settings ? rule : rule.replace("settings are grouped rows with the label on the left and the control on the right, a switch or checkbox on the same line as its label, and a short note under each group; ", "")),
    completionEvidence: [...preset.completionEvidence, "makepkg --printsrcinfo and the Wayland launch check need an Arch-based host with a Wayland session; on another host the completion report names these gates as not run."],
  }
  if (!flags.background) {
    overrides.packagingRules = preset.packagingRules.map(rule => rule.replace(", and optional systemd unit.", ".").replace(", license, and optional systemd unit.", ", and license."))
    overrides.installationDecision = identity => preset.installationDecision(identity).replace(", and any declared systemd unit under ~/.config/systemd/user", "")
  }
  return overrides
}

// Task sentences that need the GTK widgets and the kit's migration: the data owner's first migration and
// the first main-surface task's slots.
export function refineGtkPhases(phases: readonly GraphPhase[], blueprint: NormalizedBlueprint): GraphPhase[] {
  const { records } = rustKitHelpers(blueprint)
  const operations = new Set(blueprint.features.flatMap(feature => feature.dataOperations))
  const slotNote = [
    ...(operations.has("create") ? ["the add-entry control is an Add button in the AdwHeaderBar that opens an AdwDialog with one field per stored field and closes on a successful save"] : []),
    "each list row is an AdwActionRow whose suffix box is the per-row action area",
    "the detail view is an AdwNavigationPage pushed on an AdwNavigationView that sits inside the ToastOverlay, so Back returns to the list",
  ].join("; ")
  return phases.map(phase => ({
    ...phase,
    tasks: phase.tasks.map(task => {
      const notes = [
        ...(records && task.ownerIds[0] === "OWN-DATA-STORE" ? ["The kit's Database::migrate already sets user_version to 1 and creates no table: run the table migration through Database::connection() inside one transaction (unchecked_transaction on the shared connection) when user_version is below 2 and set it to 2. Do not edit src/platform/sqlite.rs."] : []),
        ...(task.prompt.includes("You are the first main-surface task") ? [`GTK shape of the slots: ${slotNote}.`] : []),
      ]
      return notes.length ? { ...task, prompt: `${task.prompt} ${notes.join(" ")}` } : task
    }),
  }))
}
