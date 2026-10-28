# Queue and turn-deadline repair — 28 October 2026

Status: source and offline verification; retained world PAUSED. No real provider calls, GUI, deployment, enrollment, new game run, commit or push. E4/KQ1 remain blocked. Work was inline; parallel test processes each used their own fresh, owned PostgreSQL fixture.

This repairs the runtime failure chain observed in [the last half-hour run](fresh-admission-half-hour-20261028.md). It does not turn architectural limits or authored fake-provider success into evidence of Nemotron decision quality.

## Confirmed causes and repairs

| Cause | Repair | Offline evidence |
|---|---|---|
| Capacity admission checked the overall run window but admitted calls with only seconds left in the individual turn. | Require the full existing generation allowance plus the existing one-second accounting margin before entering/admitting the queue and before dispatch. Return `MODEL_ADMISSION_DEFERRED`, definitely not dispatched, when it cannot fit. Original deadlines and existing retry schedules remain authoritative. | Native admission with insufficient headroom creates no allocation or provider call; queued legacy refusal retains its measured queue delay and definite non-dispatch. |
| The legacy generation timer ran while a request waited for inference capacity. | Tracked generation starts at the dispatch boundary. Preparation/queueing has a separate latest-start cutoff. Opaque providers are conservatively witnessed at invocation, without claiming proof about their underlying network activity. | Both tracked and opaque full legacy runtime paths tolerate 100 seconds queued followed by 100 seconds generating under the original thinking turn. Slow authorization cannot dispatch after the latest start. |
| Recovery deleted active capacity leases after turn expiry although the provider invocation had not returned. This could admit another request against already occupied capacity. | Automatic expiry cleanup removes queued leases only. An active invocation retains its lease until it settles. | Recovery and a competing waiter cannot reuse active capacity; capacity is released after the original operation completes. |
| Expired, terminal or fenced queued owners could remain the four-bypass fairness barrier. | Candidate selection and fairness barriers use only eligible running owners with matching agent/cohort fences and a valid admission cutoff. | Expired, finished and fenced barriers no longer strand an eligible waiter. Existing four-bypass fairness and weighted cache admission still pass. |
| Protocol-complete SSE output waited for transport cancellation acknowledgement before returning final usage. A stalled body also relied entirely on fetch to observe cancellation. | Return complete output/usage immediately after the terminal frame; request cleanup asynchronously. Race body reads against the bounded cancellation signal. Partial responses remain uncertain. | Complete-host accounting settles known usage despite delayed cleanup; stalled streams terminate with the actual cancellation cause. Late answers are accounted but cannot execute. |
| Refused legacy queue time was missing, and deadline review exposed overlapping dispatch hooks and overwritten cancellation causes. | Record refusal latency without prompts; make dispatch authorization one-shot; preserve the first cancellation cause. | Focused regressions reproduce each defect before the fix and pass afterwards. |

The retained evidence proves that late admission and premature capacity release occurred. It does **not** establish that every historical late response was caused by slow socket cleanup; that separate defect was reproduced with a synthetic transport.

## Limits deliberately preserved

Generation remains 90 seconds without thinking / 180 seconds with thinking. Turn bounds remain 120 / 360 seconds. With the existing accounting margin, a thinking turn's latest possible admission is 179 seconds after its start; a shorter overall window can stop it earlier. Waiting does not extend the original turn.

The existing limits remain eight executing workers, sixteen executing-plus-waiting turns, four provider request slots and the configured weighted cache pool. The mixed burst used the observed 92-block pool with requests needing 32–54 blocks. Such requests cannot all run four at once: physical cache demand still governs concurrency. Safe deferral under overload is expected; this repair does not claim higher GPU throughput.

If a worker/process disappears without proving its active provider work ended, its active capacity must remain conservative. Reusing that capacity requires operational confirmation; turn expiry alone is insufficient. Existing unknown usage is neither refunded nor replayed.

## Verification

- Full unit suite: **1,169 passed across 209 files** after final production changes.
- Complete owned integration discovery pass: **754 passed / 44 failed, 798 tests across 102 files**. Every failure was investigated. Follow-up runs repair fixture-contract/timing/snapshot defects and explicitly distinguish historical budget/context stops from successful qualification. The final combined affected-suite run passed **85/85 tests across 13 files**. All 29 historical protocol cases were verified in separate owned reruns: 15 completed positive protocols, 13 exact historical safety stops and the original context-fence regression. Together with the other repaired-scenario reruns, this covers every initial failure. This was a full discovery pass followed by targeted reruns, not a second single green full-suite invocation.
- Focused final runtime composition: **39 passed**, including capacity, complete host deadline/accounting, native event publishing and the synthetic 24-actor burst.
- Current native workflows: **49 passed** across all eight architectures, including prerequisite construction, contact and message paths through real application handlers with fake providers. Six additional native grounding cases passed, including thirty successive rounds and both specialist presets.
- The synthetic 24-actor burst completed every claimed turn with a successful wait or definite admission deferral. No worker expired; no unknown/reserved allocation, held actor or capacity lease remained. Execution, outstanding-turn, request and cache caps held. This is a deterministic concurrency test, not a GPU benchmark or proof of strategic behavior.
- Pinned vLLM CPU-only cache metadata checks: **3 passed**, with CUDA initialization prohibited. No model loaded.
- Type checking, production build, module boundaries, whitespace and new report-link checks passed. The style check passed with zero errors; it still reports 171 warnings and 60 informational diagnostics. Original source/architecture baseline files are preserved.

### Historical test reconciliation

Several older tests still emitted full state maps after the production contract had switched to observation references; others requested an already delivered schema or an introduction to an existing contact. Their fake providers now use the delivered schema/reference and choose an offered action. Tests for refusal, invalid output and unknown usage remain. Synthetic native-event and clock fixtures now provide enough initial time to test actual dispatch; the separate 2.5-second cutoff test correctly expects no dispatch/allocation.

Migration preservation compares every original column value, then checks all-column idempotence after migration. Adding columns is not a mutation of historical values. Architecture parity keeps the original baseline and its hash unchanged; an explicit 27-delta reviewed manifest records earlier schema/prompt/provenance/coordinator repairs. Commands, usage, outcome and fence comparisons remain exact. No baseline digest was refreshed to conceal drift.

Historical negotiation limits are **failed behavioral qualifications**, even when the safety-stop test passes:

| Frozen variants | Observed result |
|---|---|
| RC2, RC3, RC5–14, RC16–18 | All four positive cells and role reversals complete with authored fake providers. |
| RC15, RC19, RC22 | First two cells complete; the reversed C01 cell reaches `RC1_MODEL_CAP`. |
| RC20–21 | First cell reaches `BUDGET_EXHAUSTED`. |
| RC23–24 | First cell reaches `RC1_MODEL_CAP`. |
| RC25–30 | C01 completes; C02 stops at `SPECIALIST_CONTEXT_INCOMPLETE` under the frozen 32 KB input limit. |

The original v4 context-fence regression also remains enforced. The older E1 24 KB accounting fixture is explicitly tested for its context refusal; current-profile accounting is checked separately through known-result review, definite non-dispatch and early cancellation, alongside complete native runtime workflows. No historical protocol, budget, model configuration or old report was rewritten to make these qualifications appear successful.

## Retained state and operational acceptance

A read-only check confirms 24 paused cohorts, 18 ready agents and six agents held for the previously recorded unknown usage. The ledger remains 102 reported calls, eight not dispatched and six unknown allocations retaining **393,216 tokens**. There are no running turns, capacity leases or unresolved platform commands. PACT remains paused at game time `1793143980000`. Existing services, private evidence and older worlds were not changed.

These changes are on the main Fleet checkout; PACT receives this paired report and a current-state pointer. They are not deployed or live-qualified. The next operational step, when explicitly requested, is deployment followed by a bounded fresh-world canary checking real queue tails, deferrals, deadline causes, usage settlement and social behavior. That step is separate from offline technical acceptance; this record does not authorize it.
