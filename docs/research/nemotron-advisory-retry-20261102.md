# Nemotron advisory retry — 2 November 2026

**The request-size repair worked in a real Nemotron call; the retry then stopped early on an unsupported model-selected tool. The hour did not complete.** Fresh world `fleet-retry-20261102-8986da6d` and fresh task `0b8d4e04-1fea-4149-a52f-d6f782628a89` use repaired source `d7006f2e92d978d0dcb040f8578264ef0dc7f7db`. The owner explicitly requested fixing the issues and retrying. The previous failed attempt, its closed latches and reconciliation state remain unchanged.

The sealed one-hour observation window was **2026-11-02T11:05:09.641Z–2026-11-02T12:05:09.641Z**. Nemotron `nemotron-3-nano:4b` remains non-thinking, with two calls / 80,000 reserved tokens at most, concurrency one, 512 output tokens, 32,768-token provider context and **24,000 final request bytes**. One participant has a 60-minute cadence and a one-step advisory recipe; the ceiling does not promise two calls. PACT authority permits world/inbox reads and zero spending/troops; gameplay commands remain forbidden.

The earlier native model-budget deadline **2026-11-02T12:03:08.000Z** remains immutable and stricter than the observation-window end. A manifest-hash format refusal during sealing created no native turn, allocation or workflow. Its unclaimed preparation task was completed through normal enrollment; no executed task was replayed, allowance extended or old failed task changed.

## Actual result and remaining blocker

| Measurement | Actual result |
| --- | --- |
| Native execution | 11:05:16.551–11:05:37.074 UTC; one turn |
| Final turn code | `TOOL_UNSUPPORTED` |
| Real model calls / allocations | 1 / 1, reported and settled |
| Measured input / output tokens | 5,013 / 506 |
| Provider / end-to-end latency | 19,766 / 19,799 ms |
| Final canonical request | **19,709 / 24,000 bytes**; linked context lineage |
| Native message + schema accounting | 19,643 bytes; excludes the 66-byte request envelope |
| Unknown usage / gameplay commands / ticks | **0 / 0 / 0** |
| Closure | 11:05:37.864 UTC; world paused |
| Evidence | **59 events, 55 artifact references, 889,467 recoverable bytes**; complete coverage |

Nemotron returned a schema-valid **read** proposal for **`pact_observer_guide_v1`**. The manifest and prompt allowed only `pact_agent_guide_v1`, `pact_world_read_v1` and `pact_inbox_read_v1`. The broker refused the invented tool before dispatching that read, and the controller correctly stopped on the native failure. The response also supplied source references and a clock identifier that did not match the delivered frame; these were never accepted as valid evidence or authority. The first enforced refusal was tool membership. This is an observed model-output failure, not another byte-limit or controller startup failure; its internal reason for choosing those strings cannot be established from the trace.

The recipe still uses a generic decision/read prompt and unrestricted read-tool string schema, while advisory authority and tools are enforced server-side. Stronger role/terminal-decision guidance and allowed-tool output constraints are the next research/runtime work to evaluate before another independently recorded trial. This attempt establishes successful bounded dispatch, usage settlement, preservation and refusal; **it establishes no successful advisory result or hour-long behavioral acceptance**. No second whole-agent attempt was launched, and the parked task remains `awaiting_reconciliation` with `stop_id = null`.

Controller, provider, rules worker, watchdog and keep-awake processes are verified stopped; there are no running turns, capacity leases or active worker sessions. The admission latch is permanently closed. The follow-up heartbeat was paused after closure. The read-only viewer and owned databases remain available for inspection.

Four new post-stop snapshot restores match **327 table projections**: Fleet 117, PACT 167, Temporal 40 and visibility 3. A 36-file / 1,482,848-byte encrypted state tree matches; all 55 restored artifact references and 889,467 plaintext bytes pass native integrity reads. The prior failed world is still paused at tick 0, with its original one failed turn, zero allocations and unchanged reconciliation state; its three admission latches remain closed. All original 67 container configurations and 115 volume definitions still match, with three services healthy.

## Repair and preflight

The broker derives a bounded view only from an exact authorized observation using PACT's domain packer. Owner text and non-observation messages remain mandatory. Full raw frames, derived views, exact request and coverage/source lineage remain encrypted and linked. Protected core, byte/output/token caps, stale-input checks, consent/evidence failure refusal and downstream dispatch validation remain enforced. General compression stays disabled; the domain view is explicitly labeled `environment-view@1`.

The old failing packet fits offline at **19,698 / 24,000 bytes**, versus 33,143 before derivation. This fresh world's actual authorized packet fits at **19709 / 24,000 bytes**, versus 33165 raw. Neither measurement called a model. Native optional object fields now follow their established JSON wire representation; unsupported array values and non-finite facts still refuse.

Verification: **1,264 units / 23 platform skips**, **31 owned integrations**, then **14 focused units / seven owned integrations** after the native optional-field edge case; types, style, build, ownership boundaries and generated contracts pass. Colima automatic test forwarding failed; final tests used a disposable nonce-owned fixture and dedicated SSH tunnel. Original infrastructure was not restarted. Two existing report JSON formatting errors were normalized without changing data.

The new controller successfully used tested command census joins, actual-activation startup grace and an explicit local Docker endpoint. Hard end, clock disagreement, heartbeat, unknown usage, failed native turns, capture failures, command attempts, owned service exits and the existing 10 GiB host reserve all stop execution. An independent watchdog closes admission and pauses the owned world if the controller disappears. Four encrypted prepared-state database backups and role privilege checks pass. Original **67 container configurations / 115 volume definitions** match, with three original services healthy.

## Observation and acceptance

[Read-only authenticated viewer](http://127.0.0.1:57468/#research/run/task%3A0b8d4e04-1fea-4149-a52f-d6f782628a89), [machine-readable record](nemotron-advisory-retry-20261102.json), [repair plan](../superpowers/plans/2026-11-02-context-fit-and-retry.md). Private configuration, logs, encrypted backups and raw evidence remain in `.superpowers/sdd/2026-11-02-nemotron-retry/`; no secrets or decrypted observations are published.

This is an explicitly authorized experiment. The actual model response failed tool/evidence accuracy checks; no successful behavior is claimed. The owner-accepted 16.29% recording overhead remains a strict 10% qualification failure; no automatic qualification gate was changed. No push or historical uncertainty review.
