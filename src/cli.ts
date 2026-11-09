import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { DOCUMENT_NAMES, compilePacket, packetForExport, type CompiledPacket } from "./compiler"
import { nodeJevProvider } from "./jev-wire"
import { generatePacket, DEFAULT_API_URL, type BlueprintProvider } from "./pipeline"
import { deepseekProvider } from "./provider"
import { PRESETS, PRESET_IDS, isPresetId, resolvePresetOptions, type PresetId, type PresetOptionValue } from "./presets"
import { SemanticBlueprintSchema, type SemanticBlueprint } from "./schema"

interface PacketManifest {
  readonly schema: "nodaysidle.cascade.packet.v4"
  readonly compiler: { readonly version: string }
  readonly preset: {
    readonly id: PresetId
    readonly options: Readonly<Record<string, PresetOptionValue>>
    readonly capabilities: (typeof PRESETS)[PresetId]["capabilities"]
  }
  readonly blueprint: SemanticBlueprint
  readonly documents: Record<string, { readonly sha256: string }>
  readonly kit: readonly { readonly path: string; readonly sha256: string }[]
  readonly validation: { readonly status: "pass" | "fail"; readonly ledger: CompiledPacket["ledger"] }
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch {
    return fail(`Cannot read JSON: ${path}`)
  }
}

function blueprintFrom(value: unknown): SemanticBlueprint {
  const parsed = SemanticBlueprintSchema.safeParse(value)
  if (!parsed.success) {
    fail(parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("\n"))
  }
  return parsed.data
}

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function kitFiles(root: string): string[] {
  if (!existsSync(root)) return []
  return readdirSync(root).flatMap(entry => {
    const path = join(root, entry)
    return statSync(path).isDirectory() ? kitFiles(path) : [path]
  })
}

async function writePacket(packet: CompiledPacket, blueprint: SemanticBlueprint, presetId: PresetId, options: Readonly<Record<string, PresetOptionValue>>, outDir: string): Promise<string> {
  const parent = resolve(outDir)
  const destination = join(parent, packet.projectSlug)
  if (existsSync(destination)) fail(`Destination already exists: ${destination}`)
  mkdirSync(parent, { recursive: true })
  const staging = mkdtempSync(join(parent, `.cascade-${packet.projectSlug}-`))
  try {
    for (const file of packetForExport(packet)) {
      const path = join(staging, file.name)
      mkdirSync(join(path, ".."), { recursive: true })
      writeFileSync(path, file.content)
    }
    const manifest: PacketManifest = {
      schema: "nodaysidle.cascade.packet.v4",
      compiler: { version: "4.0.0" },
      preset: { id: presetId, options, capabilities: PRESETS[presetId].capabilities },
      blueprint,
      documents: Object.fromEntries(DOCUMENT_NAMES.map(name => [name, { sha256: packet.hashes[name] }])),
      kit: packet.kit.map(file => ({ path: file.name, sha256: file.sha256 })),
      validation: { status: packet.exportable ? "pass" : "fail", ledger: packet.ledger },
    }
    writeFileSync(join(staging, "blueprint.json"), `${JSON.stringify(manifest, null, 2)}\n`)
    renameSync(staging, destination)
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    throw error
  }
  return destination
}

function presetId(value: string | undefined): PresetId {
  if (!value) fail(`Choose a preset: ${PRESET_IDS.join(", ")}`)
  if (!isPresetId(value)) fail(`Unknown preset: ${value}`)
  return value
}

async function generate(options: Record<string, string>, optionValues: readonly string[]): Promise<void> {
  const id = presetId(options.preset)
  const resolved = resolvePresetOptions(id, optionValues)
  if (resolved.issues.length) fail(resolved.issues.join("\n"))
  const idea = options.ideaFile ? readFileSync(options.ideaFile, "utf8") : options.idea
  if (!idea) fail("Provide --idea or --idea-file")
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) fail("DEEPSEEK_API_KEY is not set")
  if (options.model && options.model !== "deepseek-flash" && options.model !== "deepseek-v4-pro") fail(`Unknown model: ${options.model}`)
  const jevKey = process.env.TYPESAFE_API_KEY
  const result = await generatePacket({
    requestId: `v4-${crypto.randomUUID()}`,
    idea,
    presetId: id,
    model: options.model === "deepseek-v4-pro" ? "deepseek-v4-pro" : "deepseek-flash",
    apiUrl: process.env.CASCADE_API_URL || DEFAULT_API_URL,
    apiKey,
    jevApiKey: jevKey,
    atomicAuditor: Boolean(jevKey),
    presetOptions: resolved.values,
  }, deepseekProvider as BlueprintProvider, undefined, jevKey ? nodeJevProvider : undefined)
  if (result.status !== "gate-clean" || !result.packet || !result.blueprint) {
    console.error(JSON.stringify({ status: result.status, failure: result.failure, issues: result.issues, repairedIssues: result.repairedIssues }, null, 2))
    process.exit(1)
  }
  const destination = await writePacket(result.packet, result.blueprint, id, resolved.values, options.out ?? ".")
  console.log(`Gate Clean: ${destination}`)
}

async function compile(options: Record<string, string>, optionValues: readonly string[]): Promise<void> {
  const id = presetId(options.preset)
  const resolved = resolvePresetOptions(id, optionValues)
  if (resolved.issues.length) fail(resolved.issues.join("\n"))
  const blueprint = blueprintFrom(readJson(options.blueprint ?? fail("Provide --blueprint")))
  const packet = await compilePacket(blueprint, id, resolved.values)
  if (!packet.exportable) {
    console.error(JSON.stringify(packet.failures, null, 2))
    process.exit(1)
  }
  const destination = await writePacket(packet, blueprint, id, resolved.values, options.out ?? ".")
  console.log(`Compiled: ${destination}`)
}

async function verify(options: Record<string, string>): Promise<void> {
  const folder = resolve(options.packet ?? fail("Provide --packet"))
  const manifest = readJson(join(folder, "blueprint.json")) as PacketManifest
  const packet = await compilePacket(blueprintFrom(manifest.blueprint), manifest.preset.id, manifest.preset.options)
  const documentMismatch = DOCUMENT_NAMES.find(name => sha256(readFileSync(join(folder, name))) !== manifest.documents[name]?.sha256 || packet.hashes[name] !== manifest.documents[name]?.sha256)
  if (documentMismatch) fail(`Document hash mismatch: ${documentMismatch}`)
  const actualKit = kitFiles(join(folder, "kit")).map(path => path.slice(folder.length + 1).replaceAll("\\", "/")).sort()
  const expectedKit = manifest.kit.map(item => item.path).sort()
  if (actualKit.join("|") !== expectedKit.join("|")) fail(`Kit file set mismatch: ${folder}`)
  const kitMismatch = manifest.kit.find(item => sha256(readFileSync(join(folder, item.path))) !== item.sha256)
  if (kitMismatch) fail(`Kit hash mismatch: ${kitMismatch.path}`)
  console.log(`Verified: ${folder}`)
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)
  const { values } = parseArgs({
    args: rest,
    options: {
      preset: { type: "string" },
      blueprint: { type: "string" },
      packet: { type: "string" },
      idea: { type: "string" },
      "idea-file": { type: "string" },
      model: { type: "string" },
      out: { type: "string" },
      option: { type: "string", multiple: true },
    },
    allowPositionals: false,
  })
  const options: Record<string, string> = {
    ...(values.preset ? { preset: values.preset } : {}),
    ...(values.blueprint ? { blueprint: values.blueprint } : {}),
    ...(values.packet ? { packet: values.packet } : {}),
    ...(values.idea ? { idea: values.idea } : {}),
    ...(values["idea-file"] ? { ideaFile: values["idea-file"] } : {}),
    ...(values.model ? { model: values.model } : {}),
    ...(values.out ? { out: values.out } : {}),

  }
  if (command === "generate") return generate(options, values.option ?? [])
  if (command === "compile") return compile(options, values.option ?? [])
  if (command === "verify") return verify(options)
  if (command === "presets") {
    for (const id of PRESET_IDS) {
      const preset = PRESETS[id]
      console.log(`${id}: ${preset.label}`)
      for (const option of preset.options) console.log(`  --option ${option.id}=... (${option.type}) ${option.description}`)
    }
    return
  }
  fail("Usage: cascade <generate|compile|verify|presets> [options]")
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
