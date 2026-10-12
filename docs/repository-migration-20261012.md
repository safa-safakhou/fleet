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
