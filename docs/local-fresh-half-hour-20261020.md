# Fresh world reset and thirty-minute observation —20 October 2026

All four fleet types completed useful construction in a fresh world: **16 upgrades, 30 committed commands, 32 turns and 48 reported model calls**. There were no context-packing, session-collision, truncation or unknown-usage failures. Cooperation and prerequisite planning remain weak; no Hall II or active agreement was achieved. This establishes local operability in this observation, not reliable full-game strategy or an architecture ranking.

## Reset and setup

The founder explicitly requested a complete fresh local reset and a thirty-minute run. Old world `local-four-20261019-ef5d29eb` was encrypted-snapshotted, then its six positively identified native services and two labeled database containers were stopped. Volumes, keys, twelve original kingdoms, **197 turns / 254 reported executions**, closed gates, failures, orders and contracts remain archived. Unrelated local/server populations, model/helper services and their state were untouched.

New private world `local-four-20261020-f1df002c` lives under `~/Library/Application Support/PACT Local Worlds/` (0700; configuration/keys/evidence 0600), with independent PostgreSQL17 volumes and twelve new kingdoms. It now owns game/API 3400/3401, Fleet 8830 and database 5451/5452. Do not start the archived containers on those occupied ports.

Three actors per architecture received matched guardian/merchant/diplomat goals through normal owner APIs. Ordinary gameplay and agent-decided social permissions remained. Old memories, objectives, queues, offers and contracts were not imported. Every kingdom began with seven level-I buildings, founding allowance 200 Iron/100 Silver/80 Grain, zero ordinary stock and no construction/training/social history. Labels A1–D3 use native ordinal+1; roles 1/2/3 are guardian/merchant/diplomat.

The first enrollment hit WORLD_PAUSED. Enabling the fresh clock for founding and reconnecting the same retained entry key resolved it; the world was paused after enrollment. This failure remains recorded, no identity was replaced, and setup made zero inference calls. Prepared verification authenticated 12 accounts/bindings, checked four compatible profiles, model/helper metadata and the disarmed gate with zero turns/calls. New agent/kingdom identifiers were checked disjoint from the archive.

## Window and source

The exact window was **10:55:11.227–11:25:11.227 UTC / 12:55:11.227–13:25:11.227 Berlin**, 1,800,000 ms. The game advanced exactly 30 minutes, tick 0→30. No aggregate model/helper-call, token, action or turn quota or equal-compute limiter applied. Native 15-minute staggered reviews, reactive event wakes, one shared inference slot and per-operation three-call/three-action structure remained. Group call/token/deadline totals stayed null; prelaunch input allowance 48,000 bytes, output 4,096 for A and 2,000 for B/C/D.

All used native Ollama Nemotron 3 Nano 4B, thinking enabled, pinned digest `6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197`. Legacy cognition retained Laya 0.4.6. No source, model, owner goal, mandate or cadence was tuned during the run; gameplay was not scripted. The unused fresh one-hour registration was closed before launch and a unique thirty-minute gate used. Neither registration may be reopened.

Launch Git heads: PACT `055d405` / Fleet `f4aa69c`. Installed application provenance: PACT `fb7a1ba` (documentation baseline `0820771`) / Fleet `df4d0c3`. **All 1,631 installed artifact hashes matched before and after.** This task changed no application code; the previous 729 source checks are prior acceptance, not a fresh rerun for this assignment. Shared-world and native execution differences limit comparative claims.

## Achievements

| Group | Turns | Reported calls | Committed commands | Completed upgrades | Pending orders |
| --- | ---: | ---: | ---: | ---: | ---: |
| A Legacy loop | 6 | 12 | 6 | 4 | 1 |
| B Legacy cognition | 6 | 15 | 7 | 2 | 2 |
| C Reactive basic | 10 | 10 | 9 | 5 | 4 |
| D Reactive cognition | 10 | 11 | 8 | 5 | 3 |

All twelve actors reached a turn. All 16 upgrades were ordered during this run; none was inherited. Native WAIT bookkeeping can include committed actions, while the duplicate-rejected B turn also committed a Farm order. Receipt-level outcomes determine these totals.

- **Legacy loop:** completed A1 Barracks II, A2 Farm II, A3 Farm II/Barracks II. A3 Hall II remains waiting. A3 sent a pending contact request to A1. A1's initial Barracks attempt hit a tick boundary; a later scheduled attempt succeeded.
- **Legacy cognition:** completed B1/B3 Farm II. B1 Hall II remains waiting; B2 Farm II is active. B1 requested contact with A2; B2/B3 opened offers to A2/C2. B2 tried repeating an existing negotiation; the guard prevented duplication, but the choice remains a planning weakness.
- **Reactive basic:** completed C1/C2/C3 Barracks II and C1/C2 Farm II. Three Hall II orders remain waiting; C1 Wall II is active. Completion wakes enabled follow-on work, including C1's Barracks-to-Farm progression.
- **Reactive cognition:** completed D1/D3 Barracks II, D1/D2 Farm II and D2 Mine II. D1 Hall II/Barracks III remain waiting; D3 Farm II is active. Completion-driven follow-on work and economic development occurred.

There were 26 accepted building orders: 16 completed, 3 active and 7 waiting. The other 4 committed commands were two contact requests and two offers. No troop training, scouting or raid occurred. All twelve Halls remain level I.

## Interaction and planning limits

Contact requests **B1→A2** (cross-group) and **A3→A1** (within legacy loop) remain pending. Offers **B2→A2** and **B3→C2** are open and both cross-group. No accepted contact, direct message, active contract or delivered resource resulted. A2 reached another scheduled turn after the initial proposals without committing a response. An open offer is not successful trade.

C1/C2 and D1 completed Farm II/Barracks II, but Hall stock remained inadequate and their Hall orders did not start. Planning was inconsistent: B1 queued Hall II with Barracks still level I; C3 queued Hall II with Farm still level I. Final owned checks showed those missing upgrades affordable and not already busy. Generic owner goals allow strategic discretion; this run does not prove consistent prerequisite solving or resource acquisition. Available input and authority should not be confused with successful reasoning.

## Reliability, usage and cutoff

A had one TICK_PENDING turn; B had one PACT_DUPLICATE_NEGOTIATION turn containing an accepted Farm order. Other turns ended WAIT/COMMITTED. C had ten native WAIT turns containing nine committed orders. D had ten native WAIT turns containing eight committed orders; one already-dispatched response returned 833 ms after cutoff and proposed D3 Hall II. RUN_WINDOW_CLOSED rejected it before game submission, with no game receipt. It is not a ninth committed order.

All 48 model executions were reported: **421,134 input / 28,634 output tokens (449,768 total)**. The 1,920,000 reserved tokens are allocations, not reported consumption. A/B/C/D input/output respectively: 78,234/5,851;110,167/11,040;106,739/5,068;125,994/6,675. B recorded 10 helper requests, 3 legacy interpretations and 15 continuity-update events; D recorded 6 modern continuity updates. Counters do not establish learning quality.

Largest complete serialized requests A/B/C/D: 33,211/35,149/46,555/47,997 bytes, within 48,000. All 48 responses returned without context/session/truncation failure. D's proximity to the envelope means this bounded run is not unlimited-history certification.

The observer saved 60 samples with zero read failures. No turn started at/after the deadline. All 30 committed commands matched independently authenticated original receipts and server rows; none committed late. The gate file closed 1 ms after the deadline; admission checks enforce the timestamp itself. The last in-flight turn finished 886 ms after cutoff without cancellation/replay. Controller completion was 3.189 s after cutoff, separate from the thirty-minute admission period.

Final: **32 turns / 48 reported executions**, twelve ready actors/credentials, zero active turns, pending commands, reserved/unknown allocations or blockers. Cohorts and clock are paused tick 30; worker stopped and PID file removed. Pending game orders, requests, offers and all failure history remain. Final authenticated owned reads checked all 12 goals against enrollment and unchanged mandate actions/social delegation, without sending gameplay commands.

## Recoverability and evidence

Fresh prepared and final verified encrypted archives each restored into disposable network-disabled PostgreSQL clones. Complete rows matched 10 core PACT / 39 Fleet tables; clones were removed. Final archive creation followed authenticated receipt/owner readbacks. Credentials, dumps, keys, packets, raw model evidence and runtime controllers remain outside Git.

Private evidence in this new root includes prepared-verification.json, half-hour-installation.json, fresh-reset-assignment.json, half-hour-fresh-20261020-{provenance,baseline,cutoff,final,completed,achievement-proof}.json, 60 observation lines, final detail/metrics, encrypted owned observations, fresh-final-owned-acceptance.json, fresh-extra-proof.json and restore-verification.json for fresh-final-verified. Commands included repository prepare/boot/enrollment/park, verify-prepared.mjs, private run-half-hour.mjs half-hour-fresh-20261020, receipt/owned verification, control.mjs snapshot and restore-check.mjs. Documentation validation and local commits complete this assignment; no hosted CI, push or server deployment is claimed.

This completed founder-authorized operational assignment is not a new roadmap ticket or authority for another run. Preserve the new parked world and the old stopped archive.
