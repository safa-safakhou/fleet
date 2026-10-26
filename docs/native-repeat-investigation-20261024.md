# Why the repaired native rehearsal still missed requests

Investigation of the [683/720 native repeat](native-rehearsal-repeat-20261024.md), using retained evidence, source inspection and CPU-only decoder/contract controls. No new model call, game execution, retained database restart, uncertainty resolution or runtime setting change. Nemotron 4B remains the only local model used by the underlying run; E4/KQ1 remain blocked. Work is inline without GUI or delegation.

## Findings

| Finding | Evidence strength | Impact |
| --- | --- | --- |
| The decoder permits a repeated formatting loop | Confirmed in all five captured truncated responses and offline grammar controls | Wastes generation time/output budget; contributes to one failed correction sequence. Strong candidate for the long timed-out generations, whose partial text is unavailable. |
| Three calls generated substantial output before timing out | Confirmed aggregate counter reconciliation; individual token counts/content unavailable | Three unknown allocations block three kingdoms, causing 27 missed request-rounds. |
| The simulation helper changes memory-reference semantics | Exact retained-response contract control | One v2 request fails after semantic feedback has already accepted it. |
| Numerical feedback is delivered but not followed | Exact retained request/response sequence | One request selects the inferior option twice, then its last allowed call truncates. |
| Rehearsal publication and call cutoff conflict | Exact publication/cutoff records and source | Round 30 has only 20.170 seconds of admission time; eight additional requests remain unfinished. |
| Returned turns/completed tasks can hide unanswered requests | Persisted turn state and receipt audit | Progress counters understate failures; later completion of an old notification does not prove its original request was answered. |

## 1. Truncation was a formatting loop

All five known `MODEL_OUTPUT_TRUNCATED` responses have **3,673 characters**: 283 characters before the trailing padding, followed by **3,390 whitespace characters**, approximately 92.3% of the response. The padding repeats a seven-character newline/indentation pattern. The parser is outside a string, with three JSON objects still open, immediately after `cognition.analysis.reason`. No complete decision has been produced. These are unfinished envelopes, rather than completed JSON with harmless trailing spaces.

Each execution reaches its unchanged 1,536-token output cap. Three round-3 cases have identical retained-output hashes; the two round-6 cases match each other. The model is repeatedly choosing legal formatting tokens without progressing to the closing syntax or decision.

The launch leaves vLLM's `disable_any_whitespace` at its default `False`. All eight distinct normalized schemas associated with the selected failure cases select XGrammar in the installed automatic-backend validator. An offline control compiles each of the five truncated cases' exact normalized schemas and uses the same content prefix, compacted only outside strings:

| Decoder control | Content prefix accepted | Another 7,000 whitespace bytes accepted |
| --- | --- | --- |
| Default flexible JSON formatting | Yes, all five | Yes, all five |
| Compact JSON formatting | Yes, all five | No, all five |

This establishes the available loop and a way to prohibit that formatting continuation without removing field values. It does **not** establish that a model will complete every decision under compact decoding. The previous 348-schema checks established decoder compatibility, not generation progress or termination. The scripted provider never generates such padding.

The installed vLLM implementation has separate XGrammar/Guidance paths and restricts the global compact-format flag to explicit backends. The complete native roster uses both under automatic selection. A repair must preserve that compatibility and validate the actual serving configuration; copying one flag onto the current automatic configuration is not a verified migration. Sources: [model transport](../src/model.ts), [schema preparation](../src/model-schema.ts). The installed vLLM 0.32.0 `structured_outputs.py`, `backend_xgrammar.py` and `backend_guidance.py` provide the configuration/backend behavior inspected here.

## 2. What can be established about the three timeouts

The three calls time out at 45.004, 45.002 and 45.002 monotonic seconds. One is legacy-cognition round 18; two are legacy-loop round 24. Other requests continue completing during both intervals, and no provider crash or out-of-memory exception appears. These are not a complete provider outage.

There is stronger evidence than latency alone. At the final idle provider snapshot:

| Counter | Value |
| --- | ---: |
| vLLM total generated tokens | 156,384 |
| vLLM completed-request generation-token sum | 152,275 |
| Fleet reported output-token sum | 152,275 |
| **Generated tokens absent from completed-request usage** | **4,109** |
| Completed-request count / Fleet reported calls | 1,381 / 1,381 |
| Dispatched calls / calls with unknown usage | 1,384 / 3 |

The installed vLLM source increments the first counter from `output.new_token_ids` on each output iteration; the completed-request histogram is recorded when a request finishes. The histogram sum exactly matches Fleet's reported usage. The owned endpoint has no other inference traffic in the retained run, no active request at the final snapshot and four additional refused attempts that never dispatch.

The evidence therefore attributes substantial generation to the three calls that did not return completed usage. With the same 1,536-token cap on each, 4,109 tokens across three calls implies **at least 1,037 generated tokens per timed-out call**, under this isolated-run accounting. That bound is an inference from counters, not a measured per-call usage receipt. It rules out explaining all three calls as simply waiting for a connection with no generation.

The timed-out calls are much longer than the usual short legacy decision: the 1,536-token cap and four-way scheduling leave room for output to occupy the entire 45-second timeout. Given the five directly observed formatting loops, another formatting loop is the leading explanation for the excess output. **The partial text of the three timed-out calls was not retained, so its exact content and each call's queue/prefill/decode split remain unproven.** Captured full responses and requests exist under `Debug: Model response` and `Debug: Model request`; the missing item is the interrupted calls' partial response, not the entire debug stream.

The HTTP requests use `stream: false`; the adapter receives final content and usage only when the response completes. A timeout therefore loses the provider's partial output and final usage. Fleet correctly leaves each allocation unknown with its full 40,000-token reservation. Aggregate counters must not be used to invent a per-call final usage receipt or clear those allocations. The provider's zero completed `abort` counter does not prove that the calls never generated: its internal cancellation path removes request state separately from normal finished-request metric recording.

### Cache pressure is real, but is not a complete timeout explanation

The provider has only **40,603 cache tokens** and reports full-length 16,384-token concurrency of **2.48**, although four sequence slots are allowed. Inputs reach 11,043 tokens. Some combinations of four long contexts plus output exceed the available cache. The log reaches 100% cache utilization; four preemptions occur. Peak GPU usage is 15,890/16,303MiB.

This can slow inference and changes the operating margin. It cannot by itself identify the three interrupted requests' histories. In particular, the preemption counter is still four after the two later legacy-loop timeouts. Existing aggregate `deferred` metrics also do not identify a particular request's waiting reason. A fixed count of four slots is not a guarantee that four maximum contexts fit.

The repaired repeat executes more work than the previous failed run: 1,384 versus 861 dispatched calls, with previously blocked native families now active. Lower resource use in the older failed run did not qualify this expanded active workload. Sources: [rehearsal timeout/admission](../scripts/rehearse-native-architectures.ts), [HTTP adapter](../src/model.ts), [request transport](../src/http.ts), [uncertain-usage admission](../src/store.ts).

### Why three timeouts become 27 unanswered rounds

The first unknown allocation blocks one kingdom for rounds 18–30: 13 misses. The two later unknown allocations each block rounds 24–30: another 14 misses. The task/store guards prevent later model usage from bypassing unresolved usage. These are three direct failures and 24 subsequent blocked request-rounds, not 27 independently wrong model decisions. Removing those guards would conceal uncertainty rather than repair generation. Sources: [task recovery](../src/platform/tasks.ts), [store reservations and claim guards](../src/store.ts).

## 3. Memory references: a confirmed integration defect

The simulation grounding helper recursively replaces every property named `evidenceRefs` with an enum of environment-scoped references. Optional native memory also uses that property name, but requires stored original IDs with a 100-character bound. The actual v2 response contains a 196-character environment reference in `memory.memories[0].evidenceRefs[0]`.

An offline check of that exact retained response gives:

- The prepared schema sent to the provider accepts it.
- The original native envelope rejects it on `maxLength: 100`.
- Omitting only optional memory makes the same decision pass native envelope validation.

The model followed the incompatible prepared schema. Native decoding happens after the host semantic-feedback loop accepts the proposal. Envelope shape failures return a plain unsuccessful parse, rather than `RejectedDecision`, so this path throws `INVALID_MODEL_OUTPUT` without delivering a bounded native correction. Extending the existing feedback contract to cover the authoritative native envelope, and scoping reference rewriting by semantic role, address the two boundaries. Disabling native validation would admit the wrong reference type. The fake-provider test emitted no optional memory, which explains its missed coverage. Sources: [simulation schema rewriting](../scripts/lib/native-sim-environment.ts), [native memory contract/decoder](../src/modules/continuity/v2/decision.ts), [decision-step correction handling](../src/modules/decision-step/v1/engine.ts), [host feedback](../src/app/host-services.ts).

## 4. The failed numerical correction did receive the facts

For the missed legacy-cognition round-3 request, all three retained prompts contain the same current objective values: **oak 125, stone 90, none 0**. Calls one and two both choose stone. Call two receives explicit feedback identifying oak 125 as superior to stone 90; call three receives that advice again. Feedback has not been dropped or replaced with an incorrect score. The first call also carries stale-observation feedback retained from an earlier round; current scores nevertheless agree throughout.

Call three enters the confirmed formatting loop and exhausts the last allowed output. The three-call guard correctly refuses further inference. This request fails because the model ignores one valid correction and then fails to finish the last output, while validation prevents an inferior effect. It is not a stale-refresh or correction-input overflow recurrence.

The legacy loop retains only the most recent feedback in its rebuilt prompt and does not use the shared feedback loop's repeated-failure check. Its generic stale/objective/output feedback also survives until a later replacement; success cleanup specifically resolves two older action-error codes. That is a correction-policy consistency gap and potentially distracting context, but the retained record does not prove that it caused this numerical choice. A request-scoped correction regression should preserve exact task facts and show which rejected proposal the advice addresses. Sources: [numeric objective validator](../src/platform/grounded-decision.ts), [legacy feedback and loop](../src/engine.ts), [prompt feedback rendering](../src/feedback.ts).

## 5. Eight cutoff misses are caused by the rehearsal's publication policy

Round publication waits for **all running work across all kingdoms** to finish. After the deliberately stale round 18, round 19 is published 43.766 seconds behind its ideal minute boundary. Another delay follows stale round 26; round 27 is 53.056 seconds late. The test partially catches up, but round 30 is still published at 1,779,829.709ms rather than 1,740,000ms.

There are only **20.170 seconds** left when the last requests arrive. The same global deadline refuses provider calls needed to finish already-running staged decisions. At cutoff seven turns are active. Four subsequent call attempts are refused before dispatch, including coordinator selector work. Eight otherwise distinct requests remain unanswered: one legacy-cognition, one v2, all three coordinator and all three autonomous. There is no invalid effect or recreated coordinator allowance error here.

The load protocol combines independent kingdom queues with a global round barrier and a provider-call cutoff. It cannot then assume that every published last-round workflow received a full minute or enough staged-call time. Future acceptance must explicitly define publication timing, backpressure, per-request deadlines and bounded drain, with no silent extension of authorized model calls. Source: [round publication and cutoff](../scripts/rehearse-native-architectures.ts).

## 6. Reporting and task identity need separate acceptance checks

For all three uncertain legacy turns, `run.jsonl` says `RETURNED`, because the legacy engine handles the error internally and returns control. Their authoritative stored turns say **`needs_owner / TRANSPORT_UNCERTAIN`**, and their ledgers say unknown. The progress counter counts thrown harness errors, so it displayed one failure while three additional uncertain turns were accumulating. This affects operational visibility; it does not clear the reservations or invalidate the receipt-based final result.

The failed v2 round-1 notification and legacy round-3 task later reach task state `completed`. Their original request receipts remain absent. The simulation advances its current request each round; processing a later current view or completion wait can finish an older notification without answering its earlier request. A completed notification task is therefore not a durable per-request fulfillment record. Preserve request identity and distinguish answered, superseded, timed out, blocked and unfinished work before presenting workflow completion. Sources: [harness run classification](../scripts/lib/native-architecture-harness.ts), [task recovery](../src/platform/tasks.ts).

## What to repair before another model run

1. Apply a compatible compact/progress-bounded decoder contract and regress the captured whitespace prefixes. Preserve strings, facts and authoritative schema checks; verify both backend families offline before selecting a serving configuration.
2. Scope reference handling and put native envelope rejection inside bounded feedback. Exercise nonempty optional updates, rather than only minimal fake responses.
3. Align request identity, correction feedback and terminal reporting across legacy/native engines. Keep unknown reservations intact; report failure from authoritative state, not just thrown exceptions.
4. Separate the rehearsal's offered-load schedule from completion accounting, and make any permitted drain explicit. Add request-correlated queue/prefill/decode/partial-output evidence and verify token-aware cache admission before claiming four long-context requests are guaranteed to fit.

These are proposed cause repairs, not changes deployed or activated by this investigation. No further inference trial or 24-hour run was started.

## Verification and evidence

The five exact-schema decoder controls pass their expected positive/negative assertions: content accepted in both modes; repeated padding admitted only in flexible mode. The exact-response memory control passes the three expected contract assertions. Retained prompt/response and request-receipt audits establish the numeric/cutoff/blocking counts. These are CPU-only offline controls, not additional behavioral model acceptance.

Private scripts, selected decrypted evidence and derived results remain under `/home/mnim/.local/share/fleet-native-rehearsal-20261024-151624/investigation/`; they are excluded from Git. The source candidate, result, old nine unknown allocations and three new unknown allocations remain unchanged. No retained fixture was restarted. A current short clock check agrees between wall time and Node monotonic time; it does not explain the historical 111-second wall/monotonic difference, which remains unresolved.
