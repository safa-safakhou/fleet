# Fleet Architecture Separation and Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` task-by-task, without delegation. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Preserve and separate the five existing architectures and provide one exact-version launch contract for all architectures.

**Architecture:** Trusted manifests select independent engines over scoped host ports; versioned modules provide shared mechanisms. A compatibility package preserves historical execution, and one launch service powers console and CLI.

**Tech Stack:** Existing Node 24, TypeScript, PostgreSQL, Fastify, React/Vite, Zod, AJV, Vitest.

**Spec:** [Approved design](../specs/2026-10-20-autonomous-specialists-and-modular-architectures-design.md); [master plan and canonical interfaces](2026-10-20-autonomous-specialists.md).

## Global Constraints

All master-plan constraints apply. Preserve all five `@1` profiles and consumed state. No new runtime dependency, delegation, real inference, game/server contact or activation. Use fresh owned fixtures; original compatibility scheduling stays intact.

## Review Focus

Exact-version selection, concurrent edit/start, missing capabilities, wrong fixture database, and incomplete old-profile recovery evidence are covered below. Master-plan cross-cutting tests remain mandatory.

## File map

- `src/platform/architecture.ts`, `architecture-schema.ts`, `launch-contracts.ts`, `launch.ts`: registry-facing descriptors and launch protocol.
- `src/app/builtins.ts`, `composition.ts`, `host-services.ts`: trusted registration and concrete port adapters.
- `src/engines/*/manifest.ts`: each architecture's configuration, requirements and factories.
- `src/modules/decision-step/v1/`, `continuity/v1/`, `evidence/`: shared mechanisms with explicit ownership.
- `src/engines/legacy/manifest.ts`, `execution.ts`, `runner.ts`: legacy-only provenance/configuration/scheduler bridges.
- `web/launch.tsx`, `src/cli.ts`, `src/cli-client.ts`: two clients of the same authenticated API.
- Existing runtime, worker, store, qualification, profile console and reports are modified at the seams, not broadly rewritten.

## F00 — Owned offline fixtures

**Files:** Create `scripts/test-architecture-offline.ts`, `tests/architecture-fixture.ts`, `tests/unit/architecture-fixture.test.ts`; modify `package.json`, `tests/helpers.ts`; update fixture instructions in `docs/operations.md`.

**Interfaces:** `OwnedFixture = {fleetUrl,pactUrl,nonce,close():Promise<void>}`; `createOwnedFixture():Promise<OwnedFixture>` in the script; `assertOwnedFixture(url,nonce):Promise<void>` in the test helper. Child environment marks architecture testing and carries the nonce; verify a marker in the newly created database before migrations/truncation.

- [x] Write tests `rejects retained ports and foreign ownership`, `exports only child fixture URLs`, `cleans only its own container on failure`. Assert a database with wrong nonce cannot reach `TRUNCATE`; an already occupied port is not reused; cleanup does not stop another PostgreSQL process.
- [x] Run the pure F00 unit command in the master plan; expect the new ownership assertions to fail before implementation.
- [x] Implement a loopback-only, random-port fixture runner using an already-present PostgreSQL 17 image/tooling. Generate temporary fixture credentials and nonce, create databases named `fleet_test`/`pact_test`, seed ownership markers, forward child exit status and handle SIGINT/finally cleanup. Do not pull images, expose credentials in logs, read private runtime configuration or inherit live provider endpoints. Add the package script and master-plan suite/config routing; architecture-mode helpers require the marker before destructive setup. Missing local fixture tooling is a reported prerequisite, not authority to install it.
- [x] Run F00 unit tests, then `npm run test:architecture -- tests/integration/environment-bindings.test.ts`; require passing tests, owned fixture cleanup and no fallback to the legacy default port.
- [x] Commit: `test: isolate architecture acceptance databases`.

## F01 — Record current behavior before extraction

**Files:** Create `tests/fixtures/engines/architecture-baseline-v1.json`, `tests/integration/architecture-parity.test.ts`; extend `tests/legacy-parity.ts`, `tests/integration/multi-engine-preservation.test.ts`.

**Interfaces:** `captureArchitectureTranscript(ref,fixture):Promise<ArchitectureTranscript>` in `tests/legacy-parity.ts`; transcript includes model packets, commands/receipts, reservations/usage, continuity selections, wake/recovery state and consent-visible traces. Normalize only injected synthetic IDs/time, never decision-visible content.

- [x] Write `captures all five current profiles` and `detects packet and accounting drift`. Assert:
  ```ts
  expect(actual.modelPackets).toEqual(baseline.modelPackets);
  expect(actual.commands).toEqual(baseline.commands);
  expect(actual.allocations).toEqual(baseline.allocations);
  ```
  Include known-output correction, unknown usage, stale evidence, zero-call wait and coordinator sibling failure. A deliberately altered copy must fail comparison.
- [x] Run `npm run test:architecture -- tests/integration/architecture-parity.test.ts`; establish that the absent baseline or intentional mutation fails.
- [x] Capture baseline from the pre-refactor source with fake providers/adapters. Label source revision and generation contracts; no private trace ingestion. Preserve the pinned older legacy baseline and its distinct later repairs.
- [x] Run the same test plus `tests/integration/multi-engine-preservation.test.ts`; repeat fixture migration and compare all seeded old rows, encrypted identities and pending commands.
- [x] Commit: `test: pin existing architecture behavior before isolation`.

## F02 — Trusted manifests and registry

**Files:** Create `src/platform/architecture.ts`, `architecture-schema.ts`, a type-only `engine-context.ts`, `src/app/builtins.ts`, `src/engines/legacy/manifest.ts`, `src/engines/reactive/manifest.ts`, `src/engines/continuity/manifest.ts`, `src/engines/specialists/manifest.ts`, `tests/unit/architecture-registry.test.ts`; modify `engine-registry.ts`, `profiles.ts`, `runtime.ts`, `qualification.ts`.

**Interfaces:** Produce `ArchitectureDefinition`/`ArchitectureManifest` and the type-only scoped ports from the master plan, plus `ArchitectureRegistry.register(definition)`, `list()`, `resolve(ref)`. A temporary old-`AgentEngine` adapter lives in composition. Keep the existing operational engine registry intact until F04 wires scoped factories; manifests can drive catalog/validation immediately without replacing the executing engine instances. `profileRequirements(ref)` delegates to registered metadata; old callers retain the same result.

- [x] Write tests for duplicate exact refs, same ID/two versions, unknown version, declarative schema rejection, manifest validation without connections, and unchanged five-profile requirements. Assert resolving `{id:"fixture",version:"2"}` never returns version `1`.
- [x] Run `npm run test:architecture -- tests/unit/architecture-registry.test.ts tests/unit/profile-qualification.test.ts`; expect missing registry/new version assertions red.
- [x] Implement static trusted registration and manifest schemas. Separate public display metadata from private configuration; configs cannot supply factories/code. Keep all existing manifest requirements unchanged. Move generic profile identity away from legacy baseline data; retain compatibility re-exports only outside generic platform dependencies.
- [x] Rerun F02 tests and `tests/acceptance/environment-profiles.test.ts`; initial registration count remains five and PACT coordinator remains incompatible.
- [x] Commit: `refactor: register architectures with versioned manifests`.

## F03 — Common draft, configuration and start service

**Files:** Create `src/platform/launch-contracts.ts`, `launch.ts`, `migrations/020_architecture_launch.sql`, `tests/integration/architecture-launch.test.ts`; modify `profile-console.ts`, `store.ts`, `server.ts`, `db.ts`, `domain.ts`.

**Interfaces:** Produce `LaunchSpec`, `LaunchCheck`, `LaunchService` from the master plan. Add `/api/architectures`, `/api/launch/check`, `/api/launch/drafts`, `/api/launch/drafts/:id`, `/api/launch/start`; old profile endpoints delegate through explicit compatibility translation.

- [ ] Write tests for immutable version/config digest, same request/same result, same request/different payload rejection, stale-digest start, concurrent update/start, consumed-config rejection, globally disabled execution and terminal cohorts. Assert check/draft make zero game/model calls, and a failed start leaves no partially running cohort.
- [ ] Run `npm run test:architecture -- tests/integration/architecture-launch.test.ts`; expect missing launch service/version-2 acceptance red.
- [ ] Implement canonical digest, revision-locked draft/update/start and transactional idempotency rows. Use registered validators rather than engine-ID/version checks in `Store.configure`. Legacy manifests alone translate cognition flags. Credential readiness uses saved bindings; check reports unknown external provider health without probing. Explicit account connection remains the existing authenticated enrollment flow. Recheck authoritative local state at start and let ordinary host admission recheck dynamic facts at execution.
- [ ] Rerun F03 tests plus `tests/integration/profile-console.test.ts`; require existing CSRF/session boundaries and no setting `liveEnabled` as a side effect.
- [ ] Commit: `feat: unify architecture launch validation and start`.

## F04 — Scoped host ports and durable execution metadata

**Files:** Create `src/app/host-services.ts`, `src/engines/legacy/execution.ts`, `migrations/021_architecture_operations.sql`, `tests/integration/scoped-engine-context.test.ts`; implement the F02 `engine-context.ts` ports and modify `supervisor.ts`, `admission.ts`, `profiles.ts`, `store.ts`, `db.ts`.

**Interfaces:** Produce `ScopedServices`, `ScopedOperation`, `ScopedModelRequest/Result`. `createScopedServices(claim,definition,session):ScopedServices` belongs only to composition; concrete legacy claims never enter new engine code. Persist operation mode/version and per-allocation dispatch state before provider dispatch.

- [ ] Write `cannot substitute another binding or claim`, `fences late port calls`, `uses recorded allocation dispatch facts on crash`, and `does not refund unknown legacy calls`. Test cancellation before dispatch versus transport uncertainty after dispatch; declared overlap requires host, environment and provider permission.
- [ ] Run `npm run test:architecture -- tests/integration/scoped-engine-context.test.ts`; expect missing scope/mode records red.
- [ ] Implement bound adapters for model/command/evidence/state/task/trace operations. Construct scoped runtime handlers per operation while retaining the durable architecture-instance identity; never mutate a shared process-global “current operation.” Replace host/admission engine-name checks with trusted declared modes intersected with capabilities. New operation recovery uses persisted facts; historical records without new metadata retain exact conservative compatibility rules through the legacy recovery adapter. Do not reinterpret old unknowns.
- [ ] Rerun F04 tests, `tests/integration/platform-recovery.test.ts`, `tests/integration/model-recovery.test.ts`, and F01 parity.
- [ ] Commit: `refactor: scope engine services and persist execution modes`.

## F05 — Separate engine implementations and shared modules

**Files:** Create `src/modules/decision-step/v1/engine.ts`, `src/modules/continuity/v1/state.ts`, `src/modules/evidence/journal.ts`, `src/modules/continuity/v1/ports.ts`; modify reactive/continuity/specialist engines, `src/engines/continuity/state.ts`, `src/cognition.ts`, `src/app/builtins.ts`, `tests/integration/architecture-parity.test.ts`.

**Interfaces:** `BoundedDecisionStep.run(operation,services,hooks):Promise<void>` owns existing bounded read/decide mechanics. `ContinuityV1` exposes the existing `context/restrict/apply/recordCommand` semantics via scoped repository/evidence ports. `EvidenceJournal.capture/retained` extracts storage from cognition; it does not impose a new ranking policy. Each engine composes these modules in its own entry point.

- [ ] Extend F01 tests to assert all five packets/commands/allocations remain equal and two bindings cannot share a module's mutable delivered-evidence state. Add a static assertion that no engine imports another engine's implementation.
- [ ] Run `npm run test:architecture -- tests/integration/architecture-parity.test.ts`; expect the new isolation assertion to fail on current sibling imports.
- [ ] Extract mechanics without changing prompt wording, ordering, fitting limits, retries, namespaces or receipt semantics. Reactive cognition composes decision-step/continuity rather than extending the reactive architecture. Coordinator composes continuity from the shared module. Keep old import shims for external tests temporarily, but no engine depends on the shims. Adapt existing journal/storage without copying ciphertext rows or changing associated-data identity.
- [ ] Rerun F01 plus `tests/integration/reactive-engine.test.ts`, `profile-continuity.test.ts`, `specialist-engine.test.ts`, and `tests/unit/continuity-schema.test.ts`.
- [ ] Commit: `refactor: isolate engines behind versioned shared modules`.

## F06 — Composition, maintenance and dependency enforcement

**Files:** Create `src/app/composition.ts`, `src/engines/legacy/runner.ts`, `src/platform/maintenance.ts`, `src/platform/disk.ts`, `tests/unit/architecture-boundaries.test.ts`; modify `runtime.ts`, `worker.ts`, `scripts/check-boundaries.mjs`, its `.d.mts`, `tests/unit/core-boundaries.test.ts`.

**Interfaces:** `composeRuntime(settings)` retains the public runtime result needed by existing clients. `LegacyRunner.claim/run/reconcile/stop` wraps the historical lane. `MaintenanceRegistry.register({id,run(limit,signal)})` bounds shared cleanup; disk checks move mechanically with a compatibility re-export.

- [ ] Write forbidden-import fixtures for sibling engines, engine→SQL/vault/provider, platform→engine and UI→engine, including re-exports/dynamic imports and alias paths. Allow only composition and the enumerated legacy bridge exceptions. Add scheduler parity and bounded-maintenance-failure tests.
- [ ] Run `npm run test:architecture -- tests/unit/architecture-boundaries.test.ts`; expect new forbidden imports to be missed by the current game-only scanner.
- [ ] Extend import checking using an isolated adapter to installed TypeScript 7's `typescript/unstable/sync`/AST APIs rather than regex-only path matching. Its top-level export is not the old TypeScript 5 compiler API; do not assume top-level `createSourceFile` exists. Test resolution against the current package/tsconfig and keep game-independence checks. Make worker orchestration consume registered runners/hooks; retain old due-time/fairness behavior. Explicitly list compatibility exceptions and add no broad directory exemption. New engine registration requires only its own descriptor and one composition entry.
- [ ] Run boundary tests, `npm run check:boundaries`, F01 parity and `tests/integration/worker-liveness.test.ts`.
- [ ] Commit: `refactor: enforce architecture ownership and isolate runtime wiring`.

## F07 — Exact-version guided console launch

**Files:** Create `web/launch.tsx`, `web/architecture-fields.tsx`, `tests/unit/architecture-launch-view.test.tsx`, `tests/integration/architecture-launch-ui.test.ts`; modify `web/profiles.tsx`, `web/main.tsx`, `web/style.css`.

**Interfaces:** `LaunchWizard({api,onCreated,onStarted})` consumes launch DTOs only; manifest widgets support bounded object/string/number/enum/boolean/array forms. Selection uses the exact ref, not `startsWith` or an ID-only key. Inactive drafts resume by ID/digest.

- [ ] Write tests for two versions of one ID, a non-reactive event-capable fixture, a no-event fixture, unknown widget/schema, draft editing, zero connected accounts, missing provider configuration, disabled execution, stale start, and successful supported-profile flow. Assert no automatic start on selecting an architecture or completing account connection.
- [ ] Run `npm run test:architecture -- tests/unit/architecture-launch-view.test.tsx tests/integration/architecture-launch-ui.test.ts`; expect old ID-only selection/new flow assertions red.
- [ ] Implement architecture/version → preset/config → model → accounts → limits/triggers → readiness → start using F03. Reuse existing account/provider controls and operator session; do not add a study requirement or expose implementation internals. Unsupported schema widgets show a precise configuration error, never a guessed form. Preserve the old comparison view.
- [ ] Rerun F07 tests and `tests/unit/profile-console-view.test.tsx`; exercise authenticated Fastify requests with a mock UI client and inspect rendered wizard states. Real browser acceptance is recorded separately if available; static rendering alone is not browser certification.
- [ ] Commit: `feat: launch exact architecture versions from one console flow`.

## F08 — CLI using the same authenticated launcher

**Files:** Create `src/cli.ts`, `src/cli-client.ts`, `tests/unit/architecture-cli.test.ts`, `tests/integration/architecture-cli.test.ts`; modify `package.json`, `docs/operator-guide.md`.

**Interfaces:** `runCli(argv,io,client):Promise<number>`; `LaunchClient` mirrors F03 endpoints. Expose package `bin` entry `fleet` targeting `dist/server/cli.js` with a Node shebang. Commands: `architectures list`, `launch check --file`, `launch draft --file`, `launch start --draft --expected-digest`, plus `login`/`logout` for existing operator sessions.

- [ ] Write tests for JSON schema errors, unsupported versions, server unavailable, CSRF/origin propagation, unchanged readiness codes between UI/API/CLI, idempotent start and secret-free output. Assert login reads the operator secret from hidden stdin/input, never a command-line argument.
- [ ] Run `npm run test:architecture -- tests/unit/architecture-cli.test.ts tests/integration/architecture-cli.test.ts`; expect missing CLI/client red.
- [ ] Implement HTTP-only client to the configured Fleet origin; no direct database access. Reuse `/api/login` cookie and CSRF token, keep optional session storage owner-readable at mode `0600`, refuse cross-origin redirects and clear on logout. Credentials never enter launch JSON. Add request IDs for mutations and make exit codes `0` success, `2` invalid input, `3` not ready, `1` transport/unexpected failure.
- [ ] Rerun F08 tests and F03 launch tests. Update operator examples as proposed workflows; do not connect a real session during acceptance.
- [ ] Commit: `feat: expose architecture launch through an authenticated CLI`.
