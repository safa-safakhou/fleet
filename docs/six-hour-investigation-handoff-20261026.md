# Six-hour run: investigation handoff

This is the starting point for continuing the investigation in another chat or checkout. Findings come from the read-only inspection on **26 October 2026 at 08:51 UTC**. No new live inspection, game execution, model calls or deployment was performed to prepare this handoff.

## Outcome and retained state

The 24-kingdom world ran **02:31:04–08:31:04 Berlin** across all eight architectures. The window closed on its deadline. Last verified state: **world paused at tick 359**, runtime services and model provider stopped, zero running turns, capacity leases or pending/unknown game commands. Database storage and private evidence are retained.

This completed the requested observation window, but did **not** establish behavioral or reliability acceptance. E4/KQ1 remain blocked. Preserve exact identities, budgets, commands, schedules, queues and unknown usage; do not reopen the expired window or replay uncertain work.

## Results

| Measure | Observed result |
|---|---|
| Participants | All 24 kingdoms; eight architectures, three kingdoms each |
| Turn attempts / committed action effects | 2,430 / 207 |
| Model allocations | 3,071: 3,062 reported, nine unknown |
| Known tokens | 30,825,802 input + 3,480,102 output = 34,305,904 |
| Unknown reservations | Nine × 40,000 = 360,000 reserved tokens; actual usage remains unknown |
| Construction | 52 upgrades completed; 24 instructions waiting; all Halls remain level 1 |
| Communication | 55 messages; three accepted contact pairs; eight pending introductions |
| Supply contracts | Four active, one defaulted |

The model was Nemotron 4B with thinking enabled, an 8,192-token output allowance, 64,000-byte logical input limit and 32,768-token provider context. Four concurrent requests were observed during startup; capacity admission also considers token and physical cache demand.

| Architecture | Turn attempts | Committed actions |
|---|---:|---:|
| Legacy loop | 72 | 5 |
| Legacy cognition | 72 | 0 |
| Reactive basic | 288 | 37 |
| Reactive cognition v1 | 239 | 30 |
| Reactive cognition v1.1 | 118 | 21 |
| Reactive cognition v2 | 77 | 19 |
| Specialist coordinator | 184 | 1 |
| Autonomous specialists | 1,380 | 94 |

Turn attempts and calls are different denominators. WAIT can follow a committed action. These counts must not be treated as a model accuracy score or proof that a message/contract delivered value.

## Findings and investigation entry points

The following are observed symptoms and open questions, **not established root causes or implemented fixes**.

| Finding | Evidence | Source entry points and question |
|---|---|---|
| Autonomous context/read failures repeat | 435 `SPECIALIST_CONTEXT_INCOMPLETE`; 317 `SKILL_SELECTION_REQUIRES_READ` | [Engine](../src/engines/autonomous-specialists/engine.ts), [memory](../src/engines/autonomous-specialists/memory.ts). Identify the missing/oversized required evidence and whether a deferred task resumes with enough state to satisfy the next read/selection requirement. |
| Coordinators make little progress | 172 `STALE_PROPOSAL`; one action in 184 attempts | [Coordinator](../src/engines/specialists/coordinator.ts), [proposal checks](../src/engines/specialists/proposals.ts). Compare each proposal's observation revision, expiry and correction round with the native state at validation. Do not weaken stale-state guards to inflate success. |
| Wait claims are rejected | 46 `PACT_WAIT_STATE_MISMATCH`; 37 `MODEL_WAIT_REJECTED` | [Game-state validation](../src/games/pact/goal-state.ts), [host services](../src/app/host-services.ts). Compare the actual request/response with the authorized state and available legal actions at that time. |
| Work expires with unresolved usage | Nine kingdoms held `WORKER_EXPIRED`, one unknown allocation each | [Store expiry handling](../src/store.ts), [model admission](../src/platform/admission.ts), [task host](../src/platform/supervisor.ts), [worker](../src/worker.ts). Reconstruct claim/deadline, queue admission, dispatch, heartbeat, final provider response and settlement timing. The exact expiry causes remain unestablished. |
| Higher-tier development stalls | All Halls level 1 despite 52 completed upgrades and 24 waiting instructions | [Prerequisite/action reasoning](../src/games/pact/goal-state.ts), [native workflow tests](../tests/integration/native-pact-workflows.test.ts). Inspect actual queued dependencies, ordinary resources and model choices; aggregate counts cannot distinguish planning failure from a legal blocker. |
| Output truncation still occurs | 107 allocation responses record truncation; seven terminal turn outcomes are `MODEL_OUTPUT_TRUNCATED` | [Model adapter](../src/model.ts), [stream reader](../src/vllm-transport.ts), [recovery](../src/model-recovery.ts). Separate intermediate corrected answers from terminal failures and compare reasoning/final output consumption. |
| Primary shutdown bookkeeping fails | `SUPERVISOR_FAILED_CLOSED`; record remains `draining`; `evidence/run-final.json` missing | [Controller](../scripts/control-real-pact.ts), [guardian](../scripts/local-run-guardian.py), [finalization helpers](../scripts/lib/run-control-io.ts). Identify the original exception and ordering of concurrent park/finalize operations. The retained primary log only exposes the generic failure. |

The independent guardian completed deadline shutdown and final encrypted restore matched **167 PACT / 77 Fleet tables**. Do not rewrite the stale primary record to imply a clean primary shutdown.

Held kingdoms are **C2, D1, E1, E2, E3, F2, F3, H1 and H2**. The first unknown allocation was created at **02:15:24.749 UTC**, about 44 minutes after startup; later allocation creation extends through 07:30:59.813 UTC. Allocation creation is not the timestamp at which its usage became unknown. These nine cases cannot all be attributed to final shutdown. The preceding archived world has **five separate old unknowns**; do not conflate the two worlds or clear either set.

## Evidence and reproducibility

- [Full aggregate inspection and exact outcome counts](six-hour-run-inspection-20261026.md).
- [Launch setup and early observations](fresh-six-hour-run-20261026.md). Early zero-error counts are historical, not the six-hour outcome.
- Published source checkpoints: Fleet `4295adadb5a6666fe5abf03b385f52c4b0be0a69`; PACT `4df9ff6cda272333fd4802961acfe11aca85eaa5`.
- The live worker/console used the private staged release described by `deployment.json` and its `manifest.json`. Fleet's published checkpoint also contains a **post-run, source-only evidence-validation-order correction**; it was not deployed into this run and does not fix the live symptoms above. Verify staged hashes before reconstructing the exact live runtime.
- Private WSL root: `/home/mnim/.local/share/pact-fresh-canary-20261026-523b92de`; pointer `/tmp/pact-six-hour-root`.
- Aggregate evidence: `evidence/morning-readout.json`, `evidence/independent-observer.ndjson`, `evidence/metrics-observer.ndjson`.
- Shutdown/recovery evidence: `window.json`, `supervisor.json`, `logs/supervisor.log`, `logs/guardian-park.log`, `evidence/guardian-final.json`, `evidence/finalization-complete.json`, `evidence/final-restore.json`, encrypted final dumps.

**Git contains aggregate findings and reproducible source/tests, not the private world.** Another checkout/machine will not contain the databases, detailed traces, message bodies, keys or dumps. Obtain authorized private access to the retained evidence when exact live reconstruction is needed; do not put that material in Git. Begin offline reproduction with synthetic fixtures.

## Existing verification and limits

Fleet: 1,088 unit checks and 203 distinct selected integration checks, including the focused rerun after the evidence-diagnostic correction; types, build, boundary and CPU guardian/cache checks passed. PACT: three metadata unit checks and four native interface integration checks, types, MCP build, boundaries and published-contract checks passed. Full details and warnings are in the inspection report.

The broad historical Fleet integration suite was interrupted and is **not certified passing**. Selected tests used disposable owned databases and fake providers. Passing offline workflows does not resolve the observed live failures. Further live runs, changes to retained state or uncertainty review need a current covering instruction; this handoff only publishes findings.
