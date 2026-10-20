# Two-kingdom negotiation: source and offline acceptance

Recorded 21 October 2026 (Berlin); the filenames retain the approved plan date, 20 October.

F00–F06 and N01–N08 are implemented on the isolated `codex/two-kingdom-offline` branches. This clears the source/offline gate only. **E1–E4 are unstarted, and model quality is not qualified.** All provider responses in these checks were fake. No model/helper inference, live game run, runtime installation, deployment, reset/replay, uncertainty review, execution-setting change, merge or push occurred.

## Sources and preservation

Plans were committed first: Fleet `659f914`, PACT `dc672ea`. The original masters remain at those planning commits. The paired source branches preserve the earlier foundation checkpoint and both histories. Verified source revisions and final checks are recorded below; publication commits add reports and disarmed artifacts only.

Verified Fleet source: `81b6ad6bcbe41c8db58948096c76c34bc662c29e`. Verified PACT source: `70d50383ae45501fcec6cef7463636de53c9769b`. Key foundation commits: F02 `a6b2e19`, F03 `15ea581`, F04 `88760a2`, F05 `b8ebf5f`, F06 `ee9c051`. Negotiation candidate/evaluation/lifecycle/protocol checkpoints are `d7c40f6`, `72f15c5`, `fdce011`, `576eedb` and `cbed866`; follow-up repairs remain separate commits.

The retained paused world, private runtime configuration, identities, goals, mandates, queues, budgets, original unknown allocations and archives were not opened or changed. This is preservation by non-access, not a fresh runtime-state observation. Database mutations were confined to newly created, random-port, nonce-marked F00 fixtures. Owned fixture cleanup is checked separately; no retained container is stopped.

A first broad Fleet integration pass exposed old qualification tests targeting stopped port 5436. Connections returned `ECONNREFUSED`; no query or change reached that endpoint. Those tests now require an explicit nonce-owned fixture and never fall back to a retained target. Production qualification's existing port/database guard remains unchanged. The final rerun uses only owned fixtures.

## Implemented behavior and specialist fit

F02 registers trusted exact-version manifests, validates configuration and rejects missing capabilities. F03 supplies one transactional draft/configure/start service with CAS, idempotency and immutable consumed configuration. Launch readiness is structural; it does not imply model or behavioral qualification. Accounts describe the existing cohort roster, without cloning or moving identities.

F04 exposes actor/binding/instance-scoped host ports, encrypted versioned state and evidence. Private Store, claim, vault and model handles stay in application composition. Native allocations retain prepared, dispatched, settled, unknown and proven-not-dispatched facts; unknown spend is never refunded. F05 extracts explicit versioned decision/continuity/evidence modules while keeping legacy execution and the five original `@1` profiles. F06 makes runtime wiring thin, preserves legacy scheduling and enforces ownership through resolved TypeScript AST import checks. Maintenance hooks are bounded and cooperative; no retained cleanup job is installed.

There are six exact-version options across five existing families: `reactive-cognition@2` is a candidate version, not an additional architecture family. F07/F08 console/CLI presentation remains deferred. Migration 022 now stores N07 nonce metadata; future specialist/skill migration proposals are renumbered 023–027, without renaming any applied migration. Persistent specialists A01–A08 and skills K01–K07 remain future work. A04 can explicitly reuse the N04 evidence policy; autonomous specialist PACT comparisons still require A07/A08. The existing F6 coordinator is unsupported by this negotiation protocol and cannot substitute for a preregistered profile.

N03 projects complete, self-relative negotiation facts: exact peer/offer/version/terms, known or unknown signatures, expiry, directions, bonds, authoritative constraints, installments and source coverage. One signature is not income, and closure alone is not fulfillment. Missing outstanding-command coverage is unknown, not an empty list. Whole protected records either fit or disclose unavailability; normal scoped reads narrow incomplete pages. Candidate-only packing and lossless tables preserve these facts within the frozen byte budget. Version-1 packets remain the comparison control.

N04 composes `reactive-cognition@2` with a separate `negotiation-memory.2` codec and versioned evidence selection. Original promises, receipts and outcomes are distinct from subjective interpretations. Causal bundles retain their support or disclose omission; expired, foreign and unsupported originals cannot be reconstructed from summaries. Accepted/rejected/no-op memory acknowledgments are delivered to later operations. Narration alone does not write memory. Original receipts survive even with no authored memory update. Restart, ten newer observations, expiry, consent deletion and unsupported citations are covered. Current v2 persistence requires observation consent and fails closed if it is absent; no installed consent setting was changed.

N05 assesses exact consent and peer claims, both parties' realized stock changes against separate matched solo worlds, outgoing costs, obligations, useful dialogue and actual later decisions. Free prose uses an explicit evidence-backed manual rubric with redacted locators, not an automatic self-report pass or a model judge. All original/corrective allocations count once; unknown reservations remain. Complete stage denominators, family thresholds, Wilson intervals, latency statistics and null cost per zero useful outcomes are represented independently of source acceptance.

N06 runs actual selected Fleet engines through PlatformHost, scoped PACT adapters, normal authenticated command handlers, receipts and every ordinary tick in new synthetic worlds. Fake providers supply all decisions; the driver never repairs their terms or substitutes actions. C01/C02 include a responder's scoped read of the peer's actual message before replying. Both actors make later engine decisions. C05's scripted owner history and reserve restoration are labelled and never counted as autonomous work.

N07 produces immutable previews, validates a separate exact private grant and exposes a guarded executor with native ledger and one-shot nonce metadata. Scope, source/configuration, UTC windows, turns, calls, reservations, dispatch, actions and clock advancement are rechecked. Unknown spend, pending effects and cutoff close admission without replacements or unused-budget reuse. The CLI defaults to preview and intentionally has no installed owned native execution composition; an execution flag cannot silently load arbitrary runtime code. No private grant was prepared and no execution flag was invoked.

N08 derives publication status from source verification and matching native batch/nonce metadata. Bare fake assessments cannot complete a real stage; stopped batches and mismatched E3/E4 candidate configurations cannot produce qualification. This publication supplies no native run records, so every real stage stays unstarted.

## Verification

| Check | Result |
| --- | --- |
| Fleet unit | 427 passed, 81 files, 88.81 s |
| Fleet integration | 455 passed, 59 files, 462.95 s |
| Fleet paired acceptance | 24 passed, 4 files, 178.07 s; additional paired contract compatibility test passed (25 total distinct acceptance tests) |
| Fleet type/style, build and AST boundaries | Passed; style emits 57 non-gating warnings and 16 informational diagnostics, including existing diagnostics and new test non-null assertions |
| PACT unit | 414 passed, 128 files |
| PACT integration | 473 passed, 1 skipped, 68 files, 464.01 s |
| PACT full build, typecheck and lint | Passed, including contract/dependency/security-backport/boundary checks |
| F01 parity / old-schema / scope / native ledger and nonce | Passed within the full suites; baseline file unchanged; repeated migration and terminal nonce preservation covered |
| Status provenance and consistency | Six targeted checks pass, including stopped/no-assessment records, fake-versus-real labels, native status mismatch, duplicate records and differing E3/E4 configuration |

The PACT skip is the existing optional real local-model comparison in `script-baseline.test.ts`; its endpoint was absent. The full build emitted its existing large web-chunk warning. Fleet's older cognition schema tests emit their existing AJV unknown-UUID-format notices. None is counted as real-provider acceptance. The first broad Fleet pass had 48 failures (45 refused legacy qualification connections plus catalog-count, future-fixture-time and old-schema failures); the final full rerun passes all 455. Targeted new status tests also caught two false terminal-state classifications and a mixed-configuration qualification claim before their fixes.

The frozen negotiation manifests remain byte-identical: SHA256 `c3f2b0664e620852aa8da6cd976c8bda5eddb0fd781438db1b293fa3a451c306`. SHA256 of the mirrored outcome JSON Schema `JSON.stringify` output remains `d7aafe4e58093eabca682e4e2ac04e3dda2eaa07c77863c60abc96d7f0854403`. The historical 672-cell design and original v1 baseline transcript are unchanged.

Reproduce the suites from the Fleet worktree with Node 24 and locally available PostgreSQL 17, after ordinary package builds:

```sh
npm run check
npm run build
npm run check:boundaries
npm run test:architecture -- --suite unit
npm run test:architecture -- --suite integration
npm run test:architecture -- --suite acceptance
npm run test:architecture -- --repo pact --suite unit
npm run test:architecture -- --repo pact --suite integration
```

The runner supplies fresh owned databases and removes inherited provider/runtime endpoints. Do not run these suites against retained databases. PACT's full build, typecheck and lint include contract, dependency, security-backport and boundary checks.

## Inline review and limitations

A separate inline self-review covered all five planned review focuses; no delegation or independent reviewer was used.

| Focus | Evidence and limit |
| --- | --- |
| Correct ID but wrong peer/version or missing consent | Whole-record projection, stale counter/version tests, exact counterpart joins and altered passing-evidence rejection. Unknown consent never becomes acceptance. |
| Signed but uneconomic or defaulted supply | Normal settlement, independent obligations, actual ordinary stock comparison and outgoing costs. C01 settles 60 installments per direction: A +600 internal Silver (+1 whole), B +1200 Iron (+2 whole), with donor stocks equal to solo at the matched refill boundary. C03's unfavorable legal trade fails benefit; closure without full delivery cannot pass. |
| Saved history omitted or unsupported | Actual restarted v2 operations prove original fulfilled/defaulted evidence reaches the final serialized packet after ten newer observations and informs the later fake-authored decision. Missing originals and unsupported interpretation citations fail closed. |
| Expiry, authority change or crash | Lease revocation and pre/post dispatch, state save, commit and lost-result faults. After-commit recovery reads the original receipt; no replayed effect. Original unknown 40,000-token allocation remains. |
| Extra attempts, leaked facts or replaced failures | Actor/world/binding scopes, private-field rejection, immutable cell layouts, native counters, cutoff, one-shot nonce and complete-stage guards. No replacement cells, event-granted turns or unmetered judge calls. |

Minimal production compatibility repairs are separately committed: raw legacy dispatch accounting; whole-contract closure evidence; expiry-preserving state CAS; candidate-only bounded packing/lossless causal/schema representation; missing-command coverage; and old-schema optional-table detection. Legacy schema rehearsal preserves historical rows across repeat migration; half-present architecture metadata fails closed. Fixture-only fixes route qualification to owned databases, align an observation timestamp and remove a stale hard-coded catalog count. No PACT production rule, economy constant, permission or application migration changed.

The new PACT test adapter uses a synthetic server-derived external-agent principal after normal guest authentication and lease/mandate creation. This proves handler-level authority; existing paired tests cover their established transport paths. Fake controlled clocks do not certify real-model strategy, wall latency, native scheduling, long-term cooperation or robustness across untested worlds. A prevented bad action remains a behavioral failure in scoring. Source acceptance does not certify the paused installation.

## Operational handoff

[Machine-readable status](two-kingdom-negotiation-status-20261020.json) records the source pass and unstarted stages. [E1 disarmed preview](two-kingdom-negotiation-E1-preview-20261020.json) lists only the two frozen baseline `@1` development cells, at most 144 calls / 5,760,000 reserved tokens, zero helpers and six sequential wall hours. No new runtime or model selection is implied.

The preview records the source heads at generation. Later documentation commits naturally change repository HEAD; any future grant needs a regenerated, revalidated source/configuration-pinned preview. Model artifact/settings/policy, owned executable composition, exact fresh fixture bindings, private evidence/key locations and UTC start/cutoff are still missing. E1 needs a separate explicit operational assignment; E2 comparison, E3 qualification and E4 native timing do not follow automatically. The existing world stays parked throughout.
