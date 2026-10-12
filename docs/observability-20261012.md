# Fleet observability — 12 October 2026

Founder assignment: explain empty Society, improve activity visibility and make an individual agent inspectable. The existing fifty-owner continuous Luna run remains authorized and unchanged.

## Diagnosis

At the initial check, the group was running with observation enabled and zero communications. There were 31 finished turns: 19 read-only, 11 committed with 11 writes, one invalid tool-argument result; another turn was in progress. All fifty agents were ready. This is no recorded exchange, not an idle fleet. The old Society default did not explain that distinction. Final summaries alone could not show intermediate reads and action results. No social behavior was forced to fill the page, and missing historical steps are not reconstructed.

Subsequent authenticated read-only checks succeeded for all fifty owners and found zero contact links, with no additional inference. By 16:12 Berlin, five agents needed owner attention: three unresolved `INVALID_LEVEL` building commands, one `TICK_PENDING` building command and one `OWNER_APPROVAL_REQUIRED` Court command. Their original pending IDs/actions remain preserved and inspectable; this assignment does not clear/replay them or expand authority.

## Changes

- Overview is the default: group state, fifty-agent map, current phase, next scheduled owner, attention indicators, recent activity and read/wait/error/pending totals.
- Agents support search and status filters. Cards show lifetime turns/actions and last intent with an inspector button. Identity details move into the inspector.
- The inspector shows strategy, current work, schedule, account/kingdom, usage, in-flight versus unknown executions, consented notes, dated read-checkpoint metadata and expandable timelines. It polls every five seconds in a native focus-trapping dialog with Escape/close support.
- Turn history has stable cursor pages scoped to the selected group/agent, with older-page loading beyond the global latest 100. Lifetime metrics use complete retained history.
- Society explains why recorded game activity may exist without messages; in-flight reservations no longer appear as unknown-usage failures.

## Telemetry and privacy

The generic engine records context readiness, model-call stages, returned summaries, validated read tool/arguments and prepared actions/results. Pending-command/result events share the corresponding transaction. Observation does not bypass authority, fences, leases or budget checks, add inference, or make game reads when someone opens a page.

The indexed `turn_events` table encrypts consented private details with event-bound associated data, redacts credential-like keys and explicitly omits payloads over 8 KiB. No provider prompts, stderr, credentials or hidden reasoning are stored. Read traces show validated arguments and response field/size metadata, not every response body. UI text is escaped; it cannot issue model-selected commands or URLs.

Consent and capture serialize on the cohort row. Revocation clears detail ciphertext; re-enabling does not restore it. Inspector notes/read metadata are withheld without consent. Detailed steps use the existing 30-day observation retention. Original turns, identities, pending commands and compute accounting remain; old/expired traces have an explicit coverage notice.

## Pre-deployment verification

Linux acceptance passed **40 unit + 82 PostgreSQL integration tests (122 total)**. New cases cover ordered reads/decisions/action receipts without extra inference, live phase, in-flight versus unknown usage, redaction, revocation/concurrent capture, complete 110-turn pagination with tied timestamps, lifetime totals, retention without deleting identities or turns, and consented inspection of stored pending bodies without modification or replay. Type/format checks, game-core boundaries, local/Docker builds and full dependency audit passed. Non-failing CSS specificity warnings remain; no lint errors.

An isolated `fleet_demo` preview used fictional accounts and fake game/model ports. Actual browser checks verified the fifty-agent map, a thinking agent, searchable roster (ten guardians), inspector strategy/notes, an ordered action/result timeline and history. At 390 pixels wide the inspector had no horizontal overflow; the viewport was reset. No real accounts or inference were created by the preview.

## Deployment and live verification

Committed source **347453b2e61e408bbb063eaf244793b5975cc623** was built before pausing admission and deployed at a quiescent boundary. The claim advisory lock allowed an existing turn to finish; no running turn or reserved/unknown provider usage remained before pause. Protected custom-format database and configuration backups were verified under `/var/lib/fleet/backups/observability-20261012`.

Before resumption, exact row hashes matched across all seven existing state tables: 3 cohorts, 60 agents, 232 turns, 470 compute-ledger entries, zero communications/owner decisions and 25 audit events. This includes the terminal pilot, inactive learning draft, continuous identities, encrypted credentials, counters and original pending commands. Migration only added the observation table/indexes. The same previously running group resumed, with model `gpt-6-luna`, 50 owners, 15-minute interval and original settings retained. PACT API/database uptime remained unchanged; both public health endpoints passed and Fleet reported execution permitted.

Live browser acceptance verified the fifty-agent map, actual thinking phase, ten guardian search results, attention filtering, native-dialog Escape, and an inspector's real read → model → building submission → `COMMITTED` receipt timeline. Agent 06's 16:37 Berlin turn showed decision-support reads followed by barracks level 2 in slot 1. Agent 02's older `INVALID_LEVEL` turn exposed its stored pending farm-level-2 command, with an explicit missing-step notice and no replay. History loaded 151 rows across older pages while normal new turns continued, exceeding the former 100-turn window.

At the 16:40 Berlin verification, the group remained running with 43 ready agents, seven needing owner attention and zero unknown usage. Pending outcomes were four `INVALID_LEVEL` building commands (02/05/07/32), two `TICK_PENDING` building commands (20/33) and one Court owner-approval command (44). This is the observed diagnostic state, not certification that all owners can advance or communicate reliably. These outcomes remain for separate recovery work.

Detailed live events were present and encrypted across observation, readiness, thinking, decisions, reads, actions, results and completion. No forced inference, gameplay command, new account, mandate expansion or pending-command reset was used to demonstrate the UI. The isolated preview/database were removed after acceptance. Synthetic fixture bodies, screenshots, grants, correspondence and operational snapshots stay outside Git.
