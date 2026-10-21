# Negotiation native timing implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans inline. Founder excludes delegation.

**Goal:** implement the already approved E4 native timing gate without using the controlled-clock driver as timing evidence.

**Architecture:** use normal `TaskStore` timed reviews and the normal PACT world-clock service. Both new E4 worlds may run their clocks concurrently, while normal native admission serializes all model turns through one provider slot. Root performs the same post-usage, pre-action manual review. Controlled E1–E3 behavior and all original profile versions remain unchanged.

**Tech stack:** existing TypeScript, PostgreSQL, Node24, native PlatformHost/ModelAdmission and PACT clock/rules handlers.

**Spec:** `docs/superpowers/specs/2026-10-20-two-kingdom-negotiation-design.md`, G4 and section7; owner-approved continuation and isolated candidate target in `AGENTS.md`.

## Global constraints

- Inline execution; preserve the retained world by non-access, original identities/history/unknowns and all consumed grants. No E1 replay/replacement.
- E4 remains two fresh C01 worlds, reversed roles, exact frozen selected candidate,15-minute periodic reviews, zero event-triggered turns, one provider slot, at most144 calls/5,760,000 reservations/six-hour parent. Original per-call24KB/2000tokens,40,000 reservation, three calls/turn and cell wall/GAME horizons remain.
- No direct time jump, heartbeat rewrite, accelerated tick, extra model/helper canary, timer-created opportunity, owner uncertainty clearance or mid-run source/settings adjustment.
- Native world workers run independently during inference and review. Unknown spend/command, isolation/privacy/authority/duplicate or critical semantic failure stops the whole batch. Preserve original allocations and receipts.
- Only source/offline fixtures execute in implementing this plan. Real E4 needs its separately bound approved grant after development selection and held-out qualification; no new E4 run is armed by this file.

## Executor decisions within the approved design

Two worlds share the provider, rather than each receiving a separate inference slot. Their clocks can run concurrently to avoid spending one world's entire horizon waiting for the other. This is an implementation choice, not a new user preference or larger budget. Each host claims only its own environment instance. All opportunities come from the existing native timed-review scheduler and retain normal ordinal phases.

The existing spec permits completion to close admission early after necessary settlement and later decisions. Native C01 can therefore finish before its maximum horizon only when all structural lifecycle/economic criteria are observed, clocks/solo are at the same committed GAME time, and manual factuality/dialogue/history reviews are complete. A self-rated success is insufficient. A time-limit miss remains a failure; no deadline or game horizon expands to finish it. Final snapshots distinguish cutoff from draining already-due ordinary ticks.

## Task N1 — Scope native scheduling and pre-admission checks

**Files:** modify `src/platform/tasks.ts`; test `tests/integration/negotiation-native-scheduling.test.ts`.

**Consumes:** `Bindings.selected`, normal `TaskStore.enroll(...,timedReviews)`, `seedScheduled`, `claim`, native `Store.setState` anchors.

**Produces:** scheduled tasks only for the selected environment instance; optional fourth `claim` callback `(binding:BindingRef)=>Promise<void>` executes before `Store.admitAgent` within the same claim transaction. Defaults preserve all existing callers.

- [ ] Reproduce two running timed-review worlds causing `ENVIRONMENT_NOT_SELECTED` in `seedScheduled`; fix the instance-scoped query and verify no foreign/duplicate scheduled task.
- [ ] Reproduce a rejected pre-admission callback creating a turn; require rejection before any turn/allocation while retaining its ready task. Verify normal claiming/priority/phase behavior and no callback for unavailable capacity.
- [ ] Verify scoped tasks/recovery/admission suites and commit.

## Task N2 — Retained normal native world-clock lifecycle

**Files:** modify sibling PACT `tests/evaluation/negotiation-owned-run.ts`, `tests/evaluation/negotiation-world.ts`; test `tests/integration/negotiation-native-clock.test.ts`.

**Produces:** owned `startNativeClock`, `tickNativeClock`, `pauseClock` lifecycle. Preparation pauses only each new native fixture with exact `NEGOTIATION_PREPARED` reason. A single-use activation may resume only that specific unconsumed prepared clock, acquire its normal world-worker lease, heartbeat and call normal `advance`. It cannot clear an unrelated/operational pause, replace a lost live owner, change game time or rewrite due times. Controlled-only schedule refresh never applies here.

- [ ] Tests first fail on missing native lifecycle; cover wrong mode/owner, repeated start, unrelated pause, expired/revoked lease and preserved initial stocks/identities.
- [ ] Use actual elapsed wall time for a one-minute fake-provider mechanism check: a blocked fake request must not prevent ordinary ticks in treatment and solo. No direct SQL time manipulation supplies this evidence.
- [ ] Verify same one-use lifecycle after retained checkpoint reconnect and keep clocks paused on interruption; commit verified source.

## Task N3 — Concurrent cells with independent clocks and serialized native turns

**Files:** modify `src/negotiation-run.ts`, `scripts/lib/negotiation-owned-run.ts`; create focused `scripts/lib/negotiation-native-run.ts` if needed; test protocol unit and native integration suites.

**Consumes:** N1 timed reviews/pre-admission callback and N2 clock lifecycle; existing provider/model/command ledgers, response/outcome review callbacks and cell guard rules.

**Produces:** trusted `timingMode` capability on execution ports. Refactor the existing cell execution into one reusable scoped operation; controlled stages still run sequentially. E4 starts its two scoped cell operations together only when ports explicitly supply the certified native path. No arbitrary module loader or manifest flag can select an implementation.

- [ ] Before changing behavior, test missing native capability rejects before nonce/dispatch; test known critical and unknown usage stop sibling admission, preserve original accounting and never synthesize another turn.
- [ ] Open actor leases/windows serially before parallel native hosts. Each native host uses `timedReviews=true`, its own binding instance and normal `TaskStore.claim`; one shared turn/provider capacity remains. No scripted periodic event replaces native scheduling.
- [ ] Run independent bounded clock pumps with normal heartbeat/advance during model and manual-review waits. Clock failure latches batch stop; original in-flight work settles within native bounds. No auto recovery/reset/reacquisition.
- [ ] Use authoritative evidence for optional early completion and matched solo snapshots; require all settlement/later-decision and manual review criteria. Otherwise retain the cutoff failure. Do not infer missing behavior from a WAIT or model prose.
- [ ] Regression-check all controlled-stage guard, critical-exception, packing and native accounting cases; commit.

## Task N4 — Windows composition acceptance and frozen handoff

**Files:** modify `scripts/lib/negotiation-windows.ts`, `scripts/lib/negotiation-prepare.ts`; focused acceptance/paired tests and dated progress report.

- [ ] Keep E4 fenced until N1–N3 tests pass. Then route the fixed trusted Windows factory to the native path and native roster enrollment; fresh exact manifests/archives remain mandatory.
- [ ] Run the actual one-minute blocked-fake test with two treatment/solo pairs, native scheduler and one provider slot. Assert ordinary clocks advance, original command IDs persist, no extra periodic task and no real provider call.
- [ ] Type/style/build/boundary and appropriate full suites pass. Freeze source/model/settings/policy/roster before held-out inspection. Preserve every failure and record source versus real timing evidence separately.

## Review focus

- Another environment's due actor must neither crash nor wake this host (N1).
- Preparation wall delay must not be silently cleared as an operational recovery (N2).
- A model/review wait must not freeze native economic time (N2/N3).
- Sibling cells must never obtain separate capacity or new work after a critical/unknown stop (N3).
- Full lifecycle, matched final time and source-backed later decisions must precede any pass; timers/self-reports cannot substitute (N3/N4).

Review is inline under the founder's no-delegation instruction. No fresh-agent review is claimed. The existing approved design supplies product intent; decisions above resolve implementation details without adding a run, budget or authority grant.
