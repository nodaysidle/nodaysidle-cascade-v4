# Plan 006: A failed review keeps the compiled packet, and every failure names its service

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the
> expected result before moving on. If anything in "STOP conditions" occurs, stop and report — do not improvise.
> If a reviewer dispatched you, the reviewer maintains `plans/README.md`; otherwise update this plan's row there.
>
> **Drift check (run first)**: `git diff --stat d77242f..HEAD -- src/pipeline.ts src/state.ts src/app.ts src/cli.ts`
> Any change there: compare the excerpts below with the live code; on a mismatch, STOP.

## Status

- **Priority**: P2 · **Effort**: M · **Risk**: MED (touches the pipeline result and the app state machine)
- **Depends on**: none (independent of 004 and 005) · **Category**: bug
- **Planned at**: commit `d77242f`, 2026-11-11

## Why this matters

Generating a packet uses three paid services in order: TypeSafe Jev (preflight), DeepSeek (the blueprint), and
Claude (review and repair of the compiled packet). When the Claude call fails (network, rate limit, a bad
key), the pipeline throws away the packet that DeepSeek and the local compiler had already produced and paid
for, and the user must start over. The error shown says "The provider request ..." for all three services, so
the user cannot tell which key or service failed.

## Current state

`src/pipeline.ts:364-384` (inside `generatePacket`; `result` is the gate-clean compile result):

```ts
          const reviewed = await runReviewAndRepairLoop({
            packet: result.packet,
            ...
            reviewProvider,
            kitBuilder,
          })
          return withRepair({ ...result, packet: reviewed.packet, repair: reviewed.repair }, repairedIssues)
        } catch (error) {
          const failure = cancelled(input)
            ? { kind: "cancelled", classification: "cancelled" } as const
            : normalizeProviderFailure(error)
          return withRepair(failureResult(failure.kind === "cancelled" ? "cancelled" : "provider-failure", [providerIssue(failure)], failure, result.jev), repairedIssues)
        }
```

`src/pipeline.ts:284-291`:

```ts
function failureResult(status, issues, failure?: ProviderFailure, jev?: JevReport): GeneratePacketResult {
  return { status, exportable: false, issues, ...(failure ? { failure } : {}), ...(jev ? { jev } : {}) }
}
```

`src/pipeline.ts:265-282` `providerIssue(failure)` builds the message from a table whose every entry starts
"The provider ..." (for example `http: "The provider rejected the request."`) and returns
`{ path: "$provider", rule: `provider.${failure.classification}`, message }`. It shows only an HTTP status
number and an allowlisted code, never a body or a key; keep that property.

`src/state.ts:117-120`:

```ts
    case "generation-failed":
      return { ...state, status: action.status, activeRequestId: undefined, packet: undefined, ledger: [], issues: action.issues, failure: action.failure, jev: action.jev, repairedIssues: action.repai...
    case "generation-succeeded":
      return { ...state, form: { ...state.form, apiKey: "", jevApiKey: "", anthropicApiKey: "" }, status: "gate-clean", progress: action.packet.repair ? "review-again" : "export-gate", ...
```

`src/app.ts:689` dispatches `generation-succeeded` with `packet, jev, repairedIssues, blueprint`; line 693
dispatches `generation-failed`. Find where the app renders the verdict (search `src/app.ts` for `agentReady`
and `Not ready`) before you design the notice.

`src/cli.ts:78-89` exits 1 unless `result.status === "gate-clean"`, then prints `Gate Clean: <path>` and the verdict.

Conventions: vitest; pipeline tests live in `tests/pipeline.test.ts` and `tests/review-tool.test.ts` (the
"pipeline review, repair, kit build, and manifest replay" block at line 135 shows how to pass a fake
`reviewProvider`). Repository rules: failing test first; never delete or loosen an existing assertion; commit
locally only, never push; no API keys and no paid calls; never print or log a key or a request body.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| Tests | `npm test` | exit 0 |
| Frontend build | `npm run build` | exit 0 |

## Scope

**In scope**: `src/pipeline.ts`, `src/state.ts`, `src/app.ts`, `src/cli.ts`, `tests/pipeline.test.ts`,
`tests/review-tool.test.ts`.

**Out of scope**: `src/review.ts`, `src/provider.ts`, `src/jev.ts`, `src-tauri/**`, `src/style.css` (reuse an
existing notice or status class), the retry behaviour of any provider.

## Git workflow

Branch `advisor/006-keep-packet-when-review-fails`. One commit per step. Message style: `fix(pipeline): ...`.
Never push, no pull request.

## Steps

### Step 1: Failing tests

1. Pipeline: with a `reviewProvider` whose `review` rejects with `{ kind: "http", httpStatus: 529 }`, the
   result has `status: "gate-clean"`, a defined `packet`, `exportable: true`, no `repair`, and a new field
   `reviewFailure` with `service: "claude-review"` and the normalized failure. The same when `fix` rejects in round 1.
2. Pipeline: when the run is cancelled during review, the result is still `status: "cancelled"` with no packet.
3. Pipeline: a DeepSeek failure produces an issue whose message names DeepSeek, a Jev failure one that names
   TypeSafe Jev, and a review failure one that names the Claude review (find the existing tests for those
   failures and extend them; do not weaken what they assert).
4. State: after `generation-succeeded` with a `reviewFailure`, the state holds the packet, is exportable, the
   three key fields are cleared, and the state carries the review failure so the app can show it.

**Verify**: the new tests fail, existing tests pass.

### Step 2: Keep the packet

In the `catch` at `src/pipeline.ts:379`: when the run was not cancelled, return the gate-clean `result`
unchanged (the unreviewed packet, no `repair`) plus `reviewFailure: { service: "claude-review", failure }` and
the issue from `providerIssue(failure)` so the ledger shows what happened. Add the optional field to
`GeneratePacketResult`. A cancelled run keeps today's behaviour.

**Verify**: tests 1 and 2 pass.

### Step 3: Name the service

Give `providerIssue` a second parameter for the service (`"deepseek" | "typesafe-jev" | "claude-review"`) and
start the message with the service's name ("DeepSeek: ...", "TypeSafe Jev: ...", "Claude review: ...") in
place of the anonymous "The provider". Pass the right service at every call site (`grep -n "providerIssue(" src/`).
Keep the rule ids and the no-body, no-key property unchanged.

**Verify**: test 3 passes; `grep -rn "The provider " src/pipeline.ts` shows no user-facing message without a service name.

### Step 4: Show it

- `src/state.ts` and `src/app.ts`: carry `reviewFailure` through `generation-succeeded` and render one notice
  where the verdict normally appears: `Not reviewed: the Claude review failed (<the issue message>). The packet
  is the compiler's output and can be exported; no verdict was given.` Reuse an existing class.
- `src/cli.ts`: after `Gate Clean: ...` print `Verdict: none (review failed: <the issue message>)` and keep exit code 0.

**Verify**: test 4 passes; `npm run typecheck`, `npm test`, `npm run build` exit 0.

## Test plan

Tests as listed in Step 1, modelled on the fake-provider tests at `tests/review-tool.test.ts:252-357`.

## Done criteria

- [ ] `npm run typecheck`, `npm test`, `npm run build` exit 0; the new tests exist and pass
- [ ] A review failure no longer returns `status: "provider-failure"` (covered by test 1)
- [ ] `git diff --stat d77242f` lists only in-scope files; nothing pushed
- [ ] No message, log line or test output contains a key or a request body

## STOP conditions

- An excerpt in "Current state" does not match the live code.
- The app's export path (`src/app.ts`, `src-tauri/`) refuses a packet without a `repair` record. Report where.
- An existing test asserts that a review failure discards the packet: report it; the owner decides.
- A verification fails twice after a reasonable fix.

## Maintenance notes

- An unreviewed packet must never be shown as "agent-ready": the notice says "no verdict" on purpose.
- A natural follow-up is a "Review again" button that reruns only the review on the kept packet. Not in this plan.
- The CLI DeepSeek call still has no timeout of its own (`src/provider.ts`); separate small finding.
