# vLLM Metal switch: source installed, live run blocked by storage

The owner selected vLLM in place of the proposed Ollama replica pool and authorized disposable-space cleanup and the fresh one-hour experiment. The existing three unknown allocations remain unchanged with120,000tokens reserved and null measured usage. No new owner action was used to refund/reset/replay them. [Exact result](vllm-metal-switch-20261102.json), [cleanup](vllm-cleanup-20261102.json), [execution plan](../superpowers/plans/2026-11-02-vllm-metal-switch.md).

## Installed and verified

An isolated Python3.12.13 environment contains official vLLM0.32.0+cpu / Metal0.32.0, MLX0.32.2 and174locked packages. The macOS core wheel's `+cpu` label is its distribution name; the Metal plugin supplied actual Apple GPU execution. [Runtime instructions and lock](../../research/vllm-metal/README.md). Global toolchains and original services remain intact.

The pinned `mlx-community/NVIDIA-Nemotron-3-Nano-4B-4bit` revision `c4d79ba1901d99806ef757642a552acebb851a35` downloaded successfully; model and tokenizer match upstream LFS SHA256 values. Nine files total2,254,214,080bytes. MLX affine4bit/group64 is a different quantization resource from the old GGUF checkpoint; these are not bit-identical provider comparisons. The small custom configuration module was inspected before loading; model execution used the pinned upstream MLX implementation.

The first startup loaded the model and exported authenticated native metadata accepted by Fleet:689physical/687admission cache blocks, six Mamba groups plus976token attention blocks, context32768 and8maximum sequences. It used about10.26GiB cache backing. Exported generation/prompt/output counters were all zero. It was stopped for resource sizing, with its whole process group absent afterward. This proves model loading and metadata compatibility, not concurrent generation quality or gameplay correctness.

## Startup failure and narrow repair

The next metadata-only startup requested4GiB cache through `--kv-cache-memory-bytes`. Metal0.32.0's hybrid planner ignored that setting, derived its own budget from default GPU utilization/free-memory probing, and attempted28.34GiB backing. macOS swapped other resident pages, consuming disk headroom. The independent provider guard detected the unchanged10GiB reserve breach and stopped the owned process group. No generation request, native turn or new gameplay command occurred; no fresh game world was provisioned. Both owned provider groups are absent.

Commit `6def3ed` repairs this exact boundary in the optional Fleet Metal worker: require an explicit positive byte limit and the deferred hybrid allocation path, retain native profiling, then cap the scheduler-visible budget before native allocation. A smaller native budget stays smaller. The native metadata exporter, topology accounting, resource leases and `PROVIDER_CACHE_PROFILE_REQUIRED` guard remain intact. Reinitializing an attested worker is refused.

Regression first failed on the ignored limit and unsupported-path acceptance;5worker/budget tests now pass, together with3actual vLLM metadata tests and15existing provider guard tests. Types/style pass with existing405warnings/83infos. Historical result JSON formatting was repaired with semantic equality checked; no historical result changed. **The repaired cap has not yet been requalified on hardware**, because remaining disk space is below the preservation reserve.

## Cleanup, preservation and remaining condition

Selected cleanup recovered5.71GiB initially and a further1.33GiB net during recovery checks, approximately7.04GiB total across measured steps. This included public package/compiler/download caches, Chrome HTTP/code caches, inactive IDE completion caches and Xcode intermediates. Personal downloads, browser sessions/storage/history, installed products/archives, model weights, local/private Maven artifacts, Docker data and all ignored research evidence remain preserved. Available disk space also reflects new installation/model storage and the OS's later swap reclamation; it is not the cleanup total.

Final measured availability and swap are in the linked JSON. macOS still holds roughly14GiB of swap, slowly reclaiming space after shutdown. No swap files were deleted, no original application was closed and no original service or machine was restarted. The latest preservation check matches all67original container configurations/115volume definitions, with three original services healthy. The old capacity world remains paused at tick2 with its exact5reported/3unknown allocations.

**No one-hour vLLM experiment is running.** Resume preparation only after at least14GiB free provides the unchanged10GiB reserve plus initial recording/backup headroom and available memory supports the bounded backend. Then qualify a fresh metadata-only process using the repaired worker and an explicit6GiB cache cap; inspect actual initialized blocks/bytes, authenticated tokenizer/schema/usage path and finite stop. Never infer capacity from configured flags alone. Only after those short checks should new24kingdoms/manifests/namespace/budgets and a fresh absolute one-hour window be sealed. The existing closed worlds are never reopened. The accepted historical16.29% latency failure against10% remains unchanged.

## Upstream references

[Official Metal installation](https://docs.vllm.ai/projects/vllm-metal/en/latest/installation/), [supported models](https://docs.vllm.ai/projects/vllm-metal/en/latest/supported_models/), [Nemotron GGUF exclusion](https://docs.vllm.ai/projects/vllm-metal/en/latest/gguf/), [pinned Metal planner source](https://github.com/vllm-project/vllm-metal/blob/v0.32.0/vllm_metal/v1/cache_policy.py), [pinned MLX checkpoint](https://huggingface.co/mlx-community/NVIDIA-Nemotron-3-Nano-4B-4bit/tree/c4d79ba1901d99806ef757642a552acebb851a35).


Quiet follow-up `watch-nemotron-advisory-retry` is ACTIVE every5minutes. It checks storage/memory without starting a provider while free space is below14GiB; once headroom and memory return, it continues the selected repair qualification and fresh preparation. The latest resource sample is5.12GiB free, with13,681.62MiB used swap. It does not replace any future controller/watchdog, authorize replay/refund, or imply that the hour has started.
