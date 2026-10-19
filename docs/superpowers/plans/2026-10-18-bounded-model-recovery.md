# Bounded model-output recovery — 18 October 2026

Founder requests fixing Nemotron empty answers and resilient retries. Local source/offline scope; preserve installed release, histories, original qualification plans and all allocations. No server contact, deployment, population or game calls. No delegation.

1. Reproduce known empty/schema-invalid output failure with real platform-host tests; unknown usage must remain gated.
2. Add at most one corrective output attempt at the metered admission boundary, preserving settings, context, schema, stop fences and existing budgets. Keep HttpModel one execution per call and legacy engine unchanged. Protect coordinator capacity and let a failed known-output worker abstain.
3. Add an explicit, inert qualification v2 policy with four paired-observation calibration cases, at most two attempts each (eight executions), retaining all eight observations and the existing 96 execution Q2 ceiling. Existing v1 plans/results remain immutable. Raw failed attempts stay visible; recovered operation is reported separately from raw success.
4. Verify cancellation, exhaustion, next scheduled retry, uncertain dispatch, schema correction and worker/coordinator accounting. Run full local checks and paired acceptance; commit verified sources and durable evidence. Do not start another real-provider qualification under a new allowance.

Provider root cause: exact Ollama v0.35.1 llm/gbnf.go thinkingGrammar intentionally permits an empty alternative before the thinking-close marker. The native schema therefore cannot require a final answer. This is upstream behavior; do not promote private reasoning, change thinking mode, ignore EOS globally or silently replace the provider. A bounded retry mitigates it but does not certify an upstream parser/grammar repair.

Completion: source/offline implementation verified with201 unit/357 serial integration/12 paired PACT tests, full audit0, all checks passed and38 retained installed tables matched. Strict raw validity still gates qualification; recovery completion is separately reported. No new real calls, installed/server changes or population. See `../../model-output-recovery-20261018.md`.
