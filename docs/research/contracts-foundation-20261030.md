# PACT research foundation — C1–C4

Source/offline implementation of [contracts package C1–C4](../superpowers/plans/2026-10-30-pact-research-01-contracts.md). This adds contracts and guarded persistence; it does not activate research agents or install the later observability/runtime services.

## Delivered behavior

- Versioned Protobuf messages and gRPC service descriptions with deterministic local generation, TypeScript bindings, Python bindings/Pydantic validation and actual bidirectional binary interchange. Decimal counters, zero/presence, partially known token counts and unknown usage remain distinct.
- A JSON-Schema-owned manifest compiler with resolved defaults, canonical digests, experimental-only immutable storage and compatibility checks for clocks, reviewed components, freshness, checkpoint/schema/context support, tools, resource bounds, protection switches and scoped index grants.
- `POST /api/research/manifests/preview` uses existing operator authentication/CSRF and an explicitly injected trusted capability resolver. No resolver is configured in the current runtime: it returns `RESEARCH_CAPABILITIES_UNAVAILABLE`. It does not probe providers, read PACT, save/enroll cohorts or run agents.
- Kernel-only `StepJournal.open/begin/lookup/complete/assertCurrent` binds persisted native claims to original operation/step identities, permits lookup by a resumed current owner, rejects stale/forged scopes and changed payloads, and serializes duplicate attempts. Pending/unknown work blocks a different step. It neither reserves a second allocation nor submits effects itself; R2 owns actual worker/broker integration.
- Unknown model allocations stay unknown after late usage; the native usage observation remains separately recorded. A confirmed original command receipt may resolve command uncertainty without a replacement command. Workers receive no settlement API.
- Additive migrations 042/043 are wired into the migration function, exercised only on newly owned fixtures. Native task/turn authority checks are reused through narrowed reference types; historical runtime profiles and provider/action execution remain unchanged.
- fast-check histories exercise the real SQL journal and native reservation/usage ledger through cancellation, expiry, duplicate/conflicting delivery and late usage. Independent manifest/protection properties and a deliberately faulty reservation-refund oracle cover reproducibility and shrinking.

## Verification commands

`npm test`; `npm run check`; `npm run build`; `npm run check:boundaries`; `npm run research:contracts:check`; `node_modules/.bin/buf lint`; `uv lock --project workers/research --check`; `uv run --project workers/research --group dev pytest workers/research/tests -q`.

Affected integrations use `npm run test:architecture -- tests/integration/research-manifests.test.ts tests/integration/research-step-journal.test.ts tests/integration/platform-recovery.test.ts tests/integration/model-recovery.test.ts`. This owns fresh nonce-labeled fixtures and never selects retained databases. Default `npm run test:properties -- --seed 20261030` runs 200 histories/property; `--release` runs 2,000, with at most 50 transitions per ledger history.

Property results print JSON with property name, actual histories, seed, failure path and counterexample. Replay with `--seed <seed> --path <path>` (defaults to the ledger property), or add `--property protection|canonical|ledger`. The deliberately faulty oracle shrinks a reservation refund to one token; it is not a discovered production failure. Unsupported Linux-only process tests remain skipped on macOS; no synthetic fixture qualifies real provider behavior.

## Implementation rulings and limits

Work is inline on master per repository instructions, with author review and no delegation. No commits or pushes were requested. Existing planning edits are preserved. The skill's numbered-task helper does not support C1–C4 headings, so the ignored scoped execution ledger records manual task tracking.

Pydantic AI uses the `pydantic-ai-slim` distribution in the optional agent extra: it provides the framework without automatically installing direct provider integrations. Python CLI online execution stays disabled until R2. Generated schema code is derived from the canonical JSON Schema so the compiled server does not depend on an uncopied source file. The Proto service uses the conventional `ResearchBrokerService` suffix.

The fixture runner originally stripped property-run settings; a regression test now permits only bounded seed/run/path/target settings while continuing to exclude provider credentials and live URLs. The first attempted release run was consequently only 200 histories and is not counted as the 2,000-history result. Future service/OS integration is separate from the [dependency baseline](dependencies.md); arbitrary component combinations are not certified here.

## Review and acceptance record

Author review covered the five plan risks: cross-language counter precision, semantic compatibility, duplicate/changed payloads, non-disableable protections and reproducible shrinking. Regression failures were reproduced before fixes for schema packaging, property environment forwarding, invalid UTC dates, unreviewed/inherited component references, original command settlement and partial usage. No delegated/independent review is claimed.

The source configuration includes scoped test guards: newly added database tests refuse execution without fixture ownership evidence. Research kernel modules are blocked from engine/browser implementation imports; generated wire contracts remain permitted. Generated files and private execution environments are excluded from hand editing/style traversal, with a separate regeneration drift check.

Final measured verification on macOS arm64:

- Full unit suite: **1,190 passed, 23 skipped, zero failed**. Skips: 22 Linux-only Codex process cases in `tests/unit/codex.test.ts`, one Linux-only process-signal case in `tests/unit/owned-local-world.test.ts`. Linux qualification is not claimed.
- Affected owned-fixture integrations: **29 passed**, including six new step-journal cases, two manifest/API cases and 21 existing model/platform recovery cases.
- Release properties: **2,000 native SQL histories**, **2,000 protection cases**, **2,000 canonical-manifest cases**, plus the deliberately faulty oracle/shrinking check; zero failures. Seed **20261030**, maximum 50 transitions/history. Selected-path replay also passed (two manifest tests intentionally excluded by target selection).
- Python: **six tests passed**, including Hypothesis counter/coverage properties; the TS suite additionally exercises actual Python binary interchange and partial usage. Python lint, locked dependency check and wheel build passed.
- Type/style check, production build and compiled manifest-module load, architecture boundaries, Protobuf lint, generated drift check and root npm audit passed. Whole-repository style output retains **173 warnings / 60 informational diagnostics**; no error was suppressed to pass the gate. Root/prospective npm audit: zero advisories after the pinned patch.

Changes remain uncommitted on master; prior planning edits are preserved. No model inference, real game activity, retained-database access, deployment, recovery review, commit or push occurred. Later service runtime tests, Linux process checks and real-provider/behavior qualification remain separate gates.
