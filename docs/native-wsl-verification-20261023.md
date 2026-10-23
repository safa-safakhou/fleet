# Native WSL verification and gate clarification — 23 October 2026

**The current native WSL stack works.** The user clarified that the approved migration replaces the ordinary Windows execution/provider setup and requested current verification. The earlier Windows E4 startup denial was incorrectly carried into reports as a blanket clearance requirement for unrelated, authorized native WSL work. This record corrects that interpretation; it does not erase the denied action, fabricate an override or reopen a frozen study.

## Current checks

- Shell/kernel: Linux `6.6.87.2-microsoft-standard-WSL2`, x86_64; repository work runs from `/home/mnim/repos/mine/fleet`.
- Codex: parent executable is a native ELF binary running under WSL. Its binary is stored on the mounted Windows filesystem, but the process is Linux, not a Windows executable.
- Ollama: active native Linux user service, version `0.35.1`, PID `240001`, executable `/home/mnim/.local/opt/ollama/0.35.1/bin/ollama`. The sole `127.0.0.1:11434` listener belongs to that process. No server was started or restarted.
- Selected model: `nemotron-3-nano:4b`, manifest digest `6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197`, matching the pinned native selector.
- Actual ordinary Fleet console PID `239463` and worker PID `239464` run native Linux Node. Their selected environment fields show `OLLAMA_BASE_URL=http://127.0.0.1:11434` and `FLEET_LIVE_ENABLED=0`.
- Fleet `http://127.0.0.1:8840/health` returns success with `liveEnabled: false`. The active listener was identified directly; historical `fleet-windows-*` service names were not mistaken for the actual ordinary console/worker.

The existing [migration record](native-wsl-ollama-migration-20261022.md) retains the full model-copy and cutover evidence. This check verifies the selected native runtime/model and current route; it does not rehash all historical model files or change the standing model selection.

## One fresh connectivity response

One new game-free smoke call used the existing native Ollama route, only Nemotron 4B, thinking false, deterministic options and a schema requiring `{"status":"WSL_OK"}`. Its independent ceiling was one call, 30 seconds and 64 output tokens, no retries. It had no game/database connection, tools, controller task or study allocation.

Execution: **21:25:11.840–21:25:18.356 UTC**, **6.516 seconds**, **30 input + 9 output = 39 measured tokens**. The provider ended normally with zero thinking text and returned exactly `{"status":"WSL_OK"}`. Zero game commands and zero unknown usage. This is separate from the closed qualification matrix; no unused matrix allowance was resumed.

Private result: `/home/mnim/.local/share/fleet-probes/native-wsl-verification-20261023-2125/result.json` (SHA-256 `7b16bf7573a1f763fb8807cfb1f39ca19b48c56327c681ad0b2988d05ac20a58`). No account credentials, full environment dumps or private configuration were printed or committed.

## Correct interpretation

The current native environment has no demonstrated provider-start or connectivity problem. The user's independently authorized migration and current verification do not retry the exact denied Windows standby start. **Do not require approval of that old Windows command before ordinary authorized native WSL development, verification or preparation.** Earlier wording suggesting a general external clearance certificate was misleading.

The original E4/KQ1 artifacts retain old frozen bindings and remain unrun. Do not relabel a new WSL attempt as one of those old stages, reuse their grants, start their old provider or infer a platform override. If future work needs a native evaluation, define its fresh native source/model/settings/fixture/budget boundary under covering authorization.

The actual remaining release blockers are behavioral qualification (including the [failed final-answer provenance check](bounded-qualification-release-readiness-20261023.md)) and the still-unperformed actual disabled installation/restart acceptance. Migration success does not make those tests pass. Game execution remains disabled; no activation, service restart, historical-world access or denied-action retry occurred.
