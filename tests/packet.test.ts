import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { DOCUMENT_NAMES, compilePacket, packetForExport } from "../src/compiler"
import { kitFiles, sha256, verifyPacketFolder, writePacketAtomic, type PacketManifest } from "../src/packet"
import { fixtureCases } from "./fixtures/blueprints"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const tempRoot = () => { const root = mkdtempSync(join(tmpdir(), "cascade-packet-")); roots.push(root); return root }

describe("packet determinism and verify", () => {
  it.each(fixtureCases)("$presetId / $blueprint.productName renders documents and kit byte-identically twice", async ({ presetId, blueprint }) => {
    const first = await compilePacket(blueprint, presetId)
    const second = await compilePacket(blueprint, presetId)
    for (const name of DOCUMENT_NAMES) expect(second.documents[name]).toBe(first.documents[name])
    expect(second.kit).toEqual(first.kit)
    // A missing lookup in a template renders as the word "undefined"; the documents never contain it.
    expect(Object.values(first.documents).join("\n").replaceAll("one entry or undefined", "")).not.toContain("undefined")
  })

  it("does not depend on the system locale's string order", async () => {
    const original = String.prototype.localeCompare
    const render = async () => Promise.all(fixtureCases.map(async ({ presetId, blueprint }) => {
      const packet = await compilePacket(blueprint, presetId)
      return [...Object.values(packet.documents), ...packet.kit.map(file => file.content)].join("\n")
    }))
    const normal = await render()
    // A locale that orders everything backwards.
    String.prototype.localeCompare = function (this: string, other: string) { return -original.call(this, other) }
    try {
      expect(await render()).toEqual(normal)
    } finally {
      String.prototype.localeCompare = original
    }
  })

  it.each(fixtureCases)("$presetId / $blueprint.productName exports exactly packetForExport plus blueprint.json", async ({ presetId, blueprint }) => {
    const packet = await compilePacket(blueprint, presetId)
    const folder = writePacketAtomic(packet, blueprint, presetId, {}, tempRoot())
    const expected = packetForExport(packet)
    const written = [...DOCUMENT_NAMES.map(name => join(folder, name)), ...kitFiles(join(folder, "kit"))]
      .map(path => path.slice(folder.length + 1)).sort()
    expect(written).toEqual(expected.map(file => file.name).sort())
    for (const file of expected) expect(readFileSync(join(folder, file.name), "utf8")).toBe(file.content)
    const manifest = JSON.parse(readFileSync(join(folder, "blueprint.json"), "utf8")) as PacketManifest
    expect(verifyPacketFolder(folder, packet, manifest)).toBeUndefined()
  })

  // The desktop app's Rust export gate (src-tauri/src/export.rs) must accept every packet the compiler emits.
  it.each(fixtureCases)("$presetId / $blueprint.productName passes the desktop export path rules", async ({ presetId, blueprint }) => {
    const rust = readFileSync("src-tauri/src/export.rs", "utf8")
    const constant = (name: string) => Number(rust.match(new RegExp(`const ${name}: usize = ([0-9_]+);`))![1]!.replaceAll("_", ""))
    const allowed = rust.match(/is_ascii_alphanumeric\(\) \|\| b"([^"]+)"\.contains/)![1]!
    const packet = await compilePacket(blueprint, presetId)
    expect(packet.kit.length).toBeLessThanOrEqual(constant("MAX_KIT_FILES"))
    for (const file of packet.kit) {
      const parts = file.name.slice("kit/".length).split("/")
      expect(parts.length, file.name).toBeLessThanOrEqual(constant("MAX_KIT_PATH_DEPTH"))
      for (const part of parts) {
        expect(part.length > 0 && !part.startsWith("."), file.name).toBe(true)
        expect([...part].every(char => /[A-Za-z0-9]/.test(char) || allowed.includes(char)), file.name).toBe(true)
      }
      expect(Buffer.byteLength(file.content)).toBeLessThanOrEqual(constant("MAX_EXPORT_FILE_BYTES"))
    }
  })

  it("rejects a kit file that matches its manifest but not the current compiler", async () => {
    const { presetId, blueprint } = fixtureCases[0]!
    const packet = await compilePacket(blueprint, presetId)
    const folder = writePacketAtomic(packet, blueprint, presetId, {}, tempRoot())
    const manifestPath = join(folder, "blueprint.json")
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { kit: { path: string; sha256: string }[] }
    const target = manifest.kit[0]!
    const edited = `${readFileSync(join(folder, target.path), "utf8")}\n// edited\n`
    writeFileSync(join(folder, target.path), edited)
    target.sha256 = sha256(edited)
    writeFileSync(manifestPath, JSON.stringify(manifest))
    expect(verifyPacketFolder(folder, packet, manifest as unknown as PacketManifest)).toBe(`Kit file differs from the compiler output: ${target.path}`)
  })

  it("cascade verify fails clearly on a malformed manifest", () => {
    const folder = tempRoot()
    writeFileSync(join(folder, "blueprint.json"), JSON.stringify({ preset: { id: "macos-swiftui", options: {} }, documents: {}, kit: [], validation: {} }))
    const result = spawnSync("npx", ["tsx", "src/cli.ts", "verify", "--packet", folder], { encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Malformed blueprint.json")
  })
})
