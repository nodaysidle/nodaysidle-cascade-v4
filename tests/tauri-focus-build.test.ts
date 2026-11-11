import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import { focusLedgerBlueprint } from "./fixtures/tauriFocus"

const describeBuild = process.env.CASCADE_KIT_BUILD ? describe : describe.skip

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env: { ...process.env, ...env } })
  expect(result.status, `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`).toBe(0)
}

const cache = join(homedir(), ".cache", "cascade-v4")
const target = join(cache, "target")
const temporary = join(cache, "tmp")

describeBuild("Tauri Linux-only kit with a global shortcut", () => {
  it("Tauri 2 Linux kit builds and passes its own tests", async () => {
    mkdirSync(target, { recursive: true })
    mkdirSync(temporary, { recursive: true })
    const packet = await compilePacket(focusLedgerBlueprint, "tauri2-rust-typescript-desktop", { linuxPackaging: "binary", wayland: true })
    const root = mkdtempSync(join(tmpdir(), "cascade-v4-kit-"))
    for (const file of packet.kit) {
      const path = join(root, file.name.replace(/^kit\//, ""))
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, file.content)
    }
    try {
      run("npm", ["install", "--no-audit", "--no-fund"], root)
      run("npm", ["run", "typecheck"], root)
      run("npm", ["test"], root)
      run("npm", ["run", "build"], root)
      run("npm", ["run", "tauri", "--", "icon", "app-icon.svg"], root)
      run("cargo", ["fmt", "--manifest-path", "src-tauri/Cargo.toml", "--", "--check"], root, { TMPDIR: temporary })
      run("cargo", ["test", "--manifest-path", "src-tauri/Cargo.toml"], root, { CARGO_TARGET_DIR: target, TMPDIR: temporary })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 1_800_000)
})
