# Smaller native-architecture experiment — 2 November 2026

Status: **closed failed; full hour did not complete**. Fresh world `fleet-small-20261102-1479dd0f` is paused at tick2; owned execution is stopped. Planned window20:56:31.956–21:56:31.956UTC; actual stop after approximately132.5seconds. [Exact configuration, per-kingdom outcomes and verification](smaller-vllm-experiment-20261102.json). [Plan](../superpowers/plans/2026-11-02-smaller-vllm-experiment.md).

**Reporting correction —3November2026:** The original zero-gameplay-command count omitted legacy command_resolutions. Authoritative PACT receipts confirm one committed supply offer by legacy-loop-1-2, still open; zero signed contracts. [Full investigation and evidence](smaller-vllm-investigation-20261103.md). The timeouts, usage holds, historical private artifacts and failed full-hour qualification are unchanged.

| Profile | Kingdoms |
| --- | --- |
| legacy-loop@1 | 2 |
| legacy-cognition@1 | 2 |
| reactive-basic@1 | 2 |
| reactive-cognition@1 | 2 |
| reactive-cognition@2 | 2 |
| reactive-cognition@1.1 | 2 |
| specialist-coordinator@1 | 2 |
| autonomous-specialists@1 | 2 |

Each architecture receives the same pair of bounded development/cooperation goals. Four legacy agents use scheduled reviews; the other profiles each have one scheduled and one hybrid agent, with native two-minute cadence/event routing. Autonomous participant events use addressed native tasks and scoped bookkeeping. Learning and skills remain off. PACT owns authority, consent, economy and receipts; no stock grants or raids/training exceptions.

The shared native host uses sixteen manual Temporal workers and a sixteen-connection pool. Start at two concurrent requests; measured settled results, resource headroom and a conservative deadline forecast permit four/eight. One active native turn per binding remains enforced. Logical queue delay, native allocations and actual provider running/waiting/preemption metrics are recorded separately. Encrypted event/observation audit pages retain their ordering, consent version and integrity chain. Normal stop drains admission; the controller, independent watchdog and owned provider guard enforce finite closure. No new dispatch in the final three minutes.

Per kingdom:48 lifetime calls/1,920,000 reserved tokens; total768/30,720,000. Each turn permits three calls/one accepted action,48,000 input bytes,1,024 output tokens and32,768 context tokens. All native validation, privacy, lease, fencing, accounting, capture, integrity, retention and recovery guards remain enabled.

Pinned vLLM Metal0.32.0/MLX0.32.2/Python3.12.13 uses Nemotron4B MLX revision`c4d79ba1901d99806ef757642a552acebb851a35`. The repaired6GiB planner cap now results in native **5.99GiB backing** (provider-reported rounded value),402 physical/400 admission blocks; eight full contexts require320 blocks. Authenticated topology and tokenizer checks pass without generation. This MLX affine4-bit conversion differs from the historical GGUF; weights/precision/provider are not a bit-identical comparison.

Verification before activation: thirteen focused owned integration tests pass across evidence capture, binding ownership and specialist delivery; operator syntax and watchdog normal/hard-end/heartbeat/clock checks pass. All sixteen native profile/config/model identities match the prepared roster; the candidate dispatch query compiles against the fresh isolated schema. The prepared world is paused at tick0 with zero tasks/turns/allocations/commands. Common PACT packets fit at a maximum42,044 bytes, with zero generation calls. These are shared observation baselines, not proof that every architecture's real phase sequence fits or succeeds; each actual request remains guarded at native dispatch.

Preparation refusals were contained before execution: autonomous configuration defaults had to be installed before native model configuration; the basic packet harness rejected legacy cognition flags; the new provider tokenizer is at`/tokenize`, not`/v1/tokenize`. Operator ordering/path fixes retain exact native configurations and guards. No failed native task was replayed. The first metadata-only provider was stopped because elapsed preparation would leave insufficient room for a full hour inside its finite guard; a fresh metadata-only instance was qualified before any task enrollment.

The [Docker cleanup](docker-smaller-cleanup-20261102.json) removed956 reviewed unused image/intermediate records without force or parent pruning. Host free space increased from9.16 to17.48GiB; guest usage fell to36GiB with58GiB free. All75 current containers/121volume definitions and original67/115 plus three healthy services match; mount enumeration differences were verified as ordering only. Existing worlds, recovery copies and all120,000 historical unknown reserved tokens remain protected. No reset/refund, retained-world run, push or broad cleanup.

This is one exploratory shared world with only two replicas per architecture, and a changed model conversion/roster versus the previous24-agent trial. Report actual model/architecture errors, accepted actions and outcomes; do not rank architectures causally or claim universal correctness. Full hour, final usage/effects, complete evidence, four snapshot/state/artifact restores, original preservation and actual timeline/context/causal rendering remain required at closure. The historical accepted16.29% recording overhead still fails its unchanged10% threshold.

## Actual result and exact causes

Nine native turns started across six profiles; eight requests reached vLLM. Five calls reported37,220input/1,092output tokens and three remain unknown with120,000fully retained reserved tokens/null usage. Three reactive turns returned valid native waits. Both legacy turns stopped on MODEL_ADMISSION_DEFERRED; the coordinator pair exceeded model time, a reactive-basic call was stopped during global closure, and one legacy-cognition turn was cancelled without a model call. One committed legacy supply offer (corrected3November); the other selected profiles did not reach inference. This was not a full eight-architecture behavioral qualification.

The provider actually reached **four simultaneous running requests**, with peak waiting2, zero preemption, minimum observed memory availability46% and zero waiting database clients. Authenticated physical cache capacity held; that did not prove serving-latency headroom. Both coordinator calls produced their first content after42.8–43.6seconds, were still streaming at90seconds with no terminal finish/usage, and raised MODEL_DEADLINE_EXCEEDED. One other request was interrupted by the resulting host stop after28.4seconds. Native final usage never arrived for those three calls. Aggregate provider token counters cannot attribute exact usage to individual allocations and have not been used to clear them. This isolates the deadline trigger; it does not establish batching as the sole cause without a per-profile counterfactual.

The native non-thinking model bound is90seconds inside a120second turn, plus1second accounting margin. Follow-up admission therefore ends29seconds into the turn. The two legacy first calls/processing took40.2/62.4seconds, so their next calls correctly refused dispatch. No model/turn/window limit was increased. The ramp learned from two short reactive waits and did not establish coordinator or legacy multi-phase latency readiness; profile-specific timing qualification is required before a future increase.

Two already-allocated legacy refusals exposed a separate canonical capture gap: deadline preparation rejected before entry to the observed model wrapper, leaving model.request/model.failed records absent for those allocations. Their encrypted debug packets remain retained. A synthetic clock-crossing regression reproduced the missing event; the precise source repair records rejected allocated requests/failures without invoking a provider, emitting dispatch or changing usage/call/token counters. Both native and legacy paths are covered. The historical legacy digest is unchanged, with only the exact reviewed capture change reversed in its drift guard. Source verification:1,294root units pass/23platform skips,14focused integration tests pass, types/style/build/boundaries pass. This source fix does not cure serving latency, settle unknown usage, backfill old events or establish live acceptance.

## Closure and preservation

The independent safety path closed the admission gate and paused tick2, with zero running turns/capacity leases/active worker sessions/pending commands. All owned controller/rules/provider/provider-guard/watchdog/awake processes stopped. The first strict success-oriented verifier refused the partial coverage, as required. A separate failure-preservation audit rechecked the already-created four restores rather than repeating snapshot creation or weakening successful-run qualification:328canonical table projections match,154state files/27,277,154stored bytes match, and3,229artifact references/17,795,250plaintext bytes verify. All72encrypted observer pages retain their chain/scope/consent/retention checks. Four scope manifests are complete; five remain honestly partial (three unknown usage, two pre-invocation boundary gaps). No history was rewritten.

Original67container configurations/115volume definitions match and three original services are healthy; all75current containers/121volumes were separately checked during cleanup. These are structural/service preservation checks plus fresh experiment restores, not a new full business-data audit of unrelated services. Every previous world/identity/task/hold remains protected. The three older unknown allocations also remain held: six unknown allocations/240,000reserved tokens across the old capacity attempt and this attempt. No refund/reset/replay, new real retry, push or threshold relaxation occurred.

The full-hour objective remains blocked by unresolved request accounting and insufficiently qualified serving latency. The repaired recording path is source-only. Automatic live retry is paused; a future attempt needs fresh identities/window and an explicit resolution of the accounting condition. Historical16.29%recording overhead remains an accepted failure against unchanged10%.

| Kingdom | Profile | Reported / unknown / not dispatched | Native outcome |
| --- | --- | --- | --- |
| legacy-loop-1-1 | legacy-loop@1 | 1 / 0 / 1 | MODEL_ADMISSION_DEFERRED |
| legacy-loop-1-2 | legacy-loop@1 | 1 / 0 / 1 | MODEL_ADMISSION_DEFERRED; one supply offer committed |
| legacy-cognition-1-1 | legacy-cognition@1 | 0 / 0 / 0 | CLAIM_FENCED |
| legacy-cognition-1-2 | legacy-cognition@1 | 0 / 0 / 0 | Not started |
| reactive-basic-1-1 | reactive-basic@1 | 0 / 1 / 0 | HOST_STOPPED |
| reactive-basic-1-2 | reactive-basic@1 | 0 / 0 / 0 | Not started |
| reactive-cognition-1-1 | reactive-cognition@1 | 1 / 0 / 0 | WAIT |
| reactive-cognition-1-2 | reactive-cognition@1 | 1 / 0 / 0 | WAIT |
| reactive-cognition-2-1 | reactive-cognition@2 | 0 / 0 / 0 | Not started |
| reactive-cognition-2-2 | reactive-cognition@2 | 0 / 0 / 0 | Not started |
| reactive-cognition-1.1-1 | reactive-cognition@1.1 | 1 / 0 / 0 | WAIT |
| reactive-cognition-1.1-2 | reactive-cognition@1.1 | 0 / 0 / 0 | Not started |
| specialist-coordinator-1-1 | specialist-coordinator@1 | 0 / 1 / 0 | USAGE_UNKNOWN |
| specialist-coordinator-1-2 | specialist-coordinator@1 | 0 / 1 / 0 | USAGE_UNKNOWN |
| autonomous-specialists-1-1 | autonomous-specialists@1 | 0 / 0 / 0 | Not started |
| autonomous-specialists-1-2 | autonomous-specialists@1 | 0 / 0 / 0 | Not started |
