# Existing Fleet deployment acceptance — 15 October 2026

The founder authorized deploying the verified changes to the existing server and Windows/WSL installations, preserving accounts, history, budgets and schedules and starting no new model experiments. Mac is unavailable and explicitly excluded. Software installation and local scheduled-turn acceptance are complete; the already-paused server cohort is still paused. No unknown-usage review, reconnect, cancellation/replay, enrollment, permission/economy change, provider migration or push was performed.

## Exact installed releases

| Target | Runtime/source | State |
| --- | --- | --- |
| PACT API, rules, seals, inference, notification, channel | `pact-runtime:agent-reliability-20261015-1`, source `385f9fc079b7529f274c0a593c5278c91f5fa1ac` | Running; health/readiness 200; clock advances |
| Server Fleet console + worker | `fleet:9fe70e2d096f209ea73b308789f69d80f23019e0`, `/opt/fleet/current` points to that immutable release | Healthy; existing Luna50 remains paused |
| Windows/WSL console + worker | Native immutable `releases/9fe70e2d096f209ea73b308789f69d80f23019e0` | Both original ten-account cohorts running |

The successor includes eae8ab1's populated-context repair and 9fe70e2's peer-review admission index. Runtime image labels match their pinned source. The Fleet transfer bundle SHA-256 is `174389e1b6b3c02a3270573ad229cdcdf4afedfb4b959f7365cda2dee72c793c`. Laya's existing service/runtime was untouched. PostgreSQL, gateway (`pact-gateway:admin-password-20261014-1`) and public edge were not recreated. Optional A2A remains off in the actual API interface readback; gateway SPA responses at `/a2a` are not enabled protocol evidence. Archive mode remains off and the backup timer/service remain masked/inactive under the existing policy.

## Preservation and recoverability

The server retains all 60 agent rows: current50, finished pilot5 and draft5, with 10,745 original turns and all original account/kingdom bindings, strategies, schedules, allocations and records. Column-level preservation verified the older schema across additive migrations; later Fleet switches matched every one of the 18 non-heartbeat table fingerprints. The finished pilot's existing pending SLOT_BUSY command is separate from the current50 and was preserved. No terminal/draft cohort was resumed.

The Windows/WSL initial 4,103-turn history survived migration011's encrypted decision state, followed by every later ordinary/failed turn. The final natural-drain boundary preserved all **4,447** turns and all 19 tables (ephemeral heartbeats excluded from equality), before and after switching. No active call was cancelled. Both cohorts retain Nemotron `nemotron-3-nano:4b`, thinking true, their original 24,000-byte input/2,000-token output/40,000-token allocation, two decisions/actions per turn, concurrency1, and exact five-minute anchor **2026-10-14T14:39:05.532Z**. Bindings, guidance, consumed counters, due slots, credential state and stored memory were preserved; only maintenance pause/fences and normal subsequent execution changed state. Both cohorts were restored from their original running authorization, including the cognition-only safety pause.

The actual production game dump and both Fleet dumps were restored into isolated databases before migration. Game client/grant/lease and identity/mandate fingerprints stayed equal. Two existing pending optional-A2A constraint migrations were rehearsed on the restored game copy, then applied without enabling A2A. Fleet migrations were additive; no old history was reset. The latest quiescent local dump was saved in the existing encrypted repository as `6f95ffadc9bc4088330544841424c2aded81f58c0a80663026e1110b032e95aa` and restored with an identical checksum. Rollback keeps additive tables and the newest ledgers/grants/game effects; never restore an old database over subsequent transactions or replace rotated credentials with an older binary's state. Assignment-owned restore/test containers and networks were removed; encrypted rollback artifacts remain protected outside Git.

## Verification and observed local execution

PACT source acceptance passed 384 unit / 424 integration tests plus one existing optional live-provider skip; full build/type/lint/boundary/build-order and all 26 frozen v1 schemas passed. Final Fleet passes **144 unit / 202 integration** tests, type/lint/build and game-independent boundaries. The separate forced-paging regression passes after verifying that peer review metadata survives removal of subjective belief prose. Three-round first/second/later-decision fixtures retain exact core facts, social readiness, requested executable schemas, failure/command history, source provenance and accepted recall pairs.

The all-ten-account read-only preflight passed **100/100** cases: both decisions including the intervening controller read record, helper abstention, both provisional choices and both already-accepted choices. All 80 selected-pair cases retained the pair; no provisional deferral was needed. Maximum fitted input was 23999 bytes, minimum remaining margin 1 byte; optional pages fill spare capacity, so this is not a reserved future-growth guarantee. The earlier 23,000-byte probe is diagnostic, not the unchanged 24,000-byte acceptance gate. These replays made zero real provider/helper calls, credential operations, game writes or acknowledgments.

Ordinary original-schedule observation after the final resume at **2026-10-15T10:36:52.403400+00:00**, through **2026-10-15T10:45:18.151Z**:

| Cohort | Accounts with completed turns | Minimum completed turns/account | Recorded model calls | Committed actions | Observed turn groups |
| --- | ---: | ---: | ---: | ---: | --- |
| LLM only | 10/10 | 2 | 34 | 0 | 1 finished/INVALID_COMMAND, 3 finished/INVALID_MODEL_OUTPUT, 6 finished/OBSERVED_BUILDING_BUSY, 11 finished/WAIT, 1 in progress |
| Cognition + Laya | 10/10 | 2 | 25 | 0 | 22 finished/WAIT |

[Per-account coverage](agent-reliability-deployment-coverage-20261015.json) records all twenty ordinals without account identifiers or private text. Every account completed at least two turns. The window has **zero CONTEXT_LIMIT**, unknown allocations or pending commands. Recorded non-commit error/deferral events are `{"INVALID_COMMAND": 1, "INVALID_MODEL_OUTPUT": 10, "OBSERVED_BUILDING_BUSY": 13, "OBSERVED_MANDATE_VERSION_MISMATCH": 1}`. These are event counts, not unique turns. Validation still rejects malformed model output, stale authority proposals and occupied-building proposals; ordinary two-decision recovery may succeed or finish with a known error. Known failed decisions remain history and were not converted to success. The earlier live peer-evidence duplication bug is fixed by the review index; a duplicate review cannot become a new saved belief merely because prose was paged. No platform refusal or permission gate was bypassed.

## Remaining limits

The server50 retains Luna/codex-cli/medium, fifteen-minute anchor **2026-10-12T13:20:56.733Z**, and all three full 40,000-token unknown allocations. The older Agent32/36 cases were previously reviewed and are not being reopened. The newest **Agent27 timeout at 2026-10-15T04:43:46.738Z** still needs its own exact review before server resumption; Agent17's REFRESH_UNCERTAIN needs separately authorized same-account recovery. No Luna generation or progression acceptance is claimed while this cohort is paused.

Passing source tests, byte fitting and scheduled execution does not certify strategic intelligence, communication incentives, new provider settings or higher-Hall success. Malformed-output/semantic proposal errors remain observable under the unchanged model configuration. Existing authority/economic constraints and unsupported autonomous political mechanics were not relaxed. Provider qualification and the planned independent behavior/economy study remain separate, unexecuted gates; original cohorts are not pooled causal samples. The saved investigation/source reports remain historical evidence, with this report providing the subsequent actual deployment state.
