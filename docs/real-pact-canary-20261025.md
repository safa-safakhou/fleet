# Real PACT readiness and bounded canary — 25 October 2026

**The coordinator and supervision implementations are verified offline. The real-workflow canary failed, so the 24-hour run is blocked and has not started.** The failed attempt is closed permanently; no model trial was repeated after its failure. Work was inline, without GUI or delegation, using only Nemotron 4B. E4/KQ1 remain blocked and unrun.

## Three requested tasks

| Task | Actual result |
|---|---|
| Real `specialist-coordinator@1` adapter | Implemented and verified against native PACT handlers, including exact guarded commit and stale-authority refusal. All 24 launch drafts now validate locally. Real-model workflow qualification remains outstanding. |
| Independent observer/cutoff | Implemented and tested for exact 15-minute/24-hour cutoff, clock/process loss, restart, unknowns, failure closure and bounded drain. A separate real process/Windows clock check passed without models. The live canary closed on its first failure and parked successfully. A sustained 24-hour cutoff has not been observed. |
| Bounded real-workflow canary | Executed against fresh real PACT/Fleet databases and 24 kingdoms. Failed on incorrectly advertised PACT tool metadata. Source cause fixed and verified offline afterward; no successor trial run. |

## Coordinator implementation

`pact.coordination.v1` is an explicit opt-in requiring the existing outlook and action-effects protocols. It obtains candidate actions, exact capacities, effects and opaque revisions from PACT's authenticated decision support and native quotes. It does not reproduce economic arithmetic in Fleet. At most eight quoted candidates are exposed, with omissions explicit. Its initial quoted-choice protocol does not claim unrestricted proposal text support.

The kingdom write lease is established before quotation. Mixed revisions, missing claims, expired quotes, wrong owner or modified proposals fail closed. Validation re-quotes the exact command; execution uses its immutable validated command/guard through the normal native atomic handler and original receipt identity. Native message command-specific claims have an explicit checked translation for proposal comparison. Empty menus allow abstention without fabricated capacity. Without the new flag, ordinary adapter and continuity behavior are preserved.

## Supervision and ownership

The operator controller records the common T0/T1 and original process/boot identities before dispatch. An exact run-window guard denies new admissions; a permanent closure marker prevents stale writers reopening them. A separate Python guardian reads Windows monotonic/UTC time, holds a process-scoped keep-awake request, and detects primary process/heartbeat loss or clock disagreement. Restart does not mint a new admission period.

On failure/cutoff, admissions close first, in-flight usage/receipts settle within a bounded drain, and only the owned cohorts, world, workers and isolated provider are parked/stopped. Unknown reservations/commands are retained, never reset or replayed. Finalization quiesces the owned APIs, encrypts both databases and restore-compares complete table rows in a network-disabled temporary PostgreSQL instance. PID/start-time/cwd/command checks constrain process control; concurrent park requests send one termination signal. Databases/volumes and private evidence remain retained. Backup failure must be reported and inspected; this is local process supervision, not a claim of recovery from disk/host loss.

## Actual canary results

The attempt allowed at most **144 generation calls and 15 minutes of admissions**, with first-failure closure and no automatic trial rerun. Twenty-four fresh owner bindings represented all eight architectures, three kingdoms each. Native periodic scheduling and event wake policies were used. The provider was pinned to `nvidia/NVIDIA-Nemotron-3-Nano-4B-BF16`, revision `dfaf35de3e30f1867dd8dbc38a7fc9fb52d3914f`, served as `nemotron-4b` by isolated vLLM.

| Measurement | Observed |
|---|---:|
| Actual provider completions / reported ledger entries | **3** |
| Other compute reservations, confirmed not dispatched | **9** |
| Actual input / output tokens | **15,979 / 323** |
| Actual total tokens | **16,302** |
| Attempted turns | **36** |
| `ACTION_EFFECTS_PROTOCOL_REQUIRED` errors | **24** |
| Turns refused after closure (`RUN_WINDOW_CLOSED`) | **12** |
| Completed owner workflows / model-generated game actions | **0 / 0** |
| New unknown usage / unresolved commands / remaining capacity leases | **0 / 0 / 0** |
| Sampled peak simultaneous provider requests | **3** |
| Provider preemptions / errors / aborts / length finishes | **0 / 0 / 0 / 0** |
| Minimum sampled available RAM | **8.508 GiB** |
| GPU telemetry during this attempt | Unavailable; observer path defect fixed offline |

The observer's historical `ledger.calls=12` counts reservations, **not twelve executed model calls**. Provider counters independently match the three reported completions. Their mean provider end-to-end latency was 6.125 seconds; mean provider queue time was 0.996 seconds. Three samples are not a sustained throughput estimate or proof of four concurrent kingdom workflows.

The durable first-failure closure was written 5.405 seconds after T0, about 2.202 seconds after worker admissions opened. The supervisor observed closure at 5.502 monotonic seconds; parked evidence was collected around 15 seconds after T0. In-flight calls settled normally; the drain did not time out. The world remained at tick sequence zero.

Separately labelled scripted setup committed **48 native commands**: 12 contact requests, 12 acceptances and 24 input messages. These are test inputs, not agent accomplishments. The 24 owner objectives in this canary requested one factual peer reply using the exact observed game time, without delivery promises or duplicate messages. No model-generated reply or action committed. No complete-workflow correctness/recovery percentage can be assessed from this aborted attempt.

| Architecture | Kingdoms reached | Attempted turns | Model-generated actions |
|---|---:|---:|---:|
| legacy-loop@1 | 3 | 6 | 0 |
| legacy-cognition@1 | 3 | 6 | 0 |
| reactive-basic@1 | 3 | 3 | 0 |
| reactive-cognition@1 | 3 | 3 | 0 |
| reactive-cognition@1.1 | 3 | 3 | 0 |
| reactive-cognition@2 | 3 | 3 | 0 |
| specialist-coordinator@1 | 3 | 3 | 0 |
| autonomous-specialists@1 | 3 | 9 | 0 |

Fresh clock qualification passed before dispatch: 301 samples, Windows elapsed 300.382351 seconds versus WSL monotonic 300.383268 seconds, difference 0.917 milliseconds. No host clock setting was changed in this assignment.

## Why it failed and repairs

1. **PACT host metadata overwrote the canonical write annotation.** The canonical action-effects execute tool declares `readOnlyHint: false`, but the final ChatGPT/MCP descriptor used an older hardcoded write-name list that omitted this endpoint. Actual `tools/list` therefore advertised it as read-only with read scopes. Fleet correctly rejected the incompatible contract. Previous tests checked canonical descriptors and handlers, not this final decorated wire catalog. PACT now preserves canonical read/write and other annotations, consistently deriving scopes and operation metadata. A real MCP initialize/tools-list regression now proves the execute endpoint is a `game:act` write. This fixes the shared descriptor layer rather than special-casing one name.
2. **Failure closure stopped inference but the dispatch loop still claimed tasks.** Nine allocations were correctly never sent to the model, yet extra failed/closed turns were created. Capacity/window admission is now checked before each lane and claim, including legacy dispatch. A focused regression reproduces first-lane closure and verifies the other lane is not claimed.
3. **The canary driver added duplicate initial legacy work.** Timed-only profiles already receive their native initial review. The driver now adds an explicit initial task only for event-wake profiles. Existing queues and the failed world's tasks were preserved.
4. **Observer GPU lookup depended on PATH.** The intentionally restricted process environment omitted WSL's GPU utility directory. The observer now resolves its known absolute WSL executable before falling back to PATH. No retrospective GPU peak is inferred.
5. **Preparation checked tool names without checking the write contract.** Preparation and runtime now share the same action-effects catalog assertion, so this metadata mismatch is rejected before a future trial opens worker admissions.

An earlier separate setup-only candidate stopped before inference because the seed helper used an expired stored access token after lengthy offline preparation. That helper now uses the normal credential broker refresh lifecycle. The setup attempt remained terminal with zero turns, model calls or seed commands; its failed state was archived. A fresh candidate reused the already warm, still unused provider; only that fresh candidate made the three measured calls above. Neither failed window was reopened.

## Verification and retained state

Before the model attempt: 1,042 Fleet unit tests, 82 selected isolated integrations, additional native/credential/compatibility checks, types/server build/boundaries and changed-file style passed. Coordinator native tests cover a real one-time commit, stale native authority rejection and an actual guarded contact message. The independent guardian process/clock-only fixture passed. Fresh encrypted baseline restore matched **167 PACT / 77 Fleet tables** for each candidate.

After failure and repairs: **48 focused Fleet unit tests**, **22 isolated Fleet integrations**, **3 PACT metadata unit tests**, and **9 isolated PACT action-effects/wire integration tests** passed. Fleet and PACT type checks, Fleet server compilation, PACT MCP/API builds, Fleet boundaries and changed-file style passed. No model was called to verify these repairs. The full 1,042-test run predates these final repairs; the focused regressions and integrations cover the changed paths afterward.

Final canary archives were AES-256-GCM encrypted and restore-compared across **167 PACT / 77 Fleet tables**. The actual provider, both candidates' APIs/consoles, workers and supervisors/guardians are stopped. Both worlds are paused at tick zero. A final operational readback found no new unknown usage, unresolved commands or capacity leases. Original source/build pins and failed evidence were preserved alongside later repair evidence.

Private actual-run evidence is under `/home/mnim/.local/share/pact-fresh-canary-20261025-9a7e0c20`; setup-only evidence under `/home/mnim/.local/share/pact-fresh-canary-20261025-d3f9241a`. Credentials, dumps, prompts and raw responses remain outside Git. Existing historical unknowns, worlds and ordinary services were not resumed or altered.

The fresh 24-hour instance `fresh-24h-20261025-3e692916` is still paused at tick zero with **zero turns, allocations or game actions**, 24 draft cohorts and no T0/T1. The coordination flag is staged in its private configuration; the three previously blocked coordinator drafts now validate, giving **24 valid local launch drafts across all eight architectures**. No running baseline API/console was reloaded, no worker/provider started, and both execution gates remain disabled. Original configuration/roster and baseline archives were preserved. A new post-coordination encrypted backup/restore matched **167 PACT / 77 Fleet tables**.

## Remaining before 24 hours

1. Qualify the postmortem repairs in a **fresh bounded real-workflow canary**. Require actual completed peer-request workflows across all eight architectures, periodic/event paths, safe rejection/correction and full receipt/usage accounting. Stop and report on first failure; no failed window reuse. The current attempt establishes none of those end-to-end passes.
2. After that passes, refresh the installed source/build and baseline API/console, clock control, isolated provider identity/cache metadata, exact launch digests/deadlines and final activation evidence. Verify four simultaneous real requests where admitted; the current run only sampled three. Preserve the fresh 24-hour identities, goals, budgets and history.
3. Present the concrete game-enabled 24-hour package for approval. Start only after approval, with its independent supervisor and common T0/T1. The private package currently explicitly says **blocked: REAL_WORKFLOW_CANARY_FAILED**.

No commit or push was requested or performed. Source changes remain in the main repositories on master; unrelated existing edits and private evidence are preserved. E4/KQ1 remain blocked.

## Bounded input-packing follow-up

A later one-turn smoke stopped at `CONTEXT_LIMIT` before inference. Read-only inspection captured 42 real MCP tools (199173 bytes before catalog compaction) and a 31299-byte authorized observation. The original failed observation event exceeded its 8192-byte logging limit, so that event retained a size marker rather than the original packet. Inspection did not resume its failed window or dispatch a model/game command.

The source unconditionally attached coordinator grounding to every PACT session when coordination was enabled. The host therefore subtracted a coordinator-only 4096-byte reserve from the basic architecture, leaving 27904 bytes. The generic PACT packer protected a verbose derived briefing and could exhaust the remaining allowance before retaining a discovered peer. A native-shaped regression reproduced `CONTEXT_LIMIT` at that exact peer-retention check; small normal task-envelope changes exposed its narrow headroom.

The repair adds an optional architecture predicate to grounding, preserving existing behavior for policies without one. PACT coordinator grounding applies only to specialist-coordinator@1. Other architectures keep their original budget and native decision behavior. Construction briefing options and prerequisite rows use the existing reversible fact-table encoding only when smaller; every value remains present. A round-trip test checks the entire briefing, original buildings and a discovered peer. No input limit, model, authority or call allowance was increased.

Observed red-to-green regressions cover both the crowded packet and unrelated-architecture reservation. Sixteen focused unit checks and 20 isolated integrations passed, including the actual scoped host and native guarded coordinator handlers. Types, server compilation, boundaries and changed-file style passed. The full unit run finished with 1049 passed and one failure in the pre-existing concurrent process-stop test (`PROCESS_OWNERSHIP_MISMATCH`); its isolated recheck passed. This remains an unresolved intermittent failure, not a clean full-suite result.

A fresh two-owner instance then executed exactly two real turns using only Nemotron 4B: basic WAIT in 4.392 seconds and coordinator WAIT in 1.905 seconds. Each made one reported call: aggregate 13705 input / 97 output tokens, zero actions, unknown usage or pending commands. No packing error recurred. Both worlds' standing objectives allowed lawful waiting; a WAIT is not a committed game action or completed interaction. No further trial was run. The new world/cohorts are paused and the owned API/rules/provider stopped; an independent final readback verified closed endpoints/processes, zero capacity leases and zero unknowns. The fresh 24-hour baseline and E4/KQ1 remain untouched/blocked.

Private evidence: `/home/mnim/.local/share/pact-fresh-canary-20261025-ab4bc8b3/evidence/two-turn-result.json` and `final-smoke-audit.json`. Source remains uncommitted on master; no push or 24-hour run.
