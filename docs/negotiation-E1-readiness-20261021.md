# E1 owned preparation and separate packing repair — 21 October 2026

Owned PACT preparation and safe lease renewal are verified. The frozen `reactive-cognition@1` E1 preflight fails before provider admission. At the founder's explicit choice, a **separate, unregistered `reactive-cognition@1.1` packing candidate** was implemented and verified offline. It is proposed for baseline review; it has not replaced the frozen E1 definition.

**E1 remains unstarted. The [launch-manifest draft](negotiation-E1-launch-manifest-20261021.json) is `approved:false`, `ready:false` and not an executable grant.** No model/helper inference, provider process, retained game run, installed-setting change, deployment, reset/replay, history/uncertainty review, push or delegation occurred. The paused retained world and its private state were preserved by non-access. Only fresh nonce-owned synthetic test databases were used.

## Verified source and behavior

PACT source `eaf382f85f570d5e6341f358adefbf20fbd1084b` adds:

- `prepareOwnedNegotiationWorld(...,{retention:"preserve",secrets})`, caller-owned canonical 32-byte keys, a private digest-bound checkpoint and reconnect of the same authenticated account/kingdom/holder mapping. Wrong ownership, altered checkpoints, foreign actors/receipts and missing keys fail closed. Disconnect and failed retained setup never drop schemas; disposable legacy fixture behavior remains separate.
- Distinct reserved run holders with **no live run lease while awaiting approval**. Setup/prefix leases are released. Initial run acquisition is durable and one-shot; concurrent or interrupted activation cannot admit a partially acquired actor or reacquire a replacement.
- `RunService.renewMcpLease({accountId,holderId,expectedLeaseId})`, which reads UTC after locking the lease row and renews only that same live MCP tuple for the unchanged fifteen-minute TTL. Expired, released, replaced, wrong-account/holder and concurrent-revocation/expiry cases reject without acquisition. This supplies the future five-minute renewal loop's safe primitive; no operational renewal timer was started.
- An AES-256-GCM archive/restore proof of C02 on a fresh, network-disabled PostgreSQL clone, comparing every table and sequence and checking original checkpoint authentication. Repeat migration and ordinary C02 contact/unsigned-offer/current-goal prefix are retained without gameplay replay.

Fleet source `7bb9313efd5e90ffa4f4406b0de5bfa8e96d9b32` retains the original v1 controller, decision schema, prompts, ranking and PACT packer. The separate candidate inherits v1 continuity, uses structural generation-schema sharing, and explicitly selects the existing trusted `negotiation@1` observation view. That view marks omitted construction/military/full-rule detail as unavailable and supports normal scoped reads. **This changes input selection: it is not a lossless-only repair and not the original baseline.** It borrows neither the v2 memory codec nor the v2 decision/learning policy.

The native host now passes the exact task profile version into the continuity repository. Its constructor's version type was widened; its authorization, binding checks and namespace behavior are unchanged for `@1`. The exact new `reactive-cognition@1.1` database namespace is admitted by migration 023 and the replayed 017 constraint, with no row backfill or enrollment. Repeat migration preserves populated candidate history. The default architecture registry and frozen negotiation selector still reject `@1.1`; registration/adoption is not automatic.

## Measured preflight

The final owned-UTC preflight used normal PACT handlers/ticks and actual native Host, admission, task, lease and compute ledgers with authored fake providers. It never used provider/model network access or fake wall-clock advancement for these candidate cells. Alternating opportunities were A/B at round zero, B/A at round one, through offsets 0–165 game minutes; all ordinary settlement ticks reached 180 minutes, alongside separate solo controls.

| Path | C01 | C02 |
| --- | ---: | ---: |
| Frozen @1 initial observation bytes, A/B | 28,862 / 28,859 | 32,190 / 32,187 |
| Frozen @1 largest remaining observation allowance, A/B | 10,831 / 10,837 | 7,045 / 7,051 |
| Frozen @1 readiness | `CONTEXT_LIMIT`, both actors | `CONTEXT_LIMIT`, both actors |
| Frozen @1 provider allocations / actions | 0 / 0 | 0 / 0 |
| Separate @1.1 ordinary turns | 24 | 24 |
| Separate @1.1 reported fake-provider allocations | 29 | 30 |
| Reserved fake tokens | 1,160,000 | 1,200,000 |
| Actual serialized messages + schema, min–max bytes | 23,003–23,961 | 23,002–23,994 |
| Native known-output corrective attempts | 1 | 1 |
| Extra correction instructions fitted | yes | no; native path reused original packet |
| Scoped-read packets exercised | yes | yes |
| Actual settled installments per flow | 60 / 60 | 60 / 60 |
| Persistent candidate continuity | grounded @1.1 update | optional no-write path retained |

Schema sharing alone saved 681 bytes with no delivered evidence IDs and 1,351 with four, but still failed the paired initial packets. The explicit observation-policy amendment was therefore necessary for this candidate. Actual v1 output-schema equivalence tests cover empty/four-ID evidence, optional continuity, waits/reads/actions, missing/invalid IDs, bounds and extra fields. Original @1 failure evidence is retained; the two passing baseline regression tests assert **zero-spend blocking**, not readiness.

The candidate's 6-byte worst-case observed margin is small. Larger future observations/outputs can still stop before admission. C02 did not receive added correction instructions, and optional memory is never forced when supported evidence is withheld. These limitations are visible acceptance evidence. Authored fake outputs do not establish real-model negotiation, factuality, memory quality or general strategic reliability.

## Verification

- Fleet: **432 unit, 455 integration, 29 paired/acceptance checks**; type/style, build and architecture boundaries passed. The paired count includes the two explicit blocked-@1 assertions and two separate candidate preflights. Existing non-gating style warnings remain.
- PACT: **414 unit, 491 integration/smoke passed; one opt-in real-model check skipped**; type/style, full build, contracts, dependency/build-order and boundary checks passed.
- New PACT ownership/renewal/restore checks: **18**. Candidate schema/selection/missing-policy checks: **5**. Full paired source, original-profile parity and retained receipt/accounting tests passed.
- Self-review remained inline. Review covered ownership/teardown, partial lease acquisition and revocation, exact version/namespace isolation, dynamic schema/evidence references, and the difference between fake preflight and operational launch readiness.

## Approval boundary and remaining work

The concrete review choice is whether to amend the pilot baseline to **`reactive-cognition@1.1` + `negotiation@1` view + shared schema**, with v1 continuity and all original budgets. The frozen design/cells/proposal remain intact; no E1/E2 selector was silently broadened. If adopted, E1 cell IDs, configuration/source/policy digests and the baseline side of future E2 comparisons must be explicitly revised and re-reviewed. This does not select specialists or start E2–E4.

A truthful final launch approval still requires the plan's **P2 owned execution composition** and the rest of **P3**: the fixed Windows bundle/owned database route, process/artifact guards, per-response manual review after usage settlement, five-minute same-live renewal and fail-closed admission, encrypted operational evidence, an actual fenced eight-account/four-actor roster, restore proof of that final roster, and a confirmed UTC window. They were not substituted with the disposable test driver. The CLI still lacks owned execution ports, and the candidate cannot be authorized through the original protocol.

No final operational identities, bindings, private keys or executable grant were fabricated. The old 07:00–13:00 UTC proposal is not a scheduled or carried-forward window. The model and numeric settings remain the original pinned Nemotron proposal, explicitly identified in the manifest draft. The separate packing repair is ready for source/baseline review; **E1 launch is not ready for approval**.

F02–F06 supply exact architecture versions and scoped host services; the repository version fix strengthens that foundation. N05 supplies the audited observation view; v2 negotiation memory remains separate. Specialist F6, F07/F08 and A/K work are unchanged. No behavioral release gate is cleared by these offline results.

Detailed logs, including original red preflights and final verification, are retained outside Git in an owner-only authenticated encrypted archive with a separate key: **27 files**, archive SHA256 `2d1694cef0ba3ab55d60b740065113c1ce10ed91ec1c2bb5500eb134619f8015`. Authenticated decryption and private file/directory permissions were verified. Public source contains only aggregates and descriptors.
