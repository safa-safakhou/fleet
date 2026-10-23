# Owner clock offline composition — 24 October 2026

**Result: offline composition passed; profile activation remains unapproved and unperformed.** The user authorized one inline 30-minute offline window, no real model calls, worker or game execution; E4/KQ1 remain blocked. Work began at 00:18:07 Europe/Berlin (22:18:07 UTC on 23 October). Completion time and elapsed duration are retained in the private ledger.

The [owner-task/profile proposal](owner-clock-read-profile-proposal-20261024.md) is now backed by a durable [composition fixture](../tests/fixtures/owner-clock-composition.ts) and [six integration cases](../tests/integration/owner-clock-composition.test.ts). No application runtime code, dependency, installed configuration or immutable package was changed. Original proposal JSON SHA-256 remains `974ad870b3c0e045f5e5d17358e733357c2f333b177b1fed01ed9eca2ad5d04a`; its earlier gap descriptions are the historical pre-proof checkpoint, not a claim that the proof is still missing.

## What was composed

The fixture uses the real operator-request parser, fresh synthetic Store/identity/binding, native `PactBindings`/`EnvironmentRegistry`/`createPactEnvironment`, native resources charter and native `AutonomousSpecialistsEngine` with the exact proposed v3 configuration. Only the external GamePort and scoped provider/participant ports are synthetic; global fetch is refused. No native PACT server, Ollama endpoint, worker process, launcher or scheduler is started or called.

A fresh owned PostgreSQL fixture is mandatory through the architecture wrapper. Synthetic identity setup stays in that fixture, not the installed console database or paused worlds. Cohorts stay inactive; no worker claim, live setting or real account is needed. The fake native profile must match the bound synthetic account and each world read must match the expected kingdom. A foreign request gets no typed fact; a mismatched native account is refused before observation.

The native preset retains both resources and diplomacy with their original charters. **Resources already has an empty `allowedActions` list**; no charter rewrite was needed. The actual engine router receives one `changed`/`resource` event and addresses only resources. The harness refuses periodic input before entering that flow, exposes no scheduling service and creates no durable task. Native periodic subscriptions themselves remain unchanged; this does not certify running the preset under a scheduler.

Scoped services advertise zero action schemas/contracts and expose no executable command port. A provider bypass attempting an action is rejected by the real engine as `UNSUPPORTED_SCHEMA` before participant acceptance or dispatch. Final acceptance also rejects an action intent or persistent state/message/wake update; successful output is captured only in test memory. Selected fixture rows (cohorts, agents, bindings, profiles, tasks/claims, ledger/commands, specialist state) remain logically unchanged across the operation. This is not a production launch path.

## Exact positive result

| Measure | Observed | Proposed ceiling |
| --- | ---: | ---: |
| Scripted decisions | 3 | 3 |
| Native observations | 2 | 3 |
| Native `game.read` calls | 9 | 13 |
| Native tool-catalog calls | 13 | 16 |
| Explicit targeted reads | 1 | 1 |
| Input bytes, first decision | 12,245 | 13,000 |
| Input bytes, second decision | 12,640 | 13,000 |
| Input bytes, final decision | 12,587 | 13,000 |
| Accepted final envelopes | 1 | 1 |
| Game commands / scheduled tasks | 0 / 0 | 0 / 0 |
| Real model calls / worker starts | 0 / 0 | 0 / 0 |

The metadata lookup is resolved by the engine's retrieved-contract path without another native observation. Initial and targeted observations each bootstrap four reads; the explicit world read adds one, totaling nine. Tool-catalog refreshes total 13, not 13 model requests. The fake sequence is schema → exact scoped read → canonical wait. Native generated schemas accept the scripted outputs, and the action example is rejected by the offered grammar. The known result is:

```text
Observed requested facts: [{"id":"world.time","value":1792419240000}]
```

The largest admitted message-plus-schema packet has only **360 bytes of headroom** in this minimal synthetic native catalog/world. No ceiling was increased, mandatory requested fact dropped or alternate model selected. This proves this fixture fits; a richer real account/catalog may not. Scripted token values are fake test data, not measured Nemotron usage or a usage-accounting proof.

## Failure paths and verification

All six cases pass:

1. Native authenticated synthetic read → v3 final, no writes/scheduled work.
2. Forged provider action rejected as `UNSUPPORTED_SCHEMA`, no acceptance/dispatch.
3. Requested tool absent from the catalog → one honest unresolved wait, zero targeted reads; marked incomplete, not retrieved successfully.
4. Foreign request scope → `OWNER_REQUEST_NOT_BOUND`, zero scripted decisions.
5. Mismatched native account → `IDENTITY_MISMATCH`, no observations/decisions.
6. Periodic input → `ONE_SHOT_SCOPE_REQUIRED`, no reads/decisions/tasks.

All six were first observed failing at the missing composition implementation; they passed after the fixture was implemented. Test-harness typing omissions were corrected and the real UUID format registered for grammar validation. No application repair was necessary.

Fresh checks passed: **896 unit tests / 170 files**, **68 isolated integration tests** (six new composition, five bindings, 57 specialist HTTP), TypeScript no-emit, clean Biome checks on both new test files, architecture boundaries, local documentation links and whitespace checks. The six composition tests also passed separately after adding safe synthetic evidence logging. Integration fixtures were created and removed through `scripts/test-architecture-offline.ts`; installed/retained databases were never test targets. App build/audit results from the prior source acceptance were not rerun or claimed fresh because no app/dependency changed.

## Preserved installation and remaining gates

The separate read-only status command confirmed the installed console still runs as original PID 1069049 at `http://127.0.0.1:38765`, with `liveEnabled: false`, no worker, and zero actors, tasks, claims, allocations, commands or worker records. No enrollment, restart, settings change or cutover took place. Original request, control script and settings hashes remain unchanged; existing ordinary services/worlds are preserved. E4/KQ1 remain blocked and unrun.

The fixture's pure scoped engine invocation intentionally bypasses production launch readiness, model admission/accounting, durable participant acceptance and scheduling. Synthetic account/profile binding proves the adapter contract, not external credential health. No full native-server, real-provider, gameplay or scheduler acceptance is claimed. Review was inline self-review per the explicit no-delegation instruction.

The concrete offline-composition gap is closed for this exact proposal and minimal fixture. Before any further rehearsal, freeze the verified source/fixture/packet/proposal and exact fresh identities/deadline. A separately approved game-free Nemotron 4B rehearsal could then test the previously untested native-adapter packet, at most three calls / five minutes, no retries, stop on first failure. This report authorizes zero calls and schedules no trial. No previous allowance is reopened.

Real owner/entity selection, installed fact/profile configuration, production enrollment, worker/autostart, ordinary-instance promotion and game activation are still outside the assignment. Keep execution disabled. The profile remains nonrunnable in the installed empty console; do not treat offline acceptance as a launch approval.

## Private evidence and reproducibility

Root: `/home/mnim/.local/share/fleet-candidate-final-facts-20261023-2141/`. No real credentials or retained-world data were put in Git/logs; saved fixture output contains synthetic aggregate evidence only.

| Artifact | SHA-256 |
| --- | --- |
| owner-clock-composition-positive-20261024.json | `0af5c4faf7d448aeb06a0fdf986db06d6bd1c22cae51fa466ee392b6b29cf07f` |
| owner-clock-composition-green-20261024.log | `e74629d3d4789280f223c60833f6721f8f5f78221b08566c03f26d9a208d3da6` |
| owner-clock-composition-evidence-20261024.log | `1fb66c55ac76ec28819841ed31bcf5c9bf41937896eafe92dc425bca3990bc99` |
| owner-clock-unit-20261024.log | `d1b6be25171171ec613af2d39a0ebf284ebdf4dda323122fef5c12cef2fe0769` |
| owner-clock-installed-preserved-20261024.json | `b4cd10145e7fbdf7a397230232eefa15537aa1a3bf1bca38ee10325d1394e9fd` |
| tests/fixtures/owner-clock-composition.ts | `67f8c56f09181df9b994b80483b8c3317966ac2a9a73ff307320bfdd1afdfd82` |
| tests/integration/owner-clock-composition.test.ts | `ef89729fcce3a327d6de9dda43122598821e298b0b578f80c17c58195fc446cf` |

Reproduce only in a fresh owned fixture, using Node 24:

```sh
node --import tsx scripts/test-architecture-offline.ts --repo fleet --suite integration tests/integration/owner-clock-composition.test.ts
```
