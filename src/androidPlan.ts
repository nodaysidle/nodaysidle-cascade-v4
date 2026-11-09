import { ANDROID_DELETE_PROMPT, ANDROID_DISPLAY_FORMATS } from "./androidForms"
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
  // Per-record reminder: the stored record whose time field decides when each reminder is due.
  readonly at: { readonly record: string; readonly timeField: string; readonly titleField: string; readonly body: string } | null
  readonly notifies: boolean
  // The declared title literal and text rule of a fixed-time or interval notification.
  readonly notice: { readonly titleText: string; readonly notificationBody: string } | null
  // Implementation files of the features this one builds on: where a shared selection rule already lives.
  readonly selectionFiles: readonly string[]
}

// The one name of the shared selection function a notifying feature's Worker calls.
export const androidSelectionFunction = (pascal: string): string => `${pascal.charAt(0).toLowerCase()}${pascal.slice(1)}Values`

function directory(file: string): string {
  return file.slice(0, file.lastIndexOf("/"))
}

function applicationFile(identity: ProjectIdentity): string {
  return `app/src/main/java/${identity.packagePath}/${identity.pascalName}Application.kt`
}

export function androidScheduleFiles(identity: ProjectIdentity, feature: AndroidScheduledFeature): { create: string[]; modify: string[]; worker: string; scheduler: string; schedulerTest: string } {
  const folder = directory(feature.implementationFile)
  const worker = `${folder}/${feature.pascal}Worker.kt`
  const scheduler = `${folder}/${feature.pascal}Scheduler.kt`
  const schedulerTest = `${folder.replace("app/src/main/", "app/src/test/")}/${feature.pascal}SchedulerTest.kt`
  return { worker, scheduler, schedulerTest, create: [worker, scheduler, schedulerTest], modify: [applicationFile(identity)] }
}

const NO_DIRECT_TIME = "no code calls LocalDate.now(), Instant.now(), or System.currentTimeMillis() directly"

export function androidScheduleContract(identity: ProjectIdentity, feature: AndroidScheduledFeature) {
  const files = androidScheduleFiles(identity, feature)
  const application = `${identity.pascalName}Application`
  const at = feature.at
  const delay = at !== null
    ? `Tick rule: periodic work cannot run at an exact HH:MM and WorkManager's minimum repeat interval is 900 seconds, so ${feature.pascal}Scheduler.enqueue(workManager) builds PeriodicWorkRequest.Builder(${feature.pascal}Worker::class.java, 15, TimeUnit.MINUTES) with no initial delay and calls enqueueUniquePeriodicWork("${feature.slug}", ExistingPeriodicWorkPolicy.KEEP, request); the platform may run a tick later than 15 minutes (Doze, battery limits) and never earlier. No lifecycle-scoped coroutine, in-app timer, or exact alarm repeats this check: the only sender is the Worker, so a reminder is never sent from two places. Each tick the Worker reads the previous tick (SettingsRepository.lastTickEpochMs("${feature.slug}")), computes the due record ids with DueReminders.due(times, previousTick, clock.instant(), clock.zone) from every ${at.record} read through ${at.record}Repository (its ${at.timeField} as LocalTime.parse), and records the new tick (SettingsRepository.recordTick("${feature.slug}", clock.millis())) after it has posted. DueReminders (app platform/reminders/DueReminders.kt) is in the kit and already tested: a record is due when its ${at.timeField} today fell after the previous tick and not after now, the window never reaches back past local midnight, and the first tick ever sends nothing.`
    : feature.runsDailyAt !== null
    ? (() => {
        const [hour, minute] = feature.runsDailyAt.split(":").map(Number)
        return `Delay rule: periodic work cannot run at an exact time, so ${feature.pascal}Scheduler.enqueue(workManager, clock) builds PeriodicWorkRequest.Builder(${feature.pascal}Worker::class.java, 24, TimeUnit.HOURS) with setInitialDelay(ScheduleMath.initialDelay(clock, LocalTime.of(${hour}, ${minute}))) and calls enqueueUniquePeriodicWork("${feature.slug}", ExistingPeriodicWorkPolicy.CANCEL_AND_REENQUEUE, request), so every launch recomputes the delay against the clock. The initial delay is the wait until the next ${feature.runsDailyAt} local time (today when it is still ahead, tomorrow when it has passed), then the period is 24 hours. ScheduleMath (app platform/ScheduleMath.kt) is in the kit and already tested. The platform may run the work later than ${feature.runsDailyAt} (Doze, battery limits) and never earlier.`
      })()
    : `Delay rule: WorkManager's minimum repeat interval is 900 seconds, so ${feature.pascal}Scheduler.enqueue(workManager, clock) builds PeriodicWorkRequest.Builder(${feature.pascal}Worker::class.java, maxOf(${feature.runsEverySeconds}L, 900L), TimeUnit.SECONDS) with no initial delay and calls enqueueUniquePeriodicWork("${feature.slug}", ExistingPeriodicWorkPolicy.KEEP, request).${feature.runsEverySeconds! < 900 ? ` ${feature.runsEverySeconds} seconds is below that minimum: while the screen showing the result is visible, a lifecycle-scoped coroutine also runs the same work every ${feature.runsEverySeconds} seconds, because background work cannot run that often.` : ""}`
  return {
    id: `CON-${feature.id.replace(/^FEAT-/, "")}-SCHEDULE`,
    name: `${feature.name} schedule`,
    decision: `${feature.name} runs on its declared schedule through WorkManager, owned by the files below. A scheduled run is not a retry and never waits for a user action.`,
    details: [
      `Worker: ${files.worker} defines ${feature.pascal}Worker, a CoroutineWorker whose doWork() reads the repositories from (applicationContext as ${application}).container, does the feature's work once, and returns Result.success() after every run, including a run that failed or had nothing to do; it never returns Result.retry(), because the next scheduled run is the recovery.`,
      ...(at !== null
        ? [`Reminder log: ReminderLogRepository (kit, app platform/reminders/ReminderLog.kt, provided as AppContainer.reminderLog) holds one row per (${at.record} id, local epoch day), with wasNotified(recordId, epochDay) and markNotified(recordId, epochDay). For every due id the Worker skips the record when wasNotified(id, LocalDate.now(clock).toEpochDay()) is true; otherwise it posts that record's notification and then calls markNotified. Several records, including records with the same time or the same ${at.titleField}, each get their own notification (notification id = the record id) and their own log row. This log is the only once-per-day state of the reminder: no data object, no SettingsRepository key, and no lastRunEpochDay is added for it.`]
        : []),
      ...(at === null ? [`Feature file: ${feature.implementationFile} holds the pure functions the Worker calls (the text builder of the notification from the selected values, and the decision whether to post for a given day); they take plain values and a LocalDate, use no Android type, and the feature's focused test targets them.`] : []),
      ...(feature.notifies
        ? [`Notification channel: ${files.scheduler} defines ${feature.pascal}Scheduler.registerChannel(context), which creates a NotificationChannel with id "${feature.slug}" and name "${feature.name}" (IMPORTANCE_DEFAULT) and is safe to call on every launch; the Worker posts through that channel only when NotificationManagerCompat.areNotificationsEnabled() is true (lint does not read that guard as a permission check, so the notify call carries @SuppressLint("MissingPermission")) and otherwise posts nothing and still returns Result.success(). ${at !== null ? `The notification title is the record's ${at.titleField} value and its text is exactly "${at.body}" (stated in the feature's acceptance); the Worker adds no other text and invents none` : feature.notice ? `The notification title is exactly "${feature.notice.titleText}" (the channel name is "${feature.name}", never the title) and its text is: ${feature.notice.notificationBody}; a list of values in the text is joined with ", " in the order the app's own list shows them${feature.selectionFiles.length ? `; the rule that decides which values are listed is the function the builds-on feature already exports from ${feature.selectionFiles.join(" or ")}, which the Worker calls and never copies (it is named ${androidSelectionFunction(feature.pascal)}(records, today))` : ""}` : "The notification uses the feature name as its title, the sentence the feature's behavior gives as its text"}, the platform icon android.R.drawable.ic_dialog_info (add no resource file), and a PendingIntent.FLAG_IMMUTABLE content intent that opens MainActivity. No screen shows the notification status unless a feature declares one.`]
        : []),
      ...(at !== null ? [] : [`Run state: the epoch day (LocalDate.now(clock).toEpochDay()) on which this schedule last sent or deliberately skipped its run is kept in SettingsRepository under the schedule name "${feature.slug}" (lastRunEpochDay("${feature.slug}") and recordRun("${feature.slug}", epochDay), both already in the kit and tested). doWork() reads it first and does nothing when it equals today, so a day is never notified twice; it records today after it sends and after the feature's own skip rule applies, so a skipped day stays skipped. No other store holds this state and no data object is added for it: a settings object the blueprint declares for the same purpose (a last-run or last-reminder date) is this same stored value, and its data owner adds no second key.`]),
      `Enqueue point: ${application}.onCreate is the one owner that starts this schedule: it calls ${feature.notifies ? `${feature.pascal}Scheduler.registerChannel(this) and then ` : ""}${feature.pascal}Scheduler.enqueue(container.workManager${at !== null ? "" : ", container.clock"}) right after the container is created. AppContainer.kt already provides workManager and clock${at !== null ? " and reminderLog" : ""}. The lifecycle owner's start(container) does not enqueue it and starts nothing for it.`,
      delay,
      `Clock: every time read, ${at !== null ? "the tick window and the log day" : "the initial delay"} and any comparison with today or now, uses the injected java.time.Clock (AppContainer.clock in production, Clock.fixed in tests); ${NO_DIRECT_TIME}.`,
      `Manifest: ${application} is already the manifest's application class${feature.notifies ? "; PermissionCoordinator adds the POST_NOTIFICATIONS uses-permission entry" : ""}; declare no SCHEDULE_EXACT_ALARM or foreground-service entry; WorkManager's initializer merges in by itself.`,
      at !== null
        ? `Tests: ${files.schedulerTest} asserts that enqueue creates unique periodic work "${feature.slug}" with a 15-minute period and no initial delay and that a second enqueue leaves one work item, and uses TestListenableWorkerBuilder with Clock.fixed and the real ReminderLogRepository (in-memory Room) to assert the Worker's result${feature.notifies ? " with notifications enabled and disabled" : ""}, one notification per due ${at.record} (including two with the same time), no second notification for the same (${at.record} id, day) on the next tick, and none for a ${at.record} whose time is not yet due; DueRemindersTest and ReminderLogTest in the kit already cover those two classes.`
        : `Tests: ${files.schedulerTest} uses Clock.fixed to assert the initial delay before, at, and after the scheduled time, and TestListenableWorkerBuilder to assert the Worker's result${feature.notifies ? " with notifications enabled and disabled" : ""}; ScheduleMathTest in the kit already covers ScheduleMath itself.`,
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
  // The feature writes a stored date or time without comparing one with now: it only stamps it.
  readonly stamps?: boolean
  readonly notifications: boolean
  readonly focusedTestFile: string
  readonly firstMain?: boolean
  readonly detailView?: boolean
  // Scheduled features whose notification lists values this owner's feature already selects.
  readonly selectionFor?: readonly { readonly name: string; readonly pascal: string }[]
  // Some owned feature renders on a screen (it is not only a schedule).
  readonly screen?: boolean
  // An owned feature saves records through a form.
  readonly form?: boolean
  // An owned feature deletes records.
  readonly deletes?: boolean
  // An owned feature shows stored numbers or dates.
  readonly displays?: boolean
  // Expected concrete type of every AppContainer property, for the packaging check.
  readonly containerTypes?: readonly string[]
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
  if (input.scheduled.length && input.scheduled.every(feature => feature.notifies)) {
    notes.push(`Focused commands: run ${input.scheduled.map(feature => androidScheduleFiles(identity, feature).schedulerTest.split("/").pop()!.replace(/\.kt$/, "")).join(" and ")} together with ${input.focusedTestFile.split("/").pop()!.replace(/\.kt$/, "")}, not only the feature's focused test.`)
  }
  if (input.screen === false) {
    notes.push(`Registration: this feature adds no control or route, so App.kt and AppContainer.kt stay unchanged; only ${applicationFile(identity).split("/").pop()} changes.`)
  }
  if (input.form) {
    notes.push("Form rules: build the form exactly as the Form, Field rules and Rejection details of the owned interface contracts say; the same validation function backs the Save rejection, the failure behavior, and the focused test, and the form and its validation are exported for any edit task to reuse.")
  }
  if (input.deletes) notes.push(ANDROID_DELETE_PROMPT)
  if (input.selectionFor?.length) {
    const names = input.selectionFor.map(item => item.name)
    notes.push(`Shared selection function: export from ${input.focusedTestFile.replace("/test/", "/main/").replace(/Test\.kt$/, ".kt")} ${input.selectionFor.map(item => `${androidSelectionFunction(item.pascal)}(records, today: LocalDate)`).join(" and ")}, one top-level display-free function (no Compose or Android types; it takes the stored records and today's LocalDate, which the caller reads from the injected clock) that returns the stored records (the record type itself, a List of it, never only their names) that ${names.join(" and ")} lists, in the order the list shows them; the Worker maps them to what it posts and the screen builds its rows from them. The screen of this task and the Worker of ${names.join(" and ")} both call that one function and never recompute the rule; its name is fixed here, and test it in ${input.focusedTestFile} with Clock.fixed dates before, on, and after each edge of its window.`)
  }
  if (input.clockDependent) {
    notes.push(`Time rule: this applies only to a comparison of a stored date or time with today or now (a scheduled feature always has one); a feature that only shows or stores dates adds no clock use and no resume recompute. Every such comparison takes a java.time.Clock (AppContainer.clock in production), and when its behavior or acceptance has such a boundary, ${input.focusedTestFile} passes Clock.fixed dates before, on, and after it; ${NO_DIRECT_TIME}.${input.screen === false ? "" : " A status the screen derives from today (only when one exists) is recomputed from the clock on every resume (Lifecycle.Event.ON_RESUME) and after every write; no timer exists for it unless a schedule contract names one."}`)
  }
  if (input.stamps) {
    notes.push(`Stamp rule: a stored date or time this feature writes that the user does not enter (a creation or completion moment) is stamped from AppContainer.clock (clock.millis() for a date and time, LocalDate.now(clock).toEpochDay() for a date), and ${input.focusedTestFile} then passes a fixed java.time.Clock and asserts the stored value equals it; ${NO_DIRECT_TIME}. A date the user enters is stored as entered, and every stored date or time is displayed as ${ANDROID_DISPLAY_FORMATS}. Nothing here compares a stored value with now, so no before/on/after boundary applies.`)
  }
  if (input.kind === "data") {
    notes.push("A test that closes and reopens the store uses a file-backed Room database (Room.databaseBuilder on a file in a temporary directory under Robolectric), because the in-memory database of the test hook cannot be reopened.")
    notes.push("Room writes the schema JSON app/schemas/(the AppDatabase class name)/1.json when the project builds (the kit sets room.schemaLocation); that file is generated build output, committed with this task, and is not part of the create-only list.")
  }
  if (input.firstMain) {
    notes.push(`Every list row${input.detailView ? " and detail view" : ""} shows every stored field the PRD says that list${input.detailView ? " or view" : ""} shows, in the form the stored value has (for a date, the formatted date: ${ANDROID_DISPLAY_FORMATS}); a value an acceptance outcome asserts on screen is shown there too.`)
  }
  if (input.kind === "permission" && input.notifications) {
    modify.push(`app/src/main/java/${identity.packagePath}/MainActivity.kt`)
    notes.push("Notification flow: put the one first-launch request flow in PermissionCoordinator.kt and call it from MainActivity.onCreate as CON-PERMISSION-NOTIFICATIONS says; the recorded state lives in SettingsRepository.notificationPermissionState, which the kit already provides.")
  }
  if (input.kind === "lifecycle") {
    notes.push("LifecycleCoordinator API: `fun start(container: AppContainer)` and `fun stop()`. Both have empty bodies unless a contract names a coroutine the coordinator must own, and then they start and cancel only that coroutine; neither ever enqueues WorkManager work, because each schedule contract names the Application as its one starter. When no contract names a coroutine, its focused test only asserts that start and stop are callable no-ops that enqueue nothing.")
  }
  if (input.kind === "packaging") {
    notes.push(`Packaging API: Packaging.kt defines \`fun assertProductionWiring(container: AppContainer)\`, which throws IllegalStateException naming the first container dependency that is not its concrete production type; the packaging focused test is its only caller: production code never calls it, and it is not wired into Application.onCreate.${input.containerTypes?.length ? ` Expected concrete type of each container property: ${input.containerTypes.join("; ")}; a test Application (when the kit has one) may build the container with a fixed Clock, and the check then accepts the Clock type.` : ""}`)
    modify.push(applicationFile(identity), `app/src/main/java/${identity.packagePath}/MainActivity.kt`)
    notes.push("An acceptance criterion listed here that a feature task already built (a rejected Save, a row action) is asserted by the packaging focused test as well: it drives the real screen through the production container, not a double, and asserts the quoted outcome.")
    notes.push(`${ANDROID_DEVICE_GATE_RULE} Device gates: ${ANDROID_DEVICE_COMMANDS.map(command => `\`${command}\``).join("; ")}.`)
  }
  return { create, modify, note: notes.join(" ") }
}
