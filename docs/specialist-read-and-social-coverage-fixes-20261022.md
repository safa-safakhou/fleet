# Specialist prompt and social-coverage repairs — 22 October 2026

Status: both requested source fixes are implemented and verified offline. All 526 unit tests, 24 affected integration tests and 41 paired acceptance tests passed, together with type/style, production build and architecture boundaries. Game execution remains disabled. These source changes are committed on master and have not been activated.

Migration documentation was committed first on the normal master checkouts: Fleet `086dba5`, PACT `5430883`. The [repair plan](superpowers/plans/2026-10-22-specialist-read-and-coverage-fixes.md) records the subsequent source-only scope. Work is inline without delegation.

## Read instructions reach the model prompt

The [specialist engine](../src/engines/autonomous-specialists/engine.ts) now includes `readInterface.querySchema` and read-only/authorization guidance in its user packet when the existing `readQueryContract: "environment.v1"` setting is selected. It uses the environment-supplied contract, including the existing skill-schema selector when applicable. PACT's selectors, advertised read names and schema-lookup instructions therefore reach the prompt as well as the output grammar. Other environments retain their own query shapes; no PACT query logic was added to the generic engine.

The field is present before the existing message/schema byte calculation, observation packing and admission guards. It remains available during evidence-only review. Required contracts are not silently dropped to make a request fit. Oversized required input still stops before HTTP dispatch or model allocation. Older profiles without the explicit setting retain their previous packet shape.

The integration regression uses the real `HttpModel` and authoritative fixture host/admission path with an HTTP fetch stub. It validates the actual serialized request's `messages` and `format`, rather than assuming that schema delivery also supplies prompt instructions. An injected board contract reaches the prompt, permits its advertised square query and rejects invented or PACT-specific queries. The legacy path remains unchanged. All HTTP targets and responses in these tests are synthetic.

## Social coverage describes the packed records

[Specialist observation packing](../src/games/pact/packing.ts) now rebuilds nested social coverage whenever it changes the selected records:

- `sourceComplete` retains the input page's original completeness flag.
- `complete` is true only when the source explicitly reports completeness and every available record is delivered.
- `delivered` counts the records actually present; `omittedFromThisInput` counts those removed from this input.
- Other source metadata, including cursors, is retained without mutating the source observation.

Coverage is updated before each byte-fit check and again after removing an oversized record. The outer page counts and nested counts agree. An empty section no longer inherits a claim that an omitted record was delivered; an incomplete or unknown source is never upgraded to complete.

## Regression and verification evidence

Before implementation, six coverage cases failed with missing provenance/omission metadata and, for truncated pages, false completeness/delivery counts. Two HTTP-prompt/admission cases also failed: the opted-in prompt lacked the interface, and the oversized-contract case completed because its required prompt copy was absent. After adding that copy, the guard regression verifies that its bytes are counted before admission. These cases passed after the repairs.

Completed checks:

- Fleet unit suite: **526 passed** across 121 files.
- Affected integration: **24 passed** across four files. `autonomous-specialist-engine.test.ts` passed 15, including opt-in/legacy HTTP delivery, oversized-contract refusal with zero allocations, and the existing missing-contract hard stop. The separate three-file run passed all 9 positive-composition/owned-run/owned-learning cases.
- Focused packing/read-query rerun: **13 passed** after correcting a missing clock field in the new synthetic test fixture.
- Paired acceptance: **41 passed** across 11 files, using a newly owned isolated PostgreSQL fixture and fake providers.
- Type/style, production build and architecture boundaries passed. All six changed TypeScript files have zero Biome diagnostics. The full repository check retains its pre-existing **82 warnings / 56 informational findings**.
- The first type check identified the omitted required `environmentTime` field in the new test fixture; adding that synthetic field resolved it. No production type error remains.

The positive-composition file passed both variants: legacy RC2 and the explicit environment read contract. Each completed four cells covering both positive families and role reversals, actual delivery, later decisions, one extraction and one completed guarded skill invocation. Both stayed within the unchanged 32,000-byte ceiling. All five owned specialist run cases also passed, including preservation of unknown usage and hard stops before sibling work. No frozen protocol, actor pin, allowance or stage registration was changed. Both owned-learning cases passed: whole scoped-answer learning with actual later delivery and zero-inference guarded reuse, and refusal of an action during evidence-only review before any native command. The full integration suite was not rerun; these four affected files were exercised against fresh isolated fixtures.

## Runtime and qualification boundary

There are zero real model calls for this repair. No running application/provider was restarted, no execution setting was changed, and no study grant or spare allowance was used. The native WSL migration and its separate 71-token connection probe remain recorded in the [migration report](native-wsl-ollama-migration-20261022.md).

This source repair does not prove that a real model will interpret stock correctly or use reads appropriately. The stock representation is unchanged. RC3's real failure and every historical terminal result remain terminal; frozen packages and grants are unchanged. A future behavioral evaluation requires a separately defined candidate and fresh boundary under its own authority. No game activation, candidate release acceptance or push follows from these source tests.

Documentation links/content and `git diff --check` passed. Review was inline author review, with no delegation. The existing Fleet health endpoint returned HTTP 200 and `liveEnabled: false` after verification.
