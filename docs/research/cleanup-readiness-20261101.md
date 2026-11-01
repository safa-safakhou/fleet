# Workstation cleanup and live-test readiness — 1 November 2026

The owner authorized cleanup of the previously reviewed candidates, followed by a readiness and remaining-plan assessment. Cleanup recovered approximately **14.00 GiB of measured host availability**, from **9.77 to 23.78 GiB**. This is a before/after filesystem observation, not a sum of possibly shared directory allocations. Existing applications can continue changing their own cache usage. Docker's separate persistent filesystem still has approximately **7.4 GiB free**; live evidence capacity must be checked against the selected run.

## Completed cleanup

| Candidate | Action and preservation |
| --- | --- |
| NPM | Used the pinned npm 12 cache-clean command to remove its download cache. Installed dependencies, project lockfiles, toolchains, configuration and credentials were not selected for removal. |
| Homebrew | Removed cached downloads and only aliases resolving into that download directory. Installed Cellar packages and service configuration were not selected. |
| Vulnerability scanner | Used Trivy's explicit vulnerability/Java-database cleanup flags. Scan-result cache and policy data remain; future scans must refresh the removed databases. |
| CocoaPods | Used its cache-clean command. Project Pods, source and native build configuration were not selected. |
| IDE | Removed only indexes, caches, browser cache and temporary directories for inactive JetBrains products. Local history, projects, plugins, models and application support remain. |
| Simulators | Deleted 9 shutdown, never-booted, unpaired device templates through simctl. Preserved 7 previously used or paired devices, every pairing and both installed available runtimes. |

Active browser/application caches, pinned Playwright/runtime assets, research evidence, model weights and protected APFS recovery copies were not broadly cleared. The separate Docker Desktop disk is inactive and last modified 28 April, but that does not establish empty or disposable contents. Its approximately 20.5 GiB remains preserved. No existing Docker container, image or volume was removed in this cleanup.

Fresh verification after cleanup matched all **67 original container configurations and normalized mounts** and all **115 original volume definitions** against the protected pre-recovery capture. All **three original services remain running and healthy**. Colima reports running and Compose 5.1.3 is available. Simulator before/after checks confirm exactly the selected nine removals, unchanged surviving-device states, identical pairings and identical runtime identities/availability. No retained-world SQL or game/model operation was used for verification.

Private before/after size inventories, selected cache paths, tool logs and simulator inventories remain in the cleanup ledger. No credentials, cached bodies, database dumps or personal profiles were committed.

## Ready for a live test?

**Not yet under the current release criteria.** Cleanup removes host space pressure; it does not repair or invalidate the measured recording-overhead failure. No runtime source changed, so the [current qualification evidence](acceptance-20261101.md) remains the latest actual test result. This cleanup did not rerun or claim a new application-suite/benchmark pass.

| Plan area | Actual status / work left |
| --- | --- |
| C/O/R/M/A/U | The six source batches report delivered contracts, observation, runtime, memory/context, evaluation and studio capabilities. These are source/offline results. |
| Q1/Q2 | Current fixture proof/configuration, migration/restore, fault and invariant checks passed. Coverage is bounded, not arbitrary-configuration or production certification. |
| Q3 | Native walkthrough and current macOS/Linux UI checks passed. Recording mean-p95 service overhead is 68.86% against 10%; peak process RSS increase 38.66% against 15%. Profile and address the cost, then rerun the unchanged benchmark and integrated fixture qualification. No threshold waiver is recorded. |
| Q4 source package | Compiled Linux inspection package and synthetic Compose validation passed. This starts no research execution and does not deploy the full runtime. |
| Actual target installation | Still unaccepted: selected release/host, separate Fleet/Temporal roles and persistence, actual Temporal server, deployed Python broker/container IPC, authorized observation, evidence storage, dashboard/export path, aggregate capacity, restart and isolated backup/restore. Verify what the chosen recipe uses against the actual target. |
| First bounded live experiment | Still requires an exact provider/model/schema/context/tool profile, participant/world/manifest scope, observation/index consent, finite calls/tokens/concurrency/time window, metrics and hard stop conditions. Provider compatibility preflights must be scoped within that controlled test assignment. |
| Behavior acceptance | Real strategic accuracy and model quality remain unknown; the bounded experiment is how they will be measured. They are not claimed from a synthetic pass or a prerequisite that can be satisfied without live evidence. |

The next engineering blocker is **Q3 recording performance**. After that passes, target installation/integration and a tightly bounded provider preflight are the steps before the first new-architecture live experiment. The [operations gates](operations.md) define the required scope and preservation record; the [master plan](../superpowers/plans/2026-10-30-pact-research-engine.md) separates source batches from live acceptance.

Optional real embedding weights are needed only for a profile that selects that local compute path, with pinned artifacts and indexing consent. DSPy/MLflow optimization workflows and every optional backend need not all be activated for the first bounded recipe. Cross-game generalization remains intentionally deferred. E4/KQ1 and unresolved allocations are unchanged; this assessment does not reopen them or grant a rollout.

No inference, game activation, retained-world reset/replay/enrollment, installed-runtime migration, deployment or push occurred. PACT source was not changed. Repository changes in this cleanup are documentation only.
