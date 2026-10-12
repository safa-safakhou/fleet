# P1 controller implementation — 13 October 2026

Status: locally implemented and verified; not deployed. Assignee: Codex. Founder scope: requested read feedback, eight-entry encrypted memory, honest action permissions, construction dependency recovery and associated invalid-read correction from PACT's `docs/implementation/fleet-agent-investigation-plan-20261013.md`. No Linear issue was invented. P2 candidate ranking, motivation, offer timing and policy/game redesign remain deferred.

## Behavior

- A selected read has a protected `requestedRead` slot. Optional historical knowledge is evicted first; the full serialized messages and separate decision schema must fit the existing allowance before reservation/inference. Oversized results are explicitly incomplete, preserve whole executable shapes/records and identify omitted fields plus the exact read-schema lookup. Unsupported narrower filters must not be invented; dependent actions can be deferred. Fresh owned world/authority reads update subsequent preflight facts without rebinding identity.
- Four dated rule/schema entries and four dated state entries survive encryption and PostgreSQL round trips. Start/authority guides count as changing state, not stable rules. Duplicate tool/argument keys replace old observations. The checkpoint is at most eight entries / 24,000 bytes; per-entry and checkpoint expiry remains 24 hours. A last-decision request retains one delivery marker across restart and the next scheduled turn; a valid decision consumes that marker. Invalid/provider-unknown decisions do not consume it. Previously discarded historical reads cannot be reconstructed.
- Every reviewed action has a capability row. All six human-only game actions, plus non-game human actions, require an already saved concrete owner policy. Observed missing mandates and manual social delegation exclude the ordinary agent route; existing explicit owner exceptions remain labelled as such and still use the audited owner endpoint/budget. The matrix is advertisement, never authority: OAuth scope, write lease, ownership, mandate version/limits, delegation allowlists, quotas, stock, exact permits and prerequisites remain enforced by PACT. No permission/mandate or owner policy was expanded.
- PACT's owned world projection now exposes next-upgrade checks and missing Hall dependencies for non-Hall waiting jobs, using its existing pure `checkUpgrade`. It changes neither queue admission nor economy. Fleet evaluates reachable queued prerequisites, active completions and occupied waiting positions. It distinguishes prerequisite deadlock from temporary/unknown waits; stock/authority may still delay theoretically reachable jobs. New queues that consume the last waiting position without reachable prerequisites are deferred before lease/command creation. Existing queues are preserved. Consented inspector events show blocked instruction IDs, target levels, missing buildings and actual-owner cancellation options. No autonomous cancellation occurs.
- Invalid arguments for a catalog-admitted read record a sanitized pre-default argument snapshot, schema digest and first field-validation errors before any read is sent. Correction uses only the remaining existing decision budget. Secret-like fields are redacted and retained detail still requires observation consent. Unknown/write tools remain forbidden.

## Verification

The final Fleet build image uses Node 24.21.0 on Linux. All model/process fixtures are synthetic; no subscription execution or production game mutation occurred.

| Check | Actual result |
| --- | --- |
| Fleet `npm run check`, `npm run check:boundaries`, `npm run build` in Docker build target | Passed; existing lint warnings remain |
| Fleet Linux `npm test` | 47 passed, zero skips |
| Fleet Linux `npm run test:integration` | 104 passed, including Codex subprocess cancellation/accounting, pending-command recovery, identities, second-game boundary and 10 new P1 database tests |
| Opt-in Fleet/PACT acceptance against PACT's built public packages and isolated PostgreSQL | 6 passed: complete game contract-kind agreement, six real human-only refusals under a valid lease, scope/lease/mandate refusal, manual contact delegation, three real permitted deadlock reconstructions and exact human cancellation; private projection absent from outsiders |
| PACT world views, buildings and game-command-fault integration suites | 53 passed |
| PACT pure rules catalog suite | 7 passed |
| PACT full build, typecheck, lint/boundaries/build-order/published-contract checks | Passed; 26 published v1 schemas unchanged |
| Fleet production dependency audit | Zero findings |
| PACT production dependency audit | Existing unchanged dependency tree reports 23 findings (7 moderate / 16 high), principally Expo/Metro, braces, node-forge and uuid; no dependency changes made |
| Both repositories `git diff --check` | Passed |

Total: **217 tests passed**. macOS's Linux-only process tests were not used to claim acceptance: the first native integration run had four expected `CODEX_LINUX_REQUIRED` failures, and the full Linux suite subsequently passed. An initial Docker database hostname was correctly rejected by the isolation guard; final Linux tests share only the dedicated test database's network namespace and connect over loopback.

A clean archive of pre-fix Fleet `f6d7aa9` failed the two new requested-delivery/checkpoint regression cases: no protected requested-result slot and only three decrypted checkpoint entries. The updated controller passes those cases, plus expiry, stale fencing, category eviction, fresh-level preflight, end-of-turn delivery across restart, sanitized correction, human-only deferral, UTF-8 envelope bounds, construction cycles/active progress and new-deadlock prevention. Synthetic graph cycles test analyzer behavior; they are not evidence that PACT admits those cycles. The cross-repository tests reconstruct permitted Hall/non-Hall queue deadlocks through actual handlers rather than corrupting accounting tables.

### Reproduce cross-repository acceptance

First build the sibling PACT checkout. Create a separate PostgreSQL 17 instance at loopback 5438 with database `pact_test`; it must not be any game's production database. The acceptance suite creates/drops its own migrated `test_fleet_p1_*` schema and refuses other hosts/database names/ports.

```sh
PACT_ACCEPTANCE_ROOT=/absolute/path/to/pact \
PACT_ACCEPTANCE_DATABASE_URL=postgres://pact_test:isolated_fixture@127.0.0.1:5438/pact_test \
npx vitest run tests/acceptance/pact.test.ts --maxWorkers=1
```

Fleet's normal integration database remains its separate `fleet_test` fixture on port 5437. Linux acceptance used `docker build --target build -t fleet:p1-validation .`, then ran `npm test` and `npm run test:integration` in that image with the fixture's network namespace, `FLEET_TEST_DATABASE_URL=postgres://fleet_test:isolated_fixture@127.0.0.1:5432/fleet_test`.

## Preservation baseline and readback

Read-only production observation: Luna 50 continuous remains paused, 49 ready and one needs owner (`CODEX_CANCELLED`), 1,362 turns, 2,122 calls, 218 committed actions; one unknown ledger entry. Pilot remains finished and learning draft remains unconfigured/stopped. No production mutations, model calls or gameplay commands were made.

Full-table hashes captured and checked again after verification over SSH (no private row contents exported):

| Table | Rows | Identical before/after digest |
| --- | ---: | --- |
| agents | 60 | `64436054be676d08b922bd5f4b6747de` |
| turns | 1,393 | `b19d62bc2fe059f13b03fc769ba5b639` |
| compute_ledger | 2,209 | `b92504ad1ae1474b145cfe6c658984db` |
| cohorts | 3 | `69d05d6d51269d64c9afb57db9e1dcdf` |

These complete-row hashes include account/entity IDs, encrypted grants, settings, lifetime counters and pending fields. Counts include historical groups, unlike continuous-only totals. All match exactly. Production is still the previous release; these checks do not certify a new deployment.

## Concrete rollout proposal, pending founder approval

1. Build/release PACT's private owned-world projection first, using the reviewed local commit. No schema migration, rule change, permission expansion or gameplay command is required.
2. Release Fleet's verified controller/inspector commit with the current group kept paused. Retain PostgreSQL/vault/state mounts and all original accounts, encrypted grants, counters, schedules, pending IDs and unknown usage. Verify health and repeat complete-row preservation checks at a quiescent boundary. Keep prior images for rollback.
3. Inspect the unresolved Codex cancellation/unknown reservation separately. Never refund/reset usage or silently mark it reported. Deployment does not authorize resuming it or cancelling the five owners' construction queues.
4. After a separately covered recovery/resume decision, observe the same existing owners' subsequent scheduled turns. Do not create accounts, change model/turn limits, force messages or launch an extra experiment.

Old PACT projections remain readable but cannot supply all next-upgrade dependency evidence; unavailable checks are explicitly unknown. The dashboard improvements and new-deadlock prevention are not live until both commits are deployed. No success in bargaining or trained decision-selector effectiveness is claimed.
