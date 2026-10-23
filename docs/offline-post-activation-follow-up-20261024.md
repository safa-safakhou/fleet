# Offline post-activation follow-up — 24 October 2026

The user approved the 30-minute offline plan, inline, no model calls or worker/game activation. All three tasks completed: activation records reconciled, a separate read-only status helper implemented and checked, and installed configuration compared with focused source/integration evidence. Work began at 00:02:12 Europe/Berlin (22:02:12 UTC on 23 October); final completion time is recorded in the private ledger. No services or immutable package/request files were changed, and no real inference ran.

## Activation and running status

Both repository checkpoints now record the explicitly approved [isolated-console activation](isolated-console-activation-20261023.md), superseding the earlier stopped/awaiting-approval checkpoint. Approval, activation result, original request, control script and pre-activation proof hashes match. Historical failures and the completed six-call allowance remain closed.

Private `status-console.mjs` and `status-console.test.mjs` were added outside the immutable package. Eighteen tests first failed with the missing implementation and then passed. They cover stopped/reused PIDs, wrong executable/directory, environment drift, foreign/wildcard listeners, live-enabled or unhealthy state, container ownership, task/heartbeat activity, unexpected candidate processes, a PID change during inspection, safe output and no mutation/provider ports. Database inspection uses one checked-out client with a repeatable-read, read-only transaction; the ownership marker is checked before workload tables.

The real status check passed for original PID 1069049 at `http://127.0.0.1:38765`: exact identity and environment, sole loopback listener, game-disabled health, no worker, zero cohorts/agents/turns/allocations/tasks/task claims/commands/worker health/worker heartbeats. The helper never invokes the old pre-start check, starts/stops a service, creates a login session or calls a provider.

Run status without printing credentials:

```sh
/home/mnim/.local/share/fleet-candidate-final-facts-20261023-2141/runtime/node /home/mnim/.local/share/fleet-candidate-final-facts-20261023-2141/status-console.mjs
```

Exit 0 means the approved empty, live-disabled console matches its running contract. A mismatch returns a bounded error and nonzero exit; it does not attempt repair or restart. Worker absence is expected, not an error. The helper is private installation-specific tooling, not a generally shipped CLI. It is also tested against changed identity during inspection; as with any status snapshot, it is not continuous monitoring.

## Installed configuration versus qualification

The exact saved configuration matches the original pinned settings digest. A separate positively owned, read-only database inspection found:

- `FLEET_PACT_FACT_REQUESTS` absent; parsed request count zero.
- Zero cohort profiles, `read-final.v3` profiles, environment bindings, launch drafts/requests, agents, tasks, allocations, commands and worker records.
- Only native Ollama at `http://127.0.0.1:11434` is configured as an HTTP model route. No alternate HTTP route or Codex executable is configured. No actor model profile exists because no actor is enrolled; this does not claim a global model allowlist. Any later model assignment remains limited to Nemotron 4B.
- `FLEET_LIVE_ENABLED=0` and the non-game endpoint remain unchanged.

This is the approved empty-console state, not a failed installation or reason to enable settings. The real four-case qualification used synthetic requested facts with `read-final.v3`; it did not configure actual owner requests or enroll an installed actor.

| Behavior | Source/offline evidence | Existing real Nemotron evidence | Installed state |
| --- | --- | --- | --- |
| Request parsing and authenticated scope | Strict parser/tracker tests; production adapter binding test, unknown → known, zero submitted commands | Not a real native PACT-server/model end-to-end trial | No requests/bindings |
| Schema → scoped read → final | Focused engine tests and bounded fake-HTTP integration | Passed in three of the prior six calls | No active v3 profile |
| Pending-request proposal | Native proposal/schema checks with fake providers | Passed in one prior call; memory-only proposal | No actors/requests |
| Unavailable/unknown facts | Typed blocker, unresolved wait, scope/reconciliation guards | Passed in one prior call | No configured requests |
| Legitimately known literal | Renderer/reconciliation and engine tests | Passed in one prior call | No configured requests |
| Invented provenance and native rejection | Known-fact summary bypass refused; native action refusal before persistence/dispatch | Prior passing four-case matrix only; not every adversarial branch | Source installed, workload absent |
| Historical identity/unknown command preservation | Selected binding test retains unknown reservation, exact pending command and encrypted identity; earlier independent restore/rollback proof remains accepted | No new real trial | Existing worlds untouched |

Fresh verification: **35 focused unit tests passed** in three files; **62 isolated integration tests passed** (57 specialist HTTP, five environment-binding tests). The integration command used `scripts/test-architecture-offline.ts --repo fleet --suite integration` with only the two selected test files and fresh owned fixtures, never the installed or retained-world databases. Fake model providers were used; zero actual inference calls. No application source change was needed. Full prior unit/build/audit acceptance is historical evidence and was not rerun or claimed fresh here.

## Remaining work and decision

No additional offline source fix or real-model trial is currently justified by a demonstrated failure. To use the specialist workflow beyond an empty console, first define one owner task, its authenticated entity/read request, model/budget and explicit v3 profile as a separately reviewed configuration proposal. That proposal can be prepared without enrolling actors, restarting services or enabling execution. No such task/configuration was silently chosen here.

After a concrete proposal exposes an uncovered behavior, a separately authorized game-free probe may target only that gap, with a newly frozen candidate/fixture, at most six calls / ten minutes, no retries and stop on first failure. The earlier allowance remains closed. No probe is automatically scheduled or authorized by this report.

Ordinary-instance promotion and autostart are optional operational decisions. Broader negotiation/gameplay qualification is not established; game execution remains disabled and E4/KQ1 stay blocked and unrun. No worker, enrollment, service restart or execution-setting change occurred. Existing services and paused worlds remain preserved. Review was inline self-review under the user's no-delegation instruction; there was no independent reviewer.

## Private evidence

Root: `/home/mnim/.local/share/fleet-candidate-final-facts-20261023-2141/`. Secrets, private configuration and raw traces remain outside Git.

| Artifact | SHA-256 |
| --- | --- |
| status-console.mjs | `26d45cc3cbc55ca4d3c7cffe21b614eca2ed664b8feb2a66d38976bc13a68181` |
| status-console.test.mjs | `0291cb46e74f6eb4080f6bb46869252ddc1ddff2af7a61f787a617329411a893` |
| running-status-20261024.json | `b4cd10145e7fbdf7a397230232eefa15537aa1a3bf1bca38ee10325d1394e9fd` |
| installed-profile-coverage-20261024.json | `5343c752e7a82f8c1e979a44502e6fa90db19d296d695b1e2f5b8786a7cc2c58` |
| offline-focused-unit-20261024.log | `3f653351084af56df7949f34e4cd4a2fc9cb493b690942f49acc303fa4715b19` |
| offline-wiring-integration-20261024.log | `d52d4eb4c60d901709336eb1a489ceb079e39f535554241b17f178ed193bc98a` |
