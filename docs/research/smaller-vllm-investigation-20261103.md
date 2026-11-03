# Smaller-run failure investigation — 3 November 2026

The failed November2 experiment exposed a serving/admission compatibility problem, conservative cancellation/accounting behavior, an early-rejection capture gap, and an experiment-reporting error. The world remains paused. This investigation used retained evidence and isolated offline diagnostics only; no game/provider was started, no real inference was made, and no settings, old tasks or usage measurements changed. [Measured evidence](smaller-vllm-investigation-20261103.json). [Corrected original result](smaller-vllm-experiment-20261102.md).

## Corrected gameplay result

The earlier **zero-gameplay-command claim was wrong**. The custom experiment controller queried only `platform_commands`, which newer native paths populate. Legacy execution records its settled commands in `command_resolutions`. Both are native execution paths; the existing coverage service already unions these sources, while the custom controller/report did not.

A read-only cross-check found one legacy `COMMITTED` receipt for `legacy-loop-1-2`, command`91a271fc-0bff-4591-a7b3-6a220088a3c3`, action`game.supply.offer`. The exact command ID also has an authoritative PACT `COMMITTED` receipt at20:58:10.454UTC. PACT has one open supply offer and zero signed contracts. Thus the corrected outcome is **one committed supply offer, zero signed contracts**, with no pending native legacy command. The other legacy agent did not commit a command. No receipt or world state was changed to obtain this result.

This undercount was in the private experiment census and its published summary, not evidence of a lost authoritative receipt. The four previously verified whole-database snapshots include both receipt tables and the offer. The historical operator/result artifacts remain untouched; the public result is explicitly corrected. A future multi-architecture census must union/deduplicate all native command stores and reconcile exact PACT effects.

## Why the request timeouts occurred

The controller started at two requests. Both initial reactive-family turns were single-call waits and completed in36.018seconds. Its ramp used the slowest settled turn, multiplied by the next/current capacity ratio:36.018×4/2=72.036seconds, which passed its75second forecast threshold. Memory and cache checks also passed. It therefore admitted four bindings at about36.3seconds into the game.

That calibration did not cover the different output contracts and multi-stage work of the next profiles. In particular, both specialist-coordinator calls failed in their **first worker stage**, before any coordinator selection. Their worker outputs had already reached about1,200characters and were still incomplete proposals; the earlier reactive waits were much shorter completed answers. An adequate cache topology and two successful waits did not establish that the mixed workload would meet its time bounds. That was a launch-qualification gap.

The native90second request clock starts before the HTTP request reaches the provider. It includes provider-side queueing, prompt processing, scheduling, structured generation and delivery; it is not90seconds of uninterrupted decoding after the first answer token. The coordinator streams produced first content after42.8/43.6seconds, leaving about46–47seconds to finish. They then shared approximately30.3seconds of later inter-packet gaps. Both reached90seconds without a finish or usage packet.

The retained streams show6–9second pauses affecting several in-flight requests at nearly identical timestamps, aligned with new prompt arrivals. For example, both coordinator streams paused from100.70 to108.72seconds and again to117.46seconds after game start. A new reactive-basic request had been sent at100.64seconds. Provider-native ten-second windows also show prompt throughput alongside very low generation throughput (for example928prompt tokens/s versus0.2generation tokens/s). The observed pattern strongly supports shared prompt-processing/scheduling interference with ongoing decoding.

The pinned Metal runner concatenates existing decode tokens and new prefill tokens into a unified forward pass, with a configured4,096-token batch budget. Existing decoding consequently shares the duration of those prompt-processing steps. Structured-output sampling also forces completion of MLX logits and applies a CPU token-mask bridge; the native decode pipeline explicitly excludes structured-output steps. These code paths explain why memory-fit does not mean independent per-request progress. Their individual runtime costs were not separately profiled, so this is not a measured allocation of all latency to one kernel or to grammar operations.

There was no observed cache exhaustion or request preemption: peak native cache utilization in the retained windows was14.2%, preemptions0, minimum sampled memory availability46%, database-pool waiters0. Four simultaneous provider requests really were observed. These measurements support a latency/scheduling investigation, rather than a claim that the server could accept only one request or had run out of RAM.

## Why legacy follow-up calls were refused

Every newly admitted non-thinking call must retain its full90second model bound plus1second accounting margin inside a120second turn. Therefore the latest safe next-call admission is:

`120 seconds − 90 seconds − 1 second = 29 seconds after turn start`.

The legacy turns reached follow-up preparation after approximately40.2 and62.4seconds. Both were therefore correctly refused before another provider request. One had already committed its supply offer; the other had not. Their completed owners were marked `completed`, but the experiment operator separately quarantined their bindings because `MODEL_ADMISSION_DEFERRED` was outside its success-code allowlist. That was a conservative experiment policy, not evidence of an unknown command or a native game refusal of the committed offer.

The per-turn allowance of three calls is a count/token ceiling, not a promise that three sequential calls fit the wall-clock window. The coordinator admission trace selected one worker and logically reserved a later coordinator call, with a correction slot also reserved. A worker taking over29seconds cannot be followed by another90second-bound call in the same turn. Lowering concurrency alone is not yet proven to make the full multi-stage workflows feasible under these unchanged limits.

## Why three usage allocations became unknown and the whole game stopped

The actual wire requests explicitly used temperature0, top-p1, thinking=false, output cap1,024, streaming and `include_usage=true`. Each of the five reported streams has a finish packet and one usage packet. Each of the three unknown streams has neither. The coordinator progress had no separate reasoning text, no runaway whitespace, and no evidence of a repeating-output loop; it was an unfinished structured proposal.

vLLM's pinned streaming handler emits the final usage chunk after generation finishes. Fleet's timeout aborts the HTTP stream. The provider's async generator aborts the request on client cancellation. Those retained streams contain no final usage, and this integration has no separate server-side recovery channel for a cancelled request. Partial content and shared Prometheus totals cannot establish exact terminal cost for an individual request. Native accounting therefore retains the entire40,000-token reservation and null measurements for each unknown, as required.

The first two primary failures were coordinator `MODEL_DEADLINE_EXCEEDED` after about90.1seconds. The experiment controller sees unknown usage and deliberately stops the entire experiment, pauses the world and calls native host stop/drain. That stop aborts an in-progress reactive-basic call after about28.4seconds, creating the third, collateral unknown. A newly claimed legacy-cognition turn is fenced with zero model calls. This was the configured fail-closed experiment behavior, not a demonstrated provider crash or a rules-engine failure.

Better per-request terminal accounting on cancellation would require authoritative server-side completion/abort evidence. Continuous partial usage alone would still not prove the final cost of a request with output in flight. None of the six historical/current unknown allocations was cleared, refunded or estimated in this investigation.

## Recording and grammar checks

The earlier recording defect was independent of the GPU delay: native reservation happened before deadline construction, but model request/failure capture lived inside the subsequently invoked provider wrapper. A pre-invocation refusal therefore left standard boundary events absent. Encrypted debug records remained retained, and the coverage verifier correctly reported partial coverage. Prior source repair`80b2be4` records those allocated rejected attempts without dispatching or changing counters. It was verified with a failing-then-passing synthetic clock regression; old evidence was not backfilled.

An additional isolated test here measured the same native per-packet capture path on synthetic data. A550-packet stream took533ms total; four parallel550-packet streams took2,071ms total, with approximately2,024–2,045ms spent in each stream's awaited capture callbacks. All2,750packets were recorded, with zero real model calls. The four streams deliberately share one run, adding SQL sequence-lock contention. The test uses a fresh owned database and performs no GPU/model work, so it cannot quantify live contention or supersede historical Q3 results. It did not reproduce the tens-of-seconds shared pauses.

A separate offline check used the exact pinned Guidance backend, local tokenizer and five retained schemas, without loading weights or generating. Per-schema grammar compilation took2.4–6.2ms; first token-mask construction took0.04–2.45ms. Fresh-process imports took22.9seconds, which were measured separately and must not be confused with per-request compilation in an already running provider. This check does not measure per-token Metal/CPU synchronization. It provides no support for blaming ordinary grammar compilation alone for the90second failures.

## Confidence and remaining uncertainty

High confidence: the unsafe mixed-workload extrapolation,29second follow-up admission limit, two request deadlines, missing terminal usage, collateral hard-stop cancellation, early-rejection capture path and legacy-command undercount. The exact request/receipt evidence and code establish these mechanisms.

Strong evidence: shared serving stalls during new prompt work consumed much of the coordinator deadline. The synchronized packet gaps, native prompt/generation counters and unified Metal execution path agree.

Not established: an exact split among GPU kernel work, initial shape/kernel warmup, provider scheduling, every-token grammar/memory transfers and OS contention; whether this exact coordinator workload would complete at one/two concurrent requests; or whether all eight architectures can finish full workflows under the current90/120second limits. No new live probe was authorized by this investigation or performed.

The next engineering targets are per-profile full-workflow latency qualification, control of shared prefill work so active decoding retains deadline headroom, authoritative request-level terminal accounting on cancellation, and a complete cross-architecture command census. Recording and validation limits remain unchanged. The accepted historical16.29%recording-overhead failure against10% is unchanged.
