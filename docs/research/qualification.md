# Scoped research qualification

**Current result: blocked by measured recording latency/RSS overhead.** See the [1 November acceptance report](acceptance-20261101.md). All eleven non-performance gates pass after protected Docker recovery; every remaining check was executed.

Qualification is evidence about an exact tested fixture, installation, provider or behavior scope. It is never an execution grant. The immutable record binds the resolved manifest, current capability fingerprint, dependency versions, dataset, completeness, all twelve mandatory gates and an expiry of at most 30 days. Each gate binds its own scope, target and manifest/capability/dependency digests; retagging the outer attestation or recompiling a different manifest cannot reuse those proofs. Evidence ingestion is internal and trusted, not a public signature or execution credential. Current inputs must be reassessed before use. Altering a label or copying a decision cannot produce an assessed record. Changes require new evidence and a new manifest; original records remain intact.

`npm run qualify:research -- --matrix` writes the deterministic20-case configuration design. It covers every pair across recipe, worker language, scheduler owner, recall strategy, index consent, budget mode, schema support and stop state, plus four named high-risk scenarios. Semantic admission explicitly rejects unsupported schema and unconsented indexed recall. This does not enumerate every combination. A generated case is an obligation, not a passing test result or qualified configuration.

`npm run qualify:research -- --fixture` runs the source checks,2000-history properties, Python suite, native fault/restore tests, paired PACT handlers, browser walkthrough, compiled Linux package, recording benchmark, architecture suite and dependency audit. It creates only owned synthetic databases/storage/networks. It records every command, exit code and evidence digest in the plan's ignored directory. A missing, duplicated, failed or skipped required gate blocks the assembled decision. Performance failures remain explicit; the runner completes the remaining checks and exits nonzero when qualification is blocked. Actual test skips remain in logs.

The source-suite manifest deliberately names a fake fixture worker. Its exact source/image/lock digests are recorded. Passing it does not enroll a reference recipe or qualify a real provider, production role, arbitrary configuration, second game or strategic outcome. The public acceptance report records the measured scope and outstanding gates.

## Failure and coverage matrix

| Risk | Actual evidence |
| --- | --- |
| Cancel / fencing / late usage | Native dispatch-boundary recovery suite; known late usage settles once, unknown usage retains its full reservation. |
| Retention / index / cached context | Memory/source consent and retention tests plus actual browser expiry/revocation checks. |
| Worker restart / pending command / duplicate delivery | Real local Temporal restart/replay, native original-command reconciliation and owned broker RPC. |
| Optimizer / judge / held-out split | Offline optimizer/evaluation isolation tests; no automatic promotion. |
| Migration and rollback |77 pre041 table projections preserved through twice-applied migrations and SQL+ciphertext restore; pre048 binaries are incompatible with new scheduler ownership. |
| Product reconstruction | One native synthetic source/context/call/lost-response/reconciled-effect/objective/archive chain, rendered by the actual studio; paired PACT handler tests separately validate game authority. |
| Performance |1000 operations per mode,50ms fake provider, concurrency4, one warm-up and five measured repetitions; raw data and container footprint retained. |

Outages are deterministic boundary tests, real owned PostgreSQL connection termination/transaction abort, local Temporal failure/restart and artifact/exporter failures. This is not host power-loss or arbitrary distributed-partition certification. Zero invariant violations in these tests does not establish a platform-wide failure probability.

## Benchmark interpretation

`npm run benchmark:research -- --fixture` uses fresh Linux processes and the actual encrypted recording boundary against owned PostgreSQL. Each mode is warmed once, followed by five alternating pairs. The latency guard uses the mean of the five p95 service times; the RSS guard compares the maximum process peak across each mode. Limits remain10% and15%. Actual provider delay, CPU, artifact bytes, SQL footprint, process RSS and sampled host/database container resources are included. The workload excludes native admission, task scheduling, Temporal and optional telemetry backend throughput; those components are not silently counted as free or performance-qualified. Browser large-run limits remain100k events,16MiB artifact,2s interaction and500ms page API p95.

The native browser fixture replays only the synthetic acceptance output at a fixed, clock-preserving date. Prepare it with `npm run test:architecture -- tests/acceptance/research-engine.test.ts` before directly running `tests/browser/research/walkthrough.spec.ts`. It does not connect a browser to retained data or manufacture a new receipt. Native export integrity is tested separately from the synthetic archive writer protocol.
