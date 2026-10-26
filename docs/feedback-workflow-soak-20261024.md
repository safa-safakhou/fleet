# Bounded feedback and 24-session observation — 24 October 2026

Status: implemented; the complete 30-minute monotonic observation finished. Capacity and accounting checks passed for this synthetic workload. Behavioral qualification failed: only364/720workflows achieved the complete objective. The isolated provider is stopped; no installed cutover or game activation occurred.

## Scope

User authorized inline implementation plus 24 kingdoms for 30 minutes with Nemotron4B only, no GUI, game execution disabled, E4/KQ1 blocked. Accordingly the observation uses 24 isolated synthetic kingdom sessions, not retained worlds, real game workers or activated PACT execution. Eight scenario variants are not the eight production architectures. No service cutover, commit or push is requested.

## Implementation

`src/platform/decision-feedback.ts` validates each completed proposal against the response schema and a trusted caller's semantic rules. It sends the failed proposal and actionable feedback to a subsequent attempt without deleting prior task/evidence messages or changing model settings. At most three attempts per decision (two corrections); caller budget, input size, cancellation and repeated-failure checks can stop earlier. Unknown usage and thrown/uncertain execution are not automatically replayed. Authority refusal cannot become a corrective grant.

`ModelAdmission.decideWithFeedback` is an explicit production entry point. Each correction uses the existing independent reservation/settlement, route capacity, scope, budget, lease/deadline and review paths. Default historical retry behavior is unchanged. This adds a reusable capability; it does not automatically retrofit every existing architecture.

`src/platform/workflow-metrics.ts` records independently supplied outcomes with explicit denominators: first-pass correctness, task completion, recovery, factual correctness, objective quality, rejected proposals/valid proposals, invalid effects, repetition, scope isolation, calls, measured/unknown usage and workflow/call/queue latency. Null grades remain unmeasured rather than becoming a pass. Strategy is graded separately from legality.

## Observation design

Fresh runtime root: `/home/mnim/.local/share/fleet-feedback-20261024-1232/`. Its isolated vLLM0.32.0 venv/model links refer to the previously pinned and independently hashed NVIDIA Nemotron4B BF16 installation. Loopback18535, four inference sequences, 16k maximum context, GPU ceiling0.65, float32 Mamba state and eager execution; thinking=false, temperature0.6/topP0.95/seed42. Existing Ollama/settings/worlds remain unchanged.

`scripts/soak-feedback-kingdoms.ts` uses eight workflow workers and four FIFO inference slots, 24 stable synthetic bindings, one scheduled or event-labelled request per minute for 30 minutes. Each model must choose a read step, propose a recommendation, and answer the pending owner request with exact facts. Invalid calls receive feedback; legal suboptimal choices remain legal and are scored separately. Context includes historical/peer text, pending/unknown delivery states, changing resources, exact large integers and intentionally stale observations. No game command port exists. Some variants represent synthetic trigger inputs, not production event subscriptions.

Six model attempts maximum per workflow, including corrections, 60-second call / 90-second workflow deadline, 4,320 total-call ceiling. No overlapping workflow on one binding; overlapping triggers are counted as skipped. Transport uncertainty or isolation/effect failure stops new work. Behavioral failures remain recorded without mid-run changes or replay. Stop new dispatch at 30 minutes and drain owned work within its existing deadlines. Provider stops after completed observation.

Metrics distinguish task queue delay, provider queue delay, provider service latency and full workflow latency. Raw model responses, per-call dispatch/completion records, workflow/tool feedback, source pins, resource samples and server concurrency metrics remain private. First-pass correctness means the entire workflow succeeds without corrections; recovery is successful full task completion after rejection. Facts/objective denominators include only answered workflows; incomplete tasks remain failures in the completion denominator.

## Actual results

All **24 synthetic sessions** received all30scheduled triggers: **720 workflows**, zero skipped/unstarted tasks, no outstanding work at closure. **2,564 actual Nemotron4B calls** all completed with known usage, zero transport errors/timeouts/aborts/truncations/unknowns. Provider counters independently match the private per-call records: **1,317,995 input +163,996 output =1,481,991 measured tokens**. No game commands occurred. This is an offered-load observation, not a saturation benchmark.

| Mandatory measure | Actual result |
| --- | --- |
| Correct full workflow without correction |266/720 (**36.94%**) |
| Answered pending owner request |447/720 (**62.08%**) |
| Correct full objective after permitted correction |364/720 (**50.56%**) |
| Correct recovery after rejection feedback |98/393 affected workflows (**24.94%**) |
| Factual accuracy of recorded final answers |447/447;273incomplete workflows remain failures in the completion denominator |
| Answered with a legal but inferior choice |83/447answers |
| Invalid model steps rejected |921/2,564semantic checks:348reserve,212stale-observation,361fact mismatches |
| Detected false rejections |0;1,643steps independently classified as valid |
| Repeated unchanged failure stops |108workflows |
| Correction-attempt-limit stops |165workflows |
| Detected isolation violations / actual game effects |0/0; game command ports are absent by design |
| Provider execution latency |p50 **1.049s**,p95 **1.388s**,max **5.602s** |
| Provider admission queue |p50 **1.033s**,p95 **1.331s**,max **5.587s** |
| Task worker queue |p50 **6.402s**,p95 **17.663s**,max **24.646s** |
| Workflow execution after worker admission |p50 **6.847s**,p95 **9.957s**,max **14.496s** |
| End-to-end workflow including task queue |p50 **14.905s**,p95 **24.852s**,max **31.214s** |
| Native vLLM server metrics |peak4running, peak4waiting, zero preemptions; final running/waiting0 |
| GPU/RAM |peak total GPU **13,591MiB (13.27GiB)** including desktop; minimum available WSL RAM **8.320GiB**; peak GPU60°C |
| Resource/server observations |1,801samples each; zero metrics sampling failures |

First-pass and eventual correctness are descriptive counts from the same bounded run, not an independent no-feedback versus feedback experiment. Repeated rounds share scenario families and are not independent samples of all possible gameplay. No permanent learning or fine-tuning occurred. Each workflow gets a new pending request and history; there is no persistent cross-workflow strategic memory in this harness.

### Scenario outcomes

Each variant has90workflows (three sessions×30rounds). Variants represent synthetic input differences/replicas, not production architecture profiles.

| Variant | Input family | Answered | Correct objective | Recovered |
| --- | --- | ---: | ---: | ---: |
|0|Current resources, unknown delivery|90|68|17|
|1|Current resources, pending delivery|70|54|6|
|2|Unknown-delivery replica with different bindings|89|65|11|
|3|Pending delivery plus hostile peer text|39|29|0|
|4|Observation changes after first read|29|29|29|
|5|Hostile-peer replica with different bindings|40|29|0|
|6|No affordable offer|0|0|0|
|7|Exact integers beyond safe JavaScript Number range|90|90|35|

The no-affordable-offer case failed90/90: the model tried successive paid offers instead of selecting the documented `none` option, despite explicit spendable-zero feedback. Stale cases often changed the revision label without rereading;29/90did reread and finish correctly. Some completed workflows selected a legal inferior offer; these are objective failures, not false rejections. No wrong proposal was silently rewritten into a pass. No mid-run behavioral repair or failed-task replay occurred.

### Timing and evidence

The monotonic observation timer measured **1,800.038seconds**. Recorded UTC timestamps are2026-10-24T10:34:41.197Z through11:06:14.303Z (**1,893.106wall-clock seconds**). Wall and monotonic clocks diverged by approximately93seconds; the cause was not established. Dispatch limits, deadlines and reported latency use monotonic elapsed time. Both clock readings are retained rather than presenting them as identical.

Private root above retains protocol, untouched result/workflow/call records, both model and tool feedback, exact source snapshots/pins, launch/process identity, server logs/metrics and resource samples. Original result SHA256: `0490fbcda929541662dfd6c364088c1cc1c1037b6e67b97ac3d38b70f955d955`. All running-candidate source pins matched at closure before any post-run fixes. Provider PID/start time/cwd/process group were verified before stopping; parent exited, loopback18535closed, ordinary Ollama11434remained reachable with zero loaded models. No existing service configuration, owner, world, queue, allocation or game command changed.

## Final source verification

Final checks passed after the post-run fixes: **960unit tests /181files**, **50selected isolated integration tests /sixfiles**, TypeScript, production build, architecture boundaries, changed-code style, report links and git diff --check. Two existing baseline-test lint warnings and four style informational notices remain; there are no changed-code style errors. Self-review was inline without delegation. The fresh production dependency audit still reports **one moderate fast-uri finding**, no high/critical finding. Existing pinned-proposal repository-wide formatting failure remains preserved; changed-code style is checked separately. No dependency pins change.

Inline review added scoped architecture service access to the loop, preserving fixed model/binding and guard checks; its13integration cases pass. Existing architectures are not automatically migrated or activated. After observation, failing tests drove two observability repairs: retain settled usage/terminal metrics if the retry-eligibility check throws, and separate all first-pass failures from rejection-affected recovery eligibility while exposing queued end-to-end latency. These post-run branches/aggregation changes are offline-verified; no additional real inference was performed.

The untouched run result's original `recoveryEligible=454` counted every workflow without first-pass success. Actual rejection-affected eligibility is393, derived from preserved per-workflow rejection records. The final source exposes454as`firstPassFailures` and393as`recoveryEligible`; response grades and original evidence are unchanged.


## Acceptance boundary

This run can establish adapter/feedback-loop behavior, synthetic multi-step task outcomes and measured capacity at the offered load. It cannot establish all-eight-architecture acceptance, strategic negotiation quality, native PACT gameplay correctness or 24-hour capacity. Game execution remains disabled and E4/KQ1 blocked throughout.
