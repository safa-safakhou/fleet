# PACT Memory and Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans`, inline without delegation. Checkboxes require a covering implementation assignment.

**Goal:** Make memory retrieval and context construction configurable, provenance-preserving and independently testable.

**Architecture:** Keep typed existing state and evidence as truth; add scoped searchable projections and versioned retrieval/context ports. A local Python embedding adapter supplies replaceable vectors; all supplied context retains source lineage.

**Tech Stack:** PostgreSQL 17 FTS/GIN and pgvector, TypeScript context/retrieval, isolated Python/Sentence Transformers, existing cognition/specialist/skill services.

**Spec:** [Design §§4, 6, 8–10](../specs/2026-10-30-pact-research-engine-design.md); [master constraints](2026-10-30-pact-research-engine.md). Depends on C1–C3, O1–O3 and R2.

## Global Constraints

- PACT only; preserve existing typed state, original evidence, pending commands and private history. No new live indexing/model/game activity.
- FTS lexemes and vectors reveal information. Private indexing requires explicit indexing policy/consent; no silent fallback from a declared required strategy.
- Private observations retain 30 days; indexes/derived state follow source visibility and deletion. Artifact chunks at most 1 MiB, event pages 200/max 500.
- `rrf-v1` uses constant 60, rank starts at 1, stable source ID breaks ties. Exact vector search is the qualification baseline.
- Model revisions/dimensions/preprocessing are pinned; remote code and request-time downloads are disabled. Preserve the existing Laya environment/certificate.

## Review Focus

1. Same text belongs to another actor/world or has expired — M1/M2.
2. A peer claim, an inferred belief and a confirmed receipt must not merge into verified truth — M1/M3.
3. Scope filtering, vector dimensions or unsupported language can silently reduce retrieval — M2/M4.
4. Required owner/receipt evidence exceeds context capacity — M3.
5. Embedding/index version changes invalidate results without corrupting old state — M4.

---

## File responsibilities

Create `src/research/memory/{schema,repository,index-policy,retrieval,fusion,embedding-client}.ts`, `src/research/context/{assembler,lineage,token-accounting}.ts`, and Python `workers/research/src/fleet_research/embeddings.py`. Repositories own scoped projections, not the game economy. Adapt `src/cognition.ts`, continuity state, `src/engines/autonomous-specialists/memory.ts` and skill lookup through public interfaces; do not collapse them into one generic vector record.

## M1 — Expose typed memory and explicit searchable-index policy

**Files:** Create `schema.ts`, `repository.ts`, `index-policy.ts`, `migrations/050_research_memory.sql`, `tests/unit/research-memory.test.ts`, `tests/integration/research-memory-scope.test.ts`; modify existing state adapters and O2 retention registrations.

**Consumes:** C1 scope/source refs, O1 event lineage/O2 artifacts, existing cognition/participant/skill public records.

**Produces:** `MemoryRepository.capture(scope, input: MemoryInput): Promise<MemoryRef>`; `.revise(scope, id, expectedVersion, update): Promise<MemoryRef>`; `.get(scope, ids: string[]): Promise<MemoryRecord[]>`; `IndexPolicy.assertAllowed(scope, policyId: string): Promise<void>`. Memory kinds: episode, belief, plan, reflection, skill and working-state reference; fields distinguish observation time, effective time, source class, contradiction links and privacy.

- [x] Write `scope_and_truth_class_survive_projection`: same text in two actors/worlds, a peer statement, inferred belief, admitted command and later completed outcome. Assert distinct source classes and no cross-scope reads. Indexing with observation consent but no indexing permission must throw `INDEX_PERMISSION_REQUIRED`; an expired source cannot be returned or indexed.
- [x] Run `npx vitest run tests/unit/research-memory.test.ts tests/integration/research-memory-scope.test.ts`; expect RED.
- [x] Implement adapters, immutable source refs and optimistic revisions. The 050 schema owns scoped projection/source tables, FTS/GIN and vector columns with revision/dimension/normalization constraints. Build searchable projections only for explicit eligible policy; use a dedicated non-owner role, FORCE RLS and scope-bound transactions. Raw evidence stays encrypted; index schema contains only approved derived fields. Register expiry/revocation deletion and namespace keys including world/actor/index version.
- [x] Run the same tests using the restricted SQL role, including direct query attempts, stale pooled-session scope, conflicting revision and revocation during retrieval; expect PASS and no disclosure of foreign result counts.
- [x] Review/checkpoint M1 with `docs/research/index-privacy.md`, explicitly documenting what DB/backup readers can infer and the no-live-consent state.

## M2 — Add deterministic FTS, exact vectors and hybrid ranking

**Files:** Create `retrieval.ts`, `fusion.ts`, `tests/unit/research-retrieval.test.ts`, `tests/integration/research-retrieval.test.ts`, `tests/fixtures/research/retrieval-labels.json`. M1's 050 migration owns the complete scoped projection schema, FTS/GIN and versioned vector columns; M2 adds query/ranking behavior without rewriting an accepted migration.

**Consumes:** M1 scope/policy/source records and a pinned embedding vector; C2 retrieval manifest.

**Produces:** `RetrievalService.search(scope: RunScope, query: RetrievalQuery): Promise<RetrievalResult>` with strategies `baseline-v1`, `fts-v1`, `vector-exact-v1`, `rrf-v1`. Result includes all candidate IDs/ranks/scores, selected/omitted reasons, index version, source coverage, duration and strategy. Query bounds top-k and requires explicit language/index namespace.

- [x] Write `rank_and_scope_are_explicit`: hand-labeled synthetic corpus tests GIN FTS behavior, exact cosine neighbors, fusion `sum(1/(60+rank))`, stable ties, no matches, conflicting/stale sources, Unicode/unsupported language and no indexing permission. Assert precise expected order, not merely non-empty results.
- [x] Run `npx vitest run tests/unit/research-retrieval.test.ts tests/integration/research-retrieval.test.ts`; expect RED against a new PostgreSQL 17/pgvector fixture.
- [x] Implement FTS/GIN and exact vector queries with authorization before ranking, parameterized SQL and explicit compatibility checks. Preserve baseline strategy without private persistent index. Approximate search is not enabled by default; if included experimentally, report filtered recall against exact results and its scan parameters. Never fetch foreign candidates and filter them only in the UI.
- [x] Run the same tests, including selective actor filters, zero/invalid vectors and dimension mismatch; expect PASS with recorded candidate lineage and no fallback when a required strategy is unavailable.
- [x] Review/checkpoint M2 and store extension version/query-plan fixture evidence; do not claim PostgreSQL FTS is BM25.

## M3 — Build source-complete deterministic context

**Files:** Create context modules above, `tests/unit/research-context.test.ts`, `tests/integration/research-context-lineage.test.ts`; adapt PACT context/scoped worker preparation and O3 final-boundary capture.

**Consumes:** M1 typed state, M2 retrieval results, explicit owner guidance/fresh PACT observation/feedback/pending receipt refs, C2 context policy and model limits.

**Produces:** `ContextAssembler.build(scope, input: ContextInput): Promise<ContextPacket>`; `ContextPacket` includes ordered messages/schema, byte/token accounting and `ContextLineage` with source/transform/span mappings, omitted reasons and mandatory-source coverage. `ContextLineage` is recorded as an artifact and referenced by the final dispatched input event.

- [x] Write `mandatory_sources_cannot_disappear`: largest synthetic PACT context retains owner mandate, latest facts, previous rejection and original pending command; irrelevant memory is omitted with reasons. Assert byte-exact final prepared messages match O3, repeated inputs yield identical packet digest, UTF-8 is not split and an impossible mandatory budget returns `CONTEXT_CAPACITY_REQUIRED` before inference.
- [x] Run `npx vitest run tests/unit/research-context.test.ts tests/integration/research-context-lineage.test.ts tests/unit/input-context.test.ts`; expect new assertions RED.
- [x] Implement deterministic packing and source precedence from explicit policy, separate schema/message sizes, pinned tokenizer or labeled estimate, transformation versions and actual final-span mapping. Preserve source truth classes. Compression is disabled in the qualified reference; experimental transforms retain input/output refs and any helper allocation. Legacy adapters observe their existing packet rather than rewriting it.
- [x] Run the same tests with contradictory beliefs, expired source, partial retrieval, model-window change and downstream provider serializer adjustments; expect PASS and no mismatch between displayed context and actual dispatched request.
- [x] Review/checkpoint M3 with lineage fixtures for the U2 inspector.

## M4 — Add pinned local embeddings and retrieval evaluation

**Files:** Create `embedding-client.ts`, Python `embeddings.py`, `workers/research/tests/test_embeddings.py`, `tests/integration/research-embedding-version.test.ts`, `scripts/evaluate-research-retrieval.ts`, `docs/research/retrieval-evaluation.md`; modify Python embedding extra/lock and root scripts (`eval:retrieval`).

**Consumes:** R2 broker/worker isolation, C2 pinned artifact manifest, M1 namespace/policy and M2/M3 recorded retrieval/context.

**Produces:** `EmbeddingPort.embed(scope, input: EmbeddingInput): Promise<EmbeddingResult>` carrying revision/dimension/normalization/compute usage; offline `npm run eval:retrieval -- --dataset <synthetic-path> --manifest <manifest-path>` emitting versioned relevance/latency/coverage results. RPC messages are added to C1 source and regenerated, not handwritten in two languages.

- [x] Write `index_revision_is_not_interchangeable`: fake 3D/4D and same-dimension different-revision embeddings cannot share a namespace. Missing local artifact, remote-code request and request-time download fail explicitly; expired content is removed from derived jobs. Assert no query body leaves the approved local compute boundary.
- [x] Run `uv run --project workers/research --group dev pytest workers/research/tests/test_embeddings.py -q` and `npx vitest run tests/integration/research-embedding-version.test.ts`; expect RED.
- [x] Implement Sentence Transformers with local-files-only, `trust_remote_code=false`, explicit revision/digest/preprocessing and bounded batch/CPU/RAM queues. Provision real weights only under an explicit artifact assignment; default tests use fake vectors. Record every embedding job's source namespace and resource purpose; no new generative-model call is hidden here.
- [x] Run both tests and `npm run eval:retrieval -- --dataset tests/fixtures/research/retrieval-labels.json --manifest tests/fixtures/research/pact-reference.json` using fake embeddings; expect PASS with exact labeled metric values. An optional pinned real-artifact test reports executed/skipped distinctly and cannot qualify multilingual relevance from English fixtures.
- [x] Review/checkpoint M4; hand catalog-ready retrieval results and frozen labels to A1/A3 without contaminating held-out evaluation data.

## Completion evidence — 31 October 2026

M1–M4 are implemented and incrementally committed on master under the covering assignment. [Verification, interfaces, commits and acceptance limits](../../research/memory-20261031.md) record the actual synthetic/offline results.050a adds the gated FTS access function;050b owns embedding jobs;050c propagates copied-evidence retention.051 remains reserved for metrics. No retained data indexing, real weights/model/game activity, runtime activation, deployment or push was performed.
