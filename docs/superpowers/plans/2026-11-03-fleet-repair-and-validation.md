# Fleet serving, accounting and qualification repair plan

> Execute inline on master with superpowers:executing-plans and test-driven-development. No delegation or push. Preserve all private ledgers and historical worlds. The owner explicitly requests all investigation findings fixed and two validation rounds; this supersedes the previous investigation-only/no-new-run scope, not the requirement to retain unknown history.

**Goal:** Repair all six findings in the November3 investigation and execute two genuinely fresh, finite validation rounds with complete truthful evidence.

**Spec:** [Investigation and measured evidence](../../research/smaller-vllm-investigation-20261103.md); native authority/accounting invariants in AGENTS.md and existing module contracts remain binding.

**Architecture:** Keep TypeScript/native eight profiles and pinned Metal0.32.0/MLX0.32.2 Nemotron4B conversion. Add explicit shorter HTTP call deadlines within existing ceilings; declared model-call envelopes must fit the unchanged turn budget. Add optional bounded prefill admission waves and smaller provider prefill chunks. Use the provider's native terminal ABORT output, authenticated abort control and an atomic metadata-only terminal journal; cancellation never fabricates usage. Unqualified/missing/ambiguous terminal evidence remains unknown. A reusable complete native command census and profile-specific qualification gates replace private basic-only assumptions.

**Tech stack:** Node26, TypeScript/PostgreSQL17, existing Python3.12/vLLM Metal bridge, Temporal, native encrypted capture and browser inspection. No provider/weight/version switch.

## Global constraints

- Preserve every retained world/task/identity/goal/mandate/schedule/command, all six historical unknown allocations/full reservations/null measurements, all private evidence and original services/data. Do not reset/replay historical tasks or retroactively backfill events. Owner-approved VM recovery disk deletion is complete and unrelated to this task.
- Native non-thinking maxima remain90seconds/call and120seconds/turn. New explicit callTimeoutMs is opt-in, may only shorten the existing bound, and is pinned in model/manifests. Default historical behavior and headroom tests remain unchanged. Initial validation candidate35000ms gives three calls plus one-second settlement per call108000ms; remaining turn time covers preparation/reads. Validate actual full phases, not only this arithmetic.
- Keep input48000/output1024/context32768, max3calls/oneacceptedaction perturn, one active binding turn, native privacy/consent/authority/stock/lease/fence/validation/recording/retention/integrity/recovery protections. No stock grants or silent fallback. Accepted historical16.29%recording overhead versus10% stays failed.
- Preserve native cache attestation/physical leases with explicit6GiB cap/max8sequences; new prefill batch candidate512. Optional250ms admission waves cannot admit beyond slots/token/resource limits or backfill after the wave closes until active calls settle. Queueing/fairness/fences remain authoritative.
- An abort must stop provider generation through the exact native request identity; only its native terminal finish/usage is accepted. Keep the original stream open for at most the existing one-second accounting margin after cancellation, then close/fail unknown if terminal accounting did not finish. No network/model calls inside database transactions.
- Request IDs/counts/finish status may be atomically persisted as private0600 terminal metadata; never store credentials, raw prompts, model text or private correspondence in that journal/Git/logs. Authenticated endpoints must bind provider instance and native request, reject cross-ID/unsupported/missing controls and bound retention/entry counts.
- Validation uses fresh worlds/accounts/bindings/tasks/manifests/namespaces and finite windows; no historical resumption. Plan two16-kingdom rounds (two replicas of each original native profile). Combined maximum384calls/15360000reserved tokens, per-round maximum192/7680000, per-kingdom12/480000. Native individual allocations40000reserved tokens. Start concurrency2; capacity4 requires profile/phase coverage at2, known usage and full settled workflows, not only wait samples. No automatic8-way claim.
- Final real windows/operator details are sealed only after all source/operator checks. Independent controller/watchdog/provider guard stop all owned groups; preserve original services, pause fresh worlds, four snapshot/state/artifact restores and native timeline/context/causal rendering at closure. A safety/preservation/unknown failure closes first; no blind retry or clearing uncertainty.

## Review focus

1. Provider cancellation before first output, during a token, after final usage, or when abort control/journal fails: exact request binding, no false zero/reported usage and finite shutdown.
2. Admission wave restart/concurrency/race: active cache leases remain held, capacity is not doubled by changed policy, queued fairness and task fencing remain intact.
3. Shorter bounds cannot lengthen any default execution or permit an undeclared caller to bypass the original full-call headroom rule.
4. Modern/legacy/pending command projections overlap or disagree: count once, expose conflicts, cross-check authoritative receipts and never report zero from one table alone.
5. Qualified single-call waits cannot promote an untested worker/coordinator/read-final workflow; known completed admission deferrals are not replayed or automatically quarantined as command uncertainty.

## Tasks

### Task1: Declared shorter call bounds and complete native command census

Files: src/domain.ts, src/model-bounds.ts, native launch/config validation, new src/research/orchestration/native-status.ts; unit/integration regressions.

Interfaces: produce validated ModelSettings.callTimeoutMs and nativeCommands(store,cohortIds) scoped union/deduplicated projection. Later controls consume the explicit deadline and census.

- [ ] RED: optional call deadline accepts shorter values, refuses longer/invalid/CLI values; defaults keep historical90/180s behavior and admission tests. Verify a declared three-call time envelope fits120s without changing the maximum.
- [ ] RED: native census includes legacy-only COMMITTED, modern-only, overlapping IDs and pending legacy turns; rejects or exposes projection conflicts; empty scope returns none.
- [ ] GREEN: implement the minimal bounds/census and verify affected tests, type/style/boundary checks. Keep original historical source pins unchanged.
- [ ] Commit verified changes and record evidence.

### Task2: Prefill waves and profile-aware capacity qualification

Files: additive migration061, src/platform/admission.ts, src/config.ts/provider policy, src/research/orchestration/capacity.ts and focused tests.

Interfaces: consumes Task1 deadline and exposes optional wave policy plus explicit profile/phase qualification. Route policy changes must reject mismatched existing route rows rather than opening a second capacity pool.

- [ ] RED: default backfill unchanged; optional wave admits bounded initial batch, refuses mid-wave backfill, resumes next queued wave after settlement; counters/fairness/resource leases/fences unchanged.
- [ ] RED: two reactive waits cannot qualify a coordinator/legacy/autonomous workload; require selected profiles and applicable phases, known native settlement, instance/config scope and latency/resource headroom.
- [ ] GREEN: persist wave window/admission timestamps, wire explicit opt-in configuration, test rollback/restart/mismatch and source gates.
- [ ] Commit verified changes.

### Task3: Authoritative native abort/terminal accounting bridge

Files: scripts/lib/fleet_vllm_terminal.py (new middleware), tests/python synthetic tests, src/vllm-transport.ts, src/model.ts, config/composition and transport tests.

Interfaces: authenticated capabilities/abort/terminal lookup bound to native ASGI request_metadata.request_id and pinned provider instance. Durable receipts contain native final usage only. Client controls use this only when explicitly configured and qualified.

- [ ] RED: fake pinned native engine abort emits native final ABORT output and final usage; stream stays readable. Unauthorized/cross-request IDs rejected. Partial usage cannot publish terminal success. Atomic journal failures stay fail-closed; prompt/content never retained.
- [ ] RED: cancelled client requests ask exact provider to abort while draining for at most1000ms; accept native terminal usage with aborted decision classification, preserve original cancellation outcome, do not execute its partial decision. Missing usage/failed control remains unknown. Already-complete usage is never overwritten by later cancellation.
- [ ] GREEN: implement native middleware/control/atomic terminal metadata and bounded client handling, retain full capture of abort control and final status. Verify native server path against installed pinned source; no guessed request-ID prefix.
- [ ] Commit verified changes.

### Task4: Integrate and review every finding offline

- [ ] Recheck previously repaired pre-invocation capture regression and complete command census across source/native handlers.
- [ ] Run full root units, affected owned integrations, Python bridge tests, types/style/build/boundaries/contracts and synthetic cancellation/deadline/failure checks. Read failures and correct narrowly with RED→GREEN.
- [ ] Review all changes separately. Self-review only: AGENTS.md prohibits delegation. Record decisions/limitations; preserve private ledgers rather than skill scratch cleanup.
- [ ] Commit exact source configuration and verify original services/held history before any real request.

### Task5: Two fresh validation rounds and honest acceptance

- [ ] Prepare/review fresh provider/controller/seal/watchdog/observer/inspection/closure operators. Metadata-only qualification checks actual cache topology, tighter prefill/wave settings, tokenizer/schema and abort-accounting capability/journal paths. No unrecorded inference probes.
- [ ] Prepare two independently fresh16-kingdom rounds with native exact models/profiles/consent/mandates. Seal finite absolute windows and concrete per-stage budgets after packet/role/source checks. Declare phase coverage required for concurrency promotion; unsupported phase coverage must leave capacity unchanged and remain visible.
- [ ] Execute round1 at2 and round2 at a justified capacity (at most4), with complete native accounting/evidence, actual actions/waits/rejections and per-profile timings. Use fresh IDs for each; all historical unknowns stay untouched under this new trial grant. Any new unresolved usage/preservation problem stops further real dispatch.
- [ ] Close safely; reconcile all native command stores/PACT receipts and terminal usage, four restores/state/artifact hashes, original services/data, and actual visualizations. Commit/report actual pass/fail and coverage limitations. Do not call source completion or successful short rounds a full-hour/universal qualification.

## Interface rulings / initial ledger

Task1→Task2/3: Explicit callTimeoutMs must enter immutable model snapshots and manifest identity. It shortens, never enlarges, native execution ceilings. Provider accounting grace is separate from generation, bounded by the existing one-second margin.
Task2→Task3: Wave leases cover the entire request including abort/final settlement; a released HTTP socket is not proof of known usage. Unsupported controls or missing final usage retain uncertainty and halt trial dispatch.
Task1→Task5: Command totals union modern commands, legacy resolutions and pending native turns, deduplicate exact IDs and report projection conflicts; never sum incompatible table counts.
Task3→Task5: Provider must demonstrate authenticated native abort/final-usage behavior with fake tests before real qualification. Historical three/six unknown allocations cannot be recovered from fresh provider state and remain reserved/null.
Task0: Ruling: The user accepted the investigation targets and explicitly requested implementation and two real rounds. Routine implementation choices are carried here, with no repeated permission request, no delegation, no push and no relaxation of retained-data/native limits.
