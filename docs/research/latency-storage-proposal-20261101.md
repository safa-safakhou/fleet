# Q3 storage-path decision — 1 November 2026

**Approved for implementation1 November2026; not yet implemented or qualified.** The owner selected “Use your judgment and proceed with a validated storage change.” The owner requires recording overhead below10% without losing observation, validation or existing data. The last packaged qualification still fails latency at21.10%; memory passes at13.69%. Current diagnostic timings differ from that older run, so new source needs its own exact packaged qualification.

## Work already completed

Commits `7e4e5b8` and `b7bed20` add migration055 and its inspection-readiness checks. One-parent validation formerly scanned5002 event rows in a5000-row unrelated-history fixture. Primary-key lookups now satisfy the bounded-read regression, retaining identity, parent-scope, immutable ordering, duplicate detection and copy-digest checks. Locked copies still use `SKIP LOCKED` and remain available to restart reconciliation.100 research integration checks, types/style/build/boundaries pass. Existing nonblocking warnings remain.

The group-commit experiment passed its21 targeted correctness checks but increased measured latency. Its product changes were discarded and are retained only as private diagnostic evidence. Neither migration056 nor a group-commit writer is installed or committed.

## Approaches for the next change

1. **Keep the current filesystem architecture.** Continue optimizing the existing SQL-outbox → file publication → post-publication validation path. This preserves the current storage implementation. The remaining serialized commit/publication barriers still exceed the limit in diagnostics; there is no demonstrated sub10% candidate.
2. **Add a small-artifact PostgreSQL tier.** Use the existing authenticated-encrypted chunk representation and read path to retain small artifacts durably in PostgreSQL. Keep the existing filesystem path for larger artifacts and all legacy records. This removes duplicate storage work for eligible artifacts without making evidence asynchronous or removing its authorization and validation rules. It changes the reference storage implementation and increases retained SQL payloads and backup/storage responsibility.

**Builder recommendation:** investigate approach2, using no new language, service or dependency. It is not yet proven to meet10%. Approach2 is selected under the owner’s delegated judgment;64KiB is the initial implementation ceiling to validate.

## Proposed boundaries if approach2 is selected

- Add an explicit storage-policy discriminator; legacy records default to their existing filesystem/outbox behavior. Do not rewrite, delete or move retained artifacts, worlds or installed services.
- An initial proposed ceiling is64KiB of ciphertext per eligible artifact. This is a builder proposal to validate, not an approved limit change. The existing1MiB plaintext chunk cap, manifest/run quotas, body bounds and30-day privacy retention remain unchanged.
- Commit input bytes, artifact references, quota reservations and immutable events atomically. Required input must be durable and available before provider dispatch. No provider/network call occurs inside a database transaction.
- SQL-tier publication must perform fresh scope/native authority, consent/version, retention and integrity validation against the canonical stored bytes. Reads retain authorization and chunk/digest checks. Filesystem-tier records retain every existing filesystem failure, immutable-publication and post-write validation check.
- Revocation/expiry must clear canonical encrypted SQL bodies as well as derived indexes/exports/caches. A complete artifact cannot be mislabeled merely because materialization has not run. Recovery must never repeat a model call or game command.
- Archives and restore must reconcile both storage tiers with the same IDs, byte counts, chunk counts and digests. Physical database footprint must be reported separately from logical artifact bytes; backend cost must remain visible.

## Required evidence before retaining the change

Write failing regressions before product code. Cover SQL-tier transaction rollback, database/storage failure before dispatch, consent changes, wrong scope/version/digest, quotas, expiry/revocation, mixed legacy/new reads, restart, archive/restore and ambiguous commit acknowledgment. Keep filesystem-tier fault cases active; selecting a different tier must not silently disable them. Known post-dispatch usage must still settle, and unknown reservations must remain intact.

Then run the full research/native/fault/property/package/browser qualification on the exact candidate source/image/lock. Use the original1000 operations/mode,50ms fake provider, concurrency4, warmups/five alternating measured pairs and unchanged10% latency/15% peak-process-RSS guards. Record all events/artifacts, cleanup, SQL footprint and concurrent backend resources. No padding, sampling, lowered limits, real inference/game activity or installed-runtime activation is authorized by this proposal.
