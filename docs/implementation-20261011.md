# Separate agent fleet implementation — 11 October 2026

Founder assignment: implement the independent scheduled agent fleet, differing strategies and private communication dashboard; test and commit. Select the model and budget before starting agents. Implementation assignee: Codex. No live population, provider request, remote deployment or scheduler enrollment was performed.

## Delivered and verified

| Work | Status | Evidence |
| --- | --- | --- |
| FLEET-001 independent storage/configuration | Done | Own Git repository, PostgreSQL migrations, credential vault, disabled-by-default containers; isolated image smoke test |
| FLEET-002 N account-bound agents and strategies | Done | Stable drafts, five profile families, unique account/kingdom bindings, OAuth/PKCE and resumable synthetic enrollment; identity and refresh failure tests |
| FLEET-003 durable scheduling and compute allowance | Done | Persisted staggered slots, atomic claims/reservations, shared admission limits, pause/stop/deadline fences, crash recovery and UTC daily accounting tests |
| FLEET-004 bounded observe/decide/commit | Done | Fake-port read-before-action, exact receipts, missing-receipt preservation, shutdown abort, forbidden capability and owner-policy/quota tests |
| FLEET-005 communication console | Done | Browser login/draft creation, five strategies, messages/agreement tabs, revisions/signatures/delivery, keyboard dialog dismissal, 390px mobile check; encrypted consented history and 85-message pagination tests |
| FLEET-006 packaging and operations | Done | Production build, pinned Docker image build, non-root/read-only 256MiB console and worker smoke test, own database migration, Compose validation |
| Actual selected-provider/account gameplay pilot | Awaiting selection and authorization | No real model/account calls; capacity, quality, budget and actual game-route certification are not claimed |

First implementation commit: `8905381`. Recovery/dashboard verification commit: `830c253`. Subsequent verification and operations commits retain this evidence. The PACT game repository remains independent and records the handoff; no historical task status is inferred from these checks.

## Actual verification

- Node 24 type check, Biome check, 16 unit tests, 41 PostgreSQL integration tests (57 total) and production build passed locally after the last code change. Biome returns success with existing CSS specificity warnings; there are no type or lint errors.
- `npm audit` and production-only audit reported zero vulnerabilities for the pinned lockfile on this date.
- Public-contract artifact contains 58 reviewed gameplay action kinds; runtime digest verification and schema tests pass. It includes schemas, not authoritative PACT rules.
- Docker image built locally. The isolated smoke database was `fleet_container` on the test PostgreSQL instance. Both containers reported running as `node`, read-only, with 268,435,456-byte limits. Health reported `liveEnabled:false`; the database had one disabled worker heartbeat, zero agents, zero turns and zero model requests. Both smoke containers were stopped and removed.
- Browser preview uses separate `fleet_demo` data and explicitly labels every conversation fictional. Seven additional unconnected draft agents were created through the UI; no game accounts resulted. Model and budget stayed unselected; account creation and fleet start controls were disabled. The final 390px check reported document width 375px and viewport width 390px, with no horizontal overflow. Temporary viewport overrides were reset.
- [Verified fictional communication screenshot](verification/communication-dashboard.png). This contains no real correspondence.

## Important limits

The final enrollment checks cover the full mocked guest/mandate/DCR/OAuth/MCP flow, interrupted setup with the same entry key, duplicate account rejection and same-account reconnect retaining the synthetic owner binding. They identified and corrected optional resource-reserve parsing and synthetic-owner binding loss on reconnect. Fresh setup verifies both account and kingdom. These remain isolated fake-server checks, not actual PACT enrollment certification.

The model adapters and PACT transport are contract-tested with fake providers. Actual selected-model tool behavior, live OAuth callbacks, PACT owner approvals, repeated negotiations and paid spending require the approved pilot. No intelligence, communication frequency, military/Court coverage or account capacity is inferred from valid fixture JSON. Existing exact decision support is available through discovered game reads; no learned decision selector was trained or deployed.

The controller supports 1–1,000 draft records; that is not a measured concurrent inference capacity. Resources are capped independently from inference. Console observation covers delivered participant pages, and explicitly retains coverage gaps. It neither secretly reads PACT's database nor grants agents authority through peer messages. See [operations](operations.md) before launch.
