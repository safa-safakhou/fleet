# Versioned research retrieval

`baseline-v1` reads authorized encrypted memory without building a persistent private index. It ranks normalized Unicode word frequency, explicit importance and recency with stable IDs. Existing cognition/specialist recall packets keep their own implementations; adapters do not rewrite them.

`fts-v1` uses PostgreSQL `plainto_tsquery`/`ts_rank_cd` with a GIN lexeme index. This is PostgreSQL text ranking, not BM25. The reference language configurations are `en`/English and `simple`; unknown languages refuse. Unicode support is not multilingual relevance qualification.

FORCE RLS keeps direct non-owner queries private, but PostgreSQL's non-leakproof FTS operator can prevent GIN use below RLS. The narrowly scoped `research_fts_candidates` function validates the kernel transaction ticket and consent, binds the namespace internally and repeats source eligibility checks. It exposes IDs/version/scores only. It does not accept a caller-selected namespace or change global operator security flags. Privileged synthetic EXPLAIN checks the scoped inner query's GIN plan; ordinary API callers do not receive database-wide query plans.

`vector-exact-v1` uses pgvector cosine distance with no ANN index. Vectors must match the sealed revision, artifact digest, dimension and normalization. Zero, non-finite, wrong-sized and incompatible vectors fail. `rrf-v1` fuses one-based lexical/vector ranks as `sum(1/(60+rank))`, with stable source IDs breaking ties.

All result pools are scoped before ranking, bounded at500 records, and fail explicitly beyond that bound. Results record candidates, ranks, scores, selected source versions, omissions, strategy/index identity and timing. Missing projections produce partial coverage and `not-indexed` omissions; incomplete vector metadata refuses instead of falling back. Revocation/source changes are rechecked before returning records. Timing is measured, not deterministic packet identity.

Synthetic fixtures use PostgreSQL17 and pinned pgvector0.8.7. The owned test harness selects the digest-pinned image only with `FLEET_RESEARCH_VECTOR_FIXTURE=1`; normal fixtures retain PostgreSQL17-alpine. No live indexes or model weights were provisioned. Dataset labels in `tests/fixtures/research/retrieval-labels.json` are development fixtures, not held-out evaluation data.
