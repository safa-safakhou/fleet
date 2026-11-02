# Capacity experiment implementation plan

> Implement inline using executing-plans. User explicitly authorized stop and higher-capacity rerun; no delegation or push. Commit each verified deliverable.

**Goal:** Launch a fresh one-hour24-kingdom experiment with independent event/scheduled eligibility and measured parallel inference.
**Architecture:** Shared Fleet runtime and DB pool;24 manually dispatched Temporal workers; fresh-binding ownership; bounded fair8-slot admission and native EventIntake.
**Tech Stack:** Existing pinned Node26/TypeScript/PostgreSQL17/Temporal/Ollama Nemotron4B/OTel/encrypted evidence.
**Spec:** [Capacity design](../specs/2026-11-02-capacity-experiment-design.md).

## Global constraints

Preserve all historical worlds/services/data/evidence/unknown allocations. New maximum8, initial admitted ramp2→4→8; new48calls/1,920,000reserved tokens each, aggregate1152/46,080,000; input48,000/output1024/context32,768;3calls/one accepted action per turn; one active binding execution;2minute scheduled/hybrid cadence; finite one-hour end/final3minute drain. Keep all native schema/context/usage/authority/lease/privacy/evidence/retention/integrity guards and10GiB reserve. New envelopes only, no consumed budget edits, task resets/refunds or invented effects.

## Review focus

- Binding-wide routing must never absorb another identity/profile/manifest or retrofit consumed work.
- Parallel workers must never claim before a manual grant or overlap a binding; duplicates must preserve one effect/allocation.
- Event group/deadline/cursor/quiet semantics must survive; periodic work must not starve under event bursts.
- Evidence and usage must remain scoped under simultaneous actors and correct command identity on failures.
- Shared connection/resource/window closure must drain all workers and retain unknowns; configured concurrency must not masquerade as measured throughput.

## Tasks

- [x] Stop superseded02 safely, retain actual24waits/known usage/zero commands, verify four restores and original preservation. Record owner-shortened result.
- [x] Fresh-binding ownership. Files: new migration after current maximum, `src/research/orchestration/outbox.ts`, integration research ownership tests. Add `enrollBinding(bindingId,manifestDigest)` with fresh/editable/profile/binding/conflict checks. Trigger chooses matching exact route or binding route, refusing conflicts; inherits every later event/periodic task atomically. Write failing inheritance/consumed/mismatch/ordinary-refusal tests, implement, run owned fixtures and commit.
- [x] Long-lived manual workers and shared capacity. Files: `src/research/orchestration/worker.ts`, `src/config.ts`, `src/db.ts`, `src/app/composition.ts`, affected config/unit and real-SDK lifecycle tests. Add optional `delivery: 'automatic'|'manual'` default automatic; manual workers poll no outbox until explicit owner.deliver. Configurable validated DB pool defaults8/new16. Add the explicit2minute cadence to `src/domain.ts`, the replayed constraint in `migrations/009_five_minute_schedule.sql` and the three existing interval selectors; verify actual persistence and migration replay with2minute cohorts while5minute behavior remains supported. Test no automatic native claim, concurrent distinct bindings/scopes, dedupe and shutdown; preserve default behavior. Commit verified changes.
- [x] Capacity selection. File `src/research/orchestration/capacity.ts` plus focused unit tests. Pure `selectCapacityWork` takes eligible actor/task records, active binding set, capacity/current time and last-dispatch ordering; returns at most free slots, one per binding, respects future eligibility, prioritizes near deadlines with bounded fair rotation. Test event burst fairness, future/expired/native-clock records, zero/full slots and duplicates before implementation. Commit after affected/root checks/build/boundaries/contracts.
- [ ] Fresh private operators. Prepare new world and24 native goals/mandates/trigger modes, enroll native event policies before tasks, bind all manifests once, retain per-turn cadence and observer audit. Start24 manual workers before opening, shared runtime/pool16, pool selection and exact single wake grants. Seal new resource budgets/window and pinned process/build/controller/watchdog/provider metadata. Validate all24 initial packets, roles/backups/preservation and fake end/unknown/capture/resource closure paths; commit concrete record before activation.
- [ ] Launch and measure. Owned Nemotron server configured8 slots; admit2→4→8 only after known settled results. Record actual concurrent requests/usage, deadlines/queue latency/resource use/event delivery. Review the first real parallel wave and actual native visualizations, update quiet heartbeat with exact new bounds/window/ledger; commit accurate active state. Investigate substantive failures before fresh retry, never reset consumed tasks.
- [ ] Final follow-up: finite close, all native usage/effects/deadlines and per-kingdom outcomes, complete capture/observer links, four restores/state hashes/original preservation, actual timeline/context/causal rendering, comparisons and limits. Commit final results and delete completed monitor.


## Source qualification

Binding ownership regressions first failed on the absent method; after registration of060in the replayed migrator, fresh inheritance/identity/profile/consumption/conflict tests pass. DB capacity tests first failed on ignored overrides and invalid bounds; explicit bounded pool16/default8 now passes. Manual SDK delivery first failed because automatic dispatch consumed a call before the grant; manual mode now passes along with unchanged automatic behavior. Eight simultaneous actors reached the model boundary through both direct ownership and the real local Temporal SDK, with one call per identity under duplicate delivery, distinct scopes and complete evidence. Worker deployment registration is asynchronous: a pinned version briefly absent from its queue caused a synthetic delivery refusal. Bounded redelivery of the same durable outbox identity resolves that transport readiness condition; it does not rerun a native execution/model call. Keep that distinction in the private controller.

Two-minute setup initially failed the existing enum/SQL constraint before creating a kingdom. Add2to the explicit domain choice and replayed009constraint, preserving5/10/15/30/60and rejecting unsupported1/3. Actual persistence and full migration replay with a2minute cohort pass; all24fresh capacity kingdoms subsequently provisioned with zero calls and native event policy enrolled. Actual initial packets max42,047/48,000bytes.

Current checks:1,287units passed/23skipped;11owned ownership/Temporal checks,2actual local SDK lifecycle variants,2eight-actor direct/SDK concurrency checks,5binding/cadence/two-cycle checks and7selected native/capture checks passed (unselected cases remain explicitly skipped). Types/style/build/boundaries/generated contracts pass with existing405warnings/83infos and existing bundle-size warning. New dependency pins unchanged. These are synthetic/source checks plus no-provider actual initial packet validation, not real-provider capacity acceptance.
