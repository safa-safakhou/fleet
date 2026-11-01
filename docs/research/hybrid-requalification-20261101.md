# Q3 hybrid-storage requalification —1 November2026

**Subsequent owner decision:** [Q3 optimization work is closed as accepted at the current result](q3-owner-closure-20261101.md); further optimization is deferred. The measurements, failed10% gate and strict qualification decision below remain the original evidence.

**The requested sub10% result has not been achieved.** The approved storage change is implemented and committed, all eleven non-performance fixture gates pass, and the unchanged performance gate remains blocked. [Machine-readable receipt](hybrid-requalification-20261101.json) records the strict assembler decision, exact provenance, samples and evidence digests. [Previous requalification](requalification-20261101.md) remains historical evidence.

## Current measured result

| Metric | Recording disabled | Recording enabled | Overhead / guard |
| --- | ---: | ---: | --- |
| Mean of five service p95s |54.5138116ms|63.3923964ms|**16.2869% — FAIL10%**|
| Maximum process peak RSS |86,261,760B|97,230,848B|**12.7160% — PASS15%**|

Each mode uses1000 operations, concurrency4 and a50ms fake provider, one warm-up followed by five alternating measured pairs in fresh processes. Every enabled sample, including warm-up, contains exactly4004 events,2000 artifacts and1000 fake calls; disabled samples contain zero events/artifacts. Filesystem pending-copy count is zero. Final copy cleanup remains inside elapsed/CPU/peak-memory measurement and took0.117–0.166ms in measured enabled samples. No workload, guard, sampling policy or durability setting was relaxed.

Each enabled cohort retains244,000 logical body bytes and534,000 encrypted bytes in2000 canonical PostgreSQL artifacts; filesystem payload bytes are zero for this small-body workload. Large/native/legacy filesystem behavior is tested separately.85 paired runner/database resource snapshots remain retained. Across the accumulating fixture, total database size grew from12,588,723B to76,104,207B, including metadata, indexes and all cohorts; this is not the payload size of one run. Relation bytes and per-sample database totals are in the receipt; WAL is outside `pg_database_size`.

The current limit permits59.96519276ms mean-p95 service time. Another **3.42720364ms** reduction is required. The earlier21.10% report used a different host-time measurement; historical timings alone do not isolate the source-change effect.

## Retained implementation

- `d872dbb`: migration056 adds an explicit storage backend, defaulting every existing row to filesystem. Standalone artifacts with at most65,536 encrypted bytes can remain canonical in PostgreSQL. Native-transaction/lineage and streaming writes retain filesystem storage. Existing evidence is not moved.
- Stored SQL ciphertext, chunk metadata, full reference, digest, scope, consent/version, expiry, purge state and byte totals are verified in the atomic capture transaction. Quotas,1MiB plaintext chunks,32MiB capture bodies and30-day retention remain unchanged. `bf51a69` closes a SQL-NULL validation gap; corruption/missing-metadata regressions fail before dispatch and roll back bytes, quota and events.
- `5e98640`: immediate-dispatch providers can commit their request and dispatch intent together after validating canonical input. Providers reporting their own dispatch and filesystem-backed requests retain their separate publication/preparation/dispatch stages. Fresh conditional capture resolves consent under transaction locks and retains the correct withheld metadata even for an unencodable body. Known provider usage remains available after observation loss.
- Capture uses at most three database requests per complete small-body call. The pending-filesystem index avoids visiting retained canonical SQL bodies: a5000-row regression fell from5000 visits to at most20. Previous migration055 also retains bounded scalar parent/copy lookups, conflict detection and `SKIP LOCKED` recovery.
- Canonical SQL bytes cannot be cleared by copy acknowledgment or mistaken for pending file publication. Restart, mixed-tier reads, revocation/expiry, ambiguous commit acknowledgment, no provider replay, archive and full SQL/chunk restore are covered.

No language, service, library or lockfile was changed. All changes remain source/package work on master; installed runtimes and retained worlds were not migrated.

## Verification and provenance

Runtime source commit `bf51a69`; public-source digest `09fabc6219a317f29cd24434810f73426b20e7782efe6c577c9ee468b2083bab`; lock digest `74ae0befe5de6c0edc90790522b905ae7b8a65a04bc9aceb97a0beee0c3467ca`; exact image `sha256:0d78a0ac7bdffb8f0a231caebe049d5c032a5190595eed5ed44781e282077ae5`.

The unchanged qualification assembler reports eleven passes and `GATE_REQUIRED:performance`, manifest digest `207571d08df0ceffdb4a5c1efe954a616d56761c6f93ff91fccadcf5ae137cfe`. No reassessment or hand-assigned pass replaced that decision.

| Check | Actual result |
| --- | --- |
| Root / owned architecture |1251 passes /23 skips each; categories overlap|
| Research integration / native and paired PACT |111 /52 passes|
| Linux process and affected / fault checks |43 /32 passes|
| Release properties |7 suite checks; four randomized properties ×2000 histories, seed20261030, max50 transitions; all pass|
| Python / separate Linux worker isolation |21 passes /4 skips;3 separate Linux isolation checks pass|
| Browser |26 macOS;26 Linux on the final retained-trace run|
| Migration and restore |77 legacy table projections unchanged after twice-applied migrations and SQL/chunk restore; both storage tiers verified|
| Restored archive / unknown reservation |3 events,2 artifacts,108 bytes, no gaps; unknown1/40,000 tokens retained|
| Package / contracts / boundaries / types / build / audit |Pass;0 audit vulnerabilities; existing nonblocking style/chunk warnings remain|

Linux runtime checks use PostgreSQL17.11/pgvector0.8.7, Node26.13.0, UID10001 and read-only root with2CPU/2GiB limits. Linux browser checks use the pinned Playwright image, Node24.22.1 and Chromium156.0.8078.4, retaining the2CPU/2GiB/512MiB scratch limits. Browser guards remain100k events,16MiB inspection,2s interaction and500ms page API p95.

The first supplemental Linux run passed25 checks and failed during trace teardown with a shared-mount `EACCES`. A second run passed26 UI checks but its artifact collector could not use `docker cp` on tmpfs. The final run retained tracing on container-local scratch and copied all results through an ownership-checked, path/type-checked tar stream before cleanup:26/26 pass with complete collection. Both earlier attempts remain retained; no UI product change or trace disabling concealed them.

Review was performed inline under AGENTS' no-delegation instruction. Decisions: retain the smaller implementation when an experiment shows no material gain; keep native/lineage/large/legacy writes on the established filesystem path; preserve private ledgers despite skill cleanup defaults. Costs are potentially unused minor optimizations, narrower performance coverage and an author self-review rather than an independent review.

## Discarded diagnostics and remaining work

Cross-record group commit, no-delay canonical batches, single/grouped ordinal allocation, a combined journal mutation statement, direct fixture transport and named prepared statements did not demonstrate a useful latency gain. Their product changes were discarded; raw diagnostics and prototypes remain private. CPU-profile timings are instrumented diagnostics and do not count as passing benchmark samples. An isolated disk probe measured an8KiB `fdatasync` at about85µs; no asynchronous commit or weakened durability was selected. PostgreSQL describes the durable sync methods in its [WAL configuration documentation](https://www.postgresql.org/docs/17/wal-configuration.html).

**Q3 remains open.** Further synchronous-journal/runtime performance work is required to demonstrate the additional3.4272ms reduction under the same paired workload and resource limits. There is currently no validated sub10% candidate. Actual-target installation/provider/behavior acceptance and E4/KQ1 remain separate; no live test, inference, game run, deployment or push occurred.

## Preservation and space

All67 original container configurations and115 volume definitions match the protected baseline; the three original services remain running and healthy. No pre-incident retained-world SQL hash baseline exists, so this is not a full business-data audit. PACT source remains unchanged.

Only the exact unused previous qualification image/owned ancestor layers and the verified unused dependency stage from this build were retired. The current qualified candidate, original service images, private evidence and recovery clones remain. Final availability is approximately14GiB on the host and5.2GiB in Docker's filesystem. Headroom remains tight; a later fresh build must satisfy the unchanged8GiB host/6GiB Docker guards.

Private evidence: `.superpowers/sdd/2026-10-30-pact-research-07-qualification/latency-20261101/`; prior raw receipts are preserved in `pre-hybrid-20261101/` and the exact current bundle in `qualified-bf51a69-20261101/`. Tier-unaware pre056 binaries must not be used against canonical SQL bodies without a reviewed conversion or a tier-aware rollback binary.
