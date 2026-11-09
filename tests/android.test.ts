import { describe, expect, it } from "vitest"
import { ANDROID_SDK } from "../src/androidKit"
import { compilePacket } from "../src/compiler"
import { PRESETS, resolvePresetOptions } from "../src/presets"
import { fixtureCases } from "./fixtures/blueprints"
import { pantryBlueprint } from "./fixtures/pantry"

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
    expect(task("TASK-06-MARK-ITEM-USED").prompt).toContain("Clock.fixed")
    expect(task("TASK-04-ADD-GROCERY-ITEM").prompt).not.toContain("Clock.fixed")
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
    expect(task("TASK-06-MARK-ITEM-USED").prompt).toContain("Clock.fixed")
  })

  it("tells the first main-surface task to show every stored field the PRD says a list shows", async () => {
    const { tasks } = await pantry()
    expect(tasks).toContain("every stored field the PRD says that list or view shows")
  })

  it("gives the provider the Android content rules that cannot be checked mechanically", () => {
    const notes = PRESETS["android-kotlin-compose"].providerNotes!.join("\n")
    for (const phrase of ["initial option always has a selected value", "which date a bare time belongs to", "at most once per local day", "builds on deliver"]) expect(notes).toContain(phrase)
  })
})
