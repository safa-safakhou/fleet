# Research source release and package

**Current qualification is blocked by measured recording overhead.** Linux package checks and synthetic Compose validation now pass after protected Docker recovery; see [actual results and limits](acceptance-20261101.md). Production installation remains separate.

This is a source release with a separate compiled inspection entry point, `dist/server/research/package.js`. It starts no worker, enrollment, task pump, Temporal activity, model call or game call. Live/worker/Temporal activation settings are refused. Login/logout and authenticated GET/HEAD inspection remain available; other API mutations return `RESEARCH_PACKAGE_READ_ONLY`. Normal execution still requires the separately authorized controller/worker entry points and a scoped run grant.

`ops/research/Dockerfile` pins the Node26.13.0 base by digest and uses npm12.2.1 plus the root lock. Its `qualification` target contains tests and a separate `/release` mirror with production-only dependencies. Linux tests run that compiled mirror as UID10001 with read-only root, dropped capabilities, no-new-privileges,2CPU/2GiB limits, owned temporary caches and an internal network connected only to the owned synthetic PostgreSQL container. No private host directory or Docker socket is mounted. The `inspection` target uses the same compiled output and production dependency tree without the test harness. Build it under an installation assignment and record its resulting digest; no image is pushed by source qualification.

`npm run test:research-package -- --fixture` builds a curated public-source context, tests health/readiness, authenticated inspection, blocked mutation, restart preservation, no provider/game requests, secret exclusion, missing key and missing extension readiness. The exact image/source digests and actual results are retained in the ignored qualification report. Image caching checks the current public-source digest before reuse.

The disabled Compose recipe is [package.compose.yaml](../../ops/research/package.compose.yaml). It requires an exact image digest, owner-only env/key-proof references, an owned evidence volume and a pre-created isolated database network. With no profile, it starts no service. The reference profile exposes only a random loopback console port; production ingress/TLS and roles must be supplied and reviewed for the actual target. Evidence volume permissions must allow the dedicated UID; the current reader initializes/checks its private directory, so the volume is writable even though API mutation is blocked.

## Persistence, ports and capacity

| Component | Authority / persistence | Access and provisioned envelope |
| --- | --- | --- |
| Fleet inspection/kernel | Fleet PostgreSQL17, schema through053; encrypted evidence chunks on separate owned volume | Console8820 internally, random loopback publish; inspection1GiB/2CPU. Fleet runtime role owns its migrations; an inspection-only DB role still needs target-specific verification. |
| Research Python worker | Broker sessions and encrypted checkpoints remain in Fleet; no worker database or vault | One explicitly invoked process, network none, UID10001, read-only root,512MiB/1CPU/64PIDs,32MiB noexec scratch, dedicated read-only IPC directory. Exact worker image in `worker-image.json`. Native development mode does not receive container isolation qualification. |
| Temporal | Separate database/role and history; never Fleet accounting tables |7233 internal; optional UI8080 loopback only. Server installation/version/schema/capacity gates remain target-specific. Local native replay fixtures do not certify a production Temporal server. |
| Collector / Tempo / Prometheus / Grafana | Replaceable projections, separate volumes, no raw private bodies | Existing pinned observation recipe; loopback4318/3200/9090/3000,256MiB/1GiB/512MiB/512MiB service caps. Actual installation and aggregate capacity remain unaccepted. |
| Retrieval and optimization | Scoped consented FTS/vector projections; candidate/experiment evidence remains encrypted in Fleet |pgvector0.8.7, pinned embedding metadata; no weights downloaded. DSPy/MLflow remain offline/projection tools, not alternative authorities. |

Disk sizing must include SQL, encrypted chunk overhead, journal/backup copies, optional indexes and projection retention. Use actual benchmark artifact/SQL deltas and observed workload rates; there is no invented production capacity guarantee. Keep sufficient headroom above configured artifact/run quotas and the existing minimum free-space guard. Scope-specific indexing consent is required even when the extension is installed.

Keep dependency notices and license records from [dependencies](dependencies.md). Grafana/Tempo AGPL obligations and separate model-weight licenses remain material. No model weights or third-party service redistribution is granted by a green source test.

See [operations](operations.md) for backup/rollback and later activation gates, and the dated acceptance report for actual results.
