# Dependency and runtime upgrade plan

**Goal:** Upgrade repository dependencies and language tooling to current stable releases, preserving retained worlds and services.

**Approach:** Work inline on master, retain exact dependency pins and security backports, and regenerate lockfiles with the selected npm. No deployment, inference, game execution, or retained database changes are authorized.

- [x] Audit direct dependencies against official registries; identify coupled native/Python dependencies.
- [x] Upgrade Node to 26.13.0 LTS, npm to 12.2.1, and direct npm dependencies to stable versions. TypeScript 7.0.2 is already current. Keep native React 19.3.0 and TypeScript 6.0.3 aligned with Expo 58; other workspaces use TypeScript 7.0.2.
- [x] Reconcile Docker/tooling/readme references and Python dependency locks where supported. Keep existing PostgreSQL data volumes compatible; validate newer PostgreSQL with isolated fixtures if available.
- [x] Regenerate lockfiles; verify clean installs, dependency trees, audit results, security backports, checks, builds, and offline tests. Use only synthetic isolated databases for integration.
- [x] Inspect diffs and report actual validation, compatibility exceptions, and untested runtime/deployment work.

**Review focus:** Native peer compatibility; local security overrides; Node type changes; lockfile reproducibility; PostgreSQL major-version data compatibility. Existing checks and tests cover affected application behavior; add regression tests only for needed behavior changes.

## Upgrade record — 30 October 2026

Registry versions were checked against npm, PyPI, Node's release index, official GitHub releases and Docker Hub. Stable releases only.

- Node 26.13.0 LTS and npm 12.2.1 are pinned in repository tooling/build configuration. Existing TypeScript 7.0.2 remains current for the root/server/web toolchain.
- General Python script tooling is pinned to Python 3.15.2. Fleet's two Python services use Python 3.14.10: Vowpal Wabbit 9.11.9 has no Python 3.15 wheel; Laya's evaluated dependency stack remains unchanged rather than invalidating its acceptance certificate.
- Existing PostgreSQL configurations stay on 17.11. PACT CI now covers 17.11 and 18.6; Fleet's disposable test Compose uses 18.6. This follows the user's explicit preference. Docker was unavailable locally, so those database configurations and integration suites remain unverified.
- PACT native uses Expo 58.0.21, React Native 0.88.1, React 19.3.0 and TypeScript 6.0.3, following Expo's compatibility requirements. Web React/React DOM use 19.3.1. All other direct npm dependencies are on registry latest stable versions. Existing local security backports remain intact.
- PACT images now pin Caddy 2.11.7, Alpine 3.24.3 and Mailpit 1.32.0. CI actions were updated to checkout 7.0.1 and setup-node 7.1.0. Image tag existence was verified through Docker Hub; images were not built or deployed.
- Biome 2.6.4 newly formats Markdown/YAML. Markdown formatting is explicitly disabled to preserve existing document conventions; affected source fixtures and YAML received formatting-only changes where required.
- Verification used downloaded, checksum-verified Node binaries and isolated Python environments, without replacing the machine-wide installations. The existing system Node binary fails to load its Homebrew llhttp library.

### Verification and remaining limits

- Both repositories: clean `npm ci` under Node 26/npm 12; dependency trees resolve without invalid/missing entries; builds and static/boundary checks pass. npm intentionally blocks optional fsevents install scripts; esbuild remains explicitly allowed.
- PACT: `lint`, `typecheck`, full `build`, `test` (419 tests / 130 files), `check:non-game`, and backlog consistency checks pass. The online native `expo install --check` and native TypeScript build pass. iOS/Android binary builds were not run. Vite retains a bundle-size warning.
- Fleet: `check`, `check:boundaries` and `build` pass. After the authorized follow-up, the full unit suite has 1,159 passed, zero failed and 23 skipped (208 files passed, one skipped). The initial two architecture failures came from TypeScript canonical declaration paths losing source-file casing on macOS; resolving through source-file names fixes them, with a mixed-case alias regression observed failing before the fix and passing afterward. The process-ownership fixture now explicitly requires Linux `/proc`, matching the existing Codex process suite, and its over-escaped child-program newline is corrected. The exact child program was also checked with a synthetic process on macOS and emits one newline-terminated stop record. Linux ownership semantics remain unverified here; skipped tests are not counted as passes.
- Python 3.14.10: four decision-policy tests and three Laya service tests pass; the latter stub predictions and do not qualify new models. Python 3.15.2: PACT backlog check and Fleet utility-script syntax checks pass.
- Audit: Fleet has zero findings. PACT has seven low-severity findings, all stemming from upstream `deepmerge` 4.3.1 prototype poisoning ([GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)); no upstream fixed release exists. No moderate/high/critical findings remain. Expo CLI's old Zod was overridden with 4.6.7 and covered by plugin/MCP schema regression tests; Xcode 4 removes the obsolete UUID dependency, with security checks updated accordingly.
- No retained world, deployment, existing service, model qualification, provider selection, budget, schedule or pending command was changed. The follow-up authorizes local commits of both upgrades and Fleet test fixes on master; no push was requested.

Sources: [Node releases](https://nodejs.org/dist/index.json), [TypeScript download](https://www.typescriptlang.org/download/), [Expo upgrades](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/), [PostgreSQL versions](https://www.postgresql.org/support/versioning/), [Python releases](https://www.python.org/downloads/).

## Authorized follow-up: repair Fleet failures and commit both upgrades

- Reproduce all three failures, then cover TypeScript canonical-path casing with a mixed-case alias regression.
- Resolve declaration handles through source-file names; keep architecture policies intact.
- Explicitly gate the Linux `/proc` fixture on Linux, matching the existing Codex process suite, and correct its child-program newline. Do not change process ownership checks.
- Run the full unit suite, checks, build and proportional PACT verification; update the verification record, review diffs and commit both repositories on master. No push/deployment is requested.

Follow-up verification passed: all 1,159 Fleet unit tests, type/Biome check, production build, architecture boundary check, zero-findings npm audit and `git diff --check`. PACT revalidation passed all 419 unit tests, lint, typecheck, build and backlog consistency. Both upgrades are ready for the authorized local commits. Docker remains unavailable; no database integration or Linux process acceptance is claimed.

## Docker follow-up — 30 October 2026

Docker became available (Engine 29.2.1). The checks below replace the earlier local Docker-unavailable limitation. Tests used Node 26.13.0 and fresh nonce-labelled owned fixtures with `postgres:17.11-alpine` and `postgres:18.6-bookworm`. Database URLs were explicit, localhost-only and separate from retained/default ports. Linux test containers shared only their own PostgreSQL fixture's network namespace, with PostgreSQL on port 15432. Every fixture was removed after its run; no retained service, world, credential, budget or schedule was changed.

| Check | PostgreSQL 17.11 | PostgreSQL 18.6 |
| --- | --- | --- |
| PACT integration + smoke, 75 files | 511 passed, 1 skipped | 511 passed, 1 skipped |
| Fleet portable integration, 99 files | 706 passed | 706 passed |
| Fleet Linux integration, 3 files | 65 passed on isolated rerun | 65 passed |
| Fleet paired acceptance, 12 files | 67 passed, 9 failed | 67 passed, 9 failed |

The Fleet integration totals are disjoint: 706 portable tests plus 65 Linux tests give 771 scoped tests covered per database version. The initial macOS invocation reported 736 passes and 35 failures across the 102 selected files; all failures were in `codex.test.ts`, `native-event-runtime.test.ts` and `native-pact-workflows.test.ts`, which were rerun in Linux rather than counted as passing or silently skipped on macOS. All 65 tests in those three files passed in the final Linux runs. A separate network-disabled Linux run passed all 35 Codex process, owned-process and architecture-boundary unit tests. The paired Linux image also completed PACT's full build using its locked dependencies.

PACT's skipped test is the opt-in local-model baseline (`PACT_BASELINE_LOCAL_MODEL_URL` was deliberately unset). No real model/provider calls were made.

### Fixture correction and timing observations

The first PACT integration runs found one test-only failure on both versions: `negotiation-owned-restore.test.ts` referenced an absent developer-local image ID. The restore clone now uses the immutable image ID obtained from the verified owned source container, retaining the nonce checks and disabled clone network. The corrected encrypted restore test passes on both versions, and full PACT integration reruns pass.

A four-worker PostgreSQL 17 PACT run produced two global migration-lock timeouts (`negotiation-lifecycle.test.ts` and `negotiation-native-clock.test.ts`). The standard owned-harness serial rerun passed all 511 tests. Production lock settings were not changed. The first PostgreSQL 17 Linux Fleet run had four `WORLD_PAUSED`/`FIXTURE_WORLD_LEASE_REQUIRED` failures late in `native-pact-workflows.test.ts`; all 65 platform tests passed on a fresh isolated rerun with unchanged code and timing settings. This timing sensitivity remains an observation, not proof that those fixtures are robust under load.

### Historical negotiation results and requested exclusions

At the user's request, `tests/integration/post-e3-positive.test.ts` was excluded from the scoped Fleet run (`--exclude tests/integration/post-e3-positive.test.ts`). This file contains 28 historical protocol replays and one additional frozen-context check. The initial long-running attempts were interrupted; they are not certified as passed. Existing commands, budgets, context caps and native timing semantics were preserved.

The same nine paired acceptance failures occurred on both PostgreSQL versions. They remain unresolved and are not claimed to be pre-existing or caused by the upgrade. Packing-repair cases report `CONTEXT_LIMIT`; the other cases fail negotiation completion/history assertions. No frozen limits were increased to manufacture acceptance:

- `tests/acceptance/negotiation-history.test.ts > C05 fulfilled delivers original history through later engine decisions`
- `tests/acceptance/negotiation-history.test.ts > C05 default delivers original history through later engine decisions`
- `tests/acceptance/negotiation-packing-repair.test.ts > separate @1.1 C01 fits initial, corrective and scoped-read packets through 24 native turns`
- `tests/acceptance/negotiation-packing-repair.test.ts > separate @1.1 C02 fits initial, corrective and scoped-read packets through 24 native turns`
- `tests/acceptance/negotiation.test.ts > two actual selected engines establish contact/dialogue, settle 60 installments each, then decide later`
- `tests/acceptance/negotiation.test.ts > C02 default follows normal paired handlers and grounded later decisions`
- `tests/acceptance/negotiation.test.ts > C03 default follows normal paired handlers and grounded later decisions`
- `tests/acceptance/negotiation.test.ts > C05 fulfilled follows normal paired handlers and grounded later decisions`
- `tests/acceptance/negotiation.test.ts > C05 default follows normal paired handlers and grounded later decisions`

PACT follow-up lint, typecheck, backlog consistency and diff checks passed after the restore-fixture correction. These checks certify synthetic source integration only; no production deployment, retained-data migration, real model qualification or replay was performed.
