# PACT Research Engine Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement the linked plans task by task, inline. Repository instructions prohibit delegation unless the owner explicitly requests it. Checkboxes describe future implementation, not work authorized by writing this plan.

**Goal:** Deliver a PACT-focused Fleet engine with complete authorized evidence, mandatory research visualizations, independently validated metrics and replaceable agent/retrieval workers.

**Architecture:** Retain the TypeScript/Fastify authority and accounting kernel and React studio. Add Temporal for explicitly owned durable tasks, a scoped Python/Pydantic AI worker, and replaceable retrieval/evaluation ports. PostgreSQL and encrypted artifacts own evidence; OpenTelemetry and MLflow are projections.

**Tech Stack:** Node 26/TypeScript, React, Fastify, PostgreSQL 17; Temporal TypeScript SDK; Protobuf/gRPC; isolated Python 3.12 reference worker with Pydantic AI, Hypothesis, Sentence Transformers and DSPy; fast-check, Promptfoo, XState, OpenTelemetry Collector, Tempo, Prometheus, Grafana, Apache ECharts, MLflow, pgvector.

**Spec:** [PACT research engine migration design](../specs/2026-10-30-pact-research-engine-design.md). This is the scoped release specification, taking precedence over the broader [future architecture study](../../proposals/fleet-target-architecture-20261030.md).

## Global Constraints

- PACT only. Do not generalize games, reopen deferred milestones or install every research candidate.
- Work inline on the main Fleet repository; preserve unrelated edits. This assignment writes plans only. Implementation, commits, pushes and operational acceptance require their own covering assignment.
- Preserve original identities, pending commands, unknown allocations, budgets, schedules, bindings, history and terminal states. No automatic enrollment, restart, model call, game read/write, reset, replay or uncertainty review.
- PostgreSQL 17 and Node 26 remain the current platform. The new Python 3.12 environment is isolated from existing Python/Laya helpers; all dependencies and container images are pinned after compatibility qualification.
- All worker effects use persisted scoped kernel ports. No worker game/provider/database/vault credentials, hidden retries, direct fallback or network/model calls inside SQL transactions.
- Private observations retain the current 30-day policy. Searchable derived indexes need their own explicit consent/policy; FTS and vectors are not encrypted private text.
- Artifact plaintext chunks are at most 1 MiB. Event pages default to 200 and are at most 500. Full exports stream every retained page; unavailable/withheld/expired data remains explicit.
- Source/offline, installation and behavior/provider acceptance are separate. No estimated reliability percentage or synthetic result is live behavioral certification.

## Review Focus

1. A crash or duplicate delivery between SQL, Temporal, a worker and a PACT receipt must retain the original effect ID and uncertainty, without repeat dispatch — C3, R1, R4, Q2.
2. Consent loss, expiry, quota exhaustion or an exporter/storage outage must not create invisible gaps or disclose another actor's data — O2, O4, O5, M1, U1, Q2.
3. Large parallel/late traces must retain causal order, pagination and timing meaning, without treating an inter-event gap as service duration — O1, O3, O6, U1, U2.
4. Configurations that parse but use incompatible clocks, stale facts, unknown usage or changed component versions must fail qualification or report uncertainty — C2, R3, M3, A1, Q1.
5. Shared-world interference, delayed outcomes, wrong denominators and held-out leakage must prevent unsupported effectiveness claims — A1–A4, U4, Q3.

## Decisions and tradeoffs

| Decision | Reason / retained cost |
| --- | --- |
| Keep the TS authority kernel; add Python workers rather than rewrite the API | Preserves tested lease/receipt/budget behavior while enabling Python research libraries. Costs a real process/schema/isolation boundary, which gets conformance tests. |
| Include Temporal, with one owner per task | Improves visible durable waits and crash recovery. Adds a service and history/version management; it does not make external effects exactly once. |
| Use XState only for pure local policy | Makes scripted/role behavior inspectable without introducing a second durable scheduler. |
| Own evidence and metrics; export to OTel/MLflow | Avoids vendor history/sampling/privacy behavior becoming the audit contract. Costs an owned journal, reconciliation and retention implementation. |
| Exact vector baseline before approximate retrieval | Establishes correctness and scoped recall. Costs more query work initially; approximate speedups need measured recall evidence. |
| Explicit searchable-index policy | Avoids quietly weakening encrypted-history privacy. Some profiles cannot use hybrid retrieval until separately granted indexing scope. |
| Require studio views before release | Investigation and comparison become usable product capabilities. Backend-only completion is insufficient. |

## Current file map and intended ownership

Existing code is the baseline, not an instruction to rewrite each file wholesale. Graph discovery was used, followed by scoped current-source reads where its index did not cover newer modules.

| Existing path | Planned responsibility / changes |
| --- | --- |
| `src/app/composition.ts`, `src/app/host-services.ts`, `src/app/builtins.ts` | Compose recorder, broker, task ownership and explicit reference recipes. Preserve current consumed paths. |
| `src/platform/tasks.ts`, `supervisor.ts`, `admission.ts`, `execution.ts` | Integrate stable broker steps, epoch fencing, recording and Temporal ownership around existing claims/ledger/receipt behavior. |
| `src/platform/engine-context.ts`, `architecture.ts`, `architecture-schema.ts` | Bridge in-process scoped services to sealed manifest and worker contracts. |
| `src/observability.ts`, `src/vault.ts`, `src/call-metrics.ts` | Compatibility adapters to new evidence/metric ports; retain old report shapes and historical limitations. |
| `src/games/pact/`, `src/environments/pact.ts` | PACT semantics and authorized observation/effect lineage; no game database coupling. |
| `src/cognition.ts`, `src/engines/autonomous-specialists/memory.ts`, existing continuity/skills modules | Adapt typed state/source records to the new memory/context ports without flattening their semantics. |
| `src/comparisons.ts`, `src/platform/reports.ts`, `src/evaluation.ts` | Add immutable, scoped experiment snapshots and versioned evaluator outputs alongside current comparisons. |
| `src/server.ts`, `web/main.tsx`, `web/runs.tsx`, `web/metrics.tsx`, `web/comparisons.tsx`, `web/observe.tsx` | Route authorized research APIs and mandatory inspect/compare screens. |
| `migrations/` | Additive migrations after current 041; no retained-world migration during development. |
| `tests/helpers.ts`, `tests/platform-helpers.ts`, `tests/fixtures/` | Fresh owned fixtures, fake providers, redacted synthetic traces and independent reference models. |

New modules live by responsibility: `src/research/{manifests,broker,evidence,telemetry,orchestration,memory,context,metrics,experiments,evaluation}/`; `workers/research/` owns the Python package; `contracts/fleet/v1/` owns the process wire; `web/research/` owns the studio. Each subplan lists exact files to create and the current files to adapt. Do not make `src/server.ts`, `composition.ts` or the existing engine monoliths the home of new business logic.

**Implementation status — 1 November 2026:** C1–C4 are complete at source/offline scope; [actual verification and remaining gates](../../research/contracts-foundation-20261030.md). O1–O6 are also complete at source/offline scope; [observation verification and release boundaries](../../research/observation-20261031.md). R1–R5, M1–M4, A1–A4 and U1–U4 are also complete at source/offline scope; [runtime](../../research/runtime-20261031.md), [memory](../../research/memory-20261031.md), [evaluation](../../research/evaluation-20261031.md) and [studio](../../research/studio-20261031.md) record actual checks and limits. Q1–Q4 have been assigned and their source deliverables implemented. Docker/storage recovery is verified and all remaining checks have executed. All non-performance fixture gates pass, including Linux package and current Linux browser/process checks; recording latency overhead21.10% still exceeds10%, while RSS overhead13.69% now passes15%. [Current requalification and measurements](../../research/requalification-20261101.md) preserve initial failures and strict reruns. Q3 remains incomplete. No release is qualified or activated by that source completion.

## Work packages and dependencies

These are independently reviewable source deliverables, not automatic live rollouts. Complete the graph in order of dependencies; no independent agent dispatch is implied.

| Package | Tasks | Depends on | Deliverable and gate |
| --- | --- | --- | --- |
| [01 — Contracts and manifest foundation](2026-10-30-pact-research-01-contracts.md) | C1–C4 | None | Pinned toolchain, generated contracts, semantic compiler, stable kernel step ledger and baseline property checks. |
| [02 — Evidence and observability](2026-10-30-pact-research-02-observation.md) | O1–O6 | C1–C3 | Encrypted full records, complete inspection/export, all-path coverage and working OTel stack. |
| [03 — Durable runtime and workers](2026-10-30-pact-research-03-runtime.md) | R1–R5 | C1–C3, O1–O3 | Single Temporal owner, scoped Python/Pydantic AI and pure XState policies, fenced recovery and recipe parity. |
| [04 — Memory, retrieval and context](2026-10-30-pact-research-04-memory.md) | M1–M4 | C1–C3, O1–O3, R2 | Scoped typed memory, FTS/vector/RRF, pinned embeddings and source-complete context. |
| [05 — Metrics and experiments](2026-10-30-pact-research-05-evaluation.md) | A1–A4 | O1–O6, R4–R5, M1–M4 | Versioned metrics/evaluators, comparison snapshots, Promptfoo, offline DSPy and MLflow projection. |
| [06 — Mandatory research studio](2026-10-30-pact-research-06-studio.md) | U1–U4 | O4–O6, M4, A1–A2 | Causal/context/resource/outcome/experiment views with accessible tables, deep links and synthetic browser checks. |
| [07 — Qualification and preservation](2026-10-30-pact-research-07-qualification.md) | Q1–Q4 | All preceding packages | Risk-based configuration/fault matrix, reversible packaging, qualified fixture recipe and precise operational handoff. |

Critical path: contracts → recording/broker → runtime and context → evaluation → studio → integrated qualification. Metric definitions can be drafted from the spec early, but an aggregate cannot pass until recorded events and authoritative outcomes reconcile. The end-to-end reference recipe is not complete until its visual investigation works.

## Dependency policy and language boundaries

C1 owns the exact dependency compatibility/license report and locks. Runtime dependencies are added only in the package that actually uses them, not a bulk unused install. Package names to assess/pin:

- TS runtime: `xstate`; `@temporalio/client`, `@temporalio/worker`, `@temporalio/workflow`, `@temporalio/activity`; `@grpc/grpc-js` and generated Protobuf runtime; OTel API/Node SDK/OTLP exporters and explicitly configured instrumentations; `echarts` and `@dagrejs/dagre` for deterministic graph layout.
- TS development: `fast-check`, `promptfoo`, `@playwright/test`, pinned Protobuf generators/checker, `@temporalio/testing`; reuse existing Vitest/TypeScript/Biome checks.
- Python runtime, isolated package: `pydantic`, `pydantic-ai`, `grpcio`, `protobuf`, OpenTelemetry SDK/OTLP exporter; optional embedding extra `sentence-transformers` with its pinned numerical backend.
- Python development/optimization extra: `pytest`, `hypothesis`, `dspy`, `mlflow`, format/type/lint tools pinned in `uv.lock`. DSPy/MLflow need not be imported in the online worker.
- Services: pinned Temporal server/UI and own persistence database, Collector, Tempo, Prometheus, Grafana; pgvector extension version against PostgreSQL 17. MLflow runs as a protected local tracking service or file-backed offline projection during fixture tests.

Use separate Temporal and Fleet schemas/databases/roles; never let another service mutate Fleet's accounting tables. New services bind loopback in reference development packaging. Production isolation/ports/secret mounts are explicit Q4 artifacts. Do not use `latest`, unpinned transitive locks or alpha framework versions for qualified profiles. If a dependency cannot support the reference OS/runtime/license constraints, stop that component's gate and record a replacement ADR; do not silently downgrade the platform or claim an unused tool is integrated.

## Common task execution cycle

Each linked task has a concrete RED test and a scoped verification command. Write the named assertions, run and capture the expected failure, implement the named interface, then run the same command to PASS. Missing-module failures are acceptable only for new module scaffolding; behavioral tests must also demonstrate a failing assertion against incomplete behavior. Save seeds/counterexamples privately when they contain sensitive input; repository fixtures remain synthetic.

Integration commands require fresh isolated `fleet_test` and owned paired PACT fixtures, fake providers and no default live routes. A named script introduced by a task must exist before its command is reported as executed. Do not run the checks in this plan merely to write the plan. At each passing task, review the diff and checkpoint only when the implementation assignment permits commits; no task grants a push or deployment. This rule applies to every subplan checkpoint checkbox.

## Completion matrix

| Requirement | Owning tasks |
| --- | --- |
| Six selected tools deliver actual behavior | C4 fast-check; O6 OTel; R3 XState; M2 FTS/pgvector; A3 Promptfoo; A4 DSPy. |
| Complete event/payload observation and explicit gaps | O1–O5; R2 all broker steps; Q2 reconciliation. |
| Mandatory visualization and exports | U1–U4; Q3 browser walkthrough. |
| Accuracy, effectiveness, recovery and cost comparisons | A1–A4; U3–U4; Q3 independent fixture results. |
| Configurability without bypass or blanket certification | C2–C4; R2–R5; Q1 qualified-manifest matrix. |
| Typed memory and context provenance | M1–M4; U2; A1 retrieval and factual metrics. |
| Historical/live preservation and uncertainty | C3; R1/R4; Q2/Q4. |
| Replacement and exportability | C1 wire conformance; O5 full archive; R5 worker conformance; Q4 restore/rollback. |

## Release evidence and operational boundary

The final source acceptance report must contain exact revisions/locks, reference runner specifications, test commands/results including skips, risk matrix coverage, fixture manifests/seeds, preservation hashes, event/call/action/artifact reconciliation, metric definitions and independent-unit counts, UI screenshots from synthetic data, overhead measurements and unresolved blockers. Include a worked failure investigation and a worked comparison so a researcher can assess the product end to end.

The proposed qualified fixture recipe is PACT-specific, fully observed, with explicit policy/model/context/index settings. It proves only its tested fake-provider/synthetic scope. Actual provider calibration, strategic effectiveness and deployment are separate acceptance records. Preparing exact bounded real-run instructions is Q4 work; executing them requires a later explicit assignment. No task silently unpauses the world or consumes existing budgets.

## Planning verification

This document and the linked spec/subplans must pass local Markdown-link checks, task/interface/dependency consistency review and whitespace checks. No dependencies are installed and no implementation tests, model calls or game operations are part of producing these planning artifacts.
