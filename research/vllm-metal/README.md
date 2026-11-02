# Local Apple Silicon vLLM runtime

This optional runtime uses the official vLLM Metal **0.32.0** release and its declared upstream vLLM **0.32.0+cpu** macOS wheel with Python **3.12.13** / MLX **0.32.2**. The `+cpu` wheel is the upstream macOS core distribution; the Metal plugin supplies Apple GPU execution. `requirements.lock` records the exact resolved packages and immutable Git revisions. It does not install into Fleet's default environment.

Use a separate virtual environment and the two pinned official wheel URLs in the lockfile. Install the locked dependencies with `uv pip install --python <isolated-python> -r research/vllm-metal/requirements.lock`, then `uv pip check --python <isolated-python>`. The Python interpreter and package versions are part of each operational manifest; this directory does not activate a provider or authorize inference.

For Fleet's guarded parallel route, select `--worker-cls fleet_vllm_metal.FleetMetalWorker`, set `PYTHONPATH` to the repository's `scripts/lib`, and use `--middleware fleet_vllm_capacity.CacheProfileMiddleware`. The worker records the exact cache configuration only after successful upstream allocation; reinitialization is refused. Metal0.32.0's hybrid planner ignores `--kv-cache-memory-bytes`, so this worker requires a positive explicit byte limit and the deferred hybrid allocation path, preserves upstream profiling, and caps the scheduler-visible budget before allocation. It never increases a smaller upstream budget. The actual allocated cache still requires a fresh metadata check before admission. The existing inspector still rejects unsupported cache modes/topologies. Configure a unique authenticated `FLEET_CAPACITY_ENDPOINT`, `FLEET_PROVIDER_INSTANCE_ID` and `VLLM_API_KEY`; never put credentials in Git or command output. Actual initialized metadata must pass Fleet's existing cache-profile parser and be pinned in the finite run, with no guessed capacity or bypass of `PROVIDER_CACHE_PROFILE_REQUIRED`.

Choose an explicit `--kv-cache-memory-bytes` budget. Keep prefix caching, speculative decoding, host offloading and sleep/reallocation disabled for this configuration. Do not infer compatibility from installation: the exact model, tokenizer, schema, actual cache export, resource headroom and finite stop still need operational checks. Nemotron-H support is experimental; the upstream GGUF loader excludes it. Any MLX conversion is a distinct checkpoint/quantization resource, even at the same four-bit width.

Offline checks (no device/model imports in the first):

```sh
python3 scripts/test-vllm-metal-metadata-offline.py
PYTHONPATH=scripts/lib <isolated-python> scripts/test-vllm-capacity-offline.py
```

[Official installation](https://docs.vllm.ai/projects/vllm-metal/en/latest/installation/), [model matrix](https://docs.vllm.ai/projects/vllm-metal/en/latest/supported_models/), [GGUF scope](https://docs.vllm.ai/projects/vllm-metal/en/latest/gguf/).
