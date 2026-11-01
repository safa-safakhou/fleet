# Q3 Hybrid Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline. The owner approved the storage proposal and delegated implementation judgment; no further design selection is pending.

**Goal:** Reduce recording latency below10% while retaining all evidence, validation and existing data.

**Architecture:** Add an explicit PostgreSQL tier for standalone captured artifacts whose encrypted representation is at most64KiB. Commit and validate canonical encrypted bytes with references, quota and events; retain filesystem publication for larger, native-transaction and legacy artifacts. No retained artifact is moved.

**Tech Stack:** Node26/TypeScript, PostgreSQL17, existing authenticated vault encryption; no new dependencies.

**Spec:** [Approved storage proposal](../../research/latency-storage-proposal-20261101.md), owner approval1 November2026.

## Global Constraints

- Preserve1MiB plaintext chunks,32MiB capture bodies, manifest/run quotas and30-day privacy retention.
- Required input is durable before dispatch; fresh scope/native authority, consent/version, expiry and integrity checks remain mandatory.
- No external/model call in a database transaction. No inference/game run, deployment, retained-data rewrite or push.
- Benchmark remains1000 operations/mode, concurrency4,50ms fake provider, warmups/five alternating pairs;10% latency/15% peak-process-RSS limits unchanged.
- Preserve private evidence and existing67 containers/115 volumes/services.

## Review Focus

- Copy acknowledgment must never erase canonical PostgreSQL bodies.
- A restart must distinguish canonical bodies from pending filesystem copies.
- Mixed-tier archives/SQL restore must preserve every ID, byte count and digest.
- A failed/ambiguous SQL commit must block dispatch without retrying a model or losing its fence.
- Filesystem failure and consent-race tests must remain active for filesystem artifacts.

### Task1: Atomic canonical storage and tier-aware lifecycle

**Files:** Create `migrations/056_research_artifact_tiers.sql`; modify `src/db.ts`, `src/research/evidence/artifacts.ts`, `src/research/evidence/boundaries.ts`, `src/research/qualification/readiness.ts`; test `tests/integration/research-capture-atomicity.test.ts`, `research-recording-cost.test.ts`, `research-all-path-capture.test.ts`, `research-distributed-faults.test.ts`.

**Interfaces:** `ArtifactRecord.storage_backend: 'filesystem'|'postgres'`; `ArtifactStore.seal()` supplies selected `storageBackend`; existing capture-write signature remains compatible. Native putWithin/streaming put remain filesystem.

- [ ] Write regressions: small required capture remains readable after flush/restart without filesystem writes; acknowledgment cannot clear canonical bytes; corruption/expiry/revocation/quota/rollback/ambiguous acknowledgment block or purge correctly. Keep filesystem-specific fault fixtures explicitly above the tier boundary.
- [ ] Run owned-fixture tests; expected RED on missing canonical storage behavior.
- [ ] Add additive discriminator defaulting legacy rows to filesystem; atomically validate PostgreSQL ciphertext metadata/hash before returning capture commit. Exclude canonical bytes from pending-copy queries/acknowledgments. Preserve all filesystem publication checks and per-read authentication.
- [ ] Run affected integrations, root unit suite, check/build/boundaries; expected PASS. Commit verified implementation.

### Task2: Mixed-tier recovery, archive and honest performance evidence

**Files:** `scripts/test-research-migration.ts`, `scripts/benchmark-research-worker.mjs`, affected integration tests and benchmark unit tests.

**Interfaces:** Consume Task1 discriminator; `pendingCipherCopies` counts filesystem outbox only, with canonical PostgreSQL payload counts/bytes and physical DB footprint reported separately.

- [ ] Add mixed legacy/new-tier SQL/chunk restore and archive assertions; expected RED if either tier loses bytes or IDs.
- [ ] Preserve filesystem directory in SQL-only archive fixtures, add mixed-tier restore payloads, retain full row-hash comparisons.
- [ ] Run migration/archive/retention/fault checks and unchanged benchmark. Expected exact4004events/2000artifacts/1000calls, zero pending filesystem copies, readable canonical bodies; thresholds unchanged.
- [ ] Measure diagnostics, address proven bottlenecks without weakening guards, commit verified changes.

### Task3: Exact-source qualification and preservation handoff

**Files:** New dated research report/receipt, `docs/current-state.md`, relevant qualification links.

**Interfaces:** Consume exact final source/image/lock identity and unchanged qualification assembler.

- [ ] Preserve old raw receipts, build exact-source package using only owned-image cleanup if needed; run all qualification gates, macOS/Linux browsers and backend resource sampling.
- [ ] Verify67 original containers/115 volumes/three services, disk health/headroom and clean trees.
- [ ] Review full diff independently inline (delegation forbidden by AGENTS); fix meaningful findings with RED/GREEN coverage.
- [ ] Record actual limits, failures/retries and results; mark Q3 accepted only if unchanged gates pass. Commit reports and hand off source versus live acceptance distinctly.
