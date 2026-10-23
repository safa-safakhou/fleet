# Schema loop and pending request repair implementation plan

> **For agentic workers:** Implement inline with superpowers:executing-plans. Do not delegate. Implementation authorized on 2026-10-23 with a 30-minute limit and offline checks only. This document does not authorize model trials.

**Goal:** Make schema retrieval produce usable progress and make an existing incoming contact request distinguishable from a new introduction, without expanding agent authority.

**Architecture:** Keep read metadata separate from game observations, but retain version-scoped metadata through a specialist turn. Derive social choices and their explanations from current canonical requests and delegation. Preserve authoritative native validation; never choose acceptance on the owner's behalf.

**Tech stack:** Node 24, TypeScript, Vitest, existing Fleet environment ports and native PACT contracts.

**Spec:** The user's 2026-10-23 assignment: diagnose repeated schema lookup and unanswered requests, provide a bounded plan before more trials, work inline, keep game execution disabled and E4/KQ1 blocked, and use only Nemotron 4B locally. Existing authorization and provenance contracts remain binding.

## Verified diagnosis

Read-only inspection used current source and all 21 encrypted response requests from the stopped RC30 batch. No model inference, game command, database startup, service restart or new candidate was used. Only structural summaries were extracted; private prompts remain outside Git.

- The 21 decisions comprise 13 schema lookups, six continuity/coordination reads and two proposed contact requests. Four lookups requested the same tool whose retrieved contract was already in that packet. Two continuity reads were made with a retrieved contract present.
- Schema arguments were **present**: the retrieved world-read query guide included required `forecastMinutes` and its bounds. Missing argument delivery alone does not explain these loops. The short instruction nevertheless continues to say fields need lookup, without saying that the displayed retrieved contract satisfies that prerequisite.
- In `src/engines/autonomous-specialists/engine.ts`, `retrievedReadTool` is local to `run`. A metadata lookup changes it but adds no explicit lookup-result/history entry. Every ordinary read clears it, including continuity-only reads. In `src/games/pact/read-queries.ts`, the lookup branch still allows the already retrieved tool. Thus metadata → metadata and metadata → continuity → metadata remain legal ways to consume the turn's call budget. At budget exhaustion the engine waits for an event, without a final decision or an explicit no-progress result. The next run starts with no retrieved schema.
- The receiving diplomacy packet contained a pending **incoming** ContactRequest, `agent_decides` delegation and an advertised `game.contact.answer` branch. The model instead selected `game.contact.request` targeting that same request's sender. This is not evidence that the answer action or delegation was missing.
- `src/games/pact/adapter.ts` removes request rows from the compact `contactRequests` array when represented in `socialAttention`. Therefore `contactRequests: []` in this packet does not mean no request exists. `src/games/pact/choices.ts` deliberately excludes accepted contacts from introduction targets but leaves pending peers eligible. Current social meaning explains pending versus accepted, but does not explicitly map incoming pending requests to answering and outgoing pending requests to waiting. The packet consequently advertises a redundant introduction alongside the valid answer.
- Existing scripted schema integration tests supply the intended next decision themselves. They verify grammar/admission, not a model's progress; they even assert that repeated metadata lookup remains admissible after retrieval. Such tests could pass while the observed loop continued.

The established root cause is a **progress and action-selection contract gap**, amplified by the observed model choices. This evidence does not establish why the model internally preferred those choices, nor that Nemotron will behave better. RC30 used a different model; its behavior is not Nemotron qualification evidence.

## Global constraints

- No new candidate, model calls, real qualification or game execution during this diagnostic assignment.
- E4/KQ1 stay blocked. Preserve all closed grants, retained worlds, unknown commands, queues, budgets, clocks, identities and evidence.
- Local inference, if subsequently authorized, uses only `nemotron-3-nano:4b`, installed digest `6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197` (catalog reports 4.0B). No fallback to another model or platform. Do not rewrite historical profiles or receipts.
- Proposed implementation is source plus synthetic tests only, inline on Fleet master. No PACT rules change is needed by the present diagnosis.
- Implementation budget: at most 30 minutes, two code tasks and one offline verification task. Stop and report remaining failures if the limit is reached. Do not start another candidate iteration automatically.

## Review focus

Cover catalog changes, metadata versus observation freshness, manual/allowlist delegation, outgoing/expired requests and incomplete pages. Missing facts remain unknown; a clearer interface must not grant permission or force acceptance.

### Task 1: Make schema retrieval a bounded progression

**Files:** `src/engines/autonomous-specialists/engine.ts`, `src/games/pact/read-queries.ts`, `tests/unit/pact-read-query.test.ts`, `tests/integration/autonomous-specialist-engine.test.ts`.

- [x] Add failing synthetic tests for lookup → actual read → final decision within the existing three-call fixture; lookup → continuity must retain the known contract; repeat lookup must not silently spend the remaining calls.
- [x] Retain retrieved metadata across continuity and ordinary observations within the turn when the catalog contract is unchanged. Invalidate on a changed/removed contract. Do not introduce a global cache or treat metadata as fresh game evidence.
- [x] Explicitly identify the retrieved contract as the lookup result and clarify that its displayed arguments are now usable. Suppress the identical lookup while that contract remains known; retain other legitimate lookups and refresh paths.
- [x] Make exhausted read-only turns report a machine-readable no-progress reason through existing diagnostic facilities. Do not auto-select an action, increase budgets or synthesize a successful final decision.
- [x] Run the affected tests, including catalog invalidation, authorization, unchanged game clock and no persistent update on metadata retrieval. Review the diff before committing when requested.

### Task 2: Make pending contact handling coherent

**Files:** `src/games/pact/choices.ts`, `src/games/pact/observation-semantics.ts`, `src/games/pact/adapter.ts` only if necessary, `tests/unit/pact-interaction-choices.test.ts`, `tests/unit/pact-contact-meaning.test.ts`, `tests/unit/social-attention.test.ts`.

- [x] Add a failing synthetic receiver fixture matching the structural contradiction: empty deduplicated flat request array, pending incoming request in social attention, permitted delegation, answerable request and redundant introduction offered to the same peer.
- [x] Derive introduction exclusions from positively observed, current pending incoming/outgoing requests as well as accepted contacts. Preserve discovery and unrelated targets; missing or incomplete pages do not prove acceptance or rejection.
- [x] Explain the canonical location of deduplicated requests. State that incoming pending requests may be accepted/declined only under current delegation, and that outgoing requests await a response. Keep the decision with the agent; never force acceptance or invent message permission.
- [x] Test that the answer branch contains the actual observed request ID, while reciprocal/duplicate introduction is absent for that peer. Test manual delegation, allowlist denial, outgoing requests, expiry, stale references and malicious peer text without broadening authority.
- [x] Run affected tests and review the diff before committing when requested.

### Task 3: Offline acceptance and explicit stop

- [x] Run the selected unit tests and specialist-engine integration test with fake providers and isolated synthetic fixtures only. Run Fleet type/lint and boundary checks required by the changes.
- [x] Verify the proposed local launch selection is Nemotron-only and rejects missing/mismatched models without fallback, using a fake model catalog. Keep prior frozen candidates unchanged. Identify the exact current configuration entry point before changing it; do not modify active services for this check.
- [x] Record actual checks, remaining limitations and the exact changed files. Passing scripted tests establishes source behavior only, not local-model behavioral acceptance.
- [x] Stop here. Report for review before any inference or trial. No broad qualification restart, package/restore cycle, release, installation or activation is part of this plan.

If later requested, propose a separate game-free Nemotron probe capped at **two independent synthetic cases, three calls per case, six total calls, ten minutes wall time and zero retries/candidate changes**. Its exact token ceilings and prompt-size fit must be specified before authorization. Stop on the first repeated lookup or redundant introduction and report the packet; do not repair and rerun in the same probe. Real qualification remains a separate decision.


## Execution record — 23 October 2026

Started 16:06:41 UTC; completed within the user's 30-minute ceiling. Inline, on Fleet master. No deployment, service restart, execution-setting change, real model call or retained-world operation. PACT source is unchanged.

Task 1 retains one retrieved tool contract within a specialist turn, rechecks the authenticated catalog before reuse, clears it on schema change/removal/lost read-only status, removes its duplicate lookup branch, and explicitly labels the delivered lookup result. The engine emits encrypted diagnostic reason `NO_FINAL_DECISION_CALL_LIMIT` before waiting when no final decision is produced. It does not fabricate a decision, persist an action or extend the budget.

Task 2 excludes introduction targets only from accepted-contact facts or positively observed, unexpired pending requests with compatible freshness and ownership. Missing/expired/stale evidence does not become a relationship fact. Tests cover incoming/outgoing requests, accept and decline choices, manual delegation, missing pages, stale/expired evidence and hostile note text. The actual PACT social suite covers allowlist denial and delegation revocation; native authorization remains authoritative.

Task 3 integrates a pinned Nemotron-only catalog selector into `scripts/lib/post-e3-native-provider.ts:readNativeProviderIdentity`. Missing, duplicate, wrong-name or wrong-digest selections fail without fallback. Historical identity validation remains readable; no historical launch descriptors, installed model files or services were changed. This does not impose a global model ban on Fleet's generic HTTP adapter or rewrite frozen non-Nemotron candidates; those candidates must not be launched for local work.

Verification:

- Initial regression runs reproduced repeat lookups and reciprocal introductions; the affected assertions passed after repair. A targeted mutation check also removed the exhaustion diagnostic, observed the regression fail, restored the diagnostic and observed it pass (53 unrelated tests intentionally filtered out in that targeted check).
- `npm test`: 166 files, **841 tests passed**.
- Owned synthetic fixture, `tests/integration/autonomous-specialist-engine.test.ts`: **54 passed**, including environment.v2 and environment.v4 retention/invalidation, unchanged metadata clock/provenance and call exhaustion with no command.
- Separate owned PACT synthetic fixture, `/home/mnim/repos/mine/pact/tests/integration/social.test.ts`: **11 passed**, including allowlist denial/revocation and expiry. Disposable fixtures were closed; retained databases were not used.
- `npm run check`: exit 0; TypeScript passed. Biome reported 82 existing warnings and 56 informational diagnostics outside this change; focused checks of changed files were clean.
- `npm run build`, `npm run check:boundaries`, `git diff --check`: passed.
- Read-only ordinary Fleet health check: `liveEnabled: false`.

Ruling: Keep the approved main checkout and perform review inline, following the user's explicit no-delegation instruction. No temporary branch, reviewer agent, candidate namespace or automatic commit was created. Cost: this change has no independent reviewer; behavioral model acceptance remains outstanding.

Ruling: Test allowlist denial with the existing authoritative PACT synthetic social suite rather than inventing a new Fleet permission rule. Cost: Fleet still advertises conditional choices subject to native checks; these checks cannot certify live-model decision quality.

Remaining: a separately authorized, game-free Nemotron behavior probe with explicit token ceilings and prompt-fit checks. Neither real qualification nor release/activation is complete. E4/KQ1 remain blocked. No trial or candidate iteration is started by this record.


The subsequent user-authorized probe is closed: see [game-free Nemotron result](../../nemotron-game-free-probe-20261023.md). It stopped on response 3; the pending-request case was not run. This supersedes the earlier prospective probe status without reopening it.
