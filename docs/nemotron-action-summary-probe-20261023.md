# Game-free action-summary probe — 23 October 2026

**Both cases passed.** This completes the selected fresh two-case probe, not broader game qualification or activation. No additional trial followed.

The user selected committing the delivery-summary repair, one fresh game-free probe, and production typed-fact integration. The summary repair was committed as `1bc3023`; the [production adapter wiring](pact-requested-facts-20261023.md) was committed as `ce86fd4`. All source was frozen before inference. Offline checks passed 893 unit tests, 57 specialist HTTP tests, five isolated binding integrations, type/style/build/boundaries and documentation checks. The adapter's authenticated unknown → known path was also checked separately in a fresh owned fixture.

## Fresh boundary

One new script, directory, operation/context IDs, synthetic status and contact-request ID were used. No closed probe was resumed or edited. The initial status fact has no value and includes exact `scope: self` arguments. Only the actual synthetic scoped read supplies its known value. The pending-request case retains its existing observed request and agent-decides delegation. Fixed action summaries use `Action proposed.`.

Limits remained six calls and ten minutes overall, three calls/case, 90 seconds/call, 1,024 output tokens/call, 16,384 tokens/call, 98,304 aggregate tokens and 13,000 request bytes. Stop on first failure, no retries. Scripted preflight passed both cases before inference with zero model calls. A one-shot marker prevents repeating the real attempt. All four responses received inline review before the engine continued or accepted a final proposal.

Only the existing native WSL Ollama `0.35.1` and `nemotron-3-nano:4b` were used, thinking false, model digest `6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197`. The authenticated provider identity and loopback listener were checked before dispatch. Only Ollama chat/version/tags routes were reachable through the harness. No warmup, alternate model or recovery call occurred.

## Result

Real execution: **20:30:10.793–20:30:59.672 UTC**, **48.879 seconds**, **four calls**, **6,809 input + 219 output = 7,028 measured tokens**. Zero unknown calls and zero game commands. All responses ended normally with zero thinking text. Maximum request: **12,991 / 13,000 bytes**, leaving nine bytes of headroom in this specific fixture.

1. Authorized status schema lookup, with the prospective read summary.
2. Required scoped status read using exact `scope: self` arguments. Advertised optional continuity/coordination flags accompanied the read rather than replacing it.
3. Final wait reporting `observed statusCode cobalt-853`, exactly matching the delivered result. Accepted in memory.
4. Authorized `game.contact.answer` proposal accepting the exact pending incoming request, with the fixed summary `Action proposed.`. Native proposal checks passed and the proposal was accepted only in memory. No redundant introduction, execution claim or delivery guarantee appeared.

No initial wait, repeated lookup, placeholder answer or premature read claim occurred. Two unused calls are closed with this completed attempt. This is one passing example of each narrow synthetic scenario; it does not establish performance across all goals, full-host production qualification, actual delivery, installation, rollback or activation acceptance.

## Evidence and preservation

Private script, preflight, requests, responses, four reviews and result are retained outside Git at `/home/mnim/.local/share/fleet-probes/read-final-v3-action-summary-20261023-2030/` (0700 directory, 0600 files):

- Script SHA-256: `7ad9cc8f87789ec760fe4e5f997b90774de7eb79609d1438cce705ed1348f5f8`.
- Result SHA-256: `bb789a37f66706ea559b4ae9ce4dac3615a74d1f61231f1d8e6bc722d40fd86e`.
- Preflight SHA-256: `291b106eac5ed98609b74c1d0be7ad04be86b58ca3b4a3c35218f2c1557e5785`.

The production engine ran against in-memory observation/participant ports; game execution/reconciliation ports throw. No game/database/application endpoint was connected. The production PACT adapter wiring was tested separately with fake GamePorts and isolated fixtures; this diagnostic's service-status case is synthetic and does not claim a live PACT read.

Ordinary Fleet health reported `liveEnabled: false` before and after. Production fact requests remain unconfigured; no live settings, installed profile, service, world, grant, allocation or queued command was changed. PACT remains clean on master. E4/KQ1 remain blocked. No push, installation or restart occurred. Broader qualification and activation remain outside the three completed tasks.
