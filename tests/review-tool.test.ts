import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { compilePacket, verifyPacketHashes } from "../src/compiler"
import { invokeKitBuilder, invokeReviewProvider } from "../src/bridge"
import { verifyPacketFolder, writePacketAtomic, type PacketManifest } from "../src/packet"
import { generatePacket, type ProgressStage } from "../src/pipeline"
import { canExport, canGenerate, createInitialState, reduceAppState } from "../src/state"
import {
  applyEditsToCompiledPacket,
  DEFAULT_REVIEW_ROUNDS,
  filterVerifiedFindings,
  Fix,
  FIX_JSON_SCHEMA,
  packetFilesFromCompiled,
  Review,
  REVIEW_JSON_SCHEMA,
  runReviewAndRepairLoop,
} from "../src/review"
import { applyEdits, buildFixPrompt, touchedKit, writePacketEdits } from "../scripts/agent-ready/fix"
import { buildReviewPrompt, quoteFound, readPacket } from "../scripts/agent-ready/review"
import { fileOrganizerBlueprint } from "./fixtures/blueprints"
import { fixtureJevProvider, fixtureProvider } from "./fixtures/providers"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function packet(): string {
  const root = mkdtempSync(join(tmpdir(), "cascade-review-"))
  roots.push(root)
  const folder = join(root, "astro-web", "tea-shop")
  mkdirSync(join(folder, "kit", "src"), { recursive: true })
  for (const name of ["PRD.md", "ARD.md", "TRD.md", "TASKS.md", "AGENTS.md"]) writeFileSync(join(folder, name), `# ${name}\nThe list shows\n  every tea.\n`)
  writeFileSync(join(folder, "kit", "src", "page.astro"), "<h1>Teas</h1>\n")
  writeFileSync(join(folder, "kit", "icon.png"), Buffer.from([137, 80, 78, 71, 0, 1]))
  writeFileSync(join(folder, "kit", "package-lock.json"), "{}")
  writeFileSync(join(folder, "blueprint.json"), "{}")
  return folder
}

describe("packet review tool", () => {
  it("reads the five documents and the kit's text files, and names what it leaves out", () => {
    const { files, notShown } = readPacket(packet())
    expect(files.map(file => file.path)).toEqual(["PRD.md", "ARD.md", "TRD.md", "TASKS.md", "AGENTS.md", "kit/src/page.astro"])
    expect(notShown.map(item => item.split(" ")[0])).toEqual(["blueprint.json", "kit/icon.png", "kit/package-lock.json"])
  })

  it("puts the idea, the preset and every file into the request", () => {
    const folder = packet()
    const { files, notShown } = readPacket(folder)
    const prompt = buildReviewPrompt(folder, "Tea Shop lists teas.", files, notShown)
    expect(prompt).toContain('<file path="kit/src/page.astro">\n<h1>Teas</h1>')
    expect(prompt).toContain('Preset: astro-web. The user\'s idea: "Tea Shop lists teas."')
    expect(prompt).toContain("kit/icon.png (binary)")
    expect(prompt).not.toContain("<idea>")
  })

  it("accepts a quote only when some file holds it, whatever the line breaks", () => {
    const { files } = readPacket(packet())
    expect(quoteFound("The list shows every tea.", files)).toBe(true)
    expect(quoteFound("The list shows every coffee.", files)).toBe(false)
    expect(quoteFound("  ", files)).toBe(false)
  })
})

describe("packet repair tool", () => {
  const files = [{ path: "PRD.md", text: "The class is normal. The class is normal." }, { path: "kit/a.rs", text: "let floor = 5;" }]
  const edit = (file: string, find: string, replace: string, all = false) => ({ finding: 1, file, find, replace, all })

  it("replaces exact text, once or everywhere as the edit says", () => {
    const result = applyEdits(files, [edit("kit/a.rs", "floor = 5", "floor = 2"), edit("PRD.md", "is normal", "is critical", true)])
    expect(result.failed).toEqual([])
    expect(result.files).toEqual([{ path: "PRD.md", text: "The class is critical. The class is critical." }, { path: "kit/a.rs", text: "let floor = 2;" }])
  })

  it("reports an edit that does not match as it says and leaves the file alone", () => {
    const result = applyEdits(files, [edit("PRD.md", "is normal", "is critical"), edit("PRD.md", "is stale", "x"), edit("TRD.md", "a", "b"), edit("kit/a.rs", "", "x")])
    expect(result.failed.map(item => item.reason)).toEqual(["the find text occurs 2 times and all is false", "the find text is not in the file", "no such file in the packet", "the find text is not in the file"])
    expect(result.files).toEqual(files)
  })

  it("gives the model the files, the idea and each numbered finding", () => {
    const prompt = buildFixPrompt("Disk Free shows free space.", "linux-hyprland-waybar-module", files, [{ where: "PRD.md", quote: "The class is normal.", why: "It is below the limit.", fix: "Say critical." }])
    expect(prompt).toContain('<file path="kit/a.rs">\nlet floor = 5;')
    expect(prompt).toContain('The user\'s idea: "Disk Free shows free space."')
    expect(prompt).toContain("1. Where: PRD.md\n   Quote: The class is normal.")
    expect(prompt).toContain("create")
    expect(prompt).toContain("move")
    expect(prompt).toContain("delete")
  })

  it("creates, moves and deletes kit files and updates the packet folder on disk", () => {
    const folder = packet()
    const before = readPacket(folder).files
    const edits = [
      { finding: 1, op: "move" as const, file: "kit/src/page.astro", to: "kit/src/pages/author/[slug].astro", find: "<h1>Teas</h1>", replace: "<h1>Author</h1>", all: false },
      { finding: 1, op: "create" as const, file: "kit/src/lib/helper.ts", find: "", replace: "export const ok = true\n", all: false },
      { finding: 1, op: "delete" as const, file: "kit/src/lib/helper.ts", find: "", replace: "", all: false },
      { finding: 1, op: "create" as const, file: "kit/src/lib/kept.ts", find: "", replace: "export const kept = 1\n", all: false },
    ]
    const result = applyEdits(before, edits)
    expect(result.failed).toEqual([])
    expect(touchedKit(edits, result.failed)).toBe(true)
    expect(result.files.map(file => file.path)).toEqual(["PRD.md", "ARD.md", "TRD.md", "TASKS.md", "AGENTS.md", "kit/src/lib/kept.ts", "kit/src/pages/author/[slug].astro"])
    writePacketEdits(folder, before, result.files)
    expect(existsSync(join(folder, "kit", "src", "page.astro"))).toBe(false)
    expect(readFileSync(join(folder, "kit", "src", "pages", "author", "[slug].astro"), "utf8")).toBe("<h1>Author</h1>\n")
    expect(readFileSync(join(folder, "kit", "src", "lib", "kept.ts"), "utf8")).toBe("export const kept = 1\n")
  })

  it("rejects invalid file operations without touching the files", () => {
    const result = applyEdits(files, [
      { finding: 1, op: "create", file: "PRD.md", find: "", replace: "x", all: false },
      { finding: 1, op: "create", file: "../escape.txt", find: "", replace: "x", all: false },
      { finding: 1, op: "move", file: "kit/a.rs", to: "PRD.md", find: "", replace: "", all: false },
      { finding: 1, op: "move", file: "kit/a.rs", find: "", replace: "", all: false },
      { finding: 1, op: "delete", file: "PRD.md", find: "", replace: "", all: false },
      { finding: 1, op: "delete", file: "kit/missing.rs", find: "", replace: "", all: false },
    ])
    expect(result.failed.map(item => item.reason)).toEqual([
      "the file already exists in the packet",
      "invalid packet file path",
      "the target file already exists in the packet",
      "move requires a valid target path in to",
      "cannot delete a required contract document",
      "no such file in the packet",
    ])
    expect(result.files).toEqual(files)
    expect(touchedKit([{ finding: 1, file: "PRD.md", find: "is normal", replace: "is critical", all: true }], [])).toBe(false)
  })
})

describe("pipeline review, repair, kit build, and manifest replay", () => {
  it("matches zodOutputFormat JSON schemas for Review and Fix", () => {
    expect(REVIEW_JSON_SCHEMA).toEqual(zodOutputFormat(Review).schema)
    expect(FIX_JSON_SCHEMA).toEqual(zodOutputFormat(Fix).schema)
  })

  it("drops review findings whose quote is not in the packet files", () => {
    const files = [{ path: "PRD.md", text: "The list shows every tea." }]
    const filtered = filterVerifiedFindings({
      slug: "tea-shop",
      blocking: [
        { where: "PRD.md", quote: "The list shows every tea.", why: "Real.", fix: "Fix." },
        { where: "PRD.md", quote: "Hallucinated sentence.", why: "Fake.", fix: "Ignore." },
      ],
      polish: [
        { where: "PRD.md", quote: "Missing polish quote.", why: "Fake.", fix: "Ignore." },
      ],
      verdict: "FAIL",
    }, files)
    expect(filtered.blocking).toHaveLength(1)
    expect(filtered.blocking[0]!.quote).toBe("The list shows every tea.")
    expect(filtered.polish).toEqual([])
  })

  it("applies edits to a CompiledPacket, updates hashes, and replays them in verifyPacketFolder", async () => {
    const base = await compilePacket(fileOrganizerBlueprint, "linux-wayland-gtk4-desktop")
    const extracted = packetFilesFromCompiled(base)
    expect(extracted.files.slice(0, 5).map(file => file.path)).toEqual(["PRD.md", "ARD.md", "TRD.md", "TASKS.md", "AGENTS.md"])

    const edits = [
      {
        finding: 1,
        op: "replace" as const,
        file: "PRD.md",
        find: "# Product Requirements Document",
        replace: "# Product Requirements Document (Reviewed)",
        all: false,
      },
      {
        finding: 1,
        op: "create" as const,
        file: "kit/src/extra_helper.rs",
        find: "",
        replace: "pub const EXTRA: bool = true;\n",
        all: false,
      },
    ]
    const repaired = await applyEditsToCompiledPacket(base, edits)
    expect(repaired.failed).toEqual([])
    expect(repaired.applied).toEqual(edits)
    expect(await verifyPacketHashes(repaired.packet)).toBe(true)

    const root = mkdtempSync(join(tmpdir(), "cascade-replay-"))
    roots.push(root)
    const review = { slug: base.projectSlug, blocking: [], polish: [], verdict: "PASS" }
    const withRepair = await runReviewAndRepairLoop({
      packet: base,
      idea: "Harbor Sort organizes downloads.",
      presetId: "linux-wayland-gtk4-desktop",
      requestId: "req-1",
      apiKey: "mem-key",
      reviewProvider: {
        review: async ({ requestId }) => requestId.endsWith("-0")
          ? { slug: base.projectSlug, blocking: [{ where: "PRD.md", quote: "# Product Requirements Document", why: "Needs marker.", fix: "Add marker." }], polish: [], verdict: "FAIL" }
          : review,
        fix: async () => ({ edits, notes: "Added marker and helper." }),
      },
      kitBuilder: async () => ({ ok: true }),
    })
    expect(withRepair.repair.agentReady).toBe(true)
    expect(withRepair.repair.rounds).toBe(1)
    expect(withRepair.repair.kitBuilt).toBe(true)
    expect(withRepair.repair.kitBuildPassed).toBe(true)

    const folder = writePacketAtomic(withRepair.packet, fileOrganizerBlueprint, "linux-wayland-gtk4-desktop", {}, root)
    const manifest = JSON.parse(readFileSync(join(folder, "blueprint.json"), "utf8")) as PacketManifest
    expect(manifest.repair?.agentReady).toBe(true)
    expect(manifest.repair?.edits).toEqual(edits)
    // Verify replays manifest.repair.edits onto a freshly compiled base packet.
    const freshBase = await compilePacket(fileOrganizerBlueprint, "linux-wayland-gtk4-desktop")
    expect(verifyPacketFolder(folder, freshBase, manifest)).toBeUndefined()

    // Tampering with the repaired file on disk must fail verifyPacketFolder.
    writeFileSync(join(folder, "kit/src/extra_helper.rs"), "pub const EXTRA: bool = false;\n")
    expect(verifyPacketFolder(folder, freshBase, manifest)).toContain("Kit hash mismatch")
  })

  it("discards a repair that breaks the kit build and marks the packet not-ready", async () => {
    const base = await compilePacket(fileOrganizerBlueprint, "linux-wayland-gtk4-desktop")
    const result = await runReviewAndRepairLoop({
      packet: base,
      idea: "Harbor Sort organizes downloads.",
      presetId: "linux-wayland-gtk4-desktop",
      requestId: "req-2",
      apiKey: "mem-key",
      reviewProvider: {
        review: async () => ({
          slug: base.projectSlug,
          blocking: [{ where: "PRD.md", quote: "# Product Requirements Document", why: "Broken kit.", fix: "Touch kit." }],
          polish: [],
          verdict: "FAIL",
        }),
        fix: async () => ({
          edits: [{ finding: 1, op: "create", file: "kit/src/broken.rs", find: "", replace: "invalid rust", all: false }],
          notes: "Broke kit.",
        }),
      },
      kitBuilder: async () => ({ ok: false, command: "cargo test", output: "compile error" }),
    })
    expect(result.repair.agentReady).toBe(false)
    expect(result.repair.verdict).toBe("not-ready")
    expect(result.repair.kitBuilt).toBe(true)
    expect(result.repair.kitBuildPassed).toBe(false)
    expect(result.repair.edits).toEqual([])
    expect(result.packet.kit.some(file => file.name === "kit/src/broken.rs")).toBe(false)
  })

  it("runs review, repair, and review-again stages inside generatePacket when reviewProvider is supplied", async () => {
    const stages: ProgressStage[] = []
    let reviews = 0
    const result = await generatePacket(
      {
        requestId: "pipe-review",
        idea: "Harbor Sort helps people organize downloads into named folders with preview, undo, and search.",
        presetId: "linux-wayland-gtk4-desktop",
        model: "deepseek-flash",
        apiUrl: "https://api.deepseek.com/responses",
        apiKey: "mem-deepseek",
        jevApiKey: "mem-jev",
        anthropicApiKey: "mem-anthropic",
        atomicAuditor: true,
        onProgress: stage => stages.push(stage),
      },
      fixtureProvider(fileOrganizerBlueprint),
      undefined,
      fixtureJevProvider,
      {
        review: async () => {
          reviews += 1
          return reviews === 1
            ? { slug: "harbor-sort", blocking: [{ where: "PRD.md", quote: "# Product Requirements Document", why: "Needs review.", fix: "Update heading." }], polish: [], verdict: "FAIL" }
            : { slug: "harbor-sort", blocking: [], polish: [], verdict: "PASS" }
        },
        fix: async () => ({
          edits: [{ finding: 1, file: "PRD.md", find: "# Product Requirements Document", replace: "# Product Requirements Document", all: false }],
          notes: "Checked heading.",
        }),
      },
    )
    expect(result.status).toBe("gate-clean")
    expect(stages).toContain("review")
    expect(stages).toContain("repair")
    expect(stages).toContain("review-again")
    expect(result.repair?.agentReady).toBe(true)
    expect(result.packet?.repair?.agentReady).toBe(true)
  })

  it("requires anthropicApiKey in FormState, clears all three keys after generation, and keeps Not ready packets exportable", async () => {
    const missingAnthropic = createInitialState({
      idea: "Harbor Sort helps people organize downloads into named folders.",
      apiKey: "mem-deepseek",
      jevApiKey: "mem-jev",
    })
    expect(canGenerate(missingAnthropic)).toBe(false)

    const ready = reduceAppState(missingAnthropic, {
      type: "form-changed",
      field: "anthropicApiKey",
      value: "mem-anthropic",
    })
    expect(canGenerate(ready)).toBe(true)

    const base = await compilePacket(fileOrganizerBlueprint, "linux-wayland-gtk4-desktop")
    const notReadyReviewed = await runReviewAndRepairLoop({
      packet: base,
      idea: "Harbor Sort organizes downloads.",
      presetId: "linux-wayland-gtk4-desktop",
      requestId: "req-not-ready",
      apiKey: "mem-anthropic",
      maxRounds: 1,
      reviewProvider: {
        review: async () => ({
          slug: base.projectSlug,
          blocking: [{ where: "PRD.md", quote: "# Product Requirements Document", why: "Still contradictory.", fix: "Fix heading." }],
          polish: [{ where: "PRD.md", quote: "# Product Requirements Document", why: "Minor wording note.", fix: "Polish." }],
          verdict: "FAIL",
        }),
        fix: async () => ({ edits: [], notes: "Could not fix." }),
      },
    })
    const succeeded = reduceAppState(ready, {
      type: "generation-succeeded",
      packet: notReadyReviewed.packet,
      blueprint: fileOrganizerBlueprint,
    })
    expect(succeeded.form.apiKey).toBe("")
    expect(succeeded.form.jevApiKey).toBe("")
    expect(succeeded.form.anthropicApiKey).toBe("")
    expect(canExport(succeeded)).toBe(true)
    expect(succeeded.packet?.repair?.agentReady).toBe(false)

    const sentCommands: Array<{ command: string; args?: Record<string, unknown> }> = []
    const bridgeReview = invokeReviewProvider(async <T>(command: string, args?: Record<string, unknown>) => {
      sentCommands.push({ command, args })
      return JSON.stringify({ slug: "harbor-sort", blocking: [], polish: [], verdict: "PASS" }) as T
    })
    const parsedReview = await bridgeReview.review({
      requestId: "r-bridge",
      apiKey: "mem-anthropic",
      model: "claude-sonnet-5-5",
      prompt: "Review prompt",
    })
    expect(parsedReview.verdict).toBe("PASS")
    expect(sentCommands[0]?.command).toBe("claude_complete")

    const kitResult = await invokeKitBuilder(base, "linux-wayland-gtk4-desktop", async <T>(command: string, args?: Record<string, unknown>) => {
      sentCommands.push({ command, args })
      return { ok: true } as T
    })
    expect(kitResult.ok).toBe(true)
    expect(sentCommands[1]?.command).toBe("build_packet_kit")
  })

  it("defaults to 3 repair rounds so packets needing a third pass reach agent-ready", async () => {
    expect(DEFAULT_REVIEW_ROUNDS).toBe(3)
    const base = await compilePacket(fileOrganizerBlueprint, "linux-wayland-gtk4-desktop")
    let reviews = 0
    const threeRoundResult = await runReviewAndRepairLoop({
      packet: base,
      idea: "Harbor Sort organizes downloads.",
      presetId: "linux-wayland-gtk4-desktop",
      requestId: "req-3-rounds",
      apiKey: "mem-key",
      reviewProvider: {
        review: async () => {
          reviews += 1
          return reviews <= 3
            ? { slug: base.projectSlug, blocking: [{ where: "PRD.md", quote: "# Product Requirements Document", why: `Round ${reviews}`, fix: "Keep heading." }], polish: [], verdict: "FAIL" }
            : { slug: base.projectSlug, blocking: [], polish: [], verdict: "PASS" }
        },
        fix: async () => ({
          edits: [{ finding: 1, file: "PRD.md", find: "# Product Requirements Document", replace: "# Product Requirements Document", all: false }],
          notes: "No-op round edit.",
        }),
      },
    })
    expect(threeRoundResult.repair.rounds).toBe(3)
    expect(threeRoundResult.repair.agentReady).toBe(true)
  })
})
