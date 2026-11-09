import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import { fixtureCases } from "./fixtures/blueprints"

const NAME = `Say "Hi" \\ Ca$h & Tom's 100%`
const kitFor = async (presetId: (typeof fixtureCases)[number]["presetId"], productName = NAME) => {
  const fixture = fixtureCases.find(item => item.presetId === presetId)!
  const packet = await compilePacket({ ...fixture.blueprint, productName }, presetId)
  expect(packet.failures).toEqual([])
  return (suffix: string) => packet.kit.find(file => file.name.endsWith(suffix))?.content ?? ""
}

describe("product names are escaped in every kit file", () => {
  it("GTK: Rust literals, AppStream XML, .desktop, PKGBUILD", async () => {
    const kit = await kitFor("linux-wayland-gtk4-desktop")
    expect(kit("src/app.rs")).toContain(`.title("Say \\"Hi\\" \\\\ Ca$h & Tom's 100%")`)
    expect(kit("src/app.rs")).toContain(`Some("Say \\"Hi\\" \\\\ Ca$h & Tom's 100%")`)
    expect(kit(".metainfo.xml")).toContain(`<name>Say &quot;Hi&quot; \\ Ca$h &amp; Tom&apos;s 100%</name>`)
    expect(kit(".desktop")).toContain(`Name=Say "Hi" \\\\ Ca$h & Tom's 100%\n`)
    expect(kit("PKGBUILD")).toContain(`pkgdesc='Say "Hi" \\ Ca$h & Tom'\\''s 100%'\n`)
  })

  it("Waybar: Rust tooltip, systemd Description, PKGBUILD", async () => {
    const kit = await kitFor("linux-hyprland-waybar-module")
    expect(kit("src/config.rs")).toContain(`String::from("Say \\"Hi\\" \\\\ Ca$h & Tom's 100%")`)
    expect(kit(".service")).toContain(`Description=Say "Hi" \\ Ca$h & Tom's 100%%\n`)
    expect(kit("PKGBUILD")).toContain(`pkgdesc='Say "Hi" \\ Ca$h & Tom'\\''s 100%'\n`)
  })

  it("Tauri: HTML title, TS template, shell script", async () => {
    const kit = await kitFor("tauri2-rust-typescript-desktop")
    expect(kit("index.html")).toContain(`<title>Say &quot;Hi&quot; \\ Ca$h &amp; Tom&apos;s 100%</title>`)
    expect(kit("src/main.ts")).toContain(`<h1>Say &quot;Hi&quot; \\\\ Ca$h &amp; Tom&apos;s 100%</h1>`)
    expect(kit("scripts/package_linux.sh")).toContain(`APP_NAME='Say "Hi" \\ Ca$h & Tom'\\''s 100%'\n`)
  })

  it("Android: Kotlin literal and manifest label", async () => {
    const kit = await kitFor("android-kotlin-compose")
    expect(kit("MainActivity.kt") + kit("App.kt")).toContain(`Text("Say \\"Hi\\" \\\\ Ca\\$h & Tom's 100%", `)
    expect(kit("AndroidManifest.xml")).toContain(`android:label="Say \\&quot;Hi\\&quot; \\\\ Ca$h &amp; Tom\\&apos;s 100%"`)
  })

  it("a digit-leading or keyword product name still gives a valid crate name", async () => {
    for (const [productName, crate] of [["24h Tracker", "project_24h_tracker"], ["Loop", "loop_app"]] as const) {
      const gtk = await kitFor("linux-wayland-gtk4-desktop", productName)
      expect(gtk("Cargo.toml")).toContain(`name = "${crate.replaceAll("_", "-")}"`)
      expect(gtk("tests/contract_tests.rs")).toContain(`use ${crate}::`)
      const tauri = await kitFor("tauri2-rust-typescript-desktop", productName)
      expect(tauri("src-tauri/Cargo.toml")).toContain(`name = "${crate.replaceAll("_", "-")}"`)
    }
  })
})
