# Fresh local 24-hour game preparation — 25 October 2026

**Fresh state is prepared. The full eight-architecture run is not ready to activate.** This assignment created real local PACT owners and Fleet bindings; it did not run models, workers or agent gameplay. The earlier successful 720-request rehearsal used a synthetic environment and does not establish real PACT gameplay acceptance.

## Prepared state

- New instance: `fresh-24h-20261025-3e692916`.
- Private state: `/home/mnim/.local/share/pact-fresh-24h-20261025-3e692916`, directory mode 0700; credentials, configuration, encrypted archives and evidence remain outside Git.
- Fresh PostgreSQL 17 PACT and Fleet databases, separately owned containers/volumes and loopback-only ports. No retained deployment was migrated, reset or resumed.
- PACT API: `http://127.0.0.1:39671`; Fleet console: `http://127.0.0.1:45573`. Both health checks passed. No web browser/UI was used.
- Twenty-four fresh kingdoms, authenticated owner objectives, mandates, social delegation policies and encrypted Fleet credentials; 24 distinct matching account/kingdom bindings. Three matched guardian/merchant/diplomat owners per architecture.
- PACT paused at tick sequence **0**. All 24 Fleet cohorts remain draft with no schedule anchors. The 24-hour run window is prepared, with no T0 or T1. Fleet live execution and PACT built-in model execution remain disabled. No Fleet/rules worker or model provider was started.
- Zero turns, compute allocations, tasks, platform commands, worker health/heartbeat rows, cognition/memory history or specialist goals. Zero game action events, messages or supply contracts. Owner founding/mandate/objective/social-policy setup is distinct from agent gameplay.
- All kingdoms have the same ordinary founding economy: ordinary balances zero; grain/iron/silver founding allowances 48000/120000/60000 respectively. No extra resources were injected.

| Architecture | Kingdoms/bindings | Launch configuration |
|---|---:|---|
| legacy-loop@1 | 3 | Valid draft |
| legacy-cognition@1 | 3 | Valid draft; no Laya helper |
| reactive-basic@1 | 3 | Valid draft |
| reactive-cognition@1 | 3 | Valid draft |
| reactive-cognition@1.1 | 3 | Valid draft |
| reactive-cognition@2 | 3 | Valid draft |
| specialist-coordinator@1 | 3 | Blocked: real PACT lacks coordination capability |
| autonomous-specialists@1 | 3 | Valid draft; one resources/diplomacy preset, two full; skills off |

There are **21 immutable launch drafts and three retained blocked proposals**. A valid draft establishes local configuration/capability compatibility, not real-model workflow acceptance. Every draft still reports disabled execution and pending provider configuration. No architecture was substituted and no unsupported capability was advertised to force a pass.

## Proposed 24-hour configuration

Only `nvidia/NVIDIA-Nemotron-3-Nano-4B-BF16`, revision `dfaf35de3e30f1867dd8dbc38a7fc9fb52d3914f`, served as `nemotron-4b` through isolated vLLM. All eleven model files were hash/size verified offline. Existing immutable model/runtime files are reused; game state, credentials and Fleet history are fresh. No Ollama, Laya or other model fallback is configured.

Proposed limits: eight task workers, four inference slots, serial kingdom action lanes; 15-minute periodic reviews and genuine event wakes on supporting architectures. Each kingdom has a finite ceiling of 2000 calls and 80000000 reserved ledger tokens: aggregate 48000 calls / 1920000000 reserved tokens. Each turn permits at most three calls and one action; input 32000 bytes, output 1536 tokens. These are ceilings, not predicted use or activity quotas. Actual input/output tokens remain separately metered.

Each launch draft currently has a provisional future deadline. Activation must bind every deadline to the approved common T1 = T0 + 86400000 ms and review the resulting digests. Do not use the preparation time as T0. The source run-window guard now supports an exact 24-hour interval and denies dispatch at its cutoff; this does not itself start or pause the game clock.

The fresh provider must publish a new authenticated cache profile. The staged proposal uses the qualified 57-block pool / 55 usable-block configuration; old provider instance metadata is not reusable. Fresh Windows/WSL clock qualification is required at actual launch, not an already expired preparation sample.

## Changes and verification

`CredentialBroker` now accepts an explicit constructor-only synthetic owner preparation option. Normal composition supplies no such option: runtime game access, OAuth reconnect, recovery and ordinary enrollment remain governed by their existing live-execution guards. Draft/paused cohort checks and exact pending social-policy command preservation remain intact. No deployment-wide enrollment toggle was added. `scripts/prepare-24h-roster.ts` prepares only a new roster and refuses an existing enrollment marker; interrupted owner setup requires separate inspection, never an automatic replay.

Verification: **37 isolated integration tests**, **24 focused unit tests**, full Fleet TypeScript check/server compilation, architecture ownership boundaries and changed-file style check passed (one pre-existing informational template-style suggestion). PACT package/API builds passed. New enrollment and 24-hour cutoff regressions were observed failing before the repairs and passing afterward. Fake providers were used for offline tests in a fresh owned test database, which was then stopped and retained.

Both baseline database dumps are AES-256-GCM encrypted with separate private keys. Network-disabled PostgreSQL restore verified complete rows in **167 PACT tables and 75 Fleet tables**. The temporary restore container was removed after verifying its ownership. Source/build input hashes cover 1126 PACT and 461 Fleet files; private evidence includes the exact preparation variant used and setup inspections. The final fresh-only roster helper differs from that retained interrupted-setup variant by refusing all resume paths.

Setup findings were resolved without resetting an identity: PostgreSQL's temporary initialization server caused the first readiness race (TCP readiness was then checked); the clock had already paused successfully when evidence JSON serialization hit a BigInt; paused-world admission correctly refused the first founding attempt. An existing-only authenticated read confirmed the original account had no kingdom and retained its exact entry key before setup continued. Owner founding then used only the new world's bounded admission window, with no rules worker; final sequence remained zero. The first owner readback exposed the omitted `PACT_AGENT_ACTION_EFFECTS_ENABLED=1` flag; that was corrected only in this instance and the owned API was restarted. All 24 final owner readbacks advertise events, outlook and action-effects tools. These were setup operations, not model trial retries.

## Remaining before activation

1. Implement and verify the real PACT coordination adapter for `specialist-coordinator@1`. Its manifest requires `coordination: true`, but the actual adapter has no coordination frames/protocol. The synthetic rehearsal supplies these itself. Removing the requirement or setting a capability flag without implementing the protocol would conceal the defect.
2. Qualify actual PACT workflows/interactions with a separately authorized bounded real-model canary. The synthetic grounding policy is environment-specific; its successful correction metrics cannot be transferred to real PACT. Existing real PACT proposal/wait validation remains in place, but equivalent end-to-end acceptance is outstanding.
3. Complete and verify the independent 24-hour observer/cutoff supervisor, including restart/clock failure, bounded queues, unknown usage and receipt preservation, admission closure, drain, owned-world pause and encrypted final restore. The prior `local-four` one-hour launcher is not compatible with this new instance and must not be used unchanged.
4. Once those gates pass, refresh source/clock/provider metadata, obtain approval for the concrete game-enabled package, and start the common 24-hour window. No activation approval is being requested for the currently blocked package.

E4/KQ1 remain blocked and unrun. Historical failed studies, unknown allocations, paused worlds and ordinary services are preserved. No commits or push were requested or performed.
