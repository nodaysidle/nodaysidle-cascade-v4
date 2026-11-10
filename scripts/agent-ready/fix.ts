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
import { z } from "zod"
import { ideaFromRoundScript, readPacket, type PacketFile } from "./review"

const REQUIRED_DOCS = new Set(["PRD.md", "ARD.md", "TRD.md", "TASKS.md", "AGENTS.md"])
const DOC_ORDER = ["PRD.md", "ARD.md", "TRD.md", "TASKS.md", "AGENTS.md"]

const Edit = z.object({
  // 1-based number of the blocking finding this edit resolves.
  finding: z.number().int(),
  // Optional so saved r1/r2 fix.json files stay valid; defaults to "replace".
  op: z.enum(["replace", "create", "move", "delete"]).optional(),
  file: z.string(),
  // Destination path when op is "move".
  to: z.string().optional(),
  find: z.string(),
  replace: z.string(),
  // true replaces every occurrence in the file; false requires exactly one.
  all: z.boolean(),
})
export const Fix = z.object({ edits: z.array(Edit), notes: z.string() })
export type Edit = z.infer<typeof Edit>

export interface EditFailure { readonly edit: Edit; readonly reason: string }

function validPacketPath(path: string | undefined): path is string {
  if (!path || path.startsWith("/") || path.includes("\\") || path === "blueprint.json") return false
  const parts = path.split("/")
  return parts.every(part => part !== "" && part !== "." && part !== "..")
}

// Exact text replacement and file operations (create, move, delete). An edit that does not match is reported, never guessed at.
export function applyEdits(files: readonly PacketFile[], edits: readonly Edit[]): { files: PacketFile[]; failed: EditFailure[] } {
  const texts = new Map(files.map(file => [file.path, file.text]))
  const failed: EditFailure[] = []
  for (const edit of edits) {
    const op = edit.op ?? "replace"
    if (!validPacketPath(edit.file)) { failed.push({ edit, reason: "invalid packet file path" }); continue }
    if (op === "create") {
      if (texts.has(edit.file)) { failed.push({ edit, reason: "the file already exists in the packet" }); continue }
      texts.set(edit.file, edit.replace)
      continue
    }
    if (op === "delete") {
      if (REQUIRED_DOCS.has(edit.file)) { failed.push({ edit, reason: "cannot delete a required contract document" }); continue }
      if (!texts.has(edit.file)) { failed.push({ edit, reason: "no such file in the packet" }); continue }
      texts.delete(edit.file)
      continue
    }
    if (op === "move") {
      if (!validPacketPath(edit.to)) { failed.push({ edit, reason: "move requires a valid target path in to" }); continue }
      if (REQUIRED_DOCS.has(edit.file)) { failed.push({ edit, reason: "cannot move a required contract document" }); continue }
      const text = texts.get(edit.file)
      if (text === undefined) { failed.push({ edit, reason: "no such file in the packet" }); continue }
      if (edit.to !== edit.file && texts.has(edit.to)) { failed.push({ edit, reason: "the target file already exists in the packet" }); continue }
      if (REQUIRED_DOCS.has(edit.to)) { failed.push({ edit, reason: "cannot move a required contract document" }); continue }
      let nextText = text
      if (edit.find !== "") {
        const count = text.split(edit.find).length - 1
        if (count === 0) { failed.push({ edit, reason: "the find text is not in the file" }); continue }
        if (count > 1 && !edit.all) { failed.push({ edit, reason: `the find text occurs ${count} times and all is false` }); continue }
        nextText = text.split(edit.find).join(edit.replace)
      } else if (edit.replace !== "") {
        nextText = edit.replace
      }
      texts.delete(edit.file)
      texts.set(edit.to, nextText)
      continue
    }
    const text = texts.get(edit.file)
    if (text === undefined) { failed.push({ edit, reason: "no such file in the packet" }); continue }
    const count = edit.find === "" ? 0 : text.split(edit.find).length - 1
    if (count === 0) { failed.push({ edit, reason: "the find text is not in the file" }); continue }
    if (count > 1 && !edit.all) { failed.push({ edit, reason: `the find text occurs ${count} times and all is false` }); continue }
    texts.set(edit.file, text.split(edit.find).join(edit.replace))
  }
  const initialOrder = new Map(files.map((file, index) => [file.path, index]))
  const orderedPaths = [...texts.keys()].sort((left, right) => {
    const leftDoc = DOC_ORDER.indexOf(left)
    const rightDoc = DOC_ORDER.indexOf(right)
    if (leftDoc !== -1 || rightDoc !== -1) {
      if (leftDoc !== -1 && rightDoc !== -1) return leftDoc - rightDoc
      return leftDoc !== -1 ? -1 : 1
    }
    const leftInitial = initialOrder.get(left)
    const rightInitial = initialOrder.get(right)
    if (leftInitial !== undefined && rightInitial !== undefined && files.every(file => texts.has(file.path)) && texts.size === files.length) {
      return leftInitial - rightInitial
    }
    return left < right ? -1 : left > right ? 1 : 0
  })
  return { files: orderedPaths.map(path => ({ path, text: texts.get(path)! })), failed }
}

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

export function touchedKit(edits: readonly Edit[], failed: readonly EditFailure[]): boolean {
  const failedEdits = new Set(failed.map(item => item.edit))
  return edits.some(edit => !failedEdits.has(edit) && (edit.file.startsWith("kit/") || (edit.to?.startsWith("kit/") ?? false)))
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

interface BlockingFinding { readonly where: string; readonly quote: string; readonly why: string; readonly fix: string }

export function buildFixPrompt(idea: string, preset: string, files: readonly PacketFile[], blocking: readonly BlockingFinding[]): string {
  return [
    ...files.map(file => `<file path="${file.path}">\n${file.text}\n</file>`),
    `These are all text files of one generated packet for the preset ${preset}: five Markdown contracts and a starter kit. A coding agent will build the product from only these files, following TASKS.md task by task. The user's idea: "${idea}".`,
    `An independent reviewer found these blocking defects (a coding agent would stall, build the wrong thing, or hit a contradiction):\n${blocking.map((item, index) => `${index + 1}. Where: ${item.where}\n   Quote: ${item.quote}\n   Why: ${item.why}\n   Reviewer's suggestion: ${item.fix}`).join("\n")}`,
    [
      "Repair the packet so that each defect is gone and no new contradiction appears. Return edits.",
      "- Each edit has op ('replace', 'create', 'move', or 'delete'; default 'replace'):",
      "  * 'replace': names file, a find text copied exactly from that file, and its replacement in replace. Keep find as short as it can be while still being unique in the file; set all to true only to replace every occurrence of a repeated sentence.",
      "  * 'create': creates a new kit file at file (under kit/...) with full content in replace (set find to '' and all to false).",
      "  * 'move': moves/renames a kit file from file to 'to' (under kit/...). Set find to '' and replace to '' to move unchanged, or set replace to the full new content (with find ''), or set find and replace to edit while moving.",
      "  * 'delete': deletes a kit file at file (set find to '', replace to '', all to false). Never delete or move the five Markdown contracts.",
      "- The same fact is often printed in several documents (PRD, ARD, TRD, TASKS, AGENTS) and in the kit. Change every copy, so the documents and the kit agree afterwards.",
      "- Build exactly the user's idea: add no feature it did not ask for, and remove any control, screen, store or rule that the idea and its features do not need.",
      "- Where the packet leaves a rule open, choose the simplest rule that fits the idea and the kit's real code, and state it once in precise words (exact text, exact function name and signature, exact number).",
      "- Keep IDs, file paths, owners, task order and validation commands unless a defect requires a change. When a task must create, move, or modify another file, move/rename the corresponding file in kit/ as well and update that task's file lists, the kit README, and the AGENTS Owner Map and shared-file lines to match.",
      "- You may edit, create, move, or delete a kit file when the defect is in the kit; the kit is built immediately after your edits and must still build and pass its own tests, so change its imports, paths, and tests together with its code.",
      "- An acceptance example with numbers must be recomputed by you from the stated rule before you write it.",
      "- Change nothing that the defects do not require.",
      "In notes, say in a few plain sentences what you decided for each defect.",
    ].join("\n"),
  ].join("\n\n")
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
  const blocking = (JSON.parse(readFileSync(values.review, "utf8")) as { review: { blocking: BlockingFinding[] } }).review.blocking
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
