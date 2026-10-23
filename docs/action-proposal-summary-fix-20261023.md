# Unsupported delivery guarantee repair — 23 October 2026

Assignment: fix the delivery guarantee from the [closed requested-facts probe](nemotron-requested-facts-probe-20261023.md), inline within 30 minutes, then report after offline checks. Started 20:12:09 UTC. No inference or new probe is authorized. Local inference remains Nemotron 4B only; ordinary game execution remains disabled and E4/KQ1 blocked.

## Cause and change

The failed response chose a valid answer for the pending contact request, then appended an unconditional promise that the response would reach the sender's social attention. It was a future delivery guarantee, not a claim that delivery had already happened. The system prompt already required observed facts or conditional plans for pre-dispatch proposals. However, the action summary remained an unconstrained string in both the generation schema and runtime parser. No dispatch or receipt existed at that decision boundary.

Opt-in `read-final.v3` now requires the fixed action summary **`Action proposed.`** in both its generated grammar and runtime. The guard raises `ACTION_PROPOSAL_SUMMARY_REQUIRED` before goal revisions, skill publication/adoption, proposal validation or participant acceptance when a provider bypasses the grammar. The engine rejects invalid output; it does not silently rewrite the model's claims, retry, dispatch or fabricate a receipt.

The action's structured schema/payload, target IDs, consent choice, deferral flag and native authority checks retain their existing roles. The payload carries the actual proposed operation; the summary states only its proposal status. Read and wait summaries keep their existing contracts. Legacy v1/v2 retain their existing action summaries. No installed profile changes.

This follows the existing fixed prospective-read summary pattern. More prompt wording would leave the observed structural gap open, and phrase matching would miss paraphrases or reject legitimate quoted facts. A fixed proposal summary removes the unsupported-claim channel at this specific boundary, at the cost of a descriptive action summary. This is not a general semantic verifier for free text in updates, payloads or later messages.

The first longer fixed summary exceeded the existing packed social request ceiling. Offline evidence is retained, and the final short wording fits without changing any limit, dropping required social facts or shrinking the pending-request task. Two new integration tests also required fixture corrections: the v3 test must use its required known-argument read contract, and the generic board fixture's generation schema constrains action schema IDs rather than board squares. Neither correction changed production authority behavior.

## Offline verification

The initial regressions failed as expected: the generation schema accepted the delivery guarantee on both ordinary and final-only branches, and the engine persisted it. After the repair, focused tests pass for rejection before validation/persistence, preservation of the selected payload, native proposal refusal and legacy compatibility. Schema tests preserve existing payload bounds and read/wait behavior.

The fake-HTTP integration tests use an owned disposable PostgreSQL fixture and deferred board proposals. They check the advertised action-summary constant, reject an unlisted action schema, exercise both a compliant provider and one returning the old guarantee despite the grammar, and assert zero board executions/platform commands with accounted fake usage. The full host catches the bad summary earlier as `INVALID_MODEL_OUTPUT`; its existing bounded output recovery receives two fake invalid responses, both accounted, without changing retry policy. The raw-port unit test separately proves the new engine guard refuses the first invalid decision. These tests do not use a retained world or a real provider.

Final checks:

- `npm test`: **885 tests in 169 files passed** on the final source.
- `scripts/test-architecture-offline.ts tests/integration/autonomous-specialist-engine.test.ts`: **57 passed**, with an owned disposable PostgreSQL fixture.
- `npm run check`: TypeScript/style check exit 0; existing 82 Biome warnings and 56 informational diagnostics remain outside this change. Focused checks of changed source/tests are clean.
- `npm run build`, `npm run check:boundaries`, `git diff --check` and local documentation-link checks passed.
- Ordinary Fleet health reports `liveEnabled: false`; PACT remains clean on master.

The separate network-forbidden scripted fixture passes status lookup → read → answer and the pending-request answer proposal, with **zero inference and zero game commands**. Maximum request is **12,991 / 13,000 bytes**; call/token/time/byte ceilings are unchanged. Its four scripted responses are fake decisions, not behavioral model evidence. Private evidence remains at `/home/mnim/.local/share/fleet-probes/action-summary-offline-20261023-2016/`:

- Script SHA-256: `5335b52ee63d8366cbba57a03e0a10f7ac819c3c053e43492c5c93db82281b78`.
- Result SHA-256: `6475403a4b526ffec815d57baf15039cfc70f5e8a7f8b03491a74eb18df9d0a3`.

The longer-summary failed offline fixture is separately retained at `/home/mnim/.local/share/fleet-probes/action-summary-offline-20261023-2015/`; no closed real-probe evidence was changed or reused.

Completed within the 30-minute limit. Source remains uncommitted and unactivated. PACT source is unchanged. The preceding real probe remains failed and closed, and no real behavior is newly qualified. No model trial, game execution, service restart, deployment or settings change occurred. A separately authorized fresh probe would still be needed to establish model behavior; this report does not authorize one.

The subsequent user request selected committing this repair, one fresh bounded game-free probe and production typed-fact wiring. The summary repair is committed as `1bc3023`. See the [adapter wiring record](pact-requested-facts-20261023.md) and current-state checkpoint for that separately authorized work. Source remains unactivated.
