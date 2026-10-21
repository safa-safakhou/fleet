# Fleet agent instructions

Fleet is an independent Node 24/TypeScript/Fastify/React/PostgreSQL 17 agent controller.
Work inline; do not delegate unless the user explicitly requests it.

## Scope and preservation

- Follow the current assignment. Historical launch/recovery/publication grants are not standing permission for new actions.
- Preserve the paused world, public services, identities, encrypted grants/history, goals, mandates, counters, budgets, schedules/anchors, terminal states, queues and exact pending commands.
- Never discard or blindly replay an uncertain command or clear unknown model usage. Same-live lease renewal cannot reacquire a lost lease.
- Source/documentation work does not authorize inference, game runs, enrollment, deployment, reset, cancellation/recovery review or execution-setting changes. Push only under covering current authorization.
- Keep credentials, operator secrets, private correspondence, dumps and decrypted evidence out of Git/logs.

## Read only what the task needs

Start with the user request, working-tree status and relevant source/tests. Read [current state](docs/current-state.md) for milestone status, next-work selection or operational work. Do not load the entire history, handbook or all plans before routine edits.

| Task | Read as needed |
|---|---|
| Controller/game boundary | [Game integration](docs/game-integration.md) |
| Durable task/engine host | [Platform host](docs/platform-host-20261017.md), affected src/platform and tests |
| Cognition/memory | [Cognition](docs/cognition.md) |
| Operations/recovery | [Operator guide](docs/operator-guide.md), [operations](docs/operations.md), then the exact relevant receipt/grant |
| Provider route | [Codex provider guide](docs/codex-provider.md), actual selected adapter/configuration |
| Negotiation | [Paired plan](docs/superpowers/plans/2026-10-20-two-kingdom-negotiation.md) |
| Independent specialists/skills | [Specialist plan](docs/superpowers/plans/2026-10-20-autonomous-specialists.md), then only the relevant engine/platform/skills subplan |

Use scoped rg/file reads; graph tools are optional when useful. Search relevant source directories first, inspect matching sections and bounded logs, and consult dated evidence only when needed. No routine whole-repository indexing or report ingestion.

## Engineering invariants

- Scheduler, accounting, vault, providers and turn execution are game-independent. src/game.ts defines the game adapter contract; src/games/pact owns PACT-specific behavior.
- PACT remains authoritative for gameplay and permission. Do not import game source/databases into deployed runtime. Existing isolated paired fixtures are test-only, not another runtime authority.
- One deployment uses its reviewed game integration. Fake second-game checks do not certify another real game or provider.
- Preserve original command/receipt IDs across waits, restart and reconciliation. Settle known model usage before review; unknown usage retains its full reservation and null measurements.
- Keep versions, dependency pins, authority/privacy boundaries and native accounting intact. No silent provider/model fallback or invented delivery/qualification.
- Fix the assigned problem without opportunistically starting deferred plans or changing installed runtimes.

## Verify and hand off

Use package.json and the relevant runbook for checks proportional to the change. Documentation-only edits need link/content checks and git diff --check, not the application suite.
For code, run affected tests plus applicable check/build/boundary/audit checks. Integration tests use fresh isolated fleet_test fixtures and fake providers, never retained databases/default live routes.
Where available, test:architecture provides owned paired fixtures. Linux is required for Codex process fixtures; do not claim a skipped platform suite passed.
Commit verified changes when requested. Report actual checks, remaining blockers and source versus live acceptance; rerun/broaden checks when changes or failures justify it.

Keep this file under 5 KB. Update current-state.md in place; keep detailed reports/plans as on-demand references. The [original instruction snapshot](docs/reference/agent-instructions-before-20261021.txt) is historical reference, not current authorization.
