# Autonomous Specialists and Independent Architectures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Repository instructions prohibit delegation, including subagent implementation and review. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all existing Fleet architectures independently maintainable and consistently launchable, and add persistent autonomous specialists with learned procedural skills.

**Architecture:** Trusted versioned manifests select independent engine implementations over shared scoped services. The new specialist engine owns persistent goals, memory and addressed work; skills provide advisory procedures and qualified bounded execution through the same accounting and command boundary.

**Tech Stack:** Existing Node 24, TypeScript, PostgreSQL, Fastify, React/Vite, Zod, AJV and Vitest. No new agent framework, broker, vector database or runtime dependency.

**Spec:** [Approved design, including skills](../specs/2026-10-20-autonomous-specialists-and-modular-architectures-design.md).

**Approval and status:** Founder approved the design and requested this plan on 20 October 2026. Design approval does not mean implementation has run. All 26 tasks in the linked parts start unchecked. Planning baselines: Fleet `c2f7bbd` (application source remains the reviewed `421ad90` source) and PACT `1d93da690cd1a2ae4821b799ca79e5961252e3c8`. The [source review](../../architecture-review-20261020.md) records evidence and existing coupling.

**Related proposed milestone — 20 October:** The [two-kingdom negotiation plan](2026-10-20-two-kingdom-negotiation.md) defines a behavioral benchmark before persistent specialists: exact consent, fulfilled supply, verified benefit and later history use. It reuses F00/F01 and proposes `reactive-cognition@2` after F02–F06, preserving the five current `@1` controls. A04 can consume its versioned evidence selector; A07/A08 remain mandatory before autonomous specialists enter PACT comparisons. This planning addition starts no implementation or run. At execution, F01 must capture the later merged repairs as well as the pinned historical baseline. If the extra version is adopted, catalog tests derive version-option counts from registered descriptors; the six architecture families and all original 26 tasks remain in scope.

## Global Constraints

- Preserve `legacy-loop@1`, `legacy-cognition@1`, `reactive-basic@1`, `reactive-cognition@1`, and `specialist-coordinator@1`. Add `autonomous-specialists@1`; do not turn the old profiles into modes of it.
- Architecture selection remains per cohort. One bound kingdom has one controlling architecture instance.
- V1 uses one model operation per binding at a time and one canonical action lane for autonomous specialists. Preserve the existing coordinator's separately gated overlap semantics.
- Default all autonomous specialists to the cohort's selected model. No per-specialist provider migration or self-spawning.
- Presets: resources/diplomacy and resources/diplomacy/defense/development. No mandatory messaging, alliances or action-volume objective.
- Proposed first implementation caps one specialist envelope at eight internal messages and one conflict negotiation at two rounds.
- Existing ceilings stay applicable: 24,000 input bytes, 2,000 output tokens and at most three model calls per turn where selected by existing configuration. Nothing here raises a grant or overrides a smaller limit.
- Private evidence and detailed observations retain existing encryption, consent and thirty-day retention semantics; source deletion still applies sooner.
- Consumed configuration, identities, anchors, counters, unknown allocations, pending command IDs and terminal states remain unchanged.
- No live databases, server/game contact, real inference/helper calls, enrollment, activation, installation, push, reset or recovery reviews during this source/offline plan.
- Existing local Fleet remains disabled. Historical qualification grants remain closed.
- Fresh owned fixture databases only. Never use the default `127.0.0.1:5437/fleet_test` or any retained fixture database for these tasks.
- No delegation. Commit verified task changes locally; keep source integration, installation and execution as distinct claims.
- Worktree isolation is established at execution time using `superpowers:using-git-worktrees`; retain the existing feature worktrees. This planning assignment creates no implementation worktree.

## Review Focus

These five failure classes have explicit owners and tests in the parts:

1. **Two versions of one architecture / concurrent draft edits:** exact-version choice survives UI/API/CLI, and stale start cannot launch edited configuration — F02, F03, F07, F08.
2. **Lost or duplicated delivery across a crash:** state, inbox acknowledgment, outgoing messages and intent acceptance commit together; result delivery never repeats a world action — A02, A03, A05, K05.
3. **World or authority changes after validation:** stale stock, obligations, offers, ticks, grants or owner intent cannot slip through at authoritative commit — A07, A08, K04.
4. **Zero-model automation and internal message storms:** saving inference cannot create unlimited reads/actions or fresh self-trigger roots — A03, A06, K04, K05.
5. **Skill mutation or loss of supporting evidence:** editing a skill, changing a primitive, deleting evidence or adopting a foreign-scope skill cannot retain executable qualification — K01, K03, K06.

## Plan structure and execution order

This is one coordinated plan with three implementation parts. Each part delivers independently testable software, but their interfaces are dependent; do not implement them as unrelated rewrites.

| Part | Tasks | Deliverable |
| --- | --- | --- |
| [1. Platform separation and launch](2026-10-20-autonomous-specialists-platform.md) | F00–F08 | Safe fixture harness, parity baseline, manifests, scoped services, separated engines, uniform launch API/UI/CLI |
| [2. Persistent specialists and PACT](2026-10-20-autonomous-specialists-engine.md) | A01–A08 | Scoped state, recipient delivery, independent decisions, action arbitration/recovery, authoritative PACT support |
| [3. Learned skills and final acceptance](2026-10-20-autonomous-specialists-skills.md) | K01–K07, X01–X02 | Skill acquisition/reuse, guarded recipes, inspection, full source acceptance and qualification proposal |

Default serial order: **F00 → F01 → F02 → F03 → F04 → F05 → F06 → F07 → F08 → A01 → A02 → A03 → A04 → A05 → A06 → A07 → A08 → K01 → K02 → K03 → K04 → K05 → K06 → K07 → X01 → X02**.

Skills use synthetic adapters for most tests. PACT guarded execution remains unavailable until A07/A08 pass. F07/F08 deliver useful launching for the five existing architectures before the sixth is complete; final registration is completed in X01.

The shared launcher means the same workflow for every architecture **where its environment supports it**. Existing F6 still requires its own coordination frame; the new effects contract does not silently advertise F6 compatibility. Unsupported combinations stay visible with precise reasons. This is not a promise that every profile works against every adapter.

## Interface ownership

Use these names consistently. Types listed here are proposed new exports unless marked existing. Each owning task supplies runtime schemas and tests as well as TypeScript types.

| Owner | Public interface and semantics |
| --- | --- |
| F02: `src/platform/architecture.ts` | `ArchitectureRef = {id:string; version:string}`; preserve `EngineProfileRef` as a type alias. `ArchitectureManifest` contains public identity, JSON configuration schema, requirements, triggers, execution modes, versioned modules/codecs, skill modes and declarative form metadata. |
| F02 | `ValidationIssue = {path:string,code:string,detail:string}`; `ScopedEvent = {binding:BindingRef, event:EnvironmentEvent, instanceId:string}`. Trigger kinds are periodic/event/deadline/internal-message. Define `RecipientSpec = {participantId,taskKey,subscriptionVersion}` here so runtime route signatures compile before A02 implements delivery. |
| F02 | `ArchitectureDefinition = {manifest, validate(config, launch): ValidationIssue[], create(services:ScopedServices): ArchitectureRuntime}`. `ArchitectureRuntime` exposes `route(event:ScopedEvent): RecipientSpec[]` and `run(operation:ScopedOperation): Promise<void>`. Host owns transactions and enforces bounds on pure routing. |
| F02/F04 | `ScopedOperation = {id, instanceId, binding, profile, task:{id,key,revision}, signal, observation, eventRefs, participantId?:string}`. No SQL/store/vault/credentials/raw legacy claim. Existing `BindingRef`, `Observation`, `Data`, `ActionIntent`, `ActionOutcome` remain in `contracts.ts`. |
| F04: `src/platform/engine-context.ts` | `ScopedServices`: `observe(query:Data)`, `model.decide(request:ScopedModelRequest)`, `actions.submit(intent:ActionIntent)`, `actions.resolve(commandId:string)`, `state`, `evidence`, `tasks`, `trace`. Ports are bound to operation/scope; engines cannot supply another claim. |
| F04 | `ScopedModelRequest` carries messages, schema, maxOutputTokens and optional stage; model/settings, dispatch hooks and parent accounting come from the host. `ScopedModelResult` retains the existing `ModelPort.decide` result fields plus `allocationId`; adaptation must preserve existing engine-visible values. |
| F03: `src/platform/launch-contracts.ts` | `LaunchSpec = {architecture, environment, preset?:string, architectureConfig:Data, model:ModelSettings, budget:Budget, wakePolicy?:WakePolicy, accounts:{agentIds:string[]}, nonModelLimits?:WorkLimits}`. `ModelSettings`/`Budget` denote existing inferred domain types; new definitions must not duplicate their validators. |
| F03 | `LaunchCheck = {valid:boolean, ready:boolean, digest:string, checks: Array<{area, status:"pass"|"fail"|"unknown", code:string, detail:string}>}`. Areas: configuration, environment, credentials, provider, qualification, allowance, execution. Unknown external health does not become pass. |
| F03 | `LaunchService.catalog()`, `check(spec):Promise<LaunchCheck>`, `draft({requestId,spec}):Promise<{draftId,digest}>`, `update({draftId,expectedDigest,spec}):Promise<{digest}>`, `start({requestId,draftId,expectedDigest}):Promise<{cohortId,digest,state}>`. Draft/update/start are idempotent or compare-and-swap as appropriate. |
| A01 | `SpecialistScope = {instanceId,bindingId,specialistId}`; `SpecialistState = {version,charterVersion,goals,memories,predictions,plan}`. Repository `load(scope)` and `accept(scope,{expectedVersion,operationId,envelope})`; the latter atomically accepts delivery acknowledgments, state changes, messages and pending intent. |
| A02/A03 | `Delivery = {id,eventId,recipient,subscriptionVersion,causationRoot,parentId?,depth,payloadRef,status}`. `RecipientSpec = {participantId,taskKey,subscriptionVersion}`. `InternalMessage` carries explicit sender/recipient, kind, evidence references and bounded payload; recipient does not inherit sender authority. |
| A05/A07 | `ActionEffects = {schemaVersion:"fleet.action-effects.v1", revision, claims, sourceRefs, validUntil, coverage, supported:boolean}`; claims reuse existing `StructuredClaim`. `ActionAdmission.reserve(scope,intent,effects):Promise<{claimId,code}>`; receipts settle claims, local expiry cannot release uncertain dispatch. |
| K01 | `SkillRef = {id,version,digest}`; `SkillVersion` follows spec §6.1. `SkillLibrary.propose(scope,candidate)`, `adopt(scope,ref)`, `retrieve(scope,{goal,event,limit})`, `transition(ref,{expectedStatus,nextStatus,evaluationId})`. Versions immutable; qualification is separate evidence. |
| K03 | `qualifyRecipe(skill, policy, evidence): QualificationDecision`; policy is trusted code/config, evidence includes host-generated test results, exact skill/primitive/environment digests and coverage. A model cannot manufacture a passing evaluation record. |
| K04/K05 | `RecipeRunner.start(scope,{goalId,skillRef,inputs,triggerId}):Promise<Invocation>` and `resume(invocationId,eventId):Promise<Invocation>`; invocation has durable step checkpoints, effective limits and stable command IDs. |

`WorkLimits` contains nonnegative integer `reads`, `actions`, and `messages`, plus positive integer `steps` and `wallTimeMs`. Zero actions is meaningful for read-only recipes. It is a source/configuration contract, not a new grant. Effective limits are the minimum of recipe, invocation, role and remaining owner-authorized parent limits; absent parent limits disable action-producing automatic reuse.

## File/migration ownership

Exact file responsibilities are listed in each part. New root areas: `src/app/`, `src/modules/decision-step/v1/`, `src/modules/continuity/v1/`, `src/modules/evidence/`, `src/modules/skills/v1/`, and `src/engines/autonomous-specialists/`. Do not move unrelated files merely for symmetry.

At this checkpoint the last Fleet migration is `019_profile_comparisons.sql`; reserve these names only when execution starts:

| Migration | Owner |
| --- | --- |
| `020_architecture_launch.sql` | F03: immutable draft/config snapshots and idempotency |
| `021_architecture_operations.sql` | F04: persisted execution modes and allocation dispatch evidence |
| `022_specialist_state.sql` | A01: instances, private versioned state, goals |
| `023_specialist_delivery.sql` | A02/A03: recipient deliveries, outbox and wake conditions |
| `024_specialist_intents.sql` | A05: claims, intent linkage and result outbox |
| `025_skill_library.sql` | K01: versions, adoptions and evaluation records |
| `026_skill_invocations.sql` | K04/K05: non-model ledger, invocation/step checkpoints |

If numbers are occupied by intervening work, choose the next free numbers and update the plan/status references before implementation. Never rename applied migrations. `src/db.ts` explicitly enumerates migrations; update it in the task adding each migration and test repeat application.

PACT's first implementation uses existing transaction/receipt storage where possible, with new schemas/services/routes. If an action's complete revision coverage requires persistent supporting data, document and allocate its additive PACT migration in A07 before coding that contract. Do not assume a snapshot hash already covers all writers.

## Test execution contract

F00 creates `npm run test:architecture -- <test paths>`, `--repo pact`, and `--suite unit|integration|acceptance` support. It launches fresh owned PostgreSQL fixtures using already-installed local tooling/image, exports `FLEET_TEST_DATABASE_URL` and `TEST_DATABASE_URL`, and runs local Vitest binaries with explicit repository/configuration and serial integration execution. It never uses or resets a retained database. For mixed PACT paths it groups unit and integration tests under their respective Vitest configs; it must fail if no requested tests are discovered.

Before F00 exists, its pure unit tests use:

```text
/opt/homebrew/opt/node@24/bin/node node_modules/vitest/vitest.mjs run tests/unit/architecture-fixture.test.ts
```

At execution start resolve a working Node 24/npm path; the system Node 25 binary was broken during source review. Do not install or repair host tooling as an implicit part of these tasks. Each task's red run must fail on the intended new assertion, not missing infrastructure. Time-dependent fixtures use injected clocks and relative deadlines.

For each task: write its named assertions, see the intended failure, implement its interfaces, run the listed focused checks, inspect the diff and commit only the task's files. Existing files changed for compatibility require their relevant regression suite. Full checks run at X02 after integrated source is complete, not after every prose edit or unchanged test run.

## Completion criteria

- A registered fixture architecture with versions `1` and `2` launches through UI/API/CLI without engine-name branches in generic infrastructure.
- All five current profiles retain their decision-visible behavior, accounting, privacy and recovery semantics; stronger import-boundary tests pass.
- The sixth profile persists independent specialist goals/memory and can commit admissible actions without coordinator calls.
- Event fan-out, shared claims and crash recovery are durable and scoped.
- Skills can be proposed, shared/adopted, tested, used as guides, and executed as qualified bounded recipes; guarded execution is not omitted from completion.
- The PACT support matrix and capability gaps are honest; zero real-game/provider activity is implied by passing fixtures.
- Inspector reports show delivered evidence, actual skill/goal state, original allocations, command receipts and later outcomes.
- All implementation tasks have evidence and commits; release and real-provider qualification are concrete future proposals rather than automatic execution.

## Plan self-review and handoff

The author reviewed design coverage, interface ownership, dependency order, task test cycles and preservation constraints without delegation. Coverage map: spec §§1–3/9 → F01–F08; §§4–5/8 → A01–A03/A05/A06; §6 → A04; §6.1 → K01–K07; §7 → A05/A07/A08; §§10–12 → X01/X02 and this index.

The implementation choices introduced by this plan are explicit in the owning tasks: fresh-fixture ownership fencing, small shared-port modules, limited initial PACT action coverage, skill-policy bounds, and authenticated CLI sessions. They do not change the approved goals or grant runtime authority.

Planning verification: all 55 local links across the seven changed Markdown documents resolve; all four plan headers, 26 unique task IDs, 130 unchecked implementation steps, code fences and whitespace were checked. `git diff --check` passed. No application tests, database fixtures, providers or game services were run for this documentation assignment.

This assignment ends with a verified local documentation commit. When implementation is requested, execute this plan directly without delegation; no execution-method question is needed. The design is approved and must not be sent through brainstorming again unless a material requirement changes.
