import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import { resolvePresetOptions } from "../src/presets"
import { tauriEverythingBlueprint } from "./fixtures/blueprints"
import { expenseLogBlueprint } from "./fixtures/tauriExpense"

const PRESET = "tauri2-rust-typescript-desktop"
const script = (packet: Awaited<ReturnType<typeof compilePacket>>): string => packet.kit.find(file => file.name === "kit/scripts/package_linux.sh")?.content ?? ""

describe("Tauri Linux packet installs the release binary", () => {
  it("builds the release binary without a bundle and names no AppImage", async () => {
    const packet = await compilePacket(expenseLogBlueprint, PRESET, { linuxPackaging: "binary", wayland: true })
    for (const text of [...Object.values(packet.documents), ...packet.kit.map(file => file.content)]) expect(text.toLowerCase()).not.toContain("appimage")
    const linux = script(packet)
    expect(linux).toContain("npm run tauri -- build --no-bundle")
    expect(linux).toContain('BINARY="${CARGO_TARGET_DIR:-src-tauri/target}/release/$SLUG"')
    expect(linux).toContain('install -m755 "dist/$SLUG" "$INSTALL_DIR/bin/$SLUG"')
    expect(linux).toContain("Exec=env GDK_BACKEND=wayland $INSTALL_DIR/bin/$SLUG\n")
    expect(packet.graph.artifactPath).toBe(`dist/${packet.graph.identity.slug}`)
    expect(packet.graph.validationCommands.at(-1)).toBe("./scripts/package_linux.sh")
  })

  it("starts the binary without the Wayland backend when wayland is off", async () => {
    const packet = await compilePacket(expenseLogBlueprint, PRESET, { linuxPackaging: "binary", wayland: false })
    expect(script(packet)).toContain("Exec=$INSTALL_DIR/bin/$SLUG\n")
  })

  it("defaults linuxPackaging to binary and rejects appimage", () => {
    expect(resolvePresetOptions(PRESET, []).values.linuxPackaging).toBe("binary")
    expect(resolvePresetOptions(PRESET, ["linuxPackaging=appimage"]).issues.length).toBeGreaterThan(0)
  })

  it("writes a productName Tauri accepts, and the project name unchanged when it already is", async () => {
    const productName = (packet: Awaited<ReturnType<typeof compilePacket>>): string => JSON.parse(packet.kit.find(file => file.name === "kit/src-tauri/tauri.conf.json")!.content).productName
    const hostile = await compilePacket({ ...expenseLogBlueprint, productName: '24h "Hi" \\ Ca$h & Tom\'s 100%' }, PRESET, { linuxPackaging: "binary", wayland: true })
    expect(productName(hostile)).toMatch(/^[^/:*?"<>|]+$/)
    expect(productName(hostile)).not.toBe("")
    const plain = await compilePacket(expenseLogBlueprint, PRESET, { linuxPackaging: "binary", wayland: true })
    expect(productName(plain)).toBe(plain.graph.identity.projectName)
  })

  it("carries no macOS, Windows or cross-platform text in either packet and the two packets agree", async () => {
    const blueprint = tauriEverythingBlueprint()
    const needs = ["location", "camera"] as const
    blueprint.platformNeeds = [...blueprint.platformNeeds, ...needs]
    blueprint.features[0]!.usesPlatformNeeds = [...blueprint.features[0]!.usesPlatformNeeds, ...needs]
    const forbidden = /macos|mac os|darwin|windows credential|info\.plist|codesign|notariz|\.icns|\.ico"|keychain|-apple-system|sf pro|blinkmacsystemfont|windows_subsystem|cross-platform|package_app\.sh|\/applications|appimage/i
    // Kept on purpose: the autostart plugin argument, Tauri accelerators, the SwiftUI guard line and the XDG share/applications folder.
    const clean = (text: string): string => text.replaceAll("MacosLauncher", "").replaceAll("share/applications", "share/desktop-entries").replace(/CommandOrControl|CmdOrCtrl/g, "").split("\n").filter(line => !line.startsWith("Forbidden: SwiftUI")).join("\n")
    const withOption = await compilePacket(blueprint, PRESET, { linuxPackaging: "binary", wayland: true })
    const without = await compilePacket(blueprint, PRESET, {})
    for (const packet of [withOption, without]) {
      for (const [name, text] of [...Object.entries(packet.documents), ...packet.kit.map(file => [file.name, file.content] as const)]) expect(clean(text).match(forbidden), name).toBeNull()
    }
    expect(without.kit.map(file => file.name)).toEqual(withOption.kit.map(file => file.name))
    // Only the option packet carries the CON-PRESET-OPTIONS contract; take it out of both before comparing.
    const lines = (text: string): string => text.replace(/### CON-PRESET-OPTIONS[\s\S]*?Correct the option and regenerate\.\n\n/, "").replace(/Contract CON-PRESET-OPTIONS: [^;]*; /, "").replace(/, CON-PRESET-OPTIONS/g, "").split("\n").filter(line => !/preset.options/i.test(line)).join("\n")
    for (const [name, text] of Object.entries(without.documents)) expect(lines(text), name).toBe(lines(withOption.documents[name as keyof typeof withOption.documents]))
  })
})
