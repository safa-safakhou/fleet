# Native progress and workflow contracts implementation plan

> Execute inline with superpowers:executing-plans. The user approved all investigated cause repairs, separate offline checks and one fresh 24-kingdom/30-minute rehearsal. No delegation, GUI, ordinary game execution, E4/KQ1, installation activation or historical allocation recovery.

**Goal:** Repair generation progress, native/reference validation, correction consistency, capacity admission and request/outcome accounting without weakening authority or hiding incomplete work.

**Architecture:** Keep native engines and their schemas authoritative. Trusted environment policies may narrow generation and supply correction constraints; an independent original-schema check remains inside feedback. Provider transport supplies bounded streaming diagnostics and exact tokenizer demand; the existing shared lease pool enforces both slot and optional token capacity. The simulation owns durable request records, while task state remains a notification/execution record.

**Stack:** Existing Node 24/TypeScript/PostgreSQL 17; pinned installed vLLM/Nemotron 4B. No dependency/model downloads. Work on master, preserving pre-existing edits and all private evidence.

**Evidence/design:** [retained-evidence investigation](../../native-repeat-investigation-20261024.md). Choose compact serving with a backend that passes every native schema offline; preserve field/string semantics. Keep default provider behavior outside explicit vLLM. Do not increase three calls/one action per turn, 32,000 input bytes, 1,536 output tokens or the 45-second provider timeout.

## Review focus

- Optional memory and nested fields with the same name retain their native bounds/reference namespace.
- Interrupted streams never become known usage from partial counters; no automatic retry of uncertain calls.
- Token leases account across both legacy/native paths, survive external uncertainty and reject oversized requests before dispatch.
- A failed/superseded notification cannot be counted as an answered request; model-internal exceptions cannot disappear behind RETURNED.
- Incoming work may overlap current work; preserve atomic revision checks, exact receipts and per-kingdom isolation.

## 1. Generation progress and diagnostics

Files: `src/model.ts`, new `src/vllm-transport.ts`, `src/domain.ts`, affected provider tests; private launcher/preflight.

- [x] Add failing transport tests for SSE usage settlement, split frames, malformed/incomplete streams and cancellation diagnostics without invented usage.
- [x] Implement bounded vLLM streaming, request/first-content/finish metadata and tokenizer measurement. Keep existing Ollama/other-compatible behavior.
- [x] Verify all retained native schemas and whitespace-loop positive/negative controls against compact backend configuration before serving. No model calls for these controls.

## 2. Authoritative native schemas and feedback

Files: `src/platform/native-grounding.ts`, `src/engine.ts`, `scripts/lib/native-sim-environment.ts`, native grounding/legacy/scoped integration tests.

- [x] Add red regressions: a prepared schema cannot waive original memory constraints; malformed optional update receives correction before any effect; proposal reference narrowing does not rewrite memory references.
- [x] Compile/check the original schema inside feedback. Add a trusted correction-schema hook; apply correction only for its current request scope, preserve original messages/budgets and keep uncertainty nonretryable.
- [x] Use the environment's explicit objective to narrow retry choices after a rejected inferior proposal; never substitute or execute an answer. Clear only resolved active feedback, retaining recorded history. Verify unrelated profiles and original legacy baseline remain unchanged when policy is absent.

## 3. Shared capacity

Files: `src/platform/admission.ts`, additive migration, affected pool tests and rehearsal provider wiring.

- [x] Add red weighted-queue tests: four small requests overlap, long contexts wait for token capacity, oversized/aborted requests remain not dispatched, unknown existing demand is conservative.
- [x] Add optional token demand/capacity to existing durable leases. Obtain exact request tokens before admission through the provider tokenizer; reserve output and allocation rounding. Both legacy and native calls use the same path. Default routes remain slot-only.
- [x] Verify unknown usage cannot be cleared by lease release, and no new network/model call occurs inside database transactions.

## 4. Durable synthetic requests, timing and outcomes

Files: `scripts/lib/native-sim-environment.ts`, `scripts/lib/native-architecture-harness.ts`, `scripts/rehearse-native-architectures.ts`, focused unit/native integration tests.

- [x] Add red tests for overlapping publications, unanswered requests surviving later rounds, authoritative internal-failure classification and fixed publication timing.
- [x] Persist each offered request; observe/answer the oldest pending request rather than overwrite it. Keep receipt, request completion and peer notification atomic and idempotent.
- [x] Publish at minute boundaries independently of other kingdoms. Offer thirty rounds over thirty minutes; allow at most 90 seconds of explicitly reported drain for already admitted requests, with the same 3,000-call ceiling. No new workload during drain.
- [x] Separate reported/unknown/not-dispatched attempts, authoritative turn outcomes and receipt-based request completion. Capture per-request latency, actual concurrency, queue/token demand, feedback, resources and trace correlation. Label ungraded metrics honestly.

## 5. Verification and one measured repeat

- [x] Complete each red/green regression; full unit suite; selected fresh-owned integrations including thirty native scripted rounds, both autonomous presets, optional updates and error paths; types/build/boundaries/changed-code style; original baseline and source review.
- [x] Verify pinned model hashes and compact backend/tokenizer offline; freeze source and budgets. Start a fresh owned provider/fixture only after these pass.
- [x] Run one 24-kingdom/30-minute offered-load repeat with bounded drain. No mid-run source changes, hidden retries or model/provider fallback.
- [x] Retain all evidence/unknowns, stop only owned provider/fixture, check source hashes and report actual before/after results, regressions and remaining limits. No 24-hour run, commit or push included.

Measured outcome: [720/720 frozen repeat and remaining limits](../../native-progress-contracts-rehearsal-20261024.md). Six nonfatal preemptions and the clock discrepancy are explicitly retained caveats; no zero-preemption, hard latency, 24-hour or activation acceptance is claimed.
