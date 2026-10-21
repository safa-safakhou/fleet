# RC1 Evaluation Runner Implementation Plan

> Work inline using superpowers:executing-plans and test-driven-development; no delegation. The user authorized execution on 21 October 2026. Keep completed changes on the main master checkouts.

**Goal:** Evaluate two independent full/guarded specialist kingdoms through the existing owned PACT fixtures and Fleet host, without reopening E1–E3 or changing candidate behavior.

**Architecture:** Add a separate R1 protocol/grant and reuse existing negotiation evidence, clock, fixture and native host services. Extend only the fixture/evaluation seams that need to recognize the new study. Keep model launch, deployment and platform approval outside the runner.

**Tech Stack:** Existing Node 24/TypeScript/PostgreSQL 17/Vitest; no new dependencies.

**Spec:** [RC1 design](../specs/2026-10-21-post-E3-candidate-design.md).

## Global constraints

- Preserve the original planners, failed grants, sealed artifacts, retained worlds and unknown allocations. Do not contact old live databases or providers.
- RC1 actor modules/prompts remain unchanged. Exact full/guarded configuration; whole-world native budgets, one provider slot, no fallback/helpers.
- R1-D/H/N are separate namespaces, grants and durable nonces. Fake evidence never qualifies release. A policy rejection cannot be cleared by this implementation.
- Fresh owner-marked isolated test databases only. Real operational starts, grants and release remain conditional on their actual prerequisites.

## Review focus

- Protocol drift and old-grant substitution must fail before allocation or fixture mutation.
- Two kingdoms/eight roles share the declared caps; corrections, learning and internal work cannot escape accounting.
- Current actor authority and whole-source delivery are required; no evaluator/private-peer data in actor views.
- Known usage settles before review; unknown usage keeps its reservation and closes sibling admission.
- Native timing must use ordinary clock workers; source/fake acceptance cannot imply a native or real-model pass.

## Task 1 — Separate protocol and fixture/evidence seam

**Files:** Fleet `src/post-e3-plan.ts`, `src/post-e3-run.ts`, new unit tests; PACT mirrored `tests/evaluation/post-e3-plan.ts`, `post-e3-owned-world.ts`, existing negotiation fixture seam; shared evidence evaluator seam as needed.

**Interfaces:** `prepareRC1Protocol(selection)` returns canonical R1-D/H/N cells, exact source/configuration/seed commitment and stage ceilings; `validateRC1Grant(protocol, grant, now, usedNonces)` rejects drift/reuse. `prepareOwnedRC1World(target, protocol, cell, options)` uses the same normal PACT fixture construction after canonical R1 validation. Original negotiation entrypoints continue accepting only their original stages/profiles.

- [ ] Write and run failing tests for stage sizes/caps, seed/role separation, candidate/configuration drift, grant identity/time/nonce fences and refusal of old-stage grants.
- [ ] Implement the smallest pure protocol/grant code and mirrored fixture support; no provider/fixture side effects from preview.
- [ ] Exercise canonical/tampered fixtures and shared mechanical assessment with fresh owned fake fixtures; preserve old planner outputs.
- [ ] Run affected checks and commit verified changes.

## Task 2 — Owned two-kingdom host composition

**Files:** Fleet `scripts/lib/post-e3-owned-run.ts`, new paired fixture/test files; reuse normal PACT actor effects/guarded dispatch, participant state/work, accounting, review and clock services.

**Interfaces:** `prepareOwnedRC1Cohort(...)` initializes both kingdoms with empty participant/skill state; `executeOwnedRC1Protocol(...)` validates exact bindings, consumes one durable nonce, bounds all role turns/calls/work and parks all owned worlds on terminal completion/failure.

- [ ] Write and run failing paired tests for two model actors/eight roles, shared allowance, source-backed state/effects, review stop after settlement, unknown transport, drift, lease loss and start-evidence failure.
- [ ] Implement normal controlled/native scheduling and authoritative actor adapters without scripted negotiation or hidden model turns; use original material/dialogue/history scoring.
- [ ] Verify fake failures remain failures, no replay/resets, all clocks park, source modules remain unchanged, and original suites still pass.
- [ ] Run appropriate unit/paired/type/build/boundary checks and commit verified changes.

## Task 3 — Operational gates and handoff

- [ ] Verify source changes and report exact checks and limitations in both current-state files.
- [ ] Recheck supported resolution of the recorded provider denial without attempting the denied outcome or changing review policy.
- [ ] Complete only operational/release steps whose actual prerequisites are satisfied; do not invent grants, provider acceptance or qualification. Preserve unresolved blockers explicitly.

## Dependency review

Task 2 consumes Task 1's canonical cells and grants. Both fixture and evaluator must validate the same exact study/source/seed selection. Operational code consumes only verified prepared state and private operator grants. The explicit user authorization to proceed supersedes additional plan-confirmation prompts; no approval-setting change or bypass is authorized. Review stays inline as requested.
