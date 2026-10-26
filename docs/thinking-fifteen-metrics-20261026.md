# Nemotron 4B thinking trial and Fleet metrics

The owner authorized enabling thinking with enough output allowance, running the retained world for 15 minutes, and building Fleet charts during observation. Work stayed inline without a desktop GUI or delegation. E4/KQ1 remained blocked. No commit/push or second live trial occurred.

## Actual result

The admission window ran **26 October 2026,01:27:50–01:42:50 Berlin**,900.157seconds, and closed automatically at its 15-minute deadline. The same 20 eligible kingdoms participated; four original unresolved kingdoms were not resumed.

**37 turns /49 model calls /22 confirmed game effects.** Forty-eight calls reported **486,871 input +45,110 output =531,981 known tokens**. One call has unknown usage; its original40,000-token reservation remains charged and unreconciled. Known tokens do not include that uncertain call.

- **18 building orders**, three training orders and **one accepted contact**. There were no new successful introduction requests, messages, offers or contracts.
- **Ten upgrades completed:** eight newly ordered FarmII upgrades plus HallII and WallII orders retained from the preceding run. New waiting/active orders remain preserved; they are not reported complete.
- **14 of 20 participating kingdoms acted**, across six architectures. In the preceding non-thinking segment, only two coordinator kingdoms acted.

| Architecture | Turns | Calls | Confirmed effects | Kingdoms acting |
|---|---:|---:|---:|---:|
| Legacy loop@1 |3|5|0|0/3|
| Legacy cognition@1 |3|7|1 contact acceptance|1/3|
| Reactive basic@1 |6|6|6 building orders|3/3|
| Reactive cognition@1 |6|6|6 building orders|3/3|
| Reactive cognition@1.1 |4|4|3 building orders|2/3|
| Reactive cognition@2 |4|5|3 building orders|3/3|
| Specialist coordinator@1 |11|16|3 training orders|2/2|
| Autonomous specialists@1 |0|0|0|Original three holds|

This demonstrates broader activity under the new settings. It is not a controlled accuracy comparison: output/time allowances changed too, the same world continued evolving, and the previous segment lasted almost27minutes. It does not establish that all strategies or interactions are now sound.

## Thinking, output and bounds

All 49 recorded requests explicitly requested thinking and 8,192 output tokens. All 48 reported completions contained observed reasoning output; no reasoning text was retained by streaming telemetry. The uncertain stream also contained reasoning before it was rejected. Maximum reported output was**3,316 tokens**; none of the 48 reported completions was output-truncated. Longest reported call was61.742seconds.

The audited change applied only to20 resolved, paused cohorts. Thinking remains enabled with 8,192 output tokens after the run. Four original held cohorts retained their previous settings. Input limits, finite lifetime quotas, per-call total reservation, three-call/one-action limits, owner goals, mandates, schedule anchors and the original lifetime deadline were preserved. Thinking calls allow 180 seconds and turns 360 seconds, still capped by their original finite deadline; non-thinking limits remain unchanged. The run had a210-second maximum drain allowance.

The same hash-pinned BF16 Nemotron 4B served with 32,768-token context, four configured slots, 94 physical/ 92 admissible cache blocks. Exact token/cache admission remained active. Observed peak: **four provider requests running, one waiting, zero preemptions and 14,027 MiB/16,303 MiB GPU**. More output reservation can reduce simultaneous admissions for larger prompts; four configured slots are not four guaranteed full-context requests.

## Failures retained

- **Four `STALE_PROPOSAL` turns** and one `PROPOSAL_SOURCE_NOT_OBSERVED` coordinator turn. Freshness/source checks prevented submission; they were not weakened.
- **Two `PACT_WAIT_STATE_MISMATCH` legacy turns.** Thinking did not eliminate inaccurate wait-state responses.
- **One `TURN_ACTION_LIMIT` legacy turn.** It had already committed the contact acceptance, then attempted another contact-answer action beyond its one-action allowance. The confirmed effect is counted; the extra action was blocked.
- **One rejected `REQUEST_EXISTS` introduction attempt**, inside an otherwise WAIT-coded v1.1 turn. No duplicate introduction was committed.
- **One `RESPONSE_TOO_LARGE` v2 turn with unknown usage**, creating one additional held kingdom. No uncertainty review, usage estimation, refund or model-call replay occurred.

There are28 WAIT-coded turns, eight other finished error-coded turns and one needs-owner turn. A WAIT code can contain an action. The trial is not reported as an error-free pass.

### Exact stream failure and offline repair

The old vLLM reader capped **all streamed wire bytes at 1,000,000**, including JSON/SSE metadata repeated for every token. The failed call reached 4,059 stream chunks and 21,534 reasoning characters, with zero final-answer characters, after 71.289 seconds. It failed the transport-byte bound, not the 180-second call bound. The provider's final usage was not received, so the reservation correctly remains unknown.

The source repair separates protocol overhead from decoded content. Wire allowance scales conservatively with the requested output cap and has a hard 32 MB ceiling; individual events and total decoded content remain bounded at 1 MB. Reasoning is counted without storing its text. Required completion/usage framing and unknown-accounting behavior remain unchanged.

A scripted 6,007-token completion with more than1MB of protocol bytes reproduced the original failure and now passes. Oversized individual events and cumulative decoded content remain rejected. This repair is **offline-qualified and staged as the next worker package**. The executed worker package was never modified mid-run. **No second model trial or replay of the unknown call was performed.**

## Dashboard delivered

The [Metrics section](fleet-metrics.md) is installed at **http://127.0.0.1:56207**. Operator authentication is required; private sign-in details are in the current segment's`operator-access.txt`, outside Git. The console has live execution disabled and no model API key. It remains available after the world/provider stop.

Charts cover calls versus confirmed actions over time, context fill per call, output allowance usage and architecture totals. Outcome views show turn codes and structured command receipts; the table includes individual call state, mode, tokens and latency. Filters select one/all fleets and15 minutes/ 1 hour/ 6 hours/ 24 hours. Missing historical metadata and unknown usage remain explicit. No prompts, private message bodies or reasoning text are returned by the metrics API.

During this run, provider wrappers omitted the newly added context-limit capability. That forwarding is repaired and tested in source/next-worker artifacts. For this run only, missing context-limit metadata was filled from the authenticated 32,768-token provider profile and immutable worker selection. Corrections were confined to numeric request metadata for this window's 49 allocations; reported usage/statuses were untouched. This provenance is retained privately. Older calls were not guessed or backfilled.

Authentication, scope validation, empty/unknown views, completed-action time boundaries, independent aggregation, context-capability forwarding, strict-CSP-compatible SVG and private classification handling pass offline checks. Real HTTP verification passed for the built console/API, with unauthenticated metrics401 and authenticated200. Windows and WSL both reached the console. No browser/desktop automation was used.

## Preservation and qualification

The final world is paused at **tick699**, from685; all 24 cohorts are paused. All runtime worker/API/rules/publisher/provider/supervisor/guardian processes are stopped. The execution-disabled metrics console is the intended exception. Zero running turns, capacity leases or pending/unknown game commands remain.

Four original unknown rows remain unchanged in their original fields; the additive metrics columns are null on them. One new unknown call is retained: five unknown rows in total, with one additional held kingdom. Cohort settings match the audited post-enable baseline. New orders, requests, queues and private evidence are preserved. Final encrypted restore matched complete rows across **167 PACT / 77 Fleet tables**. GPU returned to roughly 1.7 GiB after stopping the provider.

Verification: **1,086 unit tests**,23 selected fresh-database integration tests, type/build/boundary/style checks and diff/link checks. Existing style diagnostics remain warnings/information (123/60), with no errors. Tests use scripted inference and isolated fixtures. Runtime worker artifacts stayed pinned while dashboard and subsequent offline repairs were separately staged. No 24-hour run, commit or push.

Current private pointer: `/tmp/pact-thinking-root`. Executed worker, installed console and unactivated repaired worker have separate retained manifests. E4/KQ1 remain blocked.
