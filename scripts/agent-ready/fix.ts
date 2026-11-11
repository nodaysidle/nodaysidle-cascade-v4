// Repair a packet from a review's blocking findings: a Claude model returns exact text edits, and this tool
// applies them to a copy of the packet (the original is never touched). Review the copy again afterwards.
// Usage: fish -c 'npx tsx scripts/agent-ready/fix.ts --model claude-sonnet-5-5 --packet <folder> --review review.json --out /tmp/v4-roundN/<preset>/<slug>'
import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { spawnSync } from "node:child_process"
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { applyEdits, buildFixPrompt, Fix, touchedKit, type PacketFile, type ReviewFinding } from "../../src/review"
import { ideaFromRoundScript, readPacket } from "./review"

export function writePacketEdits(outDir: string, before: readonly PacketFile[], after: readonly PacketFile[]): void {
  const afterPaths = new Set(after.map(file => file.path))
  for (const file of before) {
    if (!afterPaths.has(file.path)) rmSync(join(outDir, file.path), { force: true })
  }
  for (const file of after) {
    const target = join(outDir, file.path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, file.text)
  }
}

export interface KitBuildResult {
  readonly ok: boolean
  readonly command?: string
  readonly output?: string
}

const KIT_COMMANDS: Readonly<Record<string, readonly (readonly string[])[]>> = {
  "linux-wayland-gtk4-desktop": [
    ["cargo", "fmt", "--check"],
    ["cargo", "clippy", "--all-targets", "--all-features", "--", "-D", "warnings"],
    ["cargo", "test"],
  ],
  "linux-hyprland-waybar-module": [
    ["cargo", "fmt", "--check"],
    ["cargo", "clippy", "--all-targets", "--all-features", "--", "-D", "warnings"],
    ["cargo", "test"],
  ],
  "astro-web": [
    ["npm", "install", "--no-audit", "--no-fund"],
    ["npm", "run", "check"],
    ["npm", "run", "build"],
    ["npm", "test"],
    ["npm", "run", "test:a11y"],
    ["npm", "run", "audit:performance"],
  ],
  "tauri2-rust-typescript-desktop": [
    ["npm", "install", "--no-audit", "--no-fund"],
    ["npm", "run", "typecheck"],
    ["npm", "test"],
    ["npm", "run", "build"],
    ["npm", "run", "tauri", "--", "icon", "app-icon.svg"],
    ["cargo", "fmt", "--manifest-path", "src-tauri/Cargo.toml", "--", "--check"],
    ["cargo", "test", "--manifest-path", "src-tauri/Cargo.toml"],
  ],
  "android-kotlin-compose": [
    ["./scripts/gradle.sh", "assembleDebug", "testDebugUnitTest"],
  ],
}

export function buildKit(packetDir: string, preset: string): KitBuildResult {
  const commands = KIT_COMMANDS[preset]
  if (!commands) return { ok: false, command: preset, output: `Unknown preset for kit build: ${preset}` }
  const home = homedir()
  const cargoTargetDir = join(home, ".cache", "cascade-v4", "target")
  const cacheTmpDir = join(home, ".cache", "cascade-v4", "tmp")
  mkdirSync(cargoTargetDir, { recursive: true })
  mkdirSync(cacheTmpDir, { recursive: true })
  const workDir = mkdtempSync(join(cacheTmpDir, "kit-build-"))
  try {
    cpSync(join(packetDir, "kit"), workDir, { recursive: true })
    const scriptsDir = join(workDir, "scripts")
    if (existsSync(scriptsDir)) {
      for (const name of readdirSync(scriptsDir)) {
        if (name.endsWith(".sh")) chmodSync(join(scriptsDir, name), 0o755)
      }
    }
    const env = {
      ...process.env,
      CARGO_TARGET_DIR: cargoTargetDir,
      TMPDIR: cacheTmpDir,
      ANDROID_HOME: process.env.ANDROID_HOME ?? join(home, "Android", "Sdk"),
    }
    for (const args of commands) {
      const commandText = args.join(" ")
      const result = spawnSync(args[0]!, args.slice(1), { cwd: workDir, env, encoding: "utf8" })
      if (result.status !== 0) {
        const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim()
        const tail = combined.split("\n").slice(-15).join("\n")
        return { ok: false, command: commandText, output: tail }
      }
    }
    return { ok: true }
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { model: { type: "string" }, packet: { type: "string" }, review: { type: "string" }, idea: { type: "string" }, out: { type: "string" } } })
  if (!values.model || !values.packet || !values.review || !values.out) throw new Error("Usage: fix.ts --model <claude model id> --packet <folder> --review <review.json> --out <new folder> [--idea <text>]")
  const packet = resolve(values.packet)
  const preset = basename(dirname(packet))
  const idea = values.idea ?? ideaFromRoundScript(packet)
  if (!idea) throw new Error(`No idea text for ${packet}: pass --idea`)
  const out = resolve(values.out)
  if (existsSync(out)) throw new Error(`The output folder already exists: ${out}`)
  const blocking = (JSON.parse(readFileSync(values.review, "utf8")) as { review: { blocking: ReviewFinding[] } }).review.blocking
  if (blocking.length === 0) throw new Error("The review has no blocking finding; nothing to repair.")
  const { files } = readPacket(packet)
  const prompt = buildFixPrompt(idea, preset, files, blocking)

  const client = new Anthropic()
  // Streamed because the edits can be long. No fallback model on purpose: this measures the named model.
  const response = await client.messages.stream({
    model: values.model,
    max_tokens: 64000,
    output_config: { effort: "high", format: zodOutputFormat(Fix) },
    messages: [{ role: "user", content: prompt }],
  }).finalMessage()
  const text = response.content.flatMap(block => block.type === "text" ? [block.text] : []).join("")
  if (response.stop_reason !== "end_turn") throw new Error(`The model stopped with ${response.stop_reason} and gave no usable repair.`)
  const fix = Fix.parse(JSON.parse(text))

  const result = applyEdits(files, fix.edits)
  cpSync(packet, out, { recursive: true })
  writePacketEdits(out, files, result.files)
  const kitTouched = touchedKit(fix.edits, result.failed)
  const kitBuild = kitTouched ? buildKit(out, preset) : undefined
  writeFileSync(join(dirname(out), `${basename(out)}.fix.json`), JSON.stringify({
    usage: { model: response.model, input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
    fix,
    failed: result.failed,
    ...(kitBuild ? { kitBuild } : {}),
  }, null, 2))
  console.log(`${basename(out)}: ${response.model}, ${response.usage.input_tokens} tokens in, ${response.usage.output_tokens} out; ${fix.edits.length} edits, ${result.failed.length} failed${kitBuild ? `; kit build ${kitBuild.ok ? "ok" : `FAILED (${kitBuild.command})`}` : ""}`)
  for (const failure of result.failed) console.log(`  FAILED edit for finding ${failure.edit.finding} in ${failure.edit.file}: ${failure.reason}`)
  console.log(`  notes: ${fix.notes.replace(/\s+/g, " ").slice(0, 900)}`)
  if (kitBuild && !kitBuild.ok) {
    rmSync(out, { recursive: true, force: true })
    throw new Error(`Repair touched kit/ and broke the kit build (${kitBuild.command}):\n${kitBuild.output ?? ""}`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    if (error instanceof Anthropic.AuthenticationError) console.error("The Anthropic key was not accepted.")
    else if (error instanceof Anthropic.RateLimitError) console.error("Rate limited by the Anthropic API; try again later.")
    else if (error instanceof Anthropic.APIError) console.error(`Anthropic API error ${error.status}: ${error.message}`)
    else console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
