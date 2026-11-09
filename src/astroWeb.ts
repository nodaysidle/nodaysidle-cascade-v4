import type { DataField, NormalizedBlueprint } from "./compiler"
import type { PresetRuntimeMode } from "./presets"
import type { FeatureSurface } from "./schema"

export type AstroFeaturePlacement =
  | { readonly kind: "component"; readonly registrationFile: string }
  | { readonly kind: "page"; readonly pageFile: string; readonly registrationFile: string }

// One content collection per stored data object with declared fields.
export interface AstroCollection {
  readonly name: string
  readonly dataName: string
  readonly fields: readonly DataField[]
}

export interface AstroRoutePlan {
  readonly usesContentCollections: boolean
  readonly collections: readonly AstroCollection[]
  // The collection behind the first item-page feature, else the first collection.
  readonly contentCollection: string
  readonly foundationExtras: readonly string[]
  readonly seedContentPaths: readonly string[]
  readonly featurePlacements: Readonly<Record<string, AstroFeaturePlacement>>
  readonly routeSummary: readonly string[]
  readonly browserPersistence: boolean
  readonly staticSite: boolean
  readonly dateNotes: readonly string[]
  readonly sharedDynamicRoute?: string
  readonly sharedDynamicRouteOwnerFeatureId?: string
}

// What placement needs from a feature; GraphFeature and NormalizedBlueprint features both satisfy it.
export interface PlaceableFeature {
  readonly id: string
  readonly name: string
  readonly surface: FeatureSurface
  readonly resourceIds: readonly string[]
}

// The production budget the kit's tests/performance.test.ts enforces and the documents state.
export const ASTRO_PERFORMANCE_BUDGET = { htmlBytes: 100_000, scriptBytes: 50_000, styleBytes: 50_000 } as const
export const ASTRO_BUDGET_TEXT = `every built HTML page under ${ASTRO_PERFORMANCE_BUDGET.htmlBytes / 1000} KB, all client JavaScript together under ${ASTRO_PERFORMANCE_BUDGET.scriptBytes / 1000} KB, all CSS together under ${ASTRO_PERFORMANCE_BUDGET.styleBytes / 1000} KB`

// One spelling of a declared field name for the schema, the seeds, the pages and the documents: camelCase that keeps the
// capitals the provider wrote ("shortDescription" stays, "Short description" becomes shortDescription), never lowercased whole.
export function fieldKey(name: string): string {
  const words = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^A-Za-z0-9]+/).filter(Boolean)
    .map(word => word === word.toUpperCase() ? word.toLowerCase() : word)
  return words.map((word, index) => (index === 0 ? word[0]!.toLowerCase() : word[0]!.toUpperCase()) + word.slice(1)).join("") || "value"
}

// A static site with no declared service and no browser storage: build-time files only, so no runtime error, retry, form or listener exists.
export function astroStaticContentSite(blueprint: NormalizedBlueprint, runtimeMode: PresetRuntimeMode): boolean {
  return runtimeMode === "static" && !blueprint.externalServices.length && !astroBrowserPersistence(blueprint, runtimeMode)
}

export function dataKey(name: string): string {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

// Collections are named after the declared data objects, never guessed from feature prose.
export function astroCollections(blueprint: NormalizedBlueprint): AstroCollection[] {
  const stored = blueprint.domainData
    .filter(item => item.storage === "records" && item.fields.length && (item.sensitivity === "public" || item.sensitivity === "internal"))
    .map(item => ({ name: dataKey(item.name) || "entries", dataName: item.name, fields: item.fields }))
  if (stored.length || !blueprint.features.some(feature => feature.surface === "item-page")) return stored
  // An item-page feature that declares no stored object still gets one generic collection.
  return [{ name: "entries", dataName: "", fields: [{ name: "Title", valueType: "text", optional: false }, { name: "Description", valueType: "long-text", optional: false }] }]
}

function collectionOf(feature: PlaceableFeature, collections: readonly AstroCollection[]): AstroCollection | undefined {
  return collections.find(item => item.dataName && feature.resourceIds.includes(`data:${dataKey(item.dataName)}`)) ?? collections[0]
}

export function astroUsesContentCollections(
  blueprint: NormalizedBlueprint,
  runtimeMode: PresetRuntimeMode,
): boolean {
  return runtimeMode === "static" && astroCollections(blueprint).length > 0
}

export function astroBrowserPersistence(
  blueprint: NormalizedBlueprint,
  runtimeMode: PresetRuntimeMode,
): boolean {
  return runtimeMode === "static"
    && blueprint.platformNeeds.includes("local-storage")
    && !astroUsesContentCollections(blueprint, runtimeMode)
}

// The route of a feature on the generic "page" surface: its name without a trailing "page".
export function pageRoute(featureName: string): string {
  return featureName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-page$/, "") || "page"
}

export function astroFeaturePlacement(
  feature: PlaceableFeature,
  collection: string,
): AstroFeaturePlacement {
  switch (feature.surface) {
    case "not-found-page":
      return { kind: "page", pageFile: "src/pages/404.astro", registrationFile: "src/pages/404.astro" }
    case "about-page":
      return { kind: "page", pageFile: "src/pages/about.astro", registrationFile: "src/pages/about.astro" }
    case "item-page": {
      const pageFile = `src/pages/${collection}/[slug].astro`
      return { kind: "page", pageFile, registrationFile: pageFile }
    }
    case "collection-index": {
      const pageFile = `src/pages/${collection}/index.astro`
      return { kind: "page", pageFile, registrationFile: pageFile }
    }
    case "tag-page": {
      const pageFile = `src/pages/${collection}/tags/[tag].astro`
      return { kind: "page", pageFile, registrationFile: pageFile }
    }
    case "search-page":
      return { kind: "page", pageFile: "src/pages/search.astro", registrationFile: "src/pages/search.astro" }
    case "page": {
      const pageFile = `src/pages/${pageRoute(feature.name)}.astro`
      return { kind: "page", pageFile, registrationFile: pageFile }
    }
    case "main":
      return { kind: "component", registrationFile: "src/pages/index.astro" }
  }
}

// Each page file belongs to the first feature that declares it; a later feature on the same file is a component of it.
export function placeAstroFeatures(
  features: readonly PlaceableFeature[],
  collections: readonly AstroCollection[],
): Record<string, AstroFeaturePlacement> {
  const placements: Record<string, AstroFeaturePlacement> = {}
  const pageOwners = new Set<string>()
  for (const feature of features) {
    const tentative = astroFeaturePlacement(feature, collectionOf(feature, collections)?.name ?? "entries")
    if (tentative.kind === "page" && pageOwners.has(tentative.pageFile)) {
      placements[feature.id] = { kind: "component", registrationFile: tentative.pageFile }
      continue
    }
    if (tentative.kind === "page") pageOwners.add(tentative.pageFile)
    placements[feature.id] = tentative
  }
  return placements
}

// Static routes the primary navigation links to; dynamic routes and the 404 page never appear in it.
export function astroNavLinks(features: readonly PlaceableFeature[], placements: Readonly<Record<string, AstroFeaturePlacement>>): { href: string; label: string; file: string }[] {
  return features.flatMap(feature => {
    const placement = placements[feature.id]
    if (placement?.kind !== "page" || placement.pageFile.includes("[") || placement.pageFile.endsWith("/404.astro")) return []
    const href = `${placement.pageFile.replace("src/pages", "").replace(/(?:\/index)?\.astro$/, "")}/`
    return [{ href, label: feature.name.replace(/\s+page$/i, ""), file: placement.pageFile }]
  })
}

// A date-time field read by a feature is evaluated when the site is built, never when it is visited.
export function astroDateNotes(features: readonly PlaceableFeature[], collections: readonly AstroCollection[]): string[] {
  return collections.flatMap(item => {
    const field = item.fields.find(candidate => candidate.valueType === "date-time")
    const readers = features.filter(feature => item.dataName && feature.resourceIds.includes(`data:${dataKey(item.dataName)}`))
    return field && readers.length
      ? [`Dates: ${readers.map(feature => feature.name).join(", ")} read ${item.dataName} (${field.name}). Any filter or ordering by that date runs once at build time on a static site, so the published list is only as current as the last build; rebuild and redeploy (on a schedule or when content changes) to refresh it, and never claim live freshness on the page.`]
      : []
  })
}

export function planAstroWeb(
  blueprint: NormalizedBlueprint,
  features: readonly PlaceableFeature[],
  runtimeMode: PresetRuntimeMode,
): AstroRoutePlan {
  const browserPersistence = astroBrowserPersistence(blueprint, runtimeMode)
  const usesContentCollections = astroUsesContentCollections(blueprint, runtimeMode)
  const collections = usesContentCollections ? astroCollections(blueprint) : []
  const featurePlacements = placeAstroFeatures(features, collections)
  const itemFeature = features.find(feature => feature.surface === "item-page" && featurePlacements[feature.id]?.kind === "page")
  const itemPlacement = itemFeature ? featurePlacements[itemFeature.id] : undefined

  const routeSummary: string[] = ["/ — src/pages/index.astro"]
  for (const feature of features) {
    const placement = featurePlacements[feature.id]!
    if (placement.kind !== "page") continue
    const route = placement.pageFile.replace("src/pages", "").replace(/(?:\/index)?\.astro$/, "") || "/"
    routeSummary.push(`${route} — ${placement.pageFile}${feature.surface === "item-page" ? " (build-time content collection)" : ""}`)
  }

  // The 404 page always exists: a not-found-page feature owns its text, otherwise the foundation kit file does.
  if (!features.some(feature => featurePlacements[feature.id]?.kind === "page" && feature.surface === "not-found-page")) {
    routeSummary.push(`/404 — src/pages/404.astro (neutral kit text owned by the foundation; no task changes it). A static build makes no page for an address that matches no entry, every unknown address${itemFeature ? ", including an item address that matches no entry," : ""} shows this page; a criterion about an unknown address is met by dist/404.html with its link home.`)
  }

  return {
    usesContentCollections,
    collections,
    contentCollection: (itemFeature ? collectionOf(itemFeature, collections) : collections[0])?.name ?? "entries",
    foundationExtras: usesContentCollections ? ["src/content.config.ts"] : [],
    seedContentPaths: collections.map(item => `src/content/${item.name}/sample-entry.md`),
    featurePlacements,
    routeSummary: unique(routeSummary),
    browserPersistence,
    staticSite: astroStaticContentSite(blueprint, runtimeMode),
    dateNotes: astroDateNotes(features, collections),
    sharedDynamicRoute: itemPlacement?.kind === "page" ? itemPlacement.pageFile : undefined,
    sharedDynamicRouteOwnerFeatureId: itemFeature?.id,
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

export const ASTRO_FOUNDATION_SCRIPT_REQUIREMENTS = [
  "check — astro check",
  "test — vitest run (excludes the two production-build checks below)",
  "test:a11y — vitest run tests/accessibility.test.ts against dist/ (fails when dist/ is missing)",
  `build — astro build`,
  `audit:performance — vitest run tests/performance.test.ts against dist/ (fails when dist/ is missing): ${ASTRO_BUDGET_TEXT}`,
] as const

export const ASTRO_CONTENT_COLLECTION_PERSISTENCE = {
  enabledDecision: "Persistence: enabled through Astro content collections compiled at build time; public catalog data lives in src/content/ as typed markdown or MDX with no browser IndexedDB for core content.",
  disabledDecision: "Persistence: disabled. No application data is retained between visits; static assets use ordinary HTTP caching only.",
  settingsPlacement: "Build-time content schema in src/content.config.ts; the site keeps no visitor preferences.",
  recordsPlacement: "Public records are markdown or MDX files under {collection}; src/lib/contentcatalog.ts reads them with getCollection() at build time and pages call only its functions.",
  temporaryPlacement: "Keep draft or preview values in memory inside client islands; do not mirror build-time catalog data into IndexedDB.",
} as const

export const ASTRO_DESIGN_TOKENS = [
  "Color: dark-first palette with --bg: #0B0F14 (Void Black), --surface, --text, --muted, --accent, and --border CSS custom properties in src/styles/global.css.",
  "Typography: fluid heading scale, 16px base body, 1.5 line-height, and system-ui stack with one optional display face documented in global.css.",
  "Spacing: 4px base grid (--space-1 through --space-8) for layout rhythm and component padding.",
  "Focus: visible :focus-visible rings on every interactive control; never remove outline without a replacement.",
  "Motion: honor prefers-reduced-motion; keep transitions under 200ms for UI state changes.",
] as const
