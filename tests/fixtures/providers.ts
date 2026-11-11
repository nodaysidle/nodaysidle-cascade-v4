import type { JevNoul, JevRequest } from "../../src/jev"
import type { BlueprintProvider } from "../../src/pipeline"
import type { SemanticBlueprint } from "../../src/schema"

export function fixtureProvider(blueprint: SemanticBlueprint): BlueprintProvider {
  return async () => JSON.stringify(blueprint)
}

export function fixtureJevProvider(request: JevRequest): Promise<string> {
  const outcomes = request.nouls.map(noul => {
    if (noul.kind === "boolean") {
      const pTrue = noul.id === "viability"
        || noul.id === "acceptance-verifiability"
        || noul.id.endsWith("_verifiable")
        ? 1
        : 0
      return { kind: "boolean", id: noul.id, pTrue }
    }
    const choice = choiceFor(noul, request)
    return {
      kind: "choice",
      id: noul.id,
      choice,
      confidence: 1,
      ...(noul.keepProbabilities
        ? { probabilities: Object.fromEntries(noul.options.map(option => [option, option === choice ? 1 : 0])) }
        : {}),
    }
  })
  return Promise.resolve(JSON.stringify({ outcomes }))
}

function choiceFor(noul: JevNoul, request: JevRequest): string {
  if (noul.kind !== "choice") return ""
  if (noul.id === "preset-selection") return request.state.presetId ?? noul.options[0]!
  if (noul.id === "clarity") return "clear"
  if (noul.id.endsWith("_idea_fidelity")) return "faithful"
  if (noul.id.endsWith("_capability")) return "none"
  if (noul.id.startsWith("data_")) return "settings"
  return noul.options[0]!
}
