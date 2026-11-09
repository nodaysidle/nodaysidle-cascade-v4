import { createHash } from "node:crypto"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { DOCUMENT_NAMES, buildPacketManifest, packetForExport, type CompiledPacket, type PacketManifest } from "./compiler"
import type { PresetId, PresetOptionValue } from "./presets"
import type { SemanticBlueprint } from "./schema"

export { buildPacketManifest, type PacketManifest } from "./compiler"

export function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex")
}

export function kitFiles(root: string): string[] {
  if (!existsSync(root)) return []
  return readdirSync(root).flatMap(entry => {
    const path = join(root, entry)
    return statSync(path).isDirectory() ? kitFiles(path) : [path]
  })
}

export function writePacketAtomic(packet: CompiledPacket, blueprint: SemanticBlueprint, presetId: PresetId, options: Readonly<Record<string, PresetOptionValue>>, outDir: string): string {
  const parent = resolve(outDir)
  const destination = join(parent, packet.projectSlug)
  if (existsSync(destination)) throw new Error(`Destination already exists: ${destination}`)
  mkdirSync(parent, { recursive: true })
  const staging = mkdtempSync(join(parent, `.cascade-${packet.projectSlug}-`))
  try {
    for (const file of packetForExport(packet)) {
      const path = join(staging, file.name)
      mkdirSync(join(path, ".."), { recursive: true })
      writeFileSync(path, file.content)
      if (file.name.startsWith("kit/") && file.name.endsWith(".sh")) chmodSync(path, 0o755)
    }
    writeFileSync(join(staging, "blueprint.json"), `${JSON.stringify(buildPacketManifest(packet, blueprint, presetId, options), null, 2)}\n`)
    renameSync(staging, destination)
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    throw error
  }
  return destination
}

export function verifyPacketFolder(folderInput: string, packet: CompiledPacket, manifest: PacketManifest): string | undefined {
  const folder = resolve(folderInput)
  const documentMismatch = DOCUMENT_NAMES.find(name => sha256(readFileSync(join(folder, name))) !== manifest.documents[name]?.sha256 || packet.hashes[name] !== manifest.documents[name]?.sha256)
  if (documentMismatch) return `Document hash mismatch: ${documentMismatch}`
  const actualKit = kitFiles(join(folder, "kit")).map(path => path.slice(folder.length + 1).replaceAll("\\", "/")).sort()
  const expectedKit = manifest.kit.map(item => item.path).sort()
  if (actualKit.join("|") !== expectedKit.join("|")) return `Kit file set mismatch: ${folder}`
  const kitMismatch = manifest.kit.find(item => sha256(readFileSync(join(folder, item.path))) !== item.sha256)
  return kitMismatch ? `Kit hash mismatch: ${kitMismatch.path}` : undefined
}
