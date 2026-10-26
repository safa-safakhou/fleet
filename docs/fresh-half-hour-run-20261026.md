# Fresh 24-kingdom half-hour run — 26–27 October 2026

The owner authorized publication, deployment and a 30-minute Nemotron 4B run, then explicitly chose a **separate fresh world**. The run completed its bounded window and is now **paused**. It demonstrated real construction and agreements, but is **not an all-scenarios behavioral pass**.

## Publication and deployment

- PACT investigation/handoff documentation: `93876c4`, pushed to `master`.
- Fleet reliability and research fields: `db80342`; explicit fresh half-hour launch support: `0d898b0`, both pushed to `master` before deployment.
- Deployed Fleet build is staged privately with source/artifact hashes at `/home/mnim/.local/share/pact-fresh-canary-20261026-6cb1c48d/deployments/release`; PACT packages, API, rules and notification workers were built from the current main repository.
- Prepublication checks: 1,110 unit tests; TypeScript/style, build and boundary checks. Half-hour launch/supervisor checks: 21 tests and TypeScript/style passed. Prior native offline coverage is detailed in [the implementation report](agent-society-reliability-20261026.md).
- Fresh baseline encrypted backup/restore compared 167 PACT and 77 Fleet tables. Eleven pinned Nemotron files were verified by size and SHA-256. The fresh 301-sample, five-minute Windows-referenced clock check passed without changing clocks.
- The deployed authenticated metrics endpoint returned HTTP 200 and exposed the new request allocation, timing, task-attempt, availability and communication fields. No GUI was used.

## Scope and actual duration

World: `pact-fresh-canary-20261026-6cb1c48d`. Three new kingdoms for each of eight architectures, 24 total. The old world `pact-fresh-canary-20261026-523b92de`, its terminal cohorts, nine unresolved usage allocations and private evidence were retained. No old allocation was cleared or replayed.

Admission window: **2026-10-26T22:35:46.097+00:00 → 2026-10-26T23:05:46.097+00:00**, equivalent to 23:35:46–00:05:46 Berlin. Admission actually closed after 1800.357 seconds with `HOST_DEADLINE`. Native world tick at pause: **29**. In-flight work was allowed the existing bounded drain; the window was not extended.

Nemotron 4B only: `nvidia/NVIDIA-Nemotron-3-Nano-4B-BF16`, revision `dfaf35de3e30f1867dd8dbc38a7fc9fb52d3914f`; vLLM, thinking enabled, 8,192 maximum output tokens, 64,000-byte input allowance, 32,768-token model context. Fleet concurrency 8; provider sequence limit 4 with live cache-aware admission. Scheduled review is 15 minutes; event-driven and specialist work can run between reviews. No forced messages or optimal-play policy was introduced. E4/KQ1 remained blocked. Work was inline.

## Outcomes

- **216 attempts, 250 model allocations/calls, 68 confirmed actions.** Usage states: 250 reported.
- **32 completed upgrades**, 7 active and 11 waiting construction instructions at pause. These are native PACT records, not narrated intentions.
- **1 accepted contact pair(s), 3 native agent messages, 0 reciprocal message pairs.** Native supply contracts: 1 active, 2 defaulted. The two observed contract defaults were `insufficient_stock`, including partial installments. Strategic quality is not inferred from message counts or action volume.
- **14 terminal rejection/error outcomes**, shown below. `WAIT` may follow an action; only the dedicated no-effect column below represents an action-free wait.

| Architecture | Kingdoms attempted | Attempts | Actions | Finished WAIT without effects |
|---|---:|---:|---:|---:|
| autonomous-specialists@1 | 3/3 | 116 | 15 | 90 |
| legacy-cognition@1 | 3/3 | 6 | 0 | 6 |
| legacy-loop@1 | 3/3 | 6 | 3 | 0 |
| reactive-basic@1 | 3/3 | 44 | 19 | 25 |
| reactive-cognition@1 | 3/3 | 12 | 10 | 2 |
| reactive-cognition@1.1 | 3/3 | 10 | 7 | 3 |
| reactive-cognition@2 | 3/3 | 11 | 9 | 2 |
| specialist-coordinator@1 | 3/3 | 11 | 5 | 4 |

The supervisor's coarse `failed` counter is 18 because it includes four `READ` continuation outcomes; the rejection/error total above is 14 and excludes those reads. All 24 cohorts finished at the deadline with agents and credentials still ready; this is a closed run, not a resumable open window.

Totals are not a ranking: architectures have different triggers and numbers of opportunities in this short window. Distinct-task accounting: `{"attempts_with_effects": 68, "distinct_tasks": 173, "legacy_attempts": 0, "task_attempts": 216, "waits_without_effects": 132}`.

## Remaining observed failures

| Architecture | Terminal code | Count |
|---|---|---:|
| autonomous-specialists@1 | `INVALID_MODEL_OUTPUT` | 1 |
| autonomous-specialists@1 | `PACT_DUPLICATE_NEGOTIATION` | 1 |
| autonomous-specialists@1 | `PACT_TRADE_PERSPECTIVE_MISMATCH` | 1 |
| autonomous-specialists@1 | `RESOURCE_CLAIM_CONFLICT` | 7 |
| autonomous-specialists@1 | `UNDISPATCHED_EVIDENCE_REFERENCE` | 1 |
| legacy-loop@1 | `EXPIRED` | 1 |
| specialist-coordinator@1 | `COORDINATION_EVIDENCE_UNAVAILABLE` | 2 |

Resource-claim conflicts are rejected when requested/pending resource claims exceed available capacity. Undispatched references cite evidence not delivered to that specialist. Duplicate-negotiation and trade-perspective checks protect negotiation consistency. The coordinator evidence check requires retained old/current observations and proposal references matching the old observation; the code alone does not distinguish missing retained state from an incorrect reference. `EXPIRED` is a validity rejection and is not, by itself, proof of a model timeout. These require follow-up analysis; this run did not change policy or bypass guards to make them pass.

There were **6 output-truncated calls**. They are separate from terminal turn codes and can occur inside a turn that subsequently finishes. The observed terminal `INVALID_MODEL_OUTPUT` had a normal `stop` finish, 863 output tokens and nonempty final text; it was not caused by the 8,192-token cutoff. The early live update connecting invalid output to truncation was too broad and is corrected here. Full semantic cause was not established during this observation.

## Context and capacity

| Architecture | Calls | Max request-byte use | Max prompt + output reservation / model context | Mean admission queue ms | Mean generation ms | Truncated calls |
|---|---:|---:|---:|---:|---:|---:|
| autonomous-specialists@1 | 123 | 99.87% | 80.60% | 11209 | 18308 | 5 |
| legacy-cognition@1 | 6 | 40.40% | 43.90% | 7105 | 15978 | 0 |
| legacy-loop@1 | 15 | 47.00% | 43.78% | 12001 | 9153 | 0 |
| reactive-basic@1 | 50 | 97.12% | 75.17% | 11349 | 20894 | 1 |
| reactive-cognition@1 | 12 | 99.36% | 76.93% | 19613 | 15026 | 0 |
| reactive-cognition@1.1 | 12 | 99.98% | 74.80% | 15428 | 21867 | 0 |
| reactive-cognition@2 | 11 | 64.08% | 56.16% | 16720 | 17264 | 0 |
| specialist-coordinator@1 | 21 | 50.92% | 58.33% | 15662 | 21788 | 0 |

The authenticated metrics API reported zero ingested messages near the end, while native PACT recorded three messages. Its communication field covers consented messages actually ingested into Fleet, not every native message; ingestion did not provide complete communication coverage in this run. Native counts above remain authoritative for observed game activity. This coverage gap remains open.

Request bytes include messages plus output schema and are different from provider-reported prompt tokens. The token column reserves the configured output allowance; it does not mean the model consumed that entire allowance. Near-full byte budgets remain a limitation even when model context has token headroom. Missing metadata is not evidence that nothing was omitted.

Observed maximum provider concurrency: **4**. Maximum provider waiting queue: **3**; cache preemptions: **0**. Peak sampled total GPU memory: **14202 MiB** (includes other GPU users); minimum sampled available WSL RAM: **7.46 GiB**. Fleet admission waiting is measured separately from vLLM's waiting queue. These are this machine's measured results for this workload, not a guarantee for arbitrary event bursts or long-run social behavior.

## Shutdown and retained evidence

Final clock is paused; in-flight turns **0**, unknown usage **0**, pending/unknown platform commands **0**. Capacity states: `[]`. Drain timeout: **False**. Owned worker, rules, event publisher, API, console and provider are stopped; private databases/evidence remain retained. Final encrypted restore verification: `{"fleet": 77, "pact": 167}`.

Private evidence root: `/home/mnim/.local/share/pact-fresh-canary-20261026-6cb1c48d`. Key files: `deployment.json`, `clock-control.json`, `window.json`, `evidence/observer.ndjson`, `evidence/aggregate-*.json`, `evidence/live-metrics-endpoint.json`, `evidence/run-final.json`, `evidence/finalization-complete.json`, encrypted snapshots and restore proofs. Credentials, decrypted content, raw model/peer text and database dumps are not committed.

This is evidence that all eight architectures can participate in a fresh bounded run on this machine. It does not show every response was correct, all strategies were effective, or that long-run coordination is solved. The next assignment should investigate the remaining concrete rejection paths and output exhaustion without treating imperfect legal strategies as implementation bugs.
