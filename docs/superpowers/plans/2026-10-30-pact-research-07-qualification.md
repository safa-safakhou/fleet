# PACT Research Qualification and Preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans`, inline without delegation. Checkboxes are future implementation under a covering assignment.

**Goal:** Qualify exact PACT fixture recipes and prepare a reviewable release without altering retained worlds or overstating reliability.

**Architecture:** Combine semantic/risk-based configuration tests, injected cross-service faults, synthetic migration/restore rehearsal and browser/evaluator walkthroughs. Store qualification against exact manifest/capability digests and keep operational activation separate.

**Tech Stack:** Existing Fleet test/build/boundary tools, fast-check, Hypothesis, Temporal test environment, owned PostgreSQL 17/PACT fixtures, Playwright, pinned research services.

**Spec:** [Design §§4–11](../specs/2026-10-30-pact-research-engine-design.md); [master constraints](2026-10-30-pact-research-engine.md). Depends on all preceding packages.

**Execution status — 31 October 2026:** source deliverables implemented inline on master; [actual acceptance record](../../research/acceptance-20261031.md). Q1/Q2 fixture checks passed before Docker storage loss. Q3 native/UI walkthrough and Q4 compiled macOS package checks pass; Linux package, recording performance, final native reruns and complete fixture qualification remain blocked. Unchecked acceptance items remain required. No installed service or world activation occurred.

## Global Constraints

- PACT only, work inline. No retained-world reset/replay/enrollment, model/game activity, recovery review or deployment under source work.
- Preserve original commands, unknown allocations, budgets, anchors, credentials, identities, terminal states and encrypted history; synthetic snapshots only.
- Zero invariant violations in the tested fixtures is required; it is not a platform-wide zero-risk claim. No blanket certification of arbitrary configurations/providers.
- Private retention remains 30 days, artifacts at most 1 MiB/chunk, event pages 200/max 500. No private evidence in Git or uncontrolled exports.
- Source/offline, installation and provider/behavior acceptance have separate records. Tests skipped for OS/runtime reasons remain skipped, not passed.

## Review Focus

1. Pairwise configuration coverage misses high-risk cancellation/lease/unknown-usage triples — Q1/Q2.
2. An additive migration/restore changes old rows or separates SQL from its encrypted artifacts — Q2.
3. Overhead is hidden in another process, or a complete backend lacks usable visualization — Q3.
4. A fixture qualification is mislabeled real-provider or strategic acceptance — Q3/Q4.
5. Rollback lets old/new schedulers consume each other's work or erases uncertainty — Q2/Q4.

---

## File responsibilities

Create `src/research/qualification/{matrix,repository,policy}.ts`, `migrations/053_research_qualification.sql`, `tests/fixtures/research/config-matrix.json`, `scripts/{qualify-research,test-research-migration,test-research-faults,benchmark-research}.ts`, and `docs/research/{qualification,release,operations}.md`. Extend existing architecture boundary/offline fixture harnesses rather than calling retained routes.

Qualification artifacts store exact versions/manifests/capability fingerprints, test evidence refs, status/scope and invalidation reasons. They contain no grant that activates a live cohort. Update the handbook/current-state only with actual completed source results when implementation is accepted, not predictions from this plan.

## Q1 — Enforce scoped qualification and a risk-based configuration matrix

**Files:** Create qualification modules, migration and config matrix above, `tests/unit/research-qualification.test.ts`, `tests/property/research-config.test.ts`, `workers/research/tests/test_wire_properties.py`; add `qualify:research` script and matrix support to `test:properties`.

**Consumes:** C2 manifests/fingerprints, C4 property runner, R5 recipe/worker conformance, M1 index policy and A1/A3 datasets.

**Produces:** `QualificationPolicy.assess(manifestDigest: string, evidence: QualificationEvidence): QualificationDecision`; `QualificationRepository.record(decision): Promise<string>`; `ConfigurationMatrix.generate(capabilities): MatrixCase[]`. Status binds exact scope (`fixture`, `installation`, `provider`, `behavior`) and inputs; `experimental` cannot bypass protections.

- [x] Write `qualification_invalidates_on_change`: component/provider/schema/index/retention/capability changes invalidate the old digest; unknown/omitted evidence cannot become qualified by editing a label. Cover script/advisory/deliberative/specialist, TS/Python, old/new owner, recall strategies, consent policies, finite/continuous budgets, tool schema support and stop states. Mandatory triples: cancel×lease-loss×late-usage, retention×index×cached-context, worker-restart×pending-command×duplicate-delivery, optimizer×judge×heldout-split.
- [ ] Run `npx vitest run tests/unit/research-qualification.test.ts tests/property/research-config.test.ts` and `uv run --project workers/research --group dev pytest workers/research/tests/test_wire_properties.py -q`; expect RED.
- [ ] Implement capability-filtered pairwise cases plus explicit high-risk triples/negative cases. Hypothesis tests null/large integers/enums/Unicode/wire mismatch and checkpoint CAS; export minimized synthetic regressions. Qualification requires all non-disableable gates, declared data completeness and exact dependency versions; unsupported combinations fail before run creation.
- [ ] Run both test commands and `npm run test:properties -- --release --seed 20261030`; expect PASS, 2,000 bounded histories/test and a machine-readable matrix with covered/excluded/blocking cases. Record combinatorial limits rather than claiming exhaustive configuration coverage.
- [ ] Review/checkpoint Q1; no real provider or second game receives qualification from fixture coverage.

## Q2 — Rehearse migration, distributed faults, backup and rollback

**Files:** Create `scripts/test-research-migration.ts`, `scripts/test-research-faults.ts`, `tests/integration/research-preservation.test.ts`, `tests/integration/research-distributed-faults.test.ts`, `tests/fixtures/research/pre-migration.ts`; extend paired fixture ownership guards and root scripts (`test:research-migration`, `test:research-faults`).

**Consumes:** New migrations, C3 effects, O1–O5 evidence, R1/R4 lifecycle/recovery, M1 deletion and Q1 matrix.

**Produces:** `MigrationRehearsalReport`, `FaultQualificationReport`, restore completeness report and exact rollback compatibility requirements. Runners create/own fresh databases/artifact roots with nonce assertions and refuse retained/default live addresses.

- [x] Write `preserves_pre041_synthetic_history`: seed old-schema known/pending/unknown calls, exact PACT commands/receipts, encrypted grants/history, consumed profiles, budgets, ready/terminal states, queue contents and schedule anchors. Apply new migrations twice and assert canonical preserved-row hashes/counts/IDs unchanged. Restore SQL and chunks into another fresh fixture and verify archive/coverage. Faults include DB/Temporal/worker/artifact/exporter outages and quota/consent loss at every R4 dispatch boundary.
- [ ] Run `npx vitest run tests/integration/research-preservation.test.ts tests/integration/research-distributed-faults.test.ts`; expect RED.
- [ ] Implement owned fixture runners, deterministic fault injection and whole-system reconciliation. Test old scheduler excludes new ownership and new scheduler excludes old tasks. Rehearse rollback by stop/fence/drain followed by compatible binary selection; preserve new records and unresolved obligations. If old binaries cannot safely read/ignore new ownership, mark them rollback-incompatible and require a tested compatibility build rather than downgrade blindly.
- [ ] Run the same tests, `npm run test:research-migration` and `npm run test:research-faults`; expect PASS with zero duplicate/unauthorized effects, preserved unknown reservations and truthful partial-evidence reports for injected loss. No intentional failure trace may be relabeled complete to make the suite pass.
- [ ] Review/checkpoint Q2 with synthetic before/after hashes, failure matrix, restore command evidence and no retained data read or changed.

## Q3 — Demonstrate the full product and measure overhead

**Files:** Create `scripts/qualify-research.ts`, `scripts/benchmark-research.ts`, `tests/acceptance/research-engine.test.ts`, `tests/browser/research/walkthrough.spec.ts`, `docs/research/qualification.md`; add `benchmark:research` script and extend `qualify:research`.

**Consumes:** All instrumented recipes, archive/verifier, A1/A2 independent metrics, A3/A4 tool integrations, U1–U4 actual studio and Q1/Q2 evidence.

**Produces:** Reproducible fixture qualification bundle and measured `ResearchBenchmarkReport`; no live strategic-success claim. Bundle includes a successful task, valid safe stop, uncertainty/recovery incident, retrieval/context explanation, and baseline-versus-candidate comparison that can honestly show no improvement.

- [x] Write `researcher_can_reconstruct_and_compare`: follow an objective from authorized observation through context/memory/tool/model/state/proposal to actual fixture receipt/completion; reconstruct a lost-response incident and compare independent sessions with missingness/usage correctly displayed. Assert every expected call/action/event and retained artifact count/digest reconciles, with zero hidden helper calls and all seven mandatory view families usable.
- [ ] Run `npx vitest run tests/acceptance/research-engine.test.ts` and `npx playwright test --config playwright.research.config.ts tests/browser/research/walkthrough.spec.ts`; expect RED until integration is complete.
- [ ] Implement acceptance orchestration only over owned fixtures. Benchmark enabled/disabled recording on 1,000 operations with a 50 ms fake provider and concurrency 4, one warm-up then five recorded repetitions; record runner hardware/OS, exact limits and absolute timings. Target at most 10% p95 host service-time overhead and 15% host peak RSS increase; also report total CPU/RAM/disk/backend footprint so externalization cannot hide costs. Exercise 100,000 events/16 MiB artifact with U1 budgets.
- [ ] Run both tests, `npm run qualify:research -- --fixture` and `npm run benchmark:research -- --fixture`; expect PASS or explicit performance blockers. Inspect synthetic screenshots at desktop/mobile widths, archive integrity, canonical metric values, CI skips and raw repetitions. Qualification is fixture-scoped and cannot imply a real model became more accurate.
- [ ] Review/checkpoint Q3. Record failures/tradeoffs openly; do not relax a guardrail or alter held-out data simply to obtain a green report.

## Q4 — Package, verify boundaries and hand off exact operational gates

**Files:** Finalize `ops/research/` service configs/worker isolation, `docs/research/{release,operations}.md`, `docs/research/acceptance-20261030.md` (use actual acceptance date if later), root README/handbook links and actual current-state source status when accepted. Create `scripts/test-research-package.ts`, `tests/acceptance/research-package.test.ts` and root `test:research-package` script; modify build configs only for verified packaging.

**Consumes:** Q1–Q3 evidence, exact package/image/extension locks and existing operator/recovery/run-window boundaries.

**Produces:** A source release bundle with disabled execution by default, port/role/volume map, secret references, backup/restore/key procedure, capacity/disk estimates, health checks, worker/process versions and rollback-compatible build requirements. A separate activation checklist names exact target/release/world/manifest/provider/cohort scope, observation/index consent, finite resource envelope, stop conditions and permitted commands; ungranted values are explicit blockers, never guessed defaults.

- [x] Write `packaged_release_stays_disabled`: start the compiled reference package on owned fixtures with no execution grant; assert health/read-only inspection works, no cohort enrollment/model/game dispatch, no credentials in manifest/history/logs and no uncontrolled ports. Restart all services and verify same pending IDs/unknown allocations; a missing extension/artifact key fails readiness explicitly.
- [ ] Run `npm run test:research-package -- --fixture`; expect new packaging assertions RED before configuration is complete. The script owns fresh DB/storage/network fixtures and invokes `tests/acceptance/research-package.test.ts` against compiled binaries, never an installed service.
- [ ] Implement reference development and production-isolation profiles with explicit differences; package service persistence separately from Fleet authority. Document no automatic migration activation, no automatic promotion and separate source/install/provider/behavior evidence. Prepare concrete later-run instructions without executing them or inheriting old grants.
- [ ] Run `npm run research:contracts:check`, `npm run check`, `npm run check:boundaries`, `npm run build`, affected unit/integration/property/Python/browser suites, `npm run test:architecture` and `npm run test:research-package -- --fixture` on supported Linux. Expect PASS on required gates; run dependency/license checks from C1 locks. Report each actual result, skips and unresolved blockers; broad reruns are needed only after relevant changes/failures.
- [ ] Self-review against master coverage and all five review-focus risks; checkpoint only if authorized. Hand off links to source acceptance, fixture qualification, visual walkthroughs and operational blockers. No deployment, push or live acceptance is implied by source completion.
