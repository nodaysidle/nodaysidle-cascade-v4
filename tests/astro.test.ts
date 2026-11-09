import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import { fixtureCases, lanternBooksBlueprint } from "./fixtures/blueprints"

const kitFile = (packet: Awaited<ReturnType<typeof compilePacket>>, path: string) => packet.kit.find(item => item.name === `kit/${path}`)?.content

describe("Astro packets for a site with several record types", () => {
  it("gives every stored object its own collection, seed, and schema, and detail routes only to the item-page object", async () => {
    const packet = await compilePacket(lanternBooksBlueprint, "astro-web")
    const config = kitFile(packet, "src/content.config.ts")!
    for (const name of ["featured-book", "reading-event", "opening-hours"]) {
      expect(config).toContain(`"${name}": defineCollection`)
      expect(config).toContain(`base: "./src/content/${name}"`)
      expect(kitFile(packet, `src/content/${name}/_seed.example.md`)).toBeDefined()
      expect(packet.graph.foundationFiles).toContain(`src/content/${name}/_seed.example.md`)
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
    expect(tasks).toMatch(/Create one entry in src\/content\/reading-event\/ for every Reading event/)
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
})
