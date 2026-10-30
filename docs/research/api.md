# Research investigation API v1

These routes use the existing authenticated operator session, CSRF protection on mutations, and `no-store`. The current operator console has deployment-wide authority. Injected internal principals may restrict agent/cohort IDs; HTTP requests cannot supply their own principal or widen it. Sessions are rechecked for each page and private chunk.

- `GET /api/research/runs/:runId` creates a one-hour snapshot bounded by run retention. Returns snapshot ID, maximum ingestion ordinal, complete event total, sealed manifest or explicit `unavailable`, frozen native allocation/command census, coverage and metric definitions. Compatibility runs remain labeled compatibility.
- `GET …/events?snapshotId=UUID&limit=200&cursor=OPAQUE` returns original events, total, hasMore and nextCursor; max 500. Optional kind/streamId filters are bound into the authenticated cursor. No payloads are automatically decrypted. Ordinal is an ingestion locator; per-stream sequence and parents express causality.
- `GET …/coverage?snapshotId=UUID` returns frozen reconciliation, separate event/byte coverage and explicit gaps. It is not a quality score.
- `GET …/lineage?snapshotId=UUID&limit=200` returns bounded nodes/parents, complete total, omitted count and unresolved/outside-page parent IDs. Omitted nodes are never silently treated as absent causes.
- `GET …/artifacts/:artifactId?snapshotId=UUID` streams an exact referenced artifact after scope, consent version, session and retention checks. Private bytes are never returned in list metadata. Revocation stops subsequent chunks; a reenabled consent does not reopen old snapshots.

Snapshot reads reject expiry, foreign sessions, altered cursors, changed filters and foreign artifacts. New events never change an existing snapshot. Missing historical runs return `EVIDENCE_RUN_NOT_FOUND`; legacy reports remain available through their existing routes. Expired snapshots report `EVIDENCE_SNAPSHOT_EXPIRED` instead of inventing retained bodies. Cancellation closes the stream; no automatic gameplay retry occurs.

`GET …/export?snapshotId=UUID` streams a recipient-key encrypted exhaustive archive; `x-fleet-export-key` is required, separate from runtime keys. See [archive format and offline verification](archive.md). Delivery reauthorizes throughout; there is no export cache to outlive consent.

Operational trace links use `traceLink(event)` from `src/research/telemetry/projection.ts`: deterministic run/event IDs and validated W3C traceparent propagation. These identify evidence; they convey no actor authority. Operational backends use a safe metadata projection and can lose data independently of the journal. See the [fixture stack runbook](../../ops/research/README.md).
