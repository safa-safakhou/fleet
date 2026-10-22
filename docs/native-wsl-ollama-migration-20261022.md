# Native WSL Ollama migration — 22 October 2026

Status: the approved ordinary-provider cutover is complete. Native Linux Ollama 0.35.1 runs as the Linux user's enabled systemd service on `127.0.0.1:11434`. The empty local Fleet console and worker connect directly; their Windows bridge is stopped. Fleet remains live-disabled. This is connection acceptance, not game-agent qualification or release activation.

The user explicitly authorized migrating all models, connecting Fleet directly and verifying the result inline. That authorization replaces the ordinary Windows provider; it does not reopen any historical study or authorize a parallel provider. The [implementation plan](superpowers/plans/2026-10-22-native-wsl-ollama.md) records the approved scope.

## Runtime and complete model copy

- WSL2 exposes the RTX 5070 Ti and its approximately 16 GB VRAM through the existing Windows NVIDIA driver. No driver, WSL resource allocation or network configuration was changed.
- Installed the official Linux amd64 **0.35.1** release under the Linux user's application directory. The archive's SHA-256 matched its published release digest: `9fcd79ac4575b2bd31b992eee18b1000c8ad126b451627c8f8cd091714cfbb10`. The extracted native binary and live API both report 0.35.1. No server-version upgrade or replacement-weight download occurred.
- Copied the entire existing store: **10 manifests / 66 files / 52,059,883,845 bytes (48.48 GiB)**. Every source file was hashed during copying and each destination was independently re-read and hashed. Blob filenames matched their content digests; all manifest config/layer references resolved to blobs of the declared sizes. Source file membership, size and modification times remained unchanged throughout staging and final verification.
- Canonical inventory SHA-256: `9f98fab5b066bfc92d1761ce7218d5851ef2d829629bb4a48b4767a800a89589`. This hashes compact, sorted-key JSON containing the sorted relative file paths, sizes and SHA-256 values. Both pre-cutover and post-restart native catalogs exactly matched the Windows names, manifest digests and reported sizes.
- Models reside on the Linux filesystem. Windows models, application files, settings and identities remain retained for rollback. Nothing in the original Windows model store was deleted or altered.

Official references: [Linux installation and version pinning](https://docs.ollama.com/linux), [the pinned release](https://github.com/ollama/ollama/releases/tag/v0.35.1), [GPU support](https://docs.ollama.com/gpu), [model location configuration](https://docs.ollama.com/faq#how-do-i-set-them-to-a-different-location).

## Controlled cutover

The original signed Windows executable matched its recorded SHA-256. Its application/server PID, creation time, executable and exact command were positively matched before stopping. There were zero resident models at cutover. The identified tray application was stopped, established client connections drained, and the original server stopped; its Windows listener was confirmed closed before native Linux startup.

The exact Windows startup shortcut was copied privately and its bytes/hash verified before removing it from the startup folder. Final inspection found **zero Windows Ollama processes and zero Ollama startup entries**. Original executable/model/configuration files remain retained, alongside the startup shortcut and private rollback instructions.

The enabled user `ollama.service` uses the pinned native executable and Linux model directory, binds only loopback and has process-group stop handling. The existing user manager already had lingering enabled; no sudo or system-service changes were needed. A user CLI link exposes `ollama` in the user's local bin directory. The service starts with the WSL user manager; this does not itself start WSL at Windows boot.

Only the empty-instance Fleet provider endpoint changed, from `http://127.0.0.1:11435` to `http://127.0.0.1:11434`. All its other environment settings, including `FLEET_LIVE_ENABLED=0`, matched their private before snapshot. Only its two Fleet processes were restarted. The positively identified Windows bridge was stopped and retained as a retired artifact. Its restart helper now verifies native service ownership/version for the direct route and does not recreate a bridge on that route. The historical bridge branch remains available for an explicitly executed rollback.

PACT web/API returned HTTP 200; Fleet health returned HTTP 200 with `liveEnabled: false`. All four existing PACT process identities remained unchanged. The existing empty database/container/volume and private credentials were reused; no historical world database was accessed.

## One bounded synthetic response

A single fresh connectivity probe used Fleet's existing `config` and `HttpModel` implementation against the installed direct endpoint. It had no database, game accounts, scheduler or tools. Its private one-shot ledger admitted **one call / 40,000 reserved tokens / 128 maximum output tokens / a 15-minute absolute cutoff**, with no retries or helpers. The probe selected `nemotron-3-nano:4b`, thinking disabled and the adapter's normal 32,768-token context and `keep_alive: 0`. This was a probe-specific setting, not a change to any cohort/model settings.

| Observation | Result |
| --- | --- |
| Real model requests | 1 |
| Native input / output / measured tokens | 52 / 19 / 71 |
| Response | Valid schema-constrained wait: `Native WSL Ollama works.` |
| Native completion | `done: true`, reason `stop` |
| GPU evidence | Selected model observed in the native `/api/ps` response with nonzero GPU-resident bytes during generation |
| Post-request residency | No models resident, consistent with the adapter's unload setting |
| Runtime game commands | 0 |

Native usage was fully reported into the private migration-probe ledger. No Fleet application compute row or study allocation is claimed: the probe exercised the HTTP adapter directly, without a controller task or application database. Raw synthetic output, GPU metadata samples, identities, exact source/destination inventories and rollback snapshots remain private outside Git.

The native service subsequently restarted successfully with a new positively identified process. Both model metadata and the complete catalog still matched. The empty-instance restart helper then passed **twice**, preserving every application PID and its direct, live-disabled provider configuration. These checks dispatched no further inference.

## Operation, rollback and limits

Use `systemctl --user status ollama.service`, `ollama list` and `curl http://127.0.0.1:11434/api/version` for local status and metadata. The existing private empty-instance restart helper remains the application recovery entrypoint and now supports this direct route. Service restart alone neither enrolls agents nor enables Fleet execution.

Rollback requires stopping the native provider before restoring the recorded Windows startup/provider settings. The original Windows runtime/model files and exact private configuration/shortcut backups remain available. Preserve newer application/database state when restoring configuration; do not overwrite it with an old snapshot or automatically resume any cohort. Rollback was prepared and reviewed, not executed.

Only the selected Nemotron model received real inference acceptance; the other nine models received full file/catalog verification. Cancellation, streaming, all-model behavior and scheduler/game execution were not newly certified. The RC3 prompt/coverage findings remain unfixed, RC3 remains failed/unqualified, and E1–E3/R2/R3 grants and unused allowances remain closed. Frozen Windows E4/KQ1 artifacts, routes and the original E4 denial are unchanged; the native provider is not a substitute for those bindings. No candidate release installation, game activation, preserved-world access or push occurred.

Operational acceptance and the final source/document review were performed inline without delegation. Documentation/link checks and `git diff --check` passed; application suites were not rerun for this operational/configuration and documentation change.
