# Native architecture grounding and full-stack simulation — 24 October 2026

This records the separately authorized native-architecture rehearsal. It does not reopen E4/KQ1, authorize a 24-hour run, or change the installed game gate. Work is inline, without GUI or delegation; actual inference is only Nemotron 4B BF16 on the isolated vLLM runtime.

## Source integration

The previous [720/720 synthetic workflow result](grounded-feedback-repeat-20261024.md) exercised a common read/propose/answer harness. It did not qualify all native engine envelopes, coordinator staging or accumulated specialist state.

The new environment-owned `DecisionGrounding` port prepares native generation schemas and evidence, validates proposals against explicit rules, and requests an authorized observation refresh. `EnvironmentRegistry` preserves the port. Scoped model admission settles each attempt separately; unknown usage is propagated as uncertainty rather than a correctable proposal. Refreshed observations return to reactive/continuity execution, autonomous specialists and coordinator workers. A coordinator cannot silently rebase selected old proposals onto a refreshed revision. The two legacy profiles use an optional adapter hook inside their original accounted outer loop, retaining their existing call ceiling. The historical controller digest is preserved with explicit, reversible amendment entries in its baseline test.

The simulation adapter connects all four repairs: host-bound observed facts; a legal ID set that retains legal inferior alternatives and `none`; trusted stale refresh; and exact-integer objective feedback. Raw rejected proposals are not turned into effects. Ordinary PACT adapters/settings are not activated by this opt-in interface.

## What “full-stack” covers here

Actual Fleet architecture definitions, task claims, model admission, durable provider capacity, scoped engine services, continuity/evidence storage, participant state/routing, command admission and receipt accounting run against fresh owned PostgreSQL 17 storage. A loopback HTTP simulation supplies observations and advisory command receipts. Each confirmed simulated command atomically records its receipt and a notification for the next synthetic kingdom. Fleet event intake routes these notifications; autonomous command-result events also trigger native participant work. A receipt-backed completion state stops the simulated request from feeding its own event loop.

Real PACT game handlers, worlds, ticks, mandates and resource transfers do not execute. The HTTP adapter advertises the PACT interface schema names required by the packing-repair manifest, but its environment identity is a separate `rehearsal` instance and it exposes no real game command handler.

There are 24 synthetic kingdoms: three for each of the eight **registered definitions** below. The three autonomous kingdoms use one resources/diplomacy preset and two full presets, giving ten persistent autonomous participants. This registry roster includes `specialist-coordinator@1`; it is not a claim that two autonomous presets are separate registered architectures.

| Registered definition | Kingdoms | Autonomous preset |
|---|---:|---|
| legacy-loop@1 | 3 | — |
| legacy-cognition@1 | 3 | — |
| reactive-basic@1 | 3 | — |
| reactive-cognition@1 | 3 | — |
| reactive-cognition@1.1 | 3 | — |
| reactive-cognition@2 | 3 | — |
| specialist-coordinator@1 | 3 | — |
| autonomous-specialists@1 | 3 | 1 resources-diplomacy; 2 full |

The offered workload is one review/event round per minute for thirty rounds, with simulated peer notifications, stale observations and a no-affordable-option case. Each turn retains the native three-call/one-action ceiling; each synthetic cohort has a finite 600-call/24-million-token budget. The run also has a global 3,000-call ceiling, eight worker slots, four durable inference slots and a 45-second provider timeout. Native task retries are included in the measurements; no failed historical allowance is reused.

## Offline verification

Before inference: **976 unit tests in 184 files**, **23 selected isolated integration tests in four files**, TypeScript, application build, architecture boundary checks and runtime-source formatting passed. At handoff, the baseline-test amendment list received formatting only; three focused tests passed again, all sixteen changed-code style checks passed, and the runtime source-pin comparison remained unchanged. Two existing literal-template warnings in the baseline test are retained. The native composition test covers all eight definitions, both autonomous presets, settled ledgers, stale observations, no-affordable choices, and finite receipt-triggered work. Scripted providers do not prove backend grammar compatibility.

A later read-only diagnosis recreated native schemas with **47 scripted decisions and zero additional real model calls** in a second fresh fixture. All 36 distinct schemas could be transformed by XGrammar itself. The installed vLLM XGrammar validator rejects nine of those schemas: three each for `reactive-cognition@1`, `reactive-cognition@1.1`, and coordinator selection. A complete offline check of vLLM’s actual **auto-backend** path then shows that coordinator selection succeeds through Guidance, whereas the six continuity-profile schemas fail with `Grammar error: Unimplemented keys: ["propertyNames"]`. This diagnosis uses the installed Nemotron tokenizer and no inference. The initial scripted capture and raw compiler check overlap the timed run briefly; the complete auto-backend check follows it. Both are recorded privately.

A [follow-up offline root-cause investigation](native-rehearsal-failure-investigation-20261024.md) refines the findings below with exact packet and decoder controls. Raw rehearsal outcomes are unchanged.

## Findings established during the run

1. **Backend schema compatibility.** Native optional continuity sections contain ASCII identifiers with both a character pattern and separate length bounds, for example `type:string`, `pattern:^[a-zA-Z0-9_.:-]+$`, `minLength:1`, `maxLength:64`. vLLM 0.32.0’s XGrammar validator rejects that combination because its backend may ignore the length bounds. The actual `auto` path then tries Guidance. In the two failing profiles, Guidance rejects `propertyNames` in the read-query schema. Both profiles fail before producing any model answer. Optional fields still participate in compilation. Coordinator selection has the same XGrammar restriction but **successfully falls back to Guidance**; its observed runtime blocker is the allowance/cancellation behavior below. Ordinary JSON Schema acceptance or raw XGrammar conversion alone does not test this complete backend-selection path. The HTTP layer discards the provider error body, so this exact offline reproduction is separate supporting evidence for the six observed HTTP 400 responses.
2. **Coordinator allowance and cancellation.** Two workers plus a selector can consume the entire three-call turn allowance. A rejected worker proposal can have no correction allowance left. The current sibling-failure path aborts other work; an already dispatched sibling can consequently retain unknown usage. No extra calls or clearance were invented to overcome this.
3. **Specialist evidence bookkeeping.** Follow-up replay shows all ten specialists had zero saved goals, memories and predictions. The first packet failure occurs when an inner 5,949-byte packet receives 63 bytes of host bookkeeping and exceeds the 6,000-byte cap by 12 bytes. Later, candidate IDs and superseded/omitted-observation metadata alone reach approximately 10KB. Required-first packing avoids the first failures but is insufficient for the final histories at 6KB. This is host packet construction, not excessive model-authored memory.
4. **Correction input headroom.** The seven missed v2 requests stop with `input_limit` after one model call, rather than running out of calls. Appended feedback plus a whole fresh grounding packet exceeds the 32,000-byte cap. Two autonomous turns hit the same failure, but other participants complete those requests in the same round.
5. **Known failure does not imply an answered request.** Native task recovery can schedule another turn for a known failure at the next review slot. Blocked unknown usage is not replayed. Consequently returned turns, model calls and confirmed request-rounds must be reported separately; growing waiting/ready work is a readiness failure even with idle inference capacity.

## Timed results

The full **1,800,000ms monotonic window** completed with all thirty planned rounds published, no skipped rounds, no source changes and zero active work at cutoff. It ran from `2026-10-24T13:31:52.540Z` to `14:03:43.945Z`: UTC timestamps span **31m51.405s**, while the process measured 30m00.122s including closeout. This clock discrepancy is recorded without an established cause; a longer run must not conflate these clocks.

**392/720 request-rounds (54.4%) received a valid confirmed simulated receipt; 328 remained unanswered.** This is not a successful all-24-kingdom soak. Failed kingdoms were still represented in the offered workload, but uncertainty blocked nine of them and evidence-packet failures increasingly prevented autonomous work.

| Architecture | Answered / planned request-rounds | Actual model invocations | Failed turn attempts |
|---|---:|---:|---:|
| legacy-loop@1 | 90/90 | 192 | 0 |
| legacy-cognition@1 | 90/90 | 197 | 0 |
| reactive-basic@1 | 90/90 | 102 | 0 |
| reactive-cognition@1 | 0/90 | 3 | 3 |
| reactive-cognition@1.1 | 0/90 | 3 | 3 |
| reactive-cognition@2 | 83/90 | 103 | 7 |
| specialist-coordinator@1 | 3/90 | 15 | 3 |
| autonomous-specialists@1 | 36/90 | 246 | 559 |

The 328 unanswered request-rounds comprise **180 across the two rejected continuity profiles, 87 coordinator, 54 autonomous-specialist and seven v2 requests**. Thus 267 are associated with the nine uncertainty-blocked kingdoms; their 258 later ready tasks are blocked by identity/uncertainty gates, not by exhausted GPU slots.

Returned turns are not the acceptance metric: there were **1,178 turn attempts**, of which 603 returned and 575 raised an engine failure. The failures cover 201 distinct tasks and include native scheduled retries. In particular, v2’s later retry/completion returns do not retroactively answer its seven missed request-rounds.

| Failed turn reason | Attempts | Meaning |
|---|---:|---|
| SPECIALIST_CONTEXT_INCOMPLETE | 557 | Required evidence could not fit; these attempts fail before model dispatch. |
| MODEL_FEEDBACK_EXHAUSTED | 11 | A known proposal could not be corrected within the admitted loop/allowance. |
| USAGE_UNKNOWN | 7 | The surfaced operation error; uncertainty also exists on two turns whose first surfaced error is feedback exhaustion. |

All **nine unknown model allocations** remain retained: six HTTP rejections without a usage result and three dispatched sibling calls aborted by the coordinator’s failure path. None were settled to invented zero usage or replayed. At the cutoff the task queue contained **258 ready, 180 waiting, 9 blocked and 603 completed tasks**, with no running tasks. The ready queue is largely work for the blocked identities; an idle provider does not make those requests eligible.

## Mandatory measurements and their scope

- **Invocation/accounting:** 861 provider invocations, 852 reported allocations and nine unknowns. Known usage is **6,586,141 input + 87,358 output = 6,673,499 tokens**; this excludes unresolved usage. The maximum actual per-turn call count is three. One known-usage truncated legacy-cognition response is retained in the raw records; it does not become an unknown allocation.
- **Corrections:** 450 scoped decision groups: 408 initially valid, 33 initially rejected and nine unassessable; 429 finally valid, including 21 recovered groups. Legacy grounding covers 180 turns: 152 initially valid and 28 recovered. These are decision-group/turn measurements, including receipt-completion decisions, not an alternative denominator for the 720 owner request-rounds. Native feedback records 33 stale errors and one objective error; legacy records 24 stale, three objective and one pending-request rejection. No repeated-failure stop was recorded in the scoped loops.
- **Effect/identity checks:** all 392 recorded simulated effects passed the authoritative choice validator; zero rejected effects, zero detected intent/request binding mismatches, zero checked host-fact mismatches. All 212 platform commands are confirmed, all 36 autonomous intents settled, and no command remains pending. The remaining 180 receipts belong to the original legacy receipt path.
- **Concurrency/resources:** four simultaneously active model calls were measured both by the host and server. Peak total GPU usage **13,378MiB**; minimum available WSL RAM **7.720GiB** across 182 resource samples. No GPU out-of-memory failure was observed. The brief offline diagnosis is included in these process-level resource observations.
- **Latency:** completed non-error model response p50 **3.684s**, p95 **7.521s**, maximum **9.981s**. The separately recorded known truncated response took about 34s. Durable inference-capacity queue delay p50 **3.103s**, p95 **6.948s**, maximum **9.917s**. These exclude time spent unclaimed behind an uncertainty block. They cannot be presented as end-to-end latency for all 720 requests.
- **Interactions:** 392 simulated peer-notification rows and 2,282 HTTP simulation requests. The native autonomous result-event path was exercised. This is structured advisory traffic, not free-form diplomacy, trade fulfillment, real PACT economy execution or proof every peer notification was read.
- **Not independently graded:** free-text factual/delivery claims, adversarial secret-canary leakage and a blinded false-rejection rate. The structural validators and scripted controls do not justify inventing zero values for these wider metrics. They remain unqualified for a broader acceptance claim.

## Retention and shutdown

Private evidence: `/home/mnim/.local/share/fleet-native-rehearsal-20261024-132926/`. This contains the source snapshot/pins, model pins, per-call/turn/round observations, resource and capacity samples, database snapshot, full preclose dump, complete matching 1,699-row metric audit, backend-diagnosis inputs/results and ownership records. Credentials and raw private traces are not in Git.

Result SHA-256: `9c62afa09af554e1dd531b4c23de388d3aaa5bc263c48c929df8d3fd2d7cf134`.
Source-pin manifest SHA-256: `55922589a4d70c41594c41d8edfb5dd81e18c743fcde0dd7d766904a12aee73e`.

The source compared unchanged at closeout. The owned model process was stopped after verifying PID/start identity, working directory and process group; its listener is closed. The HTTP simulation listener is closed. The owned PostgreSQL container is stopped with its volume and all nine unresolved allocations retained. No capacity leases remain. Ordinary services/settings and retained worlds were not reconfigured. Real game commands remain **zero**; E4/KQ1 remain blocked. No 24-hour run, deployment, installation change, Git commit or push followed this result. PACT source is unchanged; Fleet changes remain uncommitted on master.

## What remains before another qualification

1. **Backend-aware schema preparation and diagnostics.** Reproduce the complete native auto-backend path offline for every emitted envelope. Preserve the full authoritative validation contract while expressing bounded identifiers and query maps in equivalent supported forms; do not simply remove ID bounds or weaken reference checks. Preserve a bounded safe provider-rejection reason before dispatch accounting loses the explanation.
2. **Coordinator allowance and sibling settlement.** Plan worker/selector/correction stages inside the actual three-call ceiling, or separately review a concrete new ceiling. Avoid manufacturing unknown usage by canceling already dispatched siblings after an ordinary known proposal rejection. Do not rebase or execute a stale proposal.
3. **Correction headroom.** Admit the initial native request with room for its bounded feedback/fresh-evidence path, preserving task and authority. Keep byte limits and model-token limits explicit; do not silently discard mandatory context.
4. **Sustained specialist evidence and recovery scheduling.** Test accumulated protected originals and the explicit required-first/metadata-packing contracts against realistic history. Preserve required evidence; prove what fits rather than silently deleting it. Bound repeated preflight-failure scheduling so unanswered requests and queue growth are visible instead of cycling indefinitely.
5. **Close the measurement and clock gaps, then use a fresh bounded qualification.** Independently assess the wider claim/isolation/false-rejection metrics and reconcile monotonic versus wall-clock accounting. A fresh native-profile preflight must pass before another model rehearsal. A later successful all-24, 30-minute rehearsal is needed before proposing a 24-hour run.

The hardware demonstrated four-call concurrency at the measured mixed load. **The complete 24-kingdom system is not qualified for a 24-hour run.**
