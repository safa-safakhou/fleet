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
