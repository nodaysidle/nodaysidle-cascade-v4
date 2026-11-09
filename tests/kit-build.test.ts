import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import { fixtureCases } from "./fixtures/blueprints"

const describeBuild = process.env.CASCADE_KIT_BUILD ? describe : describe.skip

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env: { ...process.env, ...env } })
  expect(result.status, `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`).toBe(0)
  return `${result.stdout}\n${result.stderr}`
}

describeBuild("v4 starter kits compile and pass their own tests", () => {
  it.each([
    ["GTK4 desktop", "linux-wayland-gtk4-desktop"],
    ["Waybar module", "linux-hyprland-waybar-module"],
  ] as const)("%s kit", async (_label, presetId) => {
    const fixture = fixtureCases.find(item => item.presetId === presetId)!
    const packet = await compilePacket(fixture.blueprint, presetId)
    const root = mkdtempSync(join(tmpdir(), "cascade-v4-kit-"))
    const target = mkdtempSync(join(tmpdir(), "cascade-v4-target-"))
    try {
      for (const file of packet.kit) {
        const path = join(root, file.name.replace(/^kit\//, ""))
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, file.content)
      }
      run("cargo", ["fmt", "--check"], root)
      run("cargo", ["clippy", "--all-targets", "--", "-D", "warnings"], root, { CARGO_TARGET_DIR: target })
      run("cargo", ["test"], root, { CARGO_TARGET_DIR: target })
      run("cargo", ["build", "--release"], root, { CARGO_TARGET_DIR: target })
    } finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(target, { recursive: true, force: true })
    }
  }, 900_000)
})
