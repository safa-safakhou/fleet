# Game-free read-final.v3 probe — 23 October 2026

**Stopped on the first failure after two calls. No case passed.** No retry or further inference followed; the pending-request case remains unrun.

The source repair was committed first as `e1f5af6` (`fix: reserve final specialist decision and reject premature read claims`). The user interrupted after that commit, before any new probe calls. Their subsequent resume authorized continuing the fresh probe; it did not reopen the earlier failed v2 probe. The committed source was unchanged during this attempt.

## Boundary and checks

- Production specialist engine with `decisionContract: read-final.v3`, `readQueryContract: environment.v4`, scoped participant state and required-first packing.
- Existing native `nemotron-3-nano:4b` only, thinking false, digest `6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197`. No model/provider fallback or output recovery.
- Maximum six calls, three per independent synthetic case; ten minutes overall including inline review; 90 seconds/call; 1,024 output tokens/call; 16,384 total tokens/call; 98,304 aggregate tokens; 13,000 request bytes. No warmup or extra inference.
- Two prepared cases: retrieve an owned service's status through schema lookup/scoped read/final response; then propose an answer to a pending incoming contact request. Scripted preflight passed both paths before inference, under the unchanged byte cap. A fresh synthetic status value and request ID were used.
- In-memory observation/participant ports only. Game execution/reconciliation ports throw; contact answers can only be retained as in-memory proposals. No game/application endpoint or database was connected. Provider network access was restricted to existing loopback Ollama chat/version/tags routes. A one-shot run marker prevents reusing the attempt.
- Each response was journaled before validation. Structural/goal failure stops the whole attempt automatically; otherwise inline review must permit the next step. Dispatches were recorded before sending, and all usage was reported.

This is a small unpackaged behavioral diagnostic, not full-host, native-game, qualification or activation acceptance.

## Actual result

Real execution: **19:32:42.361–19:33:01.994 UTC**, **19.633 seconds**, **two calls**, **2,696 input + 77 output = 2,773 measured tokens**. Zero unknown calls, zero game commands, zero accepted final envelopes; largest real request 9,788 bytes.

| Call | Decision | Outcome |
| --- | --- | --- |
| 1 | First lookup of `fixture.status.read`, with `Read requested; result not yet observed.` | Passed inline review; the retrieved contract was delivered for the next decision |
| 2 | Wait, summary `Observed: service status not yet observed`, `untilNextEvent: true` | Automatic `STATUS_NOT_ANSWERED` failure; stopped before accepting the wait |

Both provider responses finished normally and passed the generated schema. No empty refresh, repeated lookup or premature **read-summary** claim occurred. The second response acknowledged an unknown status rather than inventing its value. However, it deferred the assigned request instead of performing the available scoped read; no fixture observation read ran and no actual status answer was produced. This is an intent/progress failure, not a successful answer or an output-format failure.

The pending-request case was never started. Four unused calls are closed with this failed attempt and cannot silently become another probe. No real Nemotron acceptance is established for either case.

## Retained evidence and next boundary

Private synthetic script, requests, responses, review and results remain outside Git at `/home/mnim/.local/share/fleet-probes/read-final-v3-20261023-1932/` (0700 directory, 0600 files). Integrity pins:

- Script: `879a1ee6b371dc0a5709559d99fda106626478a20c1713fb6389d87207ebc212`.
- Result: `decfa1e164d273fef108a9bce24872b1272e7d4b644e574bd3a3864307949df6`.
- Failing response: `24c1f1674b5bd39c9abb9e470bbc3541b5840011deafa55952e6fa3964ca90d7`.

Post-probe ordinary Fleet health still reported `liveEnabled: false`; PACT's working tree remained unchanged. No game execution, service restart, deployment or installed-profile setting change occurred. E4/KQ1 remain blocked; historical worlds, grants and unknown commands were untouched.

Remaining: investigate goal-deferring waits when the requested scoped read is immediately available, then obtain separate authorization before any further inference. The pending-request behavior remains unverified. This record does not authorize a repair-and-rerun loop or another probe.
