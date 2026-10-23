# Game-free scoped-read follow-through probe — 23 October 2026

**Stopped on the first failure, response 1. No case passed.** The model waited before selecting any schema or read. The pending-request case was not started. No retry, source repair or further inference followed.

The verified source repair was committed first as `4338c01` (`fix: finish selected scoped reads before allowing waits`). The production specialist engine used `read-final.v3` with the new pending-read rule, `environment.v4`, scoped participant state and required-first packing. Source remained unchanged during the attempt.

## Boundary

The user's fresh authorization allowed at most six calls and ten minutes, stopping on the first failure without retries. Each of two independent synthetic cases had at most three calls. Additional caps remained unchanged: 90 seconds/call, 1,024 output tokens/call, 16,384 total tokens/call, 98,304 aggregate tokens and 13,000 request bytes. No warmup, recovery call, alternate model or provider was used.

The model was exclusively the existing native `nemotron-3-nano:4b`, thinking false, digest `6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197`. Only existing loopback Ollama chat/version/tags routes were reachable through the harness. No service was started or restarted.

Fresh contexts, synthetic status value and contact-request ID were prepared. Scripted preflight passed both paths before inference under the unchanged byte ceiling; those scripted checks are not real-model passes. In-memory participant/observation ports and throwing game execution/reconciliation ports prevented game access. Any contact answer could only become an in-memory proposal. No database or game/application endpoint was connected. A one-shot run marker prevents reusing this attempt.

## Actual outcome

Real execution: **19:42:45.111–19:42:52.022 UTC**, **6.911 seconds**, **one call**, **1,295 input + 33 output = 1,328 measured tokens**. Zero unknown calls, fixture observation reads, accepted final envelopes or game commands. The real request was 9,166 bytes.

The provider ended normally, with zero thinking output, and returned a schema-valid wait:

> Observation available: service statusCode is "not yet observed".

The synthetic observation intentionally withheld the actual status; the assignment required obtaining it from the advertised authorized read. This response echoed the placeholder instead of performing that read and answering with its result. The harness stopped automatically with `STATUS_NOT_ANSWERED`, before accepting the wait. Five unused calls are closed with this attempt.

There was no empty refresh, repeated schema lookup or premature read-summary claim. The new follow-through rule was **not exercised by the real model**, because it never selected metadata. Initial waits are deliberately still available in the current contract; this exposes the remaining initial work-selection/completion boundary. The response did not invent a native read result or new authority, but it did not fulfill the requested task.

No real Nemotron acceptance is established for either case. The pending-request behavior remains unverified. This small unpackaged diagnostic is not full-host, native-game, qualification or activation acceptance.

## Evidence and closure

Private synthetic script, requests, response and results remain outside Git at `/home/mnim/.local/share/fleet-probes/read-final-v3-followthrough-20261023-1942/` (0700 directory, 0600 files). Integrity pins:

- Script SHA-256: `9ece55fbb976fa3ca970e063449c391e717151ab8e813bba4f5834254ea5b43e`.
- Result SHA-256: `ab3bdb419deaaa5585427bc86f6e00c47d69fdf7033a24d2bc63644718430ae1`.
- Response SHA-256: `f3e2b5e7a374a5b38700761373325f3bb947b50ac6f83df71596803362122fe8`.

Post-probe ordinary Fleet health reported `liveEnabled: false`. No installed-profile change, game execution, deployment or service restart occurred. E4/KQ1 remain blocked; historical worlds, identities, grants and unknown commands were untouched.

Remaining: initial waits can terminate unresolved fact requests, and the unknown-value placeholder can be repeated as though it answers the assignment. Investigate that boundary before proposing another separately authorized probe. This record authorizes no repair-and-rerun loop or further inference.
