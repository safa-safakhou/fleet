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

- [x] RED: optional call deadline accepts shorter values, refuses longer/invalid/CLI values; defaults keep historical90/180s behavior and admission tests. Verify a declared three-call time envelope fits120s without changing the maximum.
- [x] RED: native census includes legacy-only COMMITTED, modern-only, overlapping IDs and pending legacy turns; rejects or exposes projection conflicts; empty scope returns none.
- [x] GREEN: implement the minimal bounds/census and verify affected tests, type/style/boundary checks. Keep original historical source pins unchanged.
- [x] Commit verified changes and record evidence.

### Task2: Prefill waves and profile-aware capacity qualification

Files: additive migration061, src/platform/admission.ts, src/config.ts/provider policy, src/research/orchestration/capacity.ts and focused tests.

Interfaces: consumes Task1 deadline and exposes optional wave policy plus explicit profile/phase qualification. Route policy changes must reject mismatched existing route rows rather than opening a second capacity pool.

- [x] RED: default backfill unchanged; optional wave admits bounded initial batch, refuses mid-wave backfill, resumes next queued wave after settlement; counters/fairness/resource leases/fences unchanged.
- [x] RED: two reactive waits cannot qualify a coordinator/legacy/autonomous workload; require selected profiles and applicable phases, known native settlement, instance/config scope and latency/resource headroom.
- [x] GREEN: persist wave window/admission timestamps, wire explicit opt-in configuration, test rollback/restart/mismatch and source gates.
- [x] Commit verified changes.

### Task3: Authoritative native abort/terminal accounting bridge

Files: scripts/lib/fleet_vllm_terminal.py (new middleware), tests/python synthetic tests, src/vllm-transport.ts, src/model.ts, config/composition and transport tests.

Interfaces: authenticated capabilities/abort/terminal lookup bound to native ASGI request_metadata.request_id and pinned provider instance. Durable receipts contain native final usage only. Client controls use this only when explicitly configured and qualified.

- [x] RED: fake pinned native engine abort emits native final ABORT output and final usage; stream stays readable. Unauthorized/cross-request IDs rejected. Partial usage cannot publish terminal success. Atomic journal failures stay fail-closed; prompt/content never retained.
- [x] RED: cancelled client requests ask exact provider to abort while draining for at most1000ms; accept native terminal usage with aborted decision classification, preserve original cancellation outcome, do not execute its partial decision. Missing usage/failed control remains unknown. Already-complete usage is never overwritten by later cancellation.
- [x] GREEN: implement native middleware/control/atomic terminal metadata and bounded client handling, retain full capture of abort control and final status. Verify native server path against installed pinned source; no guessed request-ID prefix.
- [x] Commit verified changes.

### Task4: Integrate and review every finding offline

- [x] Recheck previously repaired pre-invocation capture regression and complete command census across source/native handlers.
- [x] Run full root units, affected owned integrations, Python bridge tests, types/style/build/boundaries/contracts and synthetic cancellation/deadline/failure checks. Read failures and correct narrowly with RED→GREEN.
- [x] Review all changes separately. Self-review only: AGENTS.md prohibits delegation. Record decisions/limitations; preserve private ledgers rather than skill scratch cleanup.
- [x] Commit exact source configuration and verify original services/held history before any real request.

### Task5: Two fresh validation rounds and honest acceptance

- [x] Prepare/review fresh provider/controller/seal/watchdog/observer/inspection/closure operators. Metadata-only qualification checks actual cache topology, tighter prefill/wave settings, tokenizer/schema and abort-accounting capability/journal paths. No unrecorded inference probes.
- [ ] Prepare two independently fresh16-kingdom rounds with native exact models/profiles/consent/mandates. Seal finite absolute windows and concrete per-stage budgets after packet/role/source checks. Declare phase coverage required for concurrency promotion; unsupported phase coverage must leave capacity unchanged and remain visible.
- [ ] Execute round1 at2 and round2 at a justified capacity (at most4), with complete native accounting/evidence, actual actions/waits/rejections and per-profile timings. Use fresh IDs for each; all historical unknowns stay untouched under this new trial grant. Any new unresolved usage/preservation problem stops further real dispatch.
- [ ] Close safely; reconcile all native command stores/PACT receipts and terminal usage, four restores/state/artifact hashes, original services/data, and actual visualizations. Commit/report actual pass/fail and coverage limitations. Do not call source completion or successful short rounds a full-hour/universal qualification.

## Interface rulings / initial ledger

Task1→Task2/3: Explicit callTimeoutMs must enter immutable model snapshots and manifest identity. It shortens, never enlarges, native execution ceilings. Provider accounting grace is separate from generation, bounded by the existing one-second margin.
Task2→Task3: Wave leases cover the entire request including abort/final settlement; a released HTTP socket is not proof of known usage. Unsupported controls or missing final usage retain uncertainty and halt trial dispatch.
Task1→Task5: Command totals union modern commands, legacy resolutions and pending native turns, deduplicate exact IDs and report projection conflicts; never sum incompatible table counts.
Task3→Task5: Provider must demonstrate authenticated native abort/final-usage behavior with fake tests before real qualification. Historical three/six unknown allocations cannot be recovered from fresh provider state and remain reserved/null.
Task0: Ruling: The user accepted the investigation targets and explicitly requested implementation and two real rounds. Routine implementation choices are carried here, with no repeated permission request, no delegation, no push and no relaxation of retained-data/native limits.

Task1: complete — explicit shorter HTTP call bounds and envelope validation preserve historical defaults/ceilings; scoped native command census unions/deduplicates platform, legacy and pending projections and exposes conflicts without resolving them. RED: shorter config rejected; legacy census returned zero instead of one. GREEN:19deadline/envelope units,7owned capture/census integrations, full1297unit passes/23platform skips, types/style and boundaries pass. No real inference or retained-state mutation.

Task2: complete — opt-in250ms prefill waves retain route identity, accounting leases and fairness; exact profile/phase/replica scope gates refuse wait-only extrapolation and adverse outcomes. RED reproduces mid-wave backfill and cherry-picking; GREEN32owned integrations and16focused units, type/style/boundary checks. The additive migration is explicitly wired into the native migrator. Colima automatic host-port forwarding refused fresh ports; isolated owned SSH tunnels verified the fixtures without restarting original services. No real inference.

Task3: complete — opt-in authenticated exact-native abort controls preserve the response for a bounded1second accounting drain; native final_usage_info plus exact stream identity/finish is journaled atomically in a fresh0700directory/0600files before DONE. Matching instance/request/hash receipts can recover accounting after a dropped stream, with an empty unusable answer. Partial counts, wrong identities, failed journals and missing receipts remain unknown. Native controls/final receipts are captured through existing evidence. GREEN3CPU-only ASGI tests,31focused transport/model checks, owned cancellation integration and7census/capture integrations. Native reported counts survive cancellation; no partial decision is executable. Existing generic providers keep their prior behavior; historical unknowns stay untouched. Full1302unit passes/23platform skips; check/build/boundaries/contracts pass. Self-review covered exact native IDs (no guessed prefix), bounded transport and fail-closed journaling.

Task4 review follow-up: A native untilNextEvent WAIT finishes its turn but legitimately leaves both task and Temporal owner waiting. Added a RED→GREEN matched-projection regression; only finished/settled, known-usage, command-free WAIT with matching waiting task/owner may count complete. No task replay/reset is authorized.

Concrete trial ruling: two fully fresh16kingdom trials (two replicas per original eight profiles), each with a20minute hard window and a3minute preparation lead, ending earlier only after its bounded review opportunities settle. Each ordinary binding gets one native initial review; autonomous bindings may use up to three deliveries for their native worker/final cycle. All later queued sources remain retained/paused. The two-minute native intake/schedule policy remains recorded, but does not grant unlimited experiment dispatch. Each trial retains12calls/480000reserved tokens perkingdom,192calls/7680000aggregate,3calls/oneaction perturn, output1024/input48000/context32768, explicit35000ms call ceiling and unchanged120s turn ceiling. Use fresh qualified provider per trial, therefore both start at2; no cross-instance extrapolation to4. Prefill candidate1024 (reduced from4096, preserving headroom above the measured976token physical attention block) plus250ms waves. A512candidate below that block is deferred pending native scheduling qualification. New native unknowns or preservation failures stop further real dispatch. Report incomplete phases honestly; do not force gameplay to manufacture coverage.

Round1 sealed with sourcead2d740, worldfleet-repair-20261103-ef7cb300, providerfleet-metal-5aa1e00f, absolute10:15:24.347Z–10:35:24.347Z.16manual Temporal workers/sharedpool16 and independent controller/watchdog are ready. All16common PACT packets <=42045bytes; actual architecture-specific generation remains pending. A first packaging attempt was rejected by the unchanged strict manifest schema before any tasks/calls; unsupported metadata fields were moved into the manifest seed fingerprint alongside the full native model settings and provider-pin hash. Zero-task/zero-allocation preparation was verified before finite sealing; failed evidence retained. Temporal pre-restart full dumps needed a larger bounded256MiB operator buffer (actual73.2MB/2.9MB), not any loss of snapshot coverage.

Round1 preparation attempt01: stopped RESOURCE_OBSERVATION_FAILED at10:15:25.936Z, before any native turn/model request/command. Paused tick0, no unknowns, no pending capacity/commands/sessions, all owned execution stopped; four full SQL restores/state preservation passed. The collector swallowed its original exception, so exact attribution is unavailable. New TDD metadata reader eliminates synchronous CLI formatting/blocking, validates exact container/limits and bounds response/time;3unit cases and20actual read-only samples (max7.10ms) pass. Fresh retry operators must persist stage/cause codes. No blind replay/retiming: preserve attempt01 and use fresh provider/world/cohort/task/namespace/window. Zero consumed calls means two future trials still fit combined384/15360000 ceilings.

Fresh attempt02 (first actual validation round) sealedsource893898e, worldfleet-repair-20261103-4ac5e384/providerfleet-metal-41cb3414, absolute10:28:36.351Z–10:48:36.351Z. Collector12complete metadata-only cycles and16common packets pass;16manual workers/controller/watchdog ready. Attempt01 stays closed/retained; no replay/reset/retiming. Both actual validation rounds still await acceptance.

SUPERSEDING TRIAL WINDOW RULING: use15minutes (900000ms), an existing native-supported duration, for every future controller/watchdog/manifest/game-clock/seal. The earlier20minute proposal was an operator preflight error: Native RunWindow correctly rejected it before claim in attempt02, parking2owner projections with0turns/allocations/commands. These remain preserved, never reset/replayed. Attempt02 is closed at tick3,0unknowns, no pending execution, four SQL restores/state preservation pass. Actual native smoke now accepts15, rejects20, checks all16model call envelopes and late-start draining; native whitelist/limits stay unchanged.16common schemas also pass native llguidance metadata validation without generation. Prepare fresh attempt03, then a second actual round; both actual acceptance runs are still pending. Combined actual consumed allocations remain0.

Attempt03 sealedsource4f56d83, worldfleet-repair-20261103-17eb1c3f, providerfleet-metal-b591d646. Absolute10:44:18.742Z–10:59:18.742Z, duration900000. The seal itself validates a separate synthetic running copy of these EXACT bounds/all16model envelopes with Native RunWindow before task publication. Fresh controller/watchdog/manifest/game-clock deadlines all900000; no prior world/task/window was changed.
