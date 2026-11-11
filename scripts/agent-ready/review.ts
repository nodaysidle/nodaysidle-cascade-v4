// Review one packet with a Claude model in a single read-only request, using the repo's audit brief.
// Usage (the key lives in the fish environment):
//   fish -c 'npx tsx scripts/agent-ready/review.ts --model claude-sonnet-5-5 --packet /tmp/v4-roundN/<preset>/<slug> --out review.json'
//   add --idea "<text>" for a packet whose idea is not in run-round.fish; add --dry-run to see the request size without sending it.
import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { basename, dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { buildReviewPromptForPacket, quoteFound, Review, type PacketFile } from "../../src/review"

const here = dirname(fileURLToPath(import.meta.url))
const DOCUMENTS = ["PRD.md", "ARD.md", "TRD.md", "TASKS.md", "AGENTS.md"]
const MAX_KIT_FILE_BYTES = 60_000

function walk(folder: string): string[] {
  return readdirSync(folder).sort().flatMap(name => {
    const path = join(folder, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

// Every text file a coding agent would read. A file that is left out is named, never cut short.
export function readPacket(packet: string): { files: PacketFile[]; notShown: string[] } {
  const files: PacketFile[] = DOCUMENTS.map(name => ({ path: name, text: readFileSync(join(packet, name), "utf8") }))
  const notShown = ["blueprint.json (the manifest; not a document the coding agent follows)"]
  for (const path of walk(join(packet, "kit"))) {
    const name = relative(packet, path)
    const bytes = readFileSync(path)
    if (bytes.includes(0)) notShown.push(`${name} (binary)`)
    else if (bytes.length > MAX_KIT_FILE_BYTES || /(^|\/)(package-lock\.json|Cargo\.lock)$/.test(name)) notShown.push(`${name} (${bytes.length} bytes, lock file or too large)`)
    else files.push({ path: name, text: bytes.toString("utf8") })
  }
  return { files, notShown }
}

// The idea text of a round packet, looked up by preset folder and product slug in run-round.fish.
export function ideaFromRoundScript(packet: string): string | undefined {
  const preset = basename(dirname(packet))
  const slug = basename(packet)
  for (const line of readFileSync(join(here, "run-round.fish"), "utf8").split("\n")) {
    const match = /^(?:# )?g (\S+) "(.*)"$/.exec(line)
    if (match && match[1] === preset && match[2]!.split(/\s+/).slice(0, 2).join("-").toLowerCase() === slug) return match[2]
  }
  return undefined
}

export function buildReviewPrompt(packet: string, idea: string, files: readonly PacketFile[], notShown: readonly string[]): string {
  return buildReviewPromptForPacket(basename(packet), basename(dirname(packet)), idea, files, notShown)
}

const flat = (text: string): string => text.replace(/\s+/g, " ").trim()

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { model: { type: "string" }, packet: { type: "string" }, idea: { type: "string" }, out: { type: "string" }, "dry-run": { type: "boolean" } } })
  if (!values.model || !values.packet) throw new Error("Usage: review.ts --model <claude model id> --packet <folder> [--idea <text>] [--out <file>] [--dry-run]")
  const packet = resolve(values.packet)
  const idea = values.idea ?? ideaFromRoundScript(packet)
  if (!idea) throw new Error(`No idea text for ${packet}: pass --idea`)
  const { files, notShown } = readPacket(packet)
  const prompt = buildReviewPrompt(packet, idea, files, notShown)
  console.log(`${basename(packet)}: ${files.length} files, ${prompt.length} characters (about ${Math.round(prompt.length / 3.5 / 1000)}k tokens); not shown: ${notShown.length}`)
  if (values["dry-run"]) return

  const client = new Anthropic()
  // No fallback model on purpose: this tool measures the named model, so another model must never answer for it.
  // Streamed with a high ceiling: thinking counts against max_tokens, and a review cut short is not valid JSON.
  const response = await client.messages.stream({
    model: values.model,
    max_tokens: 64000,
    output_config: { effort: "high", format: zodOutputFormat(Review) },
    messages: [{ role: "user", content: prompt }],
  }).finalMessage()
  if (response.stop_reason !== "end_turn") throw new Error(`The model stopped with ${response.stop_reason} after ${response.usage.output_tokens} output tokens and gave no usable review.`)
  const review = Review.parse(JSON.parse(response.content.flatMap(block => block.type === "text" ? [block.text] : []).join("")))
  const checked = { ...review, blocking: review.blocking.map(item => ({ ...item, quoteFound: quoteFound(item.quote, files) })), polish: review.polish.map(item => ({ ...item, quoteFound: quoteFound(item.quote, files) })) }
  const usage = { model: response.model, input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens }
  if (values.out) writeFileSync(values.out, JSON.stringify({ usage, review: checked }, null, 2))
  console.log(`  ${usage.model}: ${usage.input_tokens} tokens in, ${usage.output_tokens} out; blocking ${checked.blocking.length}, polish ${checked.polish.length}`)
  checked.blocking.forEach((item, index) => console.log(`  B${index + 1} [${item.quoteFound ? "quote ok" : "QUOTE NOT FOUND"}] ${flat(item.where).slice(0, 90)} :: ${flat(item.why).slice(0, 230)}`))
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
