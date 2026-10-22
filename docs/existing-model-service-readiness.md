# Existing model service and empty-instance recovery

Current ordinary-provider route: the [approved native WSL migration](native-wsl-ollama-migration-20261022.md) supersedes the Windows runtime/bridge observations below. All ten models were copied and verified; Windows Ollama is stopped, and the empty Fleet instance connects directly to native Linux Ollama while remaining live-disabled. The following dated Windows records remain historical evidence.

## Real response and isolated accounting check: 22 October 2026

The subsequent user request authorized a real Fleet response using the already running Ollama service, preservation of the old world, no additional server and no retry of blocked E4. The service was available again at the 11:27 UTC metadata check. At `2026-10-22T11:34:40.820Z`, a separate, terminal local connection probe completed with these results:

| Check | Result |
| --- | --- |
| Actual path | Fleet `ModelAdmission` → `HttpModel` → WSL loopback bridge → existing Windows Ollama 0.35.1 |
| Model | `nemotron-3-nano:4b`; expected manifest digest and signed executable matched before dispatch |
| Scope | Fresh owned PostgreSQL 17 fixture and synthetic Fleet binding, no PACT accounts or game access; one call, no retries/helpers, 40000-token reservation and an absolute 15-minute cutoff |
| Response | Valid schema-constrained JSON: `{"kind":"wait","summary":"Local Fleet model connection works."}`; native provider completion reason `stop` |
| Accounting | Exactly one `reported` native ledger row: 63 input / 83 output / 146 measured tokens; 40000 reserved tokens; zero unknown allocations |
| Final state | Zero active turns or game commands; probe cohort terminal/stopped; no scheduler or app execution switch enabled |
| Archive and restore | AES-256-GCM authenticated before/after archives, each restored to a separate owned clone; complete logical table/sequence fingerprints match; after-clone ledger matches exactly; modified authentication tags rejected |
| Preservation | Same Windows Ollama PID/creation time before/after; zero provider starts; original probe and two restore containers stopped and retained; old world and frozen studies not accessed |

Source pins for this local probe were Fleet `13b20552757ab4ae2a83975a5992ccaf461f405f` and PACT `931f27d2b01bf569cd3ce1f5bacb7de093c5036e`; its own scope, fixture nonce, UTC cutoff, vault key, responses, ledger and archive/restore proofs are private. No E-stage, KQ1 or RC2 study grant/allowance was consumed or reopened. The ordinary adapter settings remained thinking enabled, 32768-token provider context, 2000 output tokens, non-streaming and `keep_alive: 0`. As disclosed before dispatch, the selected model unloaded afterward while the server stayed running.

This demonstrates real structured response delivery through Fleet's admission and accounting components. It does not exercise the Fleet UI scheduler, PACT gameplay, candidate authority behavior, held-out negotiation, full packet capacity, streaming/cancellation or release installation. The backup scope is this synthetic Fleet probe plus an empty ownership-marker database; it is not a restored PACT world, RC2 roster or packaged Windows rehearsal. The empty PACT/Fleet applications remain healthy and live-disabled with zero game accounts/agents/model allocations of their own. Repaired-candidate qualification, frozen E4/KQ1 and release/activation remain pending; the old policy rejection is unchanged.

## Latest recovery: 22 October 2026

The user authorized restarting only the empty local PACT/Fleet instance and fixing Windows/WSL connectivity, while forbidding Ollama startup and preserving the old world. At `2026-10-22T11:11:02Z`, all six empty-instance app processes are alive, PACT web/API on 3410/3411 and Fleet on 8840 return HTTP 200 from Windows and WSL, and Fleet reports `liveEnabled: false`. The original empty database container and volume were reused. There are zero accounts/kingdoms, agents/cohorts, turns, model attempts, compute entries or architecture allocations. A second restart call preserved the same process IDs. The old Fleet on 8820 remains healthy and live-disabled; its and the existing helper's process IDs are unchanged.

The prior running-service observations below are historical. At that recovery checkpoint, Windows Ollama was stopped: no Ollama process and no listener on 11434 or 11436. The empty instance's saved `running` record had survived a WSL restart even though its app processes were gone; fresh process/health checks supersede that record.

Direct WSL access to a synthetic Windows listener on the WSL gateway address timed out, while Windows could reach it. Windows curl invoked from WSL successfully reaches Windows loopback. The [loopback bridge](../scripts/windows-loopback-bridge.py) uses that existing mechanism: Linux `127.0.0.1:11435` forwards `/api/` requests through Windows curl to Windows `127.0.0.1:11434`. It starts no model server, reads no curl configuration, uses no shell command interpolation, logs no bodies/credentials and changes no firewall, WSL network mode, listen address or unrelated service. It binds only Linux loopback. Synthetic Windows GET, byte-preserving UTF-8 POST and upstream 404 forwarding passed; non-API paths are refused. The installed private copy matches the repository source SHA-256 `d903557cdcec41d1283bb686e20e9c6b3a60709471ddb09e2a2d988984eba150`.

Only the empty Fleet console/worker received `OLLAMA_BASE_URL=http://127.0.0.1:11435`; their running environments were verified and live execution remains disabled. The real metadata probe returns HTTP 502 with `WINDOWS_UPSTREAM_UNAVAILABLE`, reflecting the stopped Windows service. Transport is demonstrated with a synthetic Windows endpoint; actual Ollama inference, streaming/cancellation behavior and qualification have not been accepted. No real generation request was sent. E4/KQ1 retain their frozen isolated route and budgets; this bridge cannot substitute for them.

Private instance configuration, credentials, process identities, verification proofs and the guarded restart helper remain with the existing empty instance. From WSL, an idempotent restart of only this instance is:

```sh
empty_root="$(cat "$HOME/.local/share/pact-fleet-local/latest-empty-path.txt")"
python3 "$empty_root/restart-empty.py"
```

The helper reuses the recorded container/volume, checks exact local database targets, validates process IDs/start times, starts the bridge if configured, and leaves Fleet live-disabled. It never starts Ollama. It is an explicit local recovery command, not boot automation or permission to resume historical work. Its private bridge copy is an installed operational artifact; the repository script is its source. Restored application availability does not resolve model availability or the qualification/release gates.

## Historical inspection: 21 October 2026

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
