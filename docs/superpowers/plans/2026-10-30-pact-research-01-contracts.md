# PACT Research Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans`, inline without delegation. Implemented inline under the owner's C1–C4 assignment; operational activation remains separate.

**Goal:** Establish pinned research packages, portable types, semantically valid manifests and stable broker-step identities.

**Architecture:** Generate process contracts from Protobuf, compile recipes against persisted capability fingerprints, and wrap existing effect services with a transactional step journal. Preserve current consumed profiles.

**Tech Stack:** Node 26/TypeScript, PostgreSQL 17, Protobuf/gRPC, isolated Python 3.12, fast-check, Hypothesis.

**Spec:** [Design §§2–5, 10–11](../specs/2026-10-30-pact-research-engine-design.md); [master constraints and dependency policy](2026-10-30-pact-research-engine.md).

**Status:** C1–C4 source/offline work completed on 30 October 2026. See [implementation, verification and limits](../../research/contracts-foundation-20261030.md).

## Global Constraints

- PACT only; work inline. Planning does not authorize installation, implementation, inference, game operations, commits or pushes.
- Node 26/PostgreSQL 17 remain; isolate Python 3.12 from existing helpers. Pin exact package/generator/image versions and locks.
- Preserve original effects, unknown allocations, schedules and identities. Workers never receive game/provider/database/vault credentials.
- Private observations retain 30 days; chunk limit 1 MiB; event pages default 200/max 500. These constants travel in generated contracts.

## Review Focus

1. Large counters/opaque IDs cross Python/JS without rounding or coercion — C1.
2. A valid JSON shape with wrong clock, model/tool support or checkpoint version fails semantically — C2.
3. Same step key with different payload cannot reuse an old approval or dispatch twice — C3.
4. Research configuration cannot disable scope/accounting/privacy protections — C2/C4.
5. A minimized random failure is reproducible rather than lost in CI output — C4.

---

## File responsibilities

Create `contracts/fleet/v1/{common,worker,evidence}.proto`, `buf.yaml`, `buf.gen.yaml`, `schemas/run-manifest.v1.schema.json`, `src/research/contracts.ts`, generated bindings under `src/research/generated/` and `workers/research/src/fleet_research/generated/`. Create the isolated package's `pyproject.toml`, `uv.lock` and `.python-version`; its CLI entry point is `fleet-research-worker`. Generators, runtime and schema validators must agree on one wire source.

Create `src/research/manifests/{compiler,repository,capabilities}.ts` and `src/research/broker/steps.ts`. The former owns configuration and fingerprints; the latter owns key/payload/result persistence, not gameplay or model accounting. Modify `package.json`, `package-lock.json`, `.gitignore`, `src/platform/architecture-schema.ts`, `src/app/builtins.ts` and boundary checks only where these deliverables require them.

## C1 — Pin packages and generate cross-language contracts

**Files:** Create the contract/package files above, `scripts/check-research-contracts.ts`, `docs/research/dependencies.md`, `tests/unit/research-contracts.test.ts`, `workers/research/tests/test_contracts.py`. Modify root package scripts/lock and `scripts/check-boundaries.mjs`.

**Consumes:** Existing `ScopedOperation`, `ScopedModelRequest` and PACT IDs as compatibility inputs, not wire types.

**Produces:** `RunScope`, `OperationKey`, `EvidenceEvent`, `ArtifactRef`, `Coverage`, `WorkerCheckpoint`, `DecisionProposal`, `BrokerResult`, `EventRef`, `ResolvedRunManifest`, `CapabilityFingerprint`, `RunManifestInput`, `ValidationIssue`, `ModelRequest`, `GameQuery`, `CheckpointRef`, and `ResultRef` exported through `src/research/contracts.ts`. The Python package exports equivalent validated models. Opaque refs carry IDs/status, not decrypted bodies; RPC message definitions carry typed arguments/results and protocol version.

- [x] Write `round_trips_cross_language_fixture` assertions for a counter `"9007199254740993"`, opaque actor ID `"kingdom:alpha/7"`, null usage, omitted optional participant and every result/coverage enum; `expect(decoded.counter).toBe("9007199254740993")`. Unknown required protocol version must be rejected.
- [x] Run `npx vitest run tests/unit/research-contracts.test.ts` and `uv run --project workers/research --group dev pytest workers/research/tests/test_contracts.py -q`; capture RED before bindings/validation exist.
- [x] Implement the types/generation and cross-language golden fixtures; add `research:contracts:check` running `scripts/check-research-contracts.ts` to regenerate into a temporary directory and compare committed outputs. Qualify the explicit master dependency list for OS/runtime/API/license compatibility and record exact chosen versions/digests before installing them in their owning task. Package Python extras separately; keep real routes disabled.
- [x] Run both tests and `npm run research:contracts:check`; expect PASS and no generated diff. Record unavailable platform/runtime checks as blockers, not passed checks.
- [x] Review/checkpoint the C1 deliverable under the master's commit rule.

## C2 — Compile and persist semantically sealed manifests

**Files:** Create `src/research/manifests/{compiler,repository,capabilities,routes}.ts`, `migrations/042_research_manifests.sql`, `tests/unit/research-manifests.test.ts`, `tests/integration/research-manifests.test.ts`. Modify the architecture schema/registry adapter, `src/app/builtins.ts` and `src/server.ts` route registration.

**Consumes:** C1 `RunManifestInput`, `CapabilityFingerprint` and generated validation.

**Produces:** `compileManifest(input: RunManifestInput, capability: CapabilityFingerprint): { manifest: ResolvedRunManifest; digest: string }`; `ManifestRepository.save(manifest: ResolvedRunManifest): Promise<string>` and `.load(digest: string): Promise<ResolvedRunManifest>`; `validateCompatibility(input: RunManifestInput, capability: CapabilityFingerprint): ValidationIssue[]`. Authenticated `POST /api/research/manifests/preview` invokes this compiler using reviewed capability descriptors, without probing providers or reading PACT. Typed errors include `CLOCK_INCOMPATIBLE`, `CHECKPOINT_INCOMPATIBLE`, `INDEX_PERMISSION_REQUIRED`, `CAPABILITY_CHANGED` and `PROTECTION_REQUIRED`.

- [x] Write `rejects_semantic_mismatch` for UTC versus PACT-tick deadlines, stale observation policy, unavailable native tool schema, changed embedding dimension and disabled accounting. Assert no row inserted; changing one inference parameter changes digest, canonical key order does not. `expect(issues.map(x => x.code)).toContain("CLOCK_INCOMPATIBLE")`.
- [x] Run `npx vitest run tests/unit/research-manifests.test.ts tests/integration/research-manifests.test.ts`; expect RED using only fresh synthetic DB fixtures.
- [x] Implement deterministic resolution and immutable storage. Resolve defaults before hashing; reject unknown config keys, executable/unreviewed imports and incompatible state. Exclude secrets. Store original profile identity for historical adapters and default new proposals to `experimental`; saving is not enrollment.
- [x] Run the same command and `npm run check:boundaries`; expect PASS, zero account/model/game operations and unchanged existing-profile fixtures.
- [x] Review/checkpoint C2; record migration number reservation against latest migrations before execution.

## C3 — Journal stable broker steps around existing effects

**Files:** Create `src/research/broker/steps.ts`, `migrations/043_research_steps.sql`, `tests/integration/research-step-journal.test.ts`; modify `src/platform/admission.ts`, `src/platform/execution.ts`, `src/platform/tasks.ts` only at the adapter boundary.

**Consumes:** C1 `RunScope`, `OperationKey`, `BrokerResult`; persisted task claims and existing model/command IDs.

**Produces:** `StepJournal.begin(scope: RunScope, key: OperationKey, payloadDigest: string): Promise<{ disposition: "new" | "existing"; result: BrokerResult }>`; `.complete(scope, key, result): Promise<void>`; `.lookup(scope, key): Promise<BrokerResult>`; `.assertCurrent(scope): Promise<void>`. `begin` atomically validates epoch/claim and reserves the logical identity, not a second token allocation.

- [x] Write `duplicate_conflicting_and_stale_step` with concurrent identical requests (one new/one existing), different payload conflict, lost epoch, returned reply before caller ack, and pending/unknown lookup. A resumed current owner can look up an earlier-epoch result; the old worker cannot dispatch and the new owner cannot redispatch its old step. Assert `expect(newEffects).toBe(1)` and original allocation/command IDs remain exact.
- [x] Run `npx vitest run tests/integration/research-step-journal.test.ts tests/integration/platform-recovery.test.ts tests/integration/model-recovery.test.ts`; expect the new journal assertions RED.
- [x] Implement transactionally unique `(operation_id, logical_step_id)` across epochs with immutable original payload/key, explicit dispatch/result states and fencing. New steps require current-epoch keys; authenticated resume can read recorded earlier results through the step map, never redispatch them. Revalidate epoch at actual effect boundary; late settlement has its own restricted path. Existing uncertainty rules own settlement; network/model work remains outside SQL transactions. No generic retry callback may redispatch pending/unknown work.
- [x] Run the same tests; expect PASS for crash-before/after durable intent and recorded-result replay, with unknown reservations unchanged and no new effect from stale scope.
- [x] Review/checkpoint C3 with schema and failure-path evidence.

## C4 — Establish independent stateful property checks

**Files:** Create `tests/property/research-ledger.model.ts`, `tests/property/research-ledger.test.ts`, `tests/property/research-manifests.test.ts`, `scripts/test-research-properties.ts`; modify root package scripts to add `test:properties`.

**Consumes:** C2 compiler and C3 journal. Uses fake clocks/providers and a small invariant model, not production transition code.

**Produces:** A reproducible runner: `npm run test:properties -- --seed <integer> --path <shrink-path>`; default 200 histories/test, maximum 50 transitions/history; a release mode with 2,000 histories/test. Seed/path appear in machine-readable failure metadata.

- [x] Write histories combining claim/release, reserve, dispatch, lost reply, duplicate delivery, expiry, cancel, late usage and config change. Assert reservation conservation, at-most-one confirmed logical effect, stale-scope rejection and protection requirements after every transition. Insert a deliberate fixture-only refund-on-unknown mutation and assert the model detects/shrinks it.
- [x] Run `npm run test:properties -- --seed 20261030`; expect RED before the runner/invariants exist.
- [x] Implement fast-check command generators/reference model, bounded scheduler interleavings and counterexample output. Persist only synthetic minimized regressions under `tests/fixtures/research/`; do not multiply history count into a reliability percentage.
- [x] Run the same seed, replay its saved shrink path, then the default runner; expect PASS and the deliberate bad implementation detected by its dedicated meta-test.
- [x] Review/checkpoint C4; deliver C1–C3 interfaces to packages 02–04.
