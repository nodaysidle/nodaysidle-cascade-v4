import type { NormalizedBlueprint } from "./compiler"
import type { ProjectIdentity } from "./presets"

export interface AndroidKitFile {
  readonly path: string
  readonly content: string
}

function file(path: string, content: string): AndroidKitFile {
  return { path, content: content.trimStart() }
}

export function androidKit(identity: ProjectIdentity, blueprint: NormalizedBlueprint): AndroidKitFile[] {
  const pkg = identity.packageName
  const path = identity.packagePath
  const appName = identity.projectName
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
datastore = "1.3.0"
work = "2.12.0"
serialization = "1.9.0"
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
androidx-datastore-preferences = { group = "androidx.datastore", name = "datastore-preferences", version.ref = "datastore" }
androidx-work-runtime-ktx = { group = "androidx.work", name = "work-runtime-ktx", version.ref = "work" }
androidx-compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "composeBom" }
androidx-compose-ui = { group = "androidx.compose.ui", name = "ui" }
androidx-compose-ui-graphics = { group = "androidx.compose.ui", name = "ui-graphics" }
androidx-compose-ui-tooling-preview = { group = "androidx.compose.ui", name = "ui-tooling-preview" }
androidx-compose-material3 = { group = "androidx.compose.material3", name = "material3" }
androidx-compose-material3-window-size = { group = "androidx.compose.material3", name = "material3-window-size-class" }
androidx-compose-ui-test-junit4 = { group = "androidx.compose.ui", name = "ui-test-junit4" }
androidx-compose-ui-test-manifest = { group = "androidx.compose.ui", name = "ui-test-manifest" }
kotlinx-serialization-json = { group = "org.jetbrains.kotlinx", name = "kotlinx-serialization-json", version.ref = "serialization" }
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
    compileSdk = 37

    defaultConfig {
        applicationId = "${pkg}"
        minSdk = 26
        targetSdk = 37
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
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.kotlinx.serialization.json)

    testImplementation(libs.junit)
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
        android:allowBackup="true"
        android:label="${appName}"
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

class ${identity.pascalName}Application : Application() {
    lateinit var container: AppContainer

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
`),
    file(`app/src/main/java/${path}/AppContainer.kt`, `package ${pkg}

import android.content.Context
import ${pkg}.data.SettingsRepository

// Feature and data tasks add their repositories here and nowhere else.
class AppContainer(context: Context) {
    val settings = SettingsRepository(context)
}
`),
    file(`app/src/main/java/${path}/data/SettingsRepository.kt`, `package ${pkg}.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.settingsDataStore by preferencesDataStore(name = "settings")

class SettingsRepository(private val context: Context) {
    private val compact = booleanPreferencesKey("compact")

    val compactLists: Flow<Boolean> = context.settingsDataStore.data.map { it[compact] ?: false }

    suspend fun setCompact(value: Boolean) {
        context.settingsDataStore.edit { it[compact] = value }
    }
}
`),
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
                    Text("${appName}", modifier = Modifier.padding(padding).padding(16.dp))
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

if command -v gradle >/dev/null 2>&1; then
  exec gradle "$@"
fi

version="\${GRADLE_VERSION:-9.6.0}"
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

Copy the foundation files listed in TASKS.md before TASK-01. Copy packaging-owned files when the packaging
task starts. The kit is a real Android project with:

- Compose Material 3 and edge-to-edge in MainActivity.
- Navigation 3 with serializable NavKey routes.
- DataStore for settings; Room, KSP, and WorkManager are declared in the build for the data and background tasks.
- A navigation shell (App.kt) and a container (AppContainer.kt) that carry no product code: feature and data tasks add the
  entities, DAOs, repositories, ViewModels, and screens their TASKS.md lists.
- Unit and instrumentation test seams.

Build with ./scripts/gradle.sh assembleDebug. Set ANDROID_HOME to an SDK with platform 37 and
build-tools 37.0.0; the script writes local.properties on first run. The first build downloads the
Gradle distribution and the declared Android dependencies.
`),
  ]
}
