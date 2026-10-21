# Autonomous specialists: final source acceptance

Executed inline on21 October2026 against the approved20 October source plan. **All26 source tasks F00–F08, A01–A08, K01–K07 and X01–X02 are implemented and offline verified. Production readiness remains unqualified.** This report closes source implementation; it does not close E1 operational preparation or real behavioral gates.

Verified code: Fleet `93adbe6d391e820b908e4715d80207581f1dc8d8`; PACT `75749557aa0390d32518e4bd300012ac4411c8cf`, in isolated sibling worktrees on `codex/two-kingdom-offline`. Later documentation commits do not change these code revisions. Original repositories, histories and private evidence remain preserved; no merge or push occurred. See the [machine-readable status](autonomous-specialists-status-20261020.json), [implementation evidence](autonomous-specialists-implementation-20261021.md), [operator workflow](autonomous-specialists-operations.md) and [paired PACT report](../../pact/docs/implementation/reports/autonomous-specialists-source-acceptance-20261021.md).

## Delivered scope

| Tasks | Implemented and exercised |
|---|---|
| F00–F06 | Fresh owned fixture runner, preserved original-profile parity, exact versioned manifests, scoped host services, independent engine/module boundaries. Prior negotiation N01–N08 remains offline complete. |
| F07/F08 | One authenticated API/UI/CLI launcher; exact architecture/version, CAS drafts, readiness and idempotent explicit start. No automatic activation. |
| A01–A04 | Encrypted persistent specialist charters/goals/memory; independent two/four-role decisions, addressed durable event/message delivery, source-bound context and bounded planning. |
| A05/A06 | Shared claims and conflict negotiation, one canonical actor action lane, bounded causal roots, stable original command IDs and uncertainty recovery without replay. |
| A07/A08 | PACT read-only effects quote and authoritative SERIALIZABLE guarded admission for eight native action classes, paired adapter/presets and explicit compatibility failures. |
| K01–K03 | Immutable scoped skills, explicit publication/adoption, bounded outcome-grounded learning/retrieval, trusted qualification and static32-node/depth-two language. |
| K04–K06 | Finite parent/role/invocation work, durable checkpoints, original-receipt recovery, dependency/source invalidation and narrowly guarded existing-supply-goal reuse. |
| K07/X01 | Complete learning/reuse cost and outcomes; authenticated private inspection and sanitized sharing, manifest-driven controls and synthetic browser review. |
| X02 | Final full paired suites, seeded preservation/repeated migration, final regression fixes, private evidence restore and disarmed operational handoff/proposal. |

Fleet migrations024–036 are additive;023 already belongs to the separate packing candidate. No applied migration was renamed. PACT action support is documented in its [effects matrix](../../pact/docs/implementation/agent-action-effects-matrix.md): message.send, contact.request/answer, building.queue, training.queue, supply.offer/counter/sign. Existing permissions, leases, native receipts and counterpart authority still apply. Effects describe complete owner-local coordination; opaque dependencies protect private counterpart state. F6's separate coordination protocol is still unsupported in PACT. All new runtime flags remain default-off; nothing was installed.

## Final verification

| Repository/suite | Passed | Skipped |
|---|---:|---:|
| Fleet unit |462|0|
| Fleet integration |546|0|
| Fleet paired/acceptance |38|0|
| PACT unit, including packages/apps/services/workers |415|0|
| PACT integration/smoke |499|1|
| Total |1960|1|

The one skip is the explicitly opt-in real loopback model check in PACT `tests/integration/script-baseline.test.ts`; it was intentionally not enabled. Authored fake model callbacks are used throughout source qualification; these counts are not real-provider calls.

Fleet `npm run check`, `build`, `check:boundaries` and all three `test:architecture -- --suite` modes passed on the final source. PACT `typecheck`, `lint`, full `build`, `check:contracts`, `check:boundaries` and both corresponding `test:architecture -- --repo pact --suite` modes passed. Existing non-gating Fleet style diagnostics and PACT frontend chunk-size warning remain; they do not certify performance or browser behavior.

Fresh nonce-owned PostgreSQL fixtures exercised actual native handlers, receipts, accounting, migrations and host recovery. The final positive skill lifecycle creates one original command, commits61 complete world ticks/120 supply installments, verifies matching clock/outcome, and reuses without another model call. Separate later learning request/extraction uses two ordinary allocations; including the initial goal turn the fixture has three fake model calls. A commit receipt alone never means fulfilled delivery.

## Failures found and repaired

The strict24000-byte rerun exposed previously oversized paired fixtures: all eight first failed before inference. The new profile now explicitly selects the adapter-owned `specialists@1` view, preserves mandatory current own facts/whole requested answers, and marks omitted derived/history detail unavailable for scoped reads. Final preset packets are18873–19788bytes; prior-goal/learning packets21988–22373bytes including messages/schema. No grant increased. Foreign adapters receive no guessed policy; mandatory data that cannot fit still stops admission. This does not amend the frozen negotiation baseline.

Six original-trigger crash regressions first failed, then passed after stable native task-source triggers and persisted wait/resume handling. An active1000-entry meter-eviction regression first failed, then passed with counters retained through the operation's finally block. A future-dated delivery regression first failed, then passed; full ordinary production clock/rules now drive the paired fixture. Qualification fingerprints include helper implementations/native schemas, so changes invalidate prior evidence. Reference-only observations cannot manufacture learning provenance. Earlier measurements/results retain their historical source scope in the incremental report.

The final review was inline author self-review, as required by the no-delegation instruction; no independent reviewer was used. X01/X02 did not record a standalone missing-module RED; their acceptance draws on targeted regressions and prior task RED evidence. Completed checklist items describe delivered/final-verified outcomes, not an invented test-first history. Static synthetic browser QA opened actual goal/skill disclosures and verified escaped peer text; this does not certify a full browser login/provision/start workflow.

## Preservation and evidence

The retained paused world and retained databases were **not accessed**. No real model/helper/provider call, live-game run, operational account, installation, deployment, flags/settings change, reset/replay/cancellation, recovery review, push or delegation occurred. Only nonce-owned synthetic fixtures and a disposable synthetic UI preview were used; preview was closed and fixture teardown is checked separately. No fresh retained-runtime health claim is made.

Detailed logs, including genuine RED regressions and final suite logs, are outside Git in an authenticated AES256-GCM archive with a separate owner-only key. 34files; SHA256 `3f39d4356f9b7daafe4da358274a43a6c7a713d683ee9120737785a7c7b4bf94`; authenticated decrypt/restore and private permissions verified. This new archive does not replace the earlier27-file E1 preparation archive. Public files contain aggregate descriptors, no key, runtime database or private dialogue.

## Exact remaining path

1. Review the frozen E1 baseline amendment. Original `reactive-cognition@1` still fails CONTEXT_LIMIT for both actors in both cells with zero spend. Separate `@1.1` passes authored fake preflight but remains unregistered/unadopted, with only six bytes observed worst-case margin. New specialist packing does not replace this control.
2. Complete E1 P2 owned Windows execution composition and P3 fenced final roster/bindings/restore/new UTC grant. The offline harness is not the operational launcher. The [disarmed source handoff](negotiation-E1-source-handoff-20261021.json) preserves the original manifest and leaves execution source/bundle/roster/window/grant null. **E1 launch is not ready for approval.**
3. Conduct separately approved E1 diagnostic, E2 development, E3 held-out and E4 native-timing stages, with their original hard ceilings/critical-failure stops. No stage has started or behavioral gate cleared. E3 retains9/10 positives (at least4/5 each),15 negative cases,9/10 history (at least4/5 each), and zero critical consent/delivery/authority/privacy/duplicate failures.
4. Separately review the [specialist/skill KQ1 proposal](autonomous-specialists-qualification-proposal-20261021.md): eight cells,96 native role turns, at most288 calls/11520000 reserved tokens, unchanged per-call caps and full non-model/learning/fallback costs. It is diagnostic and unapproved.
5. Qualify the repaired frozen candidate, then approve artifact installation/backup/restore/rollback rehearsal, disabled acceptance, activation and bounded observation. Real behavior, scaling and production operation remain unproven; source tests cannot establish that all possible bugs are absent.

The approved autonomous-specialist **source plan is complete**. The separate operational/behavioral work above remains open and was not silently converted into execution authority.
