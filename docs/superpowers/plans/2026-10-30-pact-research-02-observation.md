# PACT Evidence and Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans`, inline without delegation. Execution was inline under the owner’s O1–O6 assignment.

**Status — 31 October 2026:** O1–O6 complete at source/offline scope; [actual checks, commits and release boundaries](../../research/observation-20261031.md). Database commands used the owned-fixture harness instead of unguarded integration execution.

**Goal:** Capture and inspect all retained, authorized Fleet-owned interactions, including large payloads, parallel sequences and explicit gaps.

**Architecture:** Append-only scoped SQL events link encrypted chunked payloads and existing accounting/effect records. A complete owned journal feeds the research UI and a safe OTel projection; neither trace sampling nor a capped API is the audit contract.

**Tech Stack:** Node 26/TypeScript, PostgreSQL 17, existing Vault, OpenTelemetry SDK/Collector, Tempo, Prometheus, Grafana.

**Spec:** [Design §§5–7, 11](../specs/2026-10-30-pact-research-engine-design.md); [master constraints](2026-10-30-pact-research-engine.md). Depends on C1–C3.

## Global Constraints

- PACT only, inline, no live operations. Preserve original ledger/command identities and historical report semantics.
- Retain private observations for 30 days under current consent. Exclude credentials by construction; private payloads never enter operational logs, traces or metric labels.
- Plaintext artifact chunks are at most 1 MiB. Pages default 200/max 500. Never silently omit a large body or stop an exhaustive export at one page.
- No extra provider/game reads are introduced by observation. Accounting settlement continues through observation failure.

## Review Focus

1. Concurrent or late events do not acquire an invented total order — O1/O4.
2. A body above 256 KiB, truncated stream or full disk cannot disappear into a success summary — O2/O3.
3. Revocation between list, detail and export must stop unauthorized access and derived retention — O2/O4/O5.
4. A missed legacy/helper call must fail reconciliation rather than look fully observed — O3/O5.
5. Collector outage or metric-label explosion must not compromise the journal or service — O6.

---

## File responsibilities

Create `src/research/evidence/{recorder,repository,artifacts,filesystem,coverage,inspection,export,retention}.ts`, `src/research/evidence/routes.ts`, and `src/research/telemetry/{sdk,projection,metrics}.ts`. Repository owns metadata/sequence transactions; artifacts owns encryption/chunk manifests; filesystem owns bounded IO/atomic persistence; retention owns deletion/tombstones; inspection/export own authorized read models, not execution.

Adapt `src/observability.ts`, `src/call-metrics.ts`, `src/app/host-services.ts`, `src/app/composition.ts`, `src/platform/admission.ts`, `src/platform/execution.ts`, `src/model.ts`, `src/codex.ts`, PACT read/event adapters and specialist/skill paths. Inventory exact branches before editing; do not replace all files with new implementations.

## O1 — Append causal events with explicit coverage

**Files:** Create `recorder.ts`, `repository.ts`, `coverage.ts`, `migrations/044_research_evidence.sql`, `tests/unit/research-evidence.test.ts`, `tests/integration/research-event-journal.test.ts` under the paths above.

**Consumes:** C1 evidence/scope types and C3 current-epoch validation.

**Produces:** `EvidenceRecorder.append(scope: RunScope, input: EvidenceEventInput, tx?: PoolClient): Promise<EventRef>`; `EvidenceRepository.page(scope, query: EventPageQuery): Promise<EventPage>`; `CoverageService.reconcile(runId: string): Promise<CompletenessManifest>`. `EvidenceEventInput` is the event minus assigned ID/sequence; page/manifest types are added to the C1 wire source and regenerated.

- [x] Write `keeps_stream_order_and_cross_stream_causes`: concurrent streams with skewed UTC, late arrival, multiple parents, duplicate producer key and a rolled-back append. Assert increasing committed per-stream sequence, stable event IDs, two causal links and no chronology inferred from UTC alone. A missing expected dispatch produces `partial`, not `complete`.
- [x] Run `npx vitest run tests/unit/research-evidence.test.ts tests/integration/research-event-journal.test.ts`; expect RED.
- [x] Implement immutable event rows, transactionally allocated stream counters, producer deduplication, schema validation and allowlisted metadata. Store process-local monotonic duration separately from UTC and typed PACT clocks; sequence decimal strings survive JSON. Append within the same SQL transaction as owned ledger/command intent where possible.
- [x] Run the same tests; expect PASS, including duplicate same-input acceptance, conflicting-input rejection and no foreign-scope read.
- [x] Review/checkpoint O1; publish a versioned event-kind inventory for all eight spec families in `docs/research/event-catalog.md`.

## O2 — Store complete encrypted chunked artifacts and delete them correctly

**Files:** Create `artifacts.ts`, `filesystem.ts`, `retention.ts`, `migrations/045_research_artifacts.sql`, `tests/unit/research-artifacts.test.ts`, `tests/integration/research-retention.test.ts`; adapt `src/vault.ts` only through a versioned chunk-encryption wrapper.

**Consumes:** O1 scope/event refs, existing vault key access inside the kernel only.

**Produces:** `ArtifactStore.put(scope: RunScope, body: AsyncIterable<Uint8Array>, policy: ArtifactPolicy): Promise<ArtifactRef>`; `.read(scope, ref): AsyncIterable<Uint8Array>`; `.expire(now: Date): Promise<RetentionReport>`. `ArtifactPolicy` carries content/privacy class, byte quota, consent version and expiry; no framework receives storage keys.

- [x] Write `round_trips_large_body_and_refuses_stale_consent`: exact 2 MiB+17 byte body reconstructs byte-for-byte; chunks never exceed 1 MiB; changing ciphertext/order/AAD is rejected; interrupted temporary write never becomes complete. Revoke consent between chunks and expire an index/artifact; assert no decrypted bytes leak and tombstone says withheld/expired.
- [x] Run `npx vitest run tests/unit/research-artifacts.test.ts tests/integration/research-retention.test.ts`; expect RED.
- [x] Implement protected root/path traversal refusal, authenticated encryption with scope/artifact/chunk AAD, atomic chunk publication, byte-count/ciphertext-digest manifest and orphan sweep. Enforce finite run/disk quotas before dispatch and during streams; retain explicit partial manifests on interrupted capture. Retention propagates deletion to registered projections/caches and does not delete required command/usage recovery records.
- [x] Run the same tests, including full disk, truncated stream, crash before/after manifest commit and repeat expiry; expect PASS with no secret/body in logs.
- [x] Review/checkpoint O2 and document backup/key/retention behavior without recording actual keys.

## O3 — Instrument every actual input/output and dispatch boundary

**Files:** Modify the existing adapters listed in the file map; create `src/research/evidence/boundaries.ts`, `tests/integration/research-all-path-capture.test.ts`, `tests/fixtures/research/trace-corpus.ts`, `docs/research/capture-matrix.md`.

**Consumes:** C3 journal, O1 recorder, O2 artifacts, existing ModelPort/GamePort/scoped participant and skill services.

**Produces:** `ObservedPorts.wrapModel(port: ModelPort): ModelPort` and `.wrapGame(port: GamePort): GamePort`; typed hooks for queue, memory/context, participant/skill and checkpoint events. Wrap once at the final prepared request boundary, not once per caller layer; operation IDs correlate all hooks.

- [x] Write `all_owned_paths_reconcile` over legacy loop/cognition, reactive/continuity, independent specialists, skill execution and a fake Python broker client. Assert the exact final prepared messages/schema/settings and read/action/receipt payloads are captured; helpers and corrections have distinct purpose-labeled allocations; observed calls equal actual fake dispatches. A fixture-only bypass must fail coverage.
- [x] Run `npx vitest run tests/integration/research-all-path-capture.test.ts tests/integration/architecture-parity.test.ts tests/integration/observability.test.ts`; expect new capture assertions RED.
- [x] Implement non-mutating wrappers/hooks. Capture provider-exposed chunks in delivered order; terminal errors include known availability, partial output and safe error codes, not arbitrary stderr. Persist required input/intent before dispatch. On post-dispatch recording failure, settle known usage/receipts, mark a gap and fence further work if bounded capture is exhausted. Preserve existing byte-identical legacy messages and no extra reads.
- [x] Run the same tests with oversized content, unsupported provider fields, evidence backend down before/after dispatch, privacy redaction and late usage. Expect PASS; no model/game calls merely to enrich observation, no invented backend timing/reasoning.
- [x] Review/checkpoint O3 and ensure every capture-matrix row links a test and a coverage denominator.

## O4 — Expose complete authorized investigation APIs

**Files:** Create `inspection.ts`, `routes.ts`, `tests/integration/research-inspection.test.ts`; modify `src/server.ts`, existing observability report adapters and `docs/run-debugging-20261016.md` with a current extension note.

**Consumes:** O1 pages, O2 authorized artifact streams, existing operator authentication and owner scoping.

**Produces:** `RunInspection.snapshot(runId, principal): Promise<RunSnapshot>`; `.events(runId, principal, query): Promise<EventPage>`; `.artifact(runId, principal, artifactId): AsyncIterable<Uint8Array>`. Register `/api/research/runs/:runId`, `/events`, `/artifacts/:artifactId`, `/lineage`, `/coverage`. Separate paginated bounded drilldowns from complete SQL aggregates.

- [x] Write `paginates_snapshot_without_loss`: 1,205 events over multiple streams, equal timestamps, new events after snapshot and a revoked owner. Assert no duplicate/missing retained IDs across pages, maximum 500, truthful hasMore/total, stable snapshot, exact artifact access policy and expired historical fields labeled unavailable.
- [x] Run `npx vitest run tests/integration/research-inspection.test.ts`; expect RED.
- [x] Implement authorization at request and chunk delivery, stable snapshot/cursors, filters that preserve original IDs/order and lineage endpoints with explicit omitted totals. Keep old run routes functional; historical legacy records remain legacy and incomplete where appropriate. List routes return metadata, never accidentally decrypt every body.
- [x] Run the same test with cursor tampering, foreign actor IDs, concurrent append and revocation; expect PASS and no default live endpoints contacted.
- [x] Review/checkpoint O4 and record the route/response schema in `docs/research/api.md`.

## O5 — Export exhaustive archives and verify completeness

**Files:** Create `export.ts`, `tests/integration/research-export.test.ts`, `scripts/verify-research-archive.ts`; modify `src/cli.ts` with an offline `research archive verify` command and add authorized `/api/research/runs/:runId/export` route.

**Consumes:** O4 stable snapshots, O2 artifacts, O1 reconciliation and C1 manifest.

**Produces:** `RunArchive.export(snapshot, principal): AsyncIterable<Uint8Array>`; `verifyArchive(path: string): Promise<ArchiveVerification>`. Versioned archive includes sealed manifest, paginated events, causal refs, allowed artifacts, coverage, evaluator/metric definitions and hash manifest. Default export is encrypted; verifier reports unavailable key separately from structural corruption.

- [x] Write `exports_every_retained_page`: 1,205 events and a 16 MiB artifact, then verify counts/bytes/digests and preserved source IDs. Assert missing chunk, foreign ref and duplicate event are detected. Expired or withheld payload yields a valid archive with an explicit gap, not a false complete archive.
- [x] Run `npx vitest run tests/integration/research-export.test.ts`; expect RED.
- [x] Implement streaming/backpressure/cancellation, private destination handling and key separation. Never buffer the whole archive or export just the UI's fetched rows. Register export cache/retention cleanup; no decrypted export without an explicit request.
- [x] Run the same test with mid-export revocation, disk failure, stale snapshot and interruption/resume policy; expect PASS with no partial archive presented as complete.
- [x] Review/checkpoint O5 and publish a synthetic portable archive fixture and its verification command.

## O6 — Project safe telemetry and provision the observability stack

**Files:** Create telemetry modules above, `ops/research/compose.yaml`, `ops/research/otel-collector.yaml`, `ops/research/prometheus.yaml`, `ops/research/tempo.yaml`, `ops/research/grafana/provisioning/`, `tests/unit/research-telemetry.test.ts`, `tests/integration/research-telemetry.test.ts`, `scripts/test-research-observability.ts`. Modify composition/process entry points and root scripts (`test:observability`).

**Consumes:** O1 event refs, C1 scope/context propagation and O3 boundary hooks. Backend configuration is fixture-only and disabled by default.

**Produces:** `TelemetryProjection.publish(event: EvidenceEvent): Promise<void>`; cross-process trace links; bounded operational counters/histograms; versioned Grafana dashboards for queues, service latency, resource pressure, record coverage and exporter health. No audit payloads in external attributes.

- [x] Write `propagates_safe_links_during_exporter_outage`: parent/link IDs cross a fake Python RPC, metric labels remain bounded, prompt/peer/key sentinel strings never appear in exported telemetry, no duplicate span from double wrapping. Dropped export increments a loss counter while journal completeness remains inspectable.
- [x] Run `npx vitest run tests/unit/research-telemetry.test.ts tests/integration/research-telemetry.test.ts`; expect RED.
- [x] Implement explicit SDK instrumentation and schema allowlists; disable SQL parameter/text and model-body auto-capture. Qualified owned-run spans use no sampling; unknown provider internals remain unavailable. Pin and provision backend images with separate volumes/roles, loopback ports, finite retention and self-observation. OTel retries export only, never execution.
- [x] Run the same tests and `npm run test:observability` against newly created owned backend fixtures; expect PASS with an actual synthetic trace/metric query through Collector→Tempo/Prometheus, rendered dashboard query success, outage/restart recovery and no production route contact.
- [x] Review/checkpoint O6; record service versions and measured loss/lag. Deliver API and completeness fixtures to packages 05/06.
