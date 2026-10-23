# Scoped-read wait repair — 23 October 2026

Assignment: fix the goal-deferring wait from the [failed v3 probe](nemotron-read-final-v3-probe-20261023.md), inline within 30 minutes, then run offline checks and report before any more trials. Started 19:34:53 UTC. No inference, game execution, deployment, service restart or installed-profile change is part of this assignment. Nemotron 4B remains the only permitted local inference model; E4/KQ1 remain blocked.

## Cause and change

In the failed probe the agent selected metadata for a read, received the exact argument contract, then waited instead of requesting its result. Fleet tracked the retrieved schema but did not track the unfinished read step; its generated format and runtime both still accepted that wait.

The existing opt-in `read-final.v3` now separates **cached schema knowledge** from an **unfinished selected read**:

- Selecting `readSchema` begins a pending scoped-read step in the current turn. While the current authenticated catalog still permits the same contract and a read call remains, the generated query choices are narrowed to that tool with its existing exact arguments, and the wait branch is removed. Other already-authorized action proposals retain their ordinary checks; no action or arguments are chosen automatically.
- The model packet identifies the pending read and says waiting is unavailable. A provider that ignores the generated grammar receives `SCOPED_READ_REQUIRED` before the requested observation, state acceptance or task waiting if it returns a wait or a different read selector.
- A successful scoped read clears the pending step but retains the cached argument contract. The following final answer/wait is allowed. A continuity detour or another schema lookup cannot stand in for the selected read.
- Catalog removal, schema change or loss of read-only status invalidates the pending contract. The engine does not force a stale or forbidden read. The final-call reservation also remains intact: if no read call remains, an honest final wait is permitted without extending the budget or inventing a result.
- Initial waits without a selected read remain possible; legacy v1/v2 metadata inspection is unchanged. No active or historical profile was rewritten.

Ruling: In this fact-oriented v3 contract, selecting read metadata commits to completing that scoped read before waiting when it remains available. Metadata-only inspection can retain the legacy contract. Cost: v3 no longer treats a chosen metadata lookup as a completed fact-retrieval task.

This is a structural progress constraint, not a natural-language goal-completion oracle. It does not certify that every initial wait is useful, every action serves the goal or every final answer is true. The observed second-call escape is removed without globally banning waits or expanding authority.

## Verification

The first regression run reproduced four failures: the generated wait remained admissible, continuity remained a detour, the raw-provider guard accepted the wait, and the engine persisted the exact lookup → wait sequence. All passed after the change.

Focused checks cover the old failing response, successful read → final wait, exact native argument preservation, blocked continuity/metadata detours, catalog removal/change/read-only revocation, final-call exhaustion, initial waits and legacy metadata-only workflows. The actual fake-HTTP specialist integration verifies that the intermediate wait is rejected and the final answer becomes admissible only after the scoped result is delivered.

A separate network-forbidden scripted check passes both synthetic probe paths with zero inference and the unchanged 13,000-byte ceiling; maximum request size remains **12,946 bytes**. Private offline fixture and result are retained at `/home/mnim/.local/share/fleet-probes/wait-followthrough-offline-20261023-1939/`:

- Script SHA-256: `f9ef0cbb9d90957c5a5a0cb893cc40a15a66e379cd93684024b0fdfc79f9737d`.
- Result SHA-256: `54e2f8331386bed7fca61b55cbbcc72e925888ec4cedd446eb42dc6a75f30263`.

Final checks:

- `npm test`: **864 tests in 168 files passed**.
- Owned disposable fixture, `tests/integration/autonomous-specialist-engine.test.ts`: **55 passed**.
- `npm run check`: exit 0; TypeScript passed. Biome retains 82 existing warnings and 56 informational diagnostics outside this change; focused changed-file checks are clean.
- `npm run build`, `npm run check:boundaries`, `git diff --check`: passed.
- Network-forbidden scripted fixture: both paths passed; zero model calls, zero game commands; maximum request 12,946 / 13,000 bytes.
- Ordinary Fleet health remains `liveEnabled: false`.

Completed within the user's 30-minute ceiling. Changed files are the specialist engine, read-progress helper and decision-interface binder, their unit tests, and the existing specialist HTTP integration test. PACT source is unchanged.

The earlier real v3 probe remains failed and closed, with its pending-request case unrun. This source repair does not resume its spare allowance or authorize another model probe. At the offline handoff, changes remained uncommitted and unactivated. The subsequent user request authorizes committing the repair and one fresh bounded game-free v3 probe; no game activation is authorized.
