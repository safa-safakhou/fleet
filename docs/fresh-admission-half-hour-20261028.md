# Admission repairs deployed and fresh half-hour — 28 October 2026

The fixes were committed, pushed and deployed, and the fresh 30-minute run completed. **The reliability trial failed:** queue delays increased, six kingdoms acquired unresolved model usage, and no social exchanges occurred. Construction did progress. The world is paused, all owned execution services and the provider are stopped, and encrypted restoration passed.

## Release and scope

The owner authorized publishing the verified fixes in both repositories, deploying them and running a separate fresh 24-kingdom game for 30 minutes with Nemotron 4B. Work remained inline, without a GUI. E4/KQ1 remain blocked. Old worlds, identities, histories and unknown allocations were preserved.

The deployed releases are Fleet `bb4420e8e4e7bcf2a830f8cd013f6e2726191edb` and PACT `a11105c14228e97da9455f067939ad9b71ec6e38`, both pushed to `origin/master` before deployment. This report is a subsequent documentation change. The [repair implementation record](superpowers/plans/2026-10-27-admission-and-correction-repairs.md) describes the code and offline acceptance. All production changes are in Fleet; PACT economics and authoritative handlers are unchanged.

The release adds bounded oldest-fitting inference admission, serial waiters that release worker execution slots, native coordinator affordability filtering and bounded correction for known goal/capacity errors. It also permits one exact-command retry after a definitive native tick-pending rejection. Migration 041 and matching workers were installed together in the new Fleet database.

The unchanged source had passed 1,161 unit tests and 221 distinct isolated integration cases, including all eight native architectures and event-to-contact acceptance, plus types/style/build/boundaries. This operational turn rebuilt Fleet and PACT API/rules/event-publisher artifacts. Deployment verification covered 453 Fleet artifacts, 216 Fleet source files and 1,377 PACT artifacts. All 11 pinned model files passed size/SHA256 checks. A fresh clock control passed 301 samples over 300.426 seconds; baseline encrypted restoration matched 167 PACT and 77 Fleet tables. These offline checks do not establish successful live coordination.

## Conditions

The scheduled window was **00:09:13.826–00:39:13.826 Europe/Berlin on 28 October**, equivalent to **23:09:13.826–23:39:13.826 UTC on 27 October**. New databases and 24 new kingdoms started with zero agent actions, model calls or social history. The same preparation seed was retained for comparison. Twenty-four owner-preparation receipts are excluded from agent actions.

There are three kingdoms in each profile: A legacy-loop@1, B legacy-cognition@1, C reactive-basic@1, D reactive-cognition@1, E reactive-cognition@2, F reactive-cognition@1.1, G specialist-coordinator@1 and H autonomous-specialists@1.

Only `nvidia/NVIDIA-Nemotron-3-Nano-4B-BF16`, revision `dfaf35de3e30f1867dd8dbc38a7fc9fb52d3914f`, ran through isolated vLLM 0.32.0 as `nemotron-4b`. Thinking was enabled, temperature zero. Limits remained 65,536 context tokens, 128,000 request bytes, 8,192 output tokens, three calls/one accepted action per turn, and 180-second generation/360-second turn bounds. No source, model, limit or schedule was tuned during observation.

Eight worker execution slots now permit at most sixteen running turns including waiters. Provider concurrency remains bounded at four and by weighted token/cache admission. The provider reports 94 physical cache blocks; one null and one safety block leave 92 usable. Each request accounts for six fixed Mamba blocks plus attention blocks at 976 tokens each. Prefix caching and speculative decoding remain disabled. Four configured slots do not guarantee four simultaneous large requests.

## Remaining admission problem

Live observations establish that serial waiters release execution slots: an early sample had sixteen running turns, three executing and thirteen waiting. The runtime remains bounded, but that does not remove inference contention.

The fairness rule stops younger requests from passing an older request after four admissions. At 234 seconds, the sample showed one active request occupying 50 of 92 usable blocks, nine queued requests, and the bypass counter at four. The policy can again withhold spare capacity while waiting for the older request. This is a throughput/fairness tradeoff in Fleet, not proof that vLLM disabled parallel inference.

There is also a deadline mismatch across the legacy/native composition. The legacy model deadline runs while waiting for capacity. Native `ModelAdmission.decideOnce` enters `RouteCapacity.run` before creating `modelDeadline`; the latter accepts any positive remainder until the original turn deadline minus one second. The queued check added in this release is `runWindow.assertModelTime`: it reserves a full generation interval before the **operator window** closes, not before each individual **turn** expires. It therefore does not prevent native admission with only seconds left on a turn.

The first-burst audit found reservations for G2/G3/H2/H3 with only 4.946–9.800 seconds left on their original turn deadlines. Their recorded queues were 349.802–354.349 seconds. G1 had 39.335 seconds left and E3 had 107.994 seconds. All six allocations became unknown and their kingdoms were held. Reservation time is the measured boundary here; it is not claimed to be the exact network-dispatch instant. Unknown usage remains reserved, not counted as zero or replayed.

This links queue contention, deadline exhaustion and reduced subsequent participation. Later lower average queues must not be interpreted as recovery of the full 24-kingdom workload: six actors, including every coordinator, are already held. The bounded worker fix is live; reliable full-load admission is not established.

Source entry points: [admission](../src/platform/admission.ts), [composition](../src/app/composition.ts), [model deadline](../src/model-deadline.ts), [run-window guard](../src/run-window.ts). This run did not modify those paths or attempt uncertainty recovery.

## Activity and comparison

| Measure | Previous fresh half-hour | This run |
| --- | ---: | ---: |
| Turn attempts | 148 | 98 |
| Committed agent actions | 67 | 47 |
| Completed upgrades at cutoff | 39 | 29 |
| Reported model calls | 165 | 102 |
| Unknown model allocations | 0 | 6 |
| Proven not dispatched | 6 | 8 |
| Rejection/error turn outcomes, excluding planned drain | 10 | 20 |
| Output-truncated calls | 2 | 2 |
| Accepted contacts / messages | 0 / 0 | 0 / 0 |
| Pending contact requests | 7 | 1 |

The [previous fresh half-hour](fresh-reliability-half-hour-20261027.md) is a useful workload comparison, not a controlled causal estimate of an individual patch. The new release allowed more waiting turns but did not improve the measured full-fleet result. Holding six actors reduces subsequent demand and prevents a fair eight-architecture performance ranking.

All 24 kingdoms attempted work. Sixteen committed at least one action, spanning seven architectures:

| Profile | Attempts | Actions | Reported calls | Mean / p95 / maximum queue for reported calls |
| --- | ---: | ---: | ---: | --- |
| A — legacy-loop@1 | 6 | 6 | 9 | 13.959 / 51.199 / 57.763 s |
| B — legacy-cognition@1 | 6 | 3 | 6 | 13.571 / 20.110 / 20.450 s |
| C — reactive-basic@1 | 14 | 9 | 13 | 36.385 / 184.635 / 196.817 s |
| D — reactive-cognition@1 | 14 | 10 | 14 | 45.068 / 201.344 / 215.299 s |
| E — reactive-cognition@2 | 8 | 4 | 8 | 84.932 / 206.649 / 220.543 s |
| F — reactive-cognition@1.1 | 14 | 11 | 13 | 72.524 / 216.982 / 226.256 s |
| G — specialist-coordinator@1 | 3 | 0 | 0 | No reported calls; all three unknown |
| H — autonomous-specialists@1 | 33 | 4 | 39 | 15.810 / 44.764 / 336.846 s |

The 47 actions reconcile to 71 native committed receipts minus 24 preparation receipts. A `WAIT` terminal label can follow an action and does not by itself mean an idle turn. Completed upgrades were 15 farms, five barracks, six markets, one mine and two walls. Seven more upgrades were active and four waiting at pause.

One contact request remained pending, with zero accepted contacts, direct messages or reciprocal pairs. Three supply offers were created: two remained open and one expired. There were no supply contracts or training batches. The absence of coordinator responses and reduced specialist participation limit what this trial can establish about social decision quality. Construction alone does not meet the project's communicating-society goal.

## Queues, failures and correction

| Allocation status | Calls | Mean queue | Median queue | p95 queue | Maximum queue |
| --- | ---: | ---: | ---: | ---: | ---: |
| Reported | 102 | 34.803 s | 4.217 s | 210.669 s | 336.846 s |
| Unknown | 6 | 329.590 s | 350.213 s | 353.850 s | 354.349 s |
| Not dispatched | 8 | Not recorded | Not recorded | Not recorded | Not recorded |

Previous reported-call mean/p95/maximum queues were 28.673 / 84.546 / 193.581 seconds. Reported-call latency worsened here, with the long tail especially pronounced. Mean provider time for reported calls was 18.695 seconds; mean end-to-end time was 53.497 seconds. Failure/cancellation durations are excluded from those successful-accounting means.

All eight not-dispatched allocations were legacy calls that expired after approximately 180.006–180.020 seconds while awaiting capacity, four in each scheduled burst. Their `queueDelayMs` field is absent because it is recorded on admission. They must not be counted as zero-wait calls; the failure-event elapsed time provides the bounded waiting evidence. The per-profile table consequently omits these failed legacy waits and the six unknown native waits.

Twenty terminal rejection/error outcomes occurred before cutoff:

| Outcome | Count | Profile |
| --- | ---: | --- |
| MODEL_DEADLINE_EXCEEDED | 8 | A: 3; B: 5 |
| WORKER_EXPIRED with unknown model usage | 6 | E: 1; G: 3; H: 2 |
| TURN_DEADLINE_EXCEEDED | 2 | E |
| RESOURCE_CLAIM_CONFLICT | 2 | H |
| FORBIDDEN | 1 | H |
| PACT_DUPLICATE_NEGOTIATION | 1 | H |

The six unknown allocations belong to E3, G1, G2, G3, H2 and H3. Each retains 65,536 reserved tokens: **393,216 unresolved tokens in total**, separate from measured usage. Their model-failure events record deadline cancellation after dispatch; the terminal worker-expiry holds preserve uncertainty. The finer cancellation-to-accounting race and the exact `FORBIDDEN` guard were not fully attributed in this bounded run. No unknown call or command was replayed.

Two additional `RUN_WINDOW_MODEL_DRAINING` outcomes were deliberate refusals near the operator cutoff, not part of the twenty failures. The supervisor's aggregate failed/nonstandard counter is 22 because it includes these two. No turn finished after the scheduled cutoff.

Bounded feedback made eight reported correction calls across five turns: four for resource conflicts, two for duplicate negotiations, one for an unknown parent goal and one for a goal cycle. Two turns finished with `WAIT`; two still ended with resource conflicts and one with duplicate negotiation. The new goal-validation feedback path was exercised, but it did not make every corrected workflow succeed. There were no fresh coordinator reconsiderations or exact tick-pending retries. Coordinator affordability/capacity repair remains offline-verified without a successful coordinator workflow in this run.

## Context and hardware

All 116 request allocations selected thinking-enabled Nemotron. The 102 reported calls used 1,694,102 input and 85,183 output tokens, **1,779,285 known tokens**. Unknown usage is additional and must not be inferred from partial stream metadata.

The largest reported input was 36,607 tokens; including the full 8,192 output allowance, its requirement was 44,799 / 65,536 tokens (**68.36%**). No terminal context-overflow error occurred. The separate request-byte maximum was **127,047 / 128,000 bytes (99.26%)**, so packing headroom remains small. Recorded omitted-inbox/option counts were zero; that does not establish that all strategically useful information was selected. There are no reported input-token totals for the three coordinator calls.

Two reactive-cognition@2 calls reached the 8,192-token output cap with empty final content. Larger input context alone would not resolve this. The maximum sampled GPU allocation was 15,778 MiB of 16,303 MiB. Provider samples reached three running requests and four waiting; recorded preemptions were zero. No GPU out-of-memory failure was observed. These are sampled values, not proof of sustained four-way generation or spare capacity for this workload.

## Final preservation and remaining work

The window closed automatically with `HOST_DEADLINE`, 357 ms after its scheduled end. The world is paused at tick 29 and all 24 cohorts are paused. Eighteen agents remain ready; six retain their unresolved-usage holds. There are zero running turns, reserved allocations, capacity leases or pending/unknown platform commands. Unknown **model usage** remains six; it is distinct from unknown **game commands**.

Drain did not time out. All eight owned processes—provider, Fleet worker/console, PACT API/rules/event publisher, supervisor and guardian—were confirmed absent. Retained database storage was preserved. Authenticated encrypted restoration, with restore-network access disabled, matched every row in 167 PACT and 77 Fleet tables. Finalization completed at 00:39:58.852 Berlin, 45.026 seconds after the scheduled cutoff.

The next engineering boundary is per-turn model admission under a synchronized 24-kingdom burst: waiting, generation, cancellation and usage settlement must agree across legacy/native paths. The four-bypass policy also needs evaluation against this actual request mix. This report does not implement another repair, clear uncertainty or authorize another run. Offline passing tests and a clean operational pause do not qualify this release as reliable for a long run. E4/KQ1 remain blocked.

Private evidence is retained outside Git at `~/.local/share/pact-fresh-canary-20261028-7f6cfaf8/`, including deployment/model verification, aggregate samples, sanitized deadline/failure audits and encrypted snapshots. Operational helper logs are in Fleet's ignored `.superpowers/sdd/2026-10-28-admission-live-run/`. Credentials, decrypted correspondence and database dumps are excluded from this report.
