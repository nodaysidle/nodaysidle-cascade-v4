import type { NormalizedBlueprint } from "./compiler"
import type { ProjectIdentity } from "./presets"
import { androidXmlString, kotlinString } from "./kitText"

export interface AndroidKitFile {
  readonly path: string
  readonly content: string
}

function file(path: string, content: string): AndroidKitFile {
  return { path, content: content.trimStart() }
}

// The one source of SDK levels: the kit's Gradle files and the TRD/AGENTS runtime text both read it.
export const ANDROID_SDK = { compileSdk: 37, targetSdk: 37, minSdk: 26, buildTools: "37.0.0" } as const

// A declared schedule or notification need decides which kit files ship.
export function androidKitNeeds(blueprint: NormalizedBlueprint): { schedule: boolean; reminders: boolean; runState: boolean; notifications: boolean; settingsData: boolean; settings: boolean } {
  const reminders = blueprint.features.some(feature => feature.runsAtField !== null)
  const schedule = reminders || blueprint.features.some(feature => feature.runsDailyAt !== null || feature.runsEverySeconds !== null)
  // The once-per-day run state serves the schedules that are not per-record reminders; a reminder's state is the kit's ReminderLog.
  const runState = blueprint.features.some(feature => feature.runsAtField === null && (feature.runsDailyAt !== null || feature.runsEverySeconds !== null))
  const notifications = blueprint.permissionNeeds.some(item => item.capability === "notifications")
  const settingsData = blueprint.domainData.some(item => item.storage === "settings")
  // SettingsRepository ships only when something stores in it: a declared setting, the notification state, or a schedule's last-run day.
  return { schedule, reminders, runState, notifications, settingsData, settings: schedule || notifications || settingsData }
}

export function androidKit(identity: ProjectIdentity, blueprint: NormalizedBlueprint): AndroidKitFile[] {
  const pkg = identity.packageName
  const path = identity.packagePath
  const appName = identity.projectName
  const needs = androidKitNeeds(blueprint)
  return [
    file("settings.gradle.kts", `import org.gradle.api.initialization.resolve.RepositoriesMode

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "${identity.slug}"
include(":app")
`),
    file("build.gradle.kts", `plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.ksp) apply false
}
`),
    file("gradle.properties", `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
`),
    file("gradle/libs.versions.toml", `[versions]
agp = "9.5.1"
kotlin = "2.4.21"
ksp = "2.3.13"
composeBom = "2026.09.00"
coreKtx = "1.19.1"
activityCompose = "1.13.0"
lifecycle = "2.11.0"
navigation3 = "1.2.1"
room = "2.8.5"
${needs.settings ? `datastore = "1.3.0"\n` : ""}${needs.schedule ? `work = "2.12.0"\n` : ""}serialization = "1.9.0"
coroutines = "1.10.2"
robolectric = "4.16"
testCore = "1.7.0"
junit = "4.13.2"
androidxJunit = "1.2.1"
espresso = "3.6.1"

[libraries]
androidx-core-ktx = { group = "androidx.core", name = "core-ktx", version.ref = "coreKtx" }
androidx-activity-compose = { group = "androidx.activity", name = "activity-compose", version.ref = "activityCompose" }
androidx-lifecycle-runtime-compose = { group = "androidx.lifecycle", name = "lifecycle-runtime-compose", version.ref = "lifecycle" }
androidx-lifecycle-viewmodel-compose = { group = "androidx.lifecycle", name = "lifecycle-viewmodel-compose", version.ref = "lifecycle" }
androidx-navigation3-runtime = { group = "androidx.navigation3", name = "navigation3-runtime", version.ref = "navigation3" }
androidx-navigation3-ui = { group = "androidx.navigation3", name = "navigation3-ui", version.ref = "navigation3" }
androidx-room-runtime = { group = "androidx.room", name = "room-runtime", version.ref = "room" }
androidx-room-ktx = { group = "androidx.room", name = "room-ktx", version.ref = "room" }
androidx-room-compiler = { group = "androidx.room", name = "room-compiler", version.ref = "room" }
${needs.settings ? `androidx-datastore-preferences = { group = "androidx.datastore", name = "datastore-preferences", version.ref = "datastore" }\n` : ""}${needs.schedule ? `androidx-work-runtime-ktx = { group = "androidx.work", name = "work-runtime-ktx", version.ref = "work" }\nandroidx-work-testing = { group = "androidx.work", name = "work-testing", version.ref = "work" }\n` : ""}androidx-compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "composeBom" }
androidx-compose-ui = { group = "androidx.compose.ui", name = "ui" }
androidx-compose-ui-graphics = { group = "androidx.compose.ui", name = "ui-graphics" }
androidx-compose-ui-tooling-preview = { group = "androidx.compose.ui", name = "ui-tooling-preview" }
androidx-compose-material3 = { group = "androidx.compose.material3", name = "material3" }
androidx-compose-material3-window-size = { group = "androidx.compose.material3", name = "material3-window-size-class" }
androidx-compose-ui-test-junit4 = { group = "androidx.compose.ui", name = "ui-test-junit4" }
androidx-compose-ui-test-manifest = { group = "androidx.compose.ui", name = "ui-test-manifest" }
kotlinx-serialization-json = { group = "org.jetbrains.kotlinx", name = "kotlinx-serialization-json", version.ref = "serialization" }
kotlinx-coroutines-test = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-test", version.ref = "coroutines" }
robolectric = { group = "org.robolectric", name = "robolectric", version.ref = "robolectric" }
androidx-test-core-ktx = { group = "androidx.test", name = "core-ktx", version.ref = "testCore" }
junit = { group = "junit", name = "junit", version.ref = "junit" }
androidx-test-junit = { group = "androidx.test.ext", name = "junit", version.ref = "androidxJunit" }
androidx-test-espresso-core = { group = "androidx.test.espresso", name = "espresso-core", version.ref = "espresso" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
kotlin-serialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin" }
ksp = { id = "com.google.devtools.ksp", version.ref = "ksp" }
`),
    file("app/build.gradle.kts", `plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

android {
    namespace = "${pkg}"
    compileSdk = ${ANDROID_SDK.compileSdk}

    defaultConfig {
        applicationId = "${pkg}"
        minSdk = ${ANDROID_SDK.minSdk}
        targetSdk = ${ANDROID_SDK.targetSdk}
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildFeatures {
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }
}

// Room exports its schema here; the data task commits the generated JSON.
ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation3.runtime)
    implementation(libs.androidx.navigation3.ui)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material3.window.size)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
${needs.settings ? "    implementation(libs.androidx.datastore.preferences)\n" : ""}${needs.schedule ? "    implementation(libs.androidx.work.runtime.ktx)\n" : ""}    implementation(libs.kotlinx.serialization.json)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core.ktx)
${needs.schedule ? "    testImplementation(libs.androidx.work.testing)\n" : ""}    testImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.test.junit)
    androidTestImplementation(libs.androidx.test.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
`),
    file("app/src/main/AndroidManifest.xml", `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:name=".${identity.pascalName}Application"
        android:allowBackup="false"
        android:label="${androidXmlString(appName)}"
        android:supportsRtl="true"
        android:theme="@style/Theme.${identity.pascalName}">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:enableOnBackInvokedCallback="true"
            android:theme="@style/Theme.${identity.pascalName}">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`),
    file(`app/src/main/java/${path}/MainActivity.kt`, `package ${pkg}

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import ${pkg}.App
import ${pkg}.ui.theme.${identity.pascalName}Theme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            ${identity.pascalName}Theme {
                App((application as ${identity.pascalName}Application).container)
            }
        }
    }
}
`),
    file(`app/src/main/java/${path}/${identity.pascalName}Application.kt`, `package ${pkg}

import android.app.Application

${needs.schedule ? "// open so the JVM test Application can extend it and start a test WorkManager first.\n" : ""}open class ${identity.pascalName}Application : Application() {
    lateinit var container: AppContainer

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
`),
    file(`app/src/main/java/${path}/AppContainer.kt`, `package ${pkg}

import android.content.Context
${needs.schedule ? "import androidx.work.WorkManager\n" : ""}${needs.reminders ? `import ${pkg}.platform.reminders.ReminderLogDatabase\nimport ${pkg}.platform.reminders.ReminderLogRepository\n` : ""}${needs.settings ? `import ${pkg}.data.SettingsRepository\n` : ""}import java.time.Clock

// Feature and data tasks add their repositories here and nowhere else. Code that compares a stored
// date or time with the present moment reads \`clock\`; tests pass a fixed Clock instead.
class AppContainer(${needs.schedule ? "private val " : ""}context: Context, val clock: Clock = Clock.systemDefaultZone()) {
${needs.settings ? "    val settings = SettingsRepository(context)\n" : ""}${needs.schedule ? "    val workManager: WorkManager by lazy { WorkManager.getInstance(context) }\n" : ""}${needs.reminders ? "    // The (record id, local day) log that keeps a per-record reminder from being sent twice; its own small database.\n    val reminderLog: ReminderLogRepository by lazy { ReminderLogRepository(ReminderLogDatabase.open(context).dao()) }\n" : ""}}
`),
    ...(needs.settings ? settingsKitFiles(identity, needs) : []),
    file("app/src/test/resources/robolectric.properties", `sdk=35\n${needs.schedule ? `application=${pkg}.Test${identity.pascalName}Application\n` : ""}`),
    ...(needs.schedule ? scheduleKitFiles(identity) : []),
    ...(needs.reminders ? reminderKitFiles(identity) : []),
    file(`app/src/main/java/${path}/App.kt`, `package ${pkg}

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import kotlinx.serialization.Serializable

@Serializable
data object HomeRoute : NavKey

// The composition root: the first main-surface feature task replaces the home entry's content and
// registers its routes here; the container carries every repository.
@Composable
fun App(@Suppress("UNUSED_PARAMETER") container: AppContainer) {
    val backStack = rememberNavBackStack(HomeRoute)

    NavDisplay(
        backStack = backStack,
        onBack = { backStack.removeLastOrNull() },
        entryProvider = entryProvider {
            entry<HomeRoute> {
                Scaffold { padding ->
                    Text("${kotlinString(appName)}", modifier = Modifier.padding(padding).padding(16.dp))
                }
            }
        },
    )
}
`),
    file(`app/src/main/java/${path}/ui/theme/Theme.kt`, `package ${pkg}.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Colors = darkColorScheme(
    primary = Color(0xFF4C8C6B),
    onPrimary = Color(0xFF0B0F14),
    background = Color(0xFF0B0F14),
    onBackground = Color(0xFFE6EDF3),
    surface = Color(0xFF121820),
    onSurface = Color(0xFFE6EDF3),
)

@Composable
fun ${identity.pascalName}Theme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Colors, content = content)
}
`),
    file("app/src/main/res/values/themes.xml", `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.${identity.pascalName}" parent="android:Theme.Material.NoActionBar">
        <item name="android:statusBarColor">#0B0F14</item>
        <item name="android:navigationBarColor">#0B0F14</item>
        <item name="android:windowLightStatusBar">false</item>
    </style>
</resources>
`),
    file(`app/src/test/java/${path}/RouteTest.kt`, `package ${pkg}

import org.junit.Assert.assertEquals
import org.junit.Test

class RouteTest {
    @Test
    fun homeRouteIsTheStartDestination() {
        assertEquals("HomeRoute", HomeRoute::class.simpleName)
    }
}
`),
    file(`app/src/androidTest/java/${path}/LaunchTest.kt`, `package ${pkg}

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LaunchTest {
    @Test
    fun packageNameMatches() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        assertEquals("${pkg}", context.packageName)
    }
}
`),
    file("scripts/gradle.sh", `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export ANDROID_HOME="\${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
if [ ! -f local.properties ]; then
  printf 'sdk.dir=%s\\n' "$ANDROID_HOME" > local.properties
fi

version="\${GRADLE_VERSION:-9.6.0}"
# A system gradle is used only when it is the locked version.
if command -v gradle >/dev/null 2>&1 && gradle --version 2>/dev/null | grep -q "^Gradle $version\\$"; then
  exec gradle "$@"
fi

cache="\${GRADLE_USER_HOME:-$HOME/.gradle}/wrapper/dists"
binary="$(find "$cache" -path "*/gradle-$version/bin/gradle" -type f 2>/dev/null | head -1 || true)"
if [ -z "$binary" ]; then
  target="$HOME/.local/share/gradle"
  mkdir -p "$target"
  archive="\${TMPDIR:-/tmp}/gradle-$version-bin.zip"
  curl -fsSL -o "$archive" "https://services.gradle.org/distributions/gradle-$version-bin.zip"
  unzip -oq "\$archive" -d "\$target"
  binary="$target/gradle-$version/bin/gradle"
fi
exec "$binary" "$@"
`),
    file("README.md", `# ${appName} starter kit

The kit files are copied to the project root before TASK-01 (TASKS.md Working Rules lists them);
TASK-01 verifies that each exists unchanged. The kit is a real Android project with:

- Compose Material 3 and edge-to-edge in MainActivity.
- Navigation 3 with serializable NavKey routes.
- Room (KSP) is declared in the build for the data task; the schema JSON under app/schemas is generated by the build and committed.${needs.settings ? "\n- DataStore behind SettingsRepository for the values this packet stores there." : ""}${needs.schedule ? "\n- WorkManager is declared in the build for the declared schedule." : ""}
- A navigation shell (App.kt) and a container (AppContainer.kt, with an injectable java.time.Clock) that carry no product code:
  feature and data tasks add the entities, DAOs, repositories, ViewModels, and screens their TASKS.md lists.
- JVM test dependencies already declared: JUnit, coroutines-test, Robolectric (sdk=35), androidx test core, and Compose UI tests${needs.schedule ? ", and work-testing" : ""}.${needs.schedule ? "\n  A test Application starts a test WorkManager for every unit test, because the manifest's Application enqueues work on launch." : ""}
  ./scripts/gradle.sh testDebugUnitTest passes without a device. connectedDebugAndroidTest needs one.

Build with ./scripts/gradle.sh assembleDebug. Set ANDROID_HOME to an SDK with platform ${ANDROID_SDK.compileSdk} and
build-tools ${ANDROID_SDK.buildTools} (compileSdk ${ANDROID_SDK.compileSdk}, targetSdk ${ANDROID_SDK.targetSdk}, minSdk ${ANDROID_SDK.minSdk}); the script writes
local.properties on first run. The first build downloads the Gradle distribution and the declared Android
dependencies; the first unit test run downloads the Robolectric android-all jar.
`),
  ]
}

// Shipped only when something stores in it. reset() is the explicit reset the settings placement promises.
function settingsKitFiles(identity: ProjectIdentity, needs: ReturnType<typeof androidKitNeeds>): AndroidKitFile[] {
  const pkg = identity.packageName
  const path = identity.packagePath
  return [
    file(`app/src/main/java/${path}/data/SettingsRepository.kt`, `package ${pkg}.data

import android.content.Context
import androidx.datastore.preferences.core.edit
${needs.runState || needs.reminders ? "import androidx.datastore.preferences.core.longPreferencesKey\n" : ""}${needs.notifications ? "import androidx.datastore.preferences.core.stringPreferencesKey\n" : ""}import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.settingsDataStore by preferencesDataStore(name = "settings")

class SettingsRepository(private val context: Context) {
    suspend fun reset() {
        context.settingsDataStore.edit { it.clear() }
    }
${needs.notifications ? `
    private val notificationPermission = stringPreferencesKey("notification_permission")

    // "unasked" until the one first-launch request has been answered, then "granted" or "denied".
    val notificationPermissionState: Flow<String> = context.settingsDataStore.data.map { it[notificationPermission] ?: "unasked" }

    suspend fun recordNotificationPermission(state: String) {
        require(state == "granted" || state == "denied")
        context.settingsDataStore.edit { it[notificationPermission] = state }
    }
` : ""}${needs.reminders ? `
    // The moment (epoch milliseconds, from the injected clock) of the schedule's previous tick; null before the first.
    fun lastTickEpochMs(schedule: String): Flow<Long?> =
        context.settingsDataStore.data.map { it[longPreferencesKey("last_tick_" + schedule)] }

    suspend fun recordTick(schedule: String, epochMs: Long) {
        context.settingsDataStore.edit { it[longPreferencesKey("last_tick_" + schedule)] = epochMs }
    }
` : ""}${needs.runState ? `
    // The one home of a schedule's once-per-day state: the epoch day (LocalDate.toEpochDay on the injected
    // clock) on which the schedule last sent or deliberately skipped its run; null before the first run.
    fun lastRunEpochDay(schedule: String): Flow<Long?> =
        context.settingsDataStore.data.map { it[longPreferencesKey("last_run_" + schedule)] }

    suspend fun recordRun(schedule: String, epochDay: Long) {
        context.settingsDataStore.edit { it[longPreferencesKey("last_run_" + schedule)] = epochDay }
    }
` : ""}}
`),
    file(`app/src/test/java/${path}/data/SettingsRepositoryTest.kt`, `package ${pkg}.data

import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// Proves the JVM test setup (Robolectric, coroutines-test, DataStore) works without a device.
@RunWith(RobolectricTestRunner::class)
class SettingsRepositoryTest {
    private val repository get() = SettingsRepository(ApplicationProvider.getApplicationContext())

    @Test
    fun resetOnAnEmptyStoreKeepsTheDefaults() = runTest {
        repository.reset()
${needs.notifications ? `        assertEquals("unasked", repository.notificationPermissionState.first())
` : ""}    }
${needs.reminders ? `
    @Test
    fun aTickIsRememberedUntilReset() = runTest {
        assertEquals(null, repository.lastTickEpochMs("reminder").first())
        repository.recordTick("reminder", 1_000)
        assertEquals(1_000L, repository.lastTickEpochMs("reminder").first())
        repository.reset()
        assertEquals(null, repository.lastTickEpochMs("reminder").first())
    }
` : ""}${needs.runState ? `
    @Test
    fun aScheduleRemembersTheDayItLastRanUntilReset() = runTest {
        assertEquals(null, repository.lastRunEpochDay("daily").first())
        repository.recordRun("daily", 20_000)
        assertEquals(20_000L, repository.lastRunEpochDay("daily").first())
        repository.reset()
        assertEquals(null, repository.lastRunEpochDay("daily").first())
    }
` : ""}}
`),
  ]
}

// Shipped only when a feature declares a schedule: the delay rule is compiled and tested once here,
// so a scheduled feature's task does not re-derive it.
function scheduleKitFiles(identity: ProjectIdentity): AndroidKitFile[] {
  const pkg = identity.packageName
  const path = identity.packagePath
  return [
    file(`app/src/main/java/${path}/platform/ScheduleMath.kt`, `package ${pkg}.platform

import java.time.Clock
import java.time.Duration
import java.time.LocalTime
import java.time.ZonedDateTime

// PeriodicWorkRequest cannot start at an exact time: its first run waits this long, then repeats every period.
object ScheduleMath {
    // The wait from now (read from the injected clock) until the next occurrence of \`at\`: today when it
    // is still ahead, tomorrow when it has passed; exactly at the time waits zero.
    fun initialDelay(clock: Clock, at: LocalTime): Duration {
        val now = ZonedDateTime.now(clock)
        var next = now.toLocalDate().atTime(at).atZone(now.zone)
        if (next.isBefore(now)) next = now.toLocalDate().plusDays(1).atTime(at).atZone(now.zone)
        return Duration.between(now, next)
    }
}
`),
    // Robolectric starts the manifest's Application for every unit test; once a task enqueues work there,
    // WorkManager must already be initialized, so every JVM test runs under this Application.
    file(`app/src/test/java/${path}/Test${identity.pascalName}Application.kt`, `package ${pkg}

import androidx.work.Configuration
import androidx.work.testing.WorkManagerTestInitHelper

class Test${identity.pascalName}Application : ${identity.pascalName}Application() {
    override fun onCreate() {
        WorkManagerTestInitHelper.initializeTestWorkManager(this, Configuration.Builder().build())
        super.onCreate()
    }
}
`),
    file(`app/src/test/java/${path}/ApplicationBootTest.kt`, `package ${pkg}

import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// Boots the real Application class under the test WorkManager, so enqueueing work in onCreate is covered.
@RunWith(RobolectricTestRunner::class)
class ApplicationBootTest {
    @Test
    fun theApplicationBuildsItsContainerWithAClock() {
        val application = ApplicationProvider.getApplicationContext<${identity.pascalName}Application>()
        assertNotNull(application.container.workManager)
        assertNotNull(application.container.clock)
    }
}
`),
    file(`app/src/test/java/${path}/platform/ScheduleMathTest.kt`, `package ${pkg}.platform

import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Test

class ScheduleMathTest {
    private fun clockAt(time: String) = Clock.fixed(Instant.parse("2030-01-15T$time:00Z"), ZoneId.of("UTC"))

    @Test
    fun waitsUntilTodayWhenTheTimeIsAhead() {
        assertEquals(Duration.ofHours(1), ScheduleMath.initialDelay(clockAt("08:00"), LocalTime.of(9, 0)))
    }

    @Test
    fun waitsUntilTomorrowWhenTheTimeHasPassed() {
        assertEquals(Duration.ofHours(23), ScheduleMath.initialDelay(clockAt("10:00"), LocalTime.of(9, 0)))
    }

    @Test
    fun runsNowWhenExactlyAtTheTime() {
        assertEquals(Duration.ZERO, ScheduleMath.initialDelay(clockAt("09:00"), LocalTime.of(9, 0)))
    }
}
`),
  ]
}

// Shipped only when a feature declares runsAtField: the (record id, local day) log and the "which records are due in this
// tick" rule are compiled and tested once here, so the reminder task writes only the notification and its wiring.
// The log is its own small Room database, so it never touches the data task's AppDatabase or its schema file.
function reminderKitFiles(identity: ProjectIdentity): AndroidKitFile[] {
  const pkg = identity.packageName
  const path = identity.packagePath
  return [
    file(`app/src/main/java/${path}/platform/reminders/ReminderLog.kt`, `package ${pkg}.platform.reminders

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase

// One row per record notified on one local day (LocalDate.toEpochDay on the injected clock).
@Entity(tableName = "reminder_log", primaryKeys = ["recordId", "epochDay"])
data class ReminderLogEntity(val recordId: Long, val epochDay: Long)

@Dao
interface ReminderLogDao {
    @Query("SELECT COUNT(*) FROM reminder_log WHERE recordId = :recordId AND epochDay = :epochDay")
    suspend fun count(recordId: Long, epochDay: Long): Int

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(entity: ReminderLogEntity): Long
}

@Database(entities = [ReminderLogEntity::class], version = 1, exportSchema = false)
abstract class ReminderLogDatabase : RoomDatabase() {
    abstract fun dao(): ReminderLogDao

    companion object {
        fun open(context: Context): ReminderLogDatabase =
            Room.databaseBuilder(context.applicationContext, ReminderLogDatabase::class.java, "reminder-log.db").build()
    }
}

class ReminderLogRepository(private val dao: ReminderLogDao) {
    suspend fun wasNotified(recordId: Long, epochDay: Long): Boolean = dao.count(recordId, epochDay) > 0

    suspend fun markNotified(recordId: Long, epochDay: Long) {
        dao.insert(ReminderLogEntity(recordId, epochDay))
    }
}
`),
    file(`app/src/main/java/${path}/platform/reminders/DueReminders.kt`, `package ${pkg}.platform.reminders

import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId

// A 15-minute tick cannot match an exact HH:MM, so a record is due when its time of day today fell inside
// the window (previous tick, now]. The window never reaches back past local midnight, and the first tick
// ever (no previous tick) has an empty window, so a time that passed before the app first ran sends nothing.
object DueReminders {
    fun due(times: List<Pair<Long, LocalTime>>, previousTick: Instant?, now: Instant, zone: ZoneId): List<Long> {
        val today = now.atZone(zone).toLocalDate()
        // The day starts one nanosecond early so a record at 00:00 is still due after a tick that ran the evening before.
        val from = maxOf(previousTick ?: now, today.atStartOfDay(zone).toInstant().minusNanos(1))
        return times.filter { (_, time) ->
            val at = today.atTime(time).atZone(zone).toInstant()
            at > from && at <= now
        }.map { it.first }
    }
}
`),
    file(`app/src/test/java/${path}/platform/reminders/ReminderLogTest.kt`, `package ${pkg}.platform.reminders

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ReminderLogTest {
    private val repository = ReminderLogRepository(
        Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), ReminderLogDatabase::class.java)
            .allowMainThreadQueries().build().dao(),
    )

    @Test
    fun aRecordIsLoggedPerDayAndNotAcrossRecordsOrDays() = runTest {
        assertFalse(repository.wasNotified(1, 20_000))
        repository.markNotified(1, 20_000)
        repository.markNotified(1, 20_000)
        assertTrue(repository.wasNotified(1, 20_000))
        assertFalse(repository.wasNotified(2, 20_000))
        assertFalse(repository.wasNotified(1, 20_001))
    }
}
`),
    file(`app/src/test/java/${path}/platform/reminders/DueRemindersTest.kt`, `package ${pkg}.platform.reminders

import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Test

class DueRemindersTest {
    private val zone = ZoneId.of("UTC")
    private fun at(time: String) = Instant.parse("2030-01-15T$time:00Z")
    private val times = listOf(1L to LocalTime.of(9, 5), 2L to LocalTime.of(9, 5), 3L to LocalTime.of(9, 20), 4L to LocalTime.of(8, 0))

    @Test
    fun everyRecordWhoseTimePassedSinceThePreviousTickIsDue() {
        assertEquals(listOf(1L, 2L), DueReminders.due(times, at("09:00"), at("09:15"), zone))
    }

    @Test
    fun aTimeExactlyAtNowIsDueAndExactlyAtThePreviousTickIsNot() {
        assertEquals(listOf(3L), DueReminders.due(times, at("09:15"), at("09:20"), zone))
        assertEquals(emptyList<Long>(), DueReminders.due(times, at("09:20"), at("09:35"), zone))
    }

    @Test
    fun theFirstTickEverSendsNothingAndTheWindowStopsAtMidnight() {
        assertEquals(emptyList<Long>(), DueReminders.due(times, null, at("09:15"), zone))
        assertEquals(listOf(4L), DueReminders.due(times, Instant.parse("2030-01-14T23:00:00Z"), at("08:10"), zone))
    }
}
`),
  ]
}
