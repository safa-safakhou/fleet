# Worker and inference pools implementation plan

> Execute inline with superpowers:executing-plans. The user's implementation request approves the preceding two-pool proposal. No delegation, GUI, game activation or historical grant reuse.

**Goal:** Concurrent decision work and bounded shared-model inference, measured on local Nemotron 4B at concurrency 1, 2 and 4.

**Architecture:** Reuse durable task/turn admission, fairness, per-kingdom fences and database-backed model leases. A common bounded worker pool replaces separate process-local lane counters. Provider capacity remains independently configurable and shared across workers. Codex remains single-slot. Preserve existing defaults and installed settings; document explicit candidate settings (8 workers, 1/2/4 inference slots, 16384 context, 300 seconds keepalive).

**Stack:** Node 24, TypeScript, Vitest, existing PostgreSQL 17 test fixtures, native Ollama 0.35.1.

## Constraints and review focus

- Preserve live-disabled configuration, retained databases/worlds, services and unknown commands; E4/KQ1 blocked.
- Only nemotron-3-nano:4b, digest 6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197, for actual inference.
- Independent task contexts; no overlapping game write authority. Existing agent/task admission stays authoritative.
- Cover pool saturation, rejected work, shutdown/drain, all legacy cancellation signals, invalid configuration, wire context/keepalive, shared route capacity and stopped-game admission.
- Benchmark uses synthetic prompts and production HttpModel only; never the game runtime/credentials/worker. Fresh isolated provider on unused loopback port 18534, same existing model files, one benchmark provider at a time. No installed-service configuration changes.
- Benchmark ceiling: 39 calls (3 warmups + 8 measured calls per concurrency), 20 minutes total, 90 seconds/call, 512 output tokens/call, 16384 context, no retries. Stop on transport/usage failure; report malformed or incorrect decisions separately and report incomplete stages honestly. Save raw evidence outside Git; commit only synthetic source and aggregate report if requested.

## Task 1: Implement independently bounded pools

- [x] Add failing unit tests for configuration, bounded worker lifecycle and actual HTTP request options; add synthetic integration coverage for route capacity 1/2/4 and legacy cancellation.
- [x] Implement WorkerPool and use it for platform and legacy dispatch, preserving alternating lane priority and disabled admission.
- [x] Expose provider capacity (Ollama and compatible routes separately), context and keepalive through validated config. Keep Codex capacity 1. Pass options to HttpModel.
- [x] Ensure concurrent legacy turns retain independent abort signals and all are stopped.
- [x] Run focused and full unit tests, selected isolated integration tests, type/build/style/boundary checks.

## Task 2: Benchmark and assess feasibility

- [x] Add reproducible bounded benchmark using production transport, synthetic independent kingdom snapshots and a fixed structured decision schema. Keep a model warm during each measured phase; vary synthetic request IDs to avoid exact-response caching.
- [x] Verify provider/model identity, no loaded model in ordinary service and free private port. Start only the owned provider; use process identity for cleanup, not name-wide termination.
- [x] Measure per-call and total wall time, actual tokens, load/prompt/decode times, effective overlap, peak host/GPU memory, success/parse outcomes, mean/p50/p95 and calls/minute at each concurrency. Stop and clean up on timeout/failure.
- [x] Convert measured rate to daily demand for 36 decision-makers / 24 kingdoms at 2 calls/turn; show 15/30/60-minute reviews and event-burst capacity. Do not multiply throughput by slots without measurements or claim gameplay qualification.
- [x] Review final diff inline, record limitations and checks; update current state and report. No activation, push or commit unless requested.

## Execution ledger

Task 1 implemented: 17 new configuration/pool/wire checks; 30 isolated integration checks passed, including capacities1/2/4 and legacy cancellation RED→GREEN. Full unit suite initially914passed/1failed: exact historical-controller drift guard caught the intentional shutdown edit. Added four exact reverse mappings, retaining original source/artifact hashes; focused rerun passed. Final full rerun pending. Types/build/boundaries passed.

Ruling: first one-call benchmark stopped honestly after a semantically incorrect warmup (7.627s including5.813s load). Preserve it as failed evidence. Measuring transport throughput must not require successful game reasoning: a fresh benchmark records schema/core-field outcomes separately, with8 measured calls per level plus3 warmups,27new calls/28combined, within39 total; no retries or old marker reuse. No behavior acceptance follows from throughput.

Ruling: source work stays on the user-required master checkout; no worktree/delegation/commits. No installed route capacity, service, credential or game setting changes.

Task 1: complete. Final 917/917 unit, 30/30 isolated integration, types/build/changed-file style/boundaries. Legacy idle-lane filling regression RED→GREEN; baseline artifact hashes preserved.

Task 2: complete. Fresh throughput 27 calls/62.37 seconds; retained failed warmup 1 call; 28 combined. Requested 1/2/4 slots yielded 32.65/33.88/35.62 calls/minute but provider logs show nemotron_h forced to 1 actual slot. Correctness 11/24 checked core fields; no gameplay acceptance. Private provider stopped and ordinary provider empty/unchanged.

Final review: author self-review, per user no-delegation. Reviewed saturation, both admission lanes, all legacy aborts, progress/drain, endpoint-shared leases, default preservation, wire settings and backend slot evidence. No unresolved pool correctness finding. Existing pinned-proposal formatting error and fast-uri moderate dependency finding retained and reported; no dependency/proposal hash changes.

Ruling: Recommend 8 decision workers/1 actual inference slot for the current backend, 16k context/300s keepalive; requested 4 does not produce 4 GPU slots. Compute extrapolation is conditional on the measured 3154-input/~166-output-token workload, not all architecture scenarios or a 24-hour load test. Cost if wrong: real larger decisions/events can exceed modeled demand; behavioral failures already prevent readiness claims.
