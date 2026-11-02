# Isolated local readiness — 2 November 2026

**Live-readiness conclusion superseded:** the [subsequent real recipe launch](nemotron-advisory-hour-20261102.md) stopped before model dispatch because the full PACT request exceeded the unchanged byte budget. The installation/preflight checks below remain their timestamped results; they did not cover this complete request shape.

**Installation and bounded provider prerequisites verified. No live gameplay test started.** The new empty world is paused at tick 0, Fleet execution is disabled, Fleet task workers are stopped, and the preflight provider has stopped. [Machine-readable results](isolated-readiness-20261102.json), [execution plan](../superpowers/plans/2026-11-02-pact-live-readiness.md), [proposed finite test settings](isolated-test-envelope-20261102.json).

The remaining activation work is deliberate: the owner must instruct the later finite experiment; its participant identities, absolute clocks and matching sealed manifests are then assembled before explicit Temporal enrollment and worker startup. Nothing in this preparation resumes a retained world or grants gameplay authority. Formal source qualification still records the owner-accepted performance variance below.

## Installed instance

World/incarnation: `fleet-ready-20261102-6bce0141`. It owns its PostgreSQL storage, internal Fleet/Temporal networks, separate Fleet/PACT/Temporal persistence/visibility database owners and fresh private keys. Fleet migrations through 059 and 73 PACT migrations were applied after owned empty-database backups; pgvector 0.8.7 is verified. Current PACT source is `4f64faf49f2e33ba45bc441d6f621ce8005a6dbe`, freshly built for this installation.

Fleet runtime source remains the tested `bf51a69`. Qualification image `sha256:0d78a0ac7bdffb8f0a231caebe049d5c032a5190595eed5ed44781e282077ae5` runs its audited `/release` production dependency mirror through the compiled read-only inspection entry. This is the qualification artifact containing a production mirror, not a new minimal production image. No runtime source or dependency lock was changed.

Temporal server 1.32.1 uses pin `sha256:acecbab5b0b8ae9cf4012b508866ca97feda3709577bf157b537239f40029049`. Matching 1.32.1 SQL tools came from ARM64 image `sha256:7788bd9fdbf62927bde820363037bf290fb7dd81eb0cf65fc78c6bb6deb88a2a`; schema setup follows the [official PostgreSQL deployment example](https://github.com/temporalio/samples-server/blob/main/compose/docker-compose-postgres.yml). The tools image's CLI reports 1.9.1 and its embedded development server 1.32.0; neither is substituted for the installed server. The new namespace survives restart with ID `18c65632-ceb6-445e-8bcb-0988d5f90b62`, 30-day retention and zero workflows.

The current PACT API is loopback-only. Its ordinary local guest entry is enabled for later synthetic preparation, verified by a read-only request; no join, account, kingdom or participant was created. The world remains paused at tick 0. Rules/inference/game workers were never started.

| Verified installation check | Result |
| --- | --- |
| Fleet schema, pgvector and encrypted key proof | Ready; execution disabled |
| Missing session / valid operator session | Inspection refused / allowed |
| Authenticated enrollment mutation | Refused by read-only package |
| Invalid key proof, then exact restoration | Readiness 503, then ready again |
| Five cross-database credential checks | All refused |
| Index role reading raw accounting/artifact/memory tables | All refused; scoped projection remains readable |
| Inspection direct external TCP | Denied |
| Owned application/Temporal restart | Paused state and namespace preserved; no workflow started |
| Original 67 containers / 115 volume definitions | Configurations and mounts unchanged; three original running services healthy |

Temporal is a trusted local development installation with no public ingress. Application networks remain internal; a non-root ingress relay accepts only fixed owned destinations. Docker 29 did not publish ports from those internal networks. Later, Colima's host forwarding stalled despite passing guest-local health. Incomplete verifiers were stopped; a separate loopback-only SSH tunnel now serves the new endpoints. Colima and the original services were not restarted or resized. This is not acceptance for shared/public production hosting.

## Nemotron preflight and observation

The cached `nemotron-3-nano:4b` catalog digest is `6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197`. Every referenced model/config/license/parameter blob matched its manifest hash. Existing native macOS Ollama 0.40.11 executable hash: `653dac8da3e2bc1a8e981ee9bd95d21456ae41a16f27f8c8140baec23045bc27`. This observed provider is separate from historical WSL 0.35.1 qualification.

Exactly **one synthetic call** used native admission, a 40,000-token reservation ceiling, a 90-second deadline, 32,768 context, 512 maximum output, thinking disabled and temperature 0 / top-p 1. It returned the requested JSON acknowledgment with **49 input / 6 output tokens** and **1,430 ms** recorded provider time. No second call or gameplay command was made.

Coverage reconciles **17 events / 3,476 artifact bytes**, complete with no missing units or unknown allocations. Seventeen sanitized events appear in Prometheus and one trace in Tempo. Authenticated browser checks render the actual preflight timeline, causal graph and Grafana dashboard without browser errors. The provider is stopped. Stopped preflight metrics are checked over their historical interval; expired live series are not fabricated as current samples. Unavailable backend timing remains unavailable.

Preparation/report failures remain retained: the isolated preflight database initially lacked vector; after installation, the reporting script failed after known usage settlement. The stored encrypted response and native ledger were independently validated without another call. Pausing the synthetic cohort fenced its turn; native finalization preserved `cancelled`. The contract/usage check passes, while that original reporting invocation did not finish normally. This does not establish PACT decision quality, a successful gameplay turn or all architecture/provider combinations.

## Backup and restore

Only owned new application/Temporal processes were stopped for coherent backups. Five separately owned restored databases match every canonical public-table count/hash: Fleet 117 tables, PACT 167, Temporal 40, visibility 3 and preflight 118 — **445 table projections**. SQL backups are additionally encrypted with private key references. Both state trees match their file hashes.

A separate, labeled synthetic chunk sentinel verifies atomic writes on the actual host-backed device, restored authenticated decryption and refusal of corrupt ciphertext. It is not model/game evidence or a large-artifact gameplay result. Actual preflight model artifacts retain their PostgreSQL canonical tier; materialized copies and the sentinel are retained with the paired state backup. Original-world databases were not dumped or read for this work. Preservation establishes resource configuration and service health, not a business-data hash audit.

## Space and execution placement

Only verified unreferenced public tool caches were retired, without force: Playwright, PostgreSQL 18.6, Go 1.26.6, Python 3.13 and Temurin 25. No global prune, container/volume deletion or private evidence cleanup occurred. Future use of a retired tool image requires its pinned distribution again.

Final measured availability is **13.30 GiB host / 8.12 GiB Docker**, above the unchanged 10 GiB host artifact reserve, 8 GiB host build minimum and 6 GiB Docker build minimum. Docker's largest categories remain **79.17 GB images / 11.69 GB volumes**; its “reclaimable” label does not establish permission to delete retained services or data. Shared layers mean image reported size is not reclaimed-byte evidence.

The selected future executor is trusted native Node 26 / TypeScript, using the actual host filesystem reserve check. The inspection container mounts its private host state directory under the host's numeric non-root UID. Its shared-mount `statfs` reports a virtual capacity and must not be used to establish real free space. A different/container execution placement needs its own capacity validation; no reserve, quota, capture requirement or source threshold was lowered. The Docker VM remains 2 CPU / approximately 2.83 GiB RAM; this preparation is not a large-concurrency load qualification.

## Access and remaining authority

Current loopback endpoints, dependent on the owned tunnel:

- [Fleet inspection](http://127.0.0.1:64366) — empty paused target; operator authentication required.
- [Preflight evidence viewer](http://127.0.0.1:60366/#research/run/64c11609-6a31-4d54-8f4d-221f04b657a4) — separate synthetic preflight database, read-only.
- [Grafana](http://127.0.0.1:64368), [Prometheus](http://127.0.0.1:64369), [Tempo readiness](http://127.0.0.1:64370/ready).

Private configuration, keys, credentials, invocation/process/tunnel records, encrypted backups, hashes and screenshots remain in `.superpowers/sdd/2026-11-02-isolated-readiness/`, excluded from Git. `fleet.env`, `preflight-viewer-env.json` and `grafana.env` contain their respective private authentication configuration; no values are copied into this report.

The proposed first experiment is one TypeScript advisory participant, 15 minutes, at most two calls / 80,000 reserved tokens, no gameplay commands, full observation, indexing disabled and stop-on-uncertainty/evidence failure. It is configuration-validated, not enrolled or authorized. Absolute clocks, identities, sealed manifests and execution commands remain ungranted.

The owner-accepted **16.29% latency overhead** remains a strict failure against the unchanged 10% source qualification threshold; optimization work is closed. No automatic gate result or activation policy was rewritten. Historical E4/KQ1 and strategic/behavioral acceptance are unchanged. No live gameplay test, push or retained-world uncertainty review occurred.
