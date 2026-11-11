# Plan 001: Waybar and Tauri packets state the three things an independent audit found missing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat cff338d..HEAD -- src/waybarContracts.ts src/tauriContracts.ts src/tauriKit.ts tests/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (changes text that ships in every Waybar and Tauri packet, and two Tauri starter-kit files)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `cff338d`, 2026-11-11

## Why this matters

Cascade V4 compiles an app idea into a packet: five Markdown documents (`PRD.md ARD.md TRD.md TASKS.md AGENTS.md`)
plus a starter kit, which a coding agent then builds from. A packet is "agent-ready" only when an agent can build
it without guessing. Independent audits of two exported packets (Swap Meter, Waybar preset; Snippet Vault, Tauri
preset) found three blocking gaps, each caused by text the compiler writes (or fails to write), not by the idea:

1. **Waybar**: an acceptance criterion gave `/proc/meminfo` names with byte-sized numbers ("SwapTotal 8000000000"),
   while the TRD and the kit say the file's lines are kB multiplied by 1024. An agent that writes those numbers
   into a meminfo fixture gets a failing test and may "fix" the kit by removing the multiplication.
2. **Tauri**: an acceptance criterion requires a success message ("After a successful save the app shows
   'Snippets saved.'") but no task says where a success message goes. The kit's only message element is the
   error banner.
3. **Tauri**: no task may edit `src/style.css`, and the kit ships no helper or class for a form field, a detail
   view, or text that keeps its line breaks, although the documents require all three.

After this plan, the compiler states each of these once, deterministically, for every Waybar and Tauri packet.
No product name appears in the fix.

## Current state

All excerpts below were read at commit `cff338d`.

### Files

- `src/waybarContracts.ts` — everything the Waybar preset states once: units, system sources, provider notes.
- `src/tauriContracts.ts` — builds the Tauri task prompts (`tauriTaskPrompt`) and the slot sentence.
- `src/tauriKit.ts` — the Tauri starter-kit files as TypeScript template literals (`UI_TS`, `UI_TEST_TS`,
  `STYLE_CSS`) and the kit README (`tauriKitReadme`).
- `tests/*.test.ts` — vitest tests that compile fixture blueprints with `compilePacket` and assert on the text.

### Waybar: the system source line

`src/waybarContracts.ts:27-33`:

```ts
interface SourceFacts {
  readonly path: string
  readonly reading: string
  readonly kit: string
  // True when the reading is a size or rate, so the units rules and src/platform/units.rs apply.
  readonly sizes: boolean
}
```

`src/waybarContracts.ts:40-41` (two entries of `WAYBAR_SYSTEM_SOURCES`; each is one long line, shortened here):

```ts
  memory: { path: "/proc/meminfo (file overridable with the MODULE_MEMINFO_PATH ...", reading: "MemTotal and MemAvailable (kB lines, multiplied by 1024 to bytes): totalBytes = MemTotal, freeBytes = MemAvailable (never MemFree), usedBytes = totalBytes - freeBytes", kit: "MemoryReader", sizes: true },
  swap: { path: "/proc/meminfo (file overridable with the MODULE_MEMINFO_PATH ...", reading: "SwapTotal and SwapFree (kB lines, multiplied by 1024 to bytes): totalBytes = SwapTotal, usedBytes = totalBytes - SwapFree (swap, never MemTotal or MemAvailable, which are RAM). A machine without swap ... never a division by zero", kit: "SwapReader", sizes: true },
```

`src/waybarContracts.ts:73-79`:

```ts
// The interface-contract line for a feature that reads a system source.
export function waybarSourceDetail(source: SystemSource): string[] {
  if (source === "none") return []
  const facts = WAYBAR_SYSTEM_SOURCES[source]
  const counter = RATE_SOURCES.has(source)
  return [`System source: ${facts.path}, read through the SystemReader trait in src/platform/system_source.rs (kit; implementation ${facts.kit}); the reading is ${facts.reading}.${counter ? ` A counter that goes backwards (reset or interface change) counts as a change of 0 for that sample and replaces the stored sample. ${WAYBAR_RATE_RULE}` : ""} Every field the reading stores comes from the file or call named here; a stored field this line does not name is never read from the system. A failed read is a failed refresh.`]
}
```

The kit (in `src/waybarKit.ts`, do not change it) defines the reader results as
`pub struct MemoryUse { pub total_bytes: u64, pub used_bytes: u64 }` and
`pub struct SwapUse { pub total_bytes: u64, pub used_bytes: u64 }`, and the trait as
`pub trait SystemReader { type Reading; fn read(&self) -> Result<Self::Reading, String>; }`.

### Tauri: the feature task prompt

In `src/tauriContracts.ts`, `tauriTaskPrompt(input)` builds `lines: string[]`. Inside `if (input.kind === "feature") {`:

- `src/tauriContracts.ts:267` starts `if (input.slots === "first") {`. Its first `lines.push(...)` (line 275) is one
  long template string that begins
  `` `Build the shared view state with createStore from src/store.ts (kit) and export it from your file: its shape is { ${keys.join(", ")} }`` ``
  and ends
  `` `Sort the rows yourself, never by the command's order (list commands return descending id): by the field and direction the PRD states, ties broken by id in the same direction.`)`` ``.
  Line 276 is the second push, beginning `` lines.push(`${shell}${detail}You also own the one load of every record list at launch ``.
- `src/tauriContracts.ts:338-345` is an if / else-if chain that ends with (line 345, one long line, shortened):

```ts
    } else lines.push(`Declared failure recovery: ${[...failures].map(...).join("; ")}. Show every failure message the PRD states for your feature exactly as written, through errors.show(message) (or where the feature places it: in the form, in the row, the status area, or the confirmation), never through errors.report(): the PRD's fixed strings win over the AppError message, which a rejected call carries and you ignore.${writeNotice}`)
    const dialogs = input.features.filter(feature => feature.userFileAccess !== "none")
```

- `input.slots` is `"first"` (this task builds the main screen), `"later"` (it mounts into that screen), or
  `undefined`. `input.slotHosts` (first task only) is the list of host names; it always starts with `"status"`
  (`src/compiler.ts:1420-1425`, function `tauriSlotHosts`, returns `["status", ...]`).
- The kit's slots (file `src/store.ts` inside the kit; do not change) work like this:
  `host(name)` returns one `div` per name, and `mount(name, ...children)` appends children to that host.
- The kit's error banner (`src/errors.ts` inside the kit; do not change) is a `div` with `role="alert"`; it has
  no success variant.

### Tauri: the kit building blocks

`src/tauriKit.ts:327` starts `` const UI_TS = `// Small building blocks for screens that look native. ``. It is a
**JavaScript template literal**: inside it a backtick is written `` \` `` and `${` is written `\${`.
`src/tauriKit.ts:371-378` (inside `UI_TS`):

```ts
/** Long text in a list, cut to a few lines with an ellipsis; the full text shows on hover. */
export const clampedText = (text: string, lines: 2 | 3 = 2): HTMLElement => {
  const element = document.createElement("p")
  element.className = \`clamp-\${lines}\`
  element.textContent = text
  element.title = text
  return element
}
```

Directly after it comes the doc comment of `confirmDialog`. Further down (line 412) is the line
`let nextControlId = 0`; everything from that line on is **cut out of the kit** when the packet has no settings
(`withoutSettingsUi`, line 323), so new helpers must be placed **before** it.

`src/tauriKit.ts:462-464` (start of `UI_TEST_TS`, also a template literal):

```ts
const UI_TEST_TS = `// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"
import { button, clampedText, confirmDialog, emptyState, setEnabled, settingsGroup, settingsRow, switchControl } from "../src/ui"
```

and its last test (lines 504-510):

```ts
  it("clamps long text and keeps the full text on hover", () => {
    const text = clampedText("A long prompt that goes on and on.", 3)
    expect(text.className).toBe("clamp-3")
    expect(text.title).toBe("A long prompt that goes on and on.")
  })
})
`
```

`src/tauriKit.ts:110-112` shows why two substrings must survive unchanged:

```ts
    { path: "src/style.css", content: uses.settings ? STYLE_CSS : STYLE_CSS.replace(/\.settings \{[\s\S]*?\n(?=button:focus-visible)/, "") },
    { path: "tests/kit.test.ts", content: KIT_TEST_TS },
    { path: "tests/ui.test.ts", content: uses.settings ? UI_TEST_TS : UI_TEST_TS.replace(", settingsGroup, settingsRow, switchControl", "").replace(/  it\("names every settings control[\s\S]*?\n  \}\)\n\n/, "") },
```

`src/tauriKit.ts:589-593` (inside `STYLE_CSS`):

```css
.clamp-2 { -webkit-line-clamp: 2; }
.clamp-3 { -webkit-line-clamp: 3; }
.muted { color: var(--text-2); }

.settings { display: flex; flex-direction: column; gap: 22px; max-width: 620px; margin: 0 auto; }
```

`src/tauriKit.ts:162-163` (inside `tauriKitReadme`, two array entries; the first is one long template string):

```ts
    `- Screens are built from src/ui.ts and the classes in src/style.css, never from unstyled elements: button() is sized to its label (primary for the one main action); toolbar() holds a search field and actions; setEnabled() disables a command until it has something to act on (Edit, Delete, Copy with nothing selected); emptyState(title, hint) fills an empty list with one centered message saying how to fill it; list rows use .row with aria-selected for the selection and clampedText() so long text is cut to a few lines with the full text on hover, never a scroll area inside a scrolling list; ${uses.settings ? "settings are ... a footnote under the group; " : ""}body text uses the system font, and monospace only for code.`,
    "- src/style.css uses the system font and light and dark system colors; the page never scrolls, and .app-content scrolls inside the window.",
```

The kit's content security policy (`src/tauriKit.ts:1425`) contains `style-src 'self'`.

### Conventions to match

- Tests: vitest, one file per topic in `tests/`, compile a fixture and assert with `toContain`. Exemplars:
  `tests/waybar-round6.test.ts` lines 1-17 (the `withSource(source)` helper built on `freeSpaceBlueprint` from
  `./fixtures/waybarSources`, the `kit(packet, name)` and `task(packet, id)` helpers) and
  `tests/round10-slots.test.ts` (its `load("tauri-contact-book-csv.json")` helper; that fixture has a feature
  with `"userFileAccess": "saves"`), and `tests/tauri-audit4.test.ts` lines 1-8 (the `kitFile` helper).
- Repository rules (from the owner's `docs/HANDOFF.md`): write a test that fails first; fix the shared code once
  with **no special case for a product name**; do not weaken or delete a check or an assertion that protects
  document quality; commit locally only, **never push**; never edit the exported packet folders under
  `/home/arch/dev/nodaysidle/<packet-name>/` (read only).
- This plan needs **no API key and no network API call**. Do not run `cascade generate`, `npm run probe:live`,
  or anything that calls DeepSeek, TypeSafe, or Anthropic. Never print environment variables.
- No semicolons, double quotes, 2-space indent, as in the surrounding code.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install (fresh worktree) | `npm ci` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0, no errors |
| One test file | `npx vitest run tests/packet-audit-gaps.test.ts` | all pass |
| All tests | `npm test` | exit 0 (baseline at `cff338d`: 486 passed, 19 skipped) |
| Recompile a saved packet | `npm run -s cascade -- compile --preset <id> --blueprint <packet>/blueprint.json --option k=v --out <dir>` | prints `Compiled: <dir>/<slug>` |
| Tauri kit build test (slow, cargo) | `CASCADE_KIT_BUILD=1 npx vitest run tests/tauri-focus-build.test.ts` | all pass |

## Scope

**In scope** (the only files you should modify):

- `src/waybarContracts.ts`
- `src/tauriContracts.ts`
- `src/tauriKit.ts`
- `tests/packet-audit-gaps.test.ts` (create)
- An existing file under `tests/` **only** to update an assertion that fails solely because this plan added
  text (see STOP conditions for the limit).

**Out of scope** (do NOT touch):

- `src/waybarKit.ts`, `src/kits.ts`, `src/compiler.ts`, `src/presets.ts`, `src/review.ts`, `src/audit.ts`,
  `src-tauri/**`, `scripts/**`, `docs/**`, `README.md`, `plans/**`.
- `WAYBAR_PROVIDER_NOTES` in `src/waybarContracts.ts` and `providerNotes` in `src/presets.ts`: these are sent
  to the paid provider; a change there cannot be verified without paid runs.
- The `reading` strings of `WAYBAR_SYSTEM_SOURCES`: a saved packet replays recorded text edits that search for
  parts of them, so they must stay byte-identical.
- The exported packets in `/home/arch/dev/nodaysidle/swap-meter` and `/home/arch/dev/nodaysidle/snippet-vault`:
  read them, never write them.

## Git workflow

- Branch: `advisor/001-waybar-tauri-audit-gaps` (create it in your worktree).
- One commit per step group (Waybar, Tauri success message, Tauri building blocks). Message style from
  `git log`: `fix(waybar): allow valueDecimals on unitless readings such as load average`.
- Do NOT push and do NOT open a pull request.

## Steps

### Step 0: Baseline

Run `npm ci`, then `npm run typecheck` and `npm test`.

**Verify**: typecheck exits 0; `npm test` exits 0 with 486 passed (skipped tests are env-gated and expected).

### Step 1: Write the failing tests

Create `tests/packet-audit-gaps.test.ts` with three `describe` blocks. Copy the helper style from the exemplar
files named above (do not import helpers from other test files; redefine the few lines you need).

1. **Waybar acceptance figures** (preset id `"linux-hyprland-waybar-module"`, blueprint
   `withSource("swap")` and `withSource("memory")` built as in `tests/waybar-round6.test.ts`):
   - swap TRD contains `Acceptance figures: a number an acceptance criterion gives for SwapTotal or SwapFree is a byte count`
   - swap TRD contains `SwapUse { total_bytes: SwapTotal, used_bytes: SwapTotal - SwapFree }`
   - memory TRD contains `MemoryUse { total_bytes: MemTotal, used_bytes: MemTotal - MemAvailable }`
   - a `withSource("load-average")` TRD does **not** contain `Acceptance figures:`
   - swap TRD still contains `A failed read is a failed refresh.` and `packet.failures` equals `[]` for all three.
2. **Tauri success message** (preset id `"tauri2-rust-typescript-desktop"`, fixture
   `tests/fixtures/tauri-contact-book-csv.json` loaded as in `tests/round10-slots.test.ts`). Find the first
   main task and the save-to-file task by splitting `TASKS.md` on `### ` (the save task is the block that
   contains `save() of @tauri-apps/plugin-dialog`; the first main task is the block that contains
   `You are the first main-surface task`):
   - the save task contains `mount it into slots.host("status") from src/main.ts with slots.mount`
   - the save task contains `it never goes through errors.show`
   - the first main task contains `never replace or clear the other children of that host`
   - `packet.failures` equals `[]`.
3. **Tauri building blocks** (same packet):
   - kit file `src/ui.ts` contains `export const field`, `export const panel`, `export const multilineText`
   - kit file `src/style.css` contains `.pre-wrap { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }`
   - kit file `tests/ui.test.ts` contains `multilineText(` and does not contain `settingsGroup` when the packet
     has no settings data (check `kitFile(packet, "src/ui.ts")` does not contain `settingsGroup` first; if this
     fixture has settings, drop only this one negative assertion)
   - kit file `README.md` contains `multilineText(text)` and `No task edits src/style.css`
   - the save task and the first main task both contain `no task edits src/style.css`.

**Verify**: `npx vitest run tests/packet-audit-gaps.test.ts` → the file runs and the new assertions FAIL
(the helpers and fixtures load without error; failures are `toContain` mismatches only).

### Step 2: Waybar — say what unit an acceptance number is in

In `src/waybarContracts.ts`:

1. Add to `interface SourceFacts`:

```ts
  // For a source whose file is not in bytes: how a number in an acceptance criterion maps to the reader's result.
  readonly figures?: string
```

2. Add a `figures` property to the `memory` and `swap` entries of `WAYBAR_SYSTEM_SOURCES` (leave `path`,
   `reading`, `kit`, `sizes` byte-identical). Use exactly these texts:

   memory:
   `Acceptance figures: a number an acceptance criterion gives for MemTotal or MemAvailable is a byte count, the value after the kB line was multiplied by 1024, never a count of kB. The focused test of a feature injects those bytes through a SystemReader test double (MemoryUse { total_bytes: MemTotal, used_bytes: MemTotal - MemAvailable }) and never copies them into a meminfo fixture; a meminfo fixture file states kB (the byte count divided by 1024) and is used only by a test that reads the file format. The factor 1024 is how the kernel defines the kB of /proc/meminfo and only converts that file to bytes; every size the module shows still follows the decimal SI units rule.`

   swap: the same text with `MemTotal or MemAvailable` → `SwapTotal or SwapFree` and the double
   `(SwapUse { total_bytes: SwapTotal, used_bytes: SwapTotal - SwapFree })`.

3. In `waybarSourceDetail`, append the figures after the last sentence, so the template ends
   `` A failed read is a failed refresh.${facts.figures ? ` ${facts.figures}` : ""}` ``.

**Verify**: `npx vitest run tests/packet-audit-gaps.test.ts -t "Waybar"` → Waybar block passes;
`npx vitest run tests/waybar-round6.test.ts tests/waybar-battery.test.ts tests/waybar-memory.test.ts` → all pass.

Commit: `fix(waybar): state that acceptance numbers for meminfo sources are bytes injected through the reader double`

### Step 3: Tauri — give a stated success message a place

In `src/tauriContracts.ts`, inside `tauriTaskPrompt`, `input.kind === "feature"`:

1. In the `if (input.slots === "first") {` block, directly after the first `lines.push(...)` (the one ending
   `ties broken by id in the same direction.`) and before the push that starts `${shell}${detail}`, add:

```ts
      if ((input.slotHosts ?? []).includes("status")) lines.push('slots.host("status") is also an extension point: a later task mounts there the confirmation text of its own successful command. Render your own status messages (the empty state, a no-match message) inside one child element that you create and own, and never replace or clear the other children of that host.')
```

2. Change the final `else lines.push(...)` of the chain at lines 338-345 into a block that keeps the existing
   push unchanged and adds one more push after it, only when `input.slots` is `"first"` or `"later"`:

   for `"first"`:
   `A message the PRD or an acceptance criterion states for a successful command of your feature (a confirmation, not a failure) is the one other message you show: show its exact text in your status area after the command succeeds and remove it when the feature's next command starts, unless the PRD places it elsewhere (in the form or in the row); it never goes through errors.show, whose banner is only for failures. Its focused test asserts the exact text after a success and that it is absent after a failure. When no such message is stated, show nothing after a success.`

   for `"later"`:
   `A message the PRD or an acceptance criterion states for a successful command of your feature (a confirmation, not a failure) is the one other message you show: build one text element in your own file (a p element with role="status"), mount it into slots.host("status") from src/main.ts with slots.mount, set its text to the stated message exactly after the command succeeds, and empty it when the feature's next command starts, unless the PRD places it elsewhere (in the form or in the row); it never goes through errors.show, whose banner is only for failures. Its focused test asserts the exact text after a success and an empty element after a failure. When no such message is stated, build no such element.`

   The other branches of the chain (countdown, local-only) stay exactly as they are.

**Verify**: `npx vitest run tests/packet-audit-gaps.test.ts -t "success"` → passes;
`npm run typecheck` → exit 0.

Commit: `fix(tauri): name the status host as the place of a stated success message`

### Step 4: Tauri — ship the building blocks the screens need

In `src/tauriKit.ts` (remember: `UI_TS`, `UI_TEST_TS`, `STYLE_CSS` are template literals; the code below has no
backtick and no `${`, so it needs no escaping, except `\\n` in the test, which must be typed with two
backslashes so the kit file receives `\n`):

1. In `UI_TS`, directly after the closing `}` of `clampedText` and before the doc comment of `confirmDialog`, add:

```ts
/** One labelled control of a form: the label text above the control, tied to it for screen readers. */
export const field = (label: string, control: HTMLElement): HTMLLabelElement => {
  const element = document.createElement("label")
  element.className = "field"
  const caption = document.createElement("span")
  caption.textContent = label
  element.append(caption, control)
  return element
}

/** A bordered block that groups related content: the detail view of the selected record, or a form. */
export const panel = (...children: HTMLElement[]): HTMLElement => {
  const element = document.createElement("section")
  element.className = "panel"
  element.append(...children)
  return element
}

/** Stored text shown exactly as entered: line breaks and indentation are kept and long lines wrap. */
export const multilineText = (text: string): HTMLElement => {
  const element = document.createElement("p")
  element.className = "pre-wrap"
  element.textContent = text
  return element
}
```

2. In `UI_TEST_TS`, change the import line to (the substring `, settingsGroup, settingsRow, switchControl`
   must stay exactly as it is):

```ts
import { button, clampedText, confirmDialog, emptyState, field, multilineText, panel, setEnabled, settingsGroup, settingsRow, switchControl } from "../src/ui"
```

   and add this test directly after the `clamps long text` test, before the final `})`:

```ts

  it("builds a labelled field, a panel, and text that keeps its line breaks", () => {
    const input = document.createElement("input")
    const labelled = field("Title", input)
    expect(labelled.tagName).toBe("LABEL")
    expect(labelled.className).toBe("field")
    expect(labelled.querySelector("span")?.textContent).toBe("Title")
    expect(labelled.contains(input)).toBe(true)
    const text = multilineText("line one\\n  indented")
    expect(text.className).toBe("pre-wrap")
    expect(text.textContent).toBe("line one\\n  indented")
    expect(panel(labelled, text).className).toBe("panel")
  })
```

3. In `STYLE_CSS`, directly after the line `.muted { color: var(--text-2); }` and before the blank line that
   precedes `.settings {`, add:

```css
.panel { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; padding: 12px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field > span { color: var(--text-2); }
.field > input, .field > select, .field > textarea { width: 100%; }
.pre-wrap { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
```

4. In `tauriKitReadme`, in the long entry that starts `- Screens are built from src/ui.ts`, insert directly
   after `never a scroll area inside a scrolling list; ` (and before `${uses.settings ?`):

   `a form is built from field(label, control) lines, one per input, with the label above its control; the detail view of the selected record and a form shell are each a panel(); stored text that can hold line breaks (a note, a snippet, a description) is shown with multilineText(text), which keeps line breaks and indentation and wraps long lines, and is edited in a textarea; `

   and add a new array entry directly after the entry `"- src/style.css uses the system font ..."`:

   `- No task edits src/style.css: the helpers and classes above cover the screens of this packet. A look they do not cover is set in the feature's own file through single properties of the element's style object (element.style.gap = "8px"); the content security policy (style-src 'self') blocks a style attribute, setAttribute("style", ...), style.cssText and a style element, but not single style properties.`

5. In `src/tauriContracts.ts`, `tauriTaskPrompt`, `input.kind === "feature"`: as the **last** push of the feature
   block for a task whose `input.slots` is `"first"` or `"later"` (place it just before the closing `}` of the
   `if (input.kind === "feature")` block; if that block's end is hard to identify, place it immediately after
   the push added in Step 3.2, inside the same condition), add:

   `Build every screen element with the helpers of src/ui.ts and the classes of src/style.css that the kit README lists (field(label, control) for a form input, panel() for the detail view and a form shell, multilineText(text) for stored text that can hold line breaks); no task edits src/style.css.`

   If you place it inside the Step 3.2 condition, countdown and local-only tasks do not get it; that is
   acceptable, say so in your report.

**Verify**:
- `npm run typecheck` → exit 0
- `npx vitest run tests/packet-audit-gaps.test.ts` → all pass
- `npm test` → exit 0. If an existing assertion fails, read it: when it fails only because this plan added
  text next to the text it checks, update that assertion to the new text; otherwise STOP.

Commit: `fix(tauri): ship field, panel and multilineText in the kit and say no task edits the stylesheet`

### Step 5: Prove it on the two real packets (read-only on the packets)

```bash
OUT=$(mktemp -d)
npm run -s cascade -- compile --preset linux-hyprland-waybar-module --blueprint /home/arch/dev/nodaysidle/swap-meter/blueprint.json --option refreshSeconds=15 --option tooltip=true --out "$OUT/swap"
npm run -s cascade -- compile --preset tauri2-rust-typescript-desktop --blueprint /home/arch/dev/nodaysidle/snippet-vault/blueprint.json --option linuxPackaging=appimage --option wayland=true --out "$OUT/snip"
grep -c "Acceptance figures: a number an acceptance criterion gives for SwapTotal or SwapFree is a byte count" "$OUT/swap/swap-meter/TRD.md"
grep -c 'mount it into slots.host("status") from src/main.ts with slots.mount' "$OUT/snip/snippet-vault/TASKS.md"
grep -c "export const multilineText" "$OUT/snip/snippet-vault/kit/src/ui.ts"
npm run -s cascade -- verify --packet "$OUT/swap/swap-meter"
npm run -s cascade -- verify --packet "$OUT/snip/snippet-vault"
```

If the packet folders do not exist on your machine, skip this step and say so in your report.

**Verify**: both compile commands print `Compiled: ...` (this also proves the recorded repair edits still
replay); the three `grep -c` print a number ≥ 1; both verify commands exit 0.

Then build the recompiled Tauri kit's frontend in the temporary folder:

```bash
cd "$OUT/snip/snippet-vault/kit" && npm install --no-audit --no-fund && npm run typecheck && npm test && npm run build
```

**Verify**: all four exit 0; the `npm test` output includes `builds a labelled field, a panel, and text that keeps its line breaks`
or shows `tests/ui.test.ts` passing.

### Step 6: Full checks

Run `npm run typecheck`, `npm test`, then the slow Tauri kit build test
`CASCADE_KIT_BUILD=1 npx vitest run tests/tauri-focus-build.test.ts` (it compiles Rust; allow up to 20 minutes).

**Verify**: all exit 0. If the kit build test cannot run for an environment reason (missing system library,
no cargo), do not retry more than once: report the exact error instead.

## Test plan

- New file `tests/packet-audit-gaps.test.ts`, three `describe` blocks as listed in Step 1 (Waybar acceptance
  figures; Tauri success message; Tauri building blocks).
- Structural patterns: `tests/waybar-round6.test.ts` (Waybar), `tests/round10-slots.test.ts` and
  `tests/tauri-audit4.test.ts` (Tauri).
- The kit's own `tests/ui.test.ts` gains one test (Step 4.2); it runs when a generated kit is built (Step 5).
- Verification: `npm test` → all pass, including the new file.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; `tests/packet-audit-gaps.test.ts` exists and passes; passed count is at least 486 plus the new tests
- [ ] `grep -c "figures" src/waybarContracts.ts` prints at least 4
- [ ] `git diff cff338d -- src/waybarContracts.ts | grep -c '^[-+].*reading: "'` — every changed line keeps its `reading: "..."` value byte-identical (a `-` line and its `+` line differ only by the added `figures` property)
- [ ] `git diff --stat cff338d` lists only `src/waybarContracts.ts`, `src/tauriContracts.ts`, `src/tauriKit.ts`, and files under `tests/`
- [ ] No assertion was deleted from an existing test file (`git diff cff338d -- tests/ | grep '^-' | grep -c 'expect('` equals the number of assertions you rewrote, each paired with a `+` line)
- [ ] Step 5 commands pass (or the report says the packet folders were absent)
- [ ] Nothing was pushed; the exported packet folders are unchanged

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" does not match the excerpts.
- More than 5 existing assertions fail after your change, or any existing assertion fails for a reason other
  than "this plan added text here". Do not delete assertions and do not loosen a check to get to green.
- A compile in Step 5 fails with `Repair edit replay failed` — it means a change altered text a saved packet
  depends on; report which file and edit.
- `packet.failures` is non-empty for a fixture that was clean before (the compiler's own audit rejected the
  new text). Report the failure rule and message.
- The fix appears to need a file outside the in-scope list (for example `src/compiler.ts` or `src/waybarKit.ts`).
- Any step would need an API key or a paid network call.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- The three texts are compiler output; the app's Claude review and any later independent audit read them.
  A reviewer of this change should read the recompiled `TRD.md` (Waybar) and `TASKS.md` (Tauri) once as a
  coding agent would, and check that no new sentence contradicts an older one in the same task prompt
  (in particular "Show only the failure message of your own commands." next to the new success-message rule).
- Deferred on purpose: telling the provider to state acceptance numbers in bytes (`WAYBAR_PROVIDER_NOTES`).
  It prevents the wording at the source but needs paid runs to verify.
- Deferred on purpose (minor findings of the same audits, none blocking): the export key `snippetText` versus
  the wire key `snippettext` in a save-to-file task; unnamed Rust field types of a Waybar record struct;
  `click(settings, launcher)` having no store parameter; boilerplate sentences that do not apply to a packet
  (delete, HTTP client).
- If a future kit change adds form or detail helpers, keep them before the `let nextControlId = 0` marker in
  `UI_TS` and before `.settings {` in `STYLE_CSS`, or packets without settings lose them.
- "Agent-ready" for a packet is decided only by an independent audit of that exact packet; this plan does not
  establish it. After it lands, recompile the two packets and audit them again.
