# PACT research qualification after Docker recovery — 1 November 2026

**All remaining checks executed; overall fixture qualification remains BLOCKED by measured recording overhead.** The Docker/filesystem and Compose blockers are repaired. All eleven non-performance gates pass. The current decision is `blocked` with `GATE_REQUIRED:performance`; it grants no activation. The [machine-readable record](qualification-20261101.json) contains exact source/image/lock/proof digests, per-gate exits, raw performance repetitions, preservation hashes and current browser measurements. The [31 October record](acceptance-20261031.md) remains historical.

## Recovery and preservation

The [recovery record](docker-recovery-20261101.md) describes the controlled VM restart, forced conservative filesystem checks, restored original boot configuration, Compose symlink repair and unused-block reclamation. Both filesystems report clean. All 67 original container identities/configurations/images/normalized mount sets and all 115 original volume definitions match the private pre-recovery capture. The three original services report healthy, and the post-recovery kernel error log is empty. No existing container/volume was pruned or reset. Only a superseded qualification image created during this assignment was removed.

Protected same-device APFS disk clones remain private. They share extents and are not independent physical backups or complete database checksums. No readable pre-incident SQL row-hash baseline exists; service health and configuration preservation are not a full business-data integrity audit. Compose 5.1.3 validates the disabled recipe with synthetic references; no Compose deployment was started.

## Actual checks

`npm run qualify:research -- --fixture` completed against the committed source with every required command executed. Its nonzero exit is the expected consequence of the performance gate below, not another unavailable Docker result.

| Check | Actual result |
| --- | --- |
| Root units / architecture wrapper |1,248 passed; 23 macOS platform skips. The wrapper reruns the root suite; these are not distinct extra tests. |
| Linux process / affected units |42 passed in the final orchestration; 44 passed in the targeted repair run including two storage guards. The 22 Codex process tests use a fake CLI, never real authentication/inference. |
| Release properties |7 passed, 2,000 histories/test, seed20261030. |
| Python |21 passed,4 skipped. Three Linux isolation probes also pass separately; the real-weight artifact remains unrequested/unfetched. |
| Distributed faults |32 tests in 8 files passed, including real local Temporal replay/restart and owned PostgreSQL connection/transaction failure. |
| Native / paired PACT |26 tests in 9 files passed, including current SQL proof binding, native walkthrough and actual public PACT handlers against fresh owned schemas. |
| Preservation / restore |77 legacy table projections match before/after twice-applied migration and restore; complete SQL+ciphertext restore matches. The unknown allocation retains 40,000 tokens. |
| Browser |26 macOS and 26 Linux Chromium checks passed, covering wide/narrow views. |
| Compiled Linux package |Passed production-dependency startup/readiness/authenticated reads, mutation refusal, restart preservation and missing-key/extension failure checks. Execution remains disabled. |
| Contracts, types, style errors, build, boundaries, audit |Passed; npm audit reports zero vulnerabilities. Existing nonfatal style/build/deprecation warnings remain. |
| Compose |Version5.1.3; synthetic `config --quiet` passed. No service startup or production installation. |
| Recording overhead |Executed completely; latency and RSS limits failed. |

Counts from separate runs overlap and must not be summed as distinct scenarios. Tests skipped by their native runner stay recorded as skipped, even where the corresponding Linux probes pass separately.

The synthetic migration restore archive verifies 2 events/1 artifact/0 gaps. The native walkthrough reconciles 1 fake call, 1 confirmed effect, 17 events, 13 artifacts and 11,427 plaintext bytes with 0 archive gaps. A lost response does not duplicate the effect; independently observed state, rather than the receipt alone, establishes the fixture objective. No retained world/database was selected.

## Performance findings

Actual Linux Node 26.13.0 recording boundary, owned PostgreSQL 17.11/pgvector0.8.7, 1,000 operations/mode, 50 ms fake provider, concurrency 4: each mode warms once, followed by five alternating measured pairs in fresh processes. The Node container has 2 CPU / 2 GiB, read-only root and an internal owned database network. The runner records actual platform/CPU visibility and limits; it does not infer physical hardware from the container's CPU count.

| Measure | Recording disabled | Recording enabled | Acceptance |
| --- | ---: | ---: | --- |
| Mean of five service p95 values |52.306 ms |88.325 ms |+68.86%; limit 10% — **failed** |
| Maximum process peak RSS |80.92 MiB |112.20 MiB |+38.66%; limit 15% — **failed** |

Every sample reconciles 1,000 provider calls; recording produces 4,004 events and 2,000 encrypted artifacts per 1,000 operations. Each enabled sample contains 534,000 artifact bytes. Raw per-sample CPU, provider/service/host-exclusive latency, peak RSS, cumulative SQL/relation sizes and counts are in the JSON record. The private full benchmark also retains 100 active-container samples; maximum sampled combined Node+PostgreSQL memory was 294.90 MiB and combined CPU was 70.83% (Docker's per-core convention). These are sampled container measurements, not whole-machine peaks or a production capacity guarantee.

The first run also exceeded both limits (74.72% latency and 37.68% RSS). Its full evidence was preserved privately before the corrected-fixture rerun. No threshold, workload count, retention rule, encryption or evidence-completeness guard was weakened to obtain a pass. Performance optimization needs a separate measured change; these results do not identify its cause by themselves. Native scheduling/admission, Temporal and optional telemetry-backend throughput remain outside this recording-boundary benchmark.

## Visualization

Current Linux Chromium 156.0.8078.4 used the pinned Playwright image with Node 24.22.1 as its test runner, against an owned synthetic macOS API over `host.docker.internal`. This is separate from the Node 26 application/package qualification. The 100,000-event/16 MiB browser fixture reached interaction in 162.3 ms wide and 89.8 ms narrow; page API p95 was 4.64 ms and 7.94 ms respectively, 20 page samples each. The 2 s/500 ms UI budgets pass. This is not Linux PostgreSQL100k-event performance certification.

The actual recorded native context and mobile outcome screenshots were visually inspected. Replay freezes time to the original synthetic observation date; historical evidence is not relabeled fresh. Current screenshots and traces remain in the private qualification ledger, with the prior visual examples linked in the historical report.

## Source repairs and remaining scope

| Commit | Verified change |
| --- | --- |
| `230b12b` |Independent host 8 GiB / Docker 6 GiB build guards, invalid-measurement refusal, exact-source image reuse and build-owned intermediate cleanup. Two guard tests observed RED then GREEN; types/boundaries pass. |
| `675732c` |Protected filesystem recovery and preservation record. |
| `f0ffda8` |Explicit executable scratch only for Linux fake-process fixtures; default Docker noexec caused 18 failures. Targeted 44-check run passed after repair. Package and benchmark scratch remain explicitly noexec. |
| `3352270` |Compose repair and bounded unused-block reclamation record. |

Implementation and review were inline under the repository's no-delegation instruction; no independent reviewer was used. The final integrated rerun binds the repaired source and image in the JSON record. Public documentation changes do not alter that curated runtime-source digest.

Recording performance remains the sole failed fixture gate. Actual-target installation, production roles/network/isolation/backup capacity, real-provider compatibility and behavioral/strategic effectiveness are separate unaccepted scopes. E4/KQ1, unknown allocations and historical operational status remain unchanged. No real model call, game action, retained-world reset/replay/enrollment/indexing, deployment or push occurred. The PACT checkout was not modified. The machine-wide space audit is private because it includes personal application/profile paths; available space remains limited and is recorded separately after all checks.

Final storage check: approximately **9.84 GiB host free** and **7.4 GiB Docker data-filesystem free**. Root has 18 GiB free. The 8 GiB host / 6 GiB Docker build guards remain in place. This is limited headroom, not a long-term capacity clearance. The private audit separates current active VM-file allocation from shared recovery clones and lists the largest review candidates without deleting application data.
