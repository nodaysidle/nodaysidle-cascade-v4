import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import { resolvePresetOptions } from "../src/presets"
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
})
