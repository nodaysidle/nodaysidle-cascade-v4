import type { NormalizedBlueprint } from "./compiler"
import type { PresetId, ProjectIdentity } from "./presets"
import { contentCollectionName } from "./astroWeb"

export interface AstroKitFile {
  readonly path: string
  readonly content: string
}

function file(path: string, content: string): AstroKitFile {
  return { path, content: content.trimStart() }
}

function collectionFor(blueprint: NormalizedBlueprint): string {
  return contentCollectionName(blueprint)
}

function hasContent(blueprint: NormalizedBlueprint): boolean {
  return blueprint.domainData.length > 0 || blueprint.features.some(feature => feature.surface === "item-page")
}

function hasSurface(blueprint: NormalizedBlueprint, surface: string): boolean {
  return blueprint.features.some(feature => feature.surface === surface)
}

export function astroKit(identity: ProjectIdentity, blueprint: NormalizedBlueprint, options: Readonly<Record<string, string | boolean | readonly string[]>> = {}): AstroKitFile[] {
  const collection = collectionFor(blueprint)
  const content = hasContent(blueprint)
  const about = hasSurface(blueprint, "about-page")
  const item = content
  const features = Array.isArray(options.features) ? options.features : ["sitemap"]
  const sitemap = features.includes("sitemap")
  const files: AstroKitFile[] = [
    file("package.json", JSON.stringify({
      name: identity.slug,
      private: true,
      type: "module",
      version: "0.1.0",
      scripts: {
        dev: "astro dev",
        check: "astro check",
        build: "astro build",
        preview: "astro preview",
        test: "vitest run",
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
.grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); margin: 2rem 0; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.15rem; }
.card h3 { margin: 0 0 .4rem; }
.list { display: grid; gap: .65rem; padding: 0; list-style: none; }
.list a { display: block; background: var(--surface); border: 1px solid var(--border); border-radius: .8rem; padding: .85rem 1rem; }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; transition: none !important; } }
`),
    file("src/layouts/BaseLayout.astro", `---
const { title, description } = Astro.props
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
        <a href="/">${blueprint.projectName}</a>
        <nav aria-label="Primary">
          <a href="/">Home</a>
          ${about ? '<a href="/about/">About</a>' : ""}
        </nav>
      </header>
      <main id="main">
        <slot />
      </main>
      <footer><p class="lede">${blueprint.projectName}</p></footer>
    </div>
  </body>
</html>
`),
    file("src/pages/index.astro", `---
import BaseLayout from "../layouts/BaseLayout.astro"
${content ? `import { getCollection } from "astro:content"\nconst entries = await getCollection("${collection}")` : ""}
---
<BaseLayout title="${blueprint.projectName}" description="${blueprint.productDefinition.slice(0, 150)}">
  <h1>${blueprint.projectName}</h1>
  <p class="lede">${blueprint.productDefinition}</p>
  <div class="grid">
    ${blueprint.features.map(feature => `<article class="card"><h3>${feature.name}</h3><p>${feature.outputs[0] ?? feature.behavior}</p></article>`).join("\n    ")}
  </div>
  ${content ? `<h2>Entries</h2><ul class="list">{entries.map(entry => <li><a href={\`/${collection}/\${entry.id}/\`}>{entry.data.title}</a></li>)}</ul>` : ""}
</BaseLayout>
`),
    file("src/pages/404.astro", `---
import BaseLayout from "../layouts/BaseLayout.astro"
---
<BaseLayout title="Not found — ${blueprint.projectName}" description="The page does not exist.">
  <h1>Not found</h1>
  <p class="lede">That page does not exist. <a href="/">Return home</a>.</p>
</BaseLayout>
`),
    file("tests/contract.test.ts", `import { existsSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("contract", () => {
  it("has the required pages", () => {
    expect(existsSync("src/pages/index.astro")).toBe(true)
    expect(existsSync("src/pages/404.astro")).toBe(true)
  })
})
`),
    file("tests/accessibility.test.ts", `import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("accessibility source contract", () => {
  it("has a language, a main landmark, and a skip link", () => {
    const layout = readFileSync("src/layouts/BaseLayout.astro", "utf8")
    expect(layout).toContain('lang="en"')
    expect(layout).toContain("<main")
    expect(layout).toContain("Skip to content")
  })
})
`),
    file("tests/performance.test.ts", `import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("performance contract", () => {
  it("ships a small static document", () => {
    if (!existsSync("dist/index.html")) return
    const html = readFileSync("dist/index.html", "utf8")
    expect(html.length).toBeLessThan(200_000)
    expect(html).not.toContain("data-astro-cid-")
  })
})
`),
  ]
  if (about) {
    files.push(file("src/pages/about.astro", `---
import BaseLayout from "../layouts/BaseLayout.astro"
---
<BaseLayout title="About — ${blueprint.projectName}" description="${blueprint.productDefinition.slice(0, 150)}">
  <h1>About</h1>
  <p class="lede">${blueprint.productDefinition}</p>
</BaseLayout>
`))
  }
  if (content) {
    files.push(
      file("src/content.config.ts", `import { defineCollection, z } from "astro:content"
import { glob } from "astro/loaders"

export const collections = {
  ${JSON.stringify(collection)}: defineCollection({
    loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/${collection}" }),
    schema: z.object({
      title: z.string(),
      description: z.string(),
      published: z.boolean().default(true),
    }),
  }),
}
`),
      file(`src/content/${collection}/_seed.example.md`, `---
title: Example entry
description: Replace this seed with the product's first real entry.
published: true
---

This is starter content. Replace it with the product's real content.
`),
      file(`src/pages/${collection}/index.astro`, `---
import BaseLayout from "../../layouts/BaseLayout.astro"
import { getCollection } from "astro:content"
const entries = await getCollection("${collection}")
---
<BaseLayout title="${blueprint.projectName}" description="${blueprint.productDefinition.slice(0, 150)}">
  <h1>${blueprint.projectName}</h1>
  <ul class="list">
    {entries.map(entry => <li><a href={\`/${collection}/\${entry.id}/\`}>{entry.data.title}</a></li>)}
  </ul>
</BaseLayout>
`),
    )
    if (item) {
      files.push(file(`src/pages/${collection}/[slug].astro`, `---
import BaseLayout from "../../layouts/BaseLayout.astro"
import { getCollection, render } from "astro:content"

export async function getStaticPaths() {
  const entries = await getCollection("${collection}")
  return entries.map(entry => ({ params: { slug: entry.id }, props: { entry } }))
}

const { entry } = Astro.props
const { Content } = await render(entry)
---
<BaseLayout title={entry.data.title} description={entry.data.description}>
  <article>
    <h1>{entry.data.title}</h1>
    <Content />
  </article>
</BaseLayout>
`))
    }
  }
  return files
}
