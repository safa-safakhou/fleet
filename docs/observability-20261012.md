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

Release, quiescent deployment and live evidence follow after completion. Synthetic fixture bodies, screenshots, grants, correspondence and operational snapshots stay outside Git.
