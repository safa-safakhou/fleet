# Research context fit and retry implementation plan

> Work inline with executing-plans; preserve all failed-run identities, records, closed grants and private evidence. The owner now requests fixing the diagnosed issues and a fresh retry.

**Goal:** Admit a real-shaped PACT research request within the unchanged 24,000-byte limit, with complete raw evidence and explicit model-view lineage, then launch a fresh bounded one-hour Nemotron advisory experiment.

**Architecture:** Keep the authoritative PACT observation packer and native model admission. At the research broker, bounded worker intake is distinct from the final model-input bound: derive only an exact authorized observation message through the injected domain packer, preserve other messages, capture raw/view provenance, and validate the complete final request before reservation/dispatch. Existing source-complete assembly also runs before final-size validation; it still refuses mandatory content that cannot fit. No arbitrary trimming or implicit model retry.

**Tech stack:** Existing Node 26, TypeScript, native research broker/evidence/context accounting, Temporal and PostgreSQL; no dependency changes.

**Spec:** The diagnosed failure and required repair in [the failed run](../../research/nemotron-advisory-hour-20261102.md), approved by the current fix-and-retry instruction.

## Constraints and checks

Keep byte/output/token/call/concurrency limits, domain authority, source references, clock freshness, raw evidence, consent, retention, quota, integrity and no-fallback behavior. Use synthetic observations/fake providers and fresh nonce-owned fixture databases for tests. No old task replay, uncertainty clearing, original-world access, push or automatic source qualification override. The prior accepted performance variance stays recorded separately.

- [ ] Add a failing broker integration regression using a >24 KB synthetic PACT observation; require final canonical request <=24,000, native accounting and complete raw/view/dispatch lineage.
- [ ] Implement bounded authorized observation derivation; refuse unsupported/mutated frames, oversized protected core, excessive worker intake, stale input, evidence failures and oversized final envelopes before provider dispatch. Preserve fitting request bytes.
- [ ] Add final-size/serialization/Unicode/output-limit and no-truncation regressions; cover both context policies, raw-source retention and dispatch mutation checks.
- [ ] Extract tested controller census/startup-time/Docker invocation helpers and use them in the fresh operator controller. Preserve actual activation versus planned-clock boundaries and explicit local Docker context.
- [ ] Run affected owned integrations, unit/type/build/boundary/contracts/style checks and offline compatibility checks; commit verified changes incrementally.
- [ ] Prepare a new owned database/world/namespace and identities, exact candidate hashes and encrypted backups. Preserve the previous failed world/task. Build and validate the actual full request without a provider call before activation.
- [ ] Record fresh absolute one-hour bounds and unchanged finite advisory budgets; launch with independent watchdog and inspect real Temporal/native admission and evidence. Stop early on the existing failure conditions and report actual status/results; arrange a follow-up for completion if still running.

## Review focus

1. Matching authorized observations only; never trim worker prose, owner instructions, pending commands or feedback to pass a budget.
2. Count UTF-8 and complete canonical request envelope, including escaping/schema/protocol overhead; token estimates remain labeled.
3. Domain packing must preserve protected facts and explicitly disclose omitted model-view fields while retaining full raw source artifacts.
4. Capture/consent/quota/integrity failures refuse before dispatch; downstream mutation cannot invalidate recorded lineage.
5. Static settings and tiny fixtures do not establish full PACT packet fit; the retry must check the actual generated packet before activation.
