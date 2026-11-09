import { spawnSync } from "node:child_process"
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import { snippetLibraryBlueprint } from "./fixtures/gtkRecords"

const describeBuild = process.env.CASCADE_KIT_BUILD ? describe : describe.skip

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env: { ...process.env, ...env } })
  expect(result.status, `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`).toBe(0)
}

const cache = join(homedir(), ".cache", "cascade-v4")
const target = join(cache, "target")
const temporary = join(cache, "tmp")

describeBuild("GTK4 kit without settings, credentials, network or background", () => {
  it("builds and passes its own tests with the clock and SQLite helpers only", async () => {
    mkdirSync(target, { recursive: true })
    mkdirSync(temporary, { recursive: true })
    const packet = await compilePacket(snippetLibraryBlueprint, "linux-wayland-gtk4-desktop")
    const root = mkdtempSync(join(tmpdir(), "cascade-v4-kit-"))
    for (const file of packet.kit) {
      const path = join(root, file.name.replace(/^kit\//, ""))
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, file.content)
      if (file.name.endsWith(".sh")) chmodSync(path, 0o755)
    }
    try {
      run("cargo", ["fmt", "--check"], root, { TMPDIR: temporary })
      run("cargo", ["clippy", "--all-targets", "--all-features", "--", "-D", "warnings"], root, { CARGO_TARGET_DIR: target, TMPDIR: temporary })
      run("cargo", ["test"], root, { CARGO_TARGET_DIR: target, TMPDIR: temporary })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 900_000)
})
