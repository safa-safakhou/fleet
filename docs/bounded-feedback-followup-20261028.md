# Bounded follow-up investigation — 28 October 2026

This follow-up investigates the [fresh half-hour results](fresh-deadline-half-hour-20261028.md). It distinguishes implementation defects from capacity, expired work and unsuccessful decisions. It does not reopen the retained world or claim a new 24-kingdom qualification.

## Confirmed defects and repairs

1. **An expired offer became a false permission failure.** H3's signing response arrived at 09:33:17.345 UTC. The actor was a party to the offer, but the committed game time had reached its exact expiry (`1793179320000`). PACT's quote snapshot deliberately includes only open/active offers. Once the expiry worker persisted `expired`, the requested row disappeared from that snapshot and the quote returned `FORBIDDEN`. A narrow owner-scoped lookup now identifies closed references and returns `EXPIRED`; foreign/nonexistent references still return `FORBIDDEN`. Closed history is not added to prompts or revision digests. Valid quote semantics, economy and ownership stay unchanged.

2. **Trade feedback was generated but could not trigger correction.** The two `PACT_SUPPLY_BOND_EXCEEDS_FLOW` turns were rejected before submission. The validator already supplied the actual bond bounds and guidance, but the proposal wrapper only marked two other codes correctable. Pure trade preflight denials now explicitly carry their correction eligibility through the wrapper. The engine uses its existing three-call budget; no new retry allowance or command replay is added.

3. **A changed read-only quote bypassed correction.** Even after correcting the expiry code, the MCP adapter propagated it as a generic remote rejection. Only `EXPIRED` and `STALE_VERSION` from the read-only quote endpoint now become typed pre-submission feedback. Execute failures, permission denials and transport uncertainty retain their previous behavior. A rejected reference does not authorize replay or automatically refresh the world.

## Other observations and causes

| Observation in the half-hour | Evidence and assessment |
| --- | --- |
| Four resource conflicts | The correction loop did run. H2 repeated training costing 48,000 ordinary iron / 19,200 silver when only 800 / 400 were available. H3 repeated training needing 12,000 / 4,800 against 2,000 / 1,000, and bonds needing 2,400 ordinary iron against 1,600 or 2,000. Authority allowance was ample, but is not spendable stock. These are repeated unaffordable choices after explicit feedback; no new ledger defect was established. |
| Long queues and 27 admission deferrals | Mean/p95/max 36.466/114.562/152.424 seconds. Four request slots also share 92 usable cache blocks; large contexts prevent every slot being usable simultaneously. Refusals preserve the full generation allowance. No worker expiry, model-generation timeout, turn timeout or unknown usage occurred in this trial. Capacity and burst latency remain real limits. |
| Four drain stops | Expected latest-start cutoff near the end of the finite window. |
| One `DEADLINE_MISSED` | An H3 game-event task was already expired. It stopped in about 100 ms with zero model calls/allocations/commands, despite remaining turn headroom. This was not an inference timeout. |
| Three output-cap hits, one terminal truncated turn | Output exhausted the configured 8,192-token allowance. Maximum input plus reserved output was 74.23% of 65,536 tokens; maximum request bytes were 97.80% of 128,000. This does not establish insufficient token context. The byte margin is narrow; no recorded inbox/quoted-option omissions or packing rejection occurred. No limits were increased in this pass. |
| Two contacts accepted, four pending, no messages | Two pending requests reached timed-only kingdoms after their last scheduled model call. Other pending requests were visible during later calls but were not accepted. Acceptances occurred late near model admission closure. This run cannot distinguish future willingness to converse from lack of an eligible follow-up opportunity. No missing social delivery defect was established. |

The model's repeated unaffordable choices are observable decision failures, but this small investigation does not prove an intrinsic intelligence ceiling or rank the eight architectures. In particular, H generated 91 of the 184 calls: retries and event work compete with other kingdoms for the same inference capacity. Correct feedback is necessary, but does not guarantee a good response.

## Offline verification

The new regressions first reproduced the false `FORBIDDEN`, missing trade correction flag and generic expiry/staleness quote errors. Final checks:

- Fleet: 58 focused units, 61 isolated integrations. The integrations include the 49-case native workflow matrix across all eight architectures, eleven participant-action cases and a real MCP expired-quote test.
- PACT: six isolated action-effects integrations, covering both parties, outsider/missing-reference privacy, sign/counter, absence of receipts/contracts on rejection, valid quotes and guarded commands.
- Both repositories: type and boundary checks; PACT kingdom/application builds and Fleet production build pass. Changed Fleet files pass style checks. Full Fleet check passes with existing repository warnings; PACT's pre-existing `Row` explicit-any warning remains.
- Test databases were fresh owned synthetic fixtures. No retained-world database was used as a test fixture. The HTTP and CLI provider fixtures in the offline matrix are fake providers and make no model calls.

## Targeted real-model probe

The real probe ran **14:47:40.247–14:48:13.297 UTC**, 33.05 seconds, with **three actual Nemotron calls**, 26,781 input / 1,678 output tokens (28,459 total). No call truncated, timed out or returned invalid JSON. The three generation durations were 10.005, 10.661 and 8.956 seconds.

| Seeded scenario | Real model response | Actual result |
| --- | --- | --- |
| Bond one unit over the published maximum | One call chose `wait`, saying it was waiting for feedback on a trade proposal. | No corrected offer was submitted. The bad proposal was never submitted, so waiting for its counterpart feedback was unsupported. The synthetic participant harness records this as accepted wait, but it did not run native wait-basis validation, and the response contained no basis. **This is not a valid production completion or a successful trade correction.** |
| Previously observed offer expires before quote | Two calls both proposed signing the same expired offer. | Each quote returned explicit typed `EXPIRED` feedback. The original three-decision allowance (one seeded decision plus two real decisions) was exhausted. Zero signatures/contracts were committed; no retry followed. |

The first defect no longer prevents bond feedback from reaching the engine, and expiry is correctly classified and returned to the model. The model still failed to complete useful recovery in this small sample. Its stale observation continued to advertise the originally observed signature; the feedback tells it to read current evidence or choose another action, but it did neither. This is a concrete limitation of the present model-driven correction interaction, not evidence that the quote or receipt safeguards failed. Automatic targeted invalidation/refresh could be a future design decision; it was not silently added here.

The harness seeds invalid proposals and uses the production autonomous engine, current PACT validation, native MCP quotes and authoritative handlers, with synthetic participant persistence. It is a targeted correction experiment, not a Fleet load test. Seed decisions are not model calls and are not natural model-accuracy observations. The wait-validation limitation above prevents treating its `completed` status as production acceptance.

Bounds were Nemotron 4B only, thinking on, 65,536 context, 8,192 output, at most four actual calls and five minutes; testing stopped on the failed expiry scenario. The first harness attempt stopped before any model request because its read-query contract was missing. Subsequent fake-provider harness checks corrected fixture outcome metadata and scoped-read handling; the final offline harness completed both seeded cases with native receipts. These harness setup failures are preserved and did not require additional product changes.

Private real-probe evidence: `/home/mnim/.local/share/fleet-small-followup-20261028-1445/probe-result.json` and three model-response files. Earlier zero-model-call setup evidence remains in the `1439` and `1443` sibling directories. All eleven model files passed size/SHA256 verification before startup. All three owned provider process groups are now stopped and their health endpoints are closed; GPU memory returned to 1,777 MiB. No game credentials were given to the provider.

## Preservation and delivery

Publication verification re-ran 58 Fleet units, the native MCP expiry integration and six PACT action-effects integrations: all 65 passed. Both repositories passed type/boundary checks and changed-document link/whitespace checks. No model calls, deployment or retained-world changes were made for publication.


The retained half-hour world remains paused at tick 29 / game time `1793179980000`; its 24 finite cohorts remain terminal `finished`. No historical unknown allocation was changed, no terminal cohort was reopened and E4/KQ1 remain blocked. Work stayed inline with no GUI or delegation. The source fixes, regression tests and this report are included in the subsequent owner-requested master publication; the retained deployment is unchanged. The isolated probe loads the current source only for its own test.
