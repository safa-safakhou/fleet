# Fleet reliability follow-up — 13 October 2026

Assignee: Codex, under the founder's instruction to fix the post-P1 failures correctly and validate the same fifty agents. No new population, counter reset, mandate expansion or model migration is part of this assignment. At this implementation checkpoint the cohort is paused by a later provider timeout, not running. Release/recovery evidence will be appended after actual acceptance.

## Corrections and acceptance

- Context fitting now has a game-owned fresh-environment projection after optional cache eviction. It keeps whole identity, balances, buildings/queues, next-upgrade prerequisite checks, construction recovery and authority facts. Busy contact, request, offer and contract lists are interleaved and rotated across scheduled turns with observed/retained/omitted counts. Optional rules are whole or explicitly omitted. All fresh-environment reductions are tried before narrowing requested feedback; exact command outcomes and supplied executable schemas remain protected. Huge optional notes can be omitted from one input with a notice; their stored value is untouched. An indispensable oversized body still fails before reserving inference.
- World, inbox and conversation input schemas come from the actual read-only tool catalog and are supplied directly. Invalid-read feedback now includes that exact schema alongside sanitized attempted arguments and validation errors, allowing correction within the existing decision budget.
- Dashboard attention now includes context-limit failures and separately recorded game recovery, even if scheduler records are ready. A fresh successful game-blocker check clears the game indicator; later thinking/waiting labels alone do not. No scheduler state or authority is inferred from these display flags.
- Codex timeouts are distinguished from explicit cancellation. Process containment, the 90-second bound, full reservations and unknown-usage admission gates remain intact. This improves diagnosis; it does not guarantee a provider will always finish within the bound.

Verification: final Linux build image check/boundaries/build passed; **53 unit tests + 106 integration tests + eight real PACT-handler acceptance tests = 167 passed**. All were rerun after the requested-result priority/prerequisite refinement. Cross-repository tests used a separate `pact_test` PostgreSQL instance and real public handlers/projections; they cover human-only refusal, owner cancellation and prerequisite queuing for Hall-dependent jobs, including Farm III / Storehouse III. Synthetic busy-guide tests execute a permitted contact response without extra calls and preserve fresh requested feedback. Production dependency audit has zero findings. Native type/lint checks and `git diff --check` passed; existing lint warnings remain. No paid inference was used for these tests.

At **10:37:51 Berlin / 08:37:51 UTC**, authenticated read-only reconstruction succeeded for all fifty original account/kingdom bindings. The candidate fitter delivered every context within 24,000 bytes (maximum 23,871), including every retained requested-read marker. With the same additional read-schema advertisement, the old fitter failed for five current inputs. More importantly, the frozen original Agent 50 failure reproduced under the old fitter and fits at 22,491 bytes with the candidate. This is input acceptance without inference, not a claim of successful live strategy.

## Prepared exact owner recoveries

Fresh reads confirmed the same five deadlocks. Cancel only one waiting job per account, retain the other job, then re-read and let existing authorized turns choose prerequisite construction. No autonomous cancellation permission is added.

| Agent | Waiting cancellation | Exact instruction |
| --- | --- | --- |
| 15 | Storehouse III, slot 2; retain Farm III | `518c0d92-908b-408d-b456-37d1728c75b8` |
| 21 | Farm III, slot 1; retain Hall II | `63ee5d17-ed14-4d27-9aab-5151b204f877` |
| 26 | Farm III, slot 1; retain Hall II | `0bcaa4ad-2fdd-4178-a75a-7eae5825d99c` |
| 36 | Farm III, slot 1; retain Hall II | `79daa6bf-0942-43e3-aa5c-b31595bb2dd1` |
| 43 | Market III, slot 1; retain Hall II | `2a307f0d-b839-46a0-98ea-0b7acc140004` |

Prepared command IDs and account bindings are protected server-side. Revalidate exact waiting instructions and owned identity before each submission. A transport-uncertain cancellation retains its command ID; missing receipt never permits a new cancellation ID or blind replay.

## Later provider interruption

Agent 36 turn `19e3bcc9-4174-4a4a-987c-7012bd19eb72` ran from `2026-10-13T06:01:26.783Z` to `06:02:57.792Z` (08:01–08:02 Berlin), ending `CODEX_CANCELLED` after the approximately ninety-second bound. One execution, zero game actions and no pending command. Ledger `5286130e-c69a-4d0e-a4e7-21696f32772c` remains unknown with its full 40,000 allocation and null exact usage. Admission is paused, 49 agents are ready and Agent 36 needs review.

Read-only process inspection found no remaining UID-995 Codex child or execution lock. The ephemeral CLI's retained thread/log databases have zero rows, so exact usage is unavailable. The prior reviewed unknown is a separate preserved record. Current engineering instructions require each new uncertainty to have its own review; no automatic acknowledgment or refund was performed. Concrete recovery requires retaining both unknown records and allocations, reviewing this cancelled turn without replay, then resuming the same original schedule after release acceptance.

Protected evidence is under `/var/lib/fleet/state/reliability-20261013`; credentials, private worlds, correspondence and raw contexts stay outside Git.

## Actual owner recovery and first release

The founder approved the five exact cancellations, Agent 36's new uncertainty review with allocation retained, and same-cohort resumption. Fleet `14531d2` was deployed first. A protected database backup was restored in a networkless temporary PostgreSQL instance; complete rows in all seven tracked tables matched. All seven tables also matched across service replacement. Operator configuration was restored byte-for-byte. Both `/health` endpoints returned real JSON success and both services reported the reviewed image revision with zero restarts.

All five exact cancellations returned `COMMITTED`; authenticated owned reads confirmed the specified instruction was removed, the other waiting job retained and no construction deadlock remained. They are separate audited owner actions, not fabricated agent commitments. The new timeout was reviewed through existing guarded methods, retaining its original ledger row, unknown marker, full 40,000 allocation and original counters; no action or execution was replayed. Historical accounts, cohort settings, original turns/ledgers/communications/owner decisions and pilot/draft agent rows passed preservation checks (only the approved timeout turn's state changed).

The same fifty resumed at `2026-10-13T08:47:58Z`. The prerequisite/feedback refinement was subsequently verified and the group paused at a quiescent boundary, without aborting an execution. At **10:55:19 Berlin / 08:55:19 UTC**, all fifty freshly reconstructed candidate inputs fit with the additional prerequisites included (maximum **23,928 bytes**), all requested markers retained, and **zero owned construction deadlocks**. Final refinement deployment and full-round live observations are recorded below only after completion.

## Subscription route assessment

Fleet currently uses fresh ephemeral `codex exec` decisions with one shared ChatGPT login. The fifty game accounts do not represent fifty model subscriptions. The game/account/controller boundary can retain its identities and receipts with another provider.

Official [Sign in with ChatGPT plan usage](https://developers.openai.com/siwc/token-sharing-open-source) now documents eligible Responses inference for open-source/local apps, including [self-hosted VMs](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms). Direct [models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) use an application-specific OAuth registration/consent and the public Responses endpoint. This is a cleaner candidate for decision-only Fleet calls: no coding-agent subprocess is necessary. It still shares the account's approved plan allowance and needs account-specific model catalog verification; Luna availability on this route is not certified here.

A separate provider implementation should persist its own stable VM host ID, client registration, PKCE/state/nonce, consented credentials and refresh lifecycle; expose connect/disconnect/usage in the console; use `store:false`, `stream:true` and complete terminal-event/usage handling; preserve no-blind-retry and unknown-outcome gates. [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) exclude several normal Responses options, including a hard `max_output_tokens` parameter and hosted MCP. Fleet already executes game tools separately. Do not reuse a Codex OAuth client/cache for the new registration, claim unrestricted subscription API access, or silently change the consumed cohort's provider/model. Hosted commercial use has a separate eligibility path. No Sign in with ChatGPT registration, login, inference or migration was performed in this assignment.
