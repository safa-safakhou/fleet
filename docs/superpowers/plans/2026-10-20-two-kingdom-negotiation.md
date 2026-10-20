# Two-Kingdom Negotiation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` for subsequent authorized implementation, task-by-task. Repository instructions require inline work without delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Demonstrate accurate two-kingdom negotiation, fulfilled mutually useful supply and evidence-grounded later decisions, with negative controls and measurable limits.

**Architecture:** Extend independent-world evaluation and actual Fleet/PACT command paths. Preserve current profiles as controls; compose an explicit repaired `reactive-cognition@2` from scoped services and versioned evidence modules after the approved architecture foundations. Separate deterministic mechanics, real-model fixture qualification and native timing acceptance.

**Tech Stack:** Existing Node 24, TypeScript, PostgreSQL 17, Vitest, Zod/AJV and Fleet provider/accounting infrastructure. No new runtime dependency or model framework.

**Spec:** [Milestone design, scenarios, budgets and gates](../specs/2026-10-20-two-kingdom-negotiation-design.md). [PACT ownership companion](../../../../pact/docs/superpowers/plans/2026-10-20-two-kingdom-negotiation.md).

**Status:** Planning only, 20 October 2026. All eight tasks are unstarted. No source fixes, tests, fixture/model/game runs or installation are authorized by saving this plan. E1–E4 are separate future proposals. Baselines: Fleet `a6ef729`, PACT `41e8bcd`.

## Global Constraints

- Preserve installed/archived identities, source histories, goals, mandates, schedules, budgets, closed windows, private evidence and original unknown allocations. Use no retained runtime database or fixture.
- Fresh owned fixtures only. Reuse specialist F00's isolated runner; never default to `127.0.0.1:5437/fleet_test`. Inspect current tooling/ports at execution time; the older plan's Homebrew command is not a command for this Windows/WSL host.
- No real inference/helper call, game run, deployment, installation, server contact, recovery review, reset/replay, setting change, push or population launch during source/offline work. No delegation.
- Existing `@1` packets/accounting/retrieval remain the comparison control. New decision-visible behavior is an explicitly versioned candidate, not a refactor side effect.
- PACT owns formulas, consent, admission and settlement. Runtime Fleet cannot import PACT test/database internals.
- Proposal, signature, activation, delivery, closure and benefit remain distinct. Missing coverage is unknown. Permission and receipt validity do not establish good strategy.
- Source/offline fixtures use fake models only. Future real calls, corrections and reflection consume their original parent ceiling; no unmetered judge/helper.
- Existing consent/encryption/source-deletion and thirty-day evidence retention continue. Public reports contain aggregates and scoped references, not private messages or keys.
- Experimental starting conditions are synthetic and disclosed. No economic change, automatic agreement, mandatory message count or forced memory update.
- Preserve `tests/evaluation/design.json` and historical results. Add a separate negotiation manifest; do not silently enlarge or rerun the old 672-cell registry.

## Review Focus

1. **Correct ID, wrong peer/version or absent signatures:** bind lifecycle claims to identities and current coverage; unknown cannot mean consent — N03/N05/N06.
2. **A signed contract yields no benefit or defaults:** use actual installments and independent solo worlds, count both parties and outgoing costs — N02/N05.
3. **Outcome saved but omitted, or delivered without support:** protect bounded causal evidence, prove final serialized delivery and restart survival — N04/N06.
4. **Expiry, tick, permission change or crash before commit:** authoritative rejection and original-receipt reconciliation prevent stale/duplicate effects; a prevented bad choice still fails behavioral scoring — N02/N03/N06.
5. **Extra turns, leaked opponent facts or replaced failures create a pass:** immutable manifests, scope/caps, stage denominators and fail-closed execution — N01/N05/N07.

## Sequence and specialist dependencies

Use [specialist foundations](2026-10-20-autonomous-specialists-platform.md) F00/F01 first. N01 → N02 builds the benchmark; F02 → F06 precede N03 → N04's version-2 candidate. N05 → N06 → N07 → N08 completes source/offline acceptance. This is a dependency order, not permission to start.

The benchmark does not wait for persistent specialists A01–A08 or skills K01–K07. F07/F08 expose the extra exact version when their UI/CLI work runs. E1 inspects the frozen `@1` even if a candidate is compiled; a candidate result cannot substitute for it.

Later A04 consumes N04's evidence policy. A07/A08 are prerequisites for autonomous-specialist PACT comparisons; the existing F6 coordinator retains its separate unsupported protocol. Passing this milestone does not complete all 26 architecture tasks. See design §8 for the full mapping.

## File ownership

All new files/symbols are proposed. Each task owns runtime schemas/tests as well as TypeScript declarations. Only acceptance fixtures may load built PACT public packages, following `tests/acceptance/pact.test.ts`; Fleet runtime never loads PACT evaluation code.

| Task | Files / responsibility |
| --- | --- |
| N01 | PACT `tests/evaluation/negotiation-design.json`, `negotiation-plan.ts`, `negotiation-contracts.ts`; Fleet `tests/fixtures/negotiation/design.json`, `src/negotiation-evaluation.ts`: manifest and strict report contracts |
| N02 | PACT `tests/evaluation/negotiation-world.ts`, `negotiation-outcome.ts`, `tests/integration/negotiation-worlds.test.ts`, `negotiation-lifecycle.test.ts`: worlds, full command/tick paths and independent controls |
| N03 | Fleet `src/games/pact/negotiation-state.ts`, `tests/unit/pact-negotiation-state.test.ts`; extend `negotiation.ts`, `briefing.ts`, `packing.ts`, `proposals.ts` with explicit candidate policy selection |
| N04 | Fleet `src/modules/evidence/negotiation/v1.ts`, `src/engines/continuity/engine-v2.ts`, F05-created continuity manifest, `tests/unit/negotiation-evidence.test.ts`, `tests/integration/negotiation-continuity.test.ts` |
| N05 | Fleet `src/negotiation-evaluation.ts`, `tests/unit/negotiation-evaluation.test.ts`: evidence, claim, cost and uncertainty scoring; preserve existing `src/evaluation.ts` semantics |
| N06 | Fleet `tests/acceptance/negotiation.test.ts`, `tests/integration/negotiation-recovery.test.ts`, `tests/fixtures/negotiation/driver.ts`: actual two-actor engine paths with fake providers |
| N07 | Fleet `src/negotiation-run.ts`, `scripts/qualify-negotiation.ts`, `tests/unit/negotiation-run.test.ts`, `tests/integration/negotiation-run.test.ts`: preview and bounded runner |
| N08 | Paired source-acceptance reports and `docs/two-kingdom-negotiation-status-20261020.json`: exact achieved/pending evidence |

## Interface contracts (owned by N01 unless stated)

- `NegotiationCell = {id,family,variant,seed,replicate,split,profile:{id,version},modelDigest,policyDigest,clockMode,limits,initialStateDigest}`. `family` is C01–C06; `clockMode` is `controlled|native`. Strict schema rejects unknown fields.
- `negotiationPlan(stage:"E1"|"E2"|"E3"|"E4", selections:FrozenSelections):NegotiationCell[]`. `FrozenSelections` contains exact sources/profile/model/policy digests; only manifest-listed cells resolve. This function never schedules work.
- `NegotiationEvidence` uses `pact.negotiation-outcome.v1`: world/cell/rules/configuration digests, actor/counterpart IDs, coverage, game/wall timestamps, lifecycle stages, exact offers/signatures/receipts, per-flow due/delivered/default/overflow totals, terminal state and per-actor final ordinary stocks. Quantities are decimal strings evaluated with BigInt. Public evidence excludes private text and hidden opponent state.
- `SoloComparison = {actorId,controlWorldId,initialStateDigest,goalDigest,horizonGameTimeMs,ordinaryDeltaByResource,supported}`. Worlds must match state/goals/non-social permissions/horizon. Benefit requires increased desired resource, no donor-resource decrease after refill, no new unmet obligation and goal compliance; Fleet invents no scalar utility.
- `NegotiationAssessment = {cellId,evidenceDigest,stages,actorResults,claims,laterDecisions,failureCodes,costs,verdict}` with `pass|fail|unresolved`. Claim rows hold actor, redacted locator, criterion, source refs and `supported|contradicted|unassessable`; public exports contain no raw text. Later decisions record actual per-actor behavior and assessed evidence use, not merely packet delivery.
- `CellLimits = {turnsPerActor,callsPerWorld,reservedTokensPerWorld,inputBytes,outputTokens,wallDeadlineMs,gameHorizonMinutes}` uses design §7 values. Record selected engine-native action/read limits too; this contract never increases them.

## N01 — Freeze scenario and measurement contracts

**Depends on:** F00/F01. **Produces:** definitions above, `designDigest(manifest):string` and matching manifests/JSON Schemas in both repos. **Tests:** new `tests/unit/negotiation-plan.test.ts` in both repos.

- [ ] Write assertions E1=2P/144 calls, E2=8P+4R/672, E3=10P+15N+10R/1,230, E4=2P/144; 40,000 maximum reservation/call; disjoint split IDs; fixed role rotation; no baseline relabelling. Check missing/extra/private fields and exact integer quantities.
- [ ] Run `npm run test:architecture -- --repo pact tests/unit/negotiation-plan.test.ts`, then its Fleet equivalent. Expect missing manifest/contract assertions to fail, not infrastructure.
- [ ] Implement the separate manifest, strict schemas, cell order and source/config digests. Include every initial-state, private-goal and allowed-action declaration; evaluator-only data is excluded from actor packets. Previews contain no credentials or implicit grant.
- [ ] Rerun both new tests and existing evaluation-plan/evaluation suites. Require mirrored bytes/digests and rejection of wrong world/schema, altered goals, split overlap and increased limits. Historical manifests remain identical.
- [ ] Commit only N01 files in each repo: `test: freeze two-kingdom negotiation protocol`.

## N02 — Prove economics and communication through PACT

**Depends on:** N01. **Produces:** `createNegotiationWorld(ownedFixture,cell):Promise<NegotiationWorld>`, `readNegotiationEvidence(world):Promise<NegotiationEvidence>`, `compareSolo(trade,controls):SoloComparison[]`. PACT companion owns detailed changes.

`NegotiationWorld` exposes fixture world identity, two actor bindings, `advanceTo(gameMinute)`, scoped read/dispatch adapters and owned cleanup. Adapters use real onboarding/authentication/lease/mandate checks. Evaluator access to both actors never reaches model packets.

- [ ] Assert exact 60 installments/flow, terminal `expired`, A +1 Silver and B +2 Iron versus isolated solo at the matched refill boundary. Add C02 counter-version invalidation, C03 negative actual stock delta, C04 stale/expiry/revoked-authority refusal, C05 actual default/fulfillment, and cross-world identity/cursor/receipt rejection.
- [ ] Run `npm run test:architecture -- --repo pact tests/integration/negotiation-worlds.test.ts tests/integration/negotiation-lifecycle.test.ts`; expect missing new fixture/outcome behavior to fail.
- [ ] Implement with dispatcher, social/supply services and full rules ticks. No handwritten settlement subset or SQL-inserted signature/contract/default. Stock credits are pre-decision and journalled. Create C02's seed under its initial synthetic owner goal, then record the normal current-goal amendment before agent decisions. Prove agent-only contact answers under explicit delegation.
- [ ] Rerun new tests and PACT `social-material.test.ts`, `supply-offers.test.ts`, `supply-settlement.test.ts`, `game-command-social.test.ts`, `game-command-faults.test.ts`. Include lost response after committed signature with same-ID readback, insufficient future funds and exact bond arithmetic.
- [ ] Commit N02 files: `test: verify independent negotiation worlds and supply outcomes`. Any newly reproduced production handler defect needs its own minimal regression/fix/report; no rule or authority adjustment to obtain success.

## N03 — Deliver complete current negotiation facts

**Depends on:** N02 and F02–F06. **Produces:** `negotiationState(facts:Data):NegotiationState`, `fitNegotiationState(state,maxBytes):{state,coverage}` in the new PACT adapter file.

State binds self/peer/conversation/offer/version to known/unknown coverage, game time and source refs. It includes self-relative flows, both consent states, expiry, authority/stock constraints, active contract identity, due/observed deliveries and outstanding commands. A projection selects no preferred offer.

- [ ] Test `second_offer_cannot_change_first_peer`, `missing_signatures_are_unknown`, `counter_invalidates_both_signatures`, `first_signature_is_not_income`, `closure_requires_installment_evidence`, `whole_terms_survive_serialization`, `fresh_read_invalidates_old_wait`, and `expired_offer_cannot_inherit_new_consent`. Cover both perspectives, units/bonds, pages and oversized contexts.
- [ ] Run `npm run test:architecture -- tests/unit/pact-negotiation-state.test.ts tests/unit/pact-negotiation.test.ts`; new candidate assertions must fail while existing regressions remain green.
- [ ] Reuse existing negotiation/trade validation and canonical PACT facts; add the candidate projection/packing path selected by trusted version-2 configuration. Preserve v1 output. Whole protected records either fit or produce explicit narrowing/coverage failure; no dangling ID or invented absence. Incomplete facts require a normal scoped read.
- [ ] Rerun new suites, candidate packet snapshots and F01 parity transcripts. Confirm old packets/accounting remain unchanged; guards retain rejected attempts instead of relabelling them successful WAITs. A schema read cannot be represented as a current state read.
- [ ] Commit: `feat: version complete negotiation facts for cognition`.

## N04 — Retain and deliver outcomes for later decisions

**Depends on:** N03 and F04/F05. **Produces:** `selectNegotiationEvidence(input:EvidenceSelection):EvidenceSelectionResult`, independent `reactive-cognition@2` composition and its manifest.

`EvidenceSelection` supplies current goal/entity/conversation refs, scoped originals/interpretations, current time and byte budget. The result supplies ordered causal bundles, candidate/selected/delivered/omitted IDs, missing-support reasons and policy digest. Each bundle links promise/obligation, outcome and optional interpretation. Foreign or unsupported sources are inadmissible.

- [ ] Test `missed_delivery_survives_ten_stock_updates`, `fulfilled_differs_from_default`, `originals_and_interpretation_fit_together`, `source_expiry_removes_support`, `narration_is_not_a_memory_write`, `accepted_memory_survives_restart`, `no_write_retains_original_receipt`, `v1_rank_and_packets_unchanged`, `oversize_bundle_reports_unavailable`. Verify final serialized packets and a later actual engine turn.
- [ ] Run `npm run test:architecture -- tests/unit/negotiation-evidence.test.ts tests/integration/negotiation-continuity.test.ts`; the new outcome-delivery assertion must fail before implementation.
- [ ] Implement bounded goal/peer/causal relevance, repeated-observation deduplication, whole support bundles and omission reasons. Use scoped versioned persistence and an explicit v2 codec/namespace for accepted/rejected/no-op memory-write acknowledgments; never reinterpret or backfill v1 state. Deterministic original receipts are not model-authored learning. Register v2 through F02 and compose F05 shared modules; no sibling-engine imports or changed v1 `rankEpisodes`/selection.
- [ ] Rerun selection/continuity/restart/consent/deletion suites and F01 parity. Verify no additional call/allowance/compulsory memory update. Never reconstruct a missing original from a summary. Future specialist A04 selects this policy explicitly.
- [ ] Commit: `feat: add outcome-grounded cognition version two`.

## N05 — Assess outcomes and claims

**Depends on:** N01/N02. **Produces:** `assessNegotiation(cell,evidence,solo,claimReviews):NegotiationAssessment`, `summarizeNegotiation(assessments):NegotiationSummary`. Open-prose `claimReviews` is an explicitly recorded evidence-backed manual rubric, never automatically passing self-report.

- [ ] Assert wrong peer, invented consent/income, partial delivery, default, ignored outgoing cost, unmatched solo horizon, missing coverage, absent actor follow-up and extra dispatch cannot pass. Test valid refusal/silence and mutual benefit. Unassessable claims stay unresolved; zero useful outcomes gives null cost-per-outcome; original unknown reservations remain.
- [ ] Run `npm run test:architecture -- tests/unit/negotiation-evaluation.test.ts`; missing strict assessments must fail.
- [ ] Implement stage denominators, both parties' benefit, the useful two-way dialogue rubric, critical-claim failures, 9/10 and per-family 4/5 thresholds, Wilson intervals, p50/p95/max latency and measured/reserved/unknown cost fields. A material success without useful dialogue remains an incomplete communication milestone. Count all original/corrective/specialist calls once. Use a new schema/report rather than altering old `EvaluationRecord` meaning.
- [ ] Rerun new and existing evaluation/report privacy suites. Reject mixed configs/evidence levels, duplicate world IDs, absent controls and private text. Prove results are traceable to retained sources without exporting them.
- [ ] Commit: `feat: assess negotiation fulfillment factuality and history use`.

## N06 — Offline paired lifecycle and fault acceptance

**Depends on:** N02–N05. **Produces:** `runNegotiationFixture(cell,providers):Promise<NegotiationAssessment>` using actual selected engines, host tasks, adapters and PACT handlers. `providers` are fake in this task.

- [ ] Write C01–C06 tests for contact, dialogue, same-version consent, settlement, independent controls, restart and both later decisions. Inject faults before/after model dispatch, state save, game commit and result delivery; duplicate events; lease revocation; cutoff during response; unsupported F6; packet omissions and false claims.
- [ ] Run `npm run test:architecture -- tests/acceptance/negotiation.test.ts tests/integration/negotiation-recovery.test.ts`; the red assertion must concern missing lifecycle behavior, not a missing build/fixture.
- [ ] Implement per-actor adapters/evidence capture with no private historical traces, global model-visible oracle or scripted replacement action. Fake outputs cover success and detection of bad behavior. Keep scripted diagnostic prefixes labelled; the driver never repairs model terms into the desired trade.
- [ ] Rerun new suites, existing paired PACT acceptance and affected recovery/engine tests. Mutate peer/version/delivery/goal/usage in a passing exported fixture and require rejection. Record any expected frozen-baseline weakness separately; fake-provider success proves plumbing, not strategy.
- [ ] Commit: `test: qualify two-kingdom lifecycle and recovery offline`.

## N07 — Disarmed preview and bounded execution capability

**Depends on:** N01/N05/N06. **Produces:** `prepareNegotiationProtocol(selection):ProtocolPreview`, `validateNegotiationAuthorization(protocol,grant):ValidationResult`, `executeNegotiationProtocol(protocol,grant,ports):Promise<BatchResult>`.

Preview records source/model/settings digests, cells/roles/clock modes, native limits, maxima, unique batch nonce and missing readiness items. Preview/validation have no provider/game-write capability. `grant` is a separate explicitly approved private manifest with exact fixture/world IDs, UTC start/cutoff and evidence/key references. Reuse existing ledger/window/recovery machinery, not a second spend counter.

- [ ] Test preview makes zero provider/game/database mutation calls; missing grant, changed source/model, reused/expired nonce, unsupported version, extra cells and exhausted caps fail before dispatch. Exercise every batch/cell stop condition in design §7, including a semantic failure stopping E3 but not creating replacement cells in E1. Unknown usage retains its allocation; no failed-cell replacement, grading-triggered turn or unmetered warmup. Compute batch maxima from cell classes.
- [ ] Run `npm run test:architecture -- tests/unit/negotiation-run.test.ts tests/integration/negotiation-run.test.ts` using fake ports; missing fail-closed behavior must fail.
- [ ] Implement the CLI with preview default; execution requires `--execute-approved <private-manifest>` and immediate revalidation. Controlled time advances only when no operation is in flight, executing every intervening tick. Native time follows elapsed wall time. Preserve cutoff/late answers/original IDs/actual costs; no automatic next stage or unused-budget reuse.
- [ ] Rerun gate/fault tests and current window/qualification suites. Generate an E1-only non-executable preview, with actual source/model/start fields still missing where unknown. Do not invoke providers, start a world or pass an execution flag during source work.
- [ ] Commit: `feat: prepare disarmed negotiation qualification protocols`.

## N08 — Source acceptance and handoff

**Depends on:** N01–N07. **Files:** `docs/two-kingdom-negotiation-source-acceptance-20261020.md`, `docs/two-kingdom-negotiation-status-20261020.json`; paired PACT report. Checkboxes change only with actual task evidence.

- [ ] Add acceptance assertions for baseline preservation, distinct v2, actor/world isolation, mirrored schemas, repeat migration on fresh owned fixtures, capped protocols and complete stage evidence. A status cannot claim E1–E4 completed without actual matching run records.
- [ ] Run focused source-acceptance tests and demonstrate missing implementation assertions before finalizing reporting. Do not add tests that merely mirror prose or generated output.
- [ ] Self-review all five Review Focus cases, scope/private-data diff and specialist dependencies. Record unsupported paths and production fixes separately. An extra exact-version entry is not another architecture family.
- [ ] Run Fleet check/build/boundaries and F00 unit/integration/acceptance suites; run PACT build/typecheck/lint/contracts/boundaries and isolated unit/integration suites. Use serial integration where needed. Record exact source revisions/counts/skips/failures; no hosted/live inference from local checks.
- [ ] Commit verified reports/status locally. Hand over E1's concrete preview for later execution authorization. E1–E4 remain unstarted until separately requested; worlds stay parked. No automatic push, deployment or setting change.

## Plan self-review and handoff

Coverage: scenarios/controls → N01/N02; factuality → N03; persistence/delivery → N04; communication/benefit thresholds → N05; real paths/faults → N06; budgets/clock modes → N07; source-versus-behavior reporting/architecture fit → N08.

Version 2 and quantitative thresholds are explicit proposed choices, not prior approvals. They extend the version catalog without changing the six-family target. The execution method remains inline; no method choice is reopened. This assignment saves and validates documents only and executes no task checkbox.
