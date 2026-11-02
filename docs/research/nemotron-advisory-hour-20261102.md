# One-hour Nemotron advisory launch — 2 November 2026

**The hour did not complete. The first native turn was refused before any model call, and execution stopped safely.** The retained model request reconstructs to **33,143 bytes**, exceeding the unchanged **24,000-byte input limit**. PACT is paused at tick 0; the provider, Fleet task worker and owned rules worker are stopped. No gameplay commands or model allocations were created.

The earlier readiness assessment was incomplete: it verified a small synthetic JSON/usage call, installation, isolation and recovery, but did not verify the full PACT recipe request against its byte budget. This launch exposes that missing end-to-end packet-fit check. It establishes no Nemotron decision-quality result.

[Machine-readable result](nemotron-advisory-hour-20261102.json), [authorized plan](../superpowers/plans/2026-11-02-nemotron-advisory-hour.md), [authenticated actual-run timeline](http://127.0.0.1:64366/#research/run/task%3A97e7a26b-497d-4f24-9a8c-176764c33dda).

## Scope and actual result

The current instruction authorized the previously proposed advisory experiment for one hour. The single participant retained the two-call / 80,000-token ceiling, concurrency one, non-thinking Nemotron 4B, 512 maximum output and 32,768-token model context. Its PACT mandate permits `world.read` and `inbox.read`, with zero spending/troop allowance. It cannot perform gameplay commands. A 60-minute cadence was selected for this small observation experiment; the call ceiling is an upper bound, not a promised sample count.

The recorded window was **10:58:31–11:58:31 Berlin** (09:58:31–10:58:31 UTC). The original absolute end was never extended. Actual native execution occurred at **11:02:23.533–11:02:23.867 Berlin**, then the controller closed at 11:02:24.559. This is an early-stopped integration attempt, not an hour of agent activity.

| Measurement | Actual result |
| --- | --- |
| Native turns | 1, `finished` with `MODEL_REQUEST_NOT_ADMITTED` |
| Model calls / allocations / unknown allocations | 0 / 0 / 0 |
| Gameplay commands / committed ticks | 0 / 0 |
| PACT identities | One freshly prepared advisory owner/kingdom; preserved |
| Captured evidence | 24 events, 22 artifact references, 453,013 bytes; no missing native units |
| Final world | Paused at tick 0 |
| Active turns / capacity leases / worker sessions | 0 / 0 / 0 |
| Execution processes | Provider, rules worker and Fleet Temporal task worker stopped |
| Task ownership | Explicit Temporal enrollment and real native dispatch observed |
| Retained task phase | `awaiting_reconciliation`; preserved without manual completion or replay |

The parked Temporal workflow history remains retained with server status `RUNNING`; no polling worker is executing it. All three invocation admission latches remain permanently closed. The experiment was not resumed after its native refusal, and no remaining allowance is treated as authority for another trial.

## Exact blocker

Deterministic reconstruction uses the retained delivered observation and the unchanged candidate's reference-worker request builder:

- Observation JSON: **28,645 bytes**.
- System instructions: **1,071 bytes**.
- Output schema: **525 bytes**.
- Canonical complete request, including serialized messages and protocol fields: **33,143 bytes**.
- Effective input limit: **24,000 bytes**, exceeded by **9,143 bytes**.
- Requested and allowed output: **512 tokens** each.

The research broker rejects this oversized request before creating a model step/allocation or calling the provider. Both the cohort budget and sealed manifest specify the same 24,000-byte limit. The model's token-context window is a separate bound. No limit, validation, consent rule, archival requirement or qualification gate was relaxed.

Native coverage is complete for captured effects and source observations. The rejected request did not reach dispatch capture; its size is reconstructed rather than represented as a transmitted request. Full authorized source responses and delivered observation remain encrypted and recoverable. Coverage completeness does not establish successful model admission or correctness.

## Setup corrections and stop verification

Two operator-controller startup refusals preceded the native attempt. First, the command census queried a nonexistent `platform_commands.cohort_id`; it was corrected to join the authoritative turns table, and all monitor queries were executed read-only against the owned target. Second, the startup grace used the nominal start rather than actual activation and closed immediately after a delayed start; its origin was corrected. Both invocations had **zero native turns, allocations, operations and workflows**. Their records and closed latches remain retained. Continuing setup used distinct admission files under the same current assignment and original end time; no agent execution was replayed.

The isolated process home also lacked the user's Docker context; post-stop backup commands were corrected to use an explicit Docker binary and socket. Prepared-state backups and the final snapshot/restore checks subsequently passed. These operator issues are separate from the actual recipe's oversized-request refusal. No production/runtime source or dependency lock changed.

Thirty-five existing run-window/supervisor/canary checks passed. Independent watchdog checks covered hard end, lost heartbeat and clock disagreement; the native supervisor's synthetic checks covered hard end, unknown usage and unhealthy services. The actual refusal exercised safe closure: admission fenced, owned world paused, execution/provider processes stopped and evidence retained.

## Recovery and visibility

Fresh post-stop snapshots were exported transactionally and encrypted. Four separately owned restores matched **327 public-table projections**: Fleet 117, PACT 167, Temporal 40 and visibility 3. The copied state tree matched three file hashes / 705,319 stored bytes. Native restored artifact reads verified all **22 references / 453,013 plaintext bytes**, with complete coverage and no integrity failure.

The actual failed-turn timeline and causal graph render through authenticated inspection without browser errors. The durable workflow/task references remain available for investigation; they were not relabeled successful or cleared. The private ledger is `.superpowers/sdd/2026-11-02-nemotron-hour/`, containing exact configurations, encrypted backups, captured evidence outlines, stop records, screenshots and commands. Private credentials, raw observations and decrypted traces are excluded from Git.

All **67 original container configurations/mounts and 115 original volume definitions** still match their baseline; the three original running services remain healthy. No retained-world database was accessed, uncertainty reviewed, original service restarted, volume deleted or push performed.

## Required repair before another trial

The recipe needs bounded model-context construction with explicit source lineage, keeping the full raw observation archive and the 24,000-byte final-input validation. Add an actual-shaped PACT observation regression that verifies the complete generated request fits before provider admission, including instructions, output schema and serialization overhead. The prerequisite check must cover this real packet shape rather than only a small acknowledgment prompt.

That repair and successor validation are not implemented or authorized as another live trial by this closed attempt. Its consumed task/configuration stays preserved. A fresh finite activation record is required after repair; do not retry the whole agent, reuse its allowance, increase the cap or bypass the refusal. The separately owner-accepted 16.29% recording-overhead result and historical E4/KQ1 status are unchanged.
