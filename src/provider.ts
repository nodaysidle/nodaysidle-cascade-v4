import type { ProviderRequest } from "./pipeline"

export async function deepseekProvider(request: ProviderRequest): Promise<string> {
  const response = await fetch(request.apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${request.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.model,
      instructions: request.instructions,
      input: request.input,
      max_output_tokens: request.maxOutputTokens,
      reasoning: { effort: request.reasoningEffort },
      temperature: 0,
      top_p: 1,
      text: {
        format: {
          type: "json_schema",
          name: "semantic_blueprint",
          strict: true,
          schema: request.schema,
        },
      },
      stream: false,
      store: false,
    }),
  })
  if (!response.ok) {
    // Only error.code leaves the body, and normalizeProviderFailure drops it unless it is on the allowlist.
    const body = await response.json().catch(() => undefined) as { error?: { code?: unknown } } | undefined
    throw { kind: "http", classification: "http-error", httpStatus: response.status, providerCode: body?.error?.code }
  }
  const wrapper = await response.json() as {
    status?: string
    output?: Array<{ type?: string; role?: string; status?: string; content?: Array<{ type?: string; text?: string }> }>
    incomplete_details?: { reason?: string }
    error?: { code?: string }
  }
  if (wrapper.status === "incomplete") {
    throw { kind: "incomplete", classification: "incomplete-response", incompleteReason: wrapper.incomplete_details?.reason }
  }
  if (wrapper.status === "failed") {
    throw { kind: "failed-response", classification: "provider-failed", providerCode: wrapper.error?.code }
  }
  if (wrapper.status !== "completed" || !Array.isArray(wrapper.output)) {
    throw { kind: "invalid-wrapper", classification: "invalid-provider-wrapper" }
  }
  const text = wrapper.output
    .filter(item => item.type === "message" && item.role === "assistant" && item.status === "completed")
    .flatMap(item => item.content ?? [])
    .filter(part => part.type === "output_text")
    .map(part => part.text ?? "")
    .find(value => value.trim().length > 0)
  if (!text) throw { kind: "invalid-wrapper", classification: "invalid-provider-wrapper" }
  return text
}
