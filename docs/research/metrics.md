# Versioned research metrics and PACT grading

The `fleet.metric-catalog/v1` [catalog](../../config/research/metrics.v1.json) owns definitions and arithmetic, separate from UI and historical metrics. Each entry declares family, unit, direction, formula, source, population, time basis and unavailable conditions. `MetricAggregator.compute(snapshot, ids)` returns immutable versioned values with precise numerator/denominator strings, coverage, ungraded/censored counts, exclusions, source references and evaluator digest. Unsafe integer-to-chart conversion returns null while retaining the exact string.

Windows are half-open `[start,end)`. Calls and token sums use native allocation creation time, completed service p95 uses comparable provider durations, and waits without effects require a finished WAIT attempt with zero confirmed actions. A final WAIT cannot erase an earlier action. Cohort creation and observed completion are distinct; a missing completion timestamp is unavailable, not invented from current state. Required-event and byte coverage describe the whole pinned snapshot cutoff, separately from the chosen call window.

## Sources and formulas

`RunInspection` freezes the full authorized native allocation/command/attempt/cohort metadata alongside O4 evidence. There is no200-call drilldown ceiling in this path. `SnapshotMetricEvidence` traverses every pinned event page (500 per page), reauthorizes artifacts and preserves missing references. An explicit analysis bound (200,000 events/64MiB decrypted payloads) refuses oversized analysis; it never silently computes a subset. Large native ledger populations remain complete. Legacy snapshot fields without timestamps do not acquire guessed times.

| Family | Calculation and missing-data behavior |
|---|---|
| Integrity | Duplicate confirmed effects/confirmed logical effects; independent violation/refusal/reconciliation samples; full native unknown allocations/reservations; reconciled required events and bytes. Zero denominators return null. Refusals do not count as useful completions. |
| Runtime | Distinct task IDs, attempt IDs, allocations, native commands, read responses and effect-free WAIT attempts remain separate populations. Queue/service percentiles use nearest rank and sample count. Native instrumentation supplies fairness, cancellation, recovery, event lag and blocked/active work; absent instrumentation stays unavailable. |
| Resources | Known input/output totals retain exact decimal strings; unknown reservations remain separate. Cache/reasoning tokens, request/schema bytes, input utilization, cap hits, CPU/RSS/disk and overhead require typed native measurements. Throughput divides observed deltas by non-overlapping observed seconds. Monetary samples require an explicitly applicable price version and billable-unit evidence; no ambient price is assumed. |
| Accuracy | Independent factual/objective/first-pass/schema/grounding/proposal grades use eligible graded denominators. Ungraded cases remain visible. Parse/schema grading uses recorded output and recorded JSON Schema, not a success flag. |
| Recovery | Eligible failures are declared by the native evaluator; verified recovery/eligible failures is distinct from another parsable response. Corrections, repeated failures, abandonment, blocking and censoring remain separate counters. |
| Retrieval/context | Labeled recall, precision, MRR and nDCG use the M4 relevance grader. MRR/nDCG aggregate as query means. Context mandatory coverage, omissions, freshness and citation violations require actual lineage/labels; missing labels never become zero. Retrieval/embedding latency and CPU use recorded evidence. |
| PACT effectiveness | State-rule completion and observed completion time remain separate from admitted commands. Native construction/upgrade/contact/agreement/message/reply/negotiation samples require authorized readback and declared opportunities. Receipt admission cannot establish future fulfilment. |
| Team/skills | Typed role allocation/delivery/work/proposal/arbitration/skill measurements provide sums, ratios or comparable delays. Message count and agent-reported plans cannot become verified contribution. |
| Experiment quality | Preregistered independent worlds/sessions, missing runs, manifest/budget differences, overlap and interference are supplied by the A2 experiment evaluator; turns are never independent units. |

The seven reference formulas are `objective_success_rate.v1`, `first_pass_accuracy.v1`, `recovery_rate.v1`, `duplicate_effect_rate.v1`, `known_tokens_per_success.v1`, `evidence_event_coverage.v1` and `latency_p95.v1`. Known tokens per success preserves its known numerator but returns no efficiency-ranking value while material usage is unknown. No success/eligible denominator returns null.

For measurements not natively exposed, `recordMeasurement()` is a strict **kernel-only instrumentation port**. It records typed scalar evidence with original source references, never arbitrary worker-provided truth. It is absent from broker RPC allowlists. Independent evaluator results use a separate stream; agent/broker output cannot impersonate either stream. The catalog describes data requirements; a defined metric is not a claim that historical runs supplied those measurements.

## Independent PACT rules

`PactEvaluator.grade(snapshot, spec)` uses only recorded native `pact.observation.v1` packets. The versioned spec freezes the observation horizon, exact state pointers/expected values, factual claims to test and receipt identities. Native observe/read wrappers supply packets; peer text and broker result bodies are not trusted fact sources. Missing paths/opportunities remain ungraded. The evaluator uses no model, game polling or privileged acting tool. Receipt rules mean admission only; state readback must establish completion.

Evaluation data is an evaluation-principal port, with no actor context/memory/tool adapter. Forged success and oracle sentinel fixtures do not establish objective completion or leak into output. Later polling or model judges would need separately authorized scoped budgets.

## Persistence and compatibility

`MetricRepository` publishes encrypted O2 artifacts and an additive051 metadata row. Its frozen native/evidence snapshot is copied at publication; late settlement requires a new snapshot/result digest. Current operator authorization and original consent version are checked again on every read. Published results retain the30-day source policy rather than the short-lived O4 page cursor deadline. Source invalidation propagates through O2 dependencies, while minimal permitted metadata remains. Consent withdrawal/regrant cannot revive old private results.

C1 Protobuf messages carry metric windows, values/coverage, unresolved usage and evaluation references. Existing `FleetMetrics.read`, workflow snapshots and legacy comparison/report shapes keep their original definitions and caps. Explicit research entry points select the new repository; no old report is silently reinterpreted.

Checks cover a205-reported/two-unknown-call fixture, a half-open boundary, exact p95, action-then-WAIT, admitted versus completed construction, forged success, ungraded objectives, every catalog measurement operation/family and missing-data cases. Integration fixtures demonstrate publication stability under late settlement, full counts, authorization and consent refusal. These establish source/offline behavior, not model quality or a reliability percentage.
