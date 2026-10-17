# F8 dependency qualification refresh — 17 October 2026

The founder authorized fixing PACT's dependency findings and rerunning local qualification, with server Fleet untouched and no new runs. PACT source `60ec57b98c825eb1756d63121aa53d1aaa3b3315` resolves the three root advisories behind the original23 audit entries. The saved Fleet proposal now pins that revision and has `dependencyAuditPassed:true`. It remains disarmed: no selected cohorts/provider route, no run/deployment/push authorization, unresolved target quiescence/owner recovery and encrypted rollback rehearsal. No additional gate was relaxed.

## What changed

PACT pins published UUID11.1.1 and private source backports of braces/node-forge where no upstream fixed release was available. Original names/licenses, original registry SRI and all62 retained original-file hashes, exact local hashes and reviewable source diffs remain in PACT's `vendor/security`. The Forge change matches the nested AlgorithmIdentifier condition proposed in upstream PR1152; braces bounds parser nesting and iteratively validates child depth/cycles before recursive walking. Sixteen direct regression/compatibility cases exercise actual Expo/micromatch/Xcode consumers rather than version labels.

The same Expo57.0.24 is additionally pinned at the root to overcome the confirmed workspace-link override bug; Expo/React/React Native versions are unchanged. Clean installation and a lint-integrated consumer/provenance guard prevent old nested copies from surviving unnoticed. Docker copies vendor source to both stages and its final stage requires that guard after production pruning. A real Android bundle export passed offline. No package versions outside the three resolutions changed in the lockfile.

The full PACT suite also exposed a latent test-clock rollover in A2A authorization/receipt tests. Its owned synthetic fixture now postpones its next due tick and includes a forced-expiry regression. No product game clock, permissions, rules or real schedule was changed. The failed full run and corrected input/red/green evidence are retained; the complete rerun passed.

**Audit coverage:** registry audits report0 after the fixes, including the pruned runtime image. That does not independently certify local backports or guarantee future registry coverage. Their actual patches/provenance/regressions must remain reviewed against original upstream advisories until replaced by verified upstream fixes. No advisory suppression, waiver or forced Expo downgrade was used. Detailed PACT evidence: `docs/implementation/reports/dependency-qualification-20261017.md` at the pinned commit.

## Fresh local verification

| Repository/check | Result |
| --- | --- |
| PACT pinned-npm clean install, source SRI/hash comparison and actual consumer guard | Passed |
| PACT unit |405 passed /125 files, including16 direct dependency checks |
| PACT full integration `--maxWorkers=2` |466 passed /66 files,1 existing optional real-provider skip;157.45 seconds |
| PACT build/type/lint/contracts/boundaries/build order/dependency guard |Passed; existing non-failing style/bundle warnings remain |
| PACT offline evaluation/backlog render/check/diff |Passed;181 tickets/37 release criteria and spec snapshots unchanged |
| PACT Expo offline CLI/config/Android bundle |Passed;733 modules,2.3MB Hermes artifact; no app/device/model was started |
| PACT full runtime Docker build and network-disabled read-only guard |Passed; local test image only, no application entrypoint/worker launched |
| PACT source and pruned-image audit |0 known registry findings |
| Fleet full unit / integration / actual-handler/profile acceptance |185 /326 /12 passed (523 total) |
| Fleet type/style/build/boundaries/audit |Passed;0 audit findings |
| Refreshed saved-proposal regression + compiled release review |Dependency blocker absent; execution eligibility false; all other blockers retained |
| Pinned legacy controller and installed local state |Controller byte-identical; all22 installed application-table fingerprints unchanged |

The saved-proposal test was changed first, failed against the old negative dependency flag, then passed after the verified PACT source pin/audit refresh. It explicitly asserts no selected runs, no deployment eligibility and continued blocking when a dependency finding is reintroduced. The full Fleet unit rerun includes that new assertion; the existing integration/runtime source is unchanged. Existing fake/provider distinctions and PACT F6 capability rejection remain intact. Hosted CI, actual provider skill/capacity and physical-device certification are not claimed.

Full private logs and author review are under `/home/mnim/.local/share/fleet-phase0-validation-20261017/dependency-fix-ledger`. Review was by the author under no-delegation instructions, weaker than independent review. Original F8 reports remain historical and link to this correction. Both source worktrees are retained; no merge or push was performed.

## Operational preservation

Read-only repeatable-read comparison with the F8 handoff matches all22 retained installed application tables, excluding only ephemeral heartbeat/health/operator sessions. The installed local release stays7093cb8; the same20 accounts remain needs_owner with ready credentials,10121 retained turns and40 original40000-token unknown allocations (1600000 total). No review, reconnect, replay, cancellation, resume, model/budget/schedule/anchor change, identity replacement or terminal restart occurred. Existing console/worker/helper processes were not restarted. Server Fleet was never contacted; installed PACT was not changed.

The owned PACT loopback5438 fixture was stopped after acceptance. The temporary local Docker verification tag was removed after its build/runtime checks; protected logs/native export remain available. No real-model call, new game account or live run was started. The next release work remains exact authorized target/provider selection and its outstanding preservation/recovery checks, not an automatic rollout.
