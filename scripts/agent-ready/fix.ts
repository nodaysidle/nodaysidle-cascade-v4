// Repair a packet from a review's blocking findings: a Claude model returns exact text edits, and this tool
// applies them to a copy of the packet (the original is never touched). Review the copy again afterwards.
// Usage: fish -c 'npx tsx scripts/agent-ready/fix.ts --model claude-sonnet-5-5 --packet <folder> --review review.json --out /tmp/v4-roundN/<preset>/<slug>'
import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { z } from "zod"
import { ideaFromRoundScript, readPacket, type PacketFile } from "./review"

const Edit = z.object({
  // 1-based number of the blocking finding this edit resolves.
  finding: z.number().int(),
  file: z.string(),
  find: z.string(),
  replace: z.string(),
  // true replaces every occurrence in the file; false requires exactly one.
  all: z.boolean(),
})
export const Fix = z.object({ edits: z.array(Edit), notes: z.string() })
export type Edit = z.infer<typeof Edit>

export interface EditFailure { readonly edit: Edit; readonly reason: string }

// Exact text replacement only. An edit that does not match as it says is reported, never guessed at.
export function applyEdits(files: readonly PacketFile[], edits: readonly Edit[]): { files: PacketFile[]; failed: EditFailure[] } {
  const texts = new Map(files.map(file => [file.path, file.text]))
  const failed: EditFailure[] = []
  for (const edit of edits) {
    const text = texts.get(edit.file)
    if (text === undefined) { failed.push({ edit, reason: "no such file in the packet" }); continue }
    const count = edit.find === "" ? 0 : text.split(edit.find).length - 1
    if (count === 0) { failed.push({ edit, reason: "the find text is not in the file" }); continue }
    if (count > 1 && !edit.all) { failed.push({ edit, reason: `the find text occurs ${count} times and all is false` }); continue }
    texts.set(edit.file, text.split(edit.find).join(edit.replace))
  }
  return { files: files.map(file => ({ path: file.path, text: texts.get(file.path)! })), failed }
}

interface BlockingFinding { readonly where: string; readonly quote: string; readonly why: string; readonly fix: string }

export function buildFixPrompt(idea: string, preset: string, files: readonly PacketFile[], blocking: readonly BlockingFinding[]): string {
  return [
    ...files.map(file => `<file path="${file.path}">\n${file.text}\n</file>`),
    `These are all text files of one generated packet for the preset ${preset}: five Markdown contracts and a starter kit. A coding agent will build the product from only these files, following TASKS.md task by task. The user's idea: "${idea}".`,
    `An independent reviewer found these blocking defects (a coding agent would stall, build the wrong thing, or hit a contradiction):\n${blocking.map((item, index) => `${index + 1}. Where: ${item.where}\n   Quote: ${item.quote}\n   Why: ${item.why}\n   Reviewer's suggestion: ${item.fix}`).join("\n")}`,
    [
      "Repair the packet so that each defect is gone and no new contradiction appears. Return text edits.",
      "- Each edit names one file, a find text copied exactly from that file, and its replacement. Keep the find text as short as it can be while still being unique in the file; set all to true only to replace every occurrence of a repeated sentence.",
      "- The same fact is often printed in several documents (PRD, ARD, TRD, TASKS, AGENTS) and in the kit. Change every copy, so the documents and the kit agree afterwards.",
      "- Build exactly the user's idea: add no feature it did not ask for, and remove any control, screen, store or rule that the idea and its features do not need.",
      "- Where the packet leaves a rule open, choose the simplest rule that fits the idea and the kit's real code, and state it once in precise words (exact text, exact function name and signature, exact number).",
      "- Keep IDs, file paths, owners, task order and validation commands unless a defect requires a change. When a task must create or modify another file, update that task's file lists and the AGENTS Owner Map and shared-file lines to match.",
      "- You may edit a kit file when the defect is in the kit; the kit must still build and pass its own tests, so change its tests together with its code.",
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
  const idea = values.idea ?? ideaFromRoundScript(packet)
  if (!idea) throw new Error(`No idea text for ${packet}: pass --idea`)
  const out = resolve(values.out)
  if (existsSync(out)) throw new Error(`The output folder already exists: ${out}`)
  const blocking = (JSON.parse(readFileSync(values.review, "utf8")) as { review: { blocking: BlockingFinding[] } }).review.blocking
  if (blocking.length === 0) throw new Error("The review has no blocking finding; nothing to repair.")
  const { files } = readPacket(packet)
  const prompt = buildFixPrompt(idea, basename(dirname(packet)), files, blocking)

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
  for (const file of result.files) writeFileSync(join(out, file.path), file.text)
  writeFileSync(join(dirname(out), `${basename(out)}.fix.json`), JSON.stringify({ usage: { model: response.model, input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens }, fix, failed: result.failed }, null, 2))
  console.log(`${basename(out)}: ${response.model}, ${response.usage.input_tokens} tokens in, ${response.usage.output_tokens} out; ${fix.edits.length} edits, ${result.failed.length} failed`)
  for (const failure of result.failed) console.log(`  FAILED edit for finding ${failure.edit.finding} in ${failure.edit.file}: ${failure.reason}`)
  console.log(`  notes: ${fix.notes.replace(/\s+/g, " ").slice(0, 900)}`)
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
