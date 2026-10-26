# Live v1 packing: cause and offline repair

Status: source/offline repair only. No deployment, real inference, game continuation or E4/KQ1 execution. The retained world stays paused.

## Cause

The production PACT environment returned all **42 native MCP tools** from its decision catalog. Its observation/read-query port only accepts **29 PACT read tools**. Writes are already described by native action contracts and submitted through the action port. One additional read-only native tool is `sandbox.echo`, which is not a PACT read. Filtering solely on `readOnlyHint` would therefore also be incorrect.

The previous retained-state reconstruction explicitly filtered with `pactAdapter.isRead`, but the production environment did not. That reconstruction tested a smaller input than the worker actually received. Earlier metadata/schema sharing repairs were insufficient, and the previous report incorrectly described production as having the filtered decision catalog.

This difference is causal on the currently paused data: with the previous full catalog, all three original v1 actors reproduce `CONTEXT_LIMIT` before inference. With the actual corrected environment catalog method, all three fit at **31,704–31,714 logical input bytes**, retaining one evidence item each. The three v1.1 reconstructions also fit, at **31,949–31,969 bytes**, with one evidence item each. The comparison uses read-only database connections and a throwing fake model boundary; no retained writes or model calls. This is a reconstruction of current retained state, not a byte-identical replay of the unavailable historical live input.

## Correction

`createPactEnvironment().connect().catalog()` now validates the complete native catalog, then returns only `pactAdapter.isRead` tools. Full native capability metadata remains available to continuity, and writes retain their existing exact action contracts, authorization and execution path. The 32,000-byte logical request ceiling, evidence minimum, mandatory current facts and native grants are unchanged.

Terminal protected-input packing failures now record a small diagnostic containing only byte sizes, tool/event counts and the error code. It does not copy observations, private text, credentials or identifiers. This avoids the earlier blind spot when the full observation could not fit its bounded trace.

## Complete offline runtime verification

The new `native-v1-runtime-packing.test.ts` uses fresh owned PostgreSQL fixtures, the complete 42-tool native MCP catalog, real OAuth and credential broker, `composeRuntime`, environment binding, task claim, durable host, scoped services, continuity repository, packet fitter, normal admission/accounting, and the actual HTTP/vLLM stream adapter. Only inference is synthetic: a loopback HTTP server returns a valid deterministic decision using the `nemotron-4b` identity. Unused optional native fixture capabilities throw if invoked; their metadata is advertised, not their behavior qualified.

The original broad-authority, unqueued regression failed before the catalog correction and passes afterward. A queued construction case with a shorter owner objective and narrower mandate also passes. Assertions cover delivered native capabilities, exact read catalog, current owner intent/authority, construction and social facts, a nonempty observed peer sample, continuity evidence, final reported usage and completed turn.

A deliberately heavier queued case with the long objective and broad mandate still exceeds the protected envelope. Its expected result is a pre-inference `CONTEXT_LIMIT`, with zero provider requests, allocations or platform commands. This is an explicit remaining capacity boundary, not a passing model workflow. The fix does **not** establish that arbitrary growing states fit 32,000 bytes or that live readiness is complete.

The byte ceiling measures serialized messages plus the logical generation schema, as enforced by normal admission. vLLM subsequently expands schema references for transport; the new test verifies that exact transformation separately. It does not mislabel logical packet bytes as HTTP wire size or silently change the existing budget contract.

Checks: 1,076 unit tests; 66 affected integration tests; type/style check, build and architecture boundaries. The 66 integrations include the three new complete-production-composition cases, 25 existing native workflow cases across eight architectures, and credential/scoped-context/continuity/binding coverage. The style check exits successfully with existing repository warnings/information.

An additional diagnostic temporarily enabled the complete 42-tool fixture catalog for the entire existing native workflow matrix: **24 passed / four failed** across that matrix plus the three new cases. All original v1 and v1.1 workflow cases passed. Two legacy message cases attempted an optional conversation read whose handler is deliberately unimplemented in this metadata fixture. One v2 prerequisite case refused at `fitNegotiationState`'s protected-input limit; its later construction-completion assertion also failed. These are not live runs, nor evidence of whole-fleet production-catalog acceptance. The existing matrix keeps its original functional fixture; the new dedicated v1 runtime cases explicitly require the complete catalog. This assignment does not implement the optional fixture's unrelated read services or change v2's packing policy. The diagnostic log is preserved privately.

## Preservation and remaining work

Read-only preservation check: paused clock at tick 633; 24 paused cohorts; no active turns or capacity leases; run window closed. Original unknown ledger rows and cohort budget/model/anchor pins match the baseline. No service restart, deployment, model/provider start, new trial, commit or push. E4/KQ1 stay blocked.

Live acceptance remains untested. Existing factual-wait failures, stale proposals and held unknown allocations are outside this packing repair and remain unresolved. The broader diagnostic also leaves v2's full-catalog capacity and complete optional-read fixture coverage unaccepted. A future live check requires a new bounded assignment; no previous run is resumed by this report.
