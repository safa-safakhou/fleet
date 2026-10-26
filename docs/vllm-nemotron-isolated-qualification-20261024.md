# Isolated vLLM / Nemotron 4B correctness qualification — 24 October 2026

Status: isolated installation and four-request concurrency verified. Fresh evidence/numeric-policy qualification passed 8/8 cases after the first candidate failed. Raw model reasoning remains unqualified; no installed Fleet cutover or game activation occurred. The owned server is stopped and retained.

## Authorized scope

The user approved isolated vLLM migration, correctness fixes and four concurrent kingdom requests, inline without GUI. Only Nemotron 4B is permitted. Game execution stays disabled and E4/KQ1 stay blocked. Ollama, retained worlds, credentials, installed Fleet and pending commands remain untouched. Earlier pool source changes are retained uncommitted; no commit/push is requested.

Runtime root: `/home/mnim/.local/share/fleet-vllm-nemotron-20261024-0430/`. Separate Python venv with vLLM0.32.0; NVIDIA BF16 model revision `dfaf35de3e30f1867dd8dbc38a7fc9fb52d3914f`. This is the same4B model family at higher weight precision than the prior Q4_K_M file; any quality comparison changes both runtime and precision. Downloaded model files are hash checked against the pinned repository metadata. Resolved Python dependencies and startup configuration are retained privately.

Final candidate server: loopback18535, served name `nemotron-4b`,4sequences,16384context, maximum16384batched input tokens, GPU utilization ceiling0.65, eager execution, Mamba statefloat32 and prefix caching disabled. The first candidate used ceiling0.80; its evidence is retained separately. The final launcher exposes the isolated venv/CUDA toolkit bins and CUDA_HOME so native compilation tools resolve correctly. NVIDIA's pinned reasoning parser and tokenizer are used; no other model or automatic provider fallback. Installed services are not reconfigured.

## Correctness diagnosis

The prior benchmark had24valid JSON responses but only11matching checked core fields. Offline audit found5identity mismatches,10wrong choices and3wrong affordability fields, with overlap. Some partial-field passes also had false arithmetic, substituted historical balances, unsupported acceptance claims or internally contradictory prose. Therefore11/24was not complete-answer accuracy.

The GGUF has no embedded chat template, but its Ollama manifest selects the `nemotron-3-nano` renderer/parser. Ollama's rendering path uses that renderer, so the generic template display is not evidence of a missing-template defect. Ollama's scheduler independently hardcodes nemotron_h to one actual slot; user-configured2/4cannot override it safely. Native services were not patched to bypass this limitation.

## Source fixes

`ModelConfig` now allows an explicit `provider: vllm` on the compatible route, with validated reasoning, temperature, top_p and seed. HttpModel sends `chat_template_kwargs.enable_thinking` only for that explicit provider, retaining old compatible/Ollama defaults. Nemotron inline thinking override conflicts are refused before dispatch on the vLLM path too. The selected experiment uses reasoning false, temperature0.6, top_p0.95 and seed42 explicitly.

The opt-in evidence-decision contract removes model-authored factual prose. A trusted caller supplies the binding, observation revision, eligible choice IDs, observed typed facts and mandatory fact IDs. The model returns only those references; the guard rejects foreign/stale references, nonexistent choices/facts, omissions, duplicates and arbitrary extra claims. Known/unknown/pending facts remain distinct. Canonical displayed facts are rendered from host evidence in `verifiedEvidence`; the original model decision stays unchanged so production schema/recovery validation remains valid. Raw output and measured usage remain retained for rejected decisions.

An explicit optional `maximize_integer` policy uses exact BigInt scores supplied by the trusted caller. Generation permits only optimal eligible IDs (including ties); the independent response guard rejects suboptimal choices. This fixes numeric-objective enforcement by code, not by assuming the model learned arithmetic. No wrong response is rewritten into a pass. Portable generation schemas omit unsupported XGrammar uniqueItems; duplicate references are still rejected in host validation.

ModelAdmission checks evidence binding against the actual task claim before reservation. These semantic rejection codes do not enter generic output retries. A synthetic integration test verifies a rejected false delivery summary leaves one reported usage allocation, zero commands and no retry.

This is a new opt-in contract, not a claim that every legacy architecture's free-form prose is now truthful. It validates references against the supplied host observation; native game handlers must still check current permissions/state at any future execution. A choice remains a proposal, never acceptance, a receipt or delivery.

The synthetic oracle computes affordability using exact integers, including balances beyond JavaScript's safe-integer range. The oracle is a fixture, not duplicated PACT rules. Actual game rules, resource effects and receipts remain PACT application authority.

## Actual test protocol

Fresh one-shot qualification through production HttpModel: at most24actual calls,10minutes total,90seconds/call, maximum2048output tokens, no retries; stop transport failures and record all correctness results. Initial four raw benchmark requests preserve the old open-ended task for comparison (partial-field scores explicitly remain partial). Four new evidence-bound contexts then cover different offer choices, no feasible offer, unknown/pending/delivered observations, pending owner requests, foreign peer instructions and large integer arithmetic. Correctness requires the expected choice plus accepted scoped evidence, not merely JSON parsing. Server metrics must show4active requests; client overlap or max-num-seqs configuration alone does not count.

No game runtime, credential broker or real game port is imported by the qualification script. No game action is available. Raw responses and metrics stay private; only aggregate findings belong here.

## Actual results

| Candidate / workload | Actual calls | Correctness | Concurrent running requests | Per-request latency |
| --- | ---: | --- | ---: | --- |
| First, raw open-ended decisions | 4 | 0/4 checked core-field passes; all chose the wrong offer | 4 | 66.2–67.6 seconds |
| First, evidence references without objective enforcement | 4 | 3/4 correct choices; one eligible but suboptimal offer | 4 observed in the run | 0.792–1.065 seconds |
| Fresh policy-bound compact cases E–H | 4 | 4/4 accepted scoped evidence and correct choices | 4 | 5.041–5.234 seconds |
| Fresh policy-bound larger cases I–L | 4 | 4/4 accepted scoped evidence and correct choices | 4 | 2.080–2.136 seconds |

The first qualification remains **failed**: 8 calls / 68.755 seconds / 13,783 input + 798 output tokens. Long first-batch latency included predominantly prefill work; startup/kernel state and missing toolkit PATH were observed, but no controlled experiment isolates the cause. These results are not discarded or relabeled as passes.

The fresh scored qualification is **passed**: 8 calls / 7.443 seconds / 14,415 input + 516 output tokens. Four distinct requests were running simultaneously according to authenticated vLLM server metrics in both batches. The larger inputs were 3,160–3,271 tokens each. No tested foreign canary leak, invalid evidence, timeout, truncation, retry or game command occurred. Final metrics: zero requests running, eight successful stop completions, zero preemptions/errors/aborts/length completions. Compact and larger cases differ; their timing is not a controlled context-size comparison.

Peak total GPU usage was **12,779 MiB** (includes the desktop); minimum sampled available WSL RAM was **9.468 GiB**. The final runtime allocated 7.47 GiB model weights and 0.86 GiB available KV cache, 40,603 KV tokens. Logs estimate 2.48 full 16,384-token contexts; therefore this proves four approximately 3.2k-token requests, **not four simultaneously resident full 16k contexts**. Startup is excluded from request timings. No sustainable throughput or 24-hour result is inferred from these short bursts.

Total assignment inference: **16 calls, 28,198 input + 1,314 output = 29,512 measured tokens**, zero retries and zero game commands. Actual output cap was 512 tokens, within the planned 2,048 ceiling. Both one-shot records are closed. No earlier failed grant was resumed.

## Verification

Final verification passed: **939 unit tests / 176 files**, **33 selected isolated integration tests / four files**, TypeScript, production build and game-independent architecture boundaries. Changed-code style and whitespace checks pass. Integration covers evidence scope before reservation, rejected-answer usage settlement without retry/commands, worker/provider capacities, provider queue deadlines and six existing native owner-clock composition cases. All actual generation schemas compiled offline using the installed XGrammar before real inference. Self-review was inline; no delegated review occurred.

The earlier existing pinned-proposal formatting error and moderate fast-uri audit finding are preserved; this migration does not change Node dependency pins. This is not a claim that the repository-wide style/audit checks are clean.

## Installed runtime and preserved evidence

Dedicated venv: vLLM **0.32.0**, PyTorch **2.13.0+cu130**, Transformers **5.19.0**. BF16 weights: 7,947,142,640 bytes; SHA256 `55d4e2519456c4a9bddf596b0748d630e3b2ce6ff6f4c2b7ed3e07e2b00dad42`, verified against the pinned NVIDIA snapshot metadata. No system Python or Node dependency changes. Download took approximately 29 minutes of the installation work.

Private runtime root above retains resolved dependencies, pinned model/tokenizer/parser, exact launch settings, process identity, both server logs, model hashes and closed-run records. Original failed evidence: `qualification-0501/`; fresh passing evidence: `qualification-scored-0510/`. Passing result SHA256: `b136580da2018324469c556f1e1f36c3566816a148f599c2b3fa3c025731c0bf`. Each run retains source pins and runner snapshots. Keys and raw output stay private and outside Git.

Both positively owned server process groups were stopped after their completed calls. The final loopback18535 listener is gone; `stopped.json` records completion without activation. The launcher is deliberately one-shot and refuses an existing service record. Ordinary Ollama on11434 remains reachable and unloaded. Existing Fleet/PACT services, worlds, owners, queues, allocations and settings were not reconfigured. PACT working tree remains clean; Fleet changes remain uncommitted on master as requested by the current scope.

## What this establishes and what remains

The Ollama-specific serial execution restriction is overcome: this machine can serve four actual Nemotron4B requests concurrently with the tested context sizes. A shared four-slot inference pool can serve 24 kingdoms / 36 decision-makers by queuing work; it does not run 36 model executions at once. The measured memory and burst performance support hardware feasibility for this bounded workload, while sustainable arrival rate, long contexts and a 24-hour local PACT workload remain unmeasured.

Correctness is established only for the new opt-in evidence and explicit numeric-objective contract on eight fresh synthetic cases. Identity/facts and arithmetic objectives are constrained and independently checked by code. Raw open-ended reasoning still failed; this is not general model-intelligence repair or all-eight-architecture gameplay qualification. Existing architectures must supply authoritative typed evidence and appropriate decision policies before inheriting this acceptance. Native PACT handlers still own legal state changes, authorization and receipts.

Installed Fleet is not cut over or activated. No worker/game run was started. Game execution stays disabled and E4/KQ1 remain blocked. Further architecture integration, sustained load qualification and an approved cutover are separate remaining work, not silently included in this result.
