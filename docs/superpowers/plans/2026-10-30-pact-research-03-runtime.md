# PACT Durable Runtime and Workers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans`, inline without delegation. Checkboxes are future implementation under a covering assignment.

**Goal:** Add durable task recovery and a replaceable Python research worker without weakening PACT authority or effect accounting.

**Architecture:** Temporal owns only explicitly enrolled task lifecycles. Existing SQL-backed claims/ledger/commands remain authoritative at effect boundaries; Pydantic AI composes worker-local reasoning and XState expresses pure local policy.

**Tech Stack:** Temporal TypeScript SDK, Node 26, PostgreSQL 17, Protobuf/gRPC, isolated Python 3.12/Pydantic AI, XState.

**Spec:** [Design §§3–6, 11](../specs/2026-10-30-pact-research-engine-design.md); [master constraints](2026-10-30-pact-research-engine.md). Depends on C1–C3 and O1–O3.

## Global Constraints

- One scheduler owner per task. Existing cohorts/anchors and consumed profiles do not migrate automatically.
- All effects use persisted scoped kernel ports; unknown model usage retains its full reservation and original identity.
- Effectful Temporal activities use `maximumAttempts: 1`; no nested framework durability, silent fallback, unobserved repair or automatic whole-agent rerun.
- PACT only; no live enrollment, execution, model/game calls or deployments under source/planning work.
- Private observation retains 30 days; no private payloads in Temporal histories or framework logs. Artifact chunks at most 1 MiB, event pages 200/max 500.

## Review Focus

1. Outbox/workflow redelivery cannot create dual task ownership — R1.
2. A worker attempts direct network access or forged actor scope — R2.
3. Restoring XState cannot re-invoke an action or reinterpret a stale game clock — R3.
4. A late worker reply after cancellation may settle usage but cannot authorize a new effect — R4.
5. A new worker preserves observed PACT contract semantics rather than only matching JSON — R5.

---

## File responsibilities

Create `src/research/orchestration/{client,outbox,workflow,activities,worker,reconcile}.ts`; deterministic workflow code imports no database/provider/game libraries. Create `src/research/broker/{server,model,game,checkpoints,session}.ts` to translate authenticated worker RPCs into current scoped services. Create `src/research/workers/{python,statechart}.ts` and `src/research/policies/pact-scripted.ts` as adapters, not a second kernel.

Python lives in `workers/research/src/fleet_research/{worker,agent,broker_model,tools,checkpoints,telemetry}.py`; its generated contracts are C1 outputs. `src/app/composition.ts` and builtins select explicit recipes and task owners. Existing schedulers remain responsible for existing tasks only.

## R1 — Own new task lifecycles through Temporal

**Files:** Create orchestration modules above, `migrations/046_temporal_task_ownership.sql`, `tests/integration/research-temporal.test.ts`, `tests/fixtures/research/temporal-history.json`; modify `src/platform/tasks.ts`, `src/platform/supervisor.ts`, `src/app/composition.ts` and the existing worker admission selection.

**Consumes:** C2 manifest digest, C3 step identity, O1 events and existing task/wake/claim services.

**Produces:** `TemporalTaskOwner.enroll(taskId: string, manifestDigest: string): Promise<void>` for trusted unconsumed explicit enrollment; `.deliver(outboxId: string): Promise<void>`; workflow `pactTaskWorkflow(input: { taskId: string; manifestDigest: string }): Promise<void>` with signals keyed by immutable wake/stop IDs. SQL `scheduler_owner` is explicit and historical defaults preserve the current path.

- [ ] Write `one_owner_across_delivery_failure`: SQL commit before Temporal ack, duplicate signal, worker restart, completed task before ack, workflow replay after version change and continue-as-new with a repeated wake. Assert one claim/effect identity and preserved anchor. No legacy/platform scheduler may admit a Temporal-owned task.
- [ ] Run `npx vitest run tests/integration/research-temporal.test.ts`; expect RED using the Temporal test environment and fake effect ports.
- [ ] Implement outbox with immutable delivery IDs and reconciliation, deterministic waits and typed reference-only payloads. Set retry/heartbeat/timeouts explicitly; use `maximumAttempts: 1` on execution activities. An ambiguous execution failure parks in `awaiting_reconciliation`, without starting a replacement activity that repeats effects. Bound pure lookup/outbox retries and workflow history; pin worker build/version routing for replay compatibility. Terminal task state is projected from recorded execution evidence, not assumed from activity completion.
- [ ] Run the same test plus replay of the synthetic frozen history; expect PASS across service outage/restart, no legacy enrollment and no private content in history/search attributes.
- [ ] Review/checkpoint R1 with task-state transition and retry-owner tables in `docs/research/runtime.md`.

## R2 — Implement the scoped Python/Pydantic AI worker

**Files:** Create broker/worker/Python modules above, `workers/research/Dockerfile`, `ops/research/worker-isolation.yaml`, `tests/integration/research-worker-rpc.test.ts`, `workers/research/tests/test_agent.py`, `workers/research/tests/test_isolation.py`; modify root composition and Python package/locks for actual dependencies.

**Consumes:** C1 RPCs/types, C3 journal, existing `ScopedServices`, O1/O2 recorder/artifacts and R1 execution references.

**Produces:** `ResearchBroker.requestModel(scope, key, request): Promise<BrokerResult>`, `.readGame(scope, key, query)`, `.proposeAction(scope, key, proposal)`, `.checkpoint(scope, expectedVersion, state): Promise<CheckpointRef>`, `.lookup(scope, key): Promise<BrokerResult>`; worker `run_operation(input: WorkerInput) -> WorkerResult`. `WorkerInput/Result` are added to C1 wire definitions; result contains proposal/checkpoint refs, not a claim that PACT effects succeeded.

- [ ] Write `broker_is_the_only_effect_path`: a Pydantic agent with fake model/read tools produces a valid PACT proposal through the broker, one allocation per actual call and full source refs. Assert forged actor/epoch, unknown tool, direct provider/game endpoint, database connection and filesystem escape are refused. A worker-supplied usage/receipt claim cannot settle the ledger; only actual provider/PACT result paths can. A helper role action returns `AUTHORITY_DENIED` without dispatch.
- [ ] Run `npx vitest run tests/integration/research-worker-rpc.test.ts` and `uv run --project workers/research --group dev pytest workers/research/tests/test_agent.py workers/research/tests/test_isolation.py -q`; expect RED.
- [ ] Implement a custom Pydantic AI model adapter calling Fleet, not the framework's direct provider clients. Disable implicit output/tool retries; explicit repairs allocate new observed steps. Implement scoped authenticated sessions, deadline propagation, cancellation and checkpoint CAS. Expose only allowlisted broker tools and participant/skill ports, never credentials. Enforce production container egress/mount/resource policy and label native development mode as lacking that isolation certificate.
- [ ] Run both test commands plus the isolation test inside the new owned container network; expect PASS with direct egress blocked even if the worker ignores its API wrapper. Log only sanitized operational fields; all prepared messages/results pass O3 capture.
- [ ] Review/checkpoint R2; record exact Pydantic API/model/tool behavior and worker image digest rather than claiming language choice proves accuracy.

## R3 — Add pure XState policies and compatible checkpoints

**Files:** Create `src/research/workers/statechart.ts`, `src/research/policies/pact-scripted.ts`, `tests/unit/research-statechart.test.ts`, `tests/integration/research-statechart.test.ts`; modify the recipe registry and manifest capability rules.

**Consumes:** C2 semantic manifest, R2 checkpoint port, typed PACT observation/preconditions and O1 state-transition events.

**Produces:** `StatechartPolicy.step(input: PolicyInput, checkpoint?: WorkerCheckpoint): { proposal: DecisionProposal; checkpoint: WorkerCheckpoint }`; a versioned scripted PACT fixture policy with advisory/action/wait roles. `PolicyInput` contains explicit clock, observation and source refs; effects are proposals only.

- [ ] Write `restoration_is_pure`: select a scripted construction proposal, checkpoint/reload twice, then deliver stale facts, a different policy version and a paused/mismatched PACT clock. Assert zero effect calls inside the chart, version/freshness refusal, stable proposal refs and transition evidence. `expect(networkCalls).toBe(0)`.
- [ ] Run `npx vitest run tests/unit/research-statechart.test.ts tests/integration/research-statechart.test.ts`; expect RED.
- [ ] Implement pure transition/guard functions with explicit clock/random inputs; forbid invoked network actors in qualified charts. Persist snapshots through the kernel CAS port with component version and consumed event refs. Show the selected state/transition without making XState the global task scheduler.
- [ ] Run the same tests, including repeat wake and restored already-completed proposal; expect PASS and no repeated command submission.
- [ ] Review/checkpoint R3 with a synthetic statechart trace for U2.

## R4 — Qualify cross-boundary cancellation and recovery

**Files:** Create `src/research/orchestration/reconcile.ts`, `tests/integration/research-runtime-recovery.test.ts`, `tests/fixtures/research/crash-points.ts`; modify broker checkpoints/session, task supervisor and worker abort handling only where needed.

**Consumes:** R1 owner, R2 broker/worker, R3 checkpoint rules, C3 journal and O1 coverage.

**Produces:** `RuntimeReconciler.inspect(taskId: string): Promise<RecoveryStatus>` and `.reconcileKnown(taskId: string): Promise<RecoveryStatus>` for already authorized deterministic reconciliation only. `RecoveryStatus` distinguishes stop requested/fenced/acknowledged, pending effects, unknown usage and review required; it never auto-approves uncertainty.

- [ ] Write `crash_at_every_dispatch_boundary`: before/after reserve, durable input, provider dispatch/result, worker checkpoint, PACT acceptance/receipt and task ack. Add cancel-before-dispatch, cancel-during-call, late reply and lost lease. Assert original IDs, no hidden re-execution, known usage settled, unknown allocation retained and `expect(staleNewEffects).toBe(0)`.
- [ ] Run `npx vitest run tests/integration/research-runtime-recovery.test.ts tests/integration/platform-recovery.test.ts tests/integration/skill-recovery.test.ts`; expect new cross-boundary assertions RED.
- [ ] Implement reconcile-by-original-reference, server-validated epoch checks and stable step-map resume. A partial worker execution cannot simply restart with new step IDs. Record cancellation progress and late outcomes separately; do not equate process exit with provider cancellation or command rollback.
- [ ] Run the same tests with Temporal/broker connectivity loss and repeated reconciliation; expect PASS, no reservation refunds on ambiguity and no other actor's operation aborted.
- [ ] Review/checkpoint R4, retaining synthetic fault histories and explicit unresolved states.

## R5 — Publish PACT recipes and worker replacement conformance

**Files:** Create `src/research/recipes/pact-reference.ts`, `tests/integration/research-recipe-conformance.test.ts`, `tests/fixtures/research/pact-reference.json`, `docs/research/recipes.md`; modify `src/app/builtins.ts`, architecture compiler adapter, `web/architecture-fields.tsx` and scoped participant/skill adapters.

**Consumes:** C2 manifests, R1–R4 runtime/worker ports, existing PACT effect/observation semantics and specialist/skill contracts.

**Produces:** Versioned `pact-research-deliberative@1`, `pact-research-scripted@1`, `pact-research-advisory@1` recipes and an existing-specialist bridge. Initial status is experimental; Q3 alone can certify the tested fixture manifest. Worker conformance corpus is language-independent.

- [ ] Write `same_contract_different_worker`: TS fixture and Python worker consume identical recorded inputs and fake model replies, produce equivalent normalized proposals/source refs, refuse the same stale/forbidden actions and preserve pending receipts. Specialist roles retain their own memory and arbitration owner; advisory cannot acquire action authority.
- [ ] Run `npx vitest run tests/integration/research-recipe-conformance.test.ts tests/integration/architecture-parity.test.ts tests/integration/scoped-engine-context.test.ts`; expect new recipe assertions RED.
- [ ] Implement explicit recipe registration, current-engine adapters and typed role capabilities. Existing draft configuration fields expose the selected PACT policy/memory/context/worker options through C2 preview validation; consumed profiles remain locked and saving starts nothing. Do not force every existing engine into Python or change legacy prompt/cognition semantics. Export/checkpoint compatibility must be demonstrated by replacement fixture workers, not asserted from having an interface.
- [ ] Run the same tests and `npm run check:boundaries`; expect PASS and zero mutation/enrollment of consumed historical cohorts.
- [ ] Review/checkpoint R5; hand the recipe/version matrix and conformance fixtures to memory, evaluation and Q1.
