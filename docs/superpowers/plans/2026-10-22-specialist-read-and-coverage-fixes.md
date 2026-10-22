# Specialist Read and Social Coverage Fixes Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline; the user explicitly prohibits delegation.

**Goal:** Deliver the opted-in environment read contract in the specialist prompt and report actual social-record coverage after packing.

**Architecture:** Add the existing environment-supplied query contract to the specialist packet before its current admission/packing checks. Recompute the specialist social section's nested coverage whenever packing changes its selected records, preserving source completeness separately.

**Tech Stack:** Node 24, TypeScript, Vitest, existing Fleet HTTP adapter, fresh isolated PostgreSQL fixtures and fake providers.

**Spec:** The user's current request and the two previously diagnosed defects. This is the approved narrow repair; stock presentation, new candidate/study definitions and runtime activation are excluded.

## Global Constraints

- Work on normal master inline; migration documentation must be committed first in both repositories.
- Keep game execution disabled. No real model calls, installation into running services, retained-world access, historical study retries, provider/settings changes or push.
- Keep older profiles' prompt shape unchanged unless `readQueryContract: "environment.v1"` is selected.
- Use the environment contract and its existing skill selector; no PACT-specific query knowledge enters the generic specialist engine.
- Count the added prompt bytes before admission. Preserve all current byte/call/output limits and fail closed when required context cannot fit.
- A source page is complete only when its original completeness is explicitly true and every available record is delivered. Preserve the input observation.

## Review Focus

- Schema-only delivery: inspect real HttpModel request messages using a synthetic HTTP stub.
- An oversized read contract: require refusal before HTTP dispatch or model allocation.
- Empty, omitted, partially delivered and already-incomplete social sections: verify nested and outer coverage agree.
- Size pressure: update coverage before fit checks and after a rejected record; keep output within its byte limit.
- Compatibility and packet growth: exercise legacy specialists and the explicit-contract positive composition on fresh fake-provider fixtures.

### Task 1: Commit migration documentation

- [x] Check links/content and whitespace; commit only migration documents in Fleet and PACT.
- [x] Record commits: Fleet `086dba5`, PACT `5430883`.

### Task 2: Repair prompt delivery and social coverage

- [x] Add failing HTTP-prompt/admission regressions in `tests/integration/autonomous-specialist-engine.test.ts` and coverage cases in `tests/unit/pact-specialist-packing.test.ts`; observe their expected failures.
- [x] Update `src/engines/autonomous-specialists/engine.ts` and `src/games/pact/packing.ts` with the minimal repairs; rerun the regressions.
- [x] Extend the synthetic positive composition to exercise explicit-contract packets alongside legacy RC2 packets, without changing frozen candidate definitions.

### Task 3: Verify and document source acceptance

- [x] Run Fleet unit tests, affected isolated integration/positive tests, paired acceptance, type/style/build and architecture checks.
- [x] Review the diff inline, record actual results and remaining qualification/runtime boundaries, and check documentation links and whitespace.
- [x] Confirm the existing empty Fleet health still reports live execution disabled.

## Progress

Migration commits complete. Six social-coverage cases and two HTTP-prompt/admission cases reproduced the defects before the repairs. The repaired source passed all 526 unit tests, 24 affected integration tests, 41 paired acceptance tests, type/style, production build and architecture boundaries. The two full positive-composition variants fit the unchanged 32,000-byte ceiling and completed learning/guarded reuse. Existing lint warnings remain outside the changed files. Final inline author review and documentation/whitespace checks passed; source changes are committed on master. Fleet health confirms live execution disabled. No real model calls, service restarts, installation or historical-study changes occurred for the repair. The [source acceptance record](../../specialist-read-and-social-coverage-fixes-20261022.md) owns the results.
