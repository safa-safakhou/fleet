# Six-hour run inspection — 26 October 2026

Read-only inspection at `2026-10-26T08:51:46.232Z`. No restart, deployment, model call, game command, uncertainty review or usage reset was performed during this inspection. The requested six-hour window is over; the game remains paused.

The world ran **02:31:04–08:31:04 Berlin**. Admission closed at **08:31:04 Berlin** with `DEADLINE`, about141ms after the saved cutoff. Final clock is paused at tick359. All24 kingdoms participated. All runtime processes (API, console, Fleet worker, event publisher, rules, supervisor, guardian and model provider) are stopped; database storage remains available. There are zero running turns, capacity leases or pending/unknown game commands. No further run is authorized by this inspection.

## Observed activity

- **2430 turn attempts,207 committed action effects**. Native receipts total231, including24 owner-preparation receipts recorded before execution. Turn codes alone do not measure action success because some turns commit an action and subsequently return WAIT.
- **3071 model allocations:3062 reported and9 unknown**. Known usage is30,825,802 input plus3,480,102 output tokens = **34,305,904 reported tokens**. The9 unknowns each retain40000 reserved tokens (360000 total); these are not measured usage and must not be added to reported consumption as if known.
- **52 completed building upgrades**,24 waiting construction instructions. Every Hall remains level1; the highest observed level of each other building kind is2. Construction happened, but sustained higher-tier progression did not.
- **55 direct messages,3 accepted contact pairs,8 pending introductions**,19 supply offers (5 active,13 expired,1 open),5 supply contracts (4 active,1 defaulted). The agents did interact; these counts do not establish trade quality or delivered value.
- All3071 requests selected Nemotron4B, thinking enabled,8192 output cap and32768 context metadata.107 allocation responses recorded output truncation;7 turn outcomes ended as `MODEL_OUTPUT_TRUNCATED`. These are different denominators and include intermediate correction attempts.

| Architecture | Turn attempts | Committed actions |
|---|---:|---:|
| autonomous-specialists@1 | 1380 | 94 |
| legacy-cognition@1 | 72 | 0 |
| legacy-loop@1 | 72 | 5 |
| reactive-basic@1 | 288 | 37 |
| reactive-cognition@1 | 239 | 30 |
| reactive-cognition@1.1 | 118 | 21 |
| reactive-cognition@2 | 77 | 19 |
| specialist-coordinator@1 | 184 | 1 |

## Problems that remain

The run stayed available through the intended six hours, but it is **not a clean behavioral or reliability pass**. Major repeated outcomes:435 `SPECIALIST_CONTEXT_INCOMPLETE` and317 `SKILL_SELECTION_REQUIRES_READ` in autonomous specialists;172 `STALE_PROPOSAL` in coordinators. There were83 wait rejections (46 native factual mismatches,37 model-wait rejections), resource conflicts and other rejected proposals. Legacy cognition committed zero actions in72 attempts; coordinators committed only one in184 attempts. Exact counts follow; a normal READ is included for completeness, not classified as a failure.

| Turn code | Count |
|---|---:|
| CLAIM_FENCED | 1 |
| DEADLINE_MISSED | 5 |
| INVALID_READ_QUERY | 1 |
| MODEL_FEEDBACK_EXHAUSTED | 9 |
| MODEL_OUTPUT_TRUNCATED | 7 |
| MODEL_PROPOSAL_REJECTED | 10 |
| MODEL_WAIT_REJECTED | 37 |
| OBSERVED_BUILDING_LEVEL_MISMATCH | 2 |
| PACT_DUPLICATE_NEGOTIATION | 5 |
| PACT_SUPPLY_ZERO_FLOWS | 1 |
| PACT_TRADE_PERSPECTIVE_MISMATCH | 1 |
| PACT_WAIT_STATE_MISMATCH | 46 |
| READ | 53 |
| RESOURCE_CLAIM_CONFLICT | 21 |
| SKILL_SELECTION_REQUIRES_READ | 317 |
| SPECIALIST_CONTEXT_INCOMPLETE | 435 |
| STALE_PROPOSAL | 172 |
| TURN_CALL_LIMIT | 5 |
| WAIT | 1293 |
| WORKER_EXPIRED | 9 |

**Nine kingdoms are held:** C2, D1, E1, E2, E3, F2, F3, H1, H2. All have `WORKER_EXPIRED` terminal turns and one unknown allocation each. The first retained unknown allocation was created at02:15:24.749 UTC (03:15 Berlin), well before cutoff. Later unknown allocation creation spans through07:30:59.813 UTC. Thus these cannot all be attributed to the final shutdown. This inspection identifies timing and outcomes; it does not establish the underlying cause of each expiry or guess missing token usage. No old/new unknowns were cleared or retried.

**Shutdown bookkeeping is incomplete in the primary supervisor.** Its log ends with `SUPERVISOR_FAILED_CLOSED`, its record still says `draining`, and `evidence/run-final.json` is absent. The independent guardian recorded `DEADLINE`, completed the owned park/finalization, and final encrypted restore matched all167 PACT/77 Fleet tables. The game and all runtime processes are verified paused/stopped. Final recoverability passed; the stale primary record is not evidence of a running worker and must not be silently rewritten to suggest a clean primary shutdown. The original primary exception is not recorded beyond the generic error; further diagnosis is separate work.

## Preservation and evidence

The preceding old world remains archived with its original five unknown records. This fresh world, its nine new unknowns, exact task/command IDs, correspondence, budgets, identities and encrypted final snapshots remain retained privately. E4/KQ1 stay blocked.

Private root: `/home/mnim/.local/share/pact-fresh-canary-20261026-523b92de`. Read-only aggregate evidence: `evidence/morning-readout.json`, `evidence/independent-observer.ndjson`, `evidence/metrics-observer.ndjson`. Final artifacts: `window.json`, `supervisor.json`, `evidence/guardian-final.json`, `evidence/finalization-complete.json`, `evidence/final-restore.json` and encrypted final dumps. No credentials, grant material, message bodies or decrypted traces belong in Git.

Source checks/commit publication are recorded separately in current-state after verification. Passing offline tests does not resolve the live failures above. [Launch setup and early snapshot](fresh-six-hour-run-20261026.md).

## Publication verification

The owner requested committing and pushing all accumulated changes in both main repositories. Review stayed inline on master. Source publication does not restart or deploy the game/Fleet, clear the nine new unknowns, or claim the live failure modes are fixed.

Fleet checks:1,088 unit tests;42 selected native integration checks across7 files;160 other selected integration checks passed with one evidence-admission regression initially failing. That two-test file was rerun and both passed after the validation-order correction (203 distinct selected integration checks covered in total). Evidence shape/binding validation now preserves its specific correction code before the mandatory generic generation-contract check; successful evidence verification never bypasses that contract. Known usage still settles once, invalid evidence produces no command and no retry. The final unit suite/type/style/build checks were rerun after this correction. Boundary checks,2 CPU guardian tests,3 CPU cache-export tests, Python compile and C syntax checks pass. Style retains123 warnings/60 infos, without errors.

PACT checks:3 MCP descriptor unit tests,4 isolated native action-effect/MCP interface integration tests, typecheck, MCP package build, boundary/forbidden-import checks,26 unchanged published-contract schemas, changed-file formatting and whitespace checks pass. Three pre-existing non-null-assertion warnings remain in the integration fixture.

The broad Fleet integration invocation was interrupted before completion after reaching historical positive-protocol simulations with up-to-ten-minute allowances per case. It is **not** reported as a full integration-suite pass. Selected changed integration files ran against fresh owned disposable PostgreSQL fixtures with fake providers. No retained world or live inference was used by tests.

All227 Fleet candidate files and4 PACT candidate files were scanned against the known protected configuration values and private-key/token patterns; no findings. All273 local documentation links resolve. Ignored private runtime artifacts, keys, dumps and correspondence stay outside Git. Both remotes were fetched and local master matched origin/master before creating the requested commits; no force push, reset or alternate checkout is needed.
