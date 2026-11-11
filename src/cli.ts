import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { compilePacket, type CompiledPacket } from "./compiler"
import { nodeJevProvider } from "./jev-wire"
import { generatePacket, DEFAULT_API_URL, type BlueprintProvider } from "./pipeline"
import { deepseekProvider } from "./provider"
import { PRESETS, PRESET_IDS, isPresetId, resolvePresetOptions, type PresetId, type PresetOptionValue } from "./presets"
import { verifyPacketFolder, writePacketAtomic, writeProviderAnswers, type PacketManifest } from "./packet"
import { applyEditsToCompiledPacket, withPacketRepair, type PacketRepairRecord } from "./review"
import { buildCompiledPacketKit, nodeReviewProvider } from "./review-wire"
import { auditSemanticIntake, SemanticBlueprintSchema, type SemanticBlueprint } from "./schema"
import { auditCapabilities } from "./capabilities"

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

async function writePacket(packet: CompiledPacket, blueprint: SemanticBlueprint, presetId: PresetId, options: Readonly<Record<string, PresetOptionValue>>, outDir: string): Promise<string> {
  return writePacketAtomic(packet, blueprint, presetId, options, outDir)
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
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const reviewRounds = options.reviewRounds ? Number(options.reviewRounds) : undefined
  const answers: string[] = []
  const provider: BlueprintProvider = async request => {
    const text = await (deepseekProvider as BlueprintProvider)(request)
    answers.push(text)
    return text
  }
  const result = await generatePacket({
    requestId: `v4-${crypto.randomUUID()}`,
    idea,
    presetId: id,
    model: options.model === "deepseek-v4-pro" ? "deepseek-v4-pro" : "deepseek-flash",
    apiUrl: process.env.CASCADE_API_URL || DEFAULT_API_URL,
    apiKey,
    jevApiKey: jevKey,
    anthropicApiKey: anthropicKey,
    reviewRounds,
    atomicAuditor: Boolean(jevKey),
    presetOptions: resolved.values,
  }, provider, undefined, jevKey ? nodeJevProvider : undefined, anthropicKey ? nodeReviewProvider : undefined, anthropicKey ? buildCompiledPacketKit : undefined)
  if (options.keepAnswers) writeProviderAnswers(options.keepAnswers, answers)
  if (result.status !== "gate-clean" || !result.packet || !result.blueprint) {
    console.error(JSON.stringify({ status: result.status, failure: result.failure, issues: result.issues, repairedIssues: result.repairedIssues }, null, 2))
    process.exit(1)
  }
  const destination = await writePacket(result.packet, result.blueprint, id, resolved.values, options.out ?? ".")
  console.log(`Gate Clean: ${destination}`)
  if (result.repairedIssues?.length) console.log(`Repaired once: ${[...new Set(result.repairedIssues.map(issue => issue.rule))].join(", ")}`)
  if (!result.repair && !anthropicKey) console.log("Verdict: none (not reviewed: ANTHROPIC_API_KEY is not set)")
  if (result.reviewFailure) console.log(`Verdict: none (review failed: ${result.reviewFailure.message})`)
  if (result.repair) {
    console.log(result.repair.agentReady
      ? `Verdict: Agent-ready (reviewed, 0 blocking${result.repair.rounds > 0 ? `, ${result.repair.rounds} repair round(s)` : ""})`
      : `Verdict: Not ready (${result.repair.review.blocking.length} blocking${result.repair.kitBuildPassed === false ? ", kit build failed" : ""})`)
    const { unverifiedFindings, failedEdits } = result.repair
    if (unverifiedFindings) console.log(`Unverified findings dropped (quote not in the packet): ${unverifiedFindings.blocking} blocking, ${unverifiedFindings.polish} polish`)
    if (failedEdits) console.log(`Repair edits that did not apply: ${failedEdits}`)
  }
}

async function compile(options: Record<string, string>, optionValues: readonly string[]): Promise<void> {
  const id = presetId(options.preset)
  const resolved = resolvePresetOptions(id, optionValues)
  if (resolved.issues.length) fail(resolved.issues.join("\n"))
  const rawJson = readJson(options.blueprint ?? fail("Provide --blueprint"))
  const isManifest = Boolean(rawJson && typeof rawJson === "object" && "schema" in rawJson && "blueprint" in rawJson)
  const blueprint = blueprintFrom(isManifest ? (rawJson as { blueprint: unknown }).blueprint : rawJson)
  const recordedRepair = isManifest ? (rawJson as { repair?: PacketRepairRecord }).repair : undefined
  const intake = auditSemanticIntake(blueprint)
  const capabilities = auditCapabilities(blueprint, PRESETS[id])
  if (intake.length || capabilities.length) {
    console.error(JSON.stringify([...intake, ...capabilities], null, 2))
    process.exit(1)
  }
  let packet = await compilePacket(blueprint, id, resolved.values)
  if (!packet.exportable) {
    console.error(JSON.stringify(packet.failures, null, 2))
    process.exit(1)
  }
  if (recordedRepair) {
    const replayed = await applyEditsToCompiledPacket(packet, recordedRepair.edits)
    if (replayed.failed.length) {
      fail(`Repair edit replay failed in ${replayed.failed[0]!.edit.file}: ${replayed.failed[0]!.reason}`)
    }
    packet = withPacketRepair(replayed.packet, recordedRepair)
  }
  const destination = await writePacket(packet, blueprint, id, resolved.values, options.out ?? ".")
  console.log(`Compiled: ${destination}`)
}

function manifestFrom(value: unknown, folder: string): PacketManifest {
  const manifest = value as Partial<PacketManifest> | null
  const presetId = manifest?.preset?.id
  if (!manifest || typeof presetId !== "string" || !isPresetId(presetId) || !manifest.preset?.options || typeof manifest.preset.options !== "object"
    || typeof manifest.documents !== "object" || !Array.isArray(manifest.kit) || typeof manifest.validation !== "object") {
    return fail(`Malformed blueprint.json (not a Cascade V4 packet manifest): ${folder}`)
  }
  return manifest as PacketManifest
}

async function verify(options: Record<string, string>): Promise<void> {
  const folder = resolve(options.packet ?? fail("Provide --packet"))
  const manifest = manifestFrom(readJson(join(folder, "blueprint.json")), folder)
  const blueprint = blueprintFrom(manifest.blueprint)
  const intake = auditSemanticIntake(blueprint)
  const capabilities = auditCapabilities(blueprint, PRESETS[manifest.preset.id])
  if (intake.length || capabilities.length) {
    console.error(JSON.stringify([...intake, ...capabilities], null, 2))
    process.exit(1)
  }
  const packet = await compilePacket(blueprint, manifest.preset.id, manifest.preset.options)
  if (!packet.exportable || manifest.validation.status !== "pass") fail(`Packet is not Gate Clean: ${folder}`)
  const mismatch = verifyPacketFolder(folder, packet, manifest)
  if (mismatch) fail(mismatch)
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
      "keep-answers": { type: "string" },
      "review-rounds": { type: "string" },
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
    ...(values["keep-answers"] ? { keepAnswers: values["keep-answers"] } : {}),
    ...(values["review-rounds"] ? { reviewRounds: values["review-rounds"] } : {}),
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
