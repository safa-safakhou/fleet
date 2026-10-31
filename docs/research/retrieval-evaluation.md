# Local embeddings and retrieval evaluation

M4 adds a native `EmbeddingPort`, a local Sentence Transformers adapter and a frozen synthetic retrieval evaluation. Source/offline acceptance is complete; no retained private source was indexed and no real weights were provisioned. The existing Laya environment and certificate are untouched.

## Installation and identity

`workers/research/pyproject.toml` and `uv.lock` already pin the optional `embedding` extra to Sentence Transformers6.2.0. The ordinary Python worker image includes the hash-locked base dependencies; it intentionally excludes this optional extra and weights. A real compute installation requires an explicitly provisioned image containing that locked extra, a reviewed license and local artifact manifest. Inject `LocalEmbeddingCompute` into the native `ResearchBroker` constructor. No worker or request can select a model path, image, endpoint or grant. Missing compute returns `LOCAL_EMBEDDING_UNAVAILABLE`; required vector retrieval has no fallback.

The artifact manifest contains:

- `identity`: revision, SHA256 digest, dimension and normalization (`l2` or `none`).
- `files`: every relative model/config/tokenizer file mapped to its SHA256. No extra files are accepted.
- `preprocessing`: version `st-encode@1`, `maxSequenceLength`1–8192, `queryPrefix` and `documentPrefix`.
- `license`: the reviewed artifact license identifier.

`artifact_digest()` hashes canonical sorted UTF8 JSON of `{identity without digest, files, preprocessing}`. Changing weights, dimensions, preprocessing or revision changes the pinned identity and memory namespace. Only the installed Transformer/Pooling/Normalize modules are accepted. Python/pickle weights, custom modules, escaping paths and auto-map code refuse. Both `local_files_only=true` and `trust_remote_code=false` are enforced. Sentence Transformers documents these flags in its [model API](https://www.sbert.net/docs/package_reference/sentence_transformer/model.html); its [module-loading guidance](https://www.sbert.net/docs/package_reference/util/misc.html) also explains why local custom code needs an independent restriction.

The native adapter launches a digest-pinned, pull-never Docker image with no network, no capabilities, no privilege escalation, a nonroot UID, a read-only root/model/manifest, one CPU, 2GiB memory/no extra swap,64 process limit,64MiB scratch, a60-second deadline and bounded output. Request bodies travel only through a private stdin pipe. The container receives no provider/database credentials. The existing base-image isolation probes pass; a real embedding image/model remains a separate, unexecuted artifact installation.

## Jobs, resources and revocation

The scoped Protobuf `EmbeddingRequest` is generated in TypeScript/Python from C1 source. It uses the existing authenticated UDS broker and `port:N` operation journal. Query input contains text; document input contains a memory ID and expected source version. The native kernel resolves authorized document text. Source-complete vector/hybrid context uses the same port for its query vector.

The native journal reserves a stable operation/logical key before compute, enforces eight jobs per operation, and admits at most one active compute per kernel process with no waiting queue. Distributed installations must bound their kernel replica count separately. Each installed container has the resource limits above. Batches are bounded to16 texts/64KiB each; the native port currently admits one item per job. CPU usage includes local model initialization/encoding; native wall time and unknown usage remain distinct. Embedding work uses `purpose=embedding`, never a fictitious generative allocation or token count.

Completed retries reuse encrypted results; ambiguous jobs remain unknown and cannot automatically recompute. Document projection updates recheck version and scope. A revision, source deletion/expiry, index-grant revocation or observation-consent revocation invalidates job bodies, associated request/result artifacts and derived vectors. Query jobs expire after30 days. Maintenance purges invalidated ciphertext; artifacts immediately deny reads and inline bodies are cleared. Minimal job identity/status/cost tombstones remain to prevent replay and preserve accounting. Known CPU cost is retained even when source authority disappears during compute. Revocation cannot retract bytes already delivered to an authorized caller.

## Frozen development evaluation

Run:

```sh
npm run eval:retrieval -- --dataset tests/fixtures/research/retrieval-labels.json --manifest tests/fixtures/research/pact-reference.json
```

This command creates and owns a new PostgreSQL17/pgvector0.8.7 fixture; caller database URLs are never selected. The provided manifest fixture carries an explicit `fleet.synthetic-retrieval-config/v1` descriptor; it is not a deployed/sealed run manifest. Inputs are development-only and bounded to four documents/four queries (eight native jobs), with unique IDs, explicit grades and fake vectors. The [labels](../../tests/fixtures/research/retrieval-labels.json) are frozen synthetic data, not held-out evaluation or training inputs.

The [recorded result](fixtures/retrieval-development.json) contains dataset/manifest fingerprints, embedding identity, extension/server versions, exact selected document IDs, per-query/aggregate relevance, measured retrieval duration and source coverage. The run produced:

| Metric | Result |
|---|---:|
| Mean precision@2 |0.75|
| Mean recall@2 |1.0|
| MRR |1.0|
| Mean nDCG@2 |1.0|
| Index coverage |complete,3/3 per query|

Precision divides by requested k, recall by relevant label count, MRR uses the first relevant result, and nDCG uses graded gain `2^grade-1` with log2 rank discount. Duration measures native retrieval/evidence work; this tiny fixture is not a latency benchmark. The exact cosine baseline and scoped GIN-plan checks are covered by integration tests; see [retrieval behavior](retrieval.md) and the [pinned extension source](https://github.com/pgvector/pgvector/blob/master/README.md?plain=1).

Default fake-vector Python tests execute. The optional real-artifact test is explicitly skipped because this assignment did not provision weights. A later approved smoke test can provide `FLEET_RESEARCH_EMBEDDING_ASSIGNMENT` pointing to a `fleet.embedding-test-assignment/v1` JSON file with `purpose=offline-embedding-smoke`, local `modelDirectory`, local `manifestPath` and `expectedIdentity`; the test never fetches weights. English development labels do not qualify multilingual relevance, embedding quality, gameplay accuracy or a reliability percentage. A1/A3 can consume this result schema and immutable label fingerprint; held-out labels must remain separate.
