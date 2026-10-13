# Fleet

An independent server controller and private console for scheduled game agents. Scheduling, budgets, model execution, memory and command recovery use an injected game adapter. PACT is the first supported integration; additional games need their own authenticated adapter and acceptance tests. Fleet has its own database, processes, credentials and repository and never connects to a game's database.

The [focused PACT discovery source change](docs/discovery-20261013.md) replaces directory traversal with filtered, varied kingdom shortlists on compatible game releases. It is verified locally; rollout remains separate.

For day-to-day console use, read the [operator guide](docs/operator-guide.md): draft setup, model/allowance selection, accounts, monitoring, pause and recovery.

The independent [five-account Mac Nemotron installation](docs/local-nemotron-20261013.md) runs its controller, database, dashboard and inference on this Mac, every fifteen minutes until stopped. It is separate from the server Luna cohort.

The [13 October P1 controller report](docs/p1-controller-20261013.md) records verified fresh-read delivery, persisted memory, action-permission and construction-recovery fixes. The [subsequent deployment and recovery](docs/p1-deployment-20261013.md) deployed these changes and resumed the same fifty-owner Luna group, preserving its accounts, counters and fifteen-minute schedule. The reviewed cancelled execution's full allocation and historical unknown-usage marker remain visible.

Latest: [the reliability follow-up](docs/reliability-follow-up-20261013.md) records the deployed context/read-correction changes, five exact owner queue recoveries, the second reviewed timeout, 168 tests and an observed fifty-agent round. Scheduler health and cleared deadlocks remain distinct from weak planning/communication. Sign in with ChatGPT is assessed as a future provider; the current cohort still uses Codex.

The completed five-agent Luna pilot is preserved. A subsequent founder assignment requests 50 fresh account-bound Luna agents on a continuous 15-minute schedule; see [its implementation and launch record](docs/continuous-fleet-20261012.md) for actual status. See also [the migration report](docs/repository-migration-20261012.md), [adapter contract](docs/game-integration.md) and [final pilot results](docs/luna-pilot-final-20261012.md).

## Features

- Draft 1–1,000 agents with stable identities and balanced guardian, expansionist, merchant, diplomat and opportunist values. Values influence preferences; they do not prescribe messages or guarantee behavior.
- Persist staggered 10/15/30/60 minute schedules. Workers claim due agents atomically, skip missed slots, share concurrency limits and retain lifetime usage and exact pending commands across restarts.
- Observe, request additional reads, decide and commit in bounded turns. The normal PACT rules and authenticated account authority apply. Optional explicit synthetic-owner command policies support reviewed exceptions without exposing owner credentials to models.
- Connect an existing account using OAuth/PKCE or explicitly provision a new synthetic account after launch is authorized. Encrypted rotating credentials are account-bound; uncertain refresh requires reconnect rather than replacing the identity.
- Private responsive console: agents, turn receipts, fleet settings, complete retained message pages and agreement revisions/signatures/contracts. Observation requires cohort consent and records only information actually delivered to participating accounts.
- Conservative persisted call/token reservations, separately reported usage and unknown usage. No paid-provider billing estimate or live throughput certification is implied.

## Local development and isolated tests

Requires Node 24, Docker and npm. The Codex process fixtures require Linux; macOS skips that unit suite, and full acceptance runs it in the Linux build image. Commands run from this repository:

```sh
npm ci
docker compose -f compose.test.yml up -d --wait
npm run check
npm run check:boundaries
npm test
npm run test:integration
npm run build
docker compose -f compose.test.yml down
```

`npm run demo` seeds fictional conversations only when `FLEET_DEMO=1`, live execution is disabled and the selected database is named `fleet_demo`. It refuses a previously seeded database. Use a separate database and private operator/vault settings; then run the console to preview it. No accounts or model calls are made.

The test PostgreSQL instance uses only synthetic credentials and its own loopback port 5437. Integration tests **truncate their dedicated `fleet_test` database**. Never point `FLEET_TEST_DATABASE_URL` at a real database. Fake model/game adapters make no inference or production game calls.

## Installation, with agents disabled

Copy `.env.example` to a private `.env`, generate an independent 32-byte base64 vault key and a long operator password, and configure the fleet's own database password. Keep that file and backups outside Git. Losing the vault key loses access to encrypted grants and observations. Model settings and budget are chosen in the console, but the provider endpoint and API secret belong in protected server configuration.

```sh
docker compose build
docker compose up -d database
docker compose run --rm console node dist/server/migrate.js
docker compose up -d console worker
```

Console binds only `127.0.0.1:8820`; use a secured HTTPS reverse proxy or SSH tunnel on a server. Set `FLEET_ORIGIN` to the exact console origin for login/CSRF and OAuth callbacks. With `FLEET_LIVE_ENABLED=0`, workers heartbeat without connecting to PACT or any inference provider. Base containers have a combined 1 GiB / 1 CPU limit (the Codex override raises memory to 1.25 GiB); this is an infrastructure cap, not measured account capacity.

After a separately approved launch, set the selected endpoint/credentials and live flag, restart services, configure the immutable compute allowance, connect accounts and explicitly start a cohort. Pausing cancels further admission and fences late decisions. Permanent stop and finite deadlines are terminal. Uncertain command outcomes require receipt inspection; never recreate a pending command or reset counters. Budget reservations are never refunded, even after timeouts.

For bulk synthetic enrollment, mount a protected explicit mandate JSON file and run `node dist/server/provision.js COHORT_UUID /protected/mandate.json`. It proceeds serially and retains previously persisted entry keys and identities when interrupted. It skips connected accounts, refuses personal-account recovery and never starts the cohort. Individual OAuth connection/reconnection is available in the console. Unknown refresh needs reconnect; reviewed non-command failures can be marked reviewed before separately resuming the agent. Pending commands cannot be discarded through that review action.

## Decision support and communication

The controller exposes PACT's current authenticated reads, exact decision-support calculations and action schemas. Optional [LLM-centered continuity](docs/cognition.md) supplies episodic memory, reflection, persistent plans and revisable social beliefs while the LLM retains strategic judgment. An evaluated local Laya helper can selectively order recalled memories; uncertain/unavailable answers fall back visibly. Plans never queue commands and beliefs never grant authority. VW is unused and no longer offered for new configuration. The [subsequent local deployment](docs/cognition-local-deployment-20261013.md) enables cognition and Laya for the same five Nemotron agents while preserving accounts/history/budgets; the server fleet is unchanged. Operational acceptance does not establish human-like gameplay.

Peer messages are game data. Models may use them for strategy, but messages cannot change ownership or expose credentials. There are no scripted required greetings or bargains. The console distinguishes valid decisions, committed actions, dialogue and contracts; absence of evidence is shown explicitly.

Each turn observes one rotating contact from the delivered guide and its latest available message/agreement pages, then observes successful outgoing messages. Additional contacts/pages remain available through game reads. Large pages are retained in the console but explicitly omitted from the compact model context when necessary; no claim of complete social coverage is made. The console refreshes the selected exchange and supports stable older-page cursors. Observation retention is 30 days. Original game timestamps and observation timestamps are distinct; they do not establish a negotiation's real wall-clock duration.

Adapters support Ollama `/api/chat` with bounded output and immediate unload, an explicitly selected API-compatible `/chat/completions` endpoint with JSON output, and native Linux Codex CLI with ChatGPT subscription authentication. They do not silently switch models. The [Codex setup and accounting guide](docs/codex-provider.md) explains protected login, execution-based allowances and required live certification. Actual provider/account/scheduler certification remains a launch prerequisite. See [Ollama's chat API](https://docs.ollama.com/api/chat) and [OpenAI's Chat API](https://developers.openai.com/api/reference/resources/chat).

The PACT integration's public action artifact in `vendor/` is explicitly exported and checked by digest; no PACT rules or database credentials are copied. Update it only after reviewing a PACT contract change. The game remains authoritative.
