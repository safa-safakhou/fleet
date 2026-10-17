# Profile qualification and release review

F8 adds pure artifact review; neither function opens an environment, calls a provider, changes configuration or authorizes an operation. `executionEnabled` is a result describing a proposed manifest, not Fleet's live switch. Existing start/admission/permissions/recovery controls remain authoritative.

```mermaid
flowchart LR
  A[Exact profile + adapter capabilities] --> Q[qualifyProfile]
  B[Reviewed fake artifacts + closed output samples] --> Q
  C[Separately authorized real route artifacts] --> Q
  Q --> D[Offline passed / live qualified / missing evidence]
  D --> R[reviewProfileRelease]
  P[Preservation + quiescence + authority + exact bounded selection] --> R
  R --> E[Review result only]
```

## Artifact contract

`qualifyProfile(profile, adapter, evidence)` supports the five reviewed version1 profiles. Unknown versions fail closed. `profileRequirements` is review metadata checked against every profile in actual `runtime()` composition by `tests/acceptance/environment-profiles.test.ts`; changing a runtime contract requires updating that test and reviewing qualification. Legacy compatibility names its original observation/action schemas; generic profiles have no game vocabulary.

Each `ProfileEvidence` carries kind (`deterministic_fake` or `real_provider`), exact profile/environment instance, passed status, source references and `fleet.profile-evidence.v1` coverage. Coverage pins Fleet/environment commits, contracts/configuration/adapter digests, required behavior checks and bounded output samples. `adapterDigest` covers sorted schema IDs and advertised capabilities, not implementation authenticity. Contracts and implementation identity are separately pinned. Samples pass through existing `qualifyOutput`; a delivery-limit error never counts as a successful negative schema example. At least one positive sample is required. Samples must come from the actual reviewed decision contract for that configuration, including context-dependent cognition versions. The gate cannot discover that contract from arbitrary supplied JSON.

Every artifact must independently cover baseline preservation, capability acceptance, unknown-usage retention, original-command reconciliation, authorization, accounting, stop/fencing and retention. Reactive profiles additionally require events; continuity/coordinator profiles require their corresponding protocols. Incomplete records cannot be pooled into a pass. Real artifacts also identify exact route/model/settings digest and reviewed output, timeout, usage and serial-capacity behavior. Real route capacity remains1. Source/configuration/instance mixtures and failed matching evidence veto qualification. A fake-only bundle may pass offline and always lacks live qualification. A supplied provider artifact without offline evidence also fails.

These are trusted operator review artifacts, **not cryptographic attestations**. The reviewer must open their source references, verify source/configuration and actual provider provenance, check current provider availability and record the qualification window. Synthetic unit fixtures labelled `real_provider` only test the gate; they are never qualification records for an actual provider. Do not commit real prompts, peer messages, account IDs, credentials or private run bundles. This phase produces no real-provider artifact.

## Release contract

`reviewProfileRelease(manifest)` validates `fleet.profile-release.v1`. It shares the original release review's contract/migration/preservation/retention/rollback/authority/deployment gates and all quiescence checks. A separate dependency-audit gate also blocks release while the actual audit has unresolved findings. The original `reviewRelease` API and its population-specific canary format remain supported unchanged. The profile format replaces those historical population labels with opaque actors, internal cohort references and an exact environment instance; another game does not need PACT accounts.

Each selected run must include exact profile, adapter, source-matched evidence, configuration digest, route/model/settings, actors/cohorts, finite call/token/per-call ceilings, serial concurrency, start/deadline, at least3 intended rounds, monitoring references and stop conditions for unknown usage, pending commands, lost authorization, deadline and allowance. Duplicate identities/cohorts across runs, mismatched source/configuration/route, missing live evidence, unresolved preservation or absent authorization retain blockers. All fields are reviewed together; passing supplied Boolean assertions does not replace their underlying evidence. Refresh the manifest and quiescent snapshot immediately before any separately authorized operation.

Use the concrete [release proposal](multi-engine-release-proposal-20261017.md). Its machine manifest has no selected runs and remains disarmed. Review after building, with no environment configuration or network access:

```sh
node --input-type=module -e 'import {readFile} from "node:fs/promises"; import {reviewProfileRelease} from "./dist/server/release-review.js"; console.log(JSON.stringify(reviewProfileRelease(JSON.parse(await readFile("docs/multi-engine-release-manifest-20261017.json", "utf8"))), null, 2))'
```

## Local acceptance

Run Fleet's normal check, boundaries, unit, serial integration, build and audit commands. Run PACT build/type/lint/unit/integration (`--maxWorkers=2` for this machine's shared migration lock), offline evaluation and backlog checks in its source worktree, against its owned isolated database. Cross-repository acceptance explicitly selects built PACT packages and loopback5438/pact_test:

```sh
PACT_ACCEPTANCE_ROOT=/home/mnim/repos/mine/pact-phase2-agent-events PACT_ACCEPTANCE_DATABASE_URL=postgres://pact:pact@127.0.0.1:5438/pact_test npm run test:acceptance
```

Fleet integration fixtures use only loopback5437/fleet_test and must run serially; do not run another Fleet integration suite simultaneously. The actual PACT handler acceptance owns/drops a unique schema. No installed database, server Fleet, real credential or provider belongs in these tests. Deterministic scenarios and simulated deadlines establish neither real-host latency nor model determinism or useful social behavior.
