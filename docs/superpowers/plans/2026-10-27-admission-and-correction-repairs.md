# Admission and correction repairs implementation plan

> Execute inline using executing-plans. No delegation, deployment, model calls or game run.

**Goal:** Fix the four controller gaps found in the fresh Nemotron half-hour without relaxing resource, authority, identity or uncertainty checks.

**Architecture:** Keep native quotes and existing durable turn/command accounting authoritative. Use bounded cache backfill and separate execution slots from bounded waiting turns; retain the same turn while waiting. Route known pre-submission validation errors through the existing correction budget.

**Tech stack:** Existing Node 24 / TypeScript / PostgreSQL 17, fake model providers and owned isolated integration fixtures. No dependency additions.

**Spec/evidence:** Owner's current instruction and [fresh run](../../fresh-reliability-half-hour-20261027.md). Read-only investigation established FIFO blocking at 55/92 used blocks, eight workers occupied by inference waits, an unaffordable quoted coordinator option and uncovered goal/capacity validation errors.

## Design and constraints

- Admit the oldest request that fits both slot and weighted budgets. Permit at most four younger admissions to pass an older request; thereafter reserve capacity for the older request. This avoids both strict FIFO blocking and indefinite starvation under unlimited backfill.
- A serial turn awaiting inference may suspend its execution slot, while retaining its original deadline, actor exclusivity, lease/accounting and continuation. Reacquire a slot atomically before inference/continuation. At most one additional waiting turn per configured execution slot can be admitted globally. Do not replace this with unbounded promises or increased active execution/model concurrency.
- Keep sibling parallel work conservative: do not release the parent's execution slot merely because one sibling waits.
- Check the run-window model-start bound while queued, not only after capacity admission. Cancellation/fencing must not dispatch or erase unknown usage.
- Filter native coordinator candidates by aggregated exact resource/authority claims before advertising them. Preserve observation coverage and valid alternatives; do not fabricate affordability or silently alter terms.
- Correct a self-referential goal or an exhausted structured resource claim only before submission and within the existing call budget. Reserve the coordinator call. Preserve unknown commands and never retry them as proposals.
- Inspect the tick-pending path and cover a bounded exact-command retry only after a definitive native non-commit; do not treat arbitrary rejection/transport errors as retryable.
- World/services/provider/settings/old uncertainty remain unchanged. E4/KQ1 remain blocked. No commit/push is authorized in this assignment.

## Review focus

1. Cache safety and large-request fairness while smaller work passes; unknown demand stays conservative.
2. Execution-slot reacquisition, cancellation, fencing, multiple processes and bounded outstanding turns.
3. All-infeasible candidates, duplicate claims and changed capacity between proposal and submit.
4. Corrected and persistently invalid goals/proposals, insufficient remaining calls, and exact usage accounting.
5. Known temporary tick denial versus uncertain dispatch; original command ID and canonical action survive.

## Tasks

- [x] Add failing weighted-queue and worker-admission regressions in `tests/integration/pool-capacity.test.ts`, plus worker-pool lifecycle cases. Implement shared admission changes in `src/platform/admission.ts`, `src/platform/tasks.ts`, `src/store.ts`, worker tracking/composition and an additive migration.
- [x] Add failing native quote and synthetic duplicate-claim tests in `tests/integration/pact-coordination-native.test.ts` / `tests/unit/pact-coordination.test.ts`. Filter candidates in `src/games/pact/coordination.ts` using shared exact claim feasibility.
- [x] Add failing cycle-correction and coordinator-capacity-reconsideration workflows in the existing autonomous/specialist integration suites. Implement narrowly typed bounded corrections, including exhaustion/unsafe-error paths.
- [x] Verify and repair the known tick-pending retry path with synthetic/native tests preserving exact identity and uncertainty.
- [x] Run affected isolated suites, full unit tests, type/style/build/boundary checks; document actual results and source-only status in both repos. Verify retained paused state read-only before handoff.

## Implemented result — 27 October 2026

All production changes are in Fleet. PACT's authoritative economics and command handlers are unchanged. Migration `041_waiting_worker_admission.sql` adds the execution-wait flag and bounded bypass counter; it was applied only to disposable, owned integration databases. Both repositories remain on master, with these changes uncommitted and unpushed. Nothing was deployed.

| Finding | Repair | Offline evidence |
|---|---|---|
| A 54-block queued request blocked 32/35-block requests while 37 of 92 blocks were free | Choose the oldest fitting request; stop bypassing an older request after four admissions | Reproduced 55-active/54-waiting/32-fitting case, plus large-request fairness, token/cache/slot caps and conservative unknown demand |
| Inference waiters occupied the entire worker pool | Suspend only the serial waiter's execution slot; retain its turn, actor fence and original deadline; reacquire atomically before inference or failure handling | Unrelated work can claim; resumption obeys the execution cap; total outstanding turns stay at most 2N across workers; cancellation and preservation checks pass |
| A native supply quote was advertised even though its bond exceeded stock/authority | Aggregate exact claims with shared BigInt arithmetic; filter infeasible options and disclose `capacityExcluded`; keep the remaining frame valid | Actual native offer/signature with insufficient silver is excluded, then becomes available when the synthetic stock is funded; duplicate claims and values beyond floating-point precision tested for resource and authority claims |
| Capacity and goal validation stopped before using available correction slots | Feed known pre-submission capacity errors back to coordinator workers, reserving a coordinator call; feed bad parents/cycles/goal limits back before accepting specialist state | Corrected and persistently invalid responses tested through host/accounting; the existing call budget remains binding; unknown executions are not replayed |
| A definite tick-in-progress denial terminated a valid legacy action | The PACT adapter permits one retry after 1 second, under the original deadline and identity, only for a non-5xx `TICK_PENDING` rejection | Successful retry has the same ID/action; stop prevents retry; persistent denial stops after two submissions; uncertain second submission preserves the pending command and performs no further retry |

The weighted queue and worker controls are shared by legacy and native admission. Parallel siblings conservatively retain their parent's execution slot; one waiting child cannot suspend another active child. With the retained configuration of eight workers, the new code would allow at most eight executing and sixteen total running turns, including waiters. This does not increase provider concurrency, GPU cache capacity, cohort concurrency or model allowances. Queued calls also check the run-window model-start bound before waiting for more capacity.

## Verification

All integration checks used fresh isolated PostgreSQL fixtures and synthetic providers. No real model call, retained-world game command, service restart, replay, uncertainty review or execution-setting change occurred.

- Full unit suite: **1,161 passed** across 209 files.
- **221 distinct integration tests passed**, counted once across final passing selections:
  - pool capacity 23; specialist coordinator 35; native PACT coordination 8;
  - autonomous specialist 60; command/attention 15; legacy engine 21; multi-engine preservation 1;
  - native workflows across all eight architectures 49; native v1 runtime packing 4; native event-to-contact path 2; model deadline/runtime 3.
- `npm run check`, `npm run build`, `npm run check:boundaries` and `git diff --check` pass. Biome reports 170 warnings and 60 informational diagnostics, with no errors.
- Existing broader fixtures required maintenance: five synthetic HTTP responses still returned copied state maps after the earlier production contract changed to an `observationRef`. They now copy the reference delivered in the generation schema and validate the synthetic response against that schema. The malformed-read case still deliberately fails once, then corrects and confirms one native contact acceptance.
- The original legacy baseline digest remains unchanged. Its source-preservation test explicitly reverses only the newly authorized retry block, alongside its existing reviewed exceptions. The shared arithmetic helper lives outside the concrete platform implementation so engine dependency boundaries remain enforced.

Commands use Node 24.12.0 on PATH. Integration selection is through `npm run test:architecture -- <test paths>`; the runner owns and removes only its disposable databases. Logs are private local evidence; no decrypted correspondence, credentials or retained-world dumps were added to Git.

Read-only retained-state check at **2026-10-27 22:59:00 UTC**: world paused at tick 29, all 24 cohorts paused, zero running turns, zero pending commands, zero capacity leases, ledger unchanged at 165 reported / 6 not dispatched, and migration 041 absent. Private proof: the retained run's `evidence/offline-admission-repairs-preservation.json`. Older worlds and unknown allocations were not accessed for mutation. E4/KQ1 remain blocked.

## Limits before another run

These are source and offline acceptance results. Deploy the additive migration and matching workers together only under a new operational instruction; do not mix old and new worker versions. A new live run is still needed to measure queue reduction and social outcomes. Long generation, large catalogs, output truncation and poor model decisions remain possible. The fixes provide usable options and bounded feedback; they do not force contact acceptance, messages or a successful strategy. Model/context/output settings are unchanged.
