# Native architecture repair and matched repeat — 24 October 2026

Status: four requested repairs are implemented and verified offline. The frozen repeat completed with **683/720 correctly answered requests (94.86%)**, versus 392/720 before. None of the four original failure signatures recurred. Additional native decoding, output/call-budget and transport failures prevent complete qualification. Owned services are stopped with evidence retained. No 24-hour run started.

The subsequent [retained-evidence investigation](native-repeat-investigation-20261024.md) identifies repeated formatting whitespace as the cause of all five captured truncations, substantial unreturned generation on the three timeout calls, the exact memory-contract boundary, and publication/cutoff and reporting defects. It includes CPU-only positive/negative decoder and memory controls; no new inference or runtime change.

## Scope

The user authorized four cause repairs, separate offline verification and one fresh 24-kingdom, 30-minute game-free rehearsal. Work is inline, using only Nemotron 4B, without GUI or deployment. Ordinary game execution stays disabled; E4/KQ1 remain blocked. Existing worlds, services, private evidence and unresolved allocations are preserved.

This repeat uses the same registered roster as the [failed native rehearsal](native-architecture-rehearsal-20261024.md): three kingdoms each of `legacy-loop@1`, `legacy-cognition@1`, `reactive-basic@1`, `reactive-cognition@1`, `reactive-cognition@1.1`, `reactive-cognition@2`, `specialist-coordinator@1` and `autonomous-specialists@1`. The autonomous trio contains one resources/diplomacy and two full presets, ten persistent participants in total. These are eight registered definitions, rather than a claim that every conceivable configuration is represented.

Inputs remain thirty synthetic request rounds, affordable-choice objectives, deliberately stale views in rounds 2/10/18/26 and receipt notifications to another simulated kingdom. This is a local HTTP simulation with fresh isolated storage, not the retained PACT world. Native engines, event intake, scheduling, feedback, accounting, specialist state and receipt handling are exercised. Simulated peer messages are fixed notifications, not unrestricted diplomacy. Free-text truthfulness and adversarial disclosure are not fully graded by this workload.

## Four repairs and separate offline checks

| Cause | Implemented repair | Verification before inference |
| --- | --- | --- |
| Native schemas rejected by vLLM's automatic decoder fallback | Expand bounded acyclic local references; remove only tautological string-only property-name constraints. Preserve literals, exclusive unions and substantive constraints. Reject unsupported conversions before dispatch and validate returned JSON against the schema supplied to the provider adapter. | Regression tests cover references, literal data, exclusivity, bounds, cycles and usage retention. All 348 distinct emitted native schemas pass the installed vLLM automatic-backend preflight: 261 XGrammar, 87 Guidance. |
| Stale correction exceeds the 32,000-byte input cap | Reserve 8,192 bytes during initial native packet fitting and avoid duplicating the full observation in the simulation's grounding message. Retain task/peer context and enforce the original total cap on every attempt. | Scoped admission and full-history stale regressions; thirty-round scripted native composition passes all 720 requests under unchanged three-call limits. This does not promise that arbitrarily large rejected output can always be corrected. |
| Coordinator spends all three calls before correction, then aborts dispatched siblings | Under correction-enabled policies, stage one worker plus possible correction plus selector; rotate worker focus through declared state. Settle already dispatched siblings after known worker rejection. External cancellation/authority fencing remains. | Coordinator stale cases now included in successful assertions. A negative control reinstates the old abort and reproduces unknown usage, then restores the candidate; the repaired regression passes. |
| Specialist history bookkeeping overflows, then retries without new evidence | Add explicit `required-first.v2`: omit superseded unprotected snapshots from model candidate metadata, bound omission examples while preserving exact counts, and fit the complete wrapper. Keep originals and protected historical support in storage. Zero-call preparation failures wait for evidence change instead of timer retry. | Wrapper-overhead, 100-observation history, protected support, original compact-contract compatibility and event-wake tests. All autonomous participants remain in the thirty-round scripted check. |

Offline totals: **981 unit tests across 184 files, 138 selected integration tests across nine files**, TypeScript, build, boundary and changed-code style checks passed. Style retains two pre-existing warnings and an existing test-style informational finding. Integration storage is fresh, isolated and synthetic. Schema preflight uses the installed decoder/tokenizer without making model calls. Eleven pinned model files are hash-verified before boot; no dependency or model downloads were needed.

The provider is isolated vLLM with the same pinned NVIDIA Nemotron 4B BF16 weights. The repeat keeps eight task workers, four inference slots, three calls/one action per turn, 45-second provider timeout and a 3,000-invocation ceiling. The coordinator staging, initial byte reservation and explicit specialist packing version are intentional candidate changes; these are not increases to model or turn budgets. Runtime source hashes are frozen for the measured window.

## Actual repeat results

| Registered architecture, three kingdoms each | Before: correct / 90 | After: correct / 90 |
| --- | --- | --- |
| legacy-loop@1 | 90 | 76 |
| legacy-cognition@1 | 90 | 75 |
| reactive-basic@1 | 90 | 90 |
| reactive-cognition@1 | 0 | 90 |
| reactive-cognition@1.1 | 0 | 90 |
| reactive-cognition@2 | 83 | 88 |
| specialist-coordinator@1 | 3 | 87 |
| autonomous-specialists@1 | 36 | 87 |
| **Total** | **392 / 720** | **683 / 720** |

This is **291 additional correct requests, +40.42 percentage points**, with regressions visible in both legacy rows. The repeat fixes the original blockers; it does not establish universal recovery or 24-hour readiness.

The 37 missed requests partition without double counting:

| Cause | Missed request-rounds | Evidence |
| --- | --- | --- |
| Three transport timeouts, followed by preserved uncertainty blocking | 27 | One legacy-cognition kingdom misses rounds 18–30; two legacy-loop kingdoms each miss rounds 24–30. |
| v2 optional-memory/native-schema mismatch | 1 | Round 1; detailed below. |
| Incorrect objective proposals followed by output truncation at the last allowed call | 1 | One legacy-cognition round-3 request proposes an inferior choice twice, then reaches 1,536 output tokens on call three. The same request remains unanswered even when its task later processes a newer view. |
| Work unfinished at the fixed admission cutoff | 8 | Round 30: one legacy-cognition, one v2, all three coordinator and all three autonomous requests. These are separate from the three already blocked kingdoms. |

All thirty rounds were published, none skipped. Round 30 was delayed until monotonic 1,779,829.709ms while the previous round drained, leaving about 20 seconds of admission time. Seven turns were active at cutoff; they drained without opening new admissions. Four subsequent provider attempts were refused before dispatch, producing three coordinator `REHEARSAL_ADMISSION_CLOSED` turn errors. This is an additional rehearsal timing/coverage limit, rather than a recurrence of coordinator allowance exhaustion. A strict 30-minute offered-load test cannot count unfinished work as answered or silently extend its admission window.

The window is 1,800,000 monotonic milliseconds, with 6,822.682ms additional drain. UTC is 15:28:36.392–16:00:34.204, a 31m57.812s wall-clock span. As in the baseline, the monotonic/wall discrepancy is observed but its cause is not established.

## Usage, recovery, latency and guards

- **1,384 dispatched invocations:** 1,381 reported and three unknown, versus 861 / 852 / nine before. The raw call log additionally includes four correctly refused pre-dispatch attempts; its 1,388 rows must not be called 1,388 model executions. The ledger retains those four as `not_dispatched`.
- Known usage: **8,248,984 input + 152,275 output = 8,401,259 tokens**. The three unknown allocations retain **120,000 reserved tokens** with null measured usage. The old nine unknown allocations remain untouched in the preceding fixture.
- **683 confirmed receipts and 683 synthetic peer notifications**, with no duplicate request effects, invalid scored effects or request/binding scope violations. 1,305 accepted host-fact checks have zero binding/revision/choice mismatches. 532 platform commands are confirmed; another 151 receipts use the native legacy receipt path. All 87 autonomous intents are settled; no platform command remains pending and no capacity lease remains.
- Native scoped feedback: 982 groups; 907 first-valid, 72 first-invalid, three unassessable; 979 semantic-final-valid and 72 recovered. There are 73 corrections/feedback deliveries, zero repeated-failure counts, 72 stale errors and one objective error. One group has both stale and objective feedback. These are **feedback groups, not independent request success grades**; semantic acceptance can still precede the native-envelope failure described below.
- Legacy grounding: 153 proposal-bearing turns; 130 first-valid, 23 first-invalid, 22 recovered and 152 final-valid. Checks reject 20 stale and four objective proposals. Known truncated calls are accounted separately; these counts do not include every call as a graded proposal. Later task execution against a newer view does not repair an older missed request.
- Five known-usage `MODEL_OUTPUT_TRUNCATED` responses occur in legacy-cognition. Four are recovered within their respective turns; the fifth is the final call of the failed round-3 request. Three transport timeouts are separate unknown-usage executions. No schema-backend rejections, correction `input_limit`, coordinator allowance failures or specialist packet failures recur.
- Raw attempt latency, including the four pre-dispatch refusals: p50 **3.963s**, p95 **9.482s**, max **45.004s**. Provider-capacity queue delay across 1,388 admissions: p50 **3.660s**, p95 **9.169s**, max **16.969s**. Turn latency across 1,051 turns: p50 **8.774s**, p95 **29.133s**, max **63.670s**. Capacity queue delay excludes work never claimed because of uncertainty or cutoff; turn duration is not complete request end-to-end latency.
- Maximum three provider attempts per turn; largest measured input 25,770 bytes, below the unchanged 32,000 total ceiling. Largest observed v2 input is 11,043 tokens.
- Final tasks: **1,042 completed, 171 ready, four waiting, three blocked**. All four waiting tasks carry `REHEARSAL_ADMISSION_CLOSED`. Task completion does not mean all historical requests were answered; request receipts determine the table above.
- Four actual simultaneous inferences are observed. Peak GPU **15,890 / 16,303MiB**, minimum available WSL RAM **7.813GiB**, over 182 resource samples. Provider records **four cache preemptions** and is idle before shutdown. No out-of-memory crash is recorded.

The workload grades authoritative numeric choices, receipt effects, scope and known facts. It does not provide a full independent false-rejection rate, free-text factuality/leakage grade, adversarial peer-content assessment or complete queued-request latency distribution. Those metrics remain unassessed here; zero invalid simulated effects must not be reported as universal model accuracy or privacy acceptance.

## Additional failure exposed during the repeat

One first-round `reactive-cognition@2` response fails native envelope decoding. Read-only inspection of its retained response, checked offline against the native schema, finds a 196-character environment reference in `memory.memories[0].evidenceRefs[0]`; the native field permits at most 100 characters and expects stored original evidence IDs.

The simulation grounding helper replaces every field named `evidenceRefs` with its environment-source reference enum. That traversal also changes the optional memory field, which belongs to another reference namespace. The provider adapter accepts the prepared schema, but the native decoder subsequently rejects the envelope outside the semantic feedback boundary. This exposes a policy/native-schema integration defect, rather than an unaffordable simulated action or a hardware limit. The rejected envelope produces no simulated effect.

The scripted provider emits minimal responses without optional memory updates, so its 720/720 result does not cover this branch. The 348-schema decoder preflight establishes backend compatibility, not agreement between every policy-modified field and the native decoder. The measured source is unchanged after discovering this failure. A scoped reference-namespace repair and an optional-memory correction regression remain necessary before claiming complete native qualification.

## Additional capacity observation

Five legacy-cognition responses reach the unchanged 1,536-token output limit. Three requests time out after 45 seconds: one legacy-cognition in round 18 and two legacy-loop in round 24. These leave unknown usage and block their tasks; reservations remain preserved. A returned turn or semantically accepted proposal does not by itself establish an answered request or settled usage.

The provider reports four cache preemptions. Startup advertises 40,603 cached tokens and maximum concurrency 2.48 at the full 16,384-token request length, despite allowing four simultaneous sequences. The observed v2 input reaches 11,043 tokens. Four slots therefore do not guarantee room for four worst-case contexts plus generation. This is a measured capacity constraint; no out-of-memory crash is established and the evidence does not prove that preemption alone caused the timeouts. In particular, the final preemption counter remains four after the two later legacy-loop timeouts, so the evidence does not directly attribute those timeouts to new preemptions. Request-correlated provider timing and token-aware admission/cache-capacity checks are needed. Increasing timeouts or clearing unknown usage would not establish correctness.

## Evidence and preservation

Private evidence for this repeat is retained at `/home/mnim/.local/share/fleet-native-rehearsal-20261024-151624/`. Raw responses, fixture credentials, storage snapshots and dumps stay outside Git. The preceding failed run at `/home/mnim/.local/share/fleet-native-rehearsal-20261024-132926/`, including its nine unresolved allocations, is not restarted, cleared or replayed.

All 234 frozen source-file hashes remain unchanged through the run. Result SHA-256: `169a066477a4f0b104f657fcebbc423d724ceb10a18d49fc216dd2948286800c`. The owned provider process group is stopped after PID/start-time/cwd verification; its port 18535 and simulation port 34429 are closed. Fixture container `2b76f84d96c6` is stopped with storage retained; a private preclose dump and final snapshots are retained. PACT's working tree remains clean on master. Source changes remain uncommitted on Fleet master. The [repair plan](superpowers/plans/2026-10-24-native-rehearsal-repairs.md) and [prior failure investigation](native-rehearsal-failure-investigation-20261024.md) explain the candidate and baseline. No installed Fleet/PACT runtime or ordinary execution setting is changed.

Supplementary observer limitations: the pool sampler exits with a database-disconnection error when the owned container stops; the timed audit observer reaches its loop bound before cutoff. The primary rehearsal independently exports the complete final snapshots and correlated metrics, and a separately ownership-checked preclose dump is captured. Observer exit status is not counted as a model failure or a successful test.

Before another qualification run, remaining work is: scope simulation reference rewriting and validate native envelopes inside bounded feedback; add optional-memory and output-limit/last-call regressions; correlate and resolve the transport/cache-capacity causes in a fresh bounded fixture without clearing old unknowns; and define publication/drain accounting so final-round coverage is explicit. No additional model trial or 24-hour run is part of this report.
