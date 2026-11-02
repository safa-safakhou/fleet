# Isolated local readiness — 2 November 2026

Preparation is in progress under the owner's instruction: a new isolated local instance, Nemotron 4B, safe Docker cleanup, Temporal installation, and no live gameplay test. [Execution plan](../superpowers/plans/2026-11-02-pact-live-readiness.md).

## Installed checkpoint

Fresh instance/world incarnation `fleet-ready-20261102-6bce0141` has its own PostgreSQL storage, internal application/Temporal networks, four distinct database owners and private keys. No retained world was used. Fleet migrations through059 and73 PACT migrations were applied after owned empty-database backups. pgvector0.8.7 is installed. PACT is parked at tick0 with reason `ISOLATED_READINESS_NO_LIVE_GRANT`.

Temporal server1.32.1 is installed from the reviewed pin `sha256:acecbab5b0b8ae9cf4012b508866ca97feda3709577bf157b537239f40029049`. Its separate persistence/visibility databases were initialized using matching1.32.1 SQL tools from ARM64 image `sha256:7788bd9fdbf62927bde820363037bf290fb7dd81eb0cf65fc78c6bb6deb88a2a`. The admin image's bundled CLI reports1.9.1; its embedded development server1.32.0 is not the installed service. Namespace creation/readback and server-version checks pass, with zero workflows. Fleet task workers remain stopped. Server schema setup follows the [official Temporal PostgreSQL deployment example](https://github.com/temporalio/samples-server/blob/main/compose/docker-compose-postgres.yml).

Fleet's tested qualification image `sha256:0d78a0ac7bdffb8f0a231caebe049d5c032a5190595eed5ed44781e282077ae5` runs its audited `/release` production mirror through the compiled read-only inspection entry. This is the qualification artifact containing a production mirror, not a newly built minimal production image. `/health` reports live disabled and `/research/ready` passes schema, pgvector and encrypted key proof. PACT's freshly built current API is loopback-only; game/rules/inference workers have not been started.

Application networks remain internal. Docker29 does not publish ports from those internal networks, so a non-root fixed-destination ingress relay publishes only the three owned services on host loopback. It does not accept arbitrary proxy destinations. Temporal is a local trusted-operator, unauthenticated development installation, with no public ingress; this does not qualify it for shared/production hosting.

The unchanged10GiB artifact reserve uses a private host state directory, mounted for the host's numeric non-root UID. Docker's owned PostgreSQL volume remains separate. The shared filesystem reports a virtual capacity that differs from actual host free space: use actual host filesystem measurements as the capacity gate, not that virtual report. No artifact quota or validation threshold was lowered.

## Preservation and cleanup checkpoint

Fresh verification at06:04UTC compares all67 original container configurations/mounts and115 volume definitions with their baseline: no differences; all three original running services remain healthy. No original container/volume was removed, restarted or resized. Private evidence and recovery copies remain retained.

Only public tool caches with zero container references were retired, without force: Playwright, PostgreSQL18.6, Go1.26.6, Python3.13 and Temurin25. The first removal raised Docker free space from about5.11 to8.4GiB; subsequent pulls/initialization and shared-layer effects leave about8.2GiB. Reported image sizes are not reclaimed-byte measurements. Later use of retired tool distributions requires the same pinned image again. No global prune was used.

## Provider and recovery checkpoint

The exact cached `nemotron-3-nano:4b` catalog digest is `6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197`. All referenced model/config/license/parameter blobs were hashed and matched their manifests. The existing native macOS Ollama0.40.11 executable hash is `653dac8da3e2bc1a8e981ee9bd95d21456ae41a16f27f8c8140baec23045bc27`; this is a separately observed local provider, not the historical WSL0.35.1 qualification.

Exactly one synthetic call ran through native reservation, dispatch, validation, accounting and encrypted observation: a40,000-token ceiling,90-second deadline,32,768 context,512 maximum output, thinking disabled, temperature0/top-p1. It returned the requested JSON acknowledgment in1,430ms provider time, with49 input/6 output tokens reported. All17 events and3,476 artifact bytes reconcile complete, with no missing units, commands or unknown allocations. Seventeen sanitized events were projected to telemetry and one trace was retrieved. The provider is stopped; no second call was made.

Two preparation/report issues are retained privately: the isolated preflight database initially lacked the vector extension; after that was installed, the report script failed after known usage settlement. The stored encrypted response was independently validated without another call. Native stop semantics left its synthetic turn `cancelled` after the cohort was paused; this terminal result was preserved. The model contract check passes; the original reporting script did not finish normally. This establishes a small JSON/usage check, not PACT decision quality or an end-to-end research gameplay run.

Coherent backups were taken with only the owned new application/Temporal processes stopped. All five separately owned restored databases match every canonical public-table count/hash: Fleet117 tables, PACT167, Temporal40, visibility3 and preflight118 (**445 table projections**). SQL backups are additionally encrypted with private key references. Both state trees match their file hashes. An explicitly separate synthetic chunk sentinel verifies atomic writes on the actual host-backed device, restored authenticated decryption and refusal of corrupt ciphertext; it is not presented as model/game evidence or a large-artifact gameplay result. Native preflight model artifacts keep their actual PostgreSQL canonical tier.

A Colima host-forwarding stall blocked the first UI/backup verifiers even while guest-local service health passed. Those incomplete verifiers were stopped, and the owned endpoints now use a separate loopback-only SSH tunnel to the Docker guest. No Colima restart or original service configuration change was needed. Later checks must use the current private tunnel ledger rather than the initial auto-forwarded ports.

After restart, Temporal retains namespace ID `18c65632-ceb6-445e-8bcb-0988d5f90b62`, version1.32.1 and zero workflows. Five cross-database credential checks refuse access; the index role cannot read raw memory/artifact/accounting tables, and inspection direct external TCP is denied. PACT remains paused at tick0 with zero kingdoms. Fresh preservation checks still match67 original containers/115 volumes, with three healthy services.

## Still being verified

Final visualization assertions after the forwarding repair, negative key proof, final capacity and future finite-test record. Authenticated inspection and mutation refusal already pass; the timeline and causal graph have rendered. No live gameplay test has started.

The owner-accepted16.29% latency overhead remains a strict source qualification failure against10%; the optimization work is closed. These operations neither rewrite qualification nor grant live gameplay authority. No push, retained-world model call, uncertainty review or gameplay activation occurred.

Private operational ledger: `.superpowers/sdd/2026-11-02-isolated-readiness/` (configuration, keys, dumps and private commands excluded from Git).
