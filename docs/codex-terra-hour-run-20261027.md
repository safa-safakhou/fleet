# Fresh Codex Terra one-hour experiment — 27 October 2026

**Partial model acceptance, completed world window.** The owner requested a fresh game/Fleet, Codex provider, GPT-Terra, at least roughly 256K context, and one hour of observation. All 24 kingdoms were created in a separate fresh world. The world completed its hour and is paused, but **successful inference stopped after about 24 minutes because the selected WSL Codex account exhausted its five-hour allowance**. This is not evidence of a successful full-hour model run.

## Scope, isolation and deployment

World: `pact-fresh-canary-20261027-6a87f53e`. Three kingdoms per eight architectures, same objectives, persona/strategy seed (`fresh-canary-20261026-6cb1c48d`) and 15-minute schedule as the previous Nemotron run. Event-driven profiles could wake between scheduled reviews. No forced messages or optimal-play policy. Old worlds, identities, unknown allocations and private evidence were preserved. E4/KQ1 remained blocked. Inline work, no delegation or GUI.

New run only: native Codex CLI `0.164.0-alpha.11.1`, exact selected model `gpt-6.1-terra`, reasoning effort `medium`, explicit model context **500000 tokens**, request allowance **1048576 bytes**, desired output **8192 tokens**. The installed model catalog advertises a 95% effective-context margin. The API's larger advertised model window was not substituted for this installed Codex metadata. The adapter disables shell/unified execution, web, apps and inherited instructions/config; it passes observations to a fresh ephemeral process in a private temporary directory with read-only sandboxing. Auth was copied into a private isolated native home, never committed.

Fleet concurrency remained 8; shared Codex execution capacity was **1**. Each kingdom had a 500-execution/600000000-token finite reservation allowance, 1200000 tokens reserved per execution, three calls and one action per turn. These are accounting/admission reservations, not actual consumed tokens or a provider-enforced spending cap. The ordinary 40000-token/64000-byte budget bounds remain in effect unless the new explicit Codex large-context/accounting opt-in is selected. Codex desired output is not a hard sampling cap, and its execution can include provider instructions/internal model work beyond the game prompt.

Source changes on Fleet master: validate the selected architecture's response contract through Codex, preserve legacy cognition compatibility and completed usage, expose explicit context metadata, guard larger budgets, and add the separately owned one-hour Codex profile. No PACT gameplay rules changed. Fleet source base `3801095a551215c09821ddbd0724259708ee1305`; runtime changes are **uncommitted**, identified by the private source-diff hash and full deployed manifest. Verified 452 deployed artifacts and 301 source files matched their SHA-256 manifests. No new commit or push was requested or performed for this assignment.

## Verification before activation

- Full unit suite: 209 files / 1120 tests passed before the final legacy-compatibility correction; the affected Codex suite then passed all 22 tests.
- Five initial focused suites: 61 tests passed. Complete native PACT workflow matrix: all eight architectures through HTTP fixtures and the real Codex subprocess adapter with a fake executable, 48 scenarios plus the construction-completion chain. Codex accounting/process integration: 14 tests passed after fixing the compatibility regression (63 integration tests in total across the two suites).
- Type/lint check, build and architecture boundaries passed. Lint still reports the existing 140 warnings and 60 informational diagnostics; no errors. Diff whitespace check passed.
- Fresh 301-sample five-minute host clock check passed (wall/monotonic rate error approximately 0.00045%); no clock changes.
- One game-free real Terra probe passed in approximately 6.8 seconds: valid requested object, 10709 input / 24 output tokens. This did not validate an hour of subscription capacity.
- Baseline encrypted backup/restore matched 167 PACT / 77 Fleet tables before admission.

## Timeline and provider failure

World window: **2026-10-27T09:36:47.805000+00:00 → 2026-10-27T10:36:47.805000+00:00**, or **10:36:47–11:36:47 Berlin**. Admission closed after **3600.010 seconds**, reason `HOST_DEADLINE`. Final clock paused at tick **59**.

First reservation: 09:36:50.117 UTC. Last successfully reported response: **10:01:00.199 UTC** (about 24m12s after world start). Rapid process failures then spread across unrelated architectures. The existing adapter discarded raw provider failure detail and exposed fixed process/unknown-usage codes. A read-only `account/rateLimits/read` request using the **actual isolated WSL provider login** confirmed `ordinaryUsageAllowed=false`, `rate_limit_reached`, five-hour allowance 100% used, weekly allowance 28%, no paid credits, and reset at **13:10:12 Berlin**. The native login was a Plus account and differed from the desktop app's signed-in account; desktop usage status was therefore not evidence about Fleet's allowance. No account/model fallback, quota reset or credit purchase occurred. Starting account usage was not captured, so this run cannot be said to have consumed an otherwise unused complete five-hour allowance. Preflight verified native login/model access but did not confirm the intended account identity or record its starting quota; this was a validation gap.

The owned Fleet worker was stopped at **10:05:06 UTC** after diagnosing the provider limit. This prevented further dispatch without clearing holds. The rules worker/event publisher and world continued to the original one-hour cutoff. **The remainder is passive world progression, not additional model qualification.**

## Results

- 182 turn/task attempts; **212 completed model executions**, reporting **7601217 input / 42754 output tokens**. These aggregate CLI token counts include cached input; they are not a billing estimate.
- 14 executions retain unknown usage and their reservations; three reservations were never dispatched. Zero calls remain in flight.
- **85 committed actions**, across **23 of 24 kingdoms** and all eight architectures. One coordinator kingdom committed no action during the model-active period.
- **55 completed building upgrades**: 20 farms, 16 mines, 10 markets and 9 barracks reached level 2. No training, supply offers or supply contracts were observed. The 85 actions comprise 55 building orders, 13 contact requests, 7 acceptances and 10 messages.
- **7 accepted contacts, 6 pending requests, 10 agent messages, 2 reciprocal messaging pairs**. Four kingdoms authored messages. These are native PACT counts, not an assumption that Fleet's communication-ingestion field captures every message.
- 81 finished waits with no action. Most were autonomous-specialist attempts; a `WAIT` terminal code alone is not inactivity: 83 committed actions occurred in turns that later finished with `WAIT`.

| Architecture | Attempts | Reported executions | Kingdoms acting | Actions | No-action waits | Unknown executions |
|---|---:|---:|---:|---:|---:|---:|
| autonomous-specialists@1 | 92 | 113 | 3/3 | 27 | 63 | 2 |
| legacy-cognition@1 | 6 | 12 | 3/3 | 6 | 0 | 0 |
| legacy-loop@1 | 6 | 12 | 3/3 | 6 | 0 | 0 |
| reactive-basic@1 | 16 | 13 | 3/3 | 10 | 3 | 2 |
| reactive-cognition@1 | 16 | 13 | 3/3 | 10 | 3 | 3 |
| reactive-cognition@1.1 | 12 | 9 | 3/3 | 9 | 0 | 3 |
| reactive-cognition@2 | 22 | 23 | 3/3 | 14 | 6 | 2 |
| specialist-coordinator@1 | 12 | 17 | 2/3 | 3 | 6 | 2 |

Comparison with the [previous Nemotron half-hour run](fresh-half-hour-run-20261026.md):

| Metric | Nemotron, 30-minute run | Terra checkpoint at 30m26s |
|---|---:|---:|
| Reported executions | 250 | 212 |
| Committed actions | 68 | 85 |
| Completed upgrades | 32 | 54 |
| Accepted contacts | 1 | 7 |
| Messages | 3 | 10 |
| Reciprocal pairs | 0 | 2 |
| Unknown executions | 0 | 14 |

This suggests more productive construction and social behavior in the observed Terra segment. It is **not a controlled model-only accuracy comparison**: provider, request/context allowances, reasoning implementation and concurrency also changed, identities/world placement are fresh, the observation checkpoint differs by 26 seconds, and Terra inference ended early. No trade contracts were attempted, so zero trade failures do not demonstrate trade competence. These results do not establish sustained autonomous society behavior.

## Failure categories and evidence

1. **Subscription availability:** 12 `CODEX_PROCESS_FAILED` and two `USAGE_UNKNOWN` outcomes left 14 actors `needs_owner`. Explicit authenticated quota status establishes the shared provider unavailability; individual rejected executions lack reported usage, so their tokens were not invented as zero. The adapter's opaque error classification delayed diagnosing a provider-wide problem. A later improvement should retain safe structured provider error classifications and stop further admission on an explicit account-wide quota rejection, preserving uncertain accounting.
2. **Queue/deadline interaction:** two `CLAIM_FENCED` turns waited for a third execution until the existing two-minute turn deadline. Both had already committed an action; their final reservations were not dispatched. For the first, calls completed after 26.8s and 47.1s admission waits, then its queued third call was cancelled one second before the turn deadline. One execution slot and eight active workers can exhaust a multi-step turn's deadline even when individual responses are fast. No deadline/concurrency settings were changed mid-run.
3. **Coordinator evidence refresh:** one `COORDINATION_EVIDENCE_UNAVAILABLE` contact-request proposal. All five cited references were present in the model's delivered focused input; initial bounded grounding accepted it on the first attempt. The later refresh guard rejected it. A synthetic, model-free reproduction showed the same code when an unchanged native revision key receives changed evidence references and replaces the earlier snapshot; changing the native revision retained the old snapshot and accepted refresh. This establishes an implementation edge case, **not proof that it was the exact live trigger**; the retained live trace lacks the final internal snapshots. Do not label these delivered references as invented model IDs.
4. **Operator shutdown:** one `CODEX_CANCELLED` turn during the worker stop, with a not-dispatched reservation. It is not another model-quality failure.

Completed responses recorded **zero schema/inner-contract errors**. This is narrower than proving every strategy or game decision was correct. Provider reasoning, finish-reason and truncation metadata are unavailable through this adapter; zero recorded `length` finishes must not be represented as verified zero truncation. Configured medium reasoning is distinct from the vLLM `thinking` boolean, which is null here.

## Context and queueing

| Architecture | Max request bytes | Max byte allowance use | Max reported input tokens/execution | Max output tokens | Mean queue ms |
|---|---:|---:|---:|---:|---:|
| autonomous-specialists@1 | 136528 | 13.02% | 53039 | 312 | 17013 |
| legacy-cognition@1 | 68317 | 6.52% | 28973 | 274 | 39607 |
| legacy-loop@1 | 59225 | 5.65% | 26326 | 183 | 34016 |
| reactive-basic@1 | 140644 | 13.41% | 51028 | 222 | 20618 |
| reactive-cognition@1 | 151790 | 14.48% | 56220 | 206 | 31108 |
| reactive-cognition@1.1 | 156162 | 14.89% | 56890 | 216 | 31923 |
| reactive-cognition@2 | 130863 | 12.48% | 49140 | 282 | 28117 |
| specialist-coordinator@1 | 116232 | 11.08% | 48129 | 968 | 33579 |

Maximum request size **156162 bytes**, 14.89% of the 1 MiB allowance. Maximum reported input **56890 tokens**; no context-packing rejection occurred. The run selected a 500K window but **did not stress-test a 256K+ token prompt**. CLI reported input can aggregate internal work and is not an exact context-occupancy trace. Missing omission metadata is not evidence that every possible observation was delivered. Maximum recorded admission wait **56.307 seconds**. Current timing fields include queueing for legacy calls and exclude it for modern calls, so their raw elapsed means are not directly comparable. Native Codex executions typically took about 6–8 seconds including CLI overhead, before quota exhaustion.

## Shutdown and follow-up boundary

Final world/cohorts paused; final in-flight turns, reserved executions, pending commands and capacity leases are checked in the private final evidence. Unknown allocations and original commands remain preserved. All owned execution services and isolated Codex descendants are stopped. Final encrypted restore verification matched **167 PACT / 77 Fleet tables**. The old retained worlds were not reset or resumed.

A full model-active hour remains **unverified**. Before another run: confirm the intended provider account and its current allowance without changing accounts to bypass limits; wait for legitimate allowance renewal or explicitly choose a funded supported provider arrangement, and address the queue/deadline and coordinator-refresh findings. No automatic rerun or recovery is authorized by this report.

Private evidence root: `/home/mnim/.local/share/pact-fresh-canary-20261027-6a87f53e`. Key evidence: `deployment.json`, `provider/model-metadata.json`, `provider/readiness.json`, `clock-control.json`, `window.json`, `evidence/observer.ndjson`, `evidence/thirty-minute-checkpoint.json`, `evidence/provider-usage-status.json`, `evidence/provider-admission-stop.json`, `evidence/coordinator-reference-check.json`, `evidence/coordinator-snapshot-probe-result.json`, final aggregate, shutdown and restore proofs. Auth caches, raw prompts/messages, decrypted traces, grants and dumps remain private and outside Git.
