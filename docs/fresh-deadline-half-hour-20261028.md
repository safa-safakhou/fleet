# Queue/deadline deployment and fresh half-hour — 28 October 2026

The owner-authorized fresh 24-kingdom run completed its 30-minute window. **The repaired queue/accounting paths held in this trial: all 184 model calls were reported, with no unknown usage, held agents, worker expiry, model-generation timeout or turn timeout. All 24 kingdoms committed actions.** This is not a clean behavioral pass: proposal rejections, output truncations and incomplete social exchanges remain.

The world is paused at tick 29. All owned runtime services and the provider are stopped. All 24 finite-run cohorts are terminal `finished`, while their agents remain `ready`; they were not reopened or relabelled paused. The retained world, records and private evidence remain available.

## Published release and preparation

The queue/deadline fixes and reports were committed and pushed to both master branches: Fleet `c9c21f27d3ec9f35f4d015764db84b7501866874`, PACT `cccef556a6e06fb1c6f82e21bab9d32020ac389b`. A preflight clock-validator correction was then committed, pushed and included before launch: **Fleet `e11bd3c220718fc665a849303ae2cd43a47f564c`, PACT `661e38da54b8810a963e40471e3bc0f07637bc0d`**. This result report is a subsequent documentation commit. Remote master hashes were independently checked after publication.

The [repair report](queue-turn-deadline-repair-20261028.md) describes the production changes and offline acceptance. Publication reran 1,169 units, types/style/build/boundaries; the clock follow-up passed all **1,176 units**, ten clock regressions, two guardian tests, types/style/build/boundaries. The earlier 85-case final integration selection and current native workflow coverage remain the offline runtime evidence; no new full integration invocation is claimed here. PACT API, rules and event-publisher artifacts were rebuilt. No PACT production rule change was needed.

The first 301-sample clock control tracked Windows within 0.003%, but an exact-10000-microsecond tick check rejected normal coarse/fine compensation. The corrected validator checks combined adjustment against the existing 0.1% bound while retaining independent Windows comparisons and other guards. The fresh confirmation passed 301 samples over 300.410 seconds. **No system clock or synchronization-service setting was changed.** Both controls were retained. The first rejected launch never armed the world or called a model.

Deployment verified 453 Fleet artifacts, 216 Fleet source files and 1,377 PACT artifacts; these hashes still matched after the run. All eleven pinned model files passed size/SHA256 checks. Baseline and final encrypted restore checks each matched **167 PACT / 77 Fleet tables**. Work stayed inline, without GUI or delegated agents. E4/KQ1 remained blocked throughout.

## Conditions and exact window

The scheduled window was **10:14:49.211–10:44:49.211 Europe/Berlin**, or **09:14:49.211–09:44:49.211 UTC**, on 28 October 2026. The independent host-clock guardian closed admission on `HOST_DEADLINE` at 09:44:49.342 UTC, 131 ms after the scheduled boundary. Supervisor shutdown completed without a drain timeout; final restoration completed at 09:45:30.210 UTC. No turn finished after the scheduled cutoff.

A separate fresh PACT/Fleet instance had 24 new kingdoms, zero inherited agent actions/model calls/social history and the same preparation seed/settings as the previous comparison run. Twenty-four owner-preparation receipts are excluded from agent actions. No source, strategy, budget, model setting or schedule was tuned during observation.

Only `nvidia/NVIDIA-Nemotron-3-Nano-4B-BF16`, revision `dfaf35de3e30f1867dd8dbc38a7fc9fb52d3914f`, ran through isolated vLLM 0.32.0 as `nemotron-4b`. All 184 calls enabled thinking. Limits stayed at 65,536 context tokens, 128,000 request bytes, 8,192 output tokens, three calls/one accepted action per turn, 180-second generation and 360-second turn bounds. Scheduled reviews remain every fifteen minutes; reactive profiles additionally receive eligible game events.

Eight execution slots permit up to sixteen running turns including waiters. Provider capacity is four request slots, further bounded by actual cache demand: 94 physical blocks, one null and one safety block, leaving 92 usable. The sampled peaks were sixteen running turns, four executing workers, fourteen waiting workers and three simultaneous provider requests. Sampled active leases reached 92 blocks. Provider metrics recorded a maximum of two internally waiting requests and zero preemptions. These are sampled peaks, not proof that no higher instantaneous count occurred. Peak sampled GPU usage was 14,247 MiB of 16,303 MiB; after shutdown it fell to about 1,550 MiB.

## Activity and comparison

| Measure | Previous fresh half-hour | This run |
| --- | ---: | ---: |
| Turn attempts | 98 | 172 |
| Kingdoms committing actions | 16 | 24 |
| Committed agent actions | 47 | 69 |
| Completed upgrades at cutoff | 29 | 39 |
| Reported model calls | 102 | 184 |
| Unknown model allocations / held agents | 6 / 6 | 0 / 0 |
| Worker-expiry outcomes | 6 | 0 |
| Accepted contacts / messages | 0 / 0 | 2 / 0 |
| Pending contact requests | 1 | 4 |
| Reported-call mean queue | 34.803 s | 36.466 s |
| Reported-call p95 queue | 210.669 s | 114.562 s |
| Reported-call maximum queue | 336.846 s | 152.424 s |

The [previous trial](fresh-admission-half-hour-20261028.md) lost six actors to unknown usage; this trial kept all 24 eligible. The lower tail latency and absence of usage holds support the repairs, but the slightly higher mean queue and different realized actions mean this is not a controlled estimate of each individual patch.

| Profile: three kingdoms each | Attempts | Actions | Reported calls |
| --- | ---: | ---: | ---: |
| A — legacy-loop@1 | 6 | 6 | 12 |
| B — legacy-cognition@1 | 6 | 3 | 9 |
| C — reactive-basic@1 | 13 | 10 | 12 |
| D — reactive-cognition@1 | 14 | 11 | 12 |
| E — reactive-cognition@2 | 12 | 8 | 11 |
| F — reactive-cognition@1.1 | 17 | 13 | 15 |
| G — specialist-coordinator@1 | 15 | 7 | 22 |
| H — autonomous-specialists@1 | 89 | 11 | 91 |

The 69 actions reconcile to 93 native committed receipts minus 24 preparation receipts. All 24 kingdoms acted at least once. Of 126 `WAIT` terminal outcomes, 63 had no effects; the other 63 followed an action. Six further actions ended on `TURN_ACTION_LIMIT`. A `WAIT` label alone therefore does not mean the turn was idle.

Completed upgrades: 18 farms, eleven barracks, five markets, two mines and three walls. Seven upgrades remained active; nine instructions were waiting, including eight Hall upgrades. Those outstanding instructions are preserved, not assumed successful or cancelled. There were no training batches or active supply contracts. Three supply offers were created: two open and one expired at pause.

## Queue, deadline and accounting results

All 184 allocations are `reported`: **3,365,229 input + 146,228 output = 3,511,457 known tokens**. There are no unknown, reserved or not-dispatched ledger rows. Native pre-admission refusals need not create an allocation and are counted separately below.

Reported-call queue median/mean/p95/maximum: **17.360 / 36.466 / 114.562 / 152.424 seconds**. Mean provider time was 16.509 seconds and mean end-to-end time 52.975 seconds. No refused queue is counted as a zero-time successful call.

All 184 capacity-admission events had at least **182.575 seconds of turn headroom** at the recorded admission boundary. This is not claimed to be an exact network-dispatch timestamp. Seven queued requests were refused with `MODEL_ADMISSION_DEFERRED`, and four with `RUN_WINDOW_MODEL_DRAINING`; maximum measured queue among these refusals was 75.033 seconds. Additional refusals happened before entering capacity admission or before a subsequent call.

| Terminal outcome | Count | Interpretation |
| --- | ---: | --- |
| `MODEL_ADMISSION_DEFERRED` | 27 | Full generation allowance no longer fit. Nine finished before the operator window's latest-start cutoff; eighteen at or after it. No unknown usage or agent hold resulted. |
| `RUN_WINDOW_MODEL_DRAINING` | 4 | Planned operator-window admission refusal. |
| `RESOURCE_CLAIM_CONFLICT` | 4 | Specialist proposals still conflicted after bounded feedback. |
| `PACT_SUPPLY_BOND_EXCEEDS_FLOW` | 2 | Specialist supply proposals failed the bond/flow validation. |
| `FORBIDDEN` | 1 | H3 supply-signing attempt rejected before a durable game command existed. The referenced offer existed and H3 was a party; the precise authority sub-check was not established. Do not label this definitively a model mistake or a fixed engineering issue. |
| `MODEL_OUTPUT_TRUNCATED` | 1 | One specialist turn ended on output truncation. Three calls across the whole run reached the output cap; call and turn counts differ. |
| `DEADLINE_MISSED` | 1 | H3's game-event task was already expired in `pact.game-time-ms`; it stopped in approximately 100 ms with zero calls/allocations/commands and nearly six minutes left on its turn lease. This was not a provider or turn timeout. |

The supervisor's raw nonstandard-outcome count is 40: 31 admission/drain stops, eight proposal/output rejections and one expired event task. Within the 31 admission stops, 22 occurred at or after the global latest-start boundary; nine occurred earlier. These categories must not be collapsed into forty model failures.

Fifteen reported correction calls covered ten turns: five finished `WAIT`, four still ended with resource conflicts, one with output truncation. One coordinator fresh-reconsideration event was recorded. These counters prove that bounded correction ran; they do not prove all decisions were good.

## Context and social observations

The largest measured input was 40,458 tokens. Input plus the full reserved output occupied at most **74.23%** of the 65,536-token context. The largest request was **125,187 / 128,000 bytes (97.80%)**, in reactive-cognition@2. No context/packing failure occurred, but the byte limit has little remaining room in that profile and should not be confused with token-context headroom. All recorded inbox/quoted-option omission counters were zero. Three calls hit the output cap, including two specialist and one coordinator call; a larger input context would not by itself fix that output exhaustion.

Six contact requests produced two accepted contacts and four pending requests. Two pending requests targeted A1/A2 after those timed-only agents' last model request; neither recipient received a subsequent model request within this window. F1 and H2 had later requests containing their pending contact IDs, so those two pending requests cannot be attributed simply to absent delivery. H3 and G2 accepted their incoming requests. No direct messages or reciprocal message pairs occurred. The contacts were accepted late, around the model-admission cutoff; this trial does not establish whether the resulting relationships would produce exchanges later.

Construction and participation improved, and contact acceptance occurred. The intended communicating society is still not demonstrated by two acceptances and zero messages. Remaining action rejections, output limits, planning quality and the unattributed signing refusal remain explicit follow-up areas; none was changed during this run.

## Preservation and handoff

Final state: world paused at tick 29/game time `1793179980000`; 24 finished cohorts, 24 ready agents, zero running turns/capacity leases/pending-or-unknown commands. Worker, PACT API/rules/event publisher, Fleet console, supervisor, guardian and provider processes are all stopped. Final encrypted restore matched every recorded table. The previous retained world was checked before and after: its 24 paused cohorts, six unknown allocations and 393,216 reserved tokens are unchanged.

Private evidence is under `/home/mnim/.local/share/pact-fresh-canary-20261028-058fe6f7`, with execution notes under Fleet's ignored `.superpowers/sdd/2026-10-28-deadline-live-run/`. Aggregate/queue/admission/cutoff/social/closure reports and encrypted dumps remain private; credentials, correspondence and model traces are not published. Both repository current-state files point to this report. No continuation or longer run is started; E4/KQ1 remain blocked.
