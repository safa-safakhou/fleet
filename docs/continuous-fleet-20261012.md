# Continuous fifty-agent Fleet — 12 October 2026

The founder explicitly requested 50 account-connected PACT agents, Luna, a 15-minute schedule, indefinite execution and dashboard observation. This new assignment authorizes enrollment, model inference, observation and launch. Historical finished pilots and populations remain unchanged; the learning draft remains inactive.

## Implementation

Continuous compute selection has `mode=continuous`, explicit continuous consent, and null lifetime call/token ceilings and deadline. Individual two-minute turns, at most 90-second executions, bounded decisions/actions, serial Codex use, per-execution reservation/usage checks and lifetime accounting remain. Unknown provider usage, uncertain command outcomes, identity mismatches and provider failures preserve existing pause/recovery semantics. Continuous does not mean bypassing provider quotas or game authority.

The worker's SQL expiry checks ignore a null end time; each continuous claim receives a real bounded turn deadline. Reservations skip only global allowance admission, retain normal turn ceilings and write the lifetime ledger. Finite/daily cohorts retain their existing exact deadlines and ceilings. Consumed selection remains immutable. Permanent stop remains terminal; pause/resume retains identities and all counters.

The console offers **Until stopped** and displays lifetime accounting, model reasoning, decisions per turn and individual account/kingdom IDs. Private participating dialogue/agreement observation can be enabled for this explicitly consented synthetic group. The dashboard shows actual outcomes and observations, not model chain of thought or invented messages. Its latest-turn view remains bounded; the durable database retains the original turn history. Conversation observation retention remains 30 days.

## Launch configuration

Planned group: `Luna 50 continuous 20261012`, 50 fresh account-bound agents, balanced strategy families (10 each), `gpt-6-luna`, medium reasoning, Codex CLI subscription route. Each owner is scheduled every 15 minutes with 18-second phase spacing; concurrency one. Two decisions/actions maximum per turn allow headroom for the 50-owner serial schedule. Late slots skip rather than generating catch-up bursts. Provider latency/quota can delay or interrupt admission; exact throughput must be observed, not inferred from the interval.

There is no automatic end time or lifetime call/token ceiling. The founder's explicit indefinite instruction covers this mode and shared subscription accounting. The server retains the dedicated protected Codex login and independent Fleet database/vault. Models receive game observations, not owner/operator credentials. No historical account is reused.

## Implementation acceptance

Type/format checks, core game-boundary checks, local production build and Linux Docker build pass (seven existing lint warnings and one informational diagnostic). Linux acceptance passes **40 unit + 75 PostgreSQL integration tests, 115 total**, including 50 distinct staggered identities through two cycles, simulated ten-year pause/resume, retained lifetime accounting beyond former finite ceilings, bounded turn admission, terminal stop and Codex unknown-usage recovery. The authenticated console API can save continuous selection while execution is disabled without enrolling accounts or starting turns. Full and production dependency audits report zero vulnerabilities.

The first Linux test archive included macOS metadata sidecar files that the runner mistook for test sources; all actual 40 unit cases passed but sidecar discovery failed. Repacked without metadata, rebuilt, and the complete clean acceptance above passed. Isolated test database/container/network were removed; no production database was used for those tests.

Actual deployment/enrollment/launch results follow after they pass. Private configuration, entry keys, tokens, database backups and account correspondence remain outside Git.
