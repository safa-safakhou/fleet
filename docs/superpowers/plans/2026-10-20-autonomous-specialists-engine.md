# Persistent Fleet Specialists and PACT Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` task-by-task, without delegation. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add independent persistent specialists with private goals/memory, durable communication and safe independent actions.

**Architecture:** A new engine consumes routed participant tasks over shared services. Local claims resolve resource conflicts; the existing command journal and authoritative PACT transaction own actual execution.

**Tech Stack:** Existing Node 24, TypeScript, PostgreSQL, Zod, AJV and Vitest; PACT's existing application/domain services.

**Spec:** [Approved design](../specs/2026-10-20-autonomous-specialists-and-modular-architectures-design.md); [master interfaces and constraints](2026-10-20-autonomous-specialists.md).

## Global Constraints

All master constraints apply. This is the sixth architecture, never a replacement. Autonomous specialists use one model operation per binding at a time, eight outgoing messages per envelope and two conflict negotiation rounds. Fresh fake-provider/fixture tests only. PACT changes are source/offline dependencies; no deployment or feature activation.

## Review Focus

Fan-out atomicity, persistent private state, missing-source retrieval, ambiguous command outcomes, and state changes between quote and commit have explicit tests. Missing history stays missing; receipt admission stays distinct from fulfillment.

## File map

- `src/engines/autonomous-specialists/{manifest,engine,schemas,goals,memory,routing,messaging,conflicts}.ts`: new architecture policy and state shapes.
- `src/platform/{participant-state,participant-delivery,wake-conditions,action-effects}.ts`: scope-bound persistence/delivery contracts and adapter effects.
- `src/modules/action-admission/v1/{claims,repository}.ts`: shared deterministic claim checking and receipt-linked reservations.
- `src/app/{participant-services,action-services}.ts`: concrete SQL implementations exposed through scoped ports.
- `src/environments/pact-presets.ts`, `src/games/pact/action-effects.ts`: domain-specific roles/effects mapping.
- Paired PACT paths are relative to `/Users/safa.safakhou/repos/mine/pact`, or its retained execution worktree. Fleet must never query PACT's database.

## A01 — Versioned specialist state and goal lifecycle

**Depends:** F00–F06.

**Files:** Create `src/platform/participant-state.ts`, `src/app/participant-services.ts`, `src/engines/autonomous-specialists/schemas.ts`, `goals.ts`, `migrations/023_specialist_state.sql`, `tests/integration/specialist-state.test.ts`; modify `src/db.ts`.

**Interfaces:** Produce `SpecialistScope`, `SpecialistState`, `SpecialistRepository.load/accept` from the master plan. Envelope fields: goal updates, memory/prediction updates, delivery IDs, outgoing messages, optional intent and wake conditions. Until A03/A05, unsupported message/intent writes are rejected rather than partially stored.

- [ ] Write tests `persists separate goals across restart`, `rejects stale state or foreign scope`, `cannot change its charter`, `retains abandoned goals as history`, and `preserves old continuity rows on repeated migration`. Assert equal goal IDs in two scopes do not collide and a stale envelope commits no state change.
- [ ] Run `npm run test:architecture -- tests/integration/specialist-state.test.ts`; expect missing state/repository behavior red.
- [ ] Implement additive instance/specialist/goal rows with encrypted private payloads and scope-bound associated data. Owner priority/charter revisions are separate from model subgoals. Goal states: active/suspended/completed/abandoned. Require evidence and an observable assessment/wake condition; completion is not inferred from outgoing intent. New-preset default: at most eight active goals per specialist, configurable downward; no change to old profiles.
- [ ] Rerun A01 tests plus `tests/integration/profile-continuity.test.ts` and F01 preservation. Verify deletion/consent restrictions and thirty-day detailed-memory expiry using injected time.
- [ ] Commit: `feat: persist isolated specialist goals and state`.

## A02 — Transactional event fan-out

**Files:** Create `src/platform/participant-delivery.ts`, `src/engines/autonomous-specialists/routing.ts`, `migrations/024_specialist_delivery.sql`, `tests/integration/specialist-delivery.test.ts`; modify `event-intake.ts`, `tasks.ts`, `src/db.ts`.

**Interfaces:** `route(event:ScopedEvent,subscriptions):RecipientSpec[]` is pure. `ParticipantDelivery.ingestWithin(transaction,binding,event,recipients)` owns new delivery keys and `TaskStore.upsertRecipientWithin(...)` creates participant tasks without reusing the old single-task source key.

- [ ] Write tests for one event/two recipients, duplicate page, out-of-order publication, stale cursor, transaction failure after one recipient, long opaque task keys, and gap resync. Assert:
  ```ts
  expect(deliveries.map(d => d.recipient).sort()).toEqual(["diplomacy", "resources"]);
  expect(cursorAfterRollback).toEqual(cursorBefore);
  expect(deliveriesAfterRetry).toHaveLength(2);
  ```
- [ ] Run `npm run test:architecture -- tests/integration/specialist-delivery.test.ts`; expect one-to-many assertions red.
- [ ] Implement unique `(instance,event,recipient,subscriptionVersion)` deliveries and participant-qualified task keys. Receipt, complete recipient set, task updates and cursor advance share one transaction. Migration 023 also creates the outbox and wake-condition storage consumed by A03; implement their operations in that next task. Keep old `platform_task_sources` behavior untouched. Preserve current source IDs/times/deadlines and visible omissions. A gap schedules fresh-state review for affected participants without fictional historical messages.
- [ ] Rerun A02 tests and `tests/integration/reactive-engine.test.ts`; verify old single-lane tasks and cursor behavior remain equal.
- [ ] Commit: `feat: deliver events durably to independent specialists`.

## A03 — Internal messages, waits and backpressure

**Files:** Create `src/platform/wake-conditions.ts`, `src/engines/autonomous-specialists/messaging.ts`, `tests/integration/specialist-messaging.test.ts`; extend A01/A02 repositories using the storage created by migration 023. Do not edit an applied migration to add missing fields; allocate a new additive migration under the master rule if needed.

**Interfaces:** `publishWithin(transaction,scope,messages)`, `deliverOutbox(limit,signal)`, `evaluateWake(condition,facts,time):"ready"|"waiting"|"unknown"`. `condition` is a tagged schema for event/reply/deadline/advertised predicate/periodic review, never executable text.

- [ ] Write tests for atomic state+inbox acknowledgment+outbox, duplicate messages, max eight messages, root-preserving reply chains, two-round conflict stop, unavailable game clock, critical-event backpressure and dormant wait restart. Assert a ninth message rejects the whole envelope and cannot partially deliver eight.
- [ ] Run `npm run test:architecture -- tests/integration/specialist-messaging.test.ts`; expect absent outbox/bounds assertions red.
- [ ] Implement scoped addressed outbox and deduplication. Planning defaults for new profiles: chain depth four, 100 coalesced pending concerns per specialist; critical result/deadline records are retained separately and intake stops visibly before exceeding durable capacity. Source-generated roots cannot be replaced by model-provided IDs. Reaching a bound produces a waiting/blocked reason; new model reasoning cannot manufacture a fresh root. Code evaluates registered predicates and domain clocks; no missing reply is labelled refusal.
- [ ] Rerun A02/A03 tests, including crash after outbox commit before delivery and resumption without model spin. Explicit periodic reviews retain configured enrollment and never wake all roles unnecessarily.
- [ ] Commit: `feat: add bounded specialist messaging and durable wake conditions`.

## A04 — Independent engine and relevant memory

**Files:** Create `src/engines/autonomous-specialists/manifest.ts`, `engine.ts`, `memory.ts`, `tests/unit/specialist-memory.test.ts`, `tests/integration/autonomous-specialist-engine.test.ts`, `tests/fixtures/environments/specialist-board.ts`; modify `src/app/builtins.ts` only to register this engine with honest requirements.

**Interfaces:** `AutonomousSpecialistsEngine.run(operation):Promise<void>` uses F04 scoped ports; `selectSpecialistContext({scope,goal,event,facts,memory,limits}):ContextPacket`. Packet records candidate/delivered IDs and omission reasons. `SpecialistDecisionSchema` validates A01 envelope; skill candidates use an optional versioned extension added in K02.

- [ ] Write two-specialist episodes: different goals survive three events/restart; each can submit an intent with zero coordinator model calls; unrelated event wakes neither; old missed-delivery memory and source survive repeated stock observations; expired support cannot ground an update. Assert final packet references, not merely stored rows.
- [ ] Run `npm run test:architecture -- tests/unit/specialist-memory.test.ts tests/integration/autonomous-specialist-engine.test.ts`; expect missing new engine/retrieval assertions red.
- [ ] Implement task-specific model context with role charter, owner intent, relevant goals, shared evidence and private interpretations. Protect relevant open obligations and outcomes before filling recent observations, within existing input admission; if essential evidence cannot fit, return a named omission/wait rather than silently replacing it. Model subgoal changes cannot alter authority. Two- and four-role presets come from adapter data; a generic board exercises both.
- [ ] Rerun A04 tests and F01 parity. Current PACT composition must advertise six catalog entries but report the new profile incompatible until effects support exists; no implicit fallback to reactive/coordinator.
- [ ] Commit: `feat: add persistent autonomous specialist engine`.

## A05 — Independent action admission and receipt recovery

**Files:** Create `src/platform/action-effects.ts`, `src/modules/action-admission/v1/claims.ts`, `repository.ts`, `src/app/action-services.ts`, `migrations/025_specialist_intents.sql`, `tests/integration/specialist-actions.test.ts`; modify `src/platform/contracts.ts`, `execution.ts`, `tasks.ts`, `src/db.ts`.

**Interfaces:** Produce `ActionEffects` and `ActionAdmission.reserve` from the master plan. Extend `EnvironmentSession` with `effects(intent):Promise<ActionEffects>` when advertised. `ParticipantActions.acceptAndDispatch` accepts state/outbox/intent atomically, then dispatches the immutable intent through existing `CommandExecutor`; result deliveries are deduplicated by `(commandId,resultVersion,recipient)`.

- [ ] Write tests for two individually affordable but jointly excessive spends, omitted action costs, conflicting promises, stale task fences, pending/unknown receipt, reservation expiration before versus after dispatch, and crash at each state/journal/submit/result boundary. Assert exactly one world effect for a retried command and zero second action after uncertainty.
- [ ] Run `npm run test:architecture -- tests/integration/specialist-actions.test.ts`; expect missing claims/result delivery red.
- [ ] Implement authoritative effect validation and local coordination claims under the binding lock. Use integer-string/BigInt units and the original command journal; no alternate transport. Persist immutable proposed parameters before any network operation. Known pre-dispatch expiration may release a claim; possible dispatch retains protection until original-receipt resolution. Reconstruct undelivered results from durable outbox/settled-command scan after restart. Historical commands/unknowns are untouched.
- [ ] Rerun A05 tests, `tests/integration/platform-recovery.test.ts`, `tests/integration/specialist-engine.test.ts`, and A03 atomic-envelope tests.
- [ ] Commit: `feat: admit specialist actions with shared claims and exact recovery`.

## A06 — Conflict resolution and fair bounded work

**Files:** Create `src/engines/autonomous-specialists/conflicts.ts`, `tests/integration/specialist-conflicts.test.ts`; modify specialist goals/routing, `tasks.ts`, and participant action services.

**Interfaces:** `resolveConflict(conflict,ownerPolicy):{kind:"admit"|"negotiate"|"blocked",eligibleIntentIds,reason}`; `ConflictRecord` retains implicated goals/intents, resource keys, evidence, causation root, round and outcome. Policy cannot inspect role names to invent priority.

- [ ] Write tests for unrelated work progressing, urgent authoritative deadline versus peer “urgent” prose, no starvation from repeated development events, maximum two negotiation rounds, unchanged conflict re-publication, and a pending command blocking only compatible allowed work according to the existing actor-wide uncertainty rules.
- [ ] Run `npm run test:architecture -- tests/integration/specialist-conflicts.test.ts`; expect absent policy/fairness assertions red.
- [ ] Implement deterministic owner-priority/obligation/deadline checks, then bounded peer revision if a substantive tradeoff remains. Unresolved material tradeoffs become blocked with a concrete reason. Serialize external dialogue per conversation through diplomacy. Preserve ordinary route/cohort fairness; participant queues do not multiply concurrency, budget or the old actors' pacing.
- [ ] Rerun A06, A03 and A05 tests. Verify an uncontested action requires no conflict or coordinator model call, and capped negotiation cannot schedule a new root for the same conflict version.
- [ ] Commit: `feat: resolve specialist conflicts without a central planner`.

## A07 — PACT complete effects and authoritative commit guard

**Files (PACT):** Create `packages/contracts/src/action-effects-schemas.ts`, `packages/application/src/action-effects.ts`, `packages/kingdom/src/action-effect-facts.ts`, `tests/unit/action-effects-contract.test.ts`, `tests/integration/action-effects.test.ts`, `docs/api/agent-action-effects.md`. Modify contracts/application exports, `packages/application/src/dispatcher.ts`, `game-command-handler.ts`, and affected domain services only to expose/reuse exact calculations. Record action coverage in `docs/implementation/agent-action-effects-matrix.md`.

**Interfaces:** `ActionEffectsService.quote(principal,intent):Promise<ActionEffects>`; `validateWithin(client,principal,command,guard,gameTimeMs):Promise<void>`. `GuardedCommandSchema = {command:AcceptedCommandEnvelope, guard:{schemaVersion,expectedRevision,expectedEffects,reserveConstraints}}`; `CommandDispatcher.dispatchGuarded(principal,envelope):Promise<CommandReceipt>`. Guarded canonical hashing includes both command and guard, while old command hashing stays unchanged.

- [ ] Write contract and handler tests for `game.message.send`, `game.contact.request`, `game.contact.answer`, `game.building.queue`, `game.training.queue`, `game.supply.offer`, `game.supply.counter`, and `game.supply.sign`. For each assert complete resource/quota/authority/promise effects against the actual handler, foreign owner rejection and unsupported-action rejection. Add races for tick/upkeep, competing human action, revoked mandate/lease, altered or expired offer, changed builder/training capacity, new obligation and retry after commit.
- [ ] Run from Fleet: `npm run test:architecture -- --repo pact tests/unit/action-effects-contract.test.ts tests/integration/action-effects.test.ts`; expect missing protocol/guard behavior red, with PACT's isolated schema fixture.
- [ ] Complete the action matrix first: list every read, predicate, row/range lock, writer and clock dependency for each action. Implement quotes from consistent authorized snapshots and complete effect calculations; do not reuse outlook's partial revision hash as proof of coverage. At the existing `game.admit` transaction, recompute the same action-specific facts/effects under required locks and compare the expected revision before normal handler execution. Include committed tick, authority/owner-policy and referenced-record state in the digest; exclude merely changing observation wall time, while independently checking current deadlines. Preserve existing SERIALIZABLE retry semantics: every retry revalidates the original guard, never silently rebases it.
- [ ] Rerun A07 tests plus PACT `tests/integration/game-command-faults.test.ts`, `game-command-social.test.ts`, `agent-outlook.test.ts`. Require actual handler effects/receipts/outbox to remain one transaction. Changed payload/guard with reused ID must fail; the same original ID resolves its existing receipt even if the world later pauses. Mark any action lacking complete demonstrated coverage unsupported; a failed mandatory row is an unfinished task, not a blanket capability pass.
- [ ] Commit PACT source/docs only: `feat: validate agent action effects at authoritative commit`. No deployment or new inference permission.

## A08 — Expose PACT protocol and connect Fleet presets

**Files (PACT):** Create `services/api/src/action-effects-routes.ts`; modify API composition/config/capability routes, relevant MCP registry/handlers, `docs/api/agent-action-effects.md`; create `tests/integration/action-effects-interface.test.ts`.

**Files (Fleet):** Create `src/games/pact/action-effects.ts`, `src/environments/pact-presets.ts`, `tests/unit/pact-action-effects.test.ts`, `tests/acceptance/pact-specialists.test.ts`; modify `src/environments/pact.ts`, `src/config.ts`, `src/games/pact/contracts.ts`, and adapter tests.

**Interfaces:** PACT adds authenticated `POST /v1/agent-action-effects/quote` (read-only semantics) and `POST /v1/agent-action-effects/execute` (existing command authority/lease), plus corresponding declared MCP tools. Advertise `fleet.action-effects.v1` with per-action coverage only when `PACT_AGENT_ACTION_EFFECTS_ENABLED=1`. Fleet selects it explicitly using `FLEET_PACT_ACTION_EFFECTS_VERSION`; neither flag is enabled by implementation.

- [ ] Write tests for default-off routes/advertisement, identical API/MCP semantics, correct read/write annotations, unchanged leases/scopes, owner-derived identity, unsupported actions and fabricated quote effects. In paired in-process fixtures, run resources/diplomacy and the four-role preset through normal PACT handlers with scripted model decisions.
- [ ] Run `npm run test:architecture -- --repo pact tests/integration/action-effects-interface.test.ts`, then `npm run test:architecture -- tests/unit/pact-action-effects.test.ts tests/acceptance/pact-specialists.test.ts`; expect missing adapter/routes red.
- [ ] Implement protocol wiring without a second game economy or alternate permission path. Resources owns resource checks/internal requests; diplomacy owns contact/message/supply actions; development owns building queue; defense owns training queue in this initial matrix. Unsupported military/garrison/cancellation actions are explicitly absent. Paired tests use in-process handler fixtures, never a running game host. Keep F6 `fleet.coordination.v1` advertisement separate: do not synthesize complete coordinator focuses from an incomplete effects response.
- [ ] Rerun A08 suites and existing `tests/acceptance/environment-profiles.test.ts`; demonstrate six catalog entries, old profiles unchanged and precise new-profile readiness in enabled versus disabled fixtures. Re-export/verify vendored contracts using existing repository commands only when generated source actually changed.
- [ ] Commit each repository's verified changes separately: `feat: expose and consume scoped PACT action effects`.
