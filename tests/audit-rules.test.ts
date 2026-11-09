import { describe, expect, it } from "vitest"
import { auditPacket, auditProjectGraph } from "../src/audit"
import { compilePacket, specializePreset, type CompiledPacket, type ProjectGraph } from "../src/compiler"
import { PRESETS } from "../src/presets"
import { fixtureCases, scanDrawerBlueprint } from "./fixtures/blueprints"

type Mutable<T> = { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] }
type Graph = Mutable<ProjectGraph>
type Docs = Record<string, string>

const gtk = fixtureCases.find(item => item.presetId === "linux-wayland-gtk4-desktop")!
let base: CompiledPacket
const fresh = async () => { base ??= await compilePacket(gtk.blueprint, gtk.presetId); return { graph: structuredClone(base.graph) as Graph, docs: { ...base.documents } as Docs } }
const allTasks = (graph: Graph) => graph.phases.flatMap(phase => phase.tasks)
const rulesOf = (graph: Graph, docs: Docs) => new Set([
  ...auditProjectGraph(graph as ProjectGraph).map(item => item.rule),
  ...auditPacket(graph as ProjectGraph, docs, specializePreset(PRESETS[graph.presetId], graph.blueprint as ProjectGraph["blueprint"], graph.presetOptions)).map(item => item.rule),
])

// One minimal defect per export gate rule: each gate must fire on its own defect.
const cases: ReadonlyArray<readonly [string, (graph: Graph, docs: Docs) => void]> = [
  ["graph.ids", graph => { graph.requirements[0]!.id = graph.features[0]!.id }],
  ["graph.references", graph => { graph.features[0]!.ownerId = "OWN-MISSING" }],
  ["graph.cycles", graph => { graph.features[0]!.requiredOwnerIds = [graph.features[0]!.ownerId] }],
  ["graph.dependencies", graph => { graph.features[0]!.requiredOwnerIds = [graph.features.at(-1)!.ownerId] }],
  ["graph.task-scope", graph => { allTasks(graph).find(task => task.ownerIds.includes("OWN-PACKAGING"))!.featureIds.push(graph.features[0]!.id) }],
  ["graph.acceptance-ownership", graph => { graph.acceptance[1]!.criterion = graph.acceptance[0]!.criterion }],
  ["graph.focused-test-ownership", graph => { allTasks(graph).find(task => task.ownerIds.length)!.focusedTests = ["tests/someone_else.rs"] }],
  ["graph.ownership", graph => { graph.owners[1]!.implementationFile = graph.owners[0]!.implementationFile }],
  ["graph.create-before-modify", graph => { allTasks(graph)[0]!.filesToModify.push("src/never_created.rs") }],
  ["graph.coverage", graph => { graph.requirements[0]!.statement = "" }],
  ["contract.decisions", graph => { graph.contracts = graph.contracts.filter(contract => contract.kind !== "lifecycle") }],
  ["contract.persistence-ownership", graph => { graph.contracts.find(contract => contract.kind === "data")!.kind = "credential" }],
  ["validation.commands", graph => { graph.validationCommands = ["rm -rf /"] }],
  ["security.executable-injection", (_graph, docs) => { docs["PRD.md"] += "\nRun bash -c 'ls'.\n" }],
  ["packet.exact-five", (_graph, docs) => { docs["EXTRA.md"] = "# Extra\n" }],
  ["packet.non-empty", (_graph, docs) => { docs["PRD.md"] = "" }],
  ["markdown.valid", (_graph, docs) => { docs["ARD.md"] += "\n# A second title\n" }],
  ["content.unfinished", (_graph, docs) => { docs["TRD.md"] += "\nTBD.\n" }],
  ["content.dangling-punctuation", (_graph, docs) => { docs["TRD.md"] += "\nSaves the name, , and the date.\n" }],
  ["content.unresolved-decision", (_graph, docs) => { docs["TRD.md"] += "\nDecide whether to cache.\n" }],
  ["content.identity", (_graph, docs) => { docs["TRD.md"] += "\nThe id is com.example.app.\n" }],
  ["content.secret-shaped", (_graph, docs) => { docs["TRD.md"] += `\nKey sk-${"a".repeat(24)}.\n` }],
  ["trace.missing-reference", (graph, docs) => { docs["TASKS.md"] = docs["TASKS.md"]!.replaceAll(graph.features[0]!.id, "FEAT-GONE") }],
  ["stack.leakage", (_graph, docs) => { docs["TRD.md"] += `\n${PRESETS["android-kotlin-compose"].implementationMarker}\n` }],
  ["preset.contracts", (graph, docs) => { docs["ARD.md"] = docs["ARD.md"]!.replaceAll(PRESETS[graph.presetId].accessibilityRules[0]!, "") }],
  ["agent-ready.shared-files", (_graph, docs) => { docs["AGENTS.md"] += "\n- Shared file src/not_shared.rs — nobody modifies it.\n" }],
  ["agent-ready.settings-name", (_graph, docs) => { docs["TRD.md"] += "\n$XDG_CONFIG_HOME/app/a.json and $XDG_CONFIG_HOME/app/b.json\n" }],
  ["agent-ready.desktop-id", (_graph, docs) => { docs["TRD.md"] += "\nresources/wrong-name.desktop\n" }],
  ["agent-ready.launch-env", (_graph, docs) => { docs["TRD.md"] += "\nGDK_BACKEND=wayland ./scripts/package.sh\n" }],
  ["agent-ready.task-order", graph => { allTasks(graph)[0]!.dependencies.push(allTasks(graph).at(-1)!.id) }],
]

describe("every export gate fires on its own defect", () => {
  it("the clean fixture passes every gate", async () => {
    const { graph, docs } = await fresh()
    expect([...rulesOf(graph, docs)]).toEqual([])
  })

  it.each(cases)("%s", async (rule, mutate) => {
    const { graph, docs } = await fresh()
    mutate(graph, docs)
    expect([...rulesOf(graph, docs)]).toContain(rule)
  })

  it("agent-ready.unrequested-delete fires when no feature declares delete", async () => {
    const { graph, docs } = await fresh()
    for (const feature of graph.features) feature.dataOperations = feature.dataOperations.filter(operation => operation !== "delete")
    docs["TRD.md"] += "\nDelete a record only through an explicit user action.\n"
    expect([...rulesOf(graph, docs)]).toContain("agent-ready.unrequested-delete")
  })

  it("contract.persistence-placement fires for app files outside the app folder", async () => {
    const packet = await compilePacket(scanDrawerBlueprint, "linux-wayland-gtk4-desktop")
    const graph = structuredClone(packet.graph) as Graph
    const contract = graph.contracts.find(item => item.kind === "persistence" && item.details.some(detail => detail.startsWith("Placement:") && detail.includes("XDG_DATA_HOME")))!
    contract.details = contract.details.map(detail => detail.startsWith("Placement:") ? "Placement: a folder the user picks." : detail)
    expect(auditProjectGraph(graph as ProjectGraph).map(item => item.rule)).toContain("contract.persistence-placement")
  })
})

describe("graph content rules gate export instead of stopping the compiler", () => {
  it("an unstated default in feature text is a lint failure a repair can fix", async () => {
    const { generatePacket } = await import("../src/pipeline")
    const blueprint = structuredClone(gtk.blueprint)
    blueprint.features[0]!.behavior = `${blueprint.features[0]!.behavior} It keeps the documented default.`
    const packet = await compilePacket(blueprint, gtk.presetId)
    expect(packet.exportable).toBe(false)
    expect(packet.failures.map(item => item.rule)).toContain("content.unstated-default")
    const result = await generatePacket({ requestId: "r", idea: "Harbor Sort helps people organize downloads into named folders with preview, undo, and search.", presetId: gtk.presetId, model: "deepseek-flash", apiUrl: "https://api.deepseek.com/responses", apiKey: "k" }, async () => JSON.stringify(blueprint))
    expect(result.status).toBe("lint-failure")
    expect(result.repairedIssues?.some(issue => issue.rule === "content.unstated-default")).toBe(true)
  })
})
