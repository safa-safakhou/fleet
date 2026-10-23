# Game-free Nemotron probe — 23 October 2026

Result: **stopped on the first failure; no case passed**. The schema-progress case failed on response 3. The pending-request case was not started. No retry, repair-and-rerun, game command, deployment or service restart followed.

The verified source repair was committed first on Fleet master as `80f392c` (`fix: bound specialist schema lookups and pending introductions`). The 53 directly affected unit checks and whitespace check passed again before that commit; the preceding implementation record contains the full 841-unit / 54-specialist-integration / 11-native-social checks.

## Authorized limits and setup

The user authorized at most six calls and ten minutes, inline, game-free, stopping at the first failure with no retries. E4/KQ1 remained blocked and were not involved. Historical grants, worlds, unknown commands and frozen candidates were untouched.

Two independent synthetic cases were prepared: obtain an owned service's actual status through schema lookup/read/final response; then propose acceptance or decline of a pending incoming contact request. Each case had at most three calls. The production specialist engine and HTTP adapter ran against in-memory participant/observation ports. Game execution and reconciliation ports threw if invoked; final action proposals could only be inspected in memory. No database or application/game endpoint was connected. This is an unpackaged diagnostic, not full-host or native-game acceptance.

Only the already-running native `nemotron-3-nano:4b` was selected, with digest `6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197`, thinking false, no alternate provider/model and no output recovery. The provider identity check used metadata only and did not start a service or load a model. Network access in the harness was restricted to the existing loopback Ollama chat/version/tags routes.

Caps fixed before the first inference: 1,024 output tokens/call, 16,384 total tokens/call, 98,304 total tokens, 13,000 bytes of prompt plus schema, 90 seconds/call and ten minutes for the entire real probe, including inline review. Each dispatch was recorded before sending; replies were retained and reviewed inline before the engine could consume them or dispatch another call.

Offline preparation used scripted responses only. It exposed a synthetic evidence-expiry mistake, which was corrected before inference. The initial 12,000-byte packet cap forced the contact case into evidence-only mode; it was adjusted to 13,000 before inference. The final offline fixture passed both paths (three scripted decisions and one scripted proposal); it consumed zero model calls. The packed contact prompt retained the pending request and answer action. These preparation checks are not real-model passes.

## Observed outcome

The real probe ran from 16:25:22.603 to 16:26:44.858 UTC: **82.255 seconds, three calls, 3,891 input and 132 output tokens (4,023 total), zero unknown calls and zero game commands**.

| Call | Model decision | Review |
| --- | --- | --- |
| 1 | General refresh `{}`; status not yet observed | Continued: valid read, no invented result, but no progress toward the scoped value |
| 2 | First lookup of `fixture.status.read` | Continued: valid first metadata request |
| 3 | Scoped read with `scope: self`; summary claimed it had observed the current status | Stopped: the selected read had not run and no status value or final answer had been produced |

All three provider replies ended normally and passed the current generated schema. There was no repeated metadata lookup in this short sample. However, the initial refresh consumed the spare call, and the model's third response prematurely described the selected read as an observation. Inline review rejected response 3 before the scoped fixture read or any final envelope could be accepted. Only the call-1 refresh reached the fixture observation port. The harness recorded `INLINE_REVIEW_FAILURE`; the retained review records the more specific reason `PREMATURE_OBSERVATION_CLAIM`.

This is not a successful three-call read/final sequence. Because the whole probe stopped at its first failure, there is **no real Nemotron evidence for the pending-request case**. The unused three-call allowance is closed for this probe; it must not be silently carried into another attempt.

## Evidence and remaining work

Private synthetic requests, responses, inline reviews, script and results are retained at `/home/mnim/.local/share/fleet-probes/schema-pending-20261023-1622/` (directory mode 0700, files 0600), outside Git. Integrity pins:

- Harness SHA-256: `fb778c94698de29c991b28d8b8ca518b002352dbf7ae08ea3394643feb57217e`.
- Final result SHA-256: `3bb3afb19f2aaa8f234a91723605cd810f8af952bdc46515978634d1a784d7e5`.
- Stopping review SHA-256: `e584bbb5b85983cae1c49d364bd224bcab94df54fbe8fd898c90bbffde87c661`.

A read-only post-probe ordinary Fleet health check still reported `liveEnabled: false`. E4/KQ1 remain blocked. No operational qualification or activation is established.

Remaining diagnosis/repair target: explain or constrain unproductive general refreshes so they do not consume the final-answer budget, and prevent pre-dispatch read summaries from claiming already observed results. The pending-contact behavior still needs a separately authorized real-model probe after reviewing this failure. No further implementation or inference is authorized by this record.
