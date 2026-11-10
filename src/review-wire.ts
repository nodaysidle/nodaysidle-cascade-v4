import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import type { CompiledPacket } from "./compiler"
import type { PresetId } from "./presets"
import {
  Fix,
  Review,
  type KitBuildResult,
  type ReviewProvider,
  type ReviewRequest,
} from "./review"

export const KIT_BUILD_COMMANDS: Readonly<Record<PresetId, readonly (readonly string[])[]>> = {
  "linux-wayland-gtk4-desktop": [
    ["cargo", "fmt", "--check"],
    ["cargo", "clippy", "--all-targets", "--all-features", "--", "-D", "warnings"],
    ["cargo", "test"],
  ],
  "linux-hyprland-waybar-module": [
    ["cargo", "fmt", "--check"],
    ["cargo", "clippy", "--all-targets", "--all-features", "--", "-D", "warnings"],
    ["cargo", "test"],
  ],
  "astro-web": [
    ["npm", "install", "--no-audit", "--no-fund"],
    ["npm", "run", "check"],
    ["npm", "run", "build"],
    ["npm", "test"],
    ["npm", "run", "test:a11y"],
    ["npm", "run", "audit:performance"],
  ],
  "tauri2-rust-typescript-desktop": [
    ["npm", "install", "--no-audit", "--no-fund"],
    ["npm", "run", "typecheck"],
    ["npm", "test"],
    ["npm", "run", "build"],
    ["npm", "run", "tauri", "--", "icon", "app-icon.svg"],
    ["cargo", "fmt", "--manifest-path", "src-tauri/Cargo.toml", "--", "--check"],
    ["cargo", "test", "--manifest-path", "src-tauri/Cargo.toml"],
  ],
  "android-kotlin-compose": [
    ["./scripts/gradle.sh", "assembleDebug", "testDebugUnitTest"],
  ],
}

export async function buildCompiledPacketKit(packet: CompiledPacket, presetId: PresetId): Promise<KitBuildResult> {
  const commands = KIT_BUILD_COMMANDS[presetId]
  if (!commands) return { ok: false, command: presetId, output: `Unknown preset for kit build: ${presetId}` }
  const home = homedir()
  const cargoTargetDir = join(home, ".cache", "cascade-v4", "target")
  const cacheTmpDir = join(home, ".cache", "cascade-v4", "tmp")
  mkdirSync(cargoTargetDir, { recursive: true })
  mkdirSync(cacheTmpDir, { recursive: true })
  const workDir = mkdtempSync(join(cacheTmpDir, "kit-build-"))
  try {
    for (const file of packet.kit) {
      const relative = file.name.startsWith("kit/") ? file.name.slice("kit/".length) : file.name
      const target = join(workDir, relative)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, file.content)
      if (target.endsWith(".sh")) chmodSync(target, 0o755)
    }
    const scriptsDir = join(workDir, "scripts")
    if (existsSync(scriptsDir)) {
      for (const name of readdirSync(scriptsDir)) {
        if (name.endsWith(".sh")) chmodSync(join(scriptsDir, name), 0o755)
      }
    }
    const env = {
      ...process.env,
      CARGO_TARGET_DIR: cargoTargetDir,
      TMPDIR: cacheTmpDir,
      ANDROID_HOME: process.env.ANDROID_HOME ?? join(home, "Android", "Sdk"),
    }
    for (const args of commands) {
      const commandText = args.join(" ")
      const result = spawnSync(args[0]!, args.slice(1), { cwd: workDir, env, encoding: "utf8" })
      if (result.status !== 0) {
        const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim()
        const tail = combined.split("\n").slice(-15).join("\n")
        return { ok: false, command: commandText, output: tail }
      }
    }
    return { ok: true }
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

function classifyAnthropicError(error: unknown, signal?: AbortSignal): never {
  if (signal?.aborted) throw { kind: "cancelled", classification: "cancelled" }
  if (error instanceof Anthropic.AuthenticationError) {
    throw { kind: "http", classification: "http-error", httpStatus: 401, providerCode: "authentication_error" }
  }
  if (error instanceof Anthropic.RateLimitError) {
    throw { kind: "http", classification: "http-error", httpStatus: 429, providerCode: "rate_limit_exceeded" }
  }
  if (error instanceof Anthropic.APIError) {
    throw { kind: "http", classification: "http-error", httpStatus: error.status ?? 500 }
  }
  throw { kind: "transport", classification: "request-failed" }
}

async function runStructuredClaudeRequest<T>(
  request: ReviewRequest,
  format: ReturnType<typeof zodOutputFormat>,
  parse: (value: unknown) => T,
): Promise<T> {
  if (!request.apiKey) throw { kind: "invalid-request", classification: "invalid-request" }
  const client = new Anthropic({ apiKey: request.apiKey })
  try {
    const response = await client.messages.stream(
      {
        model: request.model,
        max_tokens: 64000,
        output_config: { effort: "high", format },
        messages: [{ role: "user", content: request.prompt }],
      },
      {
        signal: request.signal,
        headers: { "anthropic-beta": "server-side-fallback-2026-07-01" },
      },
    ).finalMessage()
    if (response.stop_reason !== "end_turn") {
      throw {
        kind: "incomplete",
        classification: "incomplete-response",
        incompleteReason: response.stop_reason === "max_tokens" ? "max_output_tokens" : "content_filter",
      }
    }
    const text = response.content.flatMap(block => block.type === "text" ? [block.text] : []).join("")
    return parse(JSON.parse(text))
  } catch (error) {
    if (error && typeof error === "object" && "kind" in error && "classification" in error) throw error
    return classifyAnthropicError(error, request.signal)
  }
}

export const nodeReviewProvider: ReviewProvider = {
  review: request => runStructuredClaudeRequest(request, zodOutputFormat(Review), value => Review.parse(value)),
  fix: request => runStructuredClaudeRequest(request, zodOutputFormat(Fix), value => Fix.parse(value)),
}
