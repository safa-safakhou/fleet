# PACT research dependency baseline — 30 October 2026

C1 establishes reproducible sources, versions, licenses and resolution constraints. It does not certify every future backend or model. The foundation installed Protobuf runtime, gRPC, local generators and fast-check. O6 additionally installs the pinned OTel API, explicit trace/meter/resource SDKs and HTTP exporters, plus Playwright for synthetic browser verification. The Python protocol package uses Pydantic, gRPC and Protobuf; agent, embedding and optimization extras are locked but not installed or invoked here.

## Evidence and ownership

| Record | Meaning |
| --- | --- |
| [npm versions](dependencies.npm.json) | Exact direct versions, registry integrity, declared Node requirements and licenses for the planned JS tools. |
| [prospective npm lock](dependencies.npm.lock.json) | A separate metadata-only resolution of those tools under Node 26/npm 12 with engine checks; not Fleet's installed dependency graph. Root `package-lock.json` owns actual installed packages. |
| [Python artifacts](dependencies.python.json) | Exact direct package versions/licenses and published wheel/source hashes. `workers/research/uv.lock` owns the complete resolved optional graph. |
| [service image candidates](dependencies.images.json) | Immutable registry digests and advertised platforms. O6 exercised the four observation images only in owned synthetic fixtures; live deployment/qualification is not claimed. |
| [pgvector source](dependencies.pgvector.json) | Exact extension source revision/archive digest; PostgreSQL integration belongs to M2. |

Actual qualification here: Node 26.13.0, npm 12.2.1, Python 3.12.13 on macOS arm64; real binary interchange and Python validation; PostgreSQL fixtures in newly owned Docker containers. Python 3.12 is an isolated worker environment, with no change to existing Laya helpers or installed service runtimes. The shell's Homebrew Node is broken; verification uses a task-local Node 26 binary. Future Linux/native Temporal dependencies and remaining service images need their owning task's runtime tests. [O6 backend verification](observation-20261031.md) records the observation images' actual fixture acceptance. Registry engine/architecture metadata is not ABI or operational acceptance.

The prospective Promptfoo dependency graph initially reported five high-severity audit entries, all arising from `basic-ftp <=6.2.0`. Pinning `basic-ftp` to **6.2.4** resolves those entries without downgrading Promptfoo. The root override records that constraint for later integration; root and prospective npm audits then report zero advisories. This is a snapshot of registry audit evidence, not a guarantee of future vulnerability status.

Direct JS licenses are MIT, Apache-2.0 and BSD combinations. Python direct licenses are MIT/Apache/BSD, plus Hypothesis MPL-2.0; preserve its notices and any obligations for modifications to its covered files. DSPy is MIT and MLflow Apache-2.0, with their published notices retained in the metadata. Service source licenses are recorded alongside image candidates: Temporal MIT, Collector/Prometheus Apache-2.0, Grafana/Tempo AGPL-3.0, PostgreSQL its own license and Python PSF. AGPL is a material choice for future service modifications/distribution; these remain separately packaged services, with notices and source obligations retained in their release work. Model weights have independent licenses: none were downloaded or qualified. Runtime/license review of a new distribution or model remains part of that component's gate.

## Reproduction

Use the pinned Node/npm versions and `npm ci`. Run `uv sync --project workers/research --locked --group dev` with its pinned Python; this installs the broker-only Pydantic AI worker, without optional embedding/optimization extras. `npm run research:contracts:generate` uses the local pinned ES plugin and locked Python protoc. `npm run research:contracts:check` regenerates in a temporary directory and rejects drift. `buf lint` uses the locally pinned binary. The Python `fleet-research-worker --protocol-info` command is offline inspection only. Executing an operation additionally requires a scoped private-stdin control packet and an authenticated broker socket.

No real-provider credential, game integration credential, deployment or grant is part of these records. A later task must recheck advisories and run its component tests before enabling the pinned candidate.
