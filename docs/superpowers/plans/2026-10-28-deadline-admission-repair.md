# Queue and turn-deadline repair implementation plan

> Execute inline with executing-plans and test-driven-development. No delegation. The owner authorized implementation and repeated technical validation; no new live run, deployment or publication is included.

**Goal:** Make queued inference, dispatch deadlines, capacity ownership and usage settlement agree across the real legacy/native runtime paths, with clean bounded overload behavior.

**Architecture:** Preserve the existing worker/provider/token/cache limits and original turn deadlines. A new model dispatch needs its full generation allowance plus the existing accounting margin. Waiting does not spend generation time. Expired/ineligible waiters cannot block the queue, and turn expiry cannot release a still-active provider operation. Known final usage is recorded before a late answer is fenced; unknown usage is never cleared or replayed.

**Tech stack:** Node 24, TypeScript, PostgreSQL 17; fresh owned integration fixtures, fake providers and local synthetic HTTP streams.

**Spec/evidence:** Owner's current technical-repair assignment; [fresh live result](../../fresh-admission-half-hour-20261028.md), actual source and sanitized retained evidence. This short plan also records the repair design.

## Constraints and decisions

- Work on the existing master checkouts; preserve the paused worlds, services, identities, commands, schedules, budgets and unknown reservations. E4/KQ1 blocked. No real model calls or GUI.
- Retain the 90/180-second generation and 120/360-second turn bounds, worker/provider caps, weighted cache demand and four-bypass fairness rule. Increasing budgets would hide the defect; replacing fairness with unlimited backfill would create starvation. Hardware throughput and model choices remain research limitations.
- Use a typed, definitely-undispatched admission deferral when a full call no longer fits. Preserve the existing schedule/task retry behavior; do not create extra calls or extend a turn.
- Active capacity belongs to the invocation until it settles. A crashed/uncooperative invocation may require operational confirmation before capacity can be reused; elapsed turn time alone is not that confirmation.
- Record queue elapsed time for both admitted and refused requests without storing prompts. Preserve final usage even when transport cleanup is slow or an answer is too late to execute.
- Review inline and keep private evidence; user instructions override skill suggestions to delegate, create worktrees, seek redundant design approval, commit every step or delete the workspace.

## Review focus

1. Two workers contend while an older waiter expires or loses its fence: no dead queue barrier or over-admission.
2. Waiting, slow preparation, dispatch callbacks and long generation cross different time boundaries: no late dispatch and no hidden deadline extension.
3. A provider returns final usage after cancellation or keeps its transport open: known accounting survives, stale decisions cannot act.
4. Recovery runs while a provider ignores cancellation: its active capacity remains reserved until settlement; another actor cannot reuse it early.
5. A 24-actor burst with mixed request sizes and a long response: bounded slots/cache, successful work or definite deferral, no fabricated success, duplicate effects or unknown usage caused solely by queue expiry.

## Tasks

### Task 1: Correct admission eligibility and capacity ownership

Files: `src/platform/admission.ts`, `src/platform/tasks.ts`, `src/model-bounds.ts`, `src/model-deadline.ts`, `tests/integration/pool-capacity.test.ts`, `tests/unit/model-deadline.test.ts`.

- [x] Add failing regressions for near-deadline admission, an expired four-bypass barrier, cancellation while queued, and expiry recovery while an active provider is still running.
- [x] Implement shared full-call admission eligibility, filter ineligible waiters and keep active leases until invocation settlement. Keep physical and execution caps intact.
- [x] Run the focused units and owned pool integration cases; expected: pass, no inference or retained-world mutation.

### Task 2: Align generation timing, accounting and stream completion

Files: `src/model-deadline.ts`, `src/engine.ts`, `src/platform/admission.ts`, `src/vllm-transport.ts`, relevant deadline/stream/call-metrics tests.

- [x] Reproduce the legacy queue/generation timer mismatch and the stream cleanup/accounting boundary with deterministic clocks or synthetic transports.
- [x] Start tracked generation timing at the dispatch boundary; check the full allowance before dispatch, including slow preparation. Keep opaque invocation accounting conservative. Record refused legacy queue time and native queue outcome diagnostics.
- [x] Correct any reproduced transport/settlement defect without discarding known usage or inventing completion after cancellation.
- [x] Verify complete host paths for success, known late completion, definite non-dispatch and genuine uncertainty. Expected: usage is durable before outcome rejection, no late game effect, no early capacity release.

### Task 3: Composed workload and broad technical acceptance

Files: affected integration suites, new synthetic burst coverage if needed, both current-state documents and repair report.

- [x] Exercise a fresh synthetic 24-actor burst through shared/native/legacy composition with the observed resource mix, and cover all eight native workflows.
- [x] Run full unit suite, full owned integration suite where supported, types/style/build/boundaries and relevant offline controller checks. Inspect every failure; repair in-scope technical failures with reproductions, rerun affected checks, then review the final diff for the five failure classes above.
- [x] Verify the final repaired source with the justified regression selection after any review changes. Record actual coverage and remaining architectural/model limits; never claim absence of all possible bugs.
- [x] Update paired reports and current state. Leave retained world/runtime untouched and distinguish offline acceptance from live qualification.

## Evidence ledger

Private logs and sanitized audits: `.superpowers/sdd/2026-10-28-deadline-admission-repair/`. Source baseline Fleet `c552626`, PACT `fa91bef`. Initial working trees clean. Read-only retained check confirms all 24 cohorts paused. No commits, push or deployment are authorized by this repair record.

## Completion evidence

Completed inline on 28 October 2026. [Paired repair report](../../queue-turn-deadline-repair-20261028.md) records all causes, preserved limits and verification: 1,169 final units; 85 final combined affected integrations; full 798-test discovery followed by repaired-scenario reruns; all 29 frozen protocol cases classified and checked; types/style/build/boundaries and three CPU-only cache checks. The thirteen frozen protocols that reach original call/context limits remain unqualified; their safety-stop tests do not claim successful gameplay. Final inline review covered admission, fencing, capacity ownership, cancellation and accounting. No unresolved critical queue/deadline defect was found in the exercised paths. Deployment and real-provider confirmation remain outside this offline assignment. Both reports/current-state pointers are updated; retained state is unchanged.
