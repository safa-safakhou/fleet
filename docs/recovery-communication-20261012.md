# Continuous-owner recovery and communication — 12 October 2026

Founder assignment: fix the seven blocked owners, prevent recurrence, investigate communication blockers/incentives and explain actual decision-model use. This covers the same fifty-account continuous run; no historical population, terminal pilot or inactive learning draft is restarted.

## Authenticated diagnosis

Original receipt-only checks returned explicit MCP `RECEIPT_NOT_FOUND` for all seven, without resubmission or inference. Owned world and guide reads verified the exact account/kingdom bindings.

- Owners 02/05/07/32: `INVALID_LEVEL`; a farm or barracks level-2 instruction was proposed when that building had already reached level 2. PACT validates this before reserving construction resources; failure rolls back its transaction.
- Owners 20/33: `TICK_PENDING`, a temporary world-clock admission wait. PACT rejects admission before committing the command, rather than recording a receipt.
- Owner 44: `OWNER_APPROVAL_REQUIRED` after a Court join was refused by the agent surface and local owner bridge without an exception policy. No owner submission occurred. Court membership remains human-only; restarting the agent is not approval to join.

Fleet's denial whitelist omitted the first two codes, and the no-policy fallback refusal escaped rejection handling. Stored commands therefore remained marked uncertain and prevented future claims. A missing receipt alone is not evidence of rejection: historical recovery also uses the recorded closed error, reviewed PACT rollback/admission behavior and authenticated state, under this explicit founder recovery assignment. Protected diagnosis snapshots and original command IDs/actions stay outside Git.

## Corrections

Explicit known MCP/HTTP business denials become finished rejected outcomes with zero committed actions, allowing the next normal scheduled turn. HTTP 5xx, unknown codes and transport failures remain uncertain and retain pending commands. A no-policy fallback refusal preserves the actual remote denial. Model context distinguishes explicit rejection from a game receipt.

The action catalog excludes owner-only kinds unless an existing concrete synthetic-owner policy covers them. An owner-only choice is deferred before opening a lease or creating a command. Fresh building-level/busy observations also supply preflight feedback within the existing decision limit. These are observation checks, not replacement authority/resource calculations; PACT still validates every submission.

The encrypted `command_resolutions` archive preserves original command IDs, exact actions, source and evidence before clearing an active pending marker. Operator-only rejection review requires a paused/quiescent nonterminal group, exact stored ID/code, authenticated identity/state, explicit missing receipt and substantive review note. It refuses actual receipts, uncertain responses, unsupported codes and unsettled provider usage. It never replays a command or invents a receipt. Agent resumption is separate.

Recovery archive bodies are operational state retained independently of 30-day observation traces. Inspection redacts secret-like fields and withholds bodies without observation consent. Timeline/archive views label operator review distinctly from a game receipt.

## Communication

Authenticated reads confirmed zero contacts/requests, `agent_decides` delegation, free introductions/no stock shortfall, and normal capacity: 20 sender envelopes/minute, burst 10, 16 MiB pending-message and 1 MiB pending-introduction storage. Public search for the group's actual name returned eight other real Fleet kingdoms on its first page with more pages available. No capacity, funds or delegation block was observed.

The former starting context had no public player IDs, diplomacy lesson or common action schemas. Two decisions could be exhausted on discovery/schema reads before a social action; unfiltered discovery also listed older players without demonstrated activity. Useful facts were available through tools but not initially supplied. The repair reads one rotating public page using the group name and actual API identities, bounded to eight peers, with a public-page fallback if empty. It preloads small development/diplomacy rule sections and common contact/message/building/training schemas. No other account's private state or direct game-database access is used. Two decisions, serial inference, fifteen-minute scheduling, identities and mandates remain unchanged.

Introductions, delegated answers, messages and nonbinding proposals remain agent choices. No contact, acceptance, message, agreement, resource advantage, reward or extra model call is forced to fill Society. Identical early resources and independent conservative goals may also make trade less attractive; this is a strategic hypothesis, not established causation. Actual post-release scheduled choices must measure negotiation.

## Decision models

Active agent decisions use `gpt-6-luna`, medium reasoning, through the dedicated Codex CLI route. It chooses read/action/wait from bounded observations and its strategy, with optional retained notes/read checkpoints. PACT's `pact_decision_support_v2` supplies deterministic exact costs, prerequisites, forecasts and candidate blueprints; it does not commit actions. No separate trained ranking/decision selector, reinforcement learning or online model training is implemented in this Fleet. Scheduling, authority, accounting and recovery are deterministic controller logic.

## Verification

Linux acceptance passed 40 unit and 94 isolated PostgreSQL integration tests (134 total). Twelve new cases cover closed denials staying scheduled, same-code 5xx uncertainty, exact encrypted archival, preflight/human-only deferral, no-policy owner refusal, reviewed recovery without inference/replay, receipt/transport/terminal/unknown-usage refusal and useful initial social context without forced communication. Existing two-agent discover → request → delegated answer → message/ingestion fixtures still pass. Endpoint authentication rejection passes. Type/format/core-boundary checks, local/Docker builds and audit passed; nonfatal CSS specificity warnings remain.

The first run had two assertions incorrectly asking the intentionally restricted global projection for a pending action body. They were corrected to inspect the retained database record; the state machine already retained the exact action. Final source after the provenance adjustment again passed all 134 tests, Docker checks/build and audit. Deployment/live acceptance follow below.

## First deployment, recovery and live context correction

Release `f0bd3af131993b41ac6a9fb42b1146c689bb95bd` was deployed after a quiescent admission drain. Protected backup/archive verification preceded migration. All original seven-table hashes matched before/after deployment: 3 cohorts, 60 agents, 350 turns, 678 ledger records, zero communications/owner decisions and 27 audit events. The seven exact commands were then explicitly reviewed and archived, all seven agents separately made ready, and the same group resumed. Protected recovery proof at 17:07:45.887 Berlin verified unchanged identity/strategy, model/budget/anchor/policy and all 678 ledger rows, with no inference/replay/permission change during recovery.

Ordinary live turns exposed `CONTEXT_LIMIT` before any inference: the added initial facts plus retained history exceeded the previous fixed fallback. The group was drained/paused again without unsettled usage. A protected reproduction from the largest retained-cache owner measured 38,103 serialized bytes, or 29,266 after the old fallback, against 24,000. Its bodies remain outside Git.

The corrected generic input packer counts the serialized message envelope **and** separate output schema before choosing compaction, then reduces dated read-cache allocation adaptively. Current facts, action shapes, identities and command results stay whole; omitted cache/descriptions are disclosed. PACT's initial projection also removes duplicate avatar records and repeated rate prose while retaining original numeric/resource/authority fields. The private captured reproduction now fits at **21,938 bytes**, without model calls. Final Linux acceptance passes **42 unit + 94 PostgreSQL integration tests (136 total)**, build/core checks and zero-vulnerability audit. New tests cover multibyte historical observations, exact schema/peer/receipt preservation, separate schema accounting and failure before inference for oversized indispensable data.

## Corrected deployment and initial live evidence

Release `eb052069341f7d783df93cd7da1fe6197f9fb1e8` is deployed. A second protected backup preceded replacement, and all seven-table hashes matched at the paused boundary: 3 cohorts, 60 agents, 357 turns, 678 ledger records, zero communications/owner decisions and 43 audit events. The seven archived original commands remained preserved. The same group resumed; public Fleet/PACT health passed, and no historical group resumed.

At 17:24:58.638 Berlin, ordinary post-correction scheduling had produced 17 finished turns plus one in progress: six `COMMITTED`, seven `READ`, four `WAIT`, ten total committed actions and zero unknown usage. All fifty agents were ready, with no pending command/attention state. Recovered owners 02/05/07 had completed actual new Luna turns with two, two and one committed actions respectively; the other recovered owners were awaiting their normal phase slots. There were no new context-limit outcomes after the corrected release.

Agent 49 independently chose and committed a contact request to the publicly observed Fleet owner 50. Authenticated guide readback showed an outgoing request and no accepted contact yet. Agent 14 subsequently committed another introduction on its normal schedule. These are actual model-chosen introductions, not forced contacts or proof of an accepted relationship, message, negotiation or contract. The fifteen-minute recipient schedule can itself delay acceptance and subsequent dialogue by one or more turns. Society still had zero recorded exchanges at this early snapshot.

Live browser verification showed all fifty scheduled/working with zero needing attention, actual new activity, and owner 02's original rejection in its inspector with a separately labelled operator-review event and encrypted recovery archive. Normal command receipts and reviewed rejections remain distinct.

## Final acceptance

At **17:38:11.342 Berlin**, all seven recovered owners had completed at least one actual scheduled Luna turn and each had committed at least one new action. Owners 02/05/07 had also reached their next cycle without freezing. Owner 44 chose a permitted contact request rather than an owner-only Court action. The group remained running, all fifty identities ready, zero pending commands and zero unknown usage. Post-correction totals were 61 finished turns plus one in flight: sixteen `COMMITTED`, twenty-one `WAIT`, twenty-two `READ`, one `INVALID_COMMAND` and one `INVALID_TOOL_ARGUMENTS`, with 26 committed actions. Those ordinary denials did not block their owners. No new context-limit result occurred in this observed interval; indefinite endurance is not claimed.

Five introductions were actually committed by owners 49/14/29/43/44, directed at publicly observed owners 50/50/01/01/33. Authenticated receiver checks confirmed the incoming requests and `agent_decides` delegation. Owners 01 and 50 had subsequent turns prioritizing construction/waiting rather than acceptance; owner 33's new request arrived after its previous slot. There were still zero accepted contacts/recorded messages at that snapshot. Discovery/information bottlenecks are repaired and introduction capability is demonstrated, but reciprocal dialogue/negotiation remains unproven and influenced by model choices, objectives and scheduling. No acceptance, message or incentive was fabricated or forced.

Final public Fleet/PACT health passed. PACT API/database retained their original start times. The isolated PostgreSQL test container/network and the two verification image tags were removed; live and rollback releases, protected backups and operational proofs remain. Host free space was about 27 GiB. The live dashboard was left open with fifty working/scheduled and zero attention/pending indicators. Private screenshots, correspondence, captured context and operational snapshots remain outside Git. Code and evidence are locally committed; no GitHub push or new population was performed.
