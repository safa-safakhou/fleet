# Isolated vLLM and evidence-bound Nemotron decisions

> Execute inline. User approved isolated migration, correctness fixes and four concurrent kingdom requests. Preserve earlier uncommitted pool changes. No GUI/delegation/game activation; E4/KQ1 blocked.

**Goal:** Serve only NVIDIA Nemotron 3 Nano 4B on isolated native WSL vLLM; prove four active sequences and independent correct outputs through Fleet's real adapter.

**Design:** Keep Ollama and installed Fleet untouched. Pin vLLM 0.32.0 and NVIDIA BF16 revision dfaf35de3e30f1867dd8dbc38a7fc9fb52d3914f under a new private directory. Use one loopback-only server with four sequences, explicit16k context and measured GPU memory. Add explicit vLLM model settings to the compatible adapter without changing old wire defaults. Add a generic opt-in evidence-bound decision contract: authenticated binding/revision supplied by host, candidate IDs limited to the supplied choices, claim IDs resolved from trusted facts and canonical host-rendered summaries. Invalid model responses are rejected with usage preserved, never silently repaired into success. Deterministic offer arithmetic remains synthetic test-fixture/oracle work, not a second PACT rules engine.

**Acceptance scope:** This qualifies the new evidence-bound contract and selected game-free scenarios, not every historical agent architecture or free-form prose. Real PACT handlers remain authoritative. Model reasoning quality and runtime concurrency are reported separately. No game/runtime/credential imports in the test runner.

## Task 1: Isolated runtime

- [x] Download/hash the exact model snapshot and install pinned vLLM into a new venv; freeze resolved dependencies. Do not replace host Python or Ollama.
- [x] Inspect native model support/config before first start. Loopback port18535; max4sequences; context16384; GPU memory ceiling0.8; eager mode to avoid huge graph compilation; NVIDIA-required Mamba state dtypefloat32.
- [x] Verify exact process/endpoint/model identity. Retain installation/log/model evidence and stop only the owned process group at completion.

## Task 2: Provider and correctness

- [x] RED→GREEN tests for explicit vLLM thinking/sampling wire settings; reject incompatible provider flags. Preserve historical Ollama/compatible defaults and token accounting.
- [x] RED→GREEN evidence contract tests: foreign binding, stale observation, invented choice/fact, missing required fact, unknown facts, forged receipt/delivery and unsolicited free text. Canonical facts/summary come from host evidence, not model arithmetic/prose.
- [x] Preserve usage and raw output on rejected model decisions. Integrate the evidence guard into HttpModel's opt-in input contract; zero automatic retries in qualification.
- [x] Replay all retained synthetic benchmark outputs against appropriate strict correctness checks; record that the old11/24score was partial-field acceptance, not whole-answer correctness.

## Task 3: Actual qualification and report

- [x] Offline tests/type/style/build/boundaries before real calls. Only the exact pinned Nemotron4B endpoint; fresh run marker, max24actual calls/10minutes/90seconds per call,2048output tokens maximum, no retries. Stop transport failures; retain and report every correctness rejection.
- [x] Four distinct kingdom/observation/canary contexts, different resources/offers, unknown/pending/delivered facts and untrusted peer instructions. Synthetic inputs only. Native server metrics must show four active/running sequences, not just four client promises.
- [x] Measure per-call latency, wall throughput, actual tokens, GPU/RAM and isolation. Reject any wrong decision rather than accepting valid JSON. Count raw model correctness separately from guard rejection.
- [x] Report actual results and precise remaining gaps. Update current state. No commits/push/activation unless requested.

## Ledger

Start: read-only failure audit found5identity/10choice/3affordability errors across24requests (overlapping), plus unsupported prose in some partial-field passes. Ollama's renderer is configured correctly; missing GGUF template is not proven causal. Sampling1/top_p1 differs from NVIDIA's tool-use recommendation0.6/0.95; change explicitly, never claim that alone fixes reasoning.


Completion: isolated model download/hash and runtime install verified. Initial candidate failed and remains failed: raw0/4, reference-bound choices3/4. Added explicit exact numeric maximization policy, preserving ties and independently rejecting suboptimal results. Fresh cases E–L passed8/8 in two four-request batches; server metrics confirmed four active sequences. XGrammar schemas compiled offline; unsupported uniqueItems remains enforced only by host checks. Final server ceiling0.65; isolated toolkit PATH/CUDA_HOME repaired. All16actual calls are retained, zero retries/game commands; no old grant reused. Final checks939unit/33isolated integrations, types/build/changed-code style/boundaries. See [actual report](../../vllm-nemotron-isolated-qualification-20261024.md) for measured timings, both candidates, source/live limitations and remaining integration. Both owned providers stopped; no activation/commit/push.
