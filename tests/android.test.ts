import { describe, expect, it } from "vitest"
import { ANDROID_SDK } from "../src/androidKit"
import { compilePacket } from "../src/compiler"
import { PRESETS, resolvePresetOptions } from "../src/presets"
import { fixtureCases } from "./fixtures/blueprints"
import { medicineBlueprint } from "./fixtures/medicine"
import { pantryBlueprint } from "./fixtures/pantry"
import { auditSemanticIntake } from "../src/schema"
import { auditCapabilities } from "../src/capabilities"

const habit = fixtureCases.find(item => item.presetId === "android-kotlin-compose")!.blueprint

async function pantry() {
  const packet = await compilePacket(pantryBlueprint, "android-kotlin-compose")
  const task = (id: string) => packet.graph.phases.flatMap(phase => phase.tasks).find(item => item.id === id)!
  const kit = (path: string) => packet.kit.find(file => file.name === `kit/${path}`)?.content
  return { packet, task, kit, trd: packet.documents["TRD.md"], tasks: packet.documents["TASKS.md"], agents: packet.documents["AGENTS.md"] }
}

describe("Android scheduled work", () => {
  it("gives a declared schedule an owner path, a contract, and an injected clock", async () => {
    const { packet, task, kit, trd } = await pantry()
    expect(packet.failures).toEqual([])
    expect(packet.exportable).toBe(true)
    const reminder = task("TASK-08-DAILY-REMINDER")
    for (const name of ["DailyReminderWorker.kt", "DailyReminderScheduler.kt", "DailyReminderSchedulerTest.kt"]) {
      expect(reminder.filesToCreate.some(path => path.endsWith(`/${name}`)), name).toBe(true)
    }
    expect(reminder.filesToModify.some(path => path.endsWith("PantryPalApplication.kt"))).toBe(true)
    expect(reminder.filesToModify.some(path => path.endsWith("AppContainer.kt"))).toBe(true)
    expect(reminder.contractIds).toContain("CON-DAILY-REMINDER-SCHEDULE")
    expect(trd).toContain("CON-DAILY-REMINDER-SCHEDULE")
    expect(trd).toContain("NotificationChannel with id \"daily-reminder\"")
    expect(trd).toContain("setInitialDelay(ScheduleMath.initialDelay(clock, LocalTime.of(9, 0)))")
    expect(trd).toContain("then the period is 24 hours")
    expect(trd).toContain("never returns Result.retry()")
    expect(trd).toContain("Clock.fixed")
    expect(reminder.prompt).toContain("Time rule")
    expect(kit("app/src/main/java/com/pantry/pal/platform/ScheduleMath.kt")).toContain("fun initialDelay(clock: Clock")
    expect(kit("app/src/main/java/com/pantry/pal/AppContainer.kt")).toContain("val workManager")
    expect(trd).toContain("ExistingPeriodicWorkPolicy.CANCEL_AND_REENQUEUE")
    expect(kit("app/src/test/resources/robolectric.properties")).toContain("application=com.pantry.pal.TestPantryPalApplication")
    expect(kit("app/src/test/java/com/pantry/pal/TestPantryPalApplication.kt")).toContain("initializeTestWorkManager")
    expect(kit("app/src/main/java/com/pantry/pal/PantryPalApplication.kt")).toContain("open class PantryPalApplication")
    // A packet with no declared schedule ships neither the helper nor the work manager.
    const noSchedule = await compilePacket(habit, "android-kotlin-compose")
    expect(noSchedule.kit.some(file => file.name.endsWith("ScheduleMath.kt"))).toBe(false)
    expect(noSchedule.documents["TRD.md"]).not.toMatch(/CON-[A-Z-]+-SCHEDULE\b/)
  })

  it("requires an injected clock where acceptance compares stored dates with now, and nowhere else", async () => {
    const { task } = await pantry()
    expect(task("TASK-05-EXPIRING-SOON").prompt).toContain("Clock.fixed")
    expect(task("TASK-06-MARK-ITEM-USED").prompt).toContain("Time rule")
    expect(task("TASK-04-ADD-GROCERY-ITEM").prompt).not.toContain("Time rule")
  })

  it("specifies one notification permission flow and says a schedule is not a retry", async () => {
    const { task, trd, agents } = await pantry()
    for (const document of [trd, agents]) expect(document).not.toMatch(/opt-in flow/)
    expect(trd).toContain("PermissionCoordinator.requestOnFirstLaunch")
    expect(trd).toContain("No later launch prompts again")
    expect(trd).toContain("a declared schedule (runs every N seconds or daily at a time) are not retries")
    const permission = task("TASK-07-PERMISSION-COORDINATOR")
    expect(permission.filesToModify.some(path => path.endsWith("/MainActivity.kt"))).toBe(true)
    expect(permission.filesToModify).toContain("app/src/main/AndroidManifest.xml")
  })
})

describe("Android storage, files, and build ownership", () => {
  it("maps records to Room and settings to DataStore without describing one object with both", async () => {
    const { packet } = await pantry()
    const text = (id: string) => [packet.graph.contracts.find(item => item.id === id)!].flatMap(item => [item.decision, ...item.details]).join("\n")
    const records = text("CON-PERSISTENCE-GROCERY-ITEMS")
    const recordsData = text("CON-DATA-GROCERY-ITEMS")
    const settings = text("CON-PERSISTENCE-REMINDER-PREFERENCES")
    const settingsData = text("CON-DATA-REMINDER-PREFERENCES")
    expect(records).toContain("Room")
    expect(records).not.toContain("DataStore")
    expect(recordsData).toContain("exactly: insert, observeAll, getById, update")
    expect(recordsData).not.toContain("DataStore")
    expect(settings).toContain("Preferences DataStore")
    expect(settings).not.toContain("Room")
    expect(settingsData).toContain("Preferences DataStore")
    expect(settingsData).toContain("no Room entity or DAO exists for it")
    expect(packet.graph.persistence.decision).toBe("Persistence: Preferences DataStore behind SettingsRepository; Room entity and DAO behind a repository.")
  })

  it("lets the data and feature tasks edit the container and ships the build settings in the kit", async () => {
    const { task, kit } = await pantry()
    expect(task("TASK-02-DATA-STORE").filesToModify.some(path => path.endsWith("/AppContainer.kt"))).toBe(true)
    expect(task("TASK-02-DATA-STORE").filesToModify.some(path => path.endsWith("/data/SettingsRepository.kt"))).toBe(true)
    expect(task("TASK-04-ADD-GROCERY-ITEM").filesToModify.some(path => path.endsWith("/AppContainer.kt"))).toBe(true)
    const gradle = kit("app/build.gradle.kts")!
    expect(gradle).toContain("room.schemaLocation")
    for (const dependency of ["kotlinx.coroutines.test", "androidx.work.testing", "libs.robolectric"]) expect(gradle).toContain(dependency)
    expect(kit("app/src/test/resources/robolectric.properties")).toContain("sdk=")
    expect(kit("app/src/main/java/com/pantry/pal/data/SettingsRepository.kt")).toContain("notificationPermissionState")
  })

  it("drops boilerplate that does not apply and states SDK levels once", async () => {
    const { packet, kit, trd, agents } = await pantry()
    const all = Object.values(packet.documents).join("\n")
    expect(all).not.toMatch(/Storage Access Framework|OpenDocument/)
    expect(all).not.toContain("sensors, media")
    expect(all).not.toMatch(/baseline/i)
    expect(PRESETS["android-kotlin-compose"].options.some(option => option.id === "baselineProfile")).toBe(false)
    expect(resolvePresetOptions("android-kotlin-compose", ["baselineProfile=true"]).issues.length).toBeGreaterThan(0)
    const levels = `compileSdk ${ANDROID_SDK.compileSdk}, targetSdk ${ANDROID_SDK.targetSdk}, minSdk ${ANDROID_SDK.minSdk}, build-tools ${ANDROID_SDK.buildTools}`
    expect(trd).toContain(levels)
    expect(agents).toContain(levels)
    const gradle = kit("app/build.gradle.kts")!
    expect(gradle).toContain(`compileSdk = ${ANDROID_SDK.compileSdk}`)
    expect(gradle).toContain(`minSdk = ${ANDROID_SDK.minSdk}`)
    expect(kit("README.md")).toContain(`build-tools ${ANDROID_SDK.buildTools}`)
    expect(kit("README.md")).not.toMatch(/Copy packaging-owned/)
    expect(packet.graph.contracts.find(item => item.id === "CON-PLATFORM-FILES")!.decision).toContain("app-private storage")
  })
})

describe("Android validation gates", () => {
  it("keeps device gates out of the mandatory exit-zero list and says when they run", async () => {
    const { packet, task, tasks, agents } = await pantry()
    expect(packet.graph.validationCommands).toEqual(expect.arrayContaining(["./scripts/gradle.sh testDebugUnitTest", "./scripts/gradle.sh assembleDebug"]))
    for (const command of packet.graph.validationCommands) expect(command).not.toMatch(/connectedDebugAndroidTest|adb /)
    for (const command of task("TASK-09-PACKAGING").validationCommands) expect(command).not.toMatch(/connectedDebugAndroidTest|adb /)
    for (const document of [tasks, agents]) {
      expect(document).toContain("with none attached they are skipped and the completion report is PARTIAL")
      expect(document).toContain("Device gate: `./scripts/gradle.sh connectedDebugAndroidTest`")
      expect(document).toContain("Device gate: `adb install -r app/build/outputs/apk/debug/app-debug.apk`")
    }
    expect(agents).not.toContain("connectedDebugAndroidTest` and require exit status zero")
  })

  it("tells the first main-surface task to build a screen, not a window", async () => {
    const { tasks } = await pantry()
    const sentence = tasks.match(/You are the first main-surface task[^\n]*?later tasks must not replace them\./)![0]
    expect(sentence).toContain("main screen content area")
    expect(sentence).not.toMatch(/window|search|filter/i)
  })
})

describe("Android audit fixes", () => {
  it("keeps a schedule's once-per-day state in the kit settings and names it in the contract", async () => {
    const { kit, trd, task } = await pantry()
    const settings = kit("app/src/main/java/com/pantry/pal/data/SettingsRepository.kt")!
    expect(settings).toContain("fun lastRunEpochDay(schedule: String)")
    expect(settings).toContain("suspend fun recordRun(schedule: String, epochDay: Long)")
    expect(settings).not.toContain("compact")
    expect(trd).toContain("Run state: the epoch day")
    expect(trd).toContain('lastRunEpochDay("daily-reminder")')
    expect(trd).toContain("a day is never notified twice")
    expect(trd).toContain("No screen shows the notification status unless a feature declares one")
    expect(trd).not.toContain("shows in-app status that notifications are off")
    expect(task("TASK-08-DAILY-REMINDER").filesToModify.some(path => path.endsWith("/data/SettingsRepository.kt"))).toBe(false)
  })

  it("treats the generated Room schema as committed build output, not a created file", async () => {
    const { task, trd, kit } = await pantry()
    expect(task("TASK-02-DATA-STORE").prompt).toContain("generated build output, committed with this task, and is not part of the create-only list")
    expect(trd).toContain("generated file is committed with the data task and exempt from its create-only list")
    expect(trd).toContain("a date and time is a Long in epoch milliseconds (UTC)")
    expect(trd).toContain("suspend fun getById(id: Long): GroceryItemsEntity?")
    expect(kit("README.md")).toContain("generated by the build and committed")
  })

  it("ships no settings, WorkManager, or settings wording when the packet declares none", async () => {
    const trail = fixtureCases.find(item => item.blueprint.productName === "Trail Ready")!
    const packet = await compilePacket(trail.blueprint, "android-kotlin-compose")
    expect(packet.failures).toEqual([])
    const files = packet.kit.map(file => file.name)
    expect(files.some(name => name.endsWith("/SettingsRepository.kt"))).toBe(false)
    expect(files.some(name => name.endsWith("/SettingsRepositoryTest.kt"))).toBe(false)
    expect(packet.kit.find(file => file.name.endsWith("/AppContainer.kt"))!.content).not.toContain("SettingsRepository")
    const gradle = packet.kit.find(file => file.name === "kit/app/build.gradle.kts")!.content
    expect(gradle).not.toContain("work.runtime")
    expect(gradle).toContain("androidx.compose.ui.test.junit4")
    expect(packet.graph.lockedStack).not.toContain("WorkManager")
    const dataTask = packet.graph.phases.flatMap(phase => phase.tasks).find(item => item.id.includes("DATA-STORE"))!
    expect(dataTask.filesToModify.some(path => path.endsWith("/SettingsRepository.kt"))).toBe(false)
    expect(packet.documents["ARD.md"]).toContain("No setting is declared")
    expect(packet.documents["TRD.md"]).not.toContain("saved records and settings")
    expect(packet.documents["TRD.md"]).toContain("Android gives no reliable process-termination callback")
    expect(packet.documents["TRD.md"]).not.toMatch(/privileged capture/)
  })

  it("lists every foundation file a task modifies as a shared file in AGENTS.md", async () => {
    const { packet, agents } = await pantry()
    const modified = new Set(packet.graph.phases.flatMap(phase => phase.tasks).flatMap(item => item.filesToModify))
    for (const path of modified) if (packet.graph.foundationFiles.includes(path)) expect(agents, path).toContain(`Shared file ${path} —`)
  })

  it("requires the injected clock where a feature updates a stored date", async () => {
    const { task } = await pantry()
    expect(task("TASK-06-MARK-ITEM-USED").prompt).toContain("Time rule")
  })

  it("tells the first main-surface task to show every stored field the PRD says a list shows", async () => {
    const { tasks } = await pantry()
    expect(tasks).toContain("every stored field the PRD says that list shows")
  })

  it("gives the provider the Android content rules that cannot be checked mechanically", () => {
    const notes = PRESETS["android-kotlin-compose"].providerNotes!.join("\n")
    for (const phrase of ["initial option always has a selected value", "which date a bare time belongs to", "at most once per local day", "builds on deliver"]) expect(notes).toContain(phrase)
  })
})

describe("Android per-record reminders and tailored slots", () => {
  const medicine = async () => {
    const packet = await compilePacket(medicineBlueprint, "android-kotlin-compose")
    const task = (id: string) => packet.graph.phases.flatMap(phase => phase.tasks).find(item => item.id.startsWith(id))!
    const kit = (path: string) => packet.kit.find(file => file.name === `kit/app/src/${path}`)?.content
    return { packet, task, kit, trd: packet.documents["TRD.md"], tasks: packet.documents["TASKS.md"] }
  }

  it("states a tick rule and a (record, day) log for a reminder whose time is a stored field", async () => {
    const { packet, kit, trd } = await medicine()
    expect(packet.failures).toEqual([])
    expect(packet.exportable).toBe(true)
    expect(trd).toContain("PeriodicWorkRequest.Builder(DoseReminderWorker::class.java, 15, TimeUnit.MINUTES) with no initial delay")
    expect(trd).toContain("No lifecycle-scoped coroutine, in-app timer, or exact alarm repeats this check")
    expect(trd).toContain("holds one row per (Medicines id, local epoch day)")
    expect(trd).toContain('the record\'s Name value and its text is exactly "Time to take your medicine"')
    expect(trd).toContain("DoseReminderScheduler.enqueue(container.workManager) right after")
    expect(trd).toContain("start(container) does not enqueue it")
    expect(trd).not.toContain("Run state: the epoch day")
    expect(trd).not.toContain("24, TimeUnit.HOURS")
    expect(kit("main/java/com/medicine/time/platform/reminders/ReminderLog.kt")).toContain('primaryKeys = ["recordId", "epochDay"]')
    expect(kit("main/java/com/medicine/time/platform/reminders/DueReminders.kt")).toContain("fun due(")
    expect(kit("test/java/com/medicine/time/platform/reminders/DueRemindersTest.kt")).toContain("theFirstTickEverSendsNothing")
    expect(kit("main/java/com/medicine/time/AppContainer.kt")).toContain("val reminderLog")
    expect(kit("main/java/com/medicine/time/data/SettingsRepository.kt")).toContain("fun lastTickEpochMs")
    expect(kit("main/java/com/medicine/time/data/SettingsRepository.kt")).not.toContain("lastRunEpochDay")
    expect(trd).toContain("a time of day is a String HH:MM")
    expect(trd).toContain("observeAll returns the rows ordered by id ascending")
  })

  it("ships the reminder log only when runsAtField is declared", async () => {
    const pantryPacket = await compilePacket(pantryBlueprint, "android-kotlin-compose")
    expect(pantryPacket.kit.some(file => file.name.includes("/platform/reminders/"))).toBe(false)
    expect(pantryPacket.kit.find(file => file.name.endsWith("/AppContainer.kt"))!.content).not.toContain("reminderLog")
    expect(pantryPacket.documents["TRD.md"]).toContain("Run state: the epoch day")
  })

  it("exposes only the slots the declared operations need, and names the slot or none per task", async () => {
    const { task, tasks } = await medicine()
    const first = task("TASK-04").prompt
    expect(first).toContain("a per-row action area on every row of the main list")
    expect(first).not.toMatch(/detail view|Edit button/)
    expect(task("TASK-05-MARK-TAKEN").prompt).toContain("(the per-row action area)")
    expect(task("TASK-05-MARK-TAKEN").prompt).not.toContain("Reuse the form fields")
    expect(task("TASK-08").prompt).toContain("mounts into no slot")
    expect(tasks).not.toMatch(/holds an Edit button/)
  })

  it("keeps the detail view only when a feature declares an item page", async () => {
    const withPage = { ...medicineBlueprint, features: medicineBlueprint.features.map(feature => feature.name === "Mark taken" ? { ...feature, surface: "item-page" as const } : feature) }
    const packet = await compilePacket(withPage, "android-kotlin-compose")
    expect(packet.graph.phases.flatMap(phase => phase.tasks).find(item => item.prompt.includes("first main-surface task"))!.prompt).toContain("a detail view for the selected record")
  })

  it("stamps written times instead of asking for a before/on/after boundary", async () => {
    const { task } = await medicine()
    expect(task("TASK-04").prompt).toContain("Stamp rule")
    expect(task("TASK-04").prompt).not.toContain("Time rule")
    expect(task("TASK-06-MEDICINE-LIST").prompt).toContain("recomputed from the clock on every resume")
  })

  it("rejects a reminder declaration the compiler cannot build from", () => {
    const at = medicineBlueprint.features.find(feature => feature.runsAtField)!
    const bad = (patch: Partial<NonNullable<typeof at.runsAtField>>, extra: Record<string, unknown> = {}) =>
      auditSemanticIntake({ ...medicineBlueprint, features: medicineBlueprint.features.map(feature => feature === at ? { ...feature, ...extra, runsAtField: { ...at.runsAtField!, ...patch } } : feature) }).map(issue => issue.rule)
    expect(auditSemanticIntake(medicineBlueprint)).toEqual([])
    expect(bad({ timeField: "Name" })).toContain("semantic.run-at-time-field")
    expect(bad({ titleField: "Taken date" })).toContain("semantic.run-at-title-field")
    expect(bad({ notificationBody: "Take it now" })).toContain("semantic.run-at-body")
    expect(bad({ data: "Nothing" })).toContain("semantic.run-at-data")
    expect(bad({}, { runsEverySeconds: 60 })).toContain("semantic.two-schedules")
    expect(bad({}, { dataOperations: [] })).toContain("semantic.run-at-read")
  })

  it("drops settings, WorkManager, and backup leftovers when nothing needs them", async () => {
    const trail = fixtureCases.find(item => item.blueprint.productName === "Trail Ready")!
    const packet = await compilePacket(trail.blueprint, "android-kotlin-compose")
    const kit = (name: string) => packet.kit.find(file => file.name === `kit/${name}`)!.content
    expect(kit("app/src/main/AndroidManifest.xml")).toContain('android:allowBackup="false"')
    expect(kit("gradle/libs.versions.toml")).not.toMatch(/work|datastore/i)
    expect(kit("app/src/main/java/com/trail/ready/TrailReadyApplication.kt")).not.toContain("WorkManager")
    expect(packet.graph.lockedStack).not.toContain("DataStore")
    const trd = packet.documents["TRD.md"]
    expect(trd).not.toContain("settings are grouped rows")
    expect(trd).not.toContain("restores every setting")
    expect(trd).not.toContain("a command with nothing to act on")
    expect(trd).not.toContain("or WorkManager rather")
    expect(trd).not.toContain("DataStore, filesDir, cacheDir")
    expect(trd).not.toContain("provider changes")
    expect(packet.documents["ARD.md"]).toContain("OWN-DATA-STORE is Room only: add no Jetpack DataStore")
    expect(packet.documents["TASKS.md"]).toContain("ContractTest reads build.gradle.kts relative to the test working directory")
    expect(packet.documents["TASKS.md"]).toContain("declares com.trail.ready as the namespace and applicationId")
    expect(packet.documents["TASKS.md"]).not.toContain("The implementation marker is")
    expect(packet.documents["TASKS.md"]).toContain("Packaging API: Packaging.kt defines `fun assertProductionWiring(container: AppContainer)`")
    expect(packet.documents["TASKS.md"]).toContain("LifecycleCoordinator API")
  })
})

describe("Android wording kept from the provider", () => {
  it("keeps the grammar of a condition that said either", async () => {
    const edited = { ...medicineBlueprint, features: medicineBlueprint.features.map(feature => feature.name === "Add medicine" ? { ...feature, behavior: "Add a medicine with a name and a time. If either field is empty, the form is not submitted." } : feature) }
    const packet = await compilePacket(edited, "android-kotlin-compose")
    expect(packet.documents["PRD.md"]).toContain("If any field is empty, the form is not submitted.")
  })
})

describe("Android round-4 audit fixes", () => {
  it("names the scheduler test class once, without a doubled package", async () => {
    const { task } = await pantry()
    const commands = task("TASK-08-DAILY-REMINDER").validationCommands.join("\n")
    expect(commands).toContain('--tests "com.pantry.pal.feature.dailyreminderfeature.DailyReminderSchedulerTest"')
    expect(commands).not.toContain("com.pantry.pal.com.pantry.pal")
  })

  it("exposes the area above the list for a later read feature that also marks rows, and the filter state owner", async () => {
    const { task } = await pantry()
    const first = task("TASK-04-ADD-GROCERY-ITEM").prompt
    expect(first).toContain("one area above the list")
    expect(first).toContain("the shared view state holds the selected filter")
    expect(first).toContain("the inline add form shell on the main screen")
  })

  it("makes the owner of a shared selection rule export one pure function the scheduled feature calls", async () => {
    const built = await compilePacket({ ...pantryBlueprint, features: pantryBlueprint.features.map(feature => feature.name === "Daily reminder" ? { ...feature, buildsOn: ["Expiring soon"] } : feature) }, "android-kotlin-compose")
    const packet = built
    const prompts = packet.graph.phases.flatMap(phase => phase.tasks).map(item => item.prompt)
    expect(prompts.some(prompt => prompt.includes("Shared selection function: export from"))).toBe(true)
    expect(packet.documents["TRD.md"]).toContain("Feature file:")
  })

  it("rejects a settings object that only remembers the last run day of a scheduled feature", () => {
    const withRun = {
      ...pantryBlueprint,
      dataObjects: pantryBlueprint.dataObjects.map(item => item.storage === "settings" ? { ...item, fields: [{ name: "Last reminder date", valueType: "date" as const, optional: true }] } : item),
    }
    expect(auditCapabilities(withRun, PRESETS["android-kotlin-compose"]).map(issue => issue.rule)).toContain("capability.android-run-state")
    expect(auditCapabilities(pantryBlueprint, PRESETS["android-kotlin-compose"]).map(issue => issue.rule)).not.toContain("capability.android-run-state")
  })

  it("keeps the Time rule conditional on a real comparison", async () => {
    const { task } = await pantry()
    expect(task("TASK-06-MARK-ITEM-USED").prompt).toContain("applies only to a comparison")
  })
})
