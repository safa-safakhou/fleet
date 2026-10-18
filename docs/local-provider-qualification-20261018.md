# Local provider qualification —18 October2026

## Scope and status

Founder authorizes Task1 harness implementation and Task2 Q1+Q2 within one104-execution/4160000-reserved-token allowance. This supersedes the previous planning-only restriction solely for these isolated local fixtures. No server contact, game reset, account enrollment, population, installation, push, recovery review or old-cohort resumption is included. The installed953034e release stays execution-disabled. Codex owns this work without delegation.

Source implementation/offline acceptance are complete. **Real qualification failed at Q1 and remains blocked; Q2 did not start.** The failed execution is preserved, not restarted.

## Harness

`src/qualification-run.ts` validates an immutable approved plan and manages an isolated durable ledger. Only loopback5436/fleet_qualification is accepted; installed5439 and normal test5437 databases are rejected. A unique authorization reference cannot receive a replacement run. Stage transitions cannot be restarted. Every provider attempt reserves40000 before dispatch, with global104, Q1eight, Q2twenty-four/profile and two/trial ceilings. One PostgreSQL session lock permits one inference across harness instances. Stage deadlines,90s call signals and120s shipped-engine turns apply. Unknown usage, overrun and unresolved dispatch prevent further work; allocations are never refunded or rewritten as measured tokens.

Requests, raw responses, usage, validation, latency and helper details are AES-GCM encrypted with row-bound AAD. Safe summaries distinguish reserved from reported usage, incomplete/failed trials and known invalid output. The database/key/private manifests remain outside Git. Helper calls reserve separately before dispatch,≤48 at≤3s; abstention/errors use the shipped fallback and remain recorded.

`src/games/pact/qualification.ts` supplies frozen PACT-shaped facts through in-memory ports. It imports no HTTP client, game credentials or account registration. The original LegacyEngineBridge, ReactiveEngine and ContinuityEngine perform their ordinary decisions/admission/schema checks. Synthetic fixture identities exist only in the qualification database. Every reaching command receives an explicit withheld/rejected result, never fabricated commitment; full proposed actions remain in encrypted engine traces. No scheduler or installed worker is launched.

Six scenarios (prerequisites, threat/help, multiple simultaneous changes, scarcity/trade, hostile peer instructions, stale receipt uncertainty) run twice for each of four profiles. Waiting, refusal and communication remain optional. These are bounded provider/engine fixture checks, not realistic outcome comparisons or live PACT certification. The observations are frozen and do not prove event ordering, long-lived memory evolution, rollback, game rules or real-game throughput.

Reactive cognition currently consumes retained evidence without using Laya selection. The harness preserves that shipped behavior; only legacy cognition exercises the existing Laya path. Two synthetic retained episodes create a selection opportunity, without importing old private memories. No new cognition behavior is implemented to alter qualification results.

## Operator interface

`npx tsx scripts/qualify-provider.ts /protected/approved-plan.json` is review-only: no database, metadata fetch or inference. Real dispatch requires `--execute-approved`, a clean checkout matching the exact source SHA, a private0600 plan/key and0700 evidence directory, and explicit `FLEET_QUALIFICATION_DATABASE_URL`, `FLEET_QUALIFICATION_KEY_FILE`, `FLEET_QUALIFICATION_EVIDENCE_DIR`. It never loads the installed fleet.env. Model digest6cc467f0…386197, Ollama0.35.1 and existing Laya0.4.6/revision/certificate are verified through metadata GETs before the one-shot runner. No generation probe bypasses accounting.

Q1 runs≤8 calibration calls in15min. Only all-valid, known-usage Q1 proceeds to Q2, whose48 trials use≤96 calls/4h. The common parent window is≤255min. Completion is separate from passing: Q2_done with invalid outputs, zero-call or failed trials does not pass. The same authorization cannot restart after interruption, failure or exhaustion. Any later recovery/extra allowance needs a separate explicit decision.

## Offline evidence

Test-first red collection failures preceded each new module; an additional real red assertion exposed orphan dispatched reservations admitting further work, now blocked. Tests cover immutable approval/settings/source, forbidden database/endpoint routes, concurrency, all104 reservations, Q1/profile/trial/helper caps, aborted/expired inputs, known malformed outputs, usage overrun, unknown retention, ciphertext binding, and all48 trials through the four shipped engines. A mocked global fetch rejects network access throughout the four-engine fake-provider test.

Offline acceptance: `npm run check` passed (existing24 non-failing warnings/11 infos), `npm test`187/187, `npm run test:integration`335/335, `npm run test:acceptance`12/12 with explicit isolated PACT5438/root, `npm run build`, `npm run check:boundaries`, `npm audit`0 findings, and `git diff --check` passed. The first full integration attempt failed only the new fake cognition answer shape; after correcting its missing required cognition envelope, the full335-test rerun passed. Engine/baseline source bytes are unchanged. Author review checked dispatch/cap/crash/transport boundaries under the no-delegation requirement; independent review is not claimed. Real-provider outcome follows. Private logs/proofs are retained under `/home/mnim/.local/share/fleet-phase0-validation-20261017/local-qualification-20261018`. Installed baseline:38 retained non-ephemeral tables,20 needs_owner agents,10121 turns,40 original unknown allocations/1600000 tokens, zero running turns. Live flag and persistent service overrides remain0.

## Real-provider result: failed Q1, stopped

Executed the pinned harness commit `d0b49b0e628eaaca8bf357077687dab8a5e0cde7`, run `f8facc31-f95a-40cc-a40d-4bb526efbb6a`, immutable plan digest `4bde77b32eb1a87fab0ba93bf1ce0782fac8824e3ee9cb978797abd91db2db62`. Approved parent window09:37:17.814–13:52:17.814UTC (11:37:17.814–15:52:17.814 Berlin),18 October2026. Execution ended around09:37:37UTC, well within its15-minute Q1 limit. One named operator/monitor: Codex.

| Observation | Actual result |
| --- | --- |
| Provider pin | Existing Windows Ollama0.35.1; Nemotron4B/Q4_K_M exact6cc467f0…386197 digest; thinking=true,32768 context,2000 output setting,keep_alive=0 |
| Q1 |2/8 executions: first valid; second empty final content → INVALID_MODEL_OUTPUT → QUALIFICATION_CALIBRATION_FAILED |
| Reservation |2×40000=80000 of4160000 authorized; original reservation rows retained |
| Reported usage |136 input+266 output=402 total; first68/222, second68/44 |
| Timing |First5377ms, second2971ms end-to-end, including loading/transport |
| Uncertainty |0 unknown,0 unresolved prepared/dispatched rows |
| Q2 / helpers |0/48 trials,0 helper calls; no four-engine real-provider qualification claim |
| Final disposition |Durably blocked, passed=false;102 execution slots/4080000 tokens remain unused and are not a restart grant |

The second model execution returned an empty final output string despite44 reported output tokens. The adapter retained that known usage and classified the missing JSON correctly. The retained response does not establish why content was empty; no sampling change, thinking toggle, parser workaround, hidden generation probe or model substitution was attempted. This is a real provider-path failure, not proof that game strategy or any engine architecture failed. Q2 gating prevented broader inference. A subsequent attempt requires an explicit correction/review and covering authorization; this run/source/configuration is immutable and must not be reset.

## Preservation and retained evidence

After execution, all38 retained non-ephemeral installed-table fingerprints exactly matched both the immediate preflight and prior planning handoff. Installed953034e, original20 needs_owner agents,10121 turns,40 unknown allocations/1600000 tokens and0 pending/running/reserved commands/turns remain. Final loopback health200/liveEnabled=false and readiness503/LIVE_DISABLED passed. Primary FLEET_LIVE_ENABLED=0 and both persistent service Env0 overrides remain; console/worker/helper services were not restarted. Event/outlook/coordination flags and accounts/authority/economy/models/budgets/anchors/history remain unchanged. Server Fleet and the game host were never contacted, and no game account or population was started/reset.

Ollama was initially absent. Started only its existing executable hidden with the retained process settings OLLAMA_HOST=0.0.0.0:11434 and OLLAMA_VULKAN=true; restored the launching shell's original environment immediately. Metadata GETs confirmed the exact existing model and original Laya revision/certificate; no download/autostart/registry/power change occurred. Every generation call used the ledger. keep_alive=0 unloaded all models after execution. Stopped only the owned provider PID after verifying identity/no loaded models, restoring its initial absent state. Owned qualification5436 and PACT acceptance5438 containers are stopped; preserved volumes are retained.

Raw requests/responses/validation/latency and engine evidence remain encrypted. A9,564,701-byte PostgreSQL custom archive was encrypted/authenticated in memory, decrypted bytes matched SHA256 `6d7696972360fcfd1d7cc9c559d86f6fd591052f5e8296ab02407c1796da3658`, and pg_restore read all258 TOC entries including qualification tables. This is archive authentication/readability, not a full restore rehearsal. The first TOC check encountered EPIPE because pg_restore exited0 after consuming only its header; a readback of the existing sealed archive confirmed successful TOC without taking/replacing another dump. Temporary decrypted inspection was re-encrypted/authenticated and removed. Separate0600 key storage is outside the artifact directory; no private evidence/key is committed.

Private result/plan/preflight/encrypted artifacts are in `local-qualification-20261018/run-f8facc31-f95a-40cc-a40d-4bb526efbb6a/` beneath the evidence root above; separate keys in its sibling `keys/`. Preserve them and the stopped owned database. No new provider calls were made during diagnosis, backup or verification.

Task1 is complete; Task2 is blocked by the actual Q1 provider result. Renewable windows/world identity/enrollment/Luna qualification/shadow/population Tasks3–6 remain unimplemented/unapproved. The next useful step is an offline provider-output investigation and a narrowly budgeted correction proposal, not population launch.
