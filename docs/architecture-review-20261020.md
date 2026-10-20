# Fleet architecture separation and launch review

Date: 20 October 2026. Reviewed source: `421ad90a480ad4f6086ca8fffb69f542a920aa8f`.

Scope: local source/design review for adding autonomous specialists beside the five existing profiles and making architecture selection consistent. No application code, runtime, database, account, model, budget or deployment was changed. This is not a security audit or fresh assessment of installed/server Fleet.

The graph discovery tools were unavailable in this session. Source discovery therefore used the repository handbook, targeted text searches and direct source inspection. Findings below distinguish demonstrated code structure from future extension risks.

## Assessment

Fleet has a useful multi-engine foundation: versioned engine registration, environment capabilities, durable tasks, a shared admission ledger, command receipts, and separate engine folders. It is not yet a fully independent architecture platform. Architecture knowledge is distributed through storage, scheduling, admission, reporting and UI code. Adding an engine currently requires more than registering its implementation.

Recommended direction: preserve all existing profiles, introduce a manifest and narrow execution ports for every architecture, extract shared mechanisms into explicitly versioned modules, and add `autonomous-specialists@1` as a sixth profile. Keep the existing specialist/coordinator engine as its own architecture.

## Findings and concrete changes

| ID | Evidence in current source | Consequence | Proposed change |
| --- | --- | --- | --- |
| AR-01 | [ContinuityEngine](../src/engines/continuity/engine.ts) imports and extends `ReactiveEngine`. [SpecialistCoordinatorEngine](../src/engines/specialists/coordinator.ts) imports the continuity engine folder's state module and schema. | Direct sibling-engine dependencies make a behavior change in one architecture capable of changing another. Sharing itself is useful; ownership and versioning are unclear. | Extract shared decision-step and continuity mechanisms into versioned shared modules. Each engine composes them through its own entry point; engines cannot import sibling engine implementations. Preserve current prompts, limits and selection order during extraction. |
| AR-02 | [PlatformHost](../src/platform/supervisor.ts) and [ModelAdmission](../src/platform/admission.ts) enable sibling inference using the literal `specialist-coordinator@1`. [Store.recoverExpired](../src/store.ts) also treats that profile specially. | A new multi-component engine could be refused unnecessarily or receive an inappropriate crash classification if only some checks are updated. This is an extension hazard, not evidence of an existing incorrect recovery. | Host derives permitted operation modes from trusted registered descriptors and environment/provider limits. Persist the chosen mode and per-allocation dispatch evidence for recovery; do not recover by engine name or a process-local descriptor alone. |
| AR-03 | [ProfileConsole](../src/platform/profile-console.ts) and [EventIntake.enroll](../src/platform/event-intake.ts) have explicit three-profile event-wake allowlists; intake enrollment also requires version `1`. | Registering a future architecture/version is insufficient to make its wake policy usable. | Manifest declares supported trigger modes and policy schema; one server-side validator is used by drafts, configuration, event enrollment and start. No model-supplied manifest. |
| AR-04 | [Store.configure](../src/store.ts), around lines 140–148, rejects every selected profile whose version is not `1`, and couples legacy cognition settings to profile IDs. [ModelConfig](../src/domain.ts) contains cognition/recall options. | The registry supports arbitrary versions, but the configuration path cannot launch a version `2`. Model choice still partly selects architecture. | Separate provider settings from architecture configuration for new drafts. Isolate legacy flag translation/validation in the compatibility descriptor. Preserve all consumed model/configuration records and digests. |
| AR-05 | [ProfileWorkspace](../web/profiles.tsx) stores selection by `profile.id`, finds the first matching ID and keys options by ID. Event controls and submitted wake policy use `selected.startsWith("reactive-")`. The API accepts the specialist coordinator when capabilities permit. | Two versions of one architecture cannot be selected distinctly. UI and server have different event-wake eligibility rules; the mismatch is currently obscured by PACT rejecting the coordinator. | Select the full `{id, version}` reference; render validated manifest metadata and trigger controls. Add tests for two versions of one ID and a non-reactive event-capable fixture. |
| AR-06 | [runtime](../src/runtime.ts) manually constructs every engine and contains inline legacy registration. [worker](../src/worker.ts) alternates direct legacy execution and platform tasks, imports a disk helper from `engine.ts`, and performs module-specific maintenance. | Composition is explicit, which is good, but compatibility behavior and generic lifecycle are mixed. Every added runtime service risks another special case. | Static built-in descriptor registration plus module factories; explicit compatibility runner; registered maintenance hooks. Preserve the old scheduling lane and parity rather than rewriting historical cohorts into platform tasks. |
| AR-07 | [profiles](../src/platform/profiles.ts) mixes the generic profile reference with legacy baseline imports, cognition flags, AsyncLocalStorage and legacy provenance. [EngineContext](../src/platform/engine-registry.ts) exposes concrete `ModelAdmission`, `CommandExecutor` and `TaskClaim` containing the legacy `Claim`. [ContinuityModule](../src/engines/continuity/state.ts) uses `TaskStore.store.pool`, vault and the legacy `Cognition` class. | Engines are separated from game modules but still know concrete host/storage internals. The shared platform imports legacy architecture metadata. | Keep generic references in contracts. Move legacy manifest/session logic into the compatibility package. Supply scoped interfaces for models, actions, tasks, evidence and private state; inject implementations in the composition root. Keep existing storage behind compatibility adapters. |
| AR-08 | [platform_task_sources](../migrations/014_platform_host.sql) has primary key `(binding_id,event_id)` and one `task_id`. [TaskStore.upsertWithin](../src/platform/tasks.ts) returns the existing task for a repeated event; intake calls it once per admitted event. | One source event cannot independently wake several specialist tasks through the existing mapping. Simply calling upsert repeatedly will not implement fan-out. | Preserve old mappings; add deduplicated event-to-recipient deliveries and a transactional router for architectures that support multiple participants. Source intake remains unique; recipient processing is independently durable. |
| AR-09 | [continuity_states](../migrations/016_continuity.sql) is keyed by binding alone. [migration 017](../migrations/017_specialist_continuity.sql) permits two named namespaces; the state constructor accepts those same two profiles. | There is one continuity state per binding, not separate state for persistent specialists. An ID suffix in a prompt would not provide isolation. | New architecture-instance and component-scoped state with explicit versions and encrypted payloads. Leave existing continuity rows and schemas readable through their adapters; do not repurpose old rows. |
| AR-10 | [check-boundaries](../scripts/check-boundaries.mjs) detects game/environment imports and game identifiers in core/engines. It does not enforce sibling-engine, concrete-storage, or UI-to-engine boundaries. [Reports](../src/platform/reports.ts) also has a five-ID allowlist for public profile labels. | A passing boundary check does not establish architecture isolation. A new registered profile can disappear from shareable reporting. | Add import-graph rules and negative fixtures for architecture boundaries. Use explicitly public, sanitized manifest identity for reporting while retaining the existing export field allowlist. Never export arbitrary manifest/configuration payloads. |

## What should stay shared

Independent architectures should share platform mechanisms rather than duplicate accounting, authentication, command journaling or recovery:

- Authenticated environment bindings and adapter contracts.
- Provider access, route capacity and original usage allocations.
- Durable jobs, fences, cancellation, supervised execution and receipt lookup.
- Scoped evidence storage, encryption and retention primitives.
- Catalog, launch validation, status, reports and operator authentication.

Shared mechanisms must not decide which specialist's goals matter. Architecture-specific reasoning, prompts, memory selection policy, goal changes and conflict resolution belong to that architecture or its explicitly selected versioned modules.

The initial separation is a code/dependency boundary inside the current Node/TypeScript service, not separate services or an untrusted-plugin sandbox. Registered architecture code remains trusted.

## Launch assessment

The existing UI can create inactive profile drafts, and model/account/start configuration is handled separately. This is a workable foundation, but it lacks one manifest-driven, end-to-end readiness description.

The target is one flow for every architecture: select exact version, choose its configuration/preset, choose the provider, connect accounts, set existing limits and wake policy, inspect readiness, then start. Comparisons remain optional. An incompatible architecture stays visible with a specific explanation; the launcher must not silently fall back to another engine.

All entry points must call the same launch service. Validity, environment compatibility, qualification evidence and operational readiness are distinct fields. Capability compatibility alone must not be displayed as permission to execute.

## Skills follow-up — 20 October 2026

The founder additionally requested agents that learn reusable skills from experience to reduce future processing. Inspection of [continuation](../src/continuation.ts) shows bounded current-goal steps, dependencies, waits and factual postconditions; [cognition](../src/cognition.ts) contains plans and reflections. These provide useful episode/plan structure, but do not constitute the proposed parameterized, versioned skill library and qualification/interpreter lifecycle.

The revised design adds procedural skills as a shared module with architecture-owned learning and adoption policies. Short guides help model reasoning; qualified bounded recipes can avoid inference for mechanically resolved routine work. Skill execution still uses the normal action boundary. Old `@1` profiles remain unchanged; future skill adoption by another architecture is explicit and versioned.

The key additional implementation work is scope-aware skill storage/retrieval, outcome-grounded candidate generation, independent validation, durable recipe checkpoints, and total-cost measurement. Model-free work needs its own read/action/time bounds. A model's claim of learning or success cannot qualify a procedure.

The founder subsequently approved the design including skills. The [26-task implementation plan](superpowers/plans/2026-10-20-autonomous-specialists.md) records the concrete dependency order, file/interface ownership, fixture isolation, tests and acceptance. Implementation has not started.

## Design and delivery order

The [autonomous-specialists and modular architecture design](superpowers/specs/2026-10-20-autonomous-specialists-and-modular-architectures-design.md) defines the sixth architecture, persisted state, event fan-out, independent execution, resource conflicts, launch contract and acceptance scenarios.

Recommended ordering:

1. Freeze source behavior with focused parity fixtures and record existing configuration semantics.
2. Introduce descriptors, exact-version selection and one launch validation service.
3. Extract shared modules and narrow engine ports, keeping explicit legacy compatibility.
4. Add scoped state, delivery/outbox and goal/wake infrastructure.
5. Implement autonomous specialists against a synthetic adapter.
6. Add PACT's authoritative effect/revision support and role-specific adapter data.
7. Add skill acquisition and advisory reuse, then qualified guarded procedures; synthetic work can start after specialist state/outcome support, while PACT action recipes require its commit contract.
8. Qualify the exact profile/provider/adapter/skill configuration under a separately authorized run.

## Review method and verification

Self-review is used because repository instructions prohibit delegation. Findings were traced to current source rather than inferred from directory names.

The system `node` executable failed to load a missing Homebrew `llhttp` library. No installation or repair was attempted. The already-installed `/opt/homebrew/opt/node@24/bin/node` is usable and reports `v24.21.0`; it is used for the scoped read-only checks.

Executed checks:

- Existing `scripts/check-boundaries.mjs`: passed. This checks game independence, not the proposed stronger engine isolation.
- Existing unit files `core-boundaries`, `profile-console-view`, `continuity-schema`, and `profile-reports`: **14 tests passed across 4 files**.
- Initial design Markdown validation: all **37 local links** across the three changed documents resolved; code fences and whitespace were valid. `git diff --check` passed. The skills follow-up uses a separate documentation-only verification; the unit results above belong to the original source review.
- Skills follow-up: all **41 local links** across the three updated documents resolve; code fences, whitespace and `git diff --check` pass. No application source changed and unit suites were not rerun.

No integration database, game service, real provider or helper was started. No full build or full-suite claim is made. These checks do not validate the proposed architecture or establish live behavior.
