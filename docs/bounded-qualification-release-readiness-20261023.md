# Bounded qualification and release readiness — 23 October 2026

**Overall completion remains blocked.** The fresh behavioral matrix failed; no platform resolution exists for E4/KQ1. Independent offline preservation work passed, and newly discovered Fleet dependency advisories were repaired. Neither result permits candidate installation or activation.

The user requested all three remaining workstreams. The [bounded plan](superpowers/plans/2026-10-23-bounded-qualification-release-readiness.md) was committed as `724a2ef` before inference. Work remained inline on master. Only Nemotron 4B was used for inference. Game execution stayed disabled. No prior failed grant or spare allowance was resumed.

| Workstream | Actual result | Still required |
| --- | --- | --- |
| Broader behavioral qualification | Four-case scripted preflight passed; real matrix stopped on first semantic failure, response 3 | Repair/review final-answer provenance and qualify a fresh exact candidate; the other three real cases remain unrun |
| Isolated installation and rollback acceptance | Passive old/new packages built; 25 offline compiled-runtime/data-preservation checks passed, including independent encrypted restore and source rollback | Qualified release configuration, actual disabled process/service installation and restart/isolation acceptance; activation remains separate |
| E4/KQ1 clearance | No applicable platform-resolution mechanism exposed by available tools; user has supplied no resolution | Platform-issued resolution covering the original denied action/context, then stage-specific operational gates and grants |

## Real matrix: failed and closed

Source candidate: Fleet `ce86fd46193c84e5b3ec3d6f2a627ba0bf729766`. The new script/contexts, synthetic value and request ID were independent of earlier closed probes. Scripted preflight passed status lifecycle, pending request, unavailable read and known literal value, within the unchanged 13,000-byte ceiling. Scripted passes are not inference results.

One real attempt had a maximum of six calls / ten minutes, stop on first failure, no retries. Per-call and aggregate token/output ceilings remained unchanged. Native WSL Ollama and the exact pinned `nemotron-3-nano:4b` digest were checked; thinking remained false. No provider startup, fallback, warmup or alternate model occurred.

Execution: **21:09:42.983–21:10:38.808 UTC**, **55.825 seconds**, **three calls**, **4,353 input + 153 output = 4,506 measured tokens**, zero unknown calls and zero game commands. Maximum real request: **9,044 bytes**; maximum scripted matrix request: **12,991 bytes**.

The first two responses selected the required schema and performed the matching self-scoped read. The third returned the correct value, but added unsupported provenance:

> Requested read of service.observation.service.requestedRead.statusCode resolved to 'violet-924'.

That path is absent from the delivered packet. The value was explicitly known at `observation.requestedFacts[0].value`; the requested-read payload held a reference to a delivered evidence original whose `detail.payload.requestedRead.statusCode` held the scoped answer. Inline review rejected the invented locator before final envelope acceptance. The failure concerns provenance, **not** the correctness of the returned status value. No repeat lookup, empty refresh, premature read summary or game action occurred.

The original reviewer note also gave an imprecise example of the actual location. A separate retained clarification corrects that example without changing or concealing the original note or verdict. No further model call followed. The pending-request, unavailable-read and known-literal cases remain unstarted in this real attempt; three unused calls are closed. Earlier passing two-case evidence remains valid for its own attempt and does not overturn this result.

Private matrix evidence: `/home/mnim/.local/share/fleet-probes/nemotron-matrix-20261023-2112/`.

- Script SHA-256: `cff7dfef847fb21b12f4bd3ee2e5a143d6e168025bfef0c8d957a6e28d5b8e56`.
- Result SHA-256: `f27a9d08b82e448d1637784a2d882ba0883f461484c9859213d7382711401e12`.

## Offline release-preservation evidence

Qualification failure kept the installation gate closed. The independent work used passive packages and in-process Fastify injection against fresh owned synthetic PostgreSQL fixtures. **No HTTP listener, worker, service installation or process restart was performed.** Reconstructing a disabled server object is not service restart acceptance.

The earlier package `1bc3023` and candidate `ce86fd4` were built and inventoried separately. An initial 25-check rehearsal passed. The frozen inventories were independently rechecked and remain unchanged. Their private evidence is retained at `/home/mnim/.local/share/fleet-release-readiness-20261023-2112/`.

After the dependency repair below, a separate package and new fixtures repeated the 25-check rehearsal for exact source `b6da0fd46314ecd63cfa0d5d153ca59f939c3469`. It verified:

- Idempotent migrations and preservation of every compared logical table/sequence fingerprint.
- Disabled health, rejected unauthenticated/bad-password requests, valid authentication and retained sessions across old → new → old compiled runtimes.
- A seeded synthetic unknown allocation retaining its full 40,000-token reservation, the exact pending command ID, encrypted synthetic credential and vault associated-data binding.
- Authenticated AES-GCM backup, tamper rejection, PostgreSQL custom-format restore into a separate positively owned clone, matching logical fingerprints and successful vault decryption there.
- A write made **after** backup surviving source rollback against the current database. No old backup was restored over the source database.

The fresh owned containers were removed only through ownership-checked fixture cleanup. Authenticated encrypted archives, matching synthetic key material, inventories and results remain private. No retained world, original unknown allocation, account, grant or queued command was accessed. No model/provider route was configured in the injected runtimes; HTTP fetch was forbidden.

Final passive package inventories:

| Package | Entries | Inventory digest |
| --- | --- | --- |
| Old `1bc3023` | 5,837 | `5608a7f59266b82b22b89eb26f52b31f79d94766204545c5a0ede505b85f2ad7` |
| Security-patched `b6da0fd` | 6,424 | `c41326b05b20aaf38cdf8a0ca9b1b292700a9a1d5de11d4ea4e400f67333a844` |

Final rehearsal: **21:17:35.945–21:17:43.395 UTC**, all **25 checks passed**, zero model calls/game commands/workers/listeners. Private evidence: `/home/mnim/.local/share/fleet-release-readiness-security-20261023-2117/`.

- Rehearsal script SHA-256: `a9b5125fa8f24534e31844af6d1160f5710202d81b6f7791d5028fd8a243b898`.
- Result SHA-256: `92e3994fd80d6b623091ce7ebf8599c6db031ce0a5f53da2d2f1fc727a533a46`.
- Encrypted archive SHA-256: `75431cd9e58c0482737b0704b699503cd5b4e57fd37520bc9f349d5ffa725d94`.

These are offline mechanism proofs. Exact installed-service configuration, listener/process ownership, real restart, disabled deployment and eventual activation acceptance remain unperformed behind the qualification gate.

## Dependency repair and final source checks

Fresh production audit found Fastify's low-severity header-validation advisory and Zod's high-severity constrained-collection memory advisory. Full audit also exposed the Vitest mocker toolchain advisories. Exact patch pins were updated to **Fastify 5.12.7, Zod 4.6.7 and Vitest 5.0.5**, with the lockfile, committed as **`b6da0fd`**. No force upgrade, new application feature or installed-runtime restart occurred. The failed `ce86fd4` model attempt and its passive artifacts remain immutable; the dependency repair creates different source and does not repair the provenance failure.

After those updates:

- **893 unit tests in 170 files passed**.
- **63 isolated integration tests passed**: 57 specialist HTTP, five binding and one release-preservation test.
- Type/style passed with the existing 82 warnings / 56 informational diagnostics; build and architecture boundaries passed.
- Full `npm audit`: **zero findings**, including development dependencies. Final audit SHA-256: `d540d04563e2ab205f70b339df2c5bc29dc223c6610ebd29fedd2b5b0bb5669a`.
- Network-forbidden scripted matrix on repaired dependencies: all four cases passed, zero inference/game commands, maximum request 12,991 bytes. Evidence: `/home/mnim/.local/share/fleet-probes/security-patch-offline-20261023-2116/`.
- Documentation-link and diff-whitespace checks passed. Ordinary Fleet health remained `liveEnabled: false`.

No real model trial ran on `b6da0fd`. PACT application source/dependencies were not changed or audited by this Fleet-specific repair.

## External gate and remaining work

The original E4 provider-start rejection remains as documented in the [continuation gates](negotiation-continuation-20261021.md). Available tool discovery exposed no supported platform-denial resolution tool; game-action approval tools are unrelated and were not used. This is not a platform-wide approval-ledger inspection. A permissive current shell profile and a broad completion request do not supply the missing clearance. No denied operation was retried or moved to another launcher/provider/chat.

Still required: address/review the final-answer provenance failure and qualify a fresh exact release candidate; complete the remaining behavioral scenarios and native release requirements; then perform actual isolated disabled installation/restart/isolation acceptance. E4/KQ1 additionally require external platform clearance and their original stage gates. Activation remains separate. This record grants no further inference, installation, activation, push or failed-grant continuation.
