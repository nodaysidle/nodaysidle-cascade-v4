import { describe, expect, it } from "vitest"
import { compilePacket } from "../src/compiler"
import { expenseLogBlueprint } from "./fixtures/tauriExpense"
import { focusLedgerBlueprint } from "./fixtures/tauriFocus"

const PRESET = "tauri2-rust-typescript-desktop"
const linux = { linuxPackaging: "appimage", wayland: true } as const

const task = (tasks: string, id: string): string => tasks.split("### ").find(block => block.startsWith(id)) ?? ""
const kitFile = (packet: Awaited<ReturnType<typeof compilePacket>>, name: string): string => packet.kit.find(file => file.name === `kit/${name}`)?.content ?? ""

describe("Tauri expense log: recovery, form ownership, and boilerplate", () => {
  it("reaches Gate Clean", async () => {
    expect((await compilePacket(expenseLogBlueprint, PRESET, linux)).failures).toEqual([])
  })

  it("follows the declared failureRecovery of the list feature for the launch load", async () => {
    const tasks = (await compilePacket(expenseLogBlueprint, PRESET, linux)).documents["TASKS.md"]
    const list = task(tasks, "TASK-04-EXPENSE-LIST")
    expect(list).toContain("the single message shown when that load fails, a notice given after the declared fallback has run, with no retry control")
    expect(list).not.toContain("retry action that repeats the load")
    expect(list).toContain("fallback: on a failed command apply the stated fallback automatically")
    // The writing features declared retry, so their own commands offer it.
    expect(task(tasks, "TASK-05-ADD-EXPENSE")).toContain("retry: on a failed command leave the stored and shown state as it was")
    // A retry list feature keeps the retry action on its load.
    const retry = structuredClone(expenseLogBlueprint)
    retry.features[0]!.failureRecovery = "retry"
    expect(task((await compilePacket(retry, PRESET, linux)).documents["TASKS.md"], "TASK-04-EXPENSE-LIST")).toContain("with a retry action that repeats the load")
  })

  it("has the add task build the fields and the choice picker, and the first task only the shell", async () => {
    const tasks = (await compilePacket(expenseLogBlueprint, PRESET, linux)).documents["TASKS.md"]
    expect(task(tasks, "TASK-04-EXPENSE-LIST")).toContain("You build only the Add button and the empty shell, no field input, no Edit button, and no Delete button")
    const add = task(tasks, "TASK-05-ADD-EXPENSE")
    expect(add).toContain("amount (number), category (text), spent_on (date)")
    expect(add).toContain("opens with its initial option selected (Expense category: Food, Rent, Travel, Other; initially Other)")
    const edit = task(tasks, "TASK-06-EDIT-EXPENSE")
    expect(edit).toContain('mount it into slots.host("detail-actions")')
    expect(edit).toContain("every choice picker set to the stored option, not the list's initial one")
    expect(edit).toContain("reuse the form fields and validation that the add task exports")
  })

  it("preselects the stored option in the edit feature's Choices line", async () => {
    const { documents } = await compilePacket(expenseLogBlueprint, PRESET, linux)
    expect(documents["PRD.md"]).toContain("Expense category: Food, Rent, Travel, Other; initially Other")
    expect(documents["PRD.md"]).toContain("initially the stored value of the record being edited")
  })

  it("drops boilerplate that no declared field asks for", async () => {
    const { documents } = await compilePacket(expenseLogBlueprint, PRESET, linux)
    const all = Object.values(documents).join("\n")
    expect(all).not.toContain("streak")
    expect(all).not.toContain("elapsed time")
    expect(all).not.toContain("null only to clear an optional field")
    expect(all).not.toContain("rebuild path")
    expect(all).not.toContain("longer than the view is wide")
    expect(all).not.toContain("long text")
    expect(all).not.toContain("call invoke()")
    expect(documents["TRD.md"]).toContain("Validation: create and update return AppError invalid for an empty or whitespace-only required text field (category; Rust stores the value as given, so the form trims every text input before it validates and sends the trimmed value), a date (spent_on) that is not a real YYYY-MM-DD calendar day")
    expect(task(documents["TASKS.md"], "TASK-04-EXPENSE-LIST")).toContain("(today's local date)")
    // Free text keeps the long-text launch check.
    const notes = await compilePacket(focusLedgerBlueprint, PRESET, linux)
    expect(notes.documents["TRD.md"]).toContain("longer than the view is wide")
  })

  it("names the injected dependencies once so a test can inject a failing call", async () => {
    const tasks = (await compilePacket(expenseLogBlueprint, PRESET, linux)).documents["TASKS.md"]
    expect(task(tasks, "TASK-05-ADD-EXPENSE")).toContain("Export one factory taking its dependencies as a single object: call (the src/api.ts function), errors (the banner object that src/main.ts exports, made by createErrorBanner in src/errors.ts), the shared view state (the store), now")
  })

  it("wires the lifecycle owner into run() and sets the Wayland desktop entry from the option", async () => {
    const packet = await compilePacket(expenseLogBlueprint, PRESET, linux)
    expect(task(packet.documents["TASKS.md"], "TASK-03-LIFECYCLE-COORDINATOR")).toContain("exit in the RunEvent::Exit arm")
    expect(kitFile(packet, "scripts/package_linux.sh")).toContain("Exec=env GDK_BACKEND=wayland $INSTALL_DIR/bin/$SLUG.AppImage")
    const plain = await compilePacket(expenseLogBlueprint, PRESET, { linuxPackaging: "appimage", wayland: false })
    expect(kitFile(plain, "scripts/package_linux.sh")).not.toContain("GDK_BACKEND=wayland $INSTALL_DIR")
  })
})

describe("Tauri timer app: no slots for controls nobody builds", () => {
  it("builds no add-entry control or form shell when the timer drives its records itself", async () => {
    const tasks = (await compilePacket(focusLedgerBlueprint, PRESET, linux)).documents["TASKS.md"]
    const first = task(tasks, "TASK-05-TIMER-CONTROL")
    expect(first).not.toContain("an add-entry control")
    expect(first).not.toContain("The entry form is one shell")
    // The timer and its editing feature need no row control, so the slot is not built.
    expect(first).not.toContain("a per-row action area")
    expect(first).toContain("a running activity stays running until its stop is saved")
    // The shortcut toggle has no form or row control; the editing feature owns the edit form.
    const shortcut = task(tasks, "TASK-06-SHORTCUT-TOGGLE")
    expect(shortcut).toContain("(no named slot: your own controls, if any")
    expect(shortcut).not.toContain("build the edit form in your own file")
    // Round 12: totals narrow nothing, so they render in the summary host, not the filter area.
    expect(task(tasks, "TASK-07-TODAY-TOTALS")).toContain('(the "summary" host)')
    expect(task(tasks, "TASK-08-ENTRY-EDITING")).toContain("build the edit form in your own file")
    // Round 10: a whole-list export mounts into the actions host the first main task exposes.
    expect(task(tasks, "TASK-09-WEEK-EXPORT")).toContain('(the "actions" host')
  })

  it("states the local-time export rule once, in the document command", async () => {
    const trd = (await compilePacket(focusLedgerBlueprint, PRESET, linux)).documents["TRD.md"]
    expect(trd.match(/the one time rule for every exported file/g)).toHaveLength(1)
    expect(trd).toContain("converted to local time only for display")
  })

  it("asks for a clock only for the timestamps the timer stamps", async () => {
    const tasks = (await compilePacket(focusLedgerBlueprint, PRESET, linux)).documents["TASKS.md"]
    expect(task(tasks, "TASK-05-TIMER-CONTROL")).toContain("(the timestamps it stamps)")
    expect(task(tasks, "TASK-07-TODAY-TOTALS")).not.toContain("injected clock")
  })
})
