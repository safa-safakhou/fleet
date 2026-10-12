# Fleet engineering

Fleet is an independent Node 24 / TypeScript / Fastify / React / PostgreSQL 17 repository. The 12 October assignment authorizes moving the deployed fleet into this repository, extracting a reusable game integration boundary, synthetic verification, verified commits and a fresh deployment. Preserve the terminal five-agent pilot and historical experiments; deployment never authorizes a new cohort, account, inference call or deadline extension.

Prefer codebase-memory-mcp discovery; index this repository if needed. Use ordinary file reads for docs/configuration or insufficient graph results. Do not delegate unless explicitly requested.

The scheduler, accounting, vault, model adapters and turn engine own game-independent behavior. `src/game.ts` defines the game adapter contract; `src/games/pact/` owns PACT-specific tools, context projections, credential enrollment, communication decoding and owner exceptions. PACT remains the authority for its gameplay. Do not import a game's source or database at runtime. One deployment is bound to one reviewed game integration; only PACT is currently configured for real deployment. Synthetic second-game tests do not certify another real game.

Preserve exact identities, encrypted grants, counters, terminal states, pending IDs/actions and budgets during recovery/migration. A pending command is never discarded or blindly replayed. Keep model credentials, owner/operator secrets, private state, database dumps and real correspondence out of Git and logs. Existing game services must retain their state and uptime during fleet deployment.

Run `npm run check`, `npm test`, `npm run test:integration`, `npm run build`, dependency audit and the game-boundary check for affected changes. Codex process fixtures require Linux; macOS explicitly skips that unit suite, while full deployment acceptance runs it in the Linux build image. Integration tests use only a separate `fleet_test` database and fake game/model providers. Commit verified completed changes before handoff. Push and new live experiments require covering authorization.
