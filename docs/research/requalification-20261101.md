# Q3 recording overhead and requalification — 1 November 2026

**Recording overhead improved substantially; Q3 remains blocked by latency.** The exact packaged candidate passes all eleven non-performance fixture gates. Latency overhead is **21.10%** against the unchanged **10%** limit; process peak RSS overhead is **13.69%** against **15%**, which now passes. No live test or deployment was performed.

The earlier [acceptance](acceptance-20261101.md) and [cleanup](cleanup-readiness-20261101.md) records remain historical evidence. This report and its [machine-readable results](requalification-20261101.json) supersede their current recording measurements. Fixture acceptance does not grant execution authority.

## Changes and preserved guarantees

- Bound recording now revalidates scope, native identity/claim, operation and run binding using shared invoker-rights PostgreSQL operations. Journal sequence allocation, duplicate keys, causal-parent checks and immutable insertion remain atomic. Existing typed cold binding remains authoritative.
- Encrypted bodies, event references and quota reservations commit together in a durable SQL outbox. File publication and fresh scope/consent/version/retention/integrity checks still complete before required provider dispatch. Rejected events leave no extra body or reservation; initial capture failure remains fenced after session recreation.
- Removal of redundant SQL ciphertext piggybacks subsequent journal commits or explicit cleanup. The bounded 128-entry map contains publication IDs/digests, never authority or plaintext. Durable outbox reconciliation survives eviction/restart; readers still authorize freshly. The benchmark drains and measures final cleanup and refuses pending copies.
- Both legs of the owned PostgreSQL relay disable delayed buffering. A byte-exact fragmented-frame test passes on macOS and Linux; target/nonce restrictions remain intact. Filesystem setup is reused while directory type and permissions are freshly checked on every operation; traversal/symlink/overwrite and file-sync protections remain.

Migration **054** and matching recording routines are required by the new binary; inspection readiness refuses missing routines. This deliberately keeps recording coupled to the existing PostgreSQL 17 backend, with unchanged application/storage ports. Schema and application versions must be deployed together under a separate installation assignment. No dependency pins, native budgets, unknown reservations, manifest limits, privacy retention, page/chunk sizes or qualification thresholds changed.

Exploratory publication-before-journal/eager-dispatch changes were discarded: a process death during staging could leave less sequence evidence, and measured gains were insufficient. Their diagnostic results are retained privately and are not qualification evidence. The retained implementation commits the encrypted journal before filesystem publication.

## Measured result

Same original workload: 1000 operations per mode, 50 ms fake provider, concurrency 4, one warmup per mode, five alternating measured pairs, fresh Linux process per sample. The score is the mean of the five service p95 values; RSS compares each mode's maximum process peak. No baseline delay was added. Every enabled sample reconciles **4004 events /2000 artifacts /1000 calls**, with zero pending ciphertext copies after measured cleanup; disabled samples have zero captured events/artifacts and 1000 calls.

| Metric | Previous result | Current result | Unchanged limit |
| --- | ---: | ---: | ---: |
| Service p95 overhead | 68.86% | **21.10% — fail** | 10% |
| Peak process RSS overhead | 38.66% | **13.69% — pass** | 15% |

Mean service p95: **54.536 → 66.045ms**. Maximum process peak RSS: **85577728 → 97296384 bytes**. Final enabled cleanup takes 0.607–0.850ms and is included in elapsed time, CPU and peak-memory measurement.

| Pair | Disabled p95 ms | Enabled p95 ms | Disabled peak RSS bytes | Enabled peak RSS bytes |
| --- | ---: | ---: | ---: | ---: |
| 1 | 54.534 | 65.356 | 84201472 | 96399360 |
| 2 | 54.621 | 65.605 | 84799488 | 96542720 |
| 3 | 54.444 | 66.311 | 84332544 | 96428032 |
| 4 | 54.647 | 66.298 | 85577728 | 96776192 |
| 5 | 54.434 | 66.656 | 84889600 | 97296384 |

The exact image is `sha256:4df8fd05dd62d012b52991d511fbcd77eba0f4a9cc3cf66974edf92ede21ec18`; source digest `01b9599cda90020a5aeeeab38076350f0be447434b0288a37b4b703b0e9cbad8`; lock digest `74ae0befe5de6c0edc90790522b905ae7b8a65a04bc9aceb97a0beee0c3467ca`. Node 26.13.0/npm 12.2.1, PostgreSQL/pgvector versions and full warmup/measured samples are in the JSON record. The benchmark retains87 concurrent database/runner resource snapshots; peak sampled database memory is 159.50MiB. These samples make backend cost visible; the process RSS guard does not certify aggregate backend overhead. Native admission/scheduling, Temporal and optional OTel backend throughput remain outside this workload.

## Completed verification and retries

- 1251 root unit passes /23 skips;1251 passes /23 skips again through the owned architecture runner;43 Linux process/affected-unit passes, including the relay test.
- 97 research integration checks and38 native/paired PACT checks pass;32 fault checks pass, including native recovery, real local Temporal replay/restart, retention, worker and evaluator isolation.
- Seven release-property suite checks pass. Its four randomized properties each completed 2000 histories at seed 20261030, up to 50 transitions. This is 8000 randomized histories, not 14000 independent histories. The three remaining checks cover the matrix, semantic admission and mutation/shrinking oracle.
- Python 21 passes /4 skips; three separate Linux worker-isolation probes pass. Types/style/build/contracts/boundaries, synthetic Compose configuration and dependency audit pass, with zero audit vulnerabilities; existing nonblocking style/build warnings remain visible.
- 26 macOS and 26 Linux Chromium checks pass across wide/narrow layouts, including all mandatory views, 100k-event/16MiB-artifact fixtures, ≤2s interaction and ≤500ms page API p95 guards. Linux uses the pinned Playwright image with Node24.22.1 as its test driver; the application fixture uses Node26.13.0. Browser screenshots/results remain private synthetic evidence.
- Migration is applied twice and restored with encrypted chunks. All 77 legacy table projections match; one synthetic unknown allocation retains 40000 tokens. Native reconstruction reconciles 1 call, 1 confirmed command, 17 events and 13 artifacts; its archive verifies all 11427 bytes.

The first source check found a missing explicit type annotation. A type-only fix was committed before the packaged candidate was built; a fresh full check passes. The first release-property attempt lost its disposable PostgreSQL connection during migration at history312; it was an infrastructure failure, not an oracle mismatch. Its root cause is not established. The unchanged full release rerun passes; monitored fixture observations show no OOM/exit and current guest inspection shows no filesystem/OOM errors. A path replay was canceled when its release setting would run2000 additional histories and overlap the benchmark; it is not counted passed.

Original failed logs and the original three-blocker runner bundle are retained. A separate reassessment invokes the unchanged qualification policy with actual successful check/property rerun receipts, verifies the original log digests and exact source/image/lock, and still refuses the performance gate. It does not relabel a failed command or alter a threshold. Exact initial/retry receipts and final decision digests are in the JSON record.

## Preservation and remaining work

All 67 original container identities/configurations and 115 volume definitions match the protected baseline; all three original services are healthy. PACT source remains unchanged. Paused worlds, services, credentials, uncertainty, exact pending commands and protected recovery copies were not modified. This is service/configuration preservation, not a full retained SQL-row audit.

Only exact superseded qualification images/build stages created by this task were reclaimed after source/provenance and original-container-reference checks. The final measured candidate remains available. Final available space is **14.61GiB on the host /5.11GiB on Docker's data filesystem**. The retained disposable qualification image is about 3.32 GB; Docker's current 6 GiB build-headroom guard will require reclaiming a superseded owned build before another build. Existing services remain healthy. No global prune or retained volume deletion was used.

**Remaining:** reduce recording service latency below 10% and rerun unchanged Q3 acceptance. Q3 is not complete and the release is not qualified. Actual-target installation/compatibility/restore acceptance and a separately authorized bounded provider/game experiment also remain; E4/KQ1 and other deferred behavioral work are unchanged. These checks do not establish real-provider accuracy, strategic effectiveness, exhaustive fault coverage or host power-loss durability.

The remaining latency gap is 6.055 ms in mean service p95 on this runner: the current 66.045 ms must fall to at most 59.989 ms at the measured 54.536 ms baseline. These measurements are not confidence intervals or a platform-wide reliability claim. More latency work is required; validation, observation fields and limits were not removed to obtain acceptance.
