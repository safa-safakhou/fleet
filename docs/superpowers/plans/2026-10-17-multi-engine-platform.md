# Fleet Multi-engine Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` to implement authorized tasks sequentially. Repository instructions require ownership without delegation. All checkboxes below describe future work, not work completed by saving this plan.

**Goal:** Preserve Fleet's current engines while adding selectable engines and reviewed environment adapters with reliable execution and optional comparisons.

**Architecture:** A versioned engine/profile registry runs behind a shared host for bindings, model admission, supervision, recovery and evidence. An environment registry adapts authorized observations/actions without importing environment rules into Fleet. The existing controller remains a compatibility path until extracted services pass parity checks.

**Tech Stack:** Existing Node 24, TypeScript, PostgreSQL 17, Fastify, React, Vitest and pinned dependencies. No new queue service or arbitrary plugin loader.

**Spec:** [Fleet multi-engine and environment architecture](../specs/2026-10-17-multi-engine-platform-design.md). [PACT companion plan](../../../../pact/docs/superpowers/plans/2026-10-17-fleet-platform-integration.md).

## Global constraints

- Fleet's purpose is to run capable, reliable agents in supported environments.
- Preserve the current controller and its optional cognition configuration as versioned compatibility engines. New engines coexist with them.
- No engine imports PACT types or accesses a game's database.
- Existing cohorts retain original identities, anchors, models, consumed allowances, pending command IDs, unknown allocations and recovery status.
- All specialist, coordinator, helper and retry work uses the same admission/accounting ledger.
- An agent needs no comparison setup to operate.
- Current configuration ceilings remain on compatibility engines: input 24,000 bytes, output at most 2,000 tokens, one to three calls/actions per turn as configured, and route-specific serialization. No phase silently raises them.
- Saving this plan authorizes no implementation, runtime installation, new account, recovery review, real model call, push or run. Future source work needs its covering assignment. Each authorized batch ends in documentation, actual verification and a local commit.

## Review focus

1. An old encrypted pending command survives generic-binding migration and is reconciled with its original ID, never resubmitted as a new intent: F2/F3 tests.
2. One provider is serial and an event-heavy cohort floods work; other due actors retain service and expired deadlines are visible: F3/F4 tests.
3. A fresh default profile accidentally enriches a legacy prompt or changes cognition/Laya behavior: F1/F3 parity tests.
4. A second environment has non-UUID actors, no peers and no reliable outcome lookup: F2 capability/unknown-outcome tests.
5. A belief cites expired, foreign or retrospectively observed evidence, or an export has revoked consent: F5/F7 tests.

## File ownership and delivery order

| Package | Existing files to extend | New implementation units |
| --- | --- | --- |
| F1 baseline | `src/runtime.ts`, `src/engine.ts`, `src/observability.ts` | `src/engines/legacy/bridge.ts`, `src/platform/profiles.ts`, baseline fixtures/manifest |
| F2 environment boundary | `src/game.ts`, `src/domain.ts`, `src/config.ts`, `src/runtime.ts`, `src/store.ts`, `src/games/pact/`, boundary script | `src/platform/contracts.ts`, `bindings.ts`, `environment-registry.ts`, `src/environments/pact.ts`, test fixture adapter |
| F3 durable host | `src/worker.ts`, `src/store.ts`, `src/recovery.ts`, `src/engine.ts` | `src/platform/tasks.ts`, `admission.ts`, `supervisor.ts`, `execution.ts`, `engine-registry.ts` |
| F4 reactive engine | PACT adapter composition and event transport | `src/platform/event-intake.ts`, `src/engines/reactive/engine.ts` |
| F5 continuity | `src/cognition.ts`, `src/cognitive-analysis.ts`, `src/continuation.ts` | `src/engines/continuity/state.ts`, profile factories |
| F6 specialists, optional | Existing model admission and task services | `src/engines/specialists/coordinator.ts`, `proposals.ts`; fake-only broker comparison |
| F7 operation/reporting | `src/server.ts`, `src/comparisons.ts`, `src/evaluation.ts`, `web/main.tsx`, `web/comparisons.tsx`, `web/runs.tsx`, `web/run-steps.tsx` | `src/platform/reports.ts`, `web/profiles.tsx`, multi-cohort comparison records |
| F8 qualification | `src/qualification.ts`, `src/release-review.ts`, `docs/operator-guide.md`, `docs/game-integration.md` | Compatibility/preservation fixtures and release proposal |

New migrations belong to Fleet and are additive. Reserve names only at implementation start: current highest migration is `012_recovery.sql`; another authorized change may allocate the next number first. Do not rename existing migrations to match this plan.

Cross-repository order: F1 → F2 → F3 → PACT P1/F4 → PACT P2/F5 → F7 + PACT P3 → F8. F6 branches after F5 and is not required to qualify the first four profiles.

## F1 — Pin and expose the existing engines (phase 0)

**Files:** Create `src/engines/legacy/bridge.ts`, `src/platform/profiles.ts`, `tests/fixtures/legacy-baseline.json`, `tests/integration/legacy-engine.test.ts`. Modify runtime composition and existing observability metadata only as needed. Preserve the reasoning body in `src/engine.ts`.

**Interfaces:** `EngineProfileRef = { id: string; version: string }`; `LegacyManifest = { sourceRevision: string; artifactDigest: string; configurationDigest: string; provenance: "recorded" | "inferred_legacy" }`; `LegacyEngineBridge.run(claim: Claim): Promise<void>` delegates to existing `Engine.run`. `legacyProfileFor(model: ModelSettings): EngineProfileRef` returns `legacy-loop@1` or `legacy-cognition@1`, preserving recall settings in the manifest.

- [ ] Write red tests named `preserves legacy inputs and accounting`, `keeps legacy cognition and recall distinct`, `labels historical provenance without rewriting history`. Use fake game/model ports and injected clocks/IDs. Assert, for example:

  ```ts
  expect(bridged.modelInputs).toEqual(pinned.modelInputs);
  expect(bridged.pendingCommandId).toBe(pinned.pendingCommandId);
  expect(bridged.unknownAllocation).toBe(pinned.unknownAllocation);
  expect(legacyProfileFor({ route: "ollama", model: "fixture" })).toEqual({ id: "legacy-loop", version: "1" });
  ```

- [ ] Run `npx vitest run tests/integration/legacy-engine.test.ts --maxWorkers=1` in the isolated `fleet_test` setup. Expected red profile/bridge assertions, not a production connection or fixture failure.
- [ ] Implement the bridge/profile resolver and a credential-free manifest from the pinned revision. Add additive run metadata without changing consumed configuration or historical ciphertext. Baseline fixtures contain synthetic inputs only.
- [ ] Rerun the focused suite plus existing `tests/integration/engine.test.ts`, `cognition.test.ts`, `continuous.test.ts` and `recovery.test.ts`. Require identical decision-visible inputs, game commits and lifetime accounting; verify default composition still selects the legacy path.
- [ ] Document the baseline contract and actual parity coverage; run `npm run check`, `npm run check:boundaries`, `git diff --check`; commit only F1 files and its report.

## F2 — Register environments and generic bindings (phase 1)

**Files:** Create `src/platform/contracts.ts`, `src/platform/bindings.ts`, `src/platform/environment-registry.ts`, `src/environments/pact.ts`, `tests/fixtures/environments/board.ts`, `tests/integration/environment-bindings.test.ts`, `tests/unit/environment-registry.test.ts` and an additive migration. Extend existing integration docs, runtime/configuration and boundary checking.

**Interfaces:** Define these shared contracts here; later packages consume them rather than creating alternatives.

```ts
type OutcomeStatus = "confirmed" | "rejected" | "pending" | "unknown";
type DomainTime = { clockId: string; value: string };
type EnvironmentRef = { id: string; version: string; instanceId: string };
type BindingRef = { id: string; environment: EnvironmentRef; accountRef: string; actorRef: string; entityRef: string };
type Observation = { schemaId: string; revision: string; observedAt: string; environmentTime: DomainTime; sourceRefs: string[]; payload: Data; coverage: Data };
type ActionIntent = { commandId: string; bindingId: string; schemaId: string; expectedVersion?: string; payload: Data };
type ActionOutcome = { commandId: string; status: OutcomeStatus; code: string; sourceRefs: string[] };
type EnvironmentEvent = { id: string; type: string; sourceRef: string; observedAt: string; environmentTime: DomainTime; deadline?: DomainTime; metadata: Data };
type EventPage = { events: EnvironmentEvent[]; nextCursor: string | null; resyncRequired: boolean };
type Capabilities = { timing: "turn" | "realtime"; events: "native" | "poll" | "none"; idempotency: "native" | "none"; outcomeLookup: boolean; parallelReasoning: boolean; social: boolean; simulationControls: boolean };
type CapabilityRequirements = { eventDelivery?: ("native" | "poll")[]; timing?: ("turn" | "realtime")[]; nativeIdempotency?: boolean; outcomeLookup?: boolean; parallelReasoning?: boolean; social?: boolean; simulationControls?: boolean };
interface EnvironmentSession {
  observe(query: Data): Promise<Observation>;
  catalog(): Promise<Tool[]>;
  execute(intent: ActionIntent): Promise<ActionOutcome>;
  resolve(commandId: string): Promise<ActionOutcome>;
  events?(cursor: string | null): Promise<EventPage>;
  close(): Promise<void>;
}
interface EnvironmentAdapter {
  ref: { id: string; version: string };
  capabilities: Capabilities;
  connect(binding: BindingRef): Promise<EnvironmentSession>;
}
```

`EnvironmentRegistry.resolve(ref)` returns a statically registered adapter or `UNSUPPORTED_ENVIRONMENT`. Credentials are resolved through an integration-owned binding repository and never included in `BindingRef`. Required capabilities/schema versions are validated before dispatch. `resolve` returns `unknown` when reliable lookup is unavailable; this must not authorize replay.

- [ ] Write tests `binds opaque actor IDs`, `preserves legacy vault identity and pending receipt`, `rejects duplicate controlling binding`, `refuses missing capabilities before model dispatch`. Assert:

  ```ts
  expect(binding.actorRef).toBe("seat:red");
  expect(binding.entityRef).toBe("board:room-east");
  expect(after.legacyCiphertext).toEqual(before.legacyCiphertext);
  expect(model.calls).toBe(0); // incompatible profile
  expect(await session.resolve("lost-command")).toMatchObject({ status: "unknown" });
  ```

- [ ] Run both new suites; expect unsupported/new registry/binding assertions to fail. Keep the existing `game-adapter.test.ts` fixture passing as the initial baseline.
- [ ] Implement generic bindings and reviewed registry composition, using a PACT compatibility adapter around existing `GameAdapter`/`GamePort`. Keep one selected environment per deployment. Retain legacy columns, IDs, ciphertext bindings and terminal-state uniqueness. Provide environment-specific labels/default goals/enrollment hooks; optional social capabilities must not force contacts onto a board-game fixture.
- [ ] Run new and existing game-adapter/enrollment/release-preservation suites. Verify a full second-environment action/receipt cycle with non-UUID external IDs, without PACT nouns, credentials or database imports. Extend the boundary scan to all new core/engine directories and include a forbidden-import fixture.
- [ ] Record the compatibility/migration proof; run relevant full Fleet checks; commit F2 and update `docs/game-integration.md`. This certifies the fixture boundary, not a new real game.

## F3 — Build durable admission, actor lanes and shared execution (phase 1)

**Files:** Create `src/platform/tasks.ts`, `admission.ts`, `supervisor.ts`, `execution.ts`, `engine-registry.ts`, `tests/integration/platform-host.test.ts`, `tests/integration/platform-recovery.test.ts` and additive task/claim migrations. Modify worker/store/recovery and adapt the bridge only after parity passes.

**Interfaces:**

- `TaskRecord = { id; bindingId; profile: EngineProfileRef; key; sourceRefs; state; deadline?: DomainTime; wake?: Data }`, where state is one of the six design states; fields not otherwise typed are strings except `sourceRefs: string[]`.
- `TaskStore.upsertFromEvent(binding: BindingRef, event: EnvironmentEvent, key: string): Promise<TaskRecord>` and `claim(workerId: string, now: Date): Promise<TaskClaim | null>` use a durable generation/fence. `TaskClaim` carries the existing `Claim`, task ID and immutable profile ref.
- `ModelAdmission.decide(claim: TaskClaim, request: Parameters<ModelPort["decide"]>[0]): Promise<ModelResult>` wraps the existing `ModelPort.decide` contract and existing usage reservation semantics. `ModelResult = Awaited<ReturnType<ModelPort["decide"]>>`; no second token ledger.
- `CommandExecutor.submit(claim, intent: ActionIntent): Promise<ActionOutcome>` persists the original pending ID/payload before network dispatch and reconciles through the selected session. `EngineContext = { claim; binding; task; observation; model; commands; observe; eventRefs }` uses F2 types plus these services.
- `AgentEngine = { ref: EngineProfileRef; requiredCapabilities: CapabilityRequirements; run(context: EngineContext): Promise<void> }`. `EngineRegistry.resolve(ref: EngineProfileRef): AgentEngine`; unknown refs fail before dispatch. A reactive engine accepts either native or polled event delivery according to its explicit requirements.
- `OperationSupervisor.run(claim, operation): Promise<void>` creates a per-operation abort controller and drains or fences independently on stop. `observe(query)` uses the selected session; `eventRefs` are retained source IDs, not raw unbounded bodies.

- [ ] Write concurrency/crash tests: two different bindings can progress with a parallel fake route; the same binding cannot run twice; a serial route remains at one call; event-heavy actors cannot starve due scheduled actors; stopping one operation does not abort another; unknown usage/pending commands survive restart.

  ```ts
  expect(serialProvider.maxInFlight).toBe(1);
  expect(parallelProvider.maxInFlight).toBe(2);
  expect(sameBinding.maxActiveTasks).toBe(1);
  expect(recovered.pendingCommandId).toBe(original.pendingCommandId);
  expect(recovered.unknownAllocatedTokens).toBe(original.unknownAllocatedTokens);
  expect(secondActor.signal.aborted).toBe(false);
  ```

- [ ] Run the new focused integration suites to obtain meaningful red admission/recovery assertions.
- [ ] Implement durable task claims and fair round-robin admission across ready cohorts, with owner priority/deadline ordering within each cohort. Provider capacity and per-cohort allowance remain separate constraints. Persist tasks/cursors/fences in PostgreSQL, not in a process-only promise array. Reuse the existing store/accounting and exact-receipt flow, extracting execution only behind F1 parity. Lease opening remains immediately before actual commitment, not around all reasoning. Keep Codex lock/concurrency rules unchanged.
- [ ] Run host/recovery suites plus scheduler, worker-liveness, admission, Codex and release-preservation suites. Exercise crashes before reserve, after reserve/before provider result, before command submission, after server commit/before response and after task completion/before local acknowledgement. Require no duplicate debit/action and explicit next steps for unresolved cases.
- [ ] Document fairness, stop/drain, compatibility-engine scheduling and route limitations. Run `npm run check`, all unit/integration tests, build and boundary checks; commit F3 with actual evidence.

## F4 — Add event-aware profiles alongside scheduled profiles (phase 2)

**Dependencies:** F3 and PACT P1's versioned feed contract. Fake event transport may be implemented before P1; actual PACT qualification waits for it.

**Files:** Create `src/platform/event-intake.ts`, `src/engines/reactive/engine.ts`, `tests/integration/reactive-engine.test.ts`, event-wake configuration/migration and PACT event transport under `src/games/pact/`. Extend registry/configuration, not the legacy prompt body.

**Interfaces:** `EventIntake.ingest(binding, page: EventPage): Promise<{ inserted: number; cursor: string | null }>` atomically stores deduplicated sources/task effects and advances the cursor. `WakePolicy = { enabled: boolean; categories: string[]; periodicReviewMinutes: number; quietCategories: string[] }`. `ReactiveEngine.run(context)` uses F3 services; its profile IDs are `reactive-basic@1` and later `reactive-cognition@1` after F5.

- [ ] Write tests `groups two completions for one goal`, `keeps separate conversations`, `does not infer on receipt without enrollment`, `deduplicates after restart`, `resyncs expired cursor without fabricated history`, `marks missed battle lock before model dispatch`.

  ```ts
  expect(goalTasks).toHaveLength(1); // two related source events retained
  expect(conversationTasks).toHaveLength(3);
  expect(unenrolled.modelCalls).toBe(0);
  expect(replayed.newSourceCount).toBe(0);
  expect(afterExpiredDeadline.modelCalls).toBe(0);
  expect(afterExpiredDeadline.code).toBe("DEADLINE_MISSED");
  ```

- [ ] Run the focused suite to red; treat absent PACT feed capability as `UNSUPPORTED_CAPABILITY`, not as permission to open a human session stream.
- [ ] Implement bounded polling intake, task coalescing and explicit event-wake enrollment on new cohorts. Native and polled delivery are labeled. Preserve timed reviews and conditional waits; apply mutes/categories in wake policy. Enforce model caps before every dispatch, even during a flood. On a cursor gap, persist gap evidence, obtain a fresh authorized snapshot and resume from the server resync token.
- [ ] Run reactive, admission, scheduler, legacy parity and PACT-adapter tests. Verify 100 duplicate/flood events do not produce 100 model calls; each actual call still needs remaining allowance and provider admission. Verify out-of-order events do not regress current state.
- [ ] Document the new profiles and actual PACT feed versions; commit only after boundary/build/type/behavior checks pass. Existing cohorts are not enrolled by migration.

## F5 — Connect grounded continuity, self-models and relationships to tasks (phase 3)

**Dependencies:** F4 and PACT P2's outlook contract for PACT integration; non-PACT continuity remains capability-based.

**Files:** Extend `src/cognition.ts`, `src/cognitive-analysis.ts`, `src/continuation.ts`; create `src/engines/continuity/state.ts`, `tests/integration/profile-continuity.test.ts` and profile factories/metadata.

**Interfaces:** `ContinuityModule.context(binding, task, observation): Promise<Data>` and `apply(binding, task, expectedVersion, update): Promise<{ accepted: boolean; version: number; code: string }>` wrap existing grounding/state services. `EvidenceLink = { sourceRef: string; observedAt: string; taskId: string }`. A self-model references actual capabilities, needs and dependencies; owner values are stored separately from subjective beliefs. No PACT resource/unit type enters this module.

- [ ] Write tests for a pre-action prediction, subsequent contradictory evidence, a fulfilled promise during a lost battle, foreign/expired sources and an authorized non-social environment.

  ```ts
  expect(belief.sourceRefs).toContain(actualIncomingSource);
  expect(lostBattle.fulfilment).toBe("fulfilled");
  expect(lostBattle.motiveProven).toBe(false);
  expect(foreignUpdate.accepted).toBe(false);
  expect(missingEvidence.predictionStatus).toBe("unresolved");
  expect(legacyAfter.modelInputs).toEqual(legacyBefore.modelInputs);
  ```

- [ ] Run focused continuity tests to red alongside the existing cognition suite, which protects source attribution/retention.
- [ ] Implement the task/evidence/self-model links by reusing current encrypted journals, source checks, confidence limits and deduplication. Add `reactive-cognition@1`. Preserve every legacy cognition setting and existing 30-day expiry. Label the full memory/planning/reflection/belief bundle honestly; it is not an isolated belief ablation. Permit no update/no communication when evidence or strategy does not warrant it.
- [ ] Run continuity/cognition/continuation/envelope/grounding suites with growing histories, omitted evidence, stale versions, restart and consent revocation. Verify a saved prediction precedes its test evidence, and invalid cognition does not manufacture command success.
- [ ] Update cognition/profile/operator instructions and a completion report. Run full relevant checks and commit F5. No model weights are trained or new exchanges forced.

## F6 — Compare coordination and add a focused-worker engine (phase 4, optional)

**Dependencies:** F5; PACT's parallel-reasoning specification correction before within-kingdom overlap. This package does not gate first-four-profile qualification.

**Files:** Create `src/engines/specialists/proposals.ts`, `coordinator.ts`, `tests/unit/coordination-options.test.ts`, `tests/integration/specialist-engine.test.ts` and a fake-only broker candidate under `tests/fixtures/engines/`.

**Interfaces:** `Proposal = { taskId: string; intent: ActionIntent; evidenceRefs: string[]; expectedOutcome: Data; claims: Data[]; conflicts: string[]; validUntil?: DomainTime }`. Claims use environment-advertised structured resource/authority/promise schemas. `ProposalCoordinator.select(proposals: Proposal[], observation: Observation): Promise<ActionIntent[]>` uses shared model admission where reasoning is needed. `SpecialistCoordinatorEngine.run(context: EngineContext)` admits focused tasks, then commits through F3. Fake broker candidate has `reserve(proposal: Proposal): Promise<{ admitted: boolean; conflictRefs: string[] }>` with shared resource/authority/promise conflict checks supplied by the environment integration, never invented game permissions. Free-form language consistency remains an explicitly labeled judgment, not a formal guarantee.

- [ ] Write tests where defense and negotiation both want the same resources, two legal messages make conflicting promises, the proposal goes stale before commit, and only three call slots remain.

  ```ts
  expect(committedIncompatibleStructuredPromises).toBe(0);
  expect(duplicateResourceDebits).toBe(0);
  expect(totalCalls).toBeLessThanOrEqual(3); // e.g. two workers plus coordinator
  expect(staleProposal.status).toBe("rejected");
  expect(allCalls.every(call => call.parentBudgetId === budget.id)).toBe(true);
  ```

- [ ] Run both coordination-option and specialist suites to red. The comparison must include coordinator overhead and broker conflict/denial outcomes, not just wall-clock speed.
- [ ] Implement the coordinator engine with focused contexts and shared minimal resources/promises/owner priorities. Fan-out is admitted from actual remaining call slots; five source events do not promise five agents. Compare the fake independent-submit candidate under identical budgets/failure schedules. Keep independent real execution disabled until its reservation/promise protocol has separately passed and an engine version is selected.
- [ ] Run source, stale-state, cancellation, late-result, stop/restart and accounting cases for both options. Report latency, missed deadlines, useful outcomes, conflict rate and all-call cost. Test provider parallelism restrictions separately from simulated worker concurrency.
- [ ] Record the comparison and recommendation with limitations. Commit the coordinator implementation after full checks; qualify its new profile separately before any real run.

## F7 — Make profiles operable and comparisons optional (phase 5)

**Files:** Extend `src/server.ts`, `src/comparisons.ts`, `src/evaluation.ts`, `web/main.tsx`, `web/comparisons.tsx`, `web/runs.tsx`, `web/run-steps.tsx`; create `src/platform/reports.ts`, `web/profiles.tsx`, `tests/integration/profile-console.test.ts`, `tests/unit/profile-reports.test.ts` and additive comparison metadata if needed.

**Interfaces:** `createProfileDraft(input): Promise<{ cohortId: string; profile: EngineProfileRef }>` creates only inactive controller records. `compareCohorts(ids: string[]): Promise<Data>` links two or more existing permitted cohorts without reassigning accounts. `exportReport(scope: "private" | "shareable", ids): Promise<Data>` uses versioned schemas, consent filtering and explicit missing-data coverage.

- [ ] Write tests for normal operation without a study, a four-cohort comparison, immutable consumed profiles, configuration drift, revoked/expired detail and sanitized export.

  ```ts
  expect(ordinaryAgent.studyId).toBeNull();
  expect(comparison.cohorts).toHaveLength(4);
  expect(draft.createdGameAccounts).toBe(0);
  expect(draft.modelCalls).toBe(0);
  expect(shareable.privateMessages).toBeUndefined();
  expect(report.unknownAllocatedTokens).toBe(originalUnknownAllocation);
  ```

- [ ] Run the new focused suites to red; use existing fake console fixtures, never real operator/game accounts.
- [ ] Implement profile selection/compatibility preview, normal cohort operation and optional multi-cohort comparison. Extend Runs with engine/environment/task/trigger refs and links from expectation through actual outcome. Preserve readable input/output/raw JSON and existing capture bounds. Separate private report downloads from shareable aggregates and give exports an explicit version/coverage section.
- [ ] Run existing console/comparisons/observability/rendering suites and the new profile suites. Inspect synthetic desktop and 390-pixel views: baseline selection, incompatible adapter feedback, a four-profile comparison and missing historical evidence. Verify viewing/exporting does not call models or acknowledge game messages.
- [ ] Document the workflow and definitions; run full relevant checks/build/boundaries; commit F7. Do not declare a universal intelligence winner or silently choose a run budget.

## F8 — Qualify and prepare a concrete release/run proposal (phase 5)

**Dependencies:** F1–F5, F7, PACT P1–P3; include F6 only when its profile is selected.

**Files:** Extend `src/qualification.ts`, `src/release-review.ts`, operator/integration guides; create `tests/integration/multi-engine-preservation.test.ts`, `tests/acceptance/environment-profiles.test.ts`, a compatibility matrix and a release/run proposal under `docs/`.

**Interfaces:** `ProfileEvidence = { kind: "deterministic_fake" | "real_provider"; profile: EngineProfileRef; environment: EnvironmentRef; passed: boolean; sourceRefs: string[]; coverage: Data }`; `ProfileQualification = { offlinePassed: boolean; liveQualified: boolean; missing: string[]; evidenceRefs: string[] }`. `qualifyProfile(profile: EngineProfileRef, adapter: EnvironmentAdapter, evidence: ProfileEvidence[]): ProfileQualification` composes existing `qualifyOutput` checks and separates fake/provider evidence. `reviewProfileRelease(manifest: Data): ReturnType<typeof reviewRelease>` composes the existing preservation review, retaining all unresolved gates.

- [ ] Write tests requiring baseline preservation, advertised capability acceptance, unknown-usage retention, pending-command reconciliation and explicit distinction between fake/live evidence.

  ```ts
  expect(fakeOnly.liveQualified).toBe(false);
  expect(preservation.identitiesUnchanged).toBe(true);
  expect(preservation.pendingIdsUnchanged).toBe(true);
  expect(preservation.unknownHistoryUnchanged).toBe(true);
  expect(unselectedRun.executionEnabled).toBe(false);
  ```

- [ ] Run acceptance/preservation tests to red with isolated fixtures, not the installed runtime.
- [ ] Implement qualification aggregation and prepare the actual release proposal: revisions, compatibility, encrypted rollback, quiescent boundary, state verification, exact selected cohorts/routes, caps/deadlines, stop conditions and monitoring. A source rollback retains the newest database; it does not undo committed game actions or erase task/history migrations.
- [ ] Run `npm run check`, `npm run check:boundaries`, `npm test`, `npm run test:integration`, `npm run build`, `npm audit` and PACT's counterpart checks on their isolated setups. Record actual commands/results and missing provider certification. Simulated deadlines/seeds do not prove real-host response time or deterministic LLM outputs.
- [ ] Commit the verified source/qualification documentation. Present the concrete proposal before any separately authorized installation, provider qualification or new account/run. Preserve existing server/local recovery gates and terminal populations.

## Self-review and handoff

Coverage: F1 preserves baseline; F2 proves environment independence; F3 supplies reliable/fair execution; F4/P1 add events; F5/P2 connect grounded continuity and outlooks; F6 compares both worker choices; F7 keeps operation primary and comparisons optional; F8/P3 distinguish offline readiness from real acceptance. The five review-focus failures are assigned above.

This is a phased implementation plan, not a claim that source work is assigned or tests above have run. The next source package is F1 under a covering implementation assignment. Execution stays native/sequential without delegation.
