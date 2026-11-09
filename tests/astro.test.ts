import { describe, expect, it } from "vitest"
import { blueprintExportFile, compilePacket } from "../src/compiler"
import { fieldKey } from "../src/astroWeb"
import { fixtureCases, lanternBooksBlueprint } from "./fixtures/blueprints"

const kitFile = (packet: Awaited<ReturnType<typeof compilePacket>>, path: string) => packet.kit.find(item => item.name === `kit/${path}`)?.content

describe("Astro packets for a site with several record types", () => {
  it("gives every stored object its own collection, seed, and schema, and detail routes only to the item-page object", async () => {
    const packet = await compilePacket(lanternBooksBlueprint, "astro-web")
    const config = kitFile(packet, "src/content.config.ts")!
    for (const name of ["featured-book", "reading-event", "opening-hours"]) {
      expect(config).toContain(`"${name}": defineCollection`)
      expect(config).toContain(`base: "./src/content/${name}"`)
      expect(kitFile(packet, `src/content/${name}/01-sample-entry.md`)).toBeDefined()
      expect(packet.graph.foundationFiles).toContain(`src/content/${name}/01-sample-entry.md`)
    }
    expect(config).toContain("author: z.string()")
    expect(config).toContain("startsAt: z.coerce.date()")
    expect(config).toContain("presenter: z.string().optional()")
    expect(config).toContain("weekday: z.string()")
    const paths = packet.kit.map(item => item.name)
    expect(paths).toContain("kit/src/pages/featured-book/[slug].astro")
    expect(paths.filter(path => path.includes("[slug]"))).toHaveLength(1)
    expect(paths.some(path => path.endsWith("/index.astro") && path !== "kit/src/pages/index.astro")).toBe(false)
    const tasks = packet.documents["TASKS.md"]
    expect(tasks).toContain("/featured-book/[slug]")
    expect(tasks).toContain("Entries of Reading event live in src/content/reading-event/")
    expect(tasks).not.toMatch(/at least (?:one|two|\d)/i)
    expect(tasks).not.toContain("Create at least")
    const data = packet.graph.contracts.find(item => item.id === "CON-PERSISTENCE-READING-EVENT")!
    expect(data.details.join("\n")).toContain("src/content/reading-event/")
  })

  it("keeps the kit pages neutral shells with a correct layout and nav", async () => {
    const packet = await compilePacket(lanternBooksBlueprint, "astro-web")
    const home = kitFile(packet, "src/pages/index.astro")!
    expect(home).toContain("<h1>Lantern Books</h1>")
    for (const text of ["card", "Featured books", "Events page", "About page", "featured-book", lanternBooksBlueprint.summary]) expect(home).not.toContain(text)
    const about = kitFile(packet, "src/pages/about.astro")!
    expect(about).not.toContain(lanternBooksBlueprint.summary)
    expect(about).toContain("<h1>About</h1>")
    const layout = kitFile(packet, "src/layouts/BaseLayout.astro")!
    expect(layout).toContain('import "../styles/global.css"')
    expect(layout).toContain('<a href="/events/">Events</a>')
    expect(layout).toContain('<a href="/about/">About</a>')
    expect(kitFile(packet, "src/pages/events.astro")).toContain('import BaseLayout from "../layouts/BaseLayout.astro"')
    expect(kitFile(packet, "src/pages/404.astro")).toContain("That page does not exist")
    expect(packet.documents["TASKS.md"]).toContain("/404 — src/pages/404.astro (neutral kit text owned by the foundation")
  })

  it("ships a kit README that the Working Rules sentence points at", async () => {
    const packet = await compilePacket(lanternBooksBlueprint, "astro-web")
    const readme = kitFile(packet, "README.md")!
    expect(readme).toContain("Behavior to keep")
    expect(readme).toContain("src/pages/events.astro")
    expect(packet.documents["TASKS.md"]).toContain("Keep every behavior kit/README.md lists")
    expect(packet.graph.foundationFiles).toContain("README.md")
  })

  it("never lists a file under both Files to create and Files to modify", async () => {
    for (const fixture of fixtureCases) {
      const packet = await compilePacket(fixture.blueprint, fixture.presetId)
      for (const phase of packet.graph.phases) {
        for (const task of phase.tasks) expect(task.filesToModify.filter(file => task.filesToCreate.includes(file)), `${fixture.presetId} / ${task.id}`).toEqual([])
      }
    }
  })

  it("has no lifecycle or permission owner, and no page depends on one, for a static content site", async () => {
    const packet = await compilePacket(lanternBooksBlueprint, "astro-web")
    const ids = packet.graph.owners.map(owner => owner.id)
    expect(ids).not.toContain("OWN-LIFECYCLE-COORDINATOR")
    expect(ids).not.toContain("OWN-PERMISSION-COORDINATOR")
    expect(packet.graph.contracts.find(item => item.id === "CON-LIFECYCLE-PRESET")?.ownerId).toBe("OWN-PACKAGING")
    expect(packet.graph.contracts.map(item => item.id).filter(id => id.startsWith("CON-LIFECYCLE-APPLICATION"))).toEqual([])
    const tasks = packet.documents["TASKS.md"]
    expect(tasks).not.toContain("lifecyclecoordinator")
    expect(tasks).not.toContain("permissioncoordinator")
    // The data owner still exists and the page tasks depend on it.
    expect(ids).toContain("OWN-DATA-STORE")
  })

  it("omits adapter, network permission, file-system, and credential text a site with no service never uses", async () => {
    const withNetwork = { ...lanternBooksBlueprint, platformNeeds: ["network" as const], features: lanternBooksBlueprint.features.map((feature, index) => index === 0 ? { ...feature, usesPlatformNeeds: ["network" as const] } : feature) }
    const packet = await compilePacket(withNetwork, "astro-web", { siteKind: "catalog", outputMode: "static", adapter: "node", features: ["sitemap"] })
    expect(packet.exportable).toBe(true)
    const everything = Object.values(packet.documents).join("\n")
    expect(packet.graph.contracts.map(item => item.id)).not.toContain("CON-PERMISSION-NETWORK")
    expect(packet.graph.contracts.map(item => item.id)).not.toContain("CON-PLATFORM-FILES")
    const options = packet.graph.contracts.find(item => item.id === "CON-PRESET-OPTIONS")!
    expect(options.decision).not.toContain("adapter")
    expect(options.decision).toContain("outputMode=static")
    for (const text of ["credentialed calls run only", "File System Access", "Preserve entered form content", "Standalone local application"]) expect(everything).not.toContain(text)
    expect(everything).not.toMatch(/Delete \S.* only through an explicit user action/)
  })

  it("keeps the file boundary when a feature declares file access", async () => {
    const opens = { ...lanternBooksBlueprint, features: lanternBooksBlueprint.features.map((feature, index) => index === 0 ? { ...feature, userFileAccess: "opens" as const } : feature) }
    const packet = await compilePacket(opens, "astro-web")
    expect(packet.graph.contracts.map(item => item.id)).toContain("CON-PLATFORM-FILES")
  })

  it("backs every validation claim with a kit test that fails without a build", async () => {
    const packet = await compilePacket(lanternBooksBlueprint, "astro-web")
    const performance = kitFile(packet, "tests/performance.test.ts")!
    const accessibility = kitFile(packet, "tests/accessibility.test.ts")!
    expect(performance).toContain("dist/ is missing")
    expect(performance).not.toMatch(/if \(!existsSync[^)]*\)\) return/)
    expect(performance).toContain("100000")
    for (const check of ["lang=", "<h1", "<title>", "alt", "meta name=\"description\"", "no built page"]) expect(accessibility).toContain(check)
    expect(JSON.parse(kitFile(packet, "package.json")!).scripts.test).toContain("--exclude tests/performance.test.ts")
    const tasks = packet.documents["TASKS.md"]
    expect(tasks).toContain("every built HTML page under 100 KB, all client JavaScript together under 50 KB, all CSS together under 50 KB")
    expect(tasks).not.toContain("Accessibility has no critical findings")
    expect(tasks).toContain("keyboard and contrast review is manual")
  })

  it("states that a date filter on a static site is frozen at build time, only when a feature reads a date-time field", async () => {
    const packet = await compilePacket(lanternBooksBlueprint, "astro-web")
    expect(packet.documents["TRD.md"]).toContain("runs once at build time on a static site")
    expect(kitFile(packet, "README.md")).toContain("rebuild and redeploy")
    const noDate = { ...lanternBooksBlueprint, dataObjects: lanternBooksBlueprint.dataObjects.map(item => ({ ...item, fields: item.fields.map(field => field.valueType === "date-time" ? { ...field, valueType: "text" as const } : field) })) }
    expect((await compilePacket(noDate, "astro-web")).documents["TRD.md"]).not.toContain("runs once at build time")
  })

  it("spells every declared field the same in the schema, the seed, and the documents, keeping camelCase", async () => {
    const camel = { ...lanternBooksBlueprint, dataObjects: lanternBooksBlueprint.dataObjects.map((item, index) => index === 0 ? { ...item, fields: [{ name: "shortDescription", valueType: "text" as const, optional: false }, { name: "lengthKilometres", valueType: "number" as const, optional: false }, { name: "Opening time", valueType: "text" as const, optional: true }] } : item) }
    const packet = await compilePacket(camel, "astro-web")
    expect(fieldKey("shortDescription")).toBe("shortDescription")
    expect(fieldKey("Short note")).toBe("shortNote")
    expect(fieldKey("URL list")).toBe("urlList")
    expect(kitFile(packet, "src/content.config.ts")).toContain("shortDescription: z.string()")
    expect(kitFile(packet, "src/content.config.ts")).toContain("lengthKilometres: z.number()")
    expect(kitFile(packet, "src/content.config.ts")).toContain("openingTime: z.string().optional()")
    expect(kitFile(packet, "src/content/featured-book/01-sample-entry.md")).toContain("lengthKilometres: 1")
    expect(packet.documents["TASKS.md"]).toContain("Frontmatter holds exactly shortDescription, lengthKilometres, openingTime (optional)")
    expect(packet.documents["TRD.md"]).not.toContain("shortdescription")
  })

  it("lets npm test pass at TASK-01 and TASK-02: the contract test requires only pages copied before TASK-01", async () => {
    const packet = await compilePacket(lanternBooksBlueprint, "astro-web")
    const contract = kitFile(packet, "tests/contract.test.ts")!
    expect(contract).toContain("src/pages/index.astro")
    expect(contract).toContain("src/pages/404.astro")
    for (const owned of ["src/pages/about.astro", "src/pages/events.astro", "[slug]"]) expect(contract).not.toContain(owned)
    const readme = kitFile(packet, "README.md")!
    const [copyFirst, startFrom] = readme.split("Start from these in the owning task")
    expect(copyFirst).not.toContain("- src/pages/about.astro")
    expect(startFrom).toContain("- src/pages/about.astro")
    expect(startFrom).toContain("- src/pages/featured-book/[slug].astro")
    const copied = packet.graph.foundationFiles
    expect(copied).not.toContain("src/pages/about.astro")
  })

  it("keeps sample entries as sample content when the idea supplies none, and says who replaces them", async () => {
    const packet = await compilePacket(lanternBooksBlueprint, "astro-web")
    const seed = kitFile(packet, "src/content/featured-book/01-sample-entry.md")!
    expect(seed).toContain("Sample content")
    expect(packet.documents["TASKS.md"]).toContain("keep its sample entry unchanged and invent nothing; the site owner replaces it")
    const data = packet.graph.phases.flatMap(phase => phase.tasks).find(task => task.ownerIds.includes("OWN-DATA-STORE"))!
    expect(data.prompt).toContain("create one file per entry the idea names, named with a two-digit numeric prefix in the order the idea lists them (01-, 02-), and delete that collection's 01-sample-entry.md")
  })

  it("states the content catalog interface and tests pages over the build", async () => {
    const packet = await compilePacket(lanternBooksBlueprint, "astro-web")
    const trd = packet.documents["TRD.md"]
    expect(trd).toContain("exporting listFeaturedBookEntries()")
    expect(trd).toContain("getFeaturedBookEntry(id)")
    expect(trd).toContain("never calls getCollection itself")
    expect(trd).toContain("each page's focused test asserts on the HTML that npm run build emits into dist/")
    const tasks = packet.graph.phases.flatMap(phase => phase.tasks)
    expect(tasks.find(task => task.ownerIds.includes("OWN-DATA-STORE"))!.filesToModify).toEqual([])
    const about = tasks.find(task => task.ownerIds.includes("OWN-ABOUT-PAGE"))!
    expect(about.validationCommands[0]).toBe("npm run build")
  })

  it("gives a static content site static failure, wiring, lifecycle, and deployment text and a packaging task with no edits", async () => {
    const withNeeds = { ...lanternBooksBlueprint, platformNeeds: ["notifications" as const, "audio-input" as const] }
    const packet = await compilePacket(withNeeds, "astro-web")
    const everything = Object.values(packet.documents).join("\n")
    for (const text of ["Preserve entered form content", "an empty list shows one centered message", "settings are grouped rows", "HTTPS host", "server-adapter", "Clean up event listeners", "Preserve the last valid state", "explicit retry", "Local-first state", "siteKind", "Durable local recovery"]) expect(everything, text).not.toContain(text)
    expect(everything).toContain("fails npm run build and names the file and field")
    expect(everything).toContain("No deployment host is declared")
    expect(everything).toContain("including an item address that matches no entry")
    const packaging = packet.graph.phases.flatMap(phase => phase.tasks).find(task => task.ownerIds.includes("OWN-PACKAGING"))!
    expect(packaging.filesToCreate).toEqual(["tests/packaging.test.ts"])
    expect(packaging.filesToModify).toEqual([])
    expect(packaging.prompt).not.toContain("Modify the listed shared files")
  })

  it("keeps the interactive wiring and recovery text for a site with a declared service", async () => {
    const packet = await compilePacket(lanternBooksBlueprint, "astro-web")
    expect(packet.documents["TRD.md"]).not.toContain("Preserve entered form content")
  })

  it("gives a records collection to every content object whatever storage or platform needs the provider wrote", async () => {
    const needs = ["notifications" as const, "camera" as const, "location" as const, "local-storage" as const]
    const asDocuments = {
      ...lanternBooksBlueprint,
      platformNeeds: needs,
      features: lanternBooksBlueprint.features.map(feature => ({ ...feature, usesPlatformNeeds: needs })),
      dataObjects: lanternBooksBlueprint.dataObjects.map((item, index) => ({ ...item, storage: index === 0 ? "document" as const : "app-files" as const })),
    }
    const packet = await compilePacket(asDocuments, "astro-web")
    const config = kitFile(packet, "src/content.config.ts")!
    for (const name of ["featured-book", "reading-event", "opening-hours"]) expect(config).toContain(`"${name}": defineCollection`)
    expect(config).not.toContain('"entries"')
    expect(packet.kit.map(item => item.name)).toContain("kit/src/pages/featured-book/[slug].astro")
    const ids = packet.graph.contracts.map(item => item.id)
    for (const id of ["CON-PERMISSION-FILESYSTEM", "CON-PERMISSION-NOTIFICATIONS", "CON-PERMISSION-CAMERA", "CON-PERMISSION-LOCATION", "CON-PLATFORM-FILES"]) expect(ids).not.toContain(id)
    expect(packet.graph.owners.map(owner => owner.id)).not.toContain("OWN-LIFECYCLE-COORDINATOR")
    expect(packet.graph.owners.map(owner => owner.id)).not.toContain("OWN-PERMISSION-COORDINATOR")
    expect(packet.documents["TASKS.md"]).not.toMatch(/permissioncoordinator|lifecyclecoordinator/)
    expect(packet.graph.astroPlan?.staticSite).toBe(true)
    // The same packet as the records version.
    expect(packet.documents["TASKS.md"]).toBe((await compilePacket(lanternBooksBlueprint, "astro-web")).documents["TASKS.md"])
  })

  it("renders the detail page through the catalog function and shows every declared field", async () => {
    const packet = await compilePacket(lanternBooksBlueprint, "astro-web")
    const page = kitFile(packet, "src/pages/featured-book/[slug].astro")!
    expect(page).toContain('import { listFeaturedBookEntries } from "../../lib/contentcatalog"')
    expect(page).not.toContain("getCollection")
    const catalog = kitFile(packet, "src/lib/contentcatalog.ts")!
    for (const name of ["FeaturedBook", "ReadingEvent", "OpeningHours"]) expect(catalog).toContain(`export async function list${name}Entries()`)
    expect(packet.graph.foundationFiles).not.toContain("src/lib/contentcatalog.ts")
    expect(kitFile(packet, "README.md")).toContain("src/lib/contentcatalog.ts")
    for (const label of ["Title", "Author", "Short note"]) expect(page).toContain(`<dt>${label}</dt>`)
    const events = { ...lanternBooksBlueprint, features: lanternBooksBlueprint.features.map(feature => feature.name === "Book page" ? { ...feature, usesData: ["Reading event"], dataOperations: [{ data: "Reading event", operations: ["read" as const] }] } : feature) }
    const eventPage = kitFile(await compilePacket(events, "astro-web"), "src/pages/reading-event/[slug].astro")!
    expect(eventPage).toContain("entry.data.startsAt.toISOString()")
    expect(eventPage).toContain("{entry.data.presenter !== undefined &&")
  })

  it("states one order rule: ascending entry id, numeric-prefixed files, and no invented order field", async () => {
    const packet = await compilePacket(lanternBooksBlueprint, "astro-web")
    for (const name of ["PRD.md", "TRD.md", "TASKS.md"] as const) expect(packet.documents[name], name).toContain("every list is in ascending entry id")
    expect(packet.documents["TRD.md"]).toContain("sorted ascending by id, the file name without extension")
    expect(packet.documents["TASKS.md"]).not.toContain("render in the order the feature declares")
  })

  it("puts the identity in package.json, a viewport check in the build test, and a manual-evidence note on the 320 px check", async () => {
    const packet = await compilePacket(lanternBooksBlueprint, "astro-web")
    expect(JSON.parse(kitFile(packet, "package.json")!).identity).toBe("com.lantern.books")
    expect(kitFile(packet, "tests/contract.test.ts")).toContain('"com.lantern.books"')
    expect(kitFile(packet, "tests/accessibility.test.ts")).toContain("viewport meta")
    const tasks = packet.documents["TASKS.md"]
    expect(tasks).toContain('recorded as the "identity" field of package.json')
    expect(packet.documents["TRD.md"]).toContain("dist/sitemap-index.xml only when SITE_URL was set")
    expect(packet.documents["TRD.md"]).toContain("manual evidence to report, not a test")
  })

  it("records a static site in blueprint.json with no adapter and no browser capability", async () => {
    const packet = await compilePacket(lanternBooksBlueprint, "astro-web")
    const file = await blueprintExportFile(packet, lanternBooksBlueprint, "astro-web", { siteKind: "landing", outputMode: "static", adapter: "node" })
    const manifest = JSON.parse(file.content)
    expect(manifest.preset.options).toEqual({ siteKind: "landing", outputMode: "static" })
    for (const key of ["notifications", "microphone", "camera", "location", "network"]) expect(manifest.preset.capabilities[key], key).toBe(false)
    expect(manifest.preset.capabilities.fileAccess).toBe("none")
  })
})
