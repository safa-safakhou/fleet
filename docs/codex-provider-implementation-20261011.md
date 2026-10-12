# Codex provider implementation — 11 October 2026

## Assignment and outcome

The founder authorized adding subscription-backed Codex CLI, proper synthetic testing and commits, explicitly forbidding agent launch until model and budget selection. The separate fleet now supports `codex-cli` alongside its existing HTTP routes. No live inference, login/credential transfer, account enrollment, scheduling activation or deployment occurred. Historical PACT runs remain untouched.

## Implementation

- Native Linux subprocess adapter with explicit model, protected dedicated ChatGPT file-auth home, per-execution auth-method check and forced ChatGPT/OpenAI route. No API-key fallback or inherited fleet/provider credentials.
- Ephemeral isolated contexts, stdin facts, simple strict output envelope and validated inner decision. Normal fleet/PACT ownership, write leases, command IDs, receipts and claim fences remain authoritative.
- Bounded output/timeout, TERM-to-KILL cancellation and descendant cleanup, sanitized failures, temporary-file removal, shared-home execution lock and deliberately manual crash-lock recovery.
- Console provider choice, explicit execution-accounting consent, serial admission and separate measured usage. Charges retain reservations and increase on overruns; unknown/overrun/failure/expired-worker outcomes stop cohort admission before further gameplay.
- Setup/operations documentation covering device login, protected refreshable cache, CLI/version requirements, native service/container containment and deferred live acceptance.

## Verification

All subprocess tests launch a synthetic Node executable, never real Codex inference. Database tests use only the dedicated loopback `fleet_test` PostgreSQL database and fake game interfaces.

- `npm test`: **32/32 unit checks passed**, including 16 new Codex tests for auth rejection, separate contexts, explicit route, secret exclusion, malformed/failed/duplicate events, absent usage, oversized output, cancellation of an uncooperative process and child, shared-home exclusion and setup rejection.
- `npm run test:integration`: **53/53 passed**, including 12 new checks for budget consent/concurrency, actual fixture subprocess decisions through the controller, usage recording/overruns/unknowns, disabled execution, expired worker recovery, cancellation on pause and preservation of terminal stops/deadlines during late usage or crash recovery.
- `npm run build`: Node server and production React build passed.
- `npm run check`: strict TypeScript and Biome passed without errors; existing style/config warnings remain.
- Installed Windows CLI `0.162.0-alpha.17.2` help/parser accepts required execution flags; no authentication cache was inspected and no inference was invoked. This is flag evidence, not a native Linux/live route certificate.
- Browser preview: route selector displays the subscription option; choosing it in the **unsaved** form changes the limit label to executions and exposes required accounting consent. Model and budget remain unselected; live execution stays disabled. No preview settings were saved. [Captured synthetic form](verification/codex-provider.png).

## Remaining acceptance

Select the model and budget before native server CLI/login setup and a specifically bounded live certification. Subscription eligibility, provider schema acceptance, latency, token distribution, actual dialogue quality and account throughput are not established by fixtures. Codex executions have post-hoc measured tokens rather than a guaranteed hard sampling cap. The default image contains no native CLI/auth mount; later private worker packaging is documented, not deployed. No cohort was started by this assignment.
