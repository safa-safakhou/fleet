# Fleet repository migration — 12 October 2026

Founder assignment: move the latest independently deployed fleet into the newly cloned sibling `fleet` repository, prepare a reusable game boundary and rebuild/deploy from this repository. This authorizes code separation, synthetic tests, commits and deployment; it does not authorize a new population or inference run.

## Source and implementation

Imported the reviewed source files, tests, public PACT action artifact and historical reports from server release `/opt/pact-agent-fleet/releases/654d3c1`, image `pact-agent-fleet:luna-pilot-20261012-11`. The server release has no Git metadata and the original WSL repository is not available on this machine, so this repository starts with a documented source snapshot; it does not claim to preserve the original commit objects. Deployment scripts, private state, secrets and server-generated archives were excluded. Historical reports retain their original commit references and acceptance limits.

`src/game.ts` is the explicit injected integration contract. Core scheduling, budgets, reservations, identity checks, model transports, vault, bounded turns, command persistence/recovery and the communication journal contain no PACT tool or action dependency. PACT-specific schemas, credential provisioning/OAuth, MCP transport, owner exceptions, context projections, peer discovery and message/agreement decoding live in `src/games/pact/`. The current console and deployment composition select PACT. A synthetic board-game adapter verifies the shared turn path without PACT-shaped reads or actions; it is not another real-game integration.

The package/image/project name is Fleet. `FLEET_GAME=pact` and `FLEET_GAME_BASE_URL` select the supported integration; the previous `PACT_BASE_URL` remains a compatibility fallback. Unsupported games fail before connecting or starting services. See [game integration](game-integration.md).

## Preservation and deployment acceptance

The rebuild must use committed source from this repository, independent fresh Fleet containers/database volume and copied protected runtime state. Preserve the existing vault key and exact account bindings, all 87 compute ledger records, immutable pilot model/budget/deadline, 31 turns, pending command/action and terminal cohort. Deployment is disabled. Original PACT game processes retain their uptime; legacy fleet services stop after verification and are retained for rollback. No identity provision/start script or provider certification runs.

## Verified engineering checks

The final Linux build image passed type/format checks, the game-boundary check and production build. `npm test -- --maxWorkers=1` passed 39 unit tests (including all Linux Codex process fixtures); `npm run test:integration` passed 72 PostgreSQL integration tests using only an isolated `fleet_test` database and fake model/game ports, for 111 total. Full and production dependency audits report zero vulnerabilities. Existing checks report seven warnings and one informational diagnostic; no errors. Local macOS unit checks explicitly skip the Linux Codex suite; Linux is the complete acceptance result. Both deployment scripts pass `bash -n`.

The verification Docker target now includes migrations, fixtures and dev dependencies; the production image prunes dev dependencies separately. An initial packaging check caught missing migrations in the test image and was corrected before successful full acceptance. No real model calls were used in verification.

The first remote deployment invocation exposed Compose's default interactive stdin consuming the remaining streamed shell script after starting the database. The script now explicitly disables stdin/TTY for one-off containers. No application or model execution started from that interrupted invocation; the terminal restored database remains intact. Actual deployment results follow after final checks.


## Actual deployment result

Committed implementation `1ea48f1` and deployment-harness correction `e778f08` are verified. Release `e778f08a755f8fe93b78616da622a76118d1d427` is deployed from this repository at `/opt/fleet/current`, image `fleet:e778f08a755f8fe93b78616da622a76118d1d427`, with matching OCI repository/revision labels. Compose project `fleet` owns new console/worker containers, a fresh `fleet_fleet_database` volume and separate network. Protected state, configuration and pre-migration backup are under `/var/lib/fleet`.

The old worker was stopped before the database backup; the old console stopped after restoring into the fresh database. `pg_dump --format=custom` and `pg_restore --exit-on-error` succeeded. SHA-256 proofs over complete sorted rows match for cohorts, agents, turns, compute ledger, communications, owner decisions and audit records. Counts remain one finished cohort, five original agents, 31 turns, 87 compute records, zero retained communications, zero owner decisions and 15 audit records. The exact pending command/action, identity/grant ciphertexts, immutable model/budget/deadline and lifetime counters are unchanged. Thirty turns are finished and one remains pending; no command replay or identity replacement occurred. Copied encrypted baseline/final snapshots and original pilot state remain protected.

Health returns `ok:true`, `service:fleet`, `game:pact`, `liveEnabled:false`. The worker heartbeat is fresh and execution-disabled; console/worker have zero restarts. Anonymous `/api/state` returns HTTP 401. The original PACT production container IDs are identical before/after, establishing no replacement or restart of the game services. Legacy `pact-agent-fleet` console/worker remain stopped; its healthy database, state and latest image remain intact for rollback. No provider login, certification, model call, provisioning or gameplay command was performed by this migration.

Only temporary images/build artifacts created during this migration were selected for cleanup; existing PACT images, game backups, protected state and original rollback image are retained. Verification logs remain under `/opt/fleet/verification/20261012`. This same-host backup is not off-host disaster recovery. The console remains loopback-only at `127.0.0.1:8820`, accessible through a trusted SSH tunnel.

The Git remote remains the user's configured `git@github.com:safa-safakhou/fleet.git`; these changes are committed locally and deployed by a committed source archive, without a GitHub push. Future acceptance remains a separately authorized small live run proving communication and sensible gameplay under the repaired controller. The finished pilot is never resumed.
