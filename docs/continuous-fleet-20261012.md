# Continuous fifty-agent Fleet — 12 October 2026

The founder explicitly requested 50 account-connected PACT agents, Luna, a 15-minute schedule, indefinite execution and dashboard observation. This new assignment authorizes enrollment, model inference, observation and launch. Historical finished pilots and populations remain unchanged; the learning draft remains inactive.

## Implementation

Continuous compute selection has `mode=continuous`, explicit continuous consent, and null lifetime call/token ceilings and deadline. Individual two-minute turns, at most 90-second executions, bounded decisions/actions, serial Codex use, per-execution reservation/usage checks and lifetime accounting remain. Unknown provider usage, uncertain command outcomes, identity mismatches and provider failures preserve existing pause/recovery semantics. Continuous does not mean bypassing provider quotas or game authority.

The worker's SQL expiry checks ignore a null end time; each continuous claim receives a real bounded turn deadline. Reservations skip only global allowance admission, retain normal turn ceilings and write the lifetime ledger. Finite/daily cohorts retain their existing exact deadlines and ceilings. Consumed selection remains immutable. Permanent stop remains terminal; pause/resume retains identities and all counters.

The console offers **Until stopped** and displays lifetime accounting, model reasoning, decisions per turn and individual account/kingdom IDs. Private participating dialogue/agreement observation can be enabled for this explicitly consented synthetic group. The dashboard shows actual outcomes and observations, not model chain of thought or invented messages. Its latest-turn view remains bounded; the durable database retains the original turn history. Conversation observation retention remains 30 days.

## Launch configuration

Group: `Luna 50 continuous 20261012`, cohort `bf6eb294-316f-4225-a7b2-957f3f452a34`, 50 fresh account-bound agents, balanced strategy families (10 each), `gpt-6-luna`, medium reasoning, Codex CLI subscription route. Each owner is scheduled every 15 minutes with 18-second phase spacing; concurrency one. Two decisions/actions maximum per turn allow headroom for the 50-owner serial schedule. Late slots skip rather than generating catch-up bursts. Provider latency/quota can delay or interrupt admission; exact throughput must be observed, not inferred from the interval.

There is no automatic end time or lifetime call/token ceiling. The founder's explicit indefinite instruction covers this mode and shared subscription accounting. The server retains the dedicated protected Codex login and independent Fleet database/vault. Models receive game observations, not owner/operator credentials. No historical account is reused.

## Implementation acceptance

Type/format checks, core game-boundary checks, local production build and Linux Docker build pass (seven existing lint warnings and one informational diagnostic). Linux acceptance passes **40 unit + 75 PostgreSQL integration tests, 115 total**, including 50 distinct staggered identities through two cycles, simulated ten-year pause/resume, retained lifetime accounting beyond former finite ceilings, bounded turn admission, terminal stop and Codex unknown-usage recovery. The authenticated console API can save continuous selection while execution is disabled without enrolling accounts or starting turns. Full and production dependency audits report zero vulnerabilities.

The first Linux test archive included macOS metadata sidecar files that the runner mistook for test sources; all actual 40 unit cases passed but sidecar discovery failed. Repacked without metadata, rebuilt, and the complete clean acceptance above passed. Isolated test database/container/network were removed; no production database was used for those tests.

## Deployment and actual launch

Committed release `c9670c8d455972cf079e90d5162fdc9e67a48c89` was built/deployed to `/opt/fleet/current` with execution disabled, then the protected live flag was enabled for the explicitly authorized new draft. The dedicated Codex home reported ChatGPT login. All prior groups were non-running before enabling; no historical group resumed.

Serial enrollment successfully connected **50 distinct PACT accounts and 50 distinct kingdoms**, all with ready credentials. Each stable entry key and encrypted rotating grant is retained against its agent ID. Mandates allow normal world/inbox reads, contact messages/requests, building/training, supply signatures, scouting, raid commitments and transfers, with resource limits 600,000 internal units per resource, a grain reserve of 12,000 internal units, troop limit 1,000 and one session. Social delegation was explicitly set to `agent_decides` with authenticated receipt/readback. No synthetic-owner exception policy was added, and game permissions/stock/prerequisites remain authoritative.

The original two cohorts and their ten agent records, all original turns/usage/pending commands and audit entries matched the protected pre-launch hashes after excluding only the new cohort's records. The finished five-owner pilot and inactive learning draft are unchanged. Private before/enrolled PostgreSQL custom backups and matching configuration are under `/var/lib/fleet/backups/continuous-launch-20261012`; restore archive lists passed. Protected run configuration, stable bindings and preservation evidence are in `/var/lib/fleet/state/continuous-*-20261012.json`; credentials and correspondence remain outside Git.

The new group started at **12 October 2026 15:20:56.733 Berlin** (`13:20:56.733Z`). State was `running`, all 50 accounts/kingdoms bound and ready, observation enabled and no end time. Actual browser readback at the public HTTPS console displayed 50 connected accounts, Luna medium, the 15-minute stagger and **Until stopped · lifetime usage retained**. Account/kingdom IDs are visible on agent cards, and history records outcomes and summaries.

Initial acceptance observed one completed turn for each of the five strategy families: three `COMMITTED` turns with three game writes, one `READ` turn and one `INVALID_TOOL_ARGUMENTS` turn. A sixth turn was in flight. Twelve Codex executions were reserved: eleven reported 159,355 input + 1,564 output tokens, one still in flight, **zero unknown-status ledger rows**. All fifty agents remained ready and the group running. The dashboard's existing “without complete usage” / “Usage unknown” count also includes in-flight reservations; an in-flight execution is not a confirmed unknown-usage failure. Actual usage continues to grow after this snapshot.

No conversation was observed in this early snapshot. Observation is enabled, but no negotiation, contract, long-term throughput, complete first 50-owner cycle or rate-limit endurance is claimed from these initial turns. The run remains active after handoff under the founder's indefinite authorization. Pause is reversible and keeps the same identities; permanent stop is terminal. Future provider/identity/uncertain-command failures can pause admission for inspection rather than silently resetting state or replaying commands.
