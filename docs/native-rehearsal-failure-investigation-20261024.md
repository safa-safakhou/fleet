# Why the native rehearsal failed — 24 October 2026

The rehearsal completed, but the integrated system failed qualification. Its **392/720 answered requests is a workflow completion rate, not a Nemotron accuracy score**. Most recorded failures happened in host preparation, decoder validation or correction admission. No additional inference or game execution was used for this investigation. Runtime source is unchanged; retained storage and unresolved allocations were not resumed, reset or reviewed.

## Reconciled outcome

The eight registered definitions each had three synthetic kingdoms and thirty request rounds: 90 planned request-rounds per definition, 720 total. The [original rehearsal report](native-architecture-rehearsal-20261024.md) contains the roster, raw result digest and resource measurements.

| Architecture | Answered / 90 | Why requests were missed |
|---|---:|---|
| legacy-loop@1 | 90 | All request rounds completed. |
| legacy-cognition@1 | 90 | All completed, including recovery within the original call ceiling. |
| reactive-basic@1 | 90 | All completed. |
| reactive-cognition@1 | 0 | Native output schema rejected before an answer; three kingdoms subsequently blocked on unresolved usage. |
| reactive-cognition@1.1 | 0 | Same initial decoder rejection, plus a second shared-schema incompatibility revealed offline. |
| reactive-cognition@2 | 83 | Seven stale corrections exceeded the input byte limit after the first answer. |
| specialist-coordinator@1 | 3 | First round passed; second-round stale recovery had no admitted correction slot and aborted a dispatched sibling. |
| autonomous-specialists@1 | 36 | Host evidence-packet failures explain all 54 missed rounds. Two additional correction-input failures were recovered by other participants during the same round. |

The four causes account for every failed turn attempt:

| Cause | Failed turn attempts | Missed request-rounds |
|---|---:|---:|
| Decoder/schema rejection | 6 | 180 |
| Coordinator staging/cancellation | 3 | 87 |
| Correction input limit | 9 | 7 |
| Specialist packet construction | 557 | 54 |
| **Total** | **575** | **328** |

There were 1,178 turn attempts and 201 distinct tasks with at least one failed attempt. Native scheduled retries account for repeated attempts; these are not 575 independent model mistakes. All 557 packet failures had **zero model calls in their turn**. The seven v2 failures and two autonomous input-limit failures each had only **one** call before correction admission stopped them.

## 1. Output formats fail in the decoder before Nemotron answers

The native continuity schemas contain bounded ASCII identifiers: a character pattern plus separate minimum/maximum lengths. vLLM's XGrammar preflight rejects this combination because its grammar conversion can ignore the length constraint. With the installed `auto` setting, vLLM then tries Guidance.

For both failing profiles, Guidance encounters a query-map `propertyNames` keyword and rejects it with:

> Grammar error: Unimplemented keys: ["propertyNames"]

All six native requests return HTTP 400 without a measured usage result. The Fleet HTTP adapter reduces their explanation to `REMOTE_REJECTED`; since dispatch has already been marked and no usage result is available, the allocation remains unknown and the kingdom is blocked. Consequently, the later 174 requests for those six kingdoms remain queued after their six first requests fail: **180 misses**.

Fresh offline controls used the installed Nemotron tokenizer and actual vLLM auto-selection function, without sampling or a running model server:

- All 36 retained distinct schemas were checked; exactly the six continuity schemas fail the full auto-backend check. The coordinator selection schemas pass via Guidance, matching their successful first round.
- Removing only the redundant `propertyNames:{type:"string"}` keyword from a copied v1 schema produces three Guidance passes. This does not remove an ID constraint: JSON object property names already are strings.
- The same single-variable change in v1.1 reveals a second error: its shared `oneOf` representation cannot be processed by the fallback.
- Inlining bare local references and removing the now-unneeded definitions, while retaining `oneOf` and all other constraints, produces three v1.1 Guidance passes. No `coerce_one_of` approximation or weaker ID bounds were used.

These are counterfactual compatibility checks, **not deployed fixes or model qualification**. The six original HTTP bodies were not retained by the adapter; the exact error chain is reproduced from corresponding native schemas in the installed backend. Source: [HTTP rejection handling](../src/http.ts), [native continuity generation](../src/modules/continuity/v1/decision.ts), [shared schemas](../src/modules/generation-schema/v1.ts).

## 2. The coordinator spends its correction allowance before knowing whether it needs it

Each coordinator has three calls per turn. Its planner admits two focused workers and reserves the final selector call. That is already three calls.

The first round passes for all three kingdoms: two workers plus one selector, all usage reported, three valid simulated effects. In round 2 the fixture intentionally supplies a stale view to test correction. A worker's stale proposal triggers feedback, but its stage reserves the other worker and selector calls. There is no admitted correction slot left. The measured loop stop reason is `budget_limit`.

The worker throws; the coordinator aborts its shared sibling signal. The second worker is already dispatched. Each failed turn therefore has **one reported allocation and one unknown allocation**, two calls total and no effect. One operation surfaces the sibling's `USAGE_UNKNOWN`; two surface `MODEL_FEEDBACK_EXHAUSTED`. These different surface errors describe the same staging/cancellation failure.

All three kingdoms become blocked. Their first three requests passed; the next 29 rounds do not: **87 misses**. Extra global inference slots cannot supply a call which the per-turn admission policy has reserved for another stage. Sources: [worker staging and sibling abort](../src/engines/specialists/coordinator.ts), [stage allowance](../src/platform/admission.ts).

## 3. Stale refresh works only while the next request still fits

This is a separate root cause hidden by `MODEL_FEEDBACK_EXHAUSTED`.

All seven missed v2 requests occur in deliberately stale rounds 10, 18 and 26. Their native feedback trace says **`input_limit`, one attempt, STALE_OBSERVATION**. They did not use up their three calls. They used up the 32,000-byte request allowance before a second call could be sent.

The controller preserves prior task/context messages, appends the rejected proposal and feedback, and appends another whole native-grounding packet with the fresh observation. Initial packing did not reserve enough room for that packet. The new native packet also carries the selection data inside the observation and separately as selection metadata.

A representative retained case has a measured initial request size of 28,981 bytes. Reconstructing the append-only messages yields 29,668 after the error feedback and about 36,990 after the fresh grounding packet, exceeding 32,000. The raw original request body is not retained, so this total is a reconstruction using measured initial bytes, retained observation/proposal and the same-width next revision; the authoritative trace independently confirms the `input_limit` stop. All nine retained input-limit cases reproduce the same overflow. One reconstructed case exceeds the limit by only 10 bytes.

The model used the revision it was given. Staleness was an intentional fixture condition; the failure was inability to deliver the fresh correction. Two autonomous turns hit the same problem in round 10, but other participants answered those requests later that round. They add failed turns, **not two more missed request-rounds**. Sources: [append-only feedback admission](../src/platform/decision-feedback.ts), [native refresh](../src/platform/native-grounding.ts), [simulation grounding packet](../scripts/lib/native-sim-environment.ts).

## 4. Specialist “memory full” means host bookkeeping overflow here

All ten autonomous specialists have **zero saved goals, memories and predictions** in the retained state. This failure is not caused by the model accumulating excessive authored memory.

The host captures observations, shares the binding's evidence pool with its specialists, and retains source IDs plus explicit omission/supersession records. Two defects appear:

1. **Wrapper overhead is charged too late.** Replaying the exact first failing kingdom state in round 7 with 27 original observations: the inner evidence selector returns 5,949 bytes, inside 6,000. The wrapper adds 63 bytes of retrieval bookkeeping, producing 6,012. Its final check fails by 12 bytes. With no optional authored memories to remove, it immediately throws `SPECIALIST_CONTEXT_INCOMPLETE` instead of retrying a smaller evidence selection.
2. **The metadata itself eventually exceeds the budget.** Final pools contain 84, 86 and 86 originals. Most old observations are already superseded, but their IDs and omission records remain in the packet. Metadata alone occupies approximately 10,137–10,375 bytes before source bodies, against a 6,000-byte default. Clearing model-authored memories cannot solve this.

The controls change one setting at a time on retained data:

- Default 6,000 bytes reproduces the failures with no goals, no memories and no required evidence IDs.
- `required-first.v1` metadata packing avoids the first failing states, including the wrapper-overhead case, but **still fails at 6,000 bytes for all three final histories**.
- A 12,000-byte budget passes all three final-state controls, delivering one whole original. This proves the byte constraint matters; it does not establish that doubling the budget is sufficient for longer histories or complete model input.

The rehearsal used native presets with 6,000 bytes and did not select the existing required-first packing contract. The configuration gap contributes to early failures, while the final controls show that enabling that flag alone is insufficient.

The resources/diplomacy kingdom encounters its first transient failure in round 7; it still gets answers from other attempts and later rounds. The full-preset kingdoms first fail in round 13 and miss all rounds 13–30. All three end with 12/30 answered requests: **54 misses total**. Source: [specialist packet wrapper](../src/engines/autonomous-specialists/memory.ts), [candidate/omission bookkeeping](../src/modules/evidence/negotiation/v1.ts), [original retrieval](../src/app/participant-context.ts).

## 5. Recovery scheduling amplifies permanent preparation failures

Task recovery treats many known nonterminal errors as work to retry at the next review slot. New event rounds keep arriving too. A packet that cannot fit is then prepared again without any changed policy that would make it fit. Compute-call limits do not stop these pre-dispatch attempts because they consume no model call.

This amplifies a small number of bugs into 557 packet failures and a large queue. At cutoff: **258 ready, 180 waiting, 9 blocked and 603 completed tasks**. The 258 ready tasks are later requests for uncertainty-blocked identities; more available GPU slots cannot make them eligible. The failed known tasks remain preserved rather than being silently marked answered. Source: [task recovery](../src/platform/tasks.ts).

## What the earlier tests established—and missed

The prior 720/720 result belongs to the small synthetic read/propose/answer harness. It did not send these native continuity schemas or accumulate this native specialist history.

The native scripted composition test runs rounds 1, 2 and 8 against fake providers. It checks engine wiring, guards, receipts and accounting, but fake providers do not validate vLLM's grammar implementation. Three short rounds do not reproduce the accumulated histories or later correction-packet sizes. The test explicitly excludes the coordinator from the stale-case success assertion; that verifies containment, not coordinator recovery. A passing test count was therefore not all-architecture behavioral acceptance.

The longer rehearsal was necessary to reveal these gaps. It does not invalidate the narrow accepted result, but that result cannot be generalized to this full native workload.

## Model behavior, hardware and next work

The recorded validation events include four inferior numeric choices, one pending-request wait and one known-usage truncated response. These were caught; all 392 confirmed simulated effects pass their authoritative choice and scope checks. These observations do not qualify ungraded free-text claims or adversarial leakage. In particular, a 54.4% workflow completion rate must not be called 54.4% model accuracy.

Four active Nemotron 4B requests were observed; peak GPU 13,378 MiB and minimum available WSL RAM 7.720 GiB, with no out-of-memory failure. Those measurements do not prove healthy sustained execution of all 24 kingdoms, because nine became blocked and autonomous work increasingly failed before inference. The recorded monotonic/UTC discrepancy remains unresolved and is not established as a cause of these four failures.

The concrete repair targets are now established: equivalent backend-compatible schema preparation; correction headroom in native packing; stage-aware coordinator correction allowance with safe sibling settlement; packet-wrapper/metadata budgeting and bounded recovery for unchanged preflight errors. Each needs regression coverage before a fresh bounded model qualification. No new model trial or 24-hour run is part of this investigation.

Private investigation artifacts are added under the retained rehearsal directory `/home/mnim/.local/share/fleet-native-rehearsal-20261024-132926/`, including fresh backend controls, reconstructed correction sizes, exact first-failure and final-history packet controls, and the read-only decrypted audit used for joins. They are not added to Git. The original source pins, results, unknown allocations and stopped storage remain preserved. No runtime fix, service restart, game execution, Git commit or push occurred. E4/KQ1 remain blocked.
