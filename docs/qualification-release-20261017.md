# F8 qualification and release proposal — 17 October 2026

F8 completes source/offline qualification and a disarmed release proposal. It does not install a release or qualify a real provider. Implementation pin: `8c83be5da23b7bae2cbcdfb8986b696ffcd2ec28`; PACT counterpart: `177ad6cf48888131d86f4aef879b97ff64d47c33`. The following documentation commit packages this report/manifest and an additional saved-proposal regression; implementation source matches the pin. No PACT source change was needed.

## Delivered

- `qualifyProfile` validates exact reviewed profile capabilities/schema IDs, complete scoped evidence and actual supplied output samples using `qualifyOutput`. Fake/live evidence stays separate; mixed instances/source/configurations/routes, stale adapter descriptors, failed/incomplete evidence and delivery-limit failures cannot qualify a profile.
- `reviewProfileRelease` shares all existing preservation/quiescence/authority/deployment gates while allowing environment-neutral actor/cohort selection. It checks exact source/configuration/route evidence, finite time/call/token caps, serial concurrency, unique identities, intended rounds, monitoring and stop conditions. The legacy API remains unchanged. An explicit dependency gate retains the actual audit failure.
- [Compatibility matrix](multi-engine-compatibility-20261017.md), [operator/artifact contract](profile-qualification.md), [concrete release/run proposal](multi-engine-release-proposal-20261017.md) and [machine manifest](multi-engine-release-manifest-20261017.json). No cohorts/routes are selected; proposal execution eligibility and all operational execution remain disabled. Proposed future ceilings are recommendations requiring exact selection/authorization, not granted allowances.
- New acceptance checks compare all five reviewed descriptors against actual runtime registration and PACT's base/events/outlook combinations. The synthetic second environment qualifies generic profiles without PACT identities. The new preservation rehearsal verifies coexistence, idempotent migration/restart, full unknown allocation/history, original pending ID and receipt-only settlement without replay.

## Verification

All commands ran locally in the existing isolated worktrees. Full logs and author review are protected under `/home/mnim/.local/share/fleet-phase0-validation-20261017/phase6-implementation-ledger`. CI, physical provider behavior and deployed acceptance are not claimed.

| Command | Result |
| --- | --- |
| Fleet `npm run check` | Type/style passed; existing non-failing style diagnostics remain |
| Fleet `npm run check:boundaries` | Passed, including recursive platform/engine boundaries |
| Fleet `npm test` | Final 185 unit checks  /43 files passed; includes saved disarmed proposal |
| Fleet `npm run test:integration` | 326 checks  /39 files passed, serial owned loopback 5437/fleet_test |
| Fleet `npm run test:acceptance` with explicit PACT root and loopback 5438/pact_test | 12 checks  /2 files passed: actual PACT contracts/handlers plus five-profile matrix |
| Fleet `npm run build` / `npm audit` / `git diff --check` | Passed /0 vulnerabilities /passed |
| PACT `npm run build` / `typecheck` / `lint` | Passed, including contracts/boundaries/build order; existing bundle-size/style warnings remain |
| PACT `npm test` | 389 checks /124 files passed |
| PACT `npm run test:integration -- --maxWorkers=2` | 465 passed /66 files; 1 pre-existing optional real-provider skip; 195.08 seconds |
| PACT `npm run eval:offline` | 2 checks passed (also part of unit suite) |
| PACT backlog render/check / diff check | Passed; 181 tickets, 37 release criteria, source snapshots match |
| PACT `npm audit` and JSON detail | **Failed:** 23 findings: 16 high, 7 moderate; unchanged Expo dependency tree; release blocker |
| Pinned `src/engine.ts` byte comparison with c212373ccca98d3e064d24ebd2a9398dd94e2a77 | Identical |
| Saved manifest via compiled `reviewProfileRelease` | Not ready; execution eligibility false; rollback/authority/deployment/quiescence/run-selection/run-authorization/dependency blockers retained |

The initial qualification/release/audit-gate tests failed before their implementation; protected red logs retain those failures. The final complete unit/type/build checks include the pure review audit gate; the full integration run covers the unchanged runtime/preservation code. The later saved-proposal test adds no runtime behavior. PACT's two-worker limit avoids the previously established fixture migration-lock contention; no test timeout or application bound was expanded.

The audit's three direct advisory paths are [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv) and [uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq); npm counts affected dependency paths among 23 total entries. No new dependency was added. The suggested automatic fix is a major Expo downgrade, so no forced dependency rewrite was applied in this qualification phase. Triage/fix and exact-revision requalification remain necessary before release.

## Preservation and limits

Read-only repeatable-read snapshots before/after the work match all 22 non-ephemeral installed local application-table hashes exactly; only worker heartbeat/health and operator sessions are excluded. Installed current still resolves to `7093cb8782e1b81df1ebddfd24a00eec9927b5b5`. Both original ten-account cohorts retain running intent; all 20 agents remain needs_owner with ready credentials, 0 running turns, 10121 retained turns and 40 historical unknown allocations totaling 1600000 conservative tokens. A separate read-only observation saw 0 pending command IDs and no OAuth attempt rows; it did not fence workers or certify future quiescence. No review, reconnect, resume, replay, cancellation, new accounts or model calls occurred. Server Fleet was never contacted. Installed local console/worker/helpers and all allowances/anchors/settings were untouched. The owned PACT test container was stopped after acceptance.

Actual target encrypted restore/rollback rehearsal and full older-worker execution compatibility were not performed: their gates remain unresolved. The proposal explicitly keeps old workers away from unsupported new-profile cohorts and retains the newest database/state/task migrations. Source rollback cannot undo game effects/history. No provider route is certified; fake-labelled artifacts inside unit tests only test Boolean review behavior. PACT still rejects F6 before inference. Browser saved-file certification remains F7's documented limitation. Deterministic tests/scenarios do not prove model intelligence, causality or real-host deadline performance.

Author review was performed without delegation under repository instructions; this is weaker than independent review. Source branches/worktrees are retained. No merge, push, deployment or new experiment was performed. The next work is resolving release blockers and selecting an authorized local installation/provider plan; no additional phase/run starts automatically.
