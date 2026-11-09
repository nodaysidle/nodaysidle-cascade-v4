import type { JevRequest } from "./jev"

const JEV_URL = "https://api.typesafe.ai/v1/systemone"
const JEV_MODEL = "jev-latest"

function jevQuestions(request: JevRequest): Readonly<Record<string, unknown>> {
  return Object.fromEntries(request.nouls.map(noul => [
    noul.id,
    noul.kind === "boolean"
      ? { type: "noul", instructions: noul.question }
      : {
          type: "choice",
          instructions: noul.question,
          criteria: Object.fromEntries(noul.options.map(option => [option, noul.descriptions?.[option] ?? null])),
        },
  ]))
}

function jevOutcomes(request: JevRequest, response: unknown): string {
  const record = response && typeof response === "object" ? response as Record<string, unknown> : {}
  const answers = record.answers && typeof record.answers === "object" ? record.answers as Record<string, unknown> : {}
  const outcomes: Array<Record<string, unknown>> = []
  for (const noul of request.nouls) {
    const answer = answers[noul.id]
    if (!answer || typeof answer !== "object") continue
    const item = answer as Record<string, unknown>
    if (noul.kind === "boolean" && item.type === "noul") {
      outcomes.push({ kind: "boolean", id: noul.id, pTrue: item.noul })
      continue
    }
    if (noul.kind === "choice" && item.type === "choice") {
      outcomes.push({
        kind: "choice",
        id: noul.id,
        choice: item.choice,
        confidence: item.confidence,
        ...(noul.keepProbabilities && item.probabilities && typeof item.probabilities === "object" ? { probabilities: item.probabilities } : {}),
      })
    }
  }
  return JSON.stringify({ outcomes })
}

export async function nodeJevProvider(request: JevRequest): Promise<string> {
  const response = await fetch(JEV_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${request.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: JEV_MODEL,
      state: request.state,
      questions: jevQuestions(request),
    }),
  })
  if (!response.ok) throw { kind: "transport", classification: "http-error", status: response.status }
  return jevOutcomes(request, await response.json())
}
