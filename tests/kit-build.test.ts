import { spawnSync } from "node:child_process"
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import { compilePacket, type CompiledPacket } from "../src/compiler"
import { bareGtkBlueprint, bareWaybarBlueprint, fixtureCases } from "./fixtures/blueprints"

const describeBuild = process.env.CASCADE_KIT_BUILD ? describe : describe.skip

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env: { ...process.env, ...env } })
  expect(result.status, `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`).toBe(0)
  return `${result.stdout}\n${result.stderr}`
}

function materialize(packet: CompiledPacket): string {
  const root = mkdtempSync(join(tmpdir(), "cascade-v4-kit-"))
  for (const file of packet.kit) {
    const path = join(root, file.name.replace(/^kit\//, ""))
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, file.content)
    if (file.name.startsWith("kit/") && file.name.endsWith(".sh")) chmodSync(path, 0o755)
  }
  return root
}

const cache = join(homedir(), ".cache", "cascade-v4")
const target = join(cache, "target")
const temporary = join(cache, "tmp")
mkdirSync(target, { recursive: true })
mkdirSync(temporary, { recursive: true })

describeBuild("v4 starter kits compile and pass their own tests", () => {
  it("GTK4 desktop kit", async () => {
    const fixture = fixtureCases.find(item => item.presetId === "linux-wayland-gtk4-desktop")!
    const root = materialize(await compilePacket(fixture.blueprint, fixture.presetId))
    try {
      run("cargo", ["fmt", "--check"], root, { TMPDIR: temporary })
      run("cargo", ["clippy", "--all-targets", "--all-features", "--", "-D", "warnings"], root, { CARGO_TARGET_DIR: target, TMPDIR: temporary })
      run("cargo", ["test"], root, { CARGO_TARGET_DIR: target, TMPDIR: temporary })
      run("cargo", ["build", "--release"], root, { CARGO_TARGET_DIR: target, TMPDIR: temporary })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 900_000)

  it("Waybar module kit", async () => {
    const fixture = fixtureCases.find(item => item.presetId === "linux-hyprland-waybar-module")!
    const root = materialize(await compilePacket(fixture.blueprint, fixture.presetId))
    try {
      run("cargo", ["fmt", "--check"], root, { TMPDIR: temporary })
      run("cargo", ["clippy", "--all-targets", "--all-features", "--", "-D", "warnings"], root, { CARGO_TARGET_DIR: target, TMPDIR: temporary })
      run("cargo", ["test"], root, { CARGO_TARGET_DIR: target, TMPDIR: temporary })
      run("cargo", ["build", "--release"], root, { CARGO_TARGET_DIR: target, TMPDIR: temporary })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 900_000)

  it("Waybar module kit without optional helpers", async () => {
    const root = materialize(await compilePacket(bareWaybarBlueprint, "linux-hyprland-waybar-module"))
    try {
      run("cargo", ["fmt", "--check"], root, { TMPDIR: temporary })
      run("cargo", ["clippy", "--all-targets", "--all-features", "--", "-D", "warnings"], root, { CARGO_TARGET_DIR: target, TMPDIR: temporary })
      run("cargo", ["test"], root, { CARGO_TARGET_DIR: target, TMPDIR: temporary })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 900_000)

  it("GTK4 desktop kit without optional helpers", async () => {
    const root = materialize(await compilePacket(bareGtkBlueprint, "linux-wayland-gtk4-desktop"))
    try {
      run("cargo", ["fmt", "--check"], root, { TMPDIR: temporary })
      run("cargo", ["clippy", "--all-targets", "--all-features", "--", "-D", "warnings"], root, { CARGO_TARGET_DIR: target, TMPDIR: temporary })
      run("cargo", ["test"], root, { CARGO_TARGET_DIR: target, TMPDIR: temporary })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 900_000)

  it("Astro site kit", async () => {
    const fixture = fixtureCases.find(item => item.presetId === "astro-web")!
    const root = materialize(await compilePacket(fixture.blueprint, fixture.presetId))
    try {
      run("npm", ["install", "--no-audit", "--no-fund"], root)
      run("npm", ["run", "check"], root)
      run("npm", ["test"], root)
      run("npm", ["run", "build"], root)
      run("npm", ["run", "test:a11y"], root)
      run("npm", ["run", "audit:performance"], root)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 900_000)

  it("Tauri 2 kit", async () => {
    const fixture = fixtureCases.find(item => item.presetId === "tauri2-rust-typescript-desktop")!
    const root = materialize(await compilePacket(fixture.blueprint, fixture.presetId))
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

  it("Android kit", async () => {
    const fixture = fixtureCases.find(item => item.presetId === "android-kotlin-compose")!
    const root = materialize(await compilePacket(fixture.blueprint, fixture.presetId))
    try {
      run("./scripts/gradle.sh", ["assembleDebug"], root, { ANDROID_HOME: process.env.ANDROID_HOME ?? join(homedir(), "Android/Sdk") })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 1_800_000)
})
