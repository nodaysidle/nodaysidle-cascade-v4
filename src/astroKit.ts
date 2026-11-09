import { pascal, type DataField, type NormalizedBlueprint } from "./compiler"
import type { ProjectIdentity } from "./presets"
import type { DataValueType } from "./schema"
import { ASTRO_BUDGET_TEXT, ASTRO_PERFORMANCE_BUDGET, astroCollections, astroDateNotes, fieldKey, astroNavLinks, placeAstroFeatures, seedFileNames, type AstroCollection } from "./astroWeb"

export interface AstroKitFile {
  readonly path: string
  readonly content: string
}

export const CATALOG_PATH = "src/lib/contentcatalog.ts"

function file(path: string, content: string): AstroKitFile {
  return { path, content: content.trimStart() }
}

const ZOD_FOR: Record<DataValueType, string> = {
  text: "z.string()",
  "long-text": "z.string()",
  number: "z.number()",
  "whole-number": "z.number().int()",
  flag: "z.boolean()",
  date: "z.coerce.date()",
  "date-time": "z.coerce.date()",
  time: "z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/)",
  "text-list": "z.array(z.string())",
  reference: "z.string()",
}
const SEED_FOR: Record<DataValueType, string> = {
  text: "Sample text",
  "long-text": "Sample text",
  number: "1",
  "whole-number": "1",
  flag: "true",
  date: "2026-01-01",
  "date-time": "2026-01-01",
  time: "\"09:00\"",
  "text-list": "[Sample item]",
  reference: "sample-reference",
}

// Text that lands in an .astro template: braces would start an expression, angle brackets a tag.
function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\{/g, "&#123;").replace(/\}/g, "&#125;").replace(/"/g, "&quot;")
}

// Keys the detail page reads: the first declared text field is the title; the first long text (or second text) field is the description.
function pageKeys(fields: readonly DataField[]): { title: string; description?: string } {
  const title = fields.find(field => field.valueType === "text") ?? fields[0]!
  const description = fields.find(field => field.valueType === "long-text") ?? fields.find(field => field.valueType === "text" && field !== title)
  return { title: fieldKey(title.name), ...(description ? { description: fieldKey(description.name) } : {}) }
}

function contentConfig(collections: readonly AstroCollection[]): string {
  const entries = collections.map(item => `  ${JSON.stringify(item.name)}: defineCollection({
    loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/${item.name}" }),
    schema: z.object({
${item.fields.map(field => `      ${fieldKey(field.name)}: ${ZOD_FOR[field.valueType]}${field.min != null ? `.min(${field.min})` : ""}${field.max != null ? `.max(${field.max})` : ""}${field.optional ? ".optional()" : ""},`).join("\n")}
    }),
  }),`)
  return `import { defineCollection, z } from "astro:content"
import { glob } from "astro/loaders"

export const collections = {
${entries.join("\n")}
}
`
}

// The catalog the data contract names, for every collection that has a declared data object; the data task starts from it.
function contentCatalog(collections: readonly AstroCollection[]): string {
  const withData = collections.filter(item => item.dataName)
  return `import { getCollection } from "astro:content"

const byId = <T extends { id: string }>(entries: readonly T[]): T[] => [...entries].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
${withData.map(item => {
    const name = pascal(item.dataName)
    return `
export async function list${name}Entries() {
  return byId(await getCollection(${JSON.stringify(item.name)}))
}

export async function get${name}Entry(id: string) {
  return (await getCollection(${JSON.stringify(item.name)})).find(entry => entry.id === id)
}
`
  }).join("")}`
}

// "foodKind" and "Food kind" both read "Food kind" as a visitor-facing label.
function label(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim().toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const SHOWN_AS: Record<string, (key: string) => string> = {
  "long-text": key => `{entry.data.${key}.split(/\\n\\s*\\n/).map((paragraph: string) => <p>{paragraph}</p>)}`,
  flag: key => `{entry.data.${key} ? "Yes" : "No"}`,
  date: key => `{entry.data.${key}.toISOString().slice(0, 10)}`,
  "date-time": key => `{entry.data.${key}.toISOString()}`,
  "text-list": key => `{entry.data.${key}.join(", ")}`,
}

// The detail page shows every declared field. It reads the entries through the catalog function the data contract names;
// only a collection with no declared data object (the generic fallback) has no catalog and reads getCollection itself.
function detailPage(item: AstroCollection): string {
  const keys = pageKeys(item.fields)
  const list = item.dataName ? `list${pascal(item.dataName)}Entries` : ""
  // The title is the h1, so it gets no second row.
  const titled = item.fields.find(field => fieldKey(field.name) === keys.title)
  const fields = item.fields.filter(field => field !== titled).map(field => {
    const key = fieldKey(field.name)
    const shown = (SHOWN_AS[field.valueType] ?? ((name: string) => `{entry.data.${name}}`))(key)
    const row = `<dt>${esc(label(field.name))}</dt><dd>${shown}</dd>`
    return field.optional ? `      {entry.data.${key} !== undefined && <>${row}</>}` : `      ${row}`
  })
  return `---
import BaseLayout from "../../layouts/BaseLayout.astro"
import { ${list ? "" : "getCollection, "}render } from "astro:content"
${list ? `import { ${list} } from "../../lib/contentcatalog"\n` : ""}
export async function getStaticPaths() {
  const entries = await ${list ? `${list}()` : `getCollection("${item.name}")`}
  return entries.map(entry => ({ params: { slug: entry.id }, props: { entry } }))
}

const { entry } = Astro.props
const { Content } = await render(entry)
---
<BaseLayout title={entry.data.${keys.title}} ${keys.description ? `description={entry.data.${keys.description}}` : ""}>
  <article>
    <h1>{entry.data.${keys.title}}</h1>
    <dl>
${fields.join("\n")}
    </dl>
    <Content />
  </article>
</BaseLayout>
`
}

// A page shell makes no product claim: the layout and one heading, until the owning task fills it.
function shellPage(depth: number, title: string, heading: string): string {
  return `---
import BaseLayout from "${"../".repeat(depth)}layouts/BaseLayout.astro"
---
<BaseLayout title="${title}">
  <h1>${heading}</h1>
</BaseLayout>
`
}

const ACCESSIBILITY_TEST = `import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// These checks read the production build in dist/, so run npm run build first.
function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? htmlFiles(path) : path.endsWith(".html") ? [path] : []
  })
}

function builtPages(): string[] {
  expect(existsSync("dist"), "dist/ is missing: run npm run build first").toBe(true)
  const pages = htmlFiles("dist")
  expect(pages.length, "dist/ holds no HTML page").toBeGreaterThan(0)
  return pages
}

describe("built pages", () => {
  it("each has a language, one h1, a title, and alt text on every image", () => {
    for (const path of builtPages()) {
      const html = readFileSync(path, "utf8")
      expect(html, path + ": html lang").toMatch(/<html[^>]*\\slang="[a-zA-Z-]+"/)
      expect((html.match(/<h1[\\s>]/g) ?? []).length, path + ": exactly one h1").toBe(1)
      expect(html, path + ": viewport meta").toMatch(/<meta name="viewport" content="width=device-width/)
      expect(html, path + ": title").toMatch(/<title>[^<]+<\\/title>/)
      for (const image of html.match(/<img\\b[^>]*>/g) ?? []) expect(image, path + ": img alt").toMatch(/\\salt=/)
    }
  })

  it("each has a meta description, and every internal link resolves to a built page", () => {
    for (const path of builtPages()) {
      const html = readFileSync(path, "utf8")
      expect(html, path + ": meta description").toMatch(/<meta name="description" content="[^"]+"/)
      for (const match of html.matchAll(/<a\\b[^>]*\\shref="(\\/[^"#?]*)/g)) {
        const href = match[1]!
        if (href.startsWith("//")) continue
        const target = join("dist", href)
        const found = existsSync(target) && (statSync(target).isFile() || existsSync(join(target, "index.html")))
        expect(found, path + ": link " + href + " has no built page").toBe(true)
      }
    }
  })
})
`

const PERFORMANCE_TEST = `import { existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Budget: ${ASTRO_BUDGET_TEXT}. It reads the production build in dist/, so run npm run build first.
const budget = { html: ${ASTRO_PERFORMANCE_BUDGET.htmlBytes}, script: ${ASTRO_PERFORMANCE_BUDGET.scriptBytes}, style: ${ASTRO_PERFORMANCE_BUDGET.styleBytes} }

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}

function built(): string[] {
  expect(existsSync("dist"), "dist/ is missing: run npm run build first").toBe(true)
  return files("dist")
}

const total = (paths: string[]) => paths.reduce((sum, path) => sum + statSync(path).size, 0)

describe("production budget", () => {
  it("keeps every built HTML page under " + budget.html + " bytes", () => {
    for (const path of built().filter(item => item.endsWith(".html"))) expect(statSync(path).size, path).toBeLessThan(budget.html)
  })

  it("keeps all client JavaScript under " + budget.script + " bytes", () => {
    expect(total(built().filter(item => /\\.m?js$/.test(item)))).toBeLessThan(budget.script)
  })

  it("keeps all CSS under " + budget.style + " bytes", () => {
    expect(total(built().filter(item => item.endsWith(".css")))).toBeLessThan(budget.style)
  })
})
`

export function astroKit(identity: ProjectIdentity, blueprint: NormalizedBlueprint, options: Readonly<Record<string, string | boolean | readonly string[]>> = {}): AstroKitFile[] {
  const collections = astroCollections(blueprint)
  const features = blueprint.features.map(feature => ({ ...feature, id: feature.name }))
  const placements = placeAstroFeatures(features, collections)
  const nav = astroNavLinks(features, placements)
  const project = esc(blueprint.projectName)
  const siteFeatures = Array.isArray(options.features) ? options.features : ["sitemap"]
  const sitemap = siteFeatures.includes("sitemap")

  // One shell per declared static page; an item page reads its collection, so only a stored object behind it gets one.
  const shells = features.flatMap(feature => {
    const placement = placements[feature.id]
    if (placement?.kind !== "page" || placement.pageFile.includes("[") || placement.pageFile.endsWith("/404.astro")) return []
    const label = esc(feature.name.replace(/\s+page$/i, ""))
    return [file(placement.pageFile, shellPage(placement.pageFile.split("/").length - 2, `${label} — ${project}`, label))]
  })
  const detailPages = features.flatMap(feature => {
    const placement = placements[feature.id]
    const item = collections.find(candidate => placement?.kind === "page" && placement.pageFile === `src/pages/${candidate.name}/[slug].astro`)
    return feature.surface === "item-page" && item ? [file(`src/pages/${item.name}/[slug].astro`, detailPage(item))] : []
  })
  const catalog = collections.some(item => item.dataName) ? [file(CATALOG_PATH, contentCatalog(collections))] : []
  const content = collections.length ? [
    file("src/content.config.ts", contentConfig(collections)),
    ...collections.flatMap(item => seedFileNames(item).map((name, index) => {
      // A counted collection numbers its samples so every entry differs; a lone sample keeps the plain placeholder values.
      const mark = item.entryCount ? ` ${index + 1}` : ""
      return file(`src/content/${item.name}/${name}`, `---
${item.fields.map(field => `${fieldKey(field.name)}: ${field.valueType === "text" || field.valueType === "long-text" ? SEED_FOR[field.valueType] + mark : (field.valueType === "number" || field.valueType === "whole-number") && (field.min != null || field.max != null) ? String(field.min ?? field.max) : SEED_FOR[field.valueType]}`).join("\n")}
---

Sample content${mark}. Keep it when the idea supplies no entries; the site owner replaces it with real entries after delivery.
`)
    })),
  ] : []
  // Only pages copied before TASK-01 may be required here; a shell or detail page belongs to the task that owns it.
  const pageFiles = ["src/pages/index.astro", "src/pages/404.astro"]
  const ownedFiles = [...shells, ...detailPages, ...catalog].map(item => item.path)

  const files: AstroKitFile[] = [
    file("package.json", JSON.stringify({
      name: identity.slug,
      // The locked identity has no other file to live in on a web site; the contract test asserts it.
      identity: identity.bundleId,
      private: true,
      type: "module",
      version: "0.1.0",
      scripts: {
        dev: "astro dev",
        check: "astro check",
        build: "astro build",
        preview: "astro preview",
        // The two production-build checks read dist/, so they run after npm run build, not in npm test.
        test: "vitest run --exclude tests/accessibility.test.ts --exclude tests/performance.test.ts",
        "test:a11y": "vitest run tests/accessibility.test.ts",
        "audit:performance": "vitest run tests/performance.test.ts",
      },
      dependencies: {
        astro: "^5.0.0",
        ...(sitemap ? { "@astrojs/sitemap": "^3.0.0" } : {}),
      },
      devDependencies: {
        "@astrojs/check": "^0.9.0",
        typescript: "^5.0.0",
        vitest: "^4.0.0",
      },
    }, null, 2) + "\n"),
    file("astro.config.mjs", `import { defineConfig } from "astro/config"
${sitemap ? 'import sitemap from "@astrojs/sitemap"\n' : ""}
const site = process.env.SITE_URL

export default defineConfig({
  // shortcut: no image optimizer, so a markdown build never needs the native sharp binary; switch to the default service when the site ships raster images.
  image: { service: { entrypoint: "astro/assets/services/noop" } },
  ${sitemap ? "...(site ? { site, integrations: [sitemap()] } : {})," : "..." + "(site ? { site } : {}),"}
})
`),
    file("tsconfig.json", JSON.stringify({ extends: "astro/tsconfigs/strict", include: [".astro/types.d.ts", "**/*"], exclude: ["dist"] }, null, 2) + "\n"),
    file("src/env.d.ts", `/// <reference types="astro/client" />\n`),
    file("src/styles/global.css", `:root {
  color-scheme: dark;
  --bg: #0b0f14;
  --surface: #121820;
  --border: #24313d;
  --text: #e6edf3;
  --muted: #9aa8b5;
  --accent: #4c8c6b;
  --radius: 18px;
  --measure: 68ch;
}

* { box-sizing: border-box; }
html { background: var(--bg); color: var(--text); }
body { margin: 0; font: 16px/1.65 system-ui, sans-serif; }
a { color: var(--accent); }
a:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.skip { position: absolute; left: -999px; }
.skip:focus { left: 1rem; top: 1rem; background: var(--surface); padding: .5rem .75rem; border-radius: .5rem; }
.shell { max-width: 72rem; margin: 0 auto; padding: 1.25rem; }
header.site { display: flex; justify-content: space-between; gap: 1rem; align-items: center; padding: 1rem 0; border-bottom: 1px solid var(--border); }
nav a { margin-left: 1rem; }
main { padding: 3rem 0; max-width: var(--measure); }
h1 { font-size: clamp(2.2rem, 6vw, 4.2rem); line-height: 1.05; letter-spacing: -.03em; margin: 0 0 1rem; }
h2 { margin-top: 2.5rem; }
.lede { color: var(--muted); font-size: 1.15rem; }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; transition: none !important; } }
`),
    file("src/layouts/BaseLayout.astro", `---
import "../styles/global.css"
const { title, description = title } = Astro.props
const canonical = Astro.site ? new URL(Astro.url.pathname, Astro.site) : Astro.url
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content={description} />
    <link rel="canonical" href={canonical} />
    <title>{title}</title>
  </head>
  <body>
    <a class="skip" href="#main">Skip to content</a>
    <div class="shell">
      <header class="site">
        <a href="/">${project}</a>
        <nav aria-label="Primary">
          <a href="/">Home</a>
          ${nav.map(link => `<a href="${link.href}">${esc(link.label)}</a>`).join("\n          ")}
        </nav>
      </header>
      <main id="main">
        <slot />
      </main>
      <footer><p class="lede">${project}</p></footer>
    </div>
  </body>
</html>
`),
    file("src/pages/index.astro", `---
import BaseLayout from "../layouts/BaseLayout.astro"
---
<BaseLayout title="${project}">
  <h1>${project}</h1>
  {/* The main-surface feature component renders here. */}
</BaseLayout>
`),
    file("src/pages/404.astro", `---
import BaseLayout from "../layouts/BaseLayout.astro"
---
<BaseLayout title="Not found — ${project}">
  <h1>Not found</h1>
  <p class="lede">That page does not exist. <a href="/">Return home</a>.</p>
</BaseLayout>
`),
    ...shells,
    ...content,
    ...catalog,
    ...detailPages,
    file("tests/contract.test.ts", `import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("contract", () => {
  it("records the locked identity in package.json", () => {
    expect(JSON.parse(readFileSync("package.json", "utf8")).identity).toBe(${JSON.stringify(identity.bundleId)})
  })

  it("has the required pages", () => {
    for (const page of ${JSON.stringify(pageFiles)}) expect(existsSync(page), page).toBe(true)
  })

  it("loads the global stylesheet and links every declared page route", () => {
    const layout = readFileSync("src/layouts/BaseLayout.astro", "utf8")
    expect(layout).toContain('import "../styles/global.css"')
    for (const href of ${JSON.stringify(["/", ...nav.map(link => link.href)])}) expect(layout).toContain('href="' + href + '"')
  })
})
`),
    file("tests/accessibility.test.ts", ACCESSIBILITY_TEST),
    file("tests/performance.test.ts", PERFORMANCE_TEST),
  ]
  files.push(file("README.md", `# ${blueprint.projectName} starter kit

Tested starting code for the static Astro site in TRD.md. Before TASK-01, copy every file in the first list below (not this README) from kit/ to the same path in the project root and keep every behavior listed here. Do not copy the second list early: the task that owns each page lists it under Files to create and starts from this content.

${files.filter(item => !ownedFiles.includes(item.path)).map(item => `- ${item.path}`).join("\n")}
${ownedFiles.length ? `\nStart from these in the owning task (not copied before it):\n\n${ownedFiles.map(path => `- ${path}`).join("\n")}\n` : ""}
## Behavior to keep

- Routes shell: src/pages/index.astro is one h1 with the product name and a place for the main-surface feature component. It carries no product copy; the feature tasks fill it. ${nav.length ? `Declared page routes (each a shell with one h1): ${nav.map(link => link.href).join(", ")}.` : "No other static page route is declared."}
- src/pages/404.astro is the not-found page: neutral text and a link home, unless a not-found-page feature declares it, in which case that feature's task owns its text.
- src/layouts/BaseLayout.astro imports ../styles/global.css, links every declared page route in the primary nav (add a link when a task adds a static route), and gives every page a title and meta description. Every page has exactly one h1; a feature component never adds a second.
${collections.length ? `- src/content.config.ts exports one collection per stored data object (${collections.map(item => item.name).join(", ")}), each with a schema of that object's declared fields. Each collection starts with one sample-entry.md of placeholder values (a collection whose idea states a count but names no entries starts with exactly that many numbered sample entries): keep them when the idea supplies no entries (the site owner replaces them later), and delete them only when real entries exist.
- Only a collection behind an item-page feature has a [slug] route; every other page reads its own collection (through src/lib/contentcatalog.ts once its task has created it). Frontmatter keys are the camelCase field keys in content.config.ts, used identically in the seeds, the pages and the documents.` : "- The site declares no stored content collection."}
${astroDateNotes(features, collections).map(note => `- ${note}\n`).join("")}- Scripts: npm run check (astro check), npm test (vitest, without the two production-build checks), npm run build, npm run test:a11y and npm run audit:performance. The last two read dist/ and fail when it is missing, so run npm run build first.
- tests/accessibility.test.ts checks every built page for html lang, one h1, a title, a meta description, alt text on every image, and resolving internal links. It is structural; keyboard and contrast review stay manual.
- tests/performance.test.ts enforces the budget: ${ASTRO_BUDGET_TEXT}.
`))
  return files
}
