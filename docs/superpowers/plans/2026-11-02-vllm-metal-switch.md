# Local vLLM Metal switch and storage cleanup

> Execute inline on master, using systematic-debugging, test-driven-development for required source changes, and verification-before-completion. No delegation or push. The owner selected vLLM and authorized removal of unnecessary files and the fresh one-hour experiment; preserve prior unknown holds and failed tasks without refund/replay.

**Goal:** Replace the proposed Ollama replica experiment with one local vLLM Metal server, clean disposable caches, and establish whether this exact Mac/model/backend can safely serve the finite 24-kingdom experiment.

**Architecture:** Reuse Fleet's existing explicit vLLM route, streamed usage/evidence, exact tokenizer and physical-cache admission. Use the official Apple Silicon vLLM Metal plugin, pinned stable release v0.32.0 with its declared vLLM/MLX dependencies in a new isolated environment. Upstream Metal does not support Nemotron GGUF: a pinned MLX Nemotron 3 Nano 4B checkpoint is a distinct experiment resource, with its own quantization/checkpoint identity, not a bit-identical repeat of the Ollama model. Prefer the same four-bit class; do not silently claim equal outputs or comparable quantization. Keep prefix caching/speculation off and context32768/output1024/input48000. Runtime changes must preserve all native authority/accounting/context/capture guards.

**Tech Stack:** Node26/TypeScript, Python3.12, vLLM0.32.0 + vLLM Metal0.32.0/MLX, existing PostgreSQL17/Temporal/OTel/native PACT.

## Constraints and review focus

- Preserve every retained world/service/identity/budget/schedule/command/private artifact and all120000unknown reserved tokens. This is a fresh experiment; old runs stay closed.
- Only delete identified regenerable caches/build intermediates or artifacts demonstrably superseded by this work; no blanket prune, volume removal, private evidence cleanup or unrelated application data removal.
- Do not run upstream CUDA containers on this Apple GPU, substitute another model/backend without disclosure, or call a compatibility response proof of concurrent throughput.
- Keep the10GiB disk reserve, consent/retention/integrity, native90s model/120s turn deadlines, per-binding exclusion and hard finite stop. Unknown final usage is never inferred from aggregate metrics.
- Parallel explicit vLLM requires authenticated actual physical cache metadata. Inspect Metal's actual allocation model; implement/test a precise integration if supported, or report the exact unsupported boundary. Do not bypass `PROVIDER_CACHE_PROFILE_REQUIRED` or invent blocks/capacity.
- Short launch checks must prove actual pinned model load, tokenizer/schema/final usage, physical parallelism, evidence, stop/child cleanup and resource headroom. Full one-hour gameplay outcomes are observations, not universal qualification.

## Tasks

- [x] Measure/clean selected public package/compiler/download caches; record actual recovered bytes, preserve original Docker/services/data. Commit cleanup report.
- [ ] Check upstream release/model support and metadata without inference. Pin release, artifact hashes/model revision and isolated dependency lock. Install only after sufficient headroom; keep global toolchains intact.
- [ ] Inspect exact Metal cache topology, worker extension support and stream/schema/tokenizer behavior against Fleet's existing route. Add only necessary synthetic regressions and narrow changes. Verify affected checks and commit.
- [ ] Qualify the pinned local server with bounded synthetic calls/usage/evidence and measured concurrent slots. Preserve any dispatched uncertainty and stop on failed guards. Record actual compatibility, latency, resource limits and cleanup.
- [ ] If supported, provision wholly fresh24kingdom identities/manifests/namespace/budgets and one-hour absolute window. Reuse goals/triggers/cadence and48calls/1920000tokens each; aggregate1152/46080000, max3calls/one accepted action perturn, one turn/binding, maximum8concurrent pending requests with measured admission. Keep final3minute cutoff, controller/watchdog and all recording. Launch only after the concrete short checks and pinned configuration are complete.
- [ ] Commit accurate running or blocked result/current-state. Maintain the quiet monitor only for an actual active run. Report exact bottlenecks, freed space and source versus live results.

## Sources inspected

[Official Metal repository](https://github.com/vllm-project/vllm-metal), [installation](https://docs.vllm.ai/projects/vllm-metal/en/latest/installation/), [model matrix](https://docs.vllm.ai/projects/vllm-metal/en/latest/supported_models/), [GGUF exclusions](https://docs.vllm.ai/projects/vllm-metal/en/latest/gguf/). Stable release v0.32.0 published21October2026. Nemotron-H support is experimental with prefix caching disabled. The supported-family example is not proof that this exact4Bcheckpoint works. Local hardware is Apple M4 Pro/48GiB/macOS26.6.2.
