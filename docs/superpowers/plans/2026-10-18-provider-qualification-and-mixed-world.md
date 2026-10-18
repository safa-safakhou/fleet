# Provider qualification and mixed-world implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for later authorized implementation. Repository instructions prohibit delegation. This document is proposed; no implementation/execution is authorized by saving it. Steps use checkboxes for future work, not completed claims.

**Goal:** Qualify the pinned local provider safely, then support an explicitly approved fresh PACT world containing100 Luna and20 local kingdoms under bounded renewable budgets.

**Architecture:** Keep installed Fleet953034e disabled and preserve current engines. A separate bounded qualification harness supplies frozen observations and withheld-command ports; later authoritative world identity, enrollment roster and authorization windows gate a fresh shared-world launch.

**Tech Stack:** Existing Node24/TypeScript/Fastify/PostgreSQL17 and environment-neutral Fleet contracts; PACT owns world rules/identity/commands; native Ollama and existing Codex provider adapters.

**Spec:** `../specs/2026-10-18-provider-qualification-and-mixed-world-design.md`; inert numeric proposal `../../provider-qualification-proposal-20261018.json`.

## Covering Task1/Task2 authorization —18 October2026

Founder subsequently authorizes building/testing the harness and local Q1+Q2 only within104 executions/4160000 reserved tokens. Server Fleet remains untouched, no game reset and no population runs. This supersedes earlier planning-only text solely for Tasks1–2; Tasks3–6 remain unapproved. Current evidence: `../../local-provider-qualification-20261018.md`. Source implementations preserve the installed953034e disabled runtime. No delegation or push.

## Global constraints

- Planning only now:0 new executions/accounts, no reset, server access, runtime/configuration change, deployment or push. No delegation; local documentation commits authorized.
- Keep original identities/history/unknown allocations/commands/settings/anchors and terminal populations; never use new accounts to hide an old failure.
- Q1+Q2 local cap104 executions/4160000 reserved tokens; Q3 Luna24/960000; Q4 shadow60/2400000; Q5 first24h100 Luna4800/192000000 plus20 local960/38400000. Each needs later exact approval.
- Every execution reserves40000; input24000bytes, output setting2000, decisions/actions2 per turn,90s/model,120s/turn, route concurrency1; helper3s and explicit separate call caps. No added allowance for retries/events.
- Fleet generic packages depend on injected ports/shared contracts; PACT types/rules remain behind its adapter. Same authoritative permissions/leases/receipts apply to every fleet.
- Existing local20 remain excluded and execution-disabled even when a separate later qualification harness is approved.

## Review focus

1. A reused origin/new database must reject old-world credentials, memories, events and pending actions before dispatch; test world-incarnation mismatch, not merely hostname mismatch.
2. Internal retry/sibling work and usage over reservation must not escape caps or be reported as free; test actual dispatch boundaries and one-in-flight overrun behavior.
3. Shared provider login/route is one slot across cohort/host runners; test lock contention/fair admission without changing provider policy.
4. Budget-window expiry must block admission without replacing kingdoms or erasing prior allocations; test renewal preserving every old row and immutable old windows.
5. Mixed-world scores must retain missing coverage/founding age/model/cadence differences; test exports never relabel fixture or another instance's evidence as production qualification.

## File responsibilities for later implementation

| Area | Planned files and responsibility |
| --- | --- |
| Qualification | New `src/qualification-run.ts`, `scripts/qualify-provider.ts`, `tests/unit/qualification-run.test.ts`, `tests/integration/provider-qualification.test.ts`: bounded preparation/execution, source/scope evidence and withheld commands; reuse `src/qualification.ts`, `src/platform/admission.ts`, `src/model.ts`, `src/codex.ts` |
| Stable bounded population windows | New `src/platform/authorization-windows.ts`, proposed next migration`020_authorization_windows.sql`, unit/integration window tests; opt-in changes in `src/domain.ts`, `src/store.ts`, `src/platform/admission.ts`, `src/platform/tasks.ts`, `src/worker.ts`; do not alter existing budget/profile semantics |
| PACT world identity/cutover | Counterpart plan below; source changes isolated from pure rules. Versioned authoritative instance identity and ordinary enrollment, no ad hoc destructive runner |
| Cross-host enrollment | New `scripts/prepare-population-roster.ts` and unit fixtures; reuse `src/platform/bindings.ts`, `src/environments/pact.ts`, `src/games/pact/credentials.ts`; combined disjoint roster, no credentials in manifests |
| Reports/review | Extend actual evidence/release review only where needed; `src/platform/reports.ts`, `tests/acceptance/environment-profiles.test.ts` and paired handler acceptance. Preserve labelled instance/source/configuration coverage |

These are proposed new files/interfaces, not claims of existing reset, global-wallet or harness APIs. Reconcile migration sequence and approved contract changes at implementation start.

### Task1 — offline harness preparation, no model calls

**Interface:** `prepareQualification(plan: QualificationPlan): PreparedQualification` validates approved stage/caps/absolute scope and produces an immutable digest; `runQualification(prepared, ports): Promise<QualificationResult>` accepts an injected metered ModelPort and fixture-only observation/command-sink ports. Default CLI is review-only; real dispatch requires explicit execution switch plus matching stage authorization/source/settings digest. No installed worker config is loaded/re-enabled.

- [x] Write `qualification-run.test.ts` with wrong/absent approval causing0 dispatch, changed model/world/settings causing0 dispatch, exhausted aggregate/per-profile/helper/retry caps causing0 further dispatch, unknown usage retained, all proposed commands captured with0 real submissions.
- [x] Run that test red before creating implementation; implement only these interfaces with persistent isolated ledger and atomic pre-dispatch reservations; test reads/observations cannot supply arbitrary URL or authority.
- [x] Add integration tests using fake provider responses and throw-on-write game ports for both legacy and reactive engines. Six scenarios×two trials×max2 decisions/profile fit24/profile. Evidence is scope-labelled and all raw consumed outputs validated, including failures.
- [x] Run `npm run check`, `npm test`, `npm run test:integration`, `npm run check:boundaries`, `npm run build`, `npm audit`; expected all pass, no inference/network game writes. Commit source/evidence before requesting any real-model stage.

### Task2 — separately approved Q1/Q2 local qualification

**Consumes:** Task1 verified harness; exact selected source/contracts, pinned model digest, staged synthetic environment, operator-selected UTC start/deadline displayed in Europe/Berlin, immutable caps and a named monitor.

- [x] Read-only preflight actual local model/helper pins and versions, power/disk availability and installed Fleet livefalse/Env0; do not download, substitute or change existing20.
- [x] After stage-specific execution approval, Q1≤8 executions/320000 tokens/15min, then review before Q2≤96/3840000/4h and≤48 helper calls. Ordinary installed worker remains disabled throughout.
- [ ] Require all48 Q2 trials complete with valid delivered schemas, known usage and preserved authority/caps; allow legitimate wait/refusal. Expose latency and failure coverage; no action/communication-count target.
- [x] Stop on first unknown/uncertain submission/authority or scope violation, budget or deadline. Retain allocation/history; no silent retry/extension. Save encrypted detailed evidence, public aggregates and model/settings/source digests. This proves the fixture scope only.

**Actual outcome:** Q1 failed on the second empty final output:2 executions/80000 reservation,402 reported tokens,0 unknown. Q2/48 trials were not started. No restart or extra calls; see the local qualification report/status. Task2 is blocked, not completed or certified.

### Task3 — renewable bounded windows before long-lived enrollment

**Produces:** A new opt-in bounded-window mode for **new population cohorts**, separate from existing finite/daily/continuous modes. Cohort identity/configuration remains stable; active owner-authorized windows have immutable ID/start/deadline/call/token caps, ledger reservations reference that window, and expired/no window blocks admission while owner intent stays nonterminal. Explicitly approved renewal opens a new row; it never rewrites old usage or increases old caps. Child caps are disjoint across hosts; no shared distributed wallet is claimed.

- [ ] Write red window tests: after24h0 dispatch, expired window preserves cohort/account/ledger rows, new approved window retains old unknown allocations/gates, unauthorized/overlapping renewal rejected, concurrent legacy/platform admissions cannot overdraw, aggregate child caps sum to parent, all existing engine/budget fixtures unchanged.
- [ ] Implement migration/ports in the files above, including every model/admission path and read-only UI/export labelling. Do not turn current cohorts into windowed cohorts or grant indefinite execution implicitly.
- [ ] Verify exact all-table restore/idempotence, old-source **disabled** rollback, original22-table preservation and same-identity renewal. Full suite/boundaries/type/build/audit; local commit only. Any actual installation needs its own scope/rehearsal.

### Task4 — fresh-world preparation and cross-host join

**Consumes:** Counterpart PACT identity/cutover acceptance plus Task3; **later** exact authorization to access/fence the old server workload and create/route a new world. Nothing in Tasks1–3 touches it.

- [ ] Follow counterpart plan to preserve old world/writers, build a separately addressed empty world, verify restore and immutable identity before enrollment. Fail closed on any unrecognized backup/uncertain command/user-continuity issue; no bulk SQL wipe.
- [ ] Prepare disjoint roster: server100 Luna legacy-loop; local four×5 with fixed engine/model/goal/authority assignments. IDs stay empty in this planning proposal; actual new IDs become an exact approved protected roster later. Registration retries reuse persisted entry keys and never replace an uncertain failed account.
- [ ] Test duplicate cross-host actor binding rejection and old-world credential/receipt/event/cognition rejection, while normal server leases/authorization still enforce writes. Use separate per-Fleet credential storage; no private memory sharing.
- [ ] Interleave/record ordinary founding times, then choose common first-inference anchor; do not assume paused-clock enrollment or identical endowments. Record initial resource/queue baselines without gifts or fabricated clocks.

### Task5 — later Luna qualification, new-world shadow and exact run review

- [ ] With separate permission and shared-login coordination, Q3 Luna24 executions/960000 reservation/2h on frozen inputs. Pin actual CLI/catalog/settings, check owner allowance/credit exposure; preserve native shared lock. Hourly100 target requires end-to-end p95≤25s; otherwise revise cadence/caps or separately qualify another route before launch.
- [ ] After approved world/roster preparation, Q4 shadow:12 actual decisions/profile on that exact world (48 local+12 Luna),≤2400000 reserved/2h,≤24 helper calls, **0 game commands**. Existing ordinary workers remain disabled until review passes. Match deterministic and provider evidence to world/source/adapter/configuration digests; no fixture evidence relabelling.
- [ ] Compile exact new-world review manifests with real account IDs, capabilities, stages, dates, owner authority, disjoint budget windows, monitoring and source references. Preview rejects F6 for PACT and rejects event/outlook profiles until actual supported endpoints/flags qualify. No flags changed on the old world.
- [ ] `npm run test:acceptance` against explicit isolated PACT root/5438 fixture, plus contract/boundary tests and clean audit; expected pass. Rehearse actual chosen installation state/backup/rollback separately; no broad provider credential copy or hidden paid top-up.

### Task6 — separately approved first24h population admission

- [ ] Approve one120-kingdom roster/window:4800 Luna executions+960 local;192000000+38400000 reservations; helper≤480; one route slot/host; all numeric stage caps as proposed or explicitly revised before approval.
- [ ] Admit all120 at commonT0 after fake100-actor scheduling/permission tests and measured provider screening. First3 hourly rounds are probation **within** that24h ceiling; require every actor completes each round or report explicit failure and stop admission. No late catch-up bursts.
- [ ] Record all events/tasks/decisions/usage/receipts/outcomes/founding exposure and model opportunities. Inspect useful communication, refusal, upkeep, threat response and fulfilled obligations, never mandated social activity.
- [ ] At window end block further work without terminal identity replacement. Review observations before any bounded renewal on same kingdoms; original window/deadline/allocations remain. No automatic week/continuous budget. Retain old-world archive and current original cohorts under their existing retention/recovery policy; no ad hoc erasure or retention extension.

## Planning handoff

Today delivers this design/plan and inert budget arithmetic, not implementation or authority. Next dependency-ready **implementation** is Task1 only after covering approval; next **real-provider** operation is Q1 only after that harness and exact stage approval. Server access/reset, Q3–Q6, new accounts, capability activation, deployments and pushes remain explicitly unapproved. Author review only under no-delegation instructions.
