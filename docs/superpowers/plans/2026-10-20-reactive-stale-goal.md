# Reactive stale-goal repair implementation plan

**Goal:** distinguish unchanged owner intent from fresh construction truth, reject a stale factual wait and run exactly one new original C0 turn.
**Architecture:** PACT supplies a structured current objective and optional checked wait basis. The generic reactive engine transports/validates these without game rules; legacy inputs stay unchanged. No summary regex, forced trade or removal of legitimate resource waits.
**Tech:** Node24, TypeScript, existing PostgreSQL17 fixtures and native Nemotron route.
**Spec/evidence:** founder's current request; docs/reactive-trade-repair-20261020.md; retained turn5848988c-e513-485d-af86-20855010df5a.

## Constraints

Work inline in the existing isolated worktrees. Preserve146 turns/194 executions,12 identities, owner goal version3/mandates/models/budgets/anchors/queues and all closed gates. Do not reset/cancel/replay, start a worker/other actor, raise context/output limits, push or alter other populations/server. One new C0 native task only, after source checks/commit/install; preserve any failure and park/restore-verify.

## Tasks

- [ ] Add red regression tests in tests/unit/pact-goal-state.test.ts: fresh FarmII/BarracksII completion, HallII stock gaps146Iron/62Silver beside verbatim intent; stale/missing wait basis rejected; truthful stock wait remains legal; absent/unknown/no-owner facts do not invent an assignment; fresh prerequisite changes replace old phases. Use real ReactiveEngine with a fake provider to demonstrate stale wait -> factual correction -> useful command, within existing native allowance.
- [ ] Add src/games/pact/goal-state.ts with pactCurrentObjective(facts), pactWaitSchema(facts), validatePactWait(basis,facts). Scope the wait gate to owned queued work with a confirmed stock shortage; validate completed-level and queued-phase maps against current facts, never prose parsing.
- [ ] Add game-neutral AccountObjective string/structured intent+currentState union and optional waitSchema/validateWait ports in platform contracts/context, environment-registry and supervisor. Bind optional basis to the wait branch only; non-opt-in contracts/goldens unchanged. Validate before waiting, retain explicit refusal/feedback and fail known/non-dispatched when native allowance ends.
- [ ] Wire production PACT and synthetic qualification/diagnostic compositions; preserve legacy adapter objective and command handlers. Deliver structured goal once in the packet with concise system precedence instead of duplicating stale prose as current state.
- [ ] Run focused red-green, full Fleet unit/integration/paired acceptance, native check/build/boundaries/audit/diff and PACT backlog checks. Verify actual six-actor packets with a fake provider at48KB without hiding owned facts/peers. Commit source and install only the owned local Fleet console; PACT application staysfb7a1ba.
- [ ] Run exactly one new task goal-reconcile-20261020 for original reactive-basic ordinal0. Verify delivered facts, actual choice, every command receipt and useful Hall relation independently. Preserve all old history/settings/jobs, park, encrypted snapshot+network-disabled restore verification, durable honest reports and local commits.
