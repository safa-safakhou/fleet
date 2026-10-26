# Two live fleet rounds with doubled limits

The owner authorized unpausing the retained world, observing two fleet rounds with doubled limits and pinned Nemotron 4B, then pausing and reporting. Work was inline, without GUI or delegation. E4/KQ1 remained blocked.

## Actual result

The same world ran **25 October 2026, 23:08:45–23:35:38 Berlin**, approximately **26 minutes 54 seconds**. The independent monitor verified two scheduled reviews for each of the **20 eligible kingdoms**, then requested closure before the 30-minute ceiling. Three additional turns also occurred. The four original unresolved kingdoms remained held; there was no reset or uncertainty review.

Native receipts and state establish:

- **Two Barracks II orders committed and both upgrades completed**, in two kingdoms.
- **Two troop-training orders committed**.
- **One introduction request committed**, still pending at the end.
- **Zero new accepted contacts, messages, supply offers or supply contracts**. No Farm II or Hall II completion occurred during this segment.

There were **43 turns and 48 reported model calls**, consuming **460,045 input + 14,205 output = 474,250 tokens**. Outcomes were five confirmed-action turns, 36 zero-action waits and two malformed-read failures. The five action turns are labelled `WAIT` in the current turn records; the effect counts above use command receipts and native state instead of that label.

## By architecture

| Architecture | Participating kingdoms | Turns | Calls | Actual outcome |
|---|---:|---:|---:|---|
| Legacy loop @1 | 3 | 6 | 6 | Six zero-action waits |
| Legacy cognition @1 | 3 | 7 | 7 | Seven zero-action waits |
| Reactive basic @1 | 3 | 6 | 6 | Six zero-action waits |
| Reactive cognition @1 | 3 | 6 | 6 | Six zero-action waits; no packing refusal |
| Reactive cognition @1.1 | 3 | 6 | 6 | Six zero-action waits; no packing refusal |
| Reactive cognition @2 | 3 | 7 | 7 | Five zero-action waits; two `INVALID_READ_QUERY` failures |
| Specialist coordinator @1 | 2 | 5 | 10 | All five confirmed effects: two building orders, two training orders, one introduction |
| Autonomous specialists @1 | 0 | 0 | 0 | Three original held kingdoms did not participate |

One additional coordinator kingdom retained its pre-existing fenced/unknown turn. An early commentary incorrectly attributed the read failure to legacy cognition; the per-architecture database query above corrects that attribution. Both failures belong to reactive cognition @2. A captured failing response nested `schemaId`, `query` and `summary` inside its read query rather than supplying the supported native read shape. No repair/retry trial was started during this observation.

## Event-delivery defect exposed by the introduction

The introduction targeted an **active, unheld v1.1 kingdom**, after that kingdom's second periodic review. The recipient had no subsequent turn before shutdown. Its policy subscribed to contact events, its intake cursor continued updating, but no task source appeared for the request.

Read-only inspection established why this run did not exercise native event wakes:

1. The local startup launched PACT API/rules plus Fleet/provider/supervision, **omitting the notification worker that runs the agent-event projector**.
2. The new `contact.requested.v1`, two building-completion events and three observed training-unit completion events existed in the native outbox, with no `agent-events-v1` delivery or agent-journal row.
3. The world's `agent_events` table contained zero rows at inspection. Polling that feed could not deliver the introduction or construction completions.

The publisher is wired through [the notification worker](../../pact/workers/notification/src/main.ts) and [AgentEventProjector.processBatch](../../pact/packages/kingdom/src/agent-events.ts). The API constructs the feed reader/authorizer but does not run its projection loop. This is an **operational startup defect in the run tooling used here**, not evidence that the recipient model rejected or ignored a delivered request.

No publisher was started mid-run, no queued events were marked delivered, and no gameplay command was replayed. The native backlog remains preserved. Event-triggered interaction is unqualified; a complete conversation was not demonstrated. Fixing startup/supervision for this required worker and verifying event-to-task delivery remain concrete next work, outside this observation's runtime changes.

## Limits, preflight and capacity

The 20 eligible cohorts retained **64,000-byte logical inputs**. Four held cohorts stayed at 32,000. Native action/call/output limits, lifetime budgets, model settings, owner intent and schedule anchors were preserved. The same hash-pinned Nemotron 4B served with a **32,768-token context**, four configured slots and 94 physical/92 admissible cache blocks; exact token/cache admission remained enabled. This does not promise four simultaneous full 32K contexts.

Current source was built and staged. Twenty-one focused offline runtime/credential/scope checks, type/style (existing warnings/information), the five-minute 301-sample Windows/WSL clock check, native builds and pre-run encrypted restore passed. The Fleet stage had 213 artifact hashes and 220 source/control pins; PACT source/artifact pins were recorded separately. No source behavior was changed during the live run.

All 48 model calls reported usage. No new input-capacity refusal, provider transport/schema failure, authentication/lease failure, stale-command rejection or unknown usage was recorded. Provider metrics observed **four running requests**, **three waiting**, **zero preemptions**, and peak GPU allocation **13,989 MiB / 16,303 MiB**. Waiting requests are disclosed; four running requests do not establish 24-hour throughput acceptance.

## Final preservation

Admission closed on `TWO_SCHEDULED_FLEET_ROUNDS_OBSERVED`. Final verified state:

- World paused at **tick 659**, from 633; all 24 cohorts paused.
- Owned worker, PACT API/rules, supervisor, guardian and provider stopped. The round monitor exited.
- Zero running turns, capacity leases or pending/unknown platform commands; zero new unknown model allocations.
- All four original unknown rows unchanged; cohort budget-limit/model/anchor pins match the activation baseline. New usage and legitimate game effects remain retained.
- Encrypted restore matched **167 PACT / 77 Fleet tables**. GPU returned to **1,645 MiB** after shutdown.

Private continuation: `/home/mnim/.local/share/pact-fresh-24h-20261025-232152eb/continuations/doubled-two-rounds-08518ccd`; pointer `/tmp/pact-doubled-rounds-root`. Evidence includes the baseline, scheduled coverage, receipts, native before/after state, event-publication observations, postflight proof and complete encrypted restore. Credentials and private correspondence remain outside Git. No commit, push or 24-hour run.

This run establishes real construction progress and an outgoing introduction under the larger limits. Most architectures still chose waits, and native event publication was missing. It does not qualify full interaction, all eight live architectures or sustained autonomous play.
