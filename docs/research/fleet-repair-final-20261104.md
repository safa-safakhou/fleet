# Fleet repair and two-cycle validation — 4 November 2026

The resumed repair work is complete for the tested configuration. Two fresh worlds each completed all 16 kingdoms and 18 initial native tasks: 54 reported model calls, eight PACT-confirmed effects, zero new unknown usage/model errors/admission deferrals. Both worlds are paused at tick 6; their controller, rules, provider, guard, watchdog and awake processes are stopped. Original services and retained history remain protected.

[Exact results and per-kingdom evidence](fleet-repair-validation-20261103.json) · [Repair plan](../superpowers/plans/2026-11-03-fleet-repair-and-validation.md)

## Actual results

| Measurement | Cycle 12 | Cycle 13 |
|---|---:|---:|
| Initial native tasks | 18 | 18 |
| Actual cycle duration (seconds) | 392.99 | 389.73 |
| Reported calls | 27 | 27 |
| Native input tokens | 193174 | 191625 |
| Native output tokens | 5282 | 5562 |
| PACT COMMITTED receipts | 4 | 4 |
| New unknowns / model errors / admission deferrals | 0 / 0 / 0 | 0 / 0 / 0 |
| Independent database restores | 4 | 4 |
| Verified artifact references | 7629 | 7902 |
| Logical queue p50 / p95 (seconds) | 185.18 / 371.45 | 171.01 / 367.18 |
| Native turn p50 / p95 (seconds) | 29.60 / 59.74 | 28.70 / 64.12 |
| Verified turn waves | 11 | 10 |

All 54 calls match authenticated native terminal records and reported ledger measurements. All eight commands match authoritative PACT COMMITTED receipts. All 36 research scopes have complete coverage and research provenance; no compatibility capture or failed scope was hidden. No new binding started before the preceding wave finished, and both coordinator turns in each cycle ran alone. No native capacity leases, running turns or active worker sessions remain.

Four database restores per world match canonical table fingerprints, with exact state/artifact hash checks. Each observer chain verifies 216 encrypted pages with consent/retention/scope integrity. Actual timeline/context/causal rendering passes on inspected scopes: 519 events/two allocations in cycle 12 and 849 events/three allocations in cycle 13, with zero browser errors. This is representative actual rendering; full stored coverage is checked separately across all 36 scopes. All 75 existing container configurations and 121 volume definitions match and three original services are healthy.

## Each kingdom

Values are cycle 12 / cycle 13. Each listed name represents a distinct kingdom in each fresh world. Effects are PACT-confirmed; WAIT is a valid native outcome. Autonomous kingdoms have two initial charter tasks each.

| Kingdom | Calls | Effects | Native finish | Longest logical queue (seconds) |
|---|---:|---:|---|---:|
| `legacy-loop-1-1` | 3 / 3 | 1 / 1 | TURN_ACTION_LIMIT / TURN_ACTION_LIMIT | 131.13 / 59.18 |
| `legacy-loop-1-2` | 2 / 2 | 1 / 1 | TURN_ACTION_LIMIT / TURN_ACTION_LIMIT | 60.21 / 237.33 |
| `legacy-cognition-1-1` | 1 / 1 | 0 / 0 | WAIT / WAIT | 236.41 / 339.02 |
| `legacy-cognition-1-2` | 1 / 1 | 0 / 0 | WAIT / WAIT | 185.18 / 0.34 |
| `reactive-basic-1-1` | 1 / 1 | 0 / 0 | WAIT / WAIT | 60.21 / 0.34 |
| `reactive-basic-1-2` | 1 / 1 | 0 / 0 | WAIT / WAIT | 131.13 / 171.01 |
| `reactive-cognition-1-1` | 1 / 1 | 0 / 0 | WAIT / WAIT | 101.52 / 111.59 |
| `reactive-cognition-1-2` | 1 / 1 | 0 / 0 | WAIT / WAIT | 258.57 / 32.18 |
| `reactive-cognition-2-1` | 3 / 3 | 0 / 0 | WAIT / WAIT | 293.66 / 237.33 |
| `reactive-cognition-2-2` | 3 / 3 | 0 / 0 | WAIT / WAIT | 0.46 / 111.59 |
| `reactive-cognition-1.1-1` | 1 / 1 | 0 / 0 | WAIT / WAIT | 0.46 / 339.02 |
| `reactive-cognition-1.1-2` | 1 / 1 | 0 / 0 | WAIT / WAIT | 258.57 / 59.18 |
| `specialist-coordinator-1-1` | 2 / 2 | 1 / 1 | WAIT / WAIT | 334.90 / 301.46 |
| `specialist-coordinator-1-2` | 2 / 2 | 1 / 1 | WAIT / WAIT | 198.94 / 199.72 |
| `autonomous-specialists-1-1` | 2 / 2 | 0 / 0 | WAIT ×2 / WAIT ×2 | 371.45 / 367.18 |
| `autonomous-specialists-1-2` | 2 / 2 | 0 / 0 | WAIT ×2 / WAIT ×2 | 371.45 / 367.18 |

## Repair and source validation

The interrupted zero-token cancellation lost its finish choice in the pinned upstream SSE generator. Commit `d7b0418` observes the exact native finished output before that filter, then pairs it with exact native final usage. Missing, foreign, conflicting or incomplete facts still remain unknown. It forwards normal packets unchanged and closes the underlying native iterator on consumer cancellation. The original one-second accounting grace and every authority, consent, recording, integrity, validation and usage guard remain intact.

Verification: 1,313 root units/23 platform skips, 12 CPU-only native/ASGI cases, 32 focused transport/model checks and four owned abort-accounting integrations pass; types/style/build/boundaries/generated contracts pass with the baseline 405 warnings/83 informational messages. The successful real cycles contain native stop finishes; zero-token abort/stop and adverse terminal cases were reproduced synthetically rather than deliberately forced during these game cycles.

Prelaunch found isolated Temporal at 690.62 MiB against the unchanged 650 MiB drain threshold. Two encrypted, round-trip-verified native snapshots preceded a restart of only that research server, with unchanged 768 MiB container/600 MiB Go limits. Its later trials stayed below the threshold. Preparation 11 then refused its 15-second snapshot timeout with zero turns/calls; it remains closed with 18 undispatched tasks and four verified restores. Future operators use a bounded 60-second snapshot subprocess deadline, matching the restore verifier. No consumed task was retimed or reused.

Cycles 12/13 retain concurrency 2, an exclusive coordinator lane, 2,048 prefill tokens/250 ms waves, 35-second call deadlines within 120-second turns, 48,000 input bytes/1,024 output tokens/32,768 context, and explicit 6 GiB cache backing/max 8 sequences. Measured cache attestation is 400 admission blocks/40 per full context/5.99 GiB. Runtime source/build/dependency/operator/model bytes match between cycles; git-archive commit provenance differs and both original hashes are retained. Actual source commits are `acc9259` and `fa8a72e`, both including the same runtime repair.

## Remaining limits

- This accepts two initial task cycles lasting about 6.5 minutes each inside separate 15-minute windows. It does not qualify continuous operation, a full hour, higher concurrency or all architecture phases.
- Logical queue p95 is about 6.1–6.2 minutes. This setup is not qualified for time-critical game events. Coordinator calls remain exclusive; higher-capacity experiments need separate measured phase coverage.
- These results validate native execution, accounting and evidence for observed decisions. They do not establish strategic quality, universal model/game correctness, or unexercised social/read/correction variants.
- Six older unknown holds retain 240,000 reserved tokens/null measurements. Interrupted run 10 retains its additional 40,000-token/null hold, rechecked after both fresh cycles. No refund, clearance or historical outcome rewrite occurred.
- Current-work total consumption is 205 calls/8,200,000 reserved tokens, including that unknown hold, within the original 384-call/15,360,000-reservation ceiling.
- Historical accepted Q3 latency overhead remains 16.29%, still failing its unchanged 10% criterion. No performance acceptance gate was relaxed.

No push. The previous retry automation remains deleted; no further live round is launched by this completion record.
