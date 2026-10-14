# Windows Nemotron ten-plus-ten fleets — 14 October 2026

Founder requested two new fleets on this machine, each with ten different fresh PACT accounts, one using only Nemotron 4B and the other using the same LLM with Laya alongside it. The follow-up explicitly selects **every five minutes until stopped**. Codex performed setup without delegation. Existing server Luna/Mac Nemotron groups and historical Windows experiments were not enrolled, reset, restarted or migrated.

## Exact setup and launch

Comparison **bd2dc914-5835-4df7-97e7-61ca7eb1102c**, **Windows Nemotron 10 vs 10**:

| Group | Cohort | Configuration |
| --- | --- | --- |
| LLM only | `7dca6082-698e-4bd3-9d10-dc742c2e004e` | Ollama Nemotron, basic controller notes/cache, no structured cognition |
| Cognition | `2ef30918-9e8a-4351-8c6c-adc0ea8d4764` | Same Ollama settings, `llm-centered-v1`, `laya-recall-v1` |

Both have ten independently authenticated accounts and kingdoms, paired identical strategy preferences, two agents per strategy family. Both transitioned to running through the authenticated origin/CSRF-protected paired endpoint in one transaction with exact shared anchor **2026-10-14T14:39:05.532Z /16:39:05.532 Berlin**. Corresponding ordinals share their thirty-second phase within each five-minute cycle. A single local worker serializes admission/inference; simultaneous cohort start does not mean twenty concurrent GPU calls. Late slots follow the existing skip/cooling rules rather than buying catch-up executions.

Shared model is **`nemotron-3-nano:4b`**, **4.0B Q4_K_M**, digest `6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197`, with supported **thinking true**, through Windows Ollama **0.35.1**. Native context 32K, maximum 2,000 generated tokens, immediate unloading, 24,000 input bytes, 40,000 reserved tokens per call, two calls/two actions per turn, concurrency one. Continuous allowance explicitly has no lifetime ceiling/deadline; each turn/call remains bounded and lifetime accounting is retained.

Normal synthetic mandates match: ten implemented read/message/contact/build/training/supply/scout/raid/transfer permissions, resource limits 600,000 internal units each, grain reserve 12,000, troop limit 1,000, session limit one. Social delegation is `agent_decides`. No synthetic-owner exception policy was added. Game ownership, stock, quotas, prerequisites, leases and human-only exceptions remain authoritative. Private observation is enabled for these owned synthetic accounts; correspondence/cognitive detail stays encrypted and follows existing thirty-day retention.

Laya is **selective recall ordering**, not a second gameplay authority or strategic action selector. Both candidate memories remain available and the LLM decides. It may abstain or fall back; actual acceptance/delivery is visible separately. This setup compares cognition plus optional recall against the basic controller. It cannot isolate Laya's causal effect from the added cognition, different kingdom creation times/world states or shared-world interactions.

## Local installation and recoverability

Protected root: `/home/mnim/.local/share/fleet/windows-nemotron-comparison-20261014` inside this machine's Ubuntu WSL instance, mode 0700. Independent env/vault/operator credentials, encrypted grant database, protected state/backup proofs, model files and pinned runtime **b6b68f2** remain outside Git. No server/Mac credentials or database rows were copied.

- Local PostgreSQL **17.8**, container `fleet-windows-comparison-db`, volume `fleet_windows_comparison_database`, loopback **5439**, 512 MiB/0.5 CPU, restart unless stopped.
- Native WSL Node **24.12.0** console/worker in per-user systemd `fleet-windows-console.service` and `fleet-windows-worker.service`; certified CPU helper `fleet-windows-laya.service`. Console: **http://127.0.0.1:8820/**; helper loopback 8832. Real Windows-to-WSL health read succeeded.
- Windows Ollama remains the local GPU model host. The launcher resolves this WSL instance's Windows gateway at each service start; no public model relay/listener was configured. Process-local IPv4 preference disables Node's failed address-family race while retaining HTTPS/certificate checks.
- User lingering and the hidden, at-logon Windows task **Fleet Nemotron Comparison Keepalive 20261014** keep the WSL instance active. Task state is Running. Docker is native WSL and enabled; all three services are enabled. Windows sleep/shutdown or unavailable Ollama/network can still interrupt work; no global power policy changed and no physical reboot/sleep acceptance is claimed.
- `operator-password.txt` contains only the new local console password, mode 0600. `fleet.env` additionally holds the vault/database configuration; protect it separately from dumps. Do not put either in Git or logs.

`backups/pre-launch.dump` was restored into a separate `fleet_restore` database on the disposable 5437 test container. **All complete rows of all 18 tables match**, including twenty original bindings, encrypted grants and paired configuration. Matching vault/env backups remain protected. Synthetic test/restore containers and their anonymous volumes were removed; the live 5439 volume remains. Never restore pre-launch data over appended gameplay or replay an uncertain command. Pause at a quiescent boundary; retain original commands, allocations and history; reconcile receipts, reconnect the same account and explicitly review new unknown usage when required. Stop is terminal; Pause preserves identities and counters.

## Model/helper and source acceptance

Source verification and additive five-minute/atomic-start behavior are recorded in [paired launch](paired-launch-20261014.md), commit **b6b68f2**, with **267 distinct unit/integration checks covered**, check/build/boundary/audit and zero production dependency vulnerabilities. No GitHub push or remote Fleet runtime deployment occurred.

Nemotron was downloaded on this Windows machine. Three bounded synthetic compatibility/diagnostic executions made zero game actions: an over-narrow custom schema returned unusable output with measured usage (46 input/11 output); a native JSON diagnostic succeeded (37/109); the actual Fleet decision schema with thinking enabled passed in **2.597 seconds** (46/74). The failed check remains protected evidence and was not counted as a scheduled turn. No Ollama upgrade or change to historical model tasks was needed.

Laya **0.4.6**, checkpoint revision **e929ae5cf69bc34259cd2f95c9e91145b818b1f0**, was downloaded with verified weight SHA-256 `4fa56de72383a9d3efa9cfa78955733c81b9fc8067a587ca4beb82c78107a24e`. Python 3.12 uses the locked dependencies with the matching **Torch 2.14.1+cpu** build; unused CUDA dependency downloads were cancelled before installation. Local frozen validation passes **18 accepted/18 correct/14 abstained of 32**, with 8/18 lexical baseline and zero accepted development errors. The checkpoint's existing 11+-choice temperature warning remains; this route uses two choices and makes no calibration claim. Certificate hash: `375c09206bddc4bcb4550199398fbfb96caa6602ff27e9a36bee2f8c1c8a0edc`. Two Python protocol/certificate tests and the actual HTTP `scripts/verify-recall.ts` suite pass with the same 18/18/14 result; no game or LLM call is used by recall verification.

## Game host recovery during setup

Enrollment initially encountered `WORLD_PAUSED`. Founder required the game to work. The game host's full disk caused `TICK_DELAYED`; a verified duplicate backup staging copy was released, all encrypted snapshots preserved during that recovery, and the normal world clock resumed without catch-up. A guarded backup script prevents another base copy from exhausting gameplay headroom. At that cutoff another backup required more capacity; no paid infrastructure was provisioned. A later independent host change removed the encrypted backup directory and masked the backup service, leaving 54 GiB free; this assignment did not perform that change or re-enable the service. [Exact PACT recovery, later state and source/deployment evidence](../../pact/docs/implementation/reports/world-storage-recovery-20261014.md). Enrollment retried its original persisted entry key; twenty distinct account/kingdom identities were verified before launch.

## Initial scheduled acceptance

At **14:41:11 UTC /16:41:11 Berlin**, both cohorts were running with all twenty agents/credentials ready. Four distinct agents per group had finished their first normal turn. LLM-only had seven reported calls and three committed actions; cognition had four reported calls and one currently reserved execution, zero commitments and four waits. No unknown usage or unresolved commands existed. Fresh cognition continuity reached the LLM; no Laya pair or cognitive revision had yet been accepted. These are partial-round execution facts, not proof of better intelligence or full twenty-agent throughput. Later full-round acceptance is appended after observation; normal five-minute scheduling continues afterward.

## Full-round acceptance

Fixed cutoff **14:45:35 UTC /16:45:35 Berlin**: every one of the **twenty original agents** completed a normal scheduled turn, both groups remain running with all agents/credentials ready, and model/allowance/strategy configuration still matches the original template. There are **26 finished turns** (13 per group), **37 reported executions**, **230,532 input +19,478 output =250,010 reported tokens**, **zero unknown/reserved executions** and **zero unresolved commands** at this snapshot. Conservative allocations remain separately recorded at 1,480,000 tokens, without refund or fabricated usage. The report is a fixed read-only observation; the next five-minute turns continue afterward.

| Group | Calls | Committed actions | Finished turn outcomes |
| --- | --- | --- | --- |
| LLM only | 22 | 9 | 6 COMMITTED, 3 INVALID_GAME_ACTION, 4 WAIT |
| Cognition/Laya | 15 | 2 | 1 COMMITTED, 1 FORBIDDEN, 11 WAIT |

No communication was observed in this window. Normal shape/permission refusals remain recorded and the agents continue under the same authority; no owner exception was granted to conceal them. Cognition continuity reached all ten agents and was delivered fifteen times. One source-grounded reflection was accepted, zero peer-belief revisions, one real Laya abstention and zero accepted/delivered Laya orderings. The helper remained healthy with zero unavailable telemetry. These are transport/accounting/continuity results and mixed early game decisions, not evidence of a winner, superior intelligence or Laya benefit.

Both console/helper health endpoints passed, all three source-pinned services have active PIDs (console 52045, worker 55523, helper 54060), and the Windows keepalive task is Running. Protected `state/first-round.json` retains this exact cutoff and `backups/first-round.dump` retains appended history. The earlier restore proof remains pre-launch evidence; no live database was restored or runtime restarted after launch. User can open the local console and pause either group individually; permanent Stop is terminal. Completed source and launch documentation are committed locally before handoff.
