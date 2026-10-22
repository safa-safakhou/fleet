# RC3 read-contract repair — local source acceptance

RC2 remains unqualified. Its separate shared-service D/H results and final restores are recorded in the [terminal qualification report](RC2-shared-service-qualification-20261022.md). This record defines a new source candidate; it does not change frozen RC2 artifacts, grants, responses or verdicts.

Verified source candidate pins: Fleet `0476150fa74e01cb9972b85e4c67119a2221a48d` / PACT `737ac87f5618c4c32ca0d0faae44d78ad3c2af29`. Keep the existing full/guarded RC2 configuration and ceilings, adding only `readQueryContract: "environment.v1"`. Later report-only commits do not amend those actor bytes.

## Minimal repair

The RC3 candidate explicitly sets `readQueryContract: "environment.v1"` in its architecture configuration. With that setting, the autonomous specialist receives a read-query schema supplied by its environment through the existing session/host boundaries; a missing contract stops before model dispatch. Existing defaults/presets retain their original packet shape. PACT derives the actual read names from its authenticated catalog, accepting only the same `pact_` tools marked read-only that its observation handler permits. Names and schema discovery are not authorization; all existing tool argument validation, account scope and server permission checks remain in force.

The delivered query contract describes:

- `{}`: refresh the current authorized view.
- `{readSchema:<advertised name>}`: obtain one tool's current description and exact argument schema as a scoped observation alongside the ordinary refreshed view; no extra tool invocation with arguments is submitted.
- `{tool:<advertised name>,args:{...}}`: request that read with validated arguments.
- Existing continuity/coordination flags only when the environment supports them. The separately gated skill-schema request remains available to learning-capable specialists.

The ordinary authorized view remains fresh during schema discovery, preserving the existing action-context checks. Unknown fields and mixed selectors now fail with `INVALID_READ_QUERY` before world reads. A query cannot send a message or change game state. The interface keeps empty catalogs valid and does not impose PACT query shapes on other environments. It delivers names plus one requested schema instead of adding the full catalog to every specialist packet.

Source: [PACT query contract](../src/games/pact/read-queries.ts), [observation handler](../src/environments/pact.ts), [specialist binding](../src/engines/autonomous-specialists/engine.ts). No game rules, owner intent, mandates, model/provider selection, 32000-byte input cap, 2000-token output cap, 72-call positive-world ceiling, 30-minute reviews or helper policy are expanded.

## Verification

The four initial regression tests failed against the previous source: absent query contract, ignored schema lookup, invented fields silently accepted, and unrestricted generated read queries. They passed after the repair. An empty-catalog regression then caught an invalid empty enum before correction. Production catalog overhead is bounded in a separate test; the retained RC2 fake maximum plus the complete new query/skill selector schema fits 32000 bytes. That incremental check is not a fresh full positive-world acceptance result.

The host integration tests cover both the explicit setting and its absence, and refusal when the required contract is missing. They inject a different board read shape through the actual registry/supervisor/scoped-service path. They check the model's delivered generation schema and perform no board command. Other environments without this optional contract preserve their existing decision schema.

Verification results: all 517 unit tests and all 40 paired acceptance tests passed; the first full integration run had 569 passing tests and three packet-size regressions in `specialist-owned-run` and `specialist-owned-learning`. The new contract had incorrectly increased older 24000-byte packets. Making delivery explicit to RC3 preserves those profiles' packet shape and ceilings; all 21 tests in the three affected integration files passed on a new isolated fixture after that correction, including the two added opt-in/required-contract cases. The other passing integration files were not rerun; no known test failures remain. Type/style checks, production build, controller compilation and architecture boundaries passed. Changed TypeScript files have no Biome diagnostics; the full repository check still reports its existing 82 warnings and 56 informational findings outside this change.

The three corrected integration regressions were:

- `specialist-owned-run`: “bounds all eight native specialist cells and preserves known costs without inventing delivery or learning”.
- `specialist-owned-learning`: “learns only from whole scoped answers, reuses its actual prior goal without inference, and observes full delivery”.
- `specialist-owned-learning`: “refuses an action returned for evidence-only review before creating any native command”.

The compiled specialist engine and PACT read-query helper also cold-imported successfully on Windows using the existing pinned Node 24.19.0 binary, with the required Fleet working directory and zero provider starts/model calls. This is a module import check, not a newly inventoried operational package or restored positive-world rehearsal.

## Evaluation and packaging boundary

RC3 is a new source candidate and has made zero real model calls. Pin the verified source commit and a new artifact/settings/policy inventory before evaluating it. The old R1/R2 packager's hard-coded actor pins and study identifiers are historical; do not run it to label RC3 as RC2 or overwrite an existing package. A future RC3 operational package must explicitly identify the repaired source and its own protocol/grants.

All earlier E-stage and R2 worlds are exposed development evidence. New evaluation requires fresh isolated development worlds, a full positive real development result before an unseen held-out stage, native-clock acceptance, exact new grants/UTC cutoffs, and authenticated before/after restores. Do not reopen any failed grant or transfer its spare allowance. Existing E4/KQ1 budgets and the denied E4 provider start remain unchanged.

The build is not installed into the empty running applications. Production qualification, isolated release installation, rollback/restore acceptance and activation remain gated on valid applicable evidence. No real provider action is authorized by this source record.
