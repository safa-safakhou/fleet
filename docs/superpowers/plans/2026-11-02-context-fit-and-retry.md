# Research context fit and retry implementation plan

> Work inline with executing-plans; preserve all failed-run identities, records, closed grants and private evidence. The owner now requests fixing the diagnosed issues and a fresh retry.

**Goal:** Admit a real-shaped PACT research request within the unchanged 24,000-byte limit, with complete raw evidence and explicit model-view lineage, then launch a fresh bounded one-hour Nemotron advisory experiment.

**Architecture:** Keep the authoritative PACT observation packer and native model admission. At the research broker, bounded worker intake is distinct from the final model-input bound: derive only an exact authorized observation message through the injected domain packer, preserve other messages, capture raw/view provenance, and validate the complete final request before reservation/dispatch. Existing source-complete assembly also runs before final-size validation; it still refuses mandatory content that cannot fit. No arbitrary trimming or implicit model retry.

**Tech stack:** Existing Node 26, TypeScript, native research broker/evidence/context accounting, Temporal and PostgreSQL; no dependency changes.

**Spec:** The diagnosed failure and required repair in [the failed run](../../research/nemotron-advisory-hour-20261102.md), approved by the current fix-and-retry instruction.

## Constraints and checks

Keep byte/output/token/call/concurrency limits, domain authority, source references, clock freshness, raw evidence, consent, retention, quota, integrity and no-fallback behavior. Use synthetic observations/fake providers and fresh nonce-owned fixture databases for tests. No old task replay, uncertainty clearing, original-world access, push or automatic source qualification override. The prior accepted performance variance stays recorded separately.

- [x] Add a failing broker integration regression using a >24 KB synthetic PACT observation; require final canonical request <=24,000, native accounting and complete raw/view/dispatch lineage.
- [x] Implement bounded authorized observation derivation; refuse unsupported/mutated frames, oversized protected core, excessive worker intake, stale input, evidence failures and oversized final envelopes before provider dispatch. Preserve fitting request bytes.
- [x] Add final-size/serialization/Unicode/output-limit and no-truncation regressions; cover both context policies, raw-source retention and dispatch mutation checks.
- [ ] Extract tested controller census/startup-time/Docker invocation helpers and use them in the fresh operator controller. Preserve actual activation versus planned-clock boundaries and explicit local Docker context.
- [x] Run affected owned integrations, unit/type/build/boundary/contracts/style checks and offline compatibility checks; commit verified changes incrementally.
- [ ] Prepare a new owned database/world/namespace and identities, exact candidate hashes and encrypted backups. Preserve the previous failed world/task. Build and validate the actual full request without a provider call before activation.
- [ ] Record fresh absolute one-hour bounds and unchanged finite advisory budgets; launch with independent watchdog and inspect real Temporal/native admission and evidence. Stop early on the existing failure conditions and report actual status/results; arrange a follow-up for completion if still running.

## Review focus

1. Matching authorized observations only; never trim worker prose, owner instructions, pending commands or feedback to pass a budget.
2. Count UTF-8 and complete canonical request envelope, including escaping/schema/protocol overhead; token estimates remain labeled.
3. Domain packing must preserve protected facts and explicitly disclose omitted model-view fields while retaining full raw source artifacts.
4. Capture/consent/quota/integrity failures refuse before dispatch; downstream mutation cannot invalidate recorded lineage.
5. Static settings and tiny fixtures do not establish full PACT packet fit; the retry must check the actual generated packet before activation.

## Repair verification — 2 November 2026

The full-shaped broker regression first failed with `MODEL_REQUEST_NOT_ADMITTED`; it now passes using the real PACT packer and a fake tracked provider. The retained rejected packet fits offline at **19,698 / 24,000 canonical bytes**, versus 33,143 before packing; no provider call or historical task replay. Full raw facts remain immutable, and model-view omissions have explicit domain coverage plus encrypted raw/view lineage.

Fresh checks: **1,264 root unit passes / 23 platform skips**, **31 owned research integrations**, type/style/build/boundary/contract checks. Unit regressions include Unicode/escaping, exact large integers, unchanged fitting requests, mandatory instructions/protected-core refusal, altered source identity, non-finite facts, stale/future observations, command census ownership, actual-activation grace and local Docker invocation. Integration checks cover native usage, raw recovery, source-complete compatibility, dispatch mutation/schema expansion, required source-evidence failure and capture atomicity.

Colima's automatic test port forwarding failed on two attempts. The final integrations used a fresh nonce-owned disposable container through a dedicated loopback SSH tunnel; no retained database or service restart. Two pre-existing report JSON formatting errors were normalized without data changes. Existing warning-level diagnostics remain. Controller helpers are tested; actual controller adoption and fresh-target preparation remain outstanding before launch.

The fresh target preflight caught native `undefined` optional object properties before activation. A red/green regression now verifies their existing JSON wire representation; non-finite numbers and unsupported array entries remain invalid. Follow-up verification passes 14 focused units, seven owned integrations, type/style/build. The actual fresh observation fits **19,709 / 24,000 bytes** (raw request 33,165); zero model calls, turns or commands. Four encrypted prepared-state backups were captured. Temporary migration role administration was revoked and fresh application roles have no superuser/create-role/create-database/admin privileges. The existing recipe prohibits general compression; this remains false. The explicit `environment-view@1` domain transform and full raw archive are recorded separately in model-context lineage.
