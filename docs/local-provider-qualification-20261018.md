# Local provider qualification —18 October2026

## Scope and status

Founder authorizes Task1 harness implementation and Task2 Q1+Q2 within one104-execution/4160000-reserved-token allowance. This supersedes the previous planning-only restriction solely for these isolated local fixtures. No server contact, game reset, account enrollment, population, installation, push, recovery review or old-cohort resumption is included. The installed953034e release stays execution-disabled. Codex owns this work without delegation.

Source implementation and offline acceptance are complete; real-provider results will be recorded after the verified source commit. Qualification is not yet claimed.

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

Offline acceptance: `npm run check` passed (existing24 non-failing warnings/11 infos), `npm test`187/187, `npm run test:integration`335/335, `npm run test:acceptance`12/12 with explicit isolated PACT5438/root, `npm run build`, `npm run check:boundaries`, `npm audit`0 findings, and `git diff --check` passed. The first full integration attempt failed only the new fake cognition answer shape; after correcting its missing required cognition envelope, the full335-test rerun passed. Engine/baseline source bytes are unchanged. Author review checked dispatch/cap/crash/transport boundaries under the no-delegation requirement; independent review is not claimed. Real-provider outcome is pending below. Private logs/proofs are retained under `/home/mnim/.local/share/fleet-phase0-validation-20261017/local-qualification-20261018`. Installed baseline:38 retained non-ephemeral tables,20 needs_owner agents,10121 turns,40 original unknown allocations/1600000 tokens, zero running turns. Live flag and persistent service overrides remain0.
