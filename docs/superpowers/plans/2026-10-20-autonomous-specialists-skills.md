# Learned Fleet Skills and Integrated Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` task-by-task, without delegation. Steps use checkbox syntax.

**Goal:** Let specialists create and adopt reusable skills, reduce repeated reasoning with qualified bounded procedures, and complete launch/inspection acceptance.

**Architecture:** A shared versioned skill module owns storage, validation, retrieval and interpretation; each architecture owns learning/adoption policy. Every action still passes the same effect checks, usage limits and command journal.

**Tech Stack:** Existing TypeScript, PostgreSQL, Zod/AJV, Node 24, React and Vitest. No arbitrary generated-code runtime or new learning service.

**Spec:** [Approved skills design, §6.1](../specs/2026-10-20-autonomous-specialists-and-modular-architectures-design.md); [master plan/interfaces](2026-10-20-autonomous-specialists.md).

**Final source checkpoint —21 October2026:** All tasks in this part are implemented and offline verified; see [final source acceptance](../../autonomous-specialists-source-acceptance-20261020.md). Checkmarks record delivered scope, not a claim that every historical expected RED was observed. X01/X02 use prior-task and targeted regression evidence; inline author self-review only. E1 operational/behavioral gates remain open. No runtime installation or real-model/game run occurred.

## Global Constraints

All master-plan constraints apply. Skills are parameterized domain data, not installed Codex skills or self-modifying program code. Old architecture `@1` versions do not gain skills. Qualification and unknown usage cannot be rewritten by a model. Learning, fallback and model-free actions all have bounded accounted work.

## Review Focus

Forged test results, changed skill dependencies, expired evidence, duplicate skill invocations and apparently cheap procedures with costly learning/fallback have explicit tests. There is no live experimentation merely to validate a candidate.

## File map

- `src/modules/skills/v1/{schema,library,retrieval,qualification,primitives,runner,checkpoints,costs}.ts`: reusable skill mechanisms.
- `src/app/skill-services.ts`: concrete scoped storage/evaluation adapters.
- `src/engines/autonomous-specialists/learning.ts`: architecture-owned extraction/adoption policy.
- `src/environments/pact-skills.ts`: allowed domain recipe templates and primitive mappings.
- `web/specialists.tsx`, `web/skills.tsx`: operator inspection via authenticated read APIs.
- `tests/fixtures/skills/`: synthetic successes, counterexamples and honest cost evidence.

## K01 — Immutable skill library and adoption

**Depends:** F04/F06, A01/A04.

**Files:** Create `src/modules/skills/v1/schema.ts`, `library.ts`, `src/app/skill-services.ts`, `migrations/033_skill_library.sql`, `tests/unit/skill-schema.test.ts`, `tests/integration/skill-library.test.ts`; modify `src/db.ts`.

**Interfaces:** Produce `SkillRef`, `SkillVersion`, `SkillLibrary` from the master plan. Skill representation is `guide|recipe`; lifecycle is `candidate|advisory|guarded|suspended|retired`. `SkillScope` includes instance/binding/author specialist; adoptions are recipient-scoped and version-pinned.

- [x] Write tests for canonical content digest, immutable version, edit→new candidate, same-kingdom explicit adoption, rejected foreign scope, private source redaction, suspended dependency and transactional duplicate proposals. Assert editing a guarded version cannot preserve its status/evaluation.
- [x] Run `npm run test:architecture -- tests/unit/skill-schema.test.ts tests/integration/skill-library.test.ts`; expect missing library/lifecycle red.
- [x] Implement encrypted versioned records and adoption rows. Required fields follow the approved record: purpose, parameters, applicability/exclusions, primitive/environment versions, procedure, completion/abort conditions, effects, limits and source-linked evidence. Content and qualification are separately immutable; evaluation provenance is host-owned. Stage migration 033 with idempotent application.
- [x] Rerun K01 tests plus A01 scope/retention tests; verify old cognition/continuity rows are untouched.
- [x] Commit: `feat: store scoped immutable skills and explicit adoptions`.

## K02 — Outcome-grounded learning and compact retrieval

**Files:** Create `src/modules/skills/v1/retrieval.ts`, `src/engines/autonomous-specialists/learning.ts`, `tests/unit/skill-retrieval.test.ts`, `tests/integration/skill-learning.test.ts`, synthetic `tests/fixtures/skills/episodes.json`; modify specialist schema/engine/context and manifest configuration.

**Interfaces:** `LearningPolicy.opportunities(episode,state):LearningOpportunity[]`; `proposeFromEpisode(operation,episode):Promise<SkillRef[]>` uses the existing scoped model port. `retrieve(scope,{goal,event,limit}):SkillSummary[]`; `loadSelected(scope,refs):SkillVersion[]`. A summary contains identity/purpose/compatibility/status, not all private examples.

- [x] Write tests for success and failure-derived candidates, unresolved outcome labelled unproven, retained source ownership, duplicate episode/signature suppression, low-priority learning, absent allowance, no-op reflections, and selection from a large library without including every body. Assert a narrative “learned” response persists nothing.
- [x] Run `npm run test:architecture -- tests/unit/skill-retrieval.test.ts tests/integration/skill-learning.test.ts`; expect missing learning/retrieval red.
- [x] Add optional at-most-two candidate proposals per admitted learning operation. Outcomes trigger opportunities, never unbounded background inference; deduplicate by episode lineage and procedure signature. New-preset retrieval defaults: at most eight summaries and two selected bodies within the same input cap. Filter scope/status/versions before relevance ranking. Model-authored applicability remains a hypothesis until qualified; fallback is normal reasoning.
- [x] Rerun K02 tests plus A04 delivered-evidence tests. Demonstrate every extraction/revision call appears in the same parent ledger and no action experiment is launched for a candidate.
- [x] Commit: `feat: learn and retrieve procedural skills from observed episodes`.

## K03 — Trusted qualification and bounded procedure language

**Files:** Create `src/modules/skills/v1/primitives.ts`, `qualification.ts`, `tests/unit/skill-qualification.test.ts`, `tests/fixtures/skills/qualification-cases.ts`; modify skill schema and manifest configuration.

**Interfaces:** `PrimitiveRegistry` is static trusted code; `validateRecipe(skill,registry):ValidationIssue[]`; `qualifyRecipe(skill,policy,evidence):QualificationDecision` returns eligible mode plus reasons/coverage. Allowed node tags: observe/check/calculate/request/submit/await/verify/return_to_reasoning; acyclic version-pinned child invocation is represented as a bounded composition reference, not arbitrary code.

- [x] Write tests for cycles, unknown tools, dynamic URLs/code, hidden child work, forged evaluation IDs, incomplete guard coverage, altered primitive versions, missing source, and a guide trying to become guarded. Assert the skill's own `passed:true` cannot contribute qualification evidence.
- [x] Run `npm run test:architecture -- tests/unit/skill-qualification.test.ts`; expect absent validator/policy red.
- [x] Implement static validation with at most 32 expanded nodes, composition depth two and pinned child digests; new profiles can choose smaller bounds. Policy v1 first permits read-only bounded recipes, then the explicitly registered existing-supply-goal recipe template through A07/A08 action support. Require host-generated expected-results tests for positive use, unmet guards, missing evidence, expiry, stock conflict, authority change and restart. All required cases must pass for the exact digest; raw success counts do not replace this matrix. Unrecognized action-producing procedure classes stay advisory, not silently marked executable.
- [x] Rerun K03 tests and K01 edit/qualification invalidation tests. Verify an ordinary strategic failure is evidence, while a contract violation/dependency mismatch suspends executable status.
- [x] Commit: `feat: qualify bounded skill recipes with trusted evidence`.

## K04 — Recipe selection, interpreter and non-model limits

**Files:** Create `src/modules/skills/v1/runner.ts`, `costs.ts`, `migrations/035_skill_invocations.sql`, `tests/integration/skill-execution.test.ts`; modify scoped task/action ports, launch contracts and `src/db.ts`.

**Interfaces:** `RecipeRunner.start` from the master plan; `SkillSelector.choose(goal,event,candidates,facts)` returns `recipe|advisory|reason` with exact reasons. `WorkLedger.reserve(invocationId,kind,units)` atomically debits remaining role/parent limits, including all nested recipe work.

- [x] Write tests for zero-model known-goal execution, unresolved competing skill choices, parameters outside existing goal, stale facts, exhausted read/action/time/step limit, missing parent non-model limits, and child recipes consuming parent work. Assert zero model calls is not zero ledger entries and insufficient limits prevent dispatch before mutation.
- [x] Run `npm run test:architecture -- tests/integration/skill-execution.test.ts`; expect missing runner/work ledger red.
- [x] Implement finite typed interpretation over trusted primitives. Migration 035 includes the durable checkpoints and command/result references consumed by K05; K05 implements crash-resume orchestration without rewriting an applied migration. A valid similarity match alone never selects an action; require current goal/charter, exact parameters and mechanically satisfied guards. Read fresh state at the relevant checks and use A05/A08 for all actions. Require finite parent `WorkLimits` for guarded action mode; no unlimited defaults. Reservations debit once across retries/checkpoints. Model fallback/extraction uses ordinary allocation accounting; it cannot reset invocation limits.
- [x] Rerun K04 tests, A05 conflict tests and F03 launch checks; show one synthetic routine completes with zero model calls and one ambiguous case falls back without action.
- [x] Commit: `feat: execute qualified recipes within shared work limits`.

## K05 — Durable skill checkpoints and original-receipt recovery

**Files:** Create `src/modules/skills/v1/checkpoints.ts`, `tests/integration/skill-recovery.test.ts`; extend invocation storage, result outbox consumers, `runner.ts`.

**Interfaces:** `RecipeRunner.resume(invocationId,eventId)`; `Checkpoint = {invocationId,skillRef,nodeId,revision,state,commandId?,resultRef?,effectiveLimits}`. Invocation identity derives from the existing goal instance, trigger and skill version; duplicate trigger delivery returns the same invocation.

- [x] Write crash tests before work reservation, after reservation, after local state commit, before/after dispatch, after receipt settlement and before result delivery. Include wait across restart, skill suspension mid-invocation and duplicate child completion. Assert:
  ```ts
  expect(retried.commandId).toBe(original.commandId);
  expect(world.effectsFor(original.commandId)).toHaveLength(1);
  expect(unknownAllocation.tokens).toBe(originalAllocation.tokens);
  ```
- [x] Run `npm run test:architecture -- tests/integration/skill-recovery.test.ts`; expect missing checkpoints/resume semantics red.
- [x] Implement compare-and-swap step transitions, stable command IDs, idempotent reservations and delivery acknowledgments. Await nodes release worker/model capacity. A suspended skill cannot start another action; already-dispatched commands still reconcile. Resume preserves budgets and private state; expired source may force reasoning after receipt resolution, never replay.
- [x] Rerun K05 tests plus `tests/integration/platform-recovery.test.ts` and A03/A05 crash tests.
- [x] Commit: `feat: recover skill invocations without replaying actions`.

## K06 — Shared skills, invalidation and PACT routine

**Files:** Create `src/environments/pact-skills.ts`, `tests/integration/skill-sharing.test.ts`, `tests/acceptance/pact-skill-reuse.test.ts`; modify skill maintenance, source-deletion handling, specialist manifest and PACT adapter primitive registration.

**Interfaces:** Register `evaluate_offer_for_existing_supply_goal@1` as the trusted guarded-procedure class from K03; candidates instantiate its bounded structure/parameters, not arbitrary new tool authority. `invalidateSkillDependencies(change):Promise<InvalidationSummary>` handles source/version/authority dependency changes and exact adopted versions.

- [x] Write tests for explicit same-kingdom adoption, compatible role versus unsupported action scope, cross-account rejection, source deletion/expiry, parent/child version invalidation and unproven promise. In paired PACT fixtures, require a current goal with amount/terms already specified; routine quote/validation may sign the offer only if existing permissions and reserve constraints pass.
- [x] Run `npm run test:architecture -- tests/integration/skill-sharing.test.ts tests/acceptance/pact-skill-reuse.test.ts`; expect absent adoption/invalidation/routine behavior red.
- [x] Implement authored publication and explicit recipient adoption, preserving provenance without broadcasting private examples. Source removal strips support and redacts/deletes derived private content according to existing policy. The PACT routine uses A07/A08 quote+guarded `game.supply.sign`, then separately waits for delivery/default events. Unknown price/recipient choices, changed goal or missing facts return to reasoning. Do not enable skills on any old profile.
- [x] Rerun K06 tests, K01/K03 invalidation tests and PACT `tests/integration/agent-outlook.test.ts`, `tests/integration/supply-offers.test.ts`, `tests/integration/supply-settlement.test.ts` through the owned fixture runner.
- [x] Commit: `feat: share and invalidate learned skills with guarded PACT reuse`.

## K07 — Honest learning cost and outcome evaluation

**Files:** Create `src/modules/skills/v1/evaluation.ts`, `tests/integration/skill-efficiency.test.ts`, `tests/fixtures/skills/efficiency-cases.ts`; modify platform reports and private trace schema.

**Interfaces:** `evaluateSkillReuse(cases):SkillEfficiencyReport` reports acquisition/validation/retrieval/execution/fallback costs separately and in total, outcome coverage, applicability misses and observed amortization horizon. Numeric unknowns stay null; reservation and actual usage remain separate.

- [x] Write paired fake-provider cases: routine reuse amortizes initial learning, one-off learning costs more, invalid applicability falls back, expensive retrieval loses savings, and an admitted action never receives a delivered-outcome score. Assert no inferred unobserved counterfactual cost is presented as measured.
- [x] Run `npm run test:architecture -- tests/integration/skill-efficiency.test.ts`; expect absent report/denominator assertions red.
- [x] Implement total model calls/tokens, read/action counts, measured CPU/wall duration and completed-outcome measures. Report simulated fixture timings as simulated. Learning overhead can be attributed to later reuse but never removed from totals. Candidate pruning uses explicit evidence/retention, not a model's self-rated mastery. A regression in outcome quality is visible even when inference falls.
- [x] Rerun K07 tests and `tests/unit/profile-reports.test.ts`; label evidence synthetic and leave real-provider quality unqualified.
- [x] Commit: `feat: measure complete skill learning and reuse cost`.

## X01 — Complete launch and operator inspection

**Files:** Create `web/specialists.tsx`, `web/skills.tsx`, `tests/unit/specialist-inspector.test.tsx`, `tests/integration/architecture-operations.test.ts`; modify server read routes, `web/runs.tsx`, `web/run-steps.tsx`, `web/launch.tsx`, reports, qualification metadata and operator docs.

**Interfaces:** Read-only `/api/instances/:id/specialists` and `/api/instances/:id/skills` expose consent-filtered state/evidence/coverage; views reuse existing authenticated session and bounded exports. The autonomous manifest exposes `learning` and `skillMode:off|advisory|guarded`, trusted policy version and required limits.

- [x] Write tests for six exact profile choices, architecture-specific skill controls, default learning+advisory for a new autonomous draft, unsupported guarded mode, read-only inspection with zero model/game calls, revoked consent, escaping peer text, public export redaction and start of a test-only seventh architecture without generic ID edits.
- [x] Run `npm run test:architecture -- tests/unit/specialist-inspector.test.tsx tests/integration/architecture-operations.test.ts`; expect missing inspector/manifest integration red.
- [x] Complete catalog/launch/config forms and inspectors for goals, wake reason, own/adopted skills, evidence actually delivered, qualification failures, conflict state, work usage and original receipts/later outcomes. Preserve public field allowlists; public architecture identity comes from trusted sanitized metadata rather than a five-ID list. Document each real compatibility limitation, including F6's separate PACT protocol.
- [x] Rerun X01 plus F07/F08 API/UI/CLI tests; manually inspect fixture-rendered screen states and record any browser coverage limit. No real cohort or session is required.
- [x] Commit: `feat: expose autonomous specialists and skills in Fleet operations`.

## X02 — Full source acceptance and operational handoff

**Files:** Create `docs/autonomous-specialists-source-acceptance-20261020.md`, `docs/autonomous-specialists-status-20261020.json`, `tests/integration/architecture-preservation.test.ts`, `tests/acceptance/autonomous-specialists.test.ts`; update handbook, operator guide and the plan task checkboxes with actual evidence only.

**Interfaces:** Status records exact sources, task outcomes, suite counts, supported action matrix, profile/primitive versions and remaining qualification/rollout gates. It must never infer runtime installation from source commits.

- [x] Write acceptance tests covering two presets, independent actions, skills advisory/guarded modes, two architecture versions, a foreign environment fixture, full fresh-database migration twice, seeded old-cohort preservation, stop/restart and every crash/uncertainty boundary from the spec.
- [x] Run `npm run test:architecture -- tests/integration/architecture-preservation.test.ts tests/acceptance/autonomous-specialists.test.ts`; confirm each test is meaningful by targeted fixture mutation or its prior task's recorded red state, not by breaking production code.
- [x] Fix remaining source-level failures without expanding actor authority. Run Fleet `npm run check`, `npm run build`, `npm run check:boundaries`, and `npm run test:architecture -- --suite unit`, `--suite integration`, `--suite acceptance`. For changed PACT source, run `npm run typecheck`, `npm run lint`, `npm run build`, `npm run check:contracts`, `npm run check:boundaries` in its worktree, then Fleet's wrapper with `--repo pact --suite unit` and `--repo pact --suite integration`. PACT unit mode must include packages/apps/services/workers tests from its config, not just `tests/unit`. Report optional skips precisely and run paired suites on both final sources.
- [x] Verify only owned fixtures were started/stopped, repository diffs contain no private state, old seeded records remain exact and all required tasks are complete. Write a concrete source/model/adapter/skill-mode budget proposal for later real qualification, including learning/validation/fallback costs and stopping conditions; do not call a provider or start the game. Qualification covers guarded reuse as well as advice; unsupported strategic generality is explicit.
- [x] Commit verified code fixes and the source-acceptance/status documents in the appropriate repositories. Report exact commits, checks and remaining operational gates. No push, deployment, account enrollment, recovery review or activation follows automatically.
