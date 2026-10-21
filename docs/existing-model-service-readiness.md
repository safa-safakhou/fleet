# Existing model service: read-only readiness

The user authorized inspection of the already running service and forbids starting a local Ollama server or changing unrelated services. This check found a compatible existing Windows service and verified its selected runtime/model files. It did not establish an inference-qualified route or complete a qualification stage.

The private file/metadata proof was recorded at `2026-10-21T22:00:52.040Z`. Private process identity and file roots remain outside Git. The service's creation time predates both this inspection and the rejected isolated E4 startup; the same process and creation time remained present after inspection.

## Verified findings

| Check | Result |
| --- | --- |
| Existing listener | Windows `127.0.0.1:11434`, same Windows user, exact `ollama.exe serve` command, loopback-only listening |
| Provider version | HTTP metadata reports Ollama `0.35.1` |
| Executable | Valid Windows signature; SHA-256 `3cc17c238b081adf2bd3a206e52a063b637af1bf283d95b4ffd73a2bdec8b027`, matching the pinned descriptor |
| Installed libraries | All 989 files / 2930392048 bytes match pinned inventory digest `f06576561d9fa0049ee9c3db227ff3542cff33423e3cdf73bfcd8182a103efeb` |
| Selected local model | `nemotron-3-nano:4b`, GGUF / 4.0B / Q4_K_M |
| Selected model bytes | Default local model manifest and all four pinned layers match; manifest SHA-256 `6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197` also matches the service's advertised digest |
| Resident models | Zero reported before and after inspection; ten models installed, unrelated model contents not inspected |
| Existing Windows controller runtime | Pinned Node `24.19.0` can read version, model-list and resident-model metadata from this endpoint |
| Current WSL route | `127.0.0.1:11434/api/version` returns connection refused; the probe shares the actual Fleet console and worker network namespace |
| Current empty Fleet deployment | Health reports `liveEnabled: false`; its deployment metadata records zero configured model providers |

Model files found in the default local store match the API's advertised model. This does not prove the live process's effective model-store environment or the private isolated-store requirements of an owned study. No process environment, private prompt/history log, auth cache or unrelated model file was inspected.

Only `GET /api/version`, `GET /api/tags` and `GET /api/ps` were requested from the model service. Ollama documents [available-model metadata](https://docs.ollama.com/api/tags) separately from [models currently loaded in memory](https://docs.ollama.com/api/ps). No `/api/chat`, `/api/generate`, warmup, download, load/unload or service-management request was made. There were zero provider starts, inference calls and configuration writes. File hashing checked for content/identity drift during reads.

PACT web/API and Fleet remained healthy. The paused historical world, services, identities, ledgers, unknown allocations, old grants and frozen artifacts were not changed.

## What can use this service

The existing service is compatible with Fleet's Ollama HTTP adapter at the protocol/runtime/model level. Windows clients can reach it without starting another model server. This remains a metadata and file-integrity result: GPU capacity, actual context allocation, structured generation, accounting, cancellation and behavioral quality have not been tested on this shared service. A first inference would need to load the selected model; no model was already resident at the time checked.

The running WSL Fleet cannot use the Windows loopback endpoint as-is. No firewall, listen address, proxy, port forward, worker environment, provider selection or live-execution switch was changed. The existing [HTTP adapter](../src/model.ts) sends a per-request 32768-token context and `keep_alive: 0`; those request semantics would also need to be disclosed for any permitted shared-service run rather than silently changed.

The frozen E4/KQ1 route also cannot use this endpoint as an automatic substitute. Its [Windows verifier](../scripts/lib/negotiation-windows.ts) binds `127.0.0.1:11436`, the artifact-owned executable path, positively owned process and a separate isolated model store. The shared installed service at 11434 does not satisfy those location/isolation bindings, even though its selected file hashes match. Its ten-model store is not the exact isolated study store. No validator, manifest, grant, frozen package or failed-stage evidence was relaxed or rewritten.

The smallest mechanically plausible continuation is a Windows-side controller using the existing service, with its own explicit endpoint/process/settings binding and fresh, separately owned evaluation state. That is an integration requirement, not an executable grant or a claim that the earlier startup denial is cleared. Any permitted real run still needs exact scope/allowance/cutoff, fresh fixtures, authenticated restore proof, native accounting and review gates. It must preserve the user's no-start rule and cannot repurpose old grants, spare allowance or failed studies. The [operational gates](negotiation-continuation-20261021.md) and [RC2 acceptance limitations](RC2-local-acceptance-20261021.md) remain applicable.

## Verification scope

Private proofs were cross-checked for executable/library/model matches, process continuity, same-user ownership, exact serve command, loopback scope and zero inference/configuration changes. This is documentation of observed readiness; no application source changed and no new full-suite or release acceptance is claimed.
