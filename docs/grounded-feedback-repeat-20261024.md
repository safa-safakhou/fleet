# Four feedback repairs and matched observation repeat

Status: all four repairs are implemented and separately checked. The combined 24-session, 30-minute observation completed with **720/720 correct workflows**, compared with **364/720** before. The owned provider is stopped; no installed cutover or game activation occurred.

The user authorized inline implementation, one-fix-at-a-time checks and a fresh repeat using only Nemotron 4B, with no GUI, game execution disabled and E4/KQ1 blocked. Existing worlds, services, identities, unknown allocations and previous evidence are preserved. Source remains uncommitted on master; no installed cutover or game activation is requested.

## What changed

1. **Host-bound facts.** The model proposes observation references and a choice, without reproducing gold, spendable balance or delivery status. The host resolves those facts from the scoped observed snapshot. Independent binding/revision checks reject foreign or stale references, and model-authored bound fields are refused rather than silently repaired. History remains in the input; it is not deleted.
2. **Legal choices.** The observation advertises legal choices and the no-deal fallback. The generation schema restricts offer references to those legal for the observed snapshot, including `none`. Inferior-but-legal choices remain available; the schema does not restrict generation to the optimum. Native/current-state legality is still checked after generation.
3. **Authorized stale refresh.** A stale-observation rejection can invoke a trusted read callback before the next proposal. It appends fresh evidence and updates the response schema within the same correction/call/input bounds. No command is executed or replayed. Model settings, cancellation signal, output cap and original task context must be preserved.
4. **Objective feedback.** An explicit integer maximization objective is validated against legal observed scores using exact BigInt comparisons. Inferior proposals receive actionable `OBJECTIVE_NOT_MET` feedback. Ties remain valid, no response is rewritten into a winner, and no arbitrary subjective strategy preference is treated as a hard rule.

Generic implementation is in `src/platform/grounded-decision.ts` and the bounded correction loop. The scoped engine port exposes the utilities and refresh callback. The synthetic adapter in `scripts/lib/grounded-kingdom-policy.ts` owns the toy-game calculations. This does not import PACT rules into reusable platform code or activate existing architectures.

## Separate verification

Offline tests enable one repair at a time, with the other three disabled, and cover extra/foreign/stale fact references, exact numbers, legal inferior choices, no-deal fallback, fresh observation reads, objective feedback/ties, context/authority bounds and independent accounting. Combined scripted workflows verify no-deal completion and stale recovery without an extra model read. All 340 generated initial/observed/refreshed schemas compiled using installed XGrammar.

Fresh actual Nemotron qualification: eight workflows per repair, 32 total, at most six calls per workflow within a 192-call/10-minute ceiling. Actual usage was **117 calls**, 28 answered and 26 fully correct. No failed workflow was replayed. The other repairs remained disabled in each row:

| Enabled repair | Answered | Fully correct | Calls | Observed remaining issue |
| --- | ---: | ---: | ---: | --- |
| Facts only | 7/8 | 5/8 | 26 | No fact-copy rejections; reserve and objective failures remain |
| Legal choices only | 6/8 | 6/8 | 26 | No reserve rejections; two workflows still fail on copied facts |
| Stale refresh only | 8/8 | 8/8 | 40 | All eight recover after host reads; original reserve feedback also needed |
| Objective feedback only | 7/8 | 7/8 | 25 | One workflow stops on invalid offer references; objective feedback corrects one other workflow |

These are small targeted samples, not controlled estimates of each repair's general accuracy. They demonstrate separate mechanisms and remaining interactions. The combined repeat uses the same outcome oracle and workload as the original observation.

## Repeat protocol and evidence

Previous baseline: `/home/mnim/.local/share/fleet-feedback-20261024-1232/`; original result and workflow records remain untouched. New private root: `/home/mnim/.local/share/fleet-grounded-20261024-1400/`. Individual-check evidence is under `singles/`; the combined run has its own one-shot marker, protocol, source pins, model/tool records and metrics. Starting provider counters were captured before the combined run so the 117 individual-check calls are not counted as soak calls.

The pinned NVIDIA Nemotron 4B BF16 weights, tokenizer, parser, vLLM 0.32.0 runtime, four sequences, 16k context, GPU ceiling 0.65, eager mode and float32 Mamba state are unchanged. Sampling remains thinking=false, temperature=0.6, top_p=0.95, seed=42. The separate checks warm the provider before the combined run, so initial latency is not a controlled cold-start comparison.

Same 24 bindings, eight synthetic variants, 30 rounds, one trigger/minute, eight workflow workers, four inference slots, six calls/workflow, two corrections/decision, 90-second workflow and 60-second call deadlines, 4,320-call ceiling. The original `grade()` oracle, scenario balances/offers, owner requests, historical and hostile peer text remain unchanged. No production event subscription or game command port is used. No behavioral changes or task replays are permitted during observation.

The factual output contract intentionally changes: correct balances are now host-supplied rather than model-copied. Any decrease in fact-copy errors is therefore an application guarantee, not proof of better raw model arithmetic or factual reasoning. Legal and objective checks likewise contribute to the system's measured correctness.

## Before and after

All 720 original task IDs were matched: **356 previous failures now pass, all 364 previous successes remain successful, and no regressions were observed**. Executable comparisons verified unchanged workload limits, model/sampling configuration and the exact original fixture/oracle source hash.

| Measure | Before | After |
| --- | ---: | ---: |
| Answered owner request | 447/720 (62.08%) | **720/720 (100%)** |
| Fully correct objective | 364/720 (50.56%) | **720/720 (100%)** |
| Correct without correction | 266/720 (36.94%) | **484/720 (67.22%)** |
| Correct recovery after rejection | 98/393 (24.94%) | **236/236 (100%)** |
| Unanswered / inferior completed answer | 273 / 83 | **0 / 0** |
| Wrong-balance / reserve rejection events | 361 / 348 | **0 / 0** |
| Stale rejection events / authorized host refreshes | 212 / 0 | **90 / 90** |
| Explicit objective rejection events | Not returned to model | **146, all corrected** |
| Repeated-failure / correction-limit stops | 108 / 165 | **0 / 0** |
| Model calls in the observation | 2,564 | **2,396** |
| Measured input tokens | 1,317,995 | **1,521,240** |
| Measured output tokens | 163,996 | **103,950** |
| Total measured tokens | 1,481,991 | **1,625,190** |
| Provider execution p95 | 1.388 seconds | **0.996 seconds** |
| Provider queue p95 | 1.331 seconds | **0.970 seconds** |
| Workflow worker queue p95 | 17.663 seconds | **11.388 seconds** |
| Workflow execution p95 after worker admission | 9.957 seconds | **6.540 seconds** |
| End-to-end workflow p95 including worker queue | 24.852 seconds | **16.681 seconds** |
| Peak total GPU memory, including desktop | 13,591 MiB | **13,228 MiB (12.92 GiB)** |
| Minimum available WSL RAM | 8.320 GiB | **8.372 GiB** |
| Skipped / unstarted workflows | 0 / 0 | **0 / 0** |
| Unknown model usage / detected canary leaks | 0 / 0 | **0 / 0** |
| Detected false rejections under the active policy | 0 | **0** |
| Actual game commands | 0 | **0** |

Correct task outcomes improved by **49.44 percentage points**. Calls decreased **6.55%**, but total tokens increased **9.66%**, reflecting larger corrective/context instructions despite shorter outputs. End-to-end p95 was **32.88% lower** in this observation; warmed startup and uncontrolled host activity prevent attributing the whole timing difference to the repairs.

Recovery populations differ because the new contract prevents balance-copying/illegal-choice errors and newly reports explicit objective violations. Ratios above describe each active policy, not an unchanged population experiment. The new false-rejection checker includes the explicit numeric goal, so correctly refusing an inferior legal action is not classified as a false rejection. Facts are host-resolved; the factual result is not a claim of 100% raw-model reasoning accuracy.

### Scenario results

| Synthetic scenario | Before fully correct | After fully correct |
| --- | ---: | ---: |
| Ordinary resources, unknown delivery (two replicas) | 133/180 | **180/180** |
| Ordinary resources, pending delivery | 54/90 | **90/90** |
| Pending delivery with hostile peer text (two replicas) | 58/180 | **180/180** |
| Observation changes after first read | 29/90 | **90/90** |
| No affordable offer | 0/90 | **90/90** |
| Very large integer balances | 90/90 | **90/90** |

Each of the eight original variants completed all 90 workflows correctly. All 90 stale cases needed one host refresh. The 146 explicit objective violations each received feedback and subsequently selected a correct legal alternative. The total 236 feedback-affected workflows each recovered within one correction; no task needed a second correction. All 720 completed within the unchanged six-call/90-second task bounds.

### Accounting, duration and closure

Native provider counters reconcile exactly with private run records after subtracting the 117 separate-test calls: **2,396 successful stop completions**, **1,521,240 input** and **103,950 output tokens**. There were no length, abort, error or repetition completions, no preemptions and no unknown usage. Resource and server metrics each have 1,801 samples; zero sampling failures. Native metrics observed four running and up to four waiting requests; client admission remained four slots. Final running/waiting requests were zero.

Including separate tests, this assignment used **2,513 actual Nemotron calls**, **1,591,439 input + 110,804 output = 1,702,243 measured tokens**. This combined total is not the before/after soak-call denominator.

The timer measured **1,800.039 monotonic seconds**. Recorded UTC timestamps span 2026-10-24T12:04:01.034Z to 12:36:04.778Z (**1,923.744 wall-clock seconds**). Wall and monotonic readings diverged by approximately 123.7 seconds; the cause was not established. Both are retained. Scheduling, deadlines and latency use monotonic elapsed time, as in the original run.

All running-candidate source pins matched at closure. Result SHA256: `789cb3b86f5cc597b703aa0a792fdb75733ab55b3335513dc290e06d6650c581`. The private root retains original protocol, source snapshots/pins, raw outputs, host-resolved facts, feedback, refreshes, per-call accounting, initial/final provider counters, resource/server samples and `comparison.json`. Old evidence was not modified.

Before shutdown, the exact provider PID, start ticks, cwd and process-group ownership were verified. The owned provider exited, loopback 18535 closed, and ordinary Ollama 11434 remained reachable with zero loaded models. No installed Fleet worker or real game execution was activated.


## Verification and limits

Pre-inference checks passed 972 unit tests / 183 files, 51 selected isolated integration tests / six files, TypeScript, build and architecture boundaries. The current production dependency finding and pinned-proposal repository-wide formatting issue remain separate; dependency pins are unchanged. Post-run inline review reproduced and fixed an in-place mutation weakness in the trusted refresh guard: callbacks now receive defensive copies, and comparisons use a saved authority snapshot and expected message prefix. Two RED-to-GREEN regression tests verify model/context mutations are refused without changing caller state. The actual refresh callback used in the observation returned fresh objects and did not exercise that mutation path. Its guard hardening is offline-verified; no additional real inference was performed. The private `post-run-hardening.patch` preserves the source difference. A local snapshot alias and test null-check cleanup are behavior-preserving.

Final verification passed **974 unit tests /183 files**, **51 selected isolated integration tests /six files**, TypeScript, production build, architecture boundaries, changed-code style, local report links and git diff --check. The two existing baseline-test lint warnings and four style informational notices remain; changed-code style has no errors. The fresh production dependency audit retains one moderate fast-uri finding and no high/critical findings. Dependency pins remain unchanged. Review was inline without delegation. Real inference exercised the production HTTP adapter, correction loop and synthetic read/propose/answer environment. Durable production reservation/scope paths were checked through isolated fake-provider integration tests; the soak itself uses private per-call records and independent native provider counters, not a live Fleet database.

This work qualifies only the tested synthetic workflow contract at its offered load. It does not establish all-eight-architecture acceptance, native PACT gameplay behavior, negotiation strategy or 24-hour capacity. Game execution remains disabled and E4/KQ1 blocked.
