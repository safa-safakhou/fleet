# Mandatory native run repairs — 25 October 2026

The owner resumed the paused repair task after finishing GPU use. Scope is inline repair plus two scheduled fleet-wide rounds, capped at 30 minutes; no new 24-hour run. Only pinned Nemotron 4B; E4/KQ1 remain blocked. No GUI or overlay termination.

## Source changes

- MCP clients obtain current credentials at each HTTP dispatch, serialized with token rotation. A definitive pre-dispatch 401 permits one refresh; uncertain transports are never replayed. Native OAuth rotation, original-session write/close and exact-one receipt pass.
- Coordinator proposals retain the command ID used by their native quote, including training promises. Stale pre-submission proposals receive bounded fresh reconsideration under the original three-call/one-action limit; they no longer disappear as WAIT. Native advancing-clock and training cases pass.
- V1 continuity keeps at least one evidence item and protects active-plan anchors. Repeated intent/provenance is referenced losslessly; current construction stock checks use whole-row encoding. Current stock, authority, goal feasibility, prerequisites and effects remain protected. Repeated briefing explanations are withheld only under measured pressure with explicit omitted paths. Impossible minimum contexts fail before inference.
- Coordinator fitting measures the host's final constraints before admission. Quoted alternatives can be reduced as whole records with coverage, and the output schema binds the exact delivered subset. No arbitrary byte-limit increase or weaker action validation.
- Operator telemetry reports consecutive zero-action waits and recorded holds. Wait diagnostics retain their factual basis. This is visibility, not a forced action policy or a promise of strategic improvement.
- Control heartbeat is independent of database/telemetry I/O; a separate 15-second control-progress bound still catches a stuck controller. Clock-helper EOF/broken pipe permits at most two replacements with retained clock/deadline anchors. Exit diagnostics are recorded; clock disagreement fails closed. Cross-process finalization exclusion prevents competing encrypted backup creation.

## Offline verification

- 1,075 unit tests pass; types/style (110 warnings/60 infos), boundaries, production build and whitespace checks pass.
- 69 focused native integration cases and36 final native/refresh cases pass, with overlapping cases disclosed. The full matrix covers prerequisite construction, introductions and messages through real MCP/handlers for all eight architectures, plus completion of the prerequisite/Hall chain.
- 34 distinct installed Guidance schemas compiled from 43 captured requests, CPU only.
- Six read-only retained-world reconstructions reach throwing model stubs with one evidence item: v1=31,917–31,927bytes; v1.1=31,754–31,770bytes, limit32,000. No retained writes/model calls.
- Clock-helper CPU tests, actual Windows helper replacement with continuous anchors, primary-loss closure and five-minute Windows/WSL clock comparison pass.

## Deployment preparation

The same world remains retained at tick616. Its two stopped database containers were ownership-verified and restarted; Docker reassigned loopback ports, so the new continuation config binds their actual inspected ports. Old configs and closed segments are preserved. Before-run encrypted restore matches167 PACT / 77 Fleet tables. The versioned package verifies213 artifacts and276 source files.

The isolated provider exports94 physical / 92 usable cache blocks, four slots and a 16,384-token context. Four maximum-context requests reserve 23 blocks each, requiring 92 usable; token capacity 65,536. Existing per-actor budgets, goals, mandates, anchors and four unknown allocations / three held actors are preserved. Live before/after behavior remains to be recorded below.

## Actual live results

The same world ran from **20:50:18 to 21:07:28 Berlin**,25 October 2026, advancing tick 616→633. The planned 30-minute window was closed early after two scheduled rounds across every dispatchable actor. Two extra event turns also occurred naturally. No 24-hour run started.

| Outcome | First round | Second round | Total |
|---|---:|---:|---:|
| Turns |22|20|42|
| Confirmed commands |2|1|3|
| Zero-action waits |16|14|30|
| Input-capacity refusals |3|3|6|
| Factual-wait refusals |1|1|2|
| Stale proposal refusal |0|1|1|
| Reported model calls |25|21|46|

The three confirmed effects are **two training orders and one contact request**. One building proposal was rejected; no successful new construction is claimed. Contact request admission is not an accepted contact or conversation. Existing turn labels say WAIT for 33 turns, but three of those contain confirmed commands; the table uses actual action/receipt data.

All 46 new model calls have reported usage:327,352 input + 16,501 output = 343,853 tokens. Four real requests ran concurrently. Across 203 control samples, observed provider waiting/preemptions remained zero; peak GPU allocation was13,811 MiB / 16,303 MiB. No new token-authentication, lease or model-stream failures were observed. These are bounded observations, not24-hour reliability acceptance.

### Remaining failures and the correction during the check

**Correction from the subsequent offline investigation:** production returned the full 42-tool catalog; it was the reconstruction that filtered to 29 callable PACT reads. The description below had this boundary reversed. The resulting false offline acceptance and its source repair are documented in [live v1 packing repair](live-v1-packing-repair-20261025.md). This correction does not change the historical six live failures.

The six input refusals are the same three original reactive-cognition@1 actors in both rounds; they made zero model calls for those attempts. The first reconstruction did not mirror the runtime: it omitted some native capability/attention metadata; its later filtered decision catalog also differed from production, which still returned the full native catalog. Complete metadata reproduced a refusal offline. The additional lossless correction shares catalog names inside mixed capability metadata, retains literal unlisted names/order, and removes known repeated explanatory prose while preserving its system rules. The unit fixture now mirrors the native-capability/read-catalog split.

Before the idle worker replacement62,383 → 73,529,1,075 units,41 native/continuity integrations and six current reconstructions passed. The full reconstructions used actual catalog, attention records, task sources and coverage: v1 = 31,694–31,704 bytes; v1.1 = 31,959–31,975 bytes, each with one evidence item. Nevertheless, **all three v1 actors again returned CONTEXT_LIMIT live after deployment**. That repair is not accepted as a complete runtime packing fix. The exact remaining runtime composition difference is unresolved; the recorded initial observation was too large for its bounded trace and was omitted. Another manual approximation is not sufficient acceptance evidence.

Two legacy-cognition turns supplied an empty completedLevels map despite observed building levels. Known-rejection feedback was delivered, but the model did not correct its factual basis within the three-call allowance. The guard rejected the waits. One coordinator proposal became stale after its worker and coordinator calls; the prepared building command was rejected without a committed effect. No budget was raised or uncertain command replayed.

Three autonomous actors remain held with original MODEL_STREAM_INVALID unknowns. A fourth coordinator retains a pre-existing TASK_FENCED unknown turn even though its agent label is ready. Therefore only **20 of 24 actors**, across seven architectures, were dispatchable. Those holds were not reviewed/reset. All eight architectures have offline native workflow coverage; live autonomous-specialist acceptance is not claimed.

### Shutdown and preservation

The supervisor parked on TWO_FLEET_ROUNDS_OBSERVED. PACT is paused at tick 633; all 24 cohorts are paused. Worker, API/rules, supervisor, guardian and isolated provider are stopped. There are zero running turns, capacity leases or pending/unknown platform commands. All four original unknown ledger rows match exactly, and cohort budget/model/anchor hashes are unchanged. Final encrypted restore matched 167 PACT / 77 Fleet tables. GPU memory returned to 1,684 MiB; no overlay was closed. E4/KQ1 remain blocked. Changes remain uncommitted; no push occurred.

The plan remains incomplete on live v1 packing and reliable factual deferral behavior. The next work is an offline reproduction through the complete runtime composition with bounded size/provenance diagnostics, then a separately bounded acceptance check. No further run is started from this report.
