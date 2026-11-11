import { z } from "zod"
import { DOCUMENT_NAMES, type CompiledPacket, type DocumentHashes, type DocumentName, type DocumentPacket } from "./compiler"
import type { PresetId } from "./presets"

export const REVIEW_MODEL = "claude-sonnet-5-5" as const
export const DEFAULT_REVIEW_ROUNDS = 3
export const MAX_KIT_FILE_BYTES = 60_000

const REQUIRED_DOCS = new Set<string>(DOCUMENT_NAMES)
const DOC_ORDER = [...DOCUMENT_NAMES]

export const Finding = z.object({
  where: z.string(),
  quote: z.string(),
  why: z.string(),
  fix: z.string(),
})
export type ReviewFinding = z.infer<typeof Finding>

export const Review = z.object({
  slug: z.string(),
  blocking: z.array(Finding),
  polish: z.array(Finding),
  verdict: z.string(),
})
export type Review = z.infer<typeof Review>

export const Edit = z.object({
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
export type Edit = z.infer<typeof Edit>

export const Fix = z.object({
  edits: z.array(Edit),
  notes: z.string(),
})
export type Fix = z.infer<typeof Fix>

export const REVIEW_JSON_SCHEMA = {
  $defs: {
    __schema0: {
      type: "object",
      properties: {
        where: { type: "string" },
        quote: { type: "string" },
        why: { type: "string" },
        fix: { type: "string" },
      },
      additionalProperties: false,
      required: ["where", "quote", "why", "fix"],
    },
  },
  type: "object",
  properties: {
    slug: { type: "string" },
    blocking: { type: "array", items: { $ref: "#/$defs/__schema0" } },
    polish: { type: "array", items: { $ref: "#/$defs/__schema0" } },
    verdict: { type: "string" },
  },
  additionalProperties: false,
  required: ["slug", "blocking", "polish", "verdict"],
  description: '{$schema: "https://json-schema.org/draft/2020-12/schema"}',
} as const

export const FIX_JSON_SCHEMA = {
  type: "object",
  properties: {
    edits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          finding: {
            type: "integer",
            description: "{minimum: -9007199254740991, maximum: 9007199254740991}",
          },
          op: { enum: ["replace", "create", "move", "delete"] },
          file: { type: "string" },
          to: { type: "string" },
          find: { type: "string" },
          replace: { type: "string" },
          all: { type: "boolean" },
        },
        additionalProperties: false,
        required: ["finding", "file", "find", "replace", "all"],
      },
    },
    notes: { type: "string" },
  },
  additionalProperties: false,
  required: ["edits", "notes"],
  description: '{$schema: "https://json-schema.org/draft/2020-12/schema"}',
} as const

export interface PacketFile {
  readonly path: string
  readonly text: string
}

export interface EditFailure {
  readonly edit: Edit
  readonly reason: string
}

export interface KitBuildResult {
  readonly ok: boolean
  readonly command?: string
  readonly output?: string
}

export interface PacketRepairRecord {
  readonly model: string
  readonly rounds: number
  readonly edits: readonly Edit[]
  readonly review: Review
  readonly kitBuilt?: boolean
  readonly kitBuildPassed?: boolean
  readonly kitBuildError?: string
  readonly unverifiedFindings?: { readonly blocking: number; readonly polish: number }
  readonly failedEdits?: number
  readonly verdict: "agent-ready" | "not-ready"
  readonly agentReady: boolean
}

export interface ReviewRequest {
  readonly requestId: string
  readonly apiKey: string
  readonly model: string
  readonly prompt: string
  readonly signal?: AbortSignal
}

export interface ReviewProvider {
  readonly review: (request: ReviewRequest) => Promise<Review>
  readonly fix: (request: ReviewRequest) => Promise<Fix>
}

export type KitBuilder = (packet: CompiledPacket, presetId: PresetId) => Promise<KitBuildResult>

const AUDIT_BRIEF_BODY = [
  "Read-only audit of one generated Markdown packet; edit nothing. Packet: <ROOT>/<preset>/<slug> (PRD.md ARD.md TRD.md TASKS.md AGENTS.md blueprint.json kit/). Preset: <preset>. The user's idea: \"<idea>\". A coding agent will build the app from ONLY these files (docs + kit), following TASKS.md in order. Read all five .md files fully, then the kit README and the kit source files the tasks reference. Echo the packet slug in the 'slug' field of your answer.",
  "",
  "Decide whether a coding agent could build exactly this product with no guesswork and no contradictions. Report only CONCRETE defects (where = file + heading/task id; quote = exact text; why = what an agent would have to guess or what would fail; fix = one-line change to the compiler output). BLOCKING = an agent would stall, build the wrong thing, a required UI/function has no owner, a command would fail, or two documents contradict each other on something that changes the code. POLISH = cosmetic or a testability nicety. Do not report as blocking anything that is merely a provider's wording choice in the PRD that a coder can follow without guessing, or anything a competent coder resolves from the stated conventions.",
  "",
  "Check specifically:",
  "1. every idea sentence maps to a feature + acceptance criterion; nothing promised that the idea did not ask for, nothing asked that is missing.",
  "2. task order: no task uses a screen/state/store/function created by a later task; every control a later task's acceptance criteria mention has a named owner and a place to be built; no slot is built that no task uses.",
  "3. the data contract names stored fields, wire/DB types, operations per object, ids, ordering, and an interface; every task uses only that interface; time/date rules are unambiguous.",
  "4. schedules/endpoints/web pages consistent in PRD/TRD/TASKS/kit.",
  "5. AGENTS Owner Map and shared-file lines agree with TASKS create/modify lists; no file created twice; every modify target exists earlier (kit copy counts); test/build commands that run in each task can pass at that point in the order.",
  "6. names consistent across docs and kit.",
  "7. boilerplate that does not apply.",
  "8. acceptance criteria mechanically testable; time-based ones use an injected clock; validation commands runnable in a normal dev environment.",
  "9. kit files named in TASKS exist and match what tasks expect.",
  "10. preset-specific build/run path coherent.",
  "11. delayed user input: when a change the user makes is held before it is written (an autosave delay or a debounce), the packet states what happens to the held change when the app or window closes or the screen is left (written at once, or lost by design), names the owner and the mechanism, and has an acceptance criterion for it. A timer that only refreshes data or runs a background job is not a delayed write.",
  "",
  "If you find nothing blocking, say so plainly. Do not pad: no style nits.",
  "Output JSON: { slug, blocking: [{where, quote, why, fix}], polish: [...], verdict }.",
].join("\n")

export function packetFilesFromCompiled(packet: CompiledPacket): { files: PacketFile[]; notShown: string[] } {
  const files: PacketFile[] = DOCUMENT_NAMES.map(name => ({ path: name, text: packet.documents[name] }))
  const notShown = ["blueprint.json (the manifest; not a document the coding agent follows)"]
  const sortedKit = [...packet.kit].sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
  for (const item of sortedKit) {
    const byteLength = new TextEncoder().encode(item.content).byteLength
    if (item.content.includes("\0")) notShown.push(`${item.name} (binary)`)
    else if (byteLength > MAX_KIT_FILE_BYTES || /(^|\/)(package-lock\.json|Cargo\.lock)$/.test(item.name)) {
      notShown.push(`${item.name} (${byteLength} bytes, lock file or too large)`)
    } else {
      files.push({ path: item.name, text: item.content })
    }
  }
  return { files, notShown }
}

export function buildReviewPromptForPacket(
  slug: string,
  preset: string,
  idea: string,
  files: readonly PacketFile[],
  notShown: readonly string[],
): string {
  const brief = AUDIT_BRIEF_BODY
    .replace("<ROOT>/<preset>/<slug>", () => slug)
    .replace("<preset>", () => preset)
    .replace("<idea>", () => idea)
  return [
    ...files.map(file => `<file path="${file.path}">\n${file.text}\n</file>`),
    `Not shown: ${notShown.join("; ")}.`,
    "Every file of the packet is given above, except those listed as not shown. Nothing else exists: you cannot run commands or open other files.",
    brief,
    "Every quote must be copied exactly from one file above, and every 'where' must start with that file's path. Report every blocking defect. Report at most 8 polish items, the most harmful first.",
  ].join("\n\n")
}

export function buildFixPrompt(
  idea: string,
  preset: string,
  files: readonly PacketFile[],
  blocking: readonly ReviewFinding[],
  previousFailures: readonly { file: string; reason: string }[] = [],
  previousEmpty = false,
): string {
  return [
    ...files.map(file => `<file path="${file.path}">\n${file.text}\n</file>`),
    `These are all text files of one generated packet for the preset ${preset}: five Markdown contracts and a starter kit. A coding agent will build the product from only these files, following TASKS.md task by task. The user's idea: "${idea}".`,
    `An independent reviewer found these blocking defects (a coding agent would stall, build the wrong thing, or hit a contradiction):\n${blocking.map((item, index) => `${index + 1}. Where: ${item.where}\n   Quote: ${item.quote}\n   Why: ${item.why}\n   Reviewer's suggestion: ${item.fix}`).join("\n")}`,
    ...(previousFailures.length > 0 || !previousEmpty ? [] : [
      "Your previous answer contained no edits, so the packet is unchanged and every defect above remains. Your answer must contain at least one edit for each defect.",
    ]),
    ...(previousFailures.length === 0 ? [] : [
      `The edits of your previous answer could not be applied, so the packet is unchanged:\n${[
        ...previousFailures.slice(0, 10).map(item => `- ${item.file.replace(/\s+/g, " ").slice(0, 200)}: ${item.reason}`),
        ...(previousFailures.length > 10 ? [`and ${previousFailures.length - 10} more`] : []),
      ].join("\n")}\nCopy every find text exactly from the file as shown above.`,
    ]),
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

const flat = (text: string): string => text
  .replace(/…/g, "...")
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/[\u00a0\u202f]/g, " ")
  .replace(/\s+/g, " ")
  .trim()

export function quoteFound(quote: string, files: readonly PacketFile[]): boolean {
  const wanted = flat(quote)
  return wanted !== "" && files.some(file => flat(file.text).includes(wanted))
}

export function filterVerifiedFindings(review: Review, files: readonly PacketFile[]): Review {
  return {
    ...review,
    blocking: review.blocking.filter(item => quoteFound(item.quote, files)),
    polish: review.polish.filter(item => quoteFound(item.quote, files)),
  }
}

// Mirrors src-tauri/src/export.rs (a test compares the constants); change both together.
export const MAX_PACKET_FILE_BYTES = 2_000_000
export const MAX_KIT_PATH_DEPTH = 16
export const MAX_KIT_FILES = 64
export const KIT_PATH_PUNCTUATION = "._-+[]"

function validPacketPath(path: string | undefined): path is string {
  if (!path) return false
  if (REQUIRED_DOCS.has(path)) return true
  if (!path.startsWith("kit/")) return false
  const parts = path.slice("kit/".length).split("/")
  return parts.length <= MAX_KIT_PATH_DEPTH
    && parts.every(part => part !== "" && !part.startsWith(".") && [...part].every(char => /[A-Za-z0-9]/.test(char) || KIT_PATH_PUNCTUATION.includes(char)))
}

// A path clashes when an existing file is one of its parent folders or sits inside it.
function collides(paths: Iterable<string>, target: string, ignore?: string): boolean {
  for (const path of paths) {
    if (path === ignore || path === target) continue
    if (target.startsWith(`${path}/`) || path.startsWith(`${target}/`)) return true
  }
  return false
}

function contentProblem(text: string): string | undefined {
  if (text.trim() === "") return "a packet file cannot be empty"
  if (new TextEncoder().encode(text).length > MAX_PACKET_FILE_BYTES) return "the file is larger than the export limit"
  return undefined
}

export function applyEdits(
  files: readonly PacketFile[],
  edits: readonly Edit[],
): { files: PacketFile[]; applied: Edit[]; failed: EditFailure[] } {
  const texts = new Map(files.map(file => [file.path, file.text]))
  const applied: Edit[] = []
  const failed: EditFailure[] = []
  for (const edit of edits) {
    const op = edit.op ?? "replace"
    if (!validPacketPath(edit.file)) { failed.push({ edit, reason: "invalid packet file path" }); continue }
    if (op === "create") {
      if (texts.has(edit.file)) { failed.push({ edit, reason: "the file already exists in the packet" }); continue }
      if (collides(texts.keys(), edit.file)) { failed.push({ edit, reason: "the path collides with an existing file or folder" }); continue }
      if (edit.file.startsWith("kit/") && [...texts.keys()].filter(path => path.startsWith("kit/")).length >= MAX_KIT_FILES) {
        failed.push({ edit, reason: `the kit already has the maximum of ${MAX_KIT_FILES} files` }); continue
      }
      const problem = contentProblem(edit.replace)
      if (problem) { failed.push({ edit, reason: problem }); continue }
      texts.set(edit.file, edit.replace)
      applied.push(edit)
      continue
    }
    if (op === "delete") {
      if (REQUIRED_DOCS.has(edit.file)) { failed.push({ edit, reason: "cannot delete a required contract document" }); continue }
      if (!texts.has(edit.file)) { failed.push({ edit, reason: "no such file in the packet" }); continue }
      texts.delete(edit.file)
      applied.push(edit)
      continue
    }
    if (op === "move") {
      if (!validPacketPath(edit.to)) { failed.push({ edit, reason: "move requires a valid target path in to" }); continue }
      if (REQUIRED_DOCS.has(edit.file)) { failed.push({ edit, reason: "cannot move a required contract document" }); continue }
      const text = texts.get(edit.file)
      if (text === undefined) { failed.push({ edit, reason: "no such file in the packet" }); continue }
      if (edit.to !== edit.file && texts.has(edit.to)) { failed.push({ edit, reason: "the target file already exists in the packet" }); continue }
      if (REQUIRED_DOCS.has(edit.to)) { failed.push({ edit, reason: "cannot move a required contract document" }); continue }
      if (collides(texts.keys(), edit.to, edit.file)) { failed.push({ edit, reason: "the path collides with an existing file or folder" }); continue }
      let nextText = text
      if (edit.find !== "") {
        const count = text.split(edit.find).length - 1
        if (count === 0) { failed.push({ edit, reason: "the find text is not in the file" }); continue }
        if (count > 1 && !edit.all) { failed.push({ edit, reason: `the find text occurs ${count} times and all is false` }); continue }
        nextText = text.split(edit.find).join(edit.replace)
      } else if (edit.replace !== "") {
        nextText = edit.replace
      }
      const problem = contentProblem(nextText)
      if (problem) { failed.push({ edit, reason: problem }); continue }
      texts.delete(edit.file)
      texts.set(edit.to, nextText)
      applied.push(edit)
      continue
    }
    const text = texts.get(edit.file)
    if (text === undefined) { failed.push({ edit, reason: "no such file in the packet" }); continue }
    const count = edit.find === "" ? 0 : text.split(edit.find).length - 1
    if (count === 0) { failed.push({ edit, reason: "the find text is not in the file" }); continue }
    if (count > 1 && !edit.all) { failed.push({ edit, reason: `the find text occurs ${count} times and all is false` }); continue }
    const replaced = text.split(edit.find).join(edit.replace)
    const problem = contentProblem(replaced)
    if (problem) { failed.push({ edit, reason: problem }); continue }
    texts.set(edit.file, replaced)
    applied.push(edit)
  }
  const initialOrder = new Map(files.map((file, index) => [file.path, index]))
  const orderedPaths = [...texts.keys()].sort((left, right) => {
    const leftDoc = DOC_ORDER.indexOf(left as DocumentName)
    const rightDoc = DOC_ORDER.indexOf(right as DocumentName)
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
  return { files: orderedPaths.map(path => ({ path, text: texts.get(path)! })), applied, failed }
}

export function touchedKit(edits: readonly Edit[], failed: readonly EditFailure[]): boolean {
  const failedEdits = new Set(failed.map(item => item.edit))
  return edits.some(edit => !failedEdits.has(edit) && (edit.file.startsWith("kit/") || (edit.to?.startsWith("kit/") ?? false)))
}

async function sha256Hex(content: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(content))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("")
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

export async function applyEditsToCompiledPacket(
  packet: CompiledPacket,
  edits: readonly Edit[],
): Promise<{ packet: CompiledPacket; applied: Edit[]; failed: EditFailure[] }> {
  const allFiles: PacketFile[] = [
    ...DOCUMENT_NAMES.map(name => ({ path: name, text: packet.documents[name] })),
    ...packet.kit.map(file => ({ path: file.name, text: file.content })),
  ]
  const result = applyEdits(allFiles, edits)
  if (result.applied.length === 0) {
    return { packet, applied: [], failed: result.failed }
  }
  const byPath = new Map(result.files.map(file => [file.path, file.text]))
  const documents = Object.fromEntries(DOCUMENT_NAMES.map(name => [name, byPath.get(name) ?? packet.documents[name]])) as DocumentPacket
  const hashEntries = await Promise.all(DOCUMENT_NAMES.map(async name => [name, await sha256Hex(documents[name])] as const))
  const hashes = Object.fromEntries(hashEntries) as DocumentHashes
  const kitFiles = result.files.filter(file => file.path.startsWith("kit/"))
  const kit = await Promise.all(kitFiles.map(async file => ({
    name: file.path,
    content: file.text,
    sha256: await sha256Hex(file.text),
  })))
  return {
    packet: deepFreeze({
      ...packet,
      documents,
      hashes,
      kit,
    }),
    applied: result.applied,
    failed: result.failed,
  }
}

export function withPacketRepair(packet: CompiledPacket, repair: PacketRepairRecord): CompiledPacket {
  return deepFreeze({
    ...packet,
    repair,
  })
}

export async function runReviewAndRepairLoop(options: {
  readonly packet: CompiledPacket
  readonly idea: string
  readonly presetId: PresetId
  readonly requestId: string
  readonly apiKey: string
  readonly model?: string
  readonly maxRounds?: number
  readonly signal?: AbortSignal
  readonly onProgress?: (stage: "review" | "repair" | "review-again") => void
  readonly reviewProvider: ReviewProvider
  readonly kitBuilder?: KitBuilder
}): Promise<{ packet: CompiledPacket; repair: PacketRepairRecord }> {
  const model = options.model ?? REVIEW_MODEL
  const maxRounds = options.maxRounds ?? DEFAULT_REVIEW_ROUNDS
  let currentPacket = options.packet

  if (options.signal?.aborted) throw { kind: "cancelled", classification: "cancelled" }
  options.onProgress?.("review")
  const initialFiles = packetFilesFromCompiled(currentPacket)
  const rawReview = await options.reviewProvider.review({
    requestId: `${options.requestId}-review-0`,
    apiKey: options.apiKey,
    model,
    prompt: buildReviewPromptForPacket(currentPacket.projectSlug, options.presetId, options.idea, initialFiles.files, initialFiles.notShown),
    signal: options.signal,
  })
  if (options.signal?.aborted) throw { kind: "cancelled", classification: "cancelled" }
  let currentReview = filterVerifiedFindings(rawReview, initialFiles.files)
  let unverified = { blocking: rawReview.blocking.length - currentReview.blocking.length, polish: rawReview.polish.length - currentReview.polish.length }
  let failedEdits = 0
  let previousFailures: { file: string; reason: string }[] = []
  let previousEmpty = false

  const appliedEdits: Edit[] = []
  let rounds = 0
  let kitBuilt: boolean | undefined
  let kitBuildPassed: boolean | undefined
  let kitBuildError: string | undefined

  while (currentReview.blocking.length > 0 && rounds < maxRounds) {
    if (options.signal?.aborted) throw { kind: "cancelled", classification: "cancelled" }
    rounds += 1
    options.onProgress?.("repair")
    const roundFiles = packetFilesFromCompiled(currentPacket)
    const fix = await options.reviewProvider.fix({
      requestId: `${options.requestId}-fix-${rounds}`,
      apiKey: options.apiKey,
      model,
      prompt: buildFixPrompt(options.idea, options.presetId, roundFiles.files, currentReview.blocking, previousFailures, previousEmpty),
      signal: options.signal,
    })
    if (options.signal?.aborted) throw { kind: "cancelled", classification: "cancelled" }
    const edited = await applyEditsToCompiledPacket(currentPacket, fix.edits)
    failedEdits += edited.failed.length
    if (edited.applied.length === 0) {
      // The packet did not change: skip the review and let the next round retry, telling the model what failed.
      previousFailures = edited.failed.map(item => ({ file: item.edit.file, reason: item.reason }))
      const empty = fix.edits.length === 0
      // A second empty answer in a row would get a byte-identical prompt: stop instead of paying for it.
      if (empty && previousEmpty) break
      previousEmpty = empty
      continue
    }
    previousFailures = []
    previousEmpty = false

    if (touchedKit(fix.edits, edited.failed) && options.kitBuilder) {
      kitBuilt = true
      const buildResult = await options.kitBuilder(edited.packet, options.presetId)
      if (!buildResult.ok) {
        kitBuildPassed = false
        kitBuildError = buildResult.command
          ? `Kit build failed (${buildResult.command})${buildResult.output ? `: ${buildResult.output}` : ""}`
          : (buildResult.output ?? "Kit build failed.")
        // Discard the repair that broke the kit and stop.
        break
      }
      kitBuildPassed = true
    }

    currentPacket = edited.packet
    appliedEdits.push(...edited.applied)

    if (options.signal?.aborted) throw { kind: "cancelled", classification: "cancelled" }
    options.onProgress?.("review-again")
    const nextFiles = packetFilesFromCompiled(currentPacket)
    const nextRawReview = await options.reviewProvider.review({
      requestId: `${options.requestId}-review-${rounds}`,
      apiKey: options.apiKey,
      model,
      prompt: buildReviewPromptForPacket(currentPacket.projectSlug, options.presetId, options.idea, nextFiles.files, nextFiles.notShown),
      signal: options.signal,
    })
    if (options.signal?.aborted) throw { kind: "cancelled", classification: "cancelled" }
    currentReview = filterVerifiedFindings(nextRawReview, nextFiles.files)
    unverified = { blocking: nextRawReview.blocking.length - currentReview.blocking.length, polish: nextRawReview.polish.length - currentReview.polish.length }
  }

  const agentReady = currentReview.blocking.length === 0 && kitBuildPassed !== false
  const repair: PacketRepairRecord = {
    model,
    rounds,
    edits: appliedEdits,
    review: currentReview,
    ...(kitBuilt !== undefined ? { kitBuilt, kitBuildPassed, ...(kitBuildError ? { kitBuildError } : {}) } : {}),
    ...(unverified.blocking + unverified.polish > 0 ? { unverifiedFindings: unverified } : {}),
    ...(failedEdits > 0 ? { failedEdits } : {}),
    verdict: agentReady ? "agent-ready" : "not-ready",
    agentReady,
  }
  return {
    packet: withPacketRepair(currentPacket, repair),
    repair,
  }
}
