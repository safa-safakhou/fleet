# Reactive trade direction and bonds — 20 October 2026

Status: implementation/verification in progress, owned inline by Codex under the founder's explicit trade-fix-and-one-turn assignment. Preserve145 turns/193 executions and12 original actors, owner goal version3, mandates/models/budgets/anchors, queues/training and all prior failed attempts/closed gates. No other actor, worker, extra live turn, replay/reset/cancellation, push or server/other-population change.

The retained C0 supply proposal treated outgoing Iron as incoming Hall stock and used500,000-Grain bonds. Exact PACT replay rejects BOND_EXCEEDS_FLOW. The adapter had no structured assertion of the model's send/receive interpretation, no semantic bond checker, and no numeric bond formula from the guide. Bare valid action shapes and persuasive summaries were insufficient.

The repair adds an optional game-neutral expectedOutcome-schema/validation-feedback seam to the existing Proposal contract. PACT supply offer/counter generation requires an explicit `expectedOutcome.trade.youSend/youReceive` statement outside the unchanged bare action payload. PACT checks the statement against actual creator/original-offer A/B directions before command preparation. Rejections provide the actual perspective, every detected rule issue and exact per-resource bond maxima; the model can correct within its unchanged native turn allowance. Summaries are not parsed with regex and payloads are never silently reversed or rewritten.

PACT publishes a read-only versioned supply-rule descriptor from its canonical admission parameters/value function. Fleet consumes that observed descriptor for duration/notice/expiry and relative-value bond checks, and narrows the creator's outgoing rates only by the game's observed storage-capacity rule. Peer capacities/stock/interest remain unknown; unsigned offers remain nonbinding and stock/floors/signatures stay server-enforced. Missing rule pages require a read before non-null bonds; bond-free negotiations remain available. Large-number bond multiplication is corrected to exact integers in PACT, with a red-to-green boundary case. No economic constant, mandate or permission is changed.

New regressions were observed red for missing publication, the retained excess bond, reversed/missing direction statements, counterparty roles, parameter combinations, observed rate caps, generic feedback forwarding and integer precision. Final checks, source/install pins, the single actual new turn and preservation/restore outcomes will be recorded below. Offline tests do not prove actual useful Hall work.

## Verified source checkpoint

Final Fleet checks:291 unit,404 integration and14 paired acceptance tests passed (709 total). Paired tests compare144 canonical/local boundary decisions and prove a real unsigned offer commits without resources/contracts; server rate admission also rejects an excessive outgoing flow. The first paired run exposed missing SupplyService wiring in the new fixture; correcting that fixture passed all14. The full integration run retains the fixed24KB memory case and all production envelopes. No golden fixture or legacy controller body changed.

Native `npm run check`, `npm run build`, `npm run check:boundaries`, `npm audit --omit=dev` and `git diff --check` passed;26 existing warnings/15 infos remain,0 errors. PACT packages/API builds,408 unit tests,18 affected supply integration tests, typecheck, boundaries, scoped Biome, zero-vulnerability audit, backlog181/37 and diff checks passed. An encrypted paused145/193 pre-install checkpoint is retained. Installation and live behavior remain to be assessed below.

## Installed-context follow-up

The first local installation was PACT fb7a1ba / Fleet dac40b7 with no actual inference. The read-only six-actor packet check exposed a new cognition-only context regression: trade metadata/schema overhead left no room for even one observed peer. The adapter still failed closed, retaining owned facts and the48KB limit. A red-to-green regression now groups resources with identical observed rate caps into one equivalent flow schema, also testing unequal caps independently. Repeated guidance is shortened; direction claims, numeric bounds, whole owned facts and unknown-peer semantics stay intact.

The resulting fake-provider check passes all six real authorized observations: reactive-basic37,486–37,990 bytes and reactive-cognition47,614–47,906 bytes, with at least one observed peer, complete core/authority comparisons and valid/invalid trade probes. These checks use zero inference and zero game commands. Final regression results and the actual C0 outcome follow below.

Final compact-source verification passed:292 unit +404 integration +14 paired acceptance =710 tests, native type/Biome/build/boundaries/diff checks passed. Installed packets preserve the48KB allowance and core facts; model/game activity is still zero for this assignment at this checkpoint.
