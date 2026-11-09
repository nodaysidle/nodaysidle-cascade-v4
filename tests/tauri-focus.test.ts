import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import { focusLedgerBlueprint } from "./fixtures/tauriFocus"

const PRESET = "tauri2-rust-typescript-desktop"
const linux = { linuxPackaging: "appimage", wayland: true } as const

const task = (tasks: string, id: string): string => tasks.split("### ").find(block => block.startsWith(id)) ?? ""
const kitFile = (packet: Awaited<ReturnType<typeof compilePacket>>, name: string): string => packet.kit.find(file => file.name === `kit/${name}`)?.content ?? ""

describe("Tauri packet for an offline time tracker", () => {
  it("reaches Gate Clean with and without the Linux option", async () => {
    for (const options of [linux, {}]) {
      const packet = await compilePacket(focusLedgerBlueprint, PRESET, options)
      expect(packet.failures).toEqual([])
    }
  })

  it("states the wire format once, in the data contracts", async () => {
    const { documents } = await compilePacket(focusLedgerBlueprint, PRESET, linux)
    const trd = documents["TRD.md"]
    expect(trd.match(/Wire format \(/g)).toHaveLength(1)
    expect(trd.indexOf("Wire format (")).toBeGreaterThan(trd.indexOf("## Data Contracts"))
    expect(trd.indexOf("Wire format (")).toBeLessThan(trd.indexOf("## External Integration Contracts"))
    for (const text of ["ids are i64", "RFC3339 UTC", "null when absent", "array of strings", "AppError", "list command takes no arguments"]) expect(trd).toContain(text)
    expect(trd).toContain("ended_at: Option(String)")
  })

  it("gives a saved document one write command and no record commands", async () => {
    for (const withFields of [false, true]) {
      const blueprint = structuredClone(focusLedgerBlueprint)
      if (withFields) blueprint.dataObjects[1]!.fields = [{ name: "Body", valueType: "long-text", optional: false }]
      const { documents } = await compilePacket(blueprint, PRESET, linux)
      const trd = documents["TRD.md"]
      expect(trd).toContain("write_week_report(path: String, content: String)")
      expect(trd).toContain("canonicalizes its parent directory")
      expect(trd).not.toMatch(/read_week_report|create_week_report|list_week_report|get_week_report/)
      // The export reads the entries; it does not create them.
      expect(trd).toContain("read (FEAT-TODAY-TOTALS, FEAT-ENTRY-EDITING, FEAT-SHORTCUT-TOGGLE, FEAT-WEEK-EXPORT)")
      expect(trd).toContain("create (FEAT-TIMER-CONTROL);")
    }
  })

  it("registers the shortcut from one kit file and drops the X11 conditional", async () => {
    const packet = await compilePacket(focusLedgerBlueprint, PRESET, linux)
    const all = Object.values(packet.documents).join("\n")
    expect(all).not.toMatch(/X11-only|Hyprland bind|3 times|three times/)
    expect(all).toContain("DEFAULT_ACCELERATOR")
    expect(all).toContain("src/shortcut.ts")
    const shortcut = kitFile(packet, "src/shortcut.ts")
    expect(shortcut).toContain('export const DEFAULT_ACCELERATOR = "CommandOrControl+Shift+Space"')
    expect(shortcut).toContain("onFailure(error)")
    const capabilities = kitFile(packet, "src-tauri/capabilities/default.json")
    expect(capabilities).toContain("global-shortcut:allow-register")
    expect(capabilities).not.toContain("is-registered")
    expect(task(packet.documents["TASKS.md"], "TASK-06-SHORTCUT-TOGGLE")).toContain("registerShortcut(onPress, onFailure)")
  })

  it("drops macOS packaging, signing, and bundle text when linuxPackaging is set", async () => {
    const packet = await compilePacket(focusLedgerBlueprint, PRESET, linux)
    const all = Object.values(packet.documents).join("\n")
    expect(all).not.toMatch(/macOS|notarization|codesign|native \.app|Windows code signing/)
    expect(all).not.toContain("Tauri builds the bundle")
    expect(packet.kit.map(file => file.name)).not.toContain("kit/scripts/package_app.sh")
    expect(kitFile(packet, "src-tauri/tauri.conf.json")).not.toContain("macOS")
    const legacy = await compilePacket(focusLedgerBlueprint, PRESET, {})
    expect(legacy.kit.map(file => file.name)).toContain("kit/scripts/package_app.sh")
    expect(legacy.documents["TRD.md"]).not.toContain("Tauri builds the bundle")
  })

  it("does not hard-code the schema version in the kit test", async () => {
    const packet = await compilePacket(focusLedgerBlueprint, PRESET, linux)
    const tests = kitFile(packet, "src-tauri/tests/kit_tests.rs")
    expect(tests).toContain("let migrations = backend::database::MIGRATIONS.len()")
    expect(tests).not.toContain("json!(0)")
    expect(task(packet.documents["TASKS.md"], "TASK-02-DATA-STORE")).toContain("src-tauri/src/database.rs")
  })

  it("foundation runs cargo test and does not ask to recreate kit files", async () => {
    const { documents } = await compilePacket(focusLedgerBlueprint, PRESET, linux)
    const foundation = task(documents["TASKS.md"], "TASK-01-FOUNDATION")
    expect(foundation).toContain("`cargo test --manifest-path src-tauri/Cargo.toml`")
    expect(foundation).toContain("The only files you create here are: tests/contract.test.ts, src-tauri/tests/contract_tests.rs.")
  })

  it("packaging task says what packaging.rs holds and runs the Linux package build", async () => {
    const { documents } = await compilePacket(focusLedgerBlueprint, PRESET, linux)
    const packaging = task(documents["TASKS.md"], "TASK-10-PACKAGING")
    expect(packaging).toContain("packaging.rs holds the runtime wiring check")
    expect(packaging).toContain("`./scripts/package_linux.sh`")
  })

  it("names the typed invoke wrapper and the commands each feature calls", async () => {
    const { documents } = await compilePacket(focusLedgerBlueprint, PRESET, linux)
    const tasks = documents["TASKS.md"]
    expect(task(tasks, "TASK-05-TIMER-CONTROL")).toContain("create_time_entries(input), update_time_entries(id, input)")
    expect(task(tasks, "TASK-09-WEEK-EXPORT")).toContain("write_week_report(path, content)")
    expect(task(tasks, "TASK-09-WEEK-EXPORT")).not.toContain("create_time_entries")
    expect(task(tasks, "TASK-05-TIMER-CONTROL")).toContain("call(command, args)")
  })

  it("requires an injected clock where declared data carries date-times", async () => {
    const { documents } = await compilePacket(focusLedgerBlueprint, PRESET, linux)
    expect(task(documents["TASKS.md"], "TASK-05-TIMER-CONTROL")).toContain("injected clock")
  })

  it("writes no network, credential, or provider text for an offline app", async () => {
    const { documents } = await compilePacket(focusLedgerBlueprint, PRESET, linux)
    const all = `${documents["TRD.md"]}\n${documents["AGENTS.md"]}\n${documents["ARD.md"]}`
    expect(all).not.toMatch(/reqwest|provider bodies|network, credential|CON-PERMISSION-NETWORK/)
    expect(documents["TRD.md"]).toContain("Standalone local application")
  })
})
