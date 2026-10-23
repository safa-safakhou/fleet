# Game-free requested-facts probe — 23 October 2026

**Stopped at the first semantic failure, response 4.** The requested-status case passed in three calls. The pending-request case selected the correct authorized answer, but its summary promised delivery without supporting evidence; inline review rejected it before acceptance. No retry or repair followed.

## Boundary and verification

The requested fixes were committed first as `d3a05d1` (`fix: require requested facts before initial waits`). The prior offline handoff passed 879 unit and 55 isolated specialist integration tests, type/style/build/boundaries and scripted fixtures. Immediately before commit, 34 affected unit tests and `git diff --check` passed again.

One fresh attempt used the revised `read-final.v3` fixture: initial status omitted from the ordinary payload, a trusted unknown requested fact, and a known value returned only by the matching synthetic read. Fresh context/operation IDs, status and contact-request ID were used. The same immutable script passed both scripted paths before inference; these are not real-model passes. A run-once marker prevents repeating this attempt.

The user's limits were six calls and ten minutes, stop on first failure, no retries. Existing narrower limits remained: three calls/case, 90 seconds/call, 1,024 output tokens/call, 16,384 total tokens/call, 98,304 aggregate tokens and 13,000 request bytes. No warmup, fallback or recovery call occurred. A live-disabled health check preceded dispatch.

Only native WSL Ollama `0.35.1`, loopback `127.0.0.1:11434`, and `nemotron-3-nano:4b` with thinking false were used. The model digest was `6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197`. Provider identity was checked before inference. The harness allowed only Ollama chat/version/tags routes. All observation and participant ports were synthetic in-memory fixtures; game submission/reconciliation ports throw. No database or game endpoint was connected, and no installed profile or service was changed.

## Actual result

Execution: **20:09:29.431–20:10:45.000 UTC**, **75.569 seconds**, **four calls**, **6,754 input + 335 output = 7,089 measured tokens**. Zero unknown calls and zero game commands. Maximum request was **12,946 / 13,000 bytes**. All provider responses ended normally with no thinking text.

1. Status metadata lookup: authorized tool, prospective summary.
2. Scoped status read: exact self arguments. The query also included the advertised optional `continuity: true`; it did not replace or defer the required read.
3. Final wait: `statusCode = indigo-482`, matching the delivered read. Accepted in memory. This case passed with no initial wait, repeated lookup, placeholder answer or premature read claim.
4. Pending request: proposed `game.contact.answer` for the correct incoming request, with `accept: true`. Current delegation permits either acceptance or decline. No redundant introduction was proposed. However, the summary added:

   > Response will be delivered to the sender's social attention.

The system prompt requires observed facts or conditional plans for pre-dispatch proposals. The fixture supplied no dispatch, receipt, delivery evidence or delivery contract supporting that unconditional future guarantee. Inline review marked `stop`, and the harness closed with `INLINE_REVIEW_FAILURE` before accepting the proposal. This is an unsupported future delivery guarantee; it is **not** a claim that delivery had already happened. Structural validation and request selection passed; the narrative review failed.

Two unused calls are closed with this attempt. No extra trial or code change was made. One successful status example is narrow evidence for the repaired initial-wait/unknown-value path, not general behavioral qualification. The pending-request case now has real-model evidence, but it did not pass overall. Delivery wording remains the observed unresolved behavior.

## Evidence and closure

Private synthetic script, requests, responses, per-response reviews, preflight and result are retained outside Git at `/home/mnim/.local/share/fleet-probes/read-final-v3-requested-facts-20261023-2009/` (0700 directory, 0600 files).

- Script SHA-256: `008a0aec6a04ffa3399a4df8a324a1eaf105dc040f0aedd6dce26926b9a2425c`.
- Result SHA-256: `0c1a7192e775609ef3beca01ffd5edfa62a0129994449290ac2305f20cb9fe59`.
- Response 4 SHA-256: `52c33231fa041739fb949e6da9011f057021a6510f9d33a8bb4b022aafcc686d`.
- Review 4 SHA-256: `91b47e782bb8d774dab1301b404290ec1d3c0320c062f9b7569336aee95da326`.

Post-probe health again reported `liveEnabled: false`. PACT remained clean and unchanged. E4/KQ1 remain blocked. No game execution, deployment, restart, runtime configuration change or push occurred. This closed result authorizes no repair-and-rerun loop or further inference.
