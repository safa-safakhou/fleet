# Shared runtime repairs and Nemotron validation — 27 October 2026

Status: shared repairs deployed and a separate fresh 24-kingdom, 30-minute Nemotron run completed. The world is paused. Results improved, but the run was not a clean reliability pass: two unknown model allocations remain. A further cutoff-admission guard was added and verified offline after the run; it is not in the preserved trial deployment. This assignment implements the shared parts of the [reliability plan](superpowers/plans/2026-10-27-runtime-reliability-fixes.md); Codex-specific timeout, concurrency and quota work is deferred at the user's request. No commit or push was requested.

## Changes and boundaries

- Coordinator observations have immutable host-assigned evidence-frame IDs. Native revisions still guard game state; two observations with the same revision can no longer overwrite each other's evidence. Refresh checks the original frame, current frame, delivered citations, owner-intent epoch and unchanged semantic action. Eviction, mismatched revision and missing references have distinct diagnostics. Exact command IDs remain unchanged.
- Queue/turn cancellation preserves the actual deadline, claim, task or host-stop reason. A dedicated turn timer stops queued work at the turn boundary. Uncertain dispatched usage and commands remain preserved.
- Autonomous specialists receive bounded feedback for proven unaccepted proposal failures: resource/authority/promise claim conflicts, correctable native proposal validation, duplicate evidence support and undelivered evidence references. Claim feedback includes exact requested and remaining units. The existing three-call ceiling and remaining-usage budget still apply. A generic error does not authorize retry; accepted/uncertain commands and prior skill publication/adoption cannot be replayed by this path. Native validators remain authoritative.
- Platform architectures now journal successful authenticated council/conversation reads through the same consented encrypted communication ingestion as legacy architectures. Native IDs deduplicate repeated reads. No additional messages are fetched or sent by this hook. This journal measures observed communication, not all communication existing in PACT.
- Metrics separate provider execution from queue-inclusive elapsed time, record correction codes and reasoning configuration, and expose finish-reason/reasoning/timing coverage. Missing historical metadata remains unknown. Context demand includes the configured output reservation; it is not a measurement of GPU cache occupancy.

No game rule, agent strategy, forced contact acceptance, scheduler replacement or model migration was introduced. Source/API compatibility remains covered by fake-provider tests; there are no real Codex calls in this assignment.

## Historical rejection investigation

Selected encrypted evidence from the previous local run was restored into a disposable, network-isolated audit database. The original world was never resumed. Thirteen active-period rejection outcomes were examined, with selected truncated/read/wait controls:

- All six resource conflicts were troop-training proposals. Separate ordinary and founding balances were delivered. The correction gap was established: those failures ended the specialist turn without actionable rejection feedback. Exact historical effect quotes were not retained, so this does not claim to reconstruct every quoted cost.
- The `INVALID_MODEL_OUTPUT` response was valid JSON matching the generation schema. Runtime validation rejected a repeated evidence ID in a goal update (`Duplicate support`). Targeted correction now explains this distinction.
- The undelivered evidence ID had no exact occurrence in its delivered packet. It cannot safely be treated as a valid reference or silently substituted. The agent now receives the allowed evidence IDs and may revise within its original budget.
- Both coordinator proposals cited six delivered references each. Offline reproduction proves the same-revision cache ambiguity; the old cache itself was not retained, so that exact live causal chain remains unproven.
- The `EXPIRED` outcome was a supply-offer signature rejection, not evidence of a model timeout. The delivered snapshot showed 60 seconds of game time until expiry; the response arrived about 12 wall-clock seconds after packing, near the next discrete game tick. This is consistent with offer state expiring between observation and submission. Exact intermediate native time was not retained. Expiry validation remains in force.
- Truncations overlap turn outcomes and must not be added as independent failed turns. Model choice, strategic waiting and failed negotiations remain research outcomes.

## Context investigation and selected settings

The installed pinned Nemotron model configuration advertises 262,144 positions. That is not the deployed server/cache capacity. The previous local run used a 32,768-token server context and a 64,000-byte request allowance.

| Check | Samples | Maximum input tokens | Input plus 8,192 output allowance |
|---|---:|---:|---:|
| Selected historical requests | 41 | 18,220 | 26,412 |
| Complete synthetic workflows across all eight architectures | 88 | 37,543 | 45,735 |

Both the installed CPU tokenizer and the running server's `/tokenize` endpoint agree for the complete workflow sample. Some expanded native workflows exceed the old context; historical selected failures do not establish context exhaustion as their cause.

The fresh run uses **65,536 context tokens, 128,000 request bytes, 8,192 output tokens and 65,536 reserved tokens per call**, with thinking enabled. Existing call/turn bounds remain 180/360 seconds. The output cap is retained because one historical generation already took 168.7 seconds; raising output alone could turn truncation into a timeout. This trial must report any remaining truncations explicitly.

Live cache metadata is verified against the configured instance: 94 physical blocks, 92 usable, six fixed Mamba blocks per request plus one attention block per 976 reserved tokens. The largest fixture needs 53 blocks. It fits individually, but two such requests cannot run together. Four provider slots are a ceiling; exact token/cache admission determines actual concurrency. This is preferable to promising four maximum-size calls on the available GPU.

## Offline verification

- 1,140 unit tests passed across 209 files.
- 149 isolated integration checks passed: 52 native all-architecture workflows/metrics checks and 97 action rollback, specialist engine, coordinator, capacity and deadline checks. Providers in these checks are synthetic.
- Type/style checks, build, architecture boundaries and `git diff --check` passed. The legacy exact-source test retains its original hashes and explicitly accounts for the reviewed cancellation/timing changes.
- All 11 pinned model files passed size/SHA-256 verification.
- Fresh-world baseline: 24 kingdoms, zero model calls/actions/messages; encrypted restore compares all rows in 167 PACT and 77 Fleet tables.

Private evidence and credentials remain outside Git. Run root: `~/.local/share/pact-fresh-canary-20261027-e230f3a6`; implementation evidence: Fleet's ignored `.superpowers/sdd/2026-10-27-runtime-reliability-fixes/`. Prior worlds, unknown allocations and E4/KQ1 blocks are preserved.

## Actual live results

Window **14:01:13.584–14:31:13.584 UTC** (15:01–15:31 Berlin). The gate closed 441 ms after its planned end; model/game admissions independently check the exact deadline. World paused at tick 29. All 41 upgrades below completed by the cutoff, as confirmed against committed native game ticks; they are not extra passive completions during drain.

The comparison is with the previous fresh local 30-minute run, not Terra. It is one stochastic run per configuration, with both engineering and context changes; it cannot isolate the causal effect of each change.

| Full-run measurement | Previous Nemotron run | This run |
|---|---:|---:|
| Turn attempts | 216 | 175 |
| Reported model calls, including drain | 250 | 212 |
| Committed agent actions | 68 | 88 |
| Completed upgrades at cutoff | 32 | 41 |
| Accepted contacts | 1 | 3 |
| Agent messages | 3 | 7 |
| Reciprocal messaging pairs | 0 | 1 |
| Terminal rejection/error outcomes | 14 | 9 |
| Calls recorded as truncated | 6 | 4 |
| Unknown usage allocations retained | 0 | 2 |

The 217 allocation rows comprise **212 reported, 2 unknown and 3 not dispatched**. At the cutoff, 211 calls were reported; one already-dispatched truncated response settled during drain. Known usage is 3,779,602 input plus 183,686 output tokens (3,963,288 total). Unknown usage is additional, not zero. The previous run's reported total was 3,036,625 tokens: more context also costs more computation.

| Architecture | Kingdoms participating | Attempts | Committed actions |
|---|---:|---:|---:|
| autonomous-specialists@1 | 3 | 84 | 16 |
| legacy-cognition@1 | 3 | 6 | 5 |
| legacy-loop@1 | 3 | 6 | 6 |
| reactive-basic@1 | 3 | 17 | 12 |
| reactive-cognition@1 | 3 | 15 | 12 |
| reactive-cognition@1.1 | 3 | 12 | 10 |
| reactive-cognition@2 | 3 | 18 | 13 |
| specialist-coordinator@1 | 3 | 17 | 14 |

All eight architectures acted. There was real construction and a two-way exchange, but no training or active supply contracts, and all Halls remain level 1. This is evidence of a functioning experiment, not a mature coordinated society.

### What still failed

1. **Two resource-conflict turns exhausted their correction budget.** Across eight turns using the new proposal feedback, six reached valid waits and two remained rejected. Twelve follow-up calls carried feedback (ten resource conflicts, two undelivered-reference feedbacks). These are safe recoveries, not additional productive actions. One agent increased its troop count after being shown that even the smaller request exceeded available stock.
2. **One coordinator refresh rejected a contact acceptance.** G3's barracks reached level 2 at 14:18:16.439, during the proposal's 49.782-second capacity wait. Generation then took 29.913 seconds and the turn ended at 14:19:14.280. `pactActionBasis` hashes completed building levels; refresh refuses to silently rewrite the changed basis. The contact itself was still pending. Source plus native timing explain a concrete invalidation mechanism, although the in-memory fresh frame was not retained for branch-level proof. Fresh whole-proposal reconsideration for this condition remains an improvement; loosening the semantic check would be incorrect.
3. **Four reported calls hit the 8K output cap:** one autonomous-specialist call, one coordinator call and two reactive-basic calls. The latter were an original attempt plus its bounded correction; the final response settled after cutoff and was fenced. No context increase can by itself remove an output-token limit.
4. **Six end-boundary deadline outcomes occurred.** Three attempts were proven not dispatched. One turn retained both truncated calls' known usage. Two other calls were admitted after about 47 seconds in the queue with only about 1.5 seconds before cancellation. Those two became unknown usage. This is an engineering admission defect, not evidence of low model intelligence.

No old `COORDINATION_EVIDENCE_UNAVAILABLE` failure, input-packing/context-overflow failure, stream-parser failure, lease-loss outcome or provider OOM was recorded. This does not erase the nine rejection/deadline outcomes above.

### Follow-up cutoff fix — verified offline, not live-qualified

The operator-owned `RunWindow` now requires the existing full model-call bound plus one second for settlement before admitting tokenizer/provider work, and checks again at actual dispatch before and after the accounting callback. Nemotron thinking calls therefore need more than 181 seconds remaining in a bounded window. New model work stops early enough to drain; the game window itself is unchanged. An already-dispatched response is not cancelled by this guard, and runtimes without an operator window are unchanged.

Three new unit regressions failed before this change and pass afterward. The complete host/admission/capacity/window fixture confirms a last-second call never reaches the fake provider, creates no unknown usage and releases capacity. The existing uncertain-stream and late-known-response tests still pass. Final verification: **1,143 unit tests**, **150 distinct selected isolated integration cases overall**, types/style/build/boundaries and diff checks. The original 149-case selection ran before the live trial; the affected deadline file was rerun afterward with the new case. No second model trial or deployment occurred after this change. The frozen trial artifact manifest still identifies the code actually tested live.

### Measured context and capacity

Largest real input: **40,128 tokens**; with the 8,192-token output reservation, **48,320 / 65,536 (73.73%)**. Largest serialized request: **127,038 / 128,000 bytes**. No inbox records or quoted options were recorded as omitted; these counters do not certify that every optional history/catalog field was retained. The 64K server context was sufficient for every measured request. Byte packing is still closer to its ceiling than token context; further blind context expansion is not justified by this sample.

Sampled GPU memory peaked at **13,237 / 16,303 MiB**. Provider concurrency reached **3**; the configured ceiling remains 4. Maximum recorded Fleet queue delay was **91.329 seconds**. Provider telemetry showed zero cache preemptions and at most one internally waiting request. Mean measured provider execution was 17.131 seconds; mean queue-inclusive elapsed time was 45.691 seconds. These are sample/run observations, not latency guarantees.

All 212 reported responses include finish-reason and reasoning metadata. All 217 recorded requests selected thinking, including the five non-reported allocations. The scoped communication journal remains empty because no qualifying council/conversation read was ingested; native PACT records supply the seven-message count. The offline all-architecture read tests verify the ingestion hook, not that agents chose those reads live.

### Final state and next acceptance boundary

- World and all 24 cohorts paused; owned worker, API, rules worker, event publisher, console, supervisor, guardian and provider stopped. GPU memory returned to roughly 1 GB.
- Zero running turns, capacity leases and pending/unknown game commands.
- **C1 and E3 each retain one unknown 65,536-token reservation**: 131,072 tokens reserved in total. Both kingdoms remain held for owner review. No uncertainty settlement, cancellation, replay or identity reset was performed.
- Final encrypted restore authenticated and compared complete rows in 167 PACT / 77 Fleet tables. Old worlds and old unknowns were untouched. E4/KQ1 remain blocked.

Before claiming a clean long-run acceptance, qualify the new cutoff guard live under a separately bounded run, address coordinator reconsideration after an observed-state change, and investigate the remaining long-reasoning/output-cap cases. Resource decisions and willingness to communicate remain research questions. No further trial, commit or push is implied by this report.


## Bounded investigation follow-up — source only, 27 October 2026

The owner requested investigation, fixes where justified and a quick validity check. This follow-up used no model calls, live game operations, deployment or uncertainty review. Nemotron configuration, paused worlds and E4/KQ1 remain unchanged.

### Confirmed causes and changes

- **Coordinator recovery gap:** rejecting a proposal whose factual basis changed was correct, but `SpecialistCoordinatorEngine` did not recognize that rejection as eligible for fresh reconsideration. `PactCoordination` now distinguishes a valid original choice invalidated by current evidence from an invalid original proposal. It supplies a typed pre-submission rejection with one of three reasons: owner intent changed, current choice disappeared, or expected outcome changed. With at least two existing call slots remaining, the coordinator observes again and asks for a new proposal and selection. A rejected command is never silently rebased/replayed; generic errors, insufficient budget and any started submission remain terminal for this path. The rejection reason and remaining-call decision are traced even when no retry fits.
- **Unchanged-input retry:** generic `recoverModelOutput` previously repeated the original request when corrective instructions exceeded its input-byte allowance. It now returns the accounted failure without spending another model call or deleting evidence. The separate native `runDecisionFeedback` path already stops when feedback cannot fit. This is a reproduced source defect, not proof that it caused the four measured truncations.
- **Failure attribution:** generic output recovery also collapsed several explicit cancellation causes into `CLAIM_FENCED`. It now preserves the existing typed deadline/stop causes. If the cutoff guard proves a corrective request was not dispatched, the last accounted failure is retained; an uncertain attempted dispatch still propagates. No unknown usage is cleared.
- **Offline fixture defect:** native legacy tests selected introduction targets from a preview using discovery rotation 0, while runtime discovery rotates by turn/ordinal. With more than eight peers, that preview target could be absent from the delivered page, causing repeated schema lookups in the fake agent. The fixture now chooses from its actual delivered discovery page and records schema-fallback diagnostics. Production discovery and reference checks are unchanged.

### What is not an engineering fix

The two resource-conflict turns were not identical. One requested training counts 2, then 8, then 8 despite being shown inadequate ordinary stock. Its first request needed 12,000 iron units against 800 available and 4,800 silver against 400 available; the larger request increased the shortfall. The other turn first exhausted an 8K response, then produced an undelivered reference, and reached its first resource conflict on the final call. It had no remaining resource-correction opportunity. Exact arithmetic and native admission correctly rejected the requests. Removing those checks or forcing a game action would undermine the experiment.

Measured input context remains sufficient for this workload: maximum 40,128 input + 8,192 output reservation = 48,320 / 65,536 tokens. Request bytes approached their separate limit (127,038 / 128,000), which makes correction admission important. Four known responses exhausted output capacity; these changes do not establish that Nemotron will now finish reasoning or make better economic/social decisions. No output/context/time budget was increased in this follow-up.

### Follow-up verification and remaining acceptance

Fresh follow-up verification: **65 focused unit cases and 102 distinct selected isolated integration cases pass**, plus TypeScript/style (existing warnings remain), production build, architecture boundaries, report links and both repository diff checks. The 102 cases comprise 33 specialist-engine, 10 model-recovery, 7 native-coordination, 3 deadline-runtime and 49 complete native-workflow cases. All eight architectures exercise real PACT handlers/MCP on fresh synthetic databases with fake providers; no actual Codex or Nemotron inference occurs. Checks reproduce the coordinator recovery gap, unchanged-input retry and cancellation relabeling before the fixes, and verify the corrected behavior afterward. Native cutoff admission and uncertain-command preservation still pass.

The first integration selection had two failures: a new assertion initially expected numbers for PostgreSQL bigint strings (test corrected), and the discovery-rotation fixture issue above. The affected selections were rerun after correction; the final 43-case specialist/recovery and 49-case native-workflow runs pass. This follow-up did not rerun the full historical 1,143-case unit suite and does not claim a new full-suite result.

The changed source is not deployed or live-qualified. The earlier cutoff guard also remains source-only. A subsequent separately authorized bounded run is needed to measure recovery and shutdown behavior with Nemotron; resource decision quality and output truncation remain explicit research questions. C1/E3's two old unknown allocations and all earlier worlds remain preserved. No commit or push was requested or performed.
