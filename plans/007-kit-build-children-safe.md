# Plan 007: Kit build commands run without the API keys, with a time limit and a large enough buffer

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the
> expected result before moving on. If anything in "STOP conditions" occurs, stop and report — do not improvise.
> If a reviewer dispatched you, the reviewer maintains `plans/README.md`; otherwise update this plan's row there.
>
> **Drift check (run first)**: `git diff --stat d77242f..HEAD -- src/review-wire.ts src-tauri/src/export.rs scripts/agent-ready/fix.ts`
> Plan 004 may have changed imports in `scripts/agent-ready/fix.ts`. Any other change: compare the excerpts
> below with the live code; on a mismatch, STOP.

## Status

- **Priority**: P2 · **Effort**: M · **Risk**: MED (process handling in Rust and Node)
- **Depends on**: `plans/004-one-repair-implementation.md` (so `scripts/agent-ready/fix.ts` is settled) · **Category**: security, bug
- **Planned at**: commit `d77242f`, 2026-11-11

## Why this matters

After a repair touches the starter kit, Cascade V4 builds the kit to check it still compiles. It does that by
running `npm`, `cargo` or `gradle` on files that a language model just wrote. Three problems:

1. The child processes inherit the whole environment, including the three API keys (`DEEPSEEK_API_KEY`,
   `TYPESAFE_API_KEY`, `ANTHROPIC_API_KEY`). A build script or dependency in a generated kit could read them.
2. There is no time limit. A hung build blocks the pipeline forever, and the app cannot cancel it.
3. In Node, `spawnSync` keeps at most 1 MB of output by default; a noisy build is then killed and reported as
   a failed kit build although nothing was wrong.

## Current state

`src/review-wire.ts:73-81` (Node, used by the CLI):

```ts
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
```

`scripts/agent-ready/fix.ts:178-186` has the same `env` block and the same `spawnSync` call.

`src-tauri/src/export.rs:384-392` (Rust, used by the desktop app, called through `build_packet_kit` in
`src-tauri/src/lib.rs:200-207` inside `spawn_blocking`):

```rust
        for args in commands {
            let command_text = args.join(" ");
            let output = Command::new(args[0])
                .args(&args[1..])
                .current_dir(&work_dir)
                .env("CARGO_TARGET_DIR", &cargo_target_dir)
                .env("TMPDIR", &cache_tmp_dir)
                .env("ANDROID_HOME", &android_home)
                .output();
```

Conventions: Rust tests live next to the code in `src-tauri/src/*.rs` (`#[cfg(test)] mod tests`) and run with
`cargo test` in `src-tauri`; `cargo fmt --check` and `cargo clippy --all-targets -- -D warnings` must stay
clean. No new crate may be added (versions are pinned and tested together). Repository rules: failing test
first; never delete or loosen an existing check; commit locally only, never push; no API keys and no paid
calls; **never print, log or echo the value of an environment variable**, in code, tests or your report.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| Tests | `npm test` | exit 0 |
| Rust | `cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test` | exit 0 |
| Everything | `npm run check` | exit 0 |

## Scope

**In scope**: `src/review-wire.ts`, `scripts/agent-ready/fix.ts` (the `env` and `spawnSync` lines only),
`src-tauri/src/export.rs`, `tests/review-wire.test.ts` (create).

**Out of scope**: the list of build commands per preset (finding H), `src-tauri/src/lib.rs` command
signatures, cancelling a running build from the UI (deferred), `src-tauri/Cargo.toml` (no new dependency).

## Git workflow

Branch `advisor/007-kit-build-children-safe`. One commit per step. Message style: `fix(kit-build): ...`.
Never push, no pull request.

## Steps

### Step 1: Node — a tested environment and spawn options

1. In `src/review-wire.ts` add and export a pure function `kitBuildEnv(base, overrides)` that returns a copy of
   `base` without `DEEPSEEK_API_KEY`, `TYPESAFE_API_KEY`, `ANTHROPIC_API_KEY`, `CASCADE_API_URL`, then applies
   the three overrides (`CARGO_TARGET_DIR`, `TMPDIR`, `ANDROID_HOME`). Export constants
   `KIT_BUILD_TIMEOUT_MS = 20 * 60 * 1000` and `KIT_BUILD_MAX_BUFFER = 64 * 1024 * 1024`.
2. Use them in the `spawnSync` call: `{ cwd, env, encoding: "utf8", timeout: KIT_BUILD_TIMEOUT_MS, maxBuffer: KIT_BUILD_MAX_BUFFER, killSignal: "SIGKILL" }`.
   When `result.error` is set, report it instead of an empty output: for a timeout
   (`result.error.code === "ETIMEDOUT"`) the output text is `timed out after 20 minutes`; for `ENOBUFS` it is
   `the command printed more than 64 MB`.
3. `tests/review-wire.test.ts` (new): `kitBuildEnv` removes the four names and keeps `PATH` and `HOME`; the
   overrides win; the input object is not mutated. Use placeholder values such as `"x"`; never read real keys.
4. `scripts/agent-ready/fix.ts`: import `kitBuildEnv` and the two constants from `../../src/review-wire` and
   use them in its `spawnSync` call the same way.

**Verify**: `npm run typecheck` exit 0; `npx vitest run tests/review-wire.test.ts` passes; `npm test` exit 0.

### Step 2: Rust — scrub the environment

In `src-tauri/src/export.rs` add `.env_remove("DEEPSEEK_API_KEY")`, `.env_remove("TYPESAFE_API_KEY")`,
`.env_remove("ANTHROPIC_API_KEY")`, `.env_remove("CASCADE_API_URL")` to the `Command`. Put the four names in one
`const` array and loop, and add a unit test that the array holds exactly those four names (so a later edit
cannot drop one silently).

**Verify**: `cargo test` in `src-tauri` passes; fmt and clippy clean.

### Step 3: Rust — a time limit

Replace `.output()` with a small helper `run_with_timeout(command: &mut Command, limit: Duration) -> std::io::Result<(std::process::ExitStatus, String)>`
that: redirects stdout and stderr to two files inside the temporary work directory, spawns the child, polls
`try_wait()` every 200 ms until it exits or the limit passes, on timeout calls `kill()` then `wait()` and
returns an error of kind `TimedOut`, and finally reads both files into one string. Use it with a 20 minute
limit (`const KIT_BUILD_TIMEOUT: Duration`). Map a timeout to the same failed-build result the function
already returns for a non-zero exit, with the output text `timed out after 20 minutes`.

Unit tests for the helper (Linux and macOS only, `#[cfg(unix)]`): `sh -c "echo hi; exit 3"` returns status 3
and output containing `hi`; `sh -c "sleep 5"` with a 300 ms limit returns `TimedOut` in well under 5 seconds.

**Verify**: `cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test` → exit 0.

### Step 4: Full check

`npm run check`.

**Verify**: exit 0.

## Test plan

- `tests/review-wire.test.ts` (new): the environment function, as in Step 1.3.
- Rust unit tests in `src-tauri/src/export.rs`: the scrub list and the timeout helper, as in Steps 2 and 3.
- The real kit builds are not run by this plan's tests. If time allows, run
  `CASCADE_KIT_BUILD=1 npx vitest run tests/tauri-focus-build.test.ts` once and report the result (it takes minutes).

## Done criteria

- [ ] `npm run check` exits 0; the new Node test file and the new Rust tests exist and pass
- [ ] `grep -n "\.\.\.process\.env" src/review-wire.ts scripts/agent-ready/fix.ts` prints nothing
- [ ] `grep -c "env_remove\|KIT_BUILD_ENV_SCRUB" src-tauri/src/export.rs` prints at least 1
- [ ] `git diff --stat d77242f` lists only in-scope files; `Cargo.toml` and `Cargo.lock` unchanged; nothing pushed

## STOP conditions

- An excerpt in "Current state" does not match the live code.
- A kit build command genuinely needs one of the four removed variables (report which command).
- The helper cannot be written without a new crate.
- `cargo clippy` fails twice on the new code after a reasonable fix.

## Maintenance notes

- If a fourth paid service is added, its key name must join both lists (Node and Rust); the tests pin the lists.
- Not done here: letting the user cancel a running kit build from the app, and a shared cargo target directory
  between builds.
- The build output saved in `blueprint.json` (`kitBuildError`) can still contain local paths.
