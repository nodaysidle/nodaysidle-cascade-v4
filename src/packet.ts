import { createHash } from "node:crypto"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { DOCUMENT_NAMES, buildPacketManifest, packetForExport, type CompiledPacket, type DocumentName, type PacketManifest } from "./compiler"
import type { PresetId, PresetOptionValue } from "./presets"
import { applyEdits } from "./review"
import { redactSecretMaterial, type SemanticBlueprint } from "./schema"

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

// What the provider answered (first answer, then the repair), kept so a failed run can become a test fixture.
export function writeProviderAnswers(folder: string, answers: readonly string[]): void {
  mkdirSync(folder, { recursive: true })
  answers.forEach((text, index) => writeFileSync(join(folder, `answer-${index + 1}.json`), redactSecretMaterial(text)))
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
  let expectedDocHashes: Readonly<Record<DocumentName, string>> = packet.hashes
  let compiledKit = new Map(packet.kit.map(file => [file.name, file.sha256]))
  if (manifest.repair?.edits?.length && !packet.repair) {
    const allFiles = [
      ...DOCUMENT_NAMES.map(name => ({ path: name, text: packet.documents[name] })),
      ...packet.kit.map(file => ({ path: file.name, text: file.content })),
    ]
    const replayed = applyEdits(allFiles, manifest.repair.edits)
    if (replayed.failed.length > 0) {
      const first = replayed.failed[0]!
      return `Repair edit replay failed in ${first.edit.file}: ${first.reason}`
    }
    const byPath = new Map(replayed.files.map(file => [file.path, file.text]))
    expectedDocHashes = Object.fromEntries(DOCUMENT_NAMES.map(name => [name, sha256(byPath.get(name) ?? packet.documents[name])])) as Record<DocumentName, string>
    compiledKit = new Map(
      replayed.files
        .filter(file => file.path.startsWith("kit/"))
        .map(file => [file.path, sha256(file.text)]),
    )
  }
  const documentMismatch = DOCUMENT_NAMES.find(name => sha256(readFileSync(join(folder, name))) !== manifest.documents[name]?.sha256 || expectedDocHashes[name] !== manifest.documents[name]?.sha256)
  if (documentMismatch) return `Document hash mismatch: ${documentMismatch}`
  const actualKit = kitFiles(join(folder, "kit")).map(path => path.slice(folder.length + 1).replaceAll("\\", "/")).sort()
  const expectedKit = manifest.kit.map(item => item.path).sort()
  if (actualKit.join("|") !== expectedKit.join("|")) return `Kit file set mismatch: ${folder}`
  // The manifest is not trusted on its own: every kit file must also match what the current compiler (plus any recorded repair edits) renders.
  if (compiledKit.size !== manifest.kit.length) return `Kit file set differs from the compiler output: ${folder}`
  const staleKit = manifest.kit.find(item => compiledKit.get(item.path) !== item.sha256)
  if (staleKit) return `Kit file differs from the compiler output: ${staleKit.path}`
  const kitMismatch = manifest.kit.find(item => sha256(readFileSync(join(folder, item.path))) !== item.sha256)
  return kitMismatch ? `Kit hash mismatch: ${kitMismatch.path}` : undefined
}
