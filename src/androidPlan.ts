import type { OwnerKind, ProjectIdentity } from "./presets"

// Android-only planning: the files, contract, and task text a declared schedule, a notification
// need, or a time comparison adds. Everything here reads declared fields, never feature prose.

export const ANDROID_DEVICE_GATE_RULE = "Device gates run only when `adb devices` lists an attached emulator or device; with none attached they are skipped and the completion report is PARTIAL, begins with the word PARTIAL, and names each skipped gate. The JVM gates above pass in every environment and never depend on a device."
export const ANDROID_DEVICE_COMMANDS = [
  "./scripts/gradle.sh connectedDebugAndroidTest",
  "adb install -r app/build/outputs/apk/debug/app-debug.apk",
] as const

export interface AndroidScheduledFeature {
  readonly id: string
  readonly name: string
  readonly pascal: string
  readonly slug: string
  // The feature owner's implementation file; the schedule files sit beside it.
  readonly implementationFile: string
  readonly runsEverySeconds: number | null
  readonly runsDailyAt: string | null
  readonly notifies: boolean
}

function directory(file: string): string {
  return file.slice(0, file.lastIndexOf("/"))
}

function applicationFile(identity: ProjectIdentity): string {
  return `app/src/main/java/${identity.packagePath}/${identity.pascalName}Application.kt`
}

function containerFile(identity: ProjectIdentity): string {
  return `app/src/main/java/${identity.packagePath}/AppContainer.kt`
}

export function androidScheduleFiles(identity: ProjectIdentity, feature: AndroidScheduledFeature): { create: string[]; modify: string[]; worker: string; scheduler: string; schedulerTest: string } {
  const folder = directory(feature.implementationFile)
  const worker = `${folder}/${feature.pascal}Worker.kt`
  const scheduler = `${folder}/${feature.pascal}Scheduler.kt`
  const schedulerTest = `${folder.replace("app/src/main/", "app/src/test/")}/${feature.pascal}SchedulerTest.kt`
  return { worker, scheduler, schedulerTest, create: [worker, scheduler, schedulerTest], modify: [applicationFile(identity), containerFile(identity)] }
}

const NO_DIRECT_TIME = "no code calls LocalDate.now(), Instant.now(), or System.currentTimeMillis() directly"

export function androidScheduleContract(identity: ProjectIdentity, feature: AndroidScheduledFeature) {
  const files = androidScheduleFiles(identity, feature)
  const application = `${identity.pascalName}Application`
  const delay = feature.runsDailyAt !== null
    ? (() => {
        const [hour, minute] = feature.runsDailyAt.split(":").map(Number)
        return `Delay rule: periodic work cannot run at an exact time, so ${feature.pascal}Scheduler.enqueue(workManager, clock) builds PeriodicWorkRequest.Builder(${feature.pascal}Worker::class.java, 24, TimeUnit.HOURS) with setInitialDelay(ScheduleMath.initialDelay(clock, LocalTime.of(${hour}, ${minute}))) and calls enqueueUniquePeriodicWork("${feature.slug}", ExistingPeriodicWorkPolicy.UPDATE, request). The initial delay is the wait until the next ${feature.runsDailyAt} local time (today when it is still ahead, tomorrow when it has passed), then the period is 24 hours. ScheduleMath (app platform/ScheduleMath.kt) is in the kit and already tested. The platform may run the work later than ${feature.runsDailyAt} (Doze, battery limits) and never earlier.`
      })()
    : `Delay rule: WorkManager's minimum repeat interval is 900 seconds, so ${feature.pascal}Scheduler.enqueue(workManager, clock) builds PeriodicWorkRequest.Builder(${feature.pascal}Worker::class.java, maxOf(${feature.runsEverySeconds}L, 900L), TimeUnit.SECONDS) with no initial delay and calls enqueueUniquePeriodicWork("${feature.slug}", ExistingPeriodicWorkPolicy.UPDATE, request).${feature.runsEverySeconds! < 900 ? ` ${feature.runsEverySeconds} seconds is below that minimum: while the screen showing the result is visible, a lifecycle-scoped coroutine also runs the same work every ${feature.runsEverySeconds} seconds, because background work cannot run that often.` : ""}`
  return {
    id: `CON-${feature.id.replace(/^FEAT-/, "")}-SCHEDULE`,
    name: `${feature.name} schedule`,
    decision: `${feature.name} runs on its declared schedule through WorkManager, owned by the files below. A scheduled run is not a retry and never waits for a user action.`,
    details: [
      `Worker: ${files.worker} defines ${feature.pascal}Worker, a CoroutineWorker whose doWork() reads the repositories from (applicationContext as ${application}).container, does the feature's work once, and returns Result.success() after every run, including a run that failed or had nothing to do; it never returns Result.retry(), because the next scheduled run is the recovery.`,
      ...(feature.notifies
        ? [`Notification channel: ${files.scheduler} defines ${feature.pascal}Scheduler.registerChannel(context), which creates a NotificationChannel with id "${feature.slug}" and name "${feature.name}" (IMPORTANCE_DEFAULT) and is safe to call on every launch; the Worker posts through that channel only when NotificationManagerCompat.areNotificationsEnabled() is true and otherwise posts nothing and still returns Result.success().`]
        : []),
      `Enqueue point: ${application}.onCreate calls ${feature.notifies ? `${feature.pascal}Scheduler.registerChannel(this) and then ` : ""}${feature.pascal}Scheduler.enqueue(container.workManager, container.clock) right after the container is created. AppContainer.kt already provides workManager and clock.`,
      delay,
      `Clock: every time read, the initial delay and any comparison with today or now, uses the injected java.time.Clock (AppContainer.clock in production, Clock.fixed in tests); ${NO_DIRECT_TIME}.`,
      `Manifest: ${application} is already the manifest's application class${feature.notifies ? "; PermissionCoordinator adds the POST_NOTIFICATIONS uses-permission entry" : ""}; declare no SCHEDULE_EXACT_ALARM or foreground-service entry; WorkManager's initializer merges in by itself.`,
      `Tests: ${files.schedulerTest} uses Clock.fixed to assert the initial delay before, at, and after the scheduled time, and TestListenableWorkerBuilder to assert the Worker's result${feature.notifies ? " with notifications enabled and disabled" : ""}; ScheduleMathTest in the kit already covers ScheduleMath itself.`,
    ],
    failureBehavior: "A failed run changes no stored data, posts nothing partial, and is followed by the next scheduled run.",
    recovery: ["The next scheduled run is the recovery; no scheduled run is retried and none waits for a user action."],
  }
}

export interface AndroidTaskExtras {
  readonly create: readonly string[]
  readonly modify: readonly string[]
  readonly note: string
}

export function androidTaskExtras(input: {
  readonly kind: OwnerKind
  readonly identity: ProjectIdentity
  readonly scheduled: readonly AndroidScheduledFeature[]
  readonly clockDependent: boolean
  readonly notifications: boolean
  readonly focusedTestFile: string
}): AndroidTaskExtras {
  const { identity } = input
  const create: string[] = []
  const modify: string[] = []
  const notes: string[] = []
  for (const feature of input.scheduled) {
    const files = androidScheduleFiles(identity, feature)
    create.push(...files.create)
    modify.push(...files.modify)
    notes.push(`This feature runs on a schedule: create ${files.worker}, ${files.scheduler}, and ${files.schedulerTest}, and wire them into ${applicationFile(identity)} exactly as CON-${feature.id.replace(/^FEAT-/, "")}-SCHEDULE says.`)
  }
  if (input.clockDependent) {
    notes.push(`Time rule: this feature's behavior or acceptance depends on the present date or time, so its code takes a java.time.Clock (AppContainer.clock in production) and ${input.focusedTestFile} passes Clock.fixed dates before, on, and after each boundary; ${NO_DIRECT_TIME}.`)
  }
  if (input.kind === "permission" && input.notifications) {
    modify.push(`app/src/main/java/${identity.packagePath}/MainActivity.kt`)
    notes.push("Notification flow: put the one first-launch request flow in PermissionCoordinator.kt and call it from MainActivity.onCreate as CON-PERMISSION-NOTIFICATIONS says; the recorded state lives in SettingsRepository.notificationPermissionState, which the kit already provides.")
  }
  if (input.kind === "packaging") {
    modify.push(applicationFile(identity), `app/src/main/java/${identity.packagePath}/MainActivity.kt`)
    notes.push(`${ANDROID_DEVICE_GATE_RULE} Device gates: ${ANDROID_DEVICE_COMMANDS.map(command => `\`${command}\``).join("; ")}.`)
  }
  return { create, modify, note: notes.join(" ") }
}
