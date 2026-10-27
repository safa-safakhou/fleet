# Published fixes and fresh 24-kingdom run — 27 October 2026

The owner authorized committing and pushing the fixes in both repositories, deploying them, and running one fresh 24-kingdom world for 30 minutes with Nemotron 4B. All three steps completed inline, without a GUI. The world is now paused, its execution services and model provider are stopped, and its encrypted backup passed restoration checks. Older worlds and unknown allocations were preserved; E4/KQ1 remain blocked.

This is a successful bounded deployment and shutdown, **not a clean behavioral pass**. Construction progressed in every architecture, but no contacts were accepted or messages exchanged. Ten turn rejection/error outcomes, two truncated responses and long inference queues remain material findings.

## Published release and verification

The source deployed for this run is Fleet `b01c8028a64472f4e2fcfb41f4834d19c84e0317` and PACT `c33c665c0c6794bcb46596ce3dc6b238bec12d75`, both pushed to `origin/master` before deployment. This report is a subsequent documentation commit, not a change to the running release. The [prior repair report](runtime-reliability-nemotron-20261027.md) describes the code changes and earlier comparison run.

The release includes immutable coordinator observations with bounded fresh reconsideration, correction-fit checks that avoid unchanged-input retries, typed cancellation attribution, and a model-dispatch cutoff that requires the configured generation bound plus settlement time. Shared admission, native workflow and metrics repairs are included. PACT's authoritative production rules/schema were unchanged.

Fresh preflight verification passed:

- 1,152 Fleet unit tests across 209 files.
- 193 isolated integration cases: 134 selected native workflow, coordinator, recovery, capacity, deadline and metrics cases, plus 59 autonomous-specialist cases. Providers were synthetic; databases were fresh test fixtures.
- Fleet TypeScript/style, production build and architecture boundaries. Style reported 152 existing warnings and 60 informational findings, with no errors.
- PACT API, rules worker and notification/event publisher builds.
- All 11 pinned model files passed size/SHA256 verification. Deployment verification covered 451 Fleet artifacts, 214 Fleet source files and 1,301 PACT artifacts.
- A fresh host-clock check passed over 301 samples / 300.439 seconds. Baseline encrypted restoration matched every row in 167 PACT and 77 Fleet tables.

No source, limits or model configuration were changed during the observation window.

## Run conditions

The scheduled window was **20:08:01.770–20:38:01.770 UTC**, or **21:08:01.770–21:38:01.770 Berlin**, on 27 October. Admission opened 1.714 seconds after the window began. Deadline closure was recorded 197 ms after its scheduled end; final restoration completed at 20:38:39.177 UTC. Gameplay results below were checked against the original cutoff.

This was a separate new world and Fleet database with 24 new kingdoms, three for each of eight profiles. The baseline had zero agent actions, model calls and messages. The 24 owner-preparation receipts are excluded from agent action counts. Prior world identities, histories and unresolved usage were not reset or repaired.

Only `nvidia/NVIDIA-Nemotron-3-Nano-4B-BF16`, revision `dfaf35de3e30f1867dd8dbc38a7fc9fb52d3914f`, ran through the isolated vLLM 0.32.0 provider as `nemotron-4b`. Thinking was enabled, temperature zero. Limits remained 65,536 context tokens, 128,000 request bytes and 8,192 output tokens; three model calls and one accepted action per turn, with the existing 180-second generation / 360-second turn bounds. The worker pool had eight slots, the provider a four-request ceiling and weighted admission against actual cache allocation. Four slots do not guarantee four simultaneous large requests.

Live cache metadata showed 94 physical blocks, with one null block and one safety block leaving 92 usable. Admission accounts for six fixed Mamba blocks per request plus attention blocks at 976 tokens each. Prefix caching and speculative decoding remained disabled.

## Actual activity

| Measure | Earlier Nemotron half-hour | This run |
| --- | ---: | ---: |
| Turn attempts | 175 | 148 |
| Committed agent actions | 88 | 67 |
| Completed upgrades at cutoff | 41 | 39 |
| Accepted contacts | 3 | 0 |
| Messages / reciprocal pairs | 7 / 1 | 0 / 0 |
| Reported model calls | 212 | 165 |
| Unknown model allocations | 2 | 0 |
| Proven not-dispatched allocations | 3 | 6 |
| Output-truncated calls | 4 | 2 |
| Known input + output tokens | 3,963,288 | 3,025,671 |

The earlier results come from the linked repair report. This is one fresh-world comparison, not a controlled causal estimate: inference contention, game choices and cutoff admission differ. Lower unknown usage is observed; improved intelligence or overall productivity is not established.

All 24 kingdoms attempted work and all eight architectures committed actions:

| Profile | Kingdoms attempting | Attempts | Committed actions |
| --- | ---: | ---: | ---: |
| A — legacy-loop@1 | 3 | 6 | 5 |
| B — legacy-cognition@1 | 3 | 6 | 4 |
| C — reactive-basic@1 | 3 | 15 | 10 |
| D — reactive-cognition@1 | 3 | 15 | 9 |
| E — reactive-cognition@2 | 3 | 11 | 7 |
| F — reactive-cognition@1.1 | 3 | 14 | 10 |
| G — specialist-coordinator@1 | 3 | 16 | 12 |
| H — autonomous-specialists@1 | 3 | 65 | 10 |

The 67 actions reconcile to 58 confirmed platform commands plus nine legacy actions, and to 91 native committed receipts minus 24 preparation receipts. A turn ending `WAIT` can already have committed an action; terminal labels alone do not measure inactivity.

Completed upgrades were 17 farms, ten barracks, six markets, four walls and two mines. Eight further upgrades were active and five Hall upgrades were waiting when paused; all 24 Halls remained level 1. Seven contact requests remained pending. Two supply offers were open and two expired; there were no supply contracts or training batches. Progress in construction does not establish the intended communicating-society behavior.

## Rejections, correction and shutdown

Ten terminal rejection/error outcomes occurred outside the planned model-admission drain:

| Outcome | Count | Architecture |
| --- | ---: | --- |
| RESOURCE_CLAIM_CONFLICT | 5 | Autonomous specialists |
| GOAL_CYCLE | 1 | Autonomous specialists |
| PACT_DUPLICATE_NEGOTIATION | 1 | Autonomous specialists |
| DEADLINE_MISSED | 1 | Autonomous specialists |
| TICK_PENDING | 1 | Legacy loop |
| STRUCTURED_CAPACITY_CONFLICT | 1 | Specialist coordinator |

The correction path made 21 reported feedback calls across 13 turns: 14 calls for resource conflicts, five for duplicate negotiations and two for undispatched evidence references. Six of those turns finished with `WAIT`, including one with a committed action. Seven ended in another rejection: five resource conflicts, one duplicate negotiation and one goal cycle. A bounded correction loop operated, but did not reliably change the model's decisions.

Sanitized response inspection confirms repeated affordability mistakes. Three failed supply-sign turns repeated requests for 4,800 resource units when the corresponding remaining amounts were only 400–1,000 units. Two failed training turns chose counts `8 → 8 → 8` and `8 → 2 → 8`, despite exact resource feedback. Other corrected turns chose to wait; one undispatched-reference correction successfully produced a supply signature. These observations support a decision-quality problem in those examples, not a claim that every remaining rejection has the same cause. The deadline, tick race, goal-cycle and structured-capacity outcomes still need separate attribution before proposing repairs.

There were also **28 `RUN_WINDOW_MODEL_DRAINING` outcomes**. These are deliberate refusals to begin another call without its full generation allowance before the run cutoff; they are separate from the ten outcomes above. Six model allocations were proven not dispatched. Some turns had started earlier and then met the cutoff while attempting a later call. One coordinator turn retained a known truncated response before its further call was refused. The raw final supervisor counter reports 38 failed/nonstandard turns because it combines these 28 with the ten other outcomes; interpreting all 38 as model failures is incorrect.

Fresh coordinator reconsideration was **not exercised in this live run**: its trace count is zero. Its offline coverage passed, but this trial cannot establish live recovery for a changed coordinator observation. No truncation or rejection caused an extra unbounded retry, manual replay or limit increase during this run.

## Context, latency and hardware

All 171 recorded request allocations selected thinking-enabled Nemotron; 165 were reported calls and six were not dispatched. Reported usage was 2,896,384 input and 129,287 output tokens. Finish reason and reasoning metrics were present for all 165 reported calls.

The largest reported input was 40,319 tokens. Including the full 8,192 output reservation, the largest context requirement was 48,511 / 65,536 tokens, or **74.02%**. No terminal input-context overflow occurred. However, the largest request was **126,769 / 128,000 bytes (99.04%)**, leaving little room under the separate byte limit. Adequate model context does not eliminate this packing constraint. Recorded inbox/option omission counts were zero; this does not prove every useful piece of world information was selected.

Two calls reached the 8,192 output cap, one autonomous and one coordinator response. Increasing input context alone would not resolve output truncation.

| Profile | Maximum request bytes | Maximum reported input tokens | Largest input + output allowance / context | Longest recorded queue |
| --- | ---: | ---: | ---: | ---: |
| legacy-loop@1 | 55,567 | 11,923 | 30.69% | 55.005 s |
| legacy-cognition@1 | 53,137 | 11,090 | 29.42% | 67.978 s |
| reactive-basic@1 | 55,401 | 14,775 | 35.04% | 64.312 s |
| reactive-cognition@1 | 65,339 | 17,798 | 39.66% | 75.849 s |
| reactive-cognition@2 | 126,769 | 35,555 | 66.75% | 218.450 s |
| reactive-cognition@1.1 | 76,972 | 21,528 | 45.35% | 206.280 s |
| specialist-coordinator@1 | 119,257 | 40,319 | 74.02% | 193.581 s |
| autonomous-specialists@1 | 69,424 | 18,141 | 40.18% | 187.820 s |

Average provider time was 15.709 seconds; average end-to-end call time was 44.381 seconds. The longest recorded capacity queue was 218.450 seconds. Peak sampled GPU memory was 13,792 MiB of 16,303 MiB; sampled provider concurrency reached three requests, with two waiting and zero recorded preemptions. These are sampled maxima, not proof of four concurrent requests or a no-contention service. Queueing remains a bottleneck even though the measured context and physical cache fit.

## Final preserved state and evidence

The world is paused at tick 29. All 24 cohorts are paused and all 24 agents/credentials remain ready. There are zero unknown or reserved model allocations, running turns, capacity leases, pending/unknown platform commands or held agents in this new world. Drain did not time out. All eight owned processes—provider, Fleet worker/console, PACT API/rules/event publisher, supervisor and guardian—were confirmed absent after shutdown. Retained database storage was not removed.

Authenticated encrypted restoration, with restore-network access disabled, matched every row in 167 PACT and 77 Fleet tables. Finalization completed 37.407 seconds after the scheduled cutoff. No older world's unknown usage was cleared, and no new run is authorized by this report.

Private evidence remains outside Git at `~/.local/share/pact-fresh-canary-20261027-37bf4947/`: the closed window, deployment manifest, aggregate observations, `final-summary.json`, cutoff report, correction audit, closure audit, provider-stop record and encrypted backups/restore results. Local verification logs are in Fleet's ignored `.superpowers/sdd/2026-10-27-publish-fresh-run/`. Credentials, decrypted correspondence and dumps are excluded from this report and commits.

The immediate result is a deployed, measurable fresh run with clean usage settlement and bounded shutdown. Social interaction, resource correction, output truncation and queue latency remain open; the experiment does not justify describing the whole system as fixed.
