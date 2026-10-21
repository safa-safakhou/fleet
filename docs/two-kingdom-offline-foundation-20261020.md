# Two-kingdom negotiation: offline foundation checkpoint — 20 October 2026

Historical first-slice checkpoint. See the [completed source/offline continuation](two-kingdom-negotiation-source-acceptance-20261020.md) for the current source state; the original results below are preserved.

This is the first implementation slice, not final milestone acceptance. F00/F01 and N01/N02 are complete. F02–F06 and N03–N08 remain open. G0 is not cleared; E1–E4 are unapproved and unstarted. No new model/helper execution, live game run, installation, deployment, push or recovery review occurred.

## Sources and preservation

The plans were committed first on local master: Fleet `659f914`, PACT `dc672ea`. Source work is isolated on `codex/two-kingdom-offline` in paired worktrees; the masters retain only the planning commits. Implementation checkpoints: Fleet `fd39b37` (F00), `2e3fdf7` (F01), `1a52efa` (N01), `0b05ea2` (progress); PACT `ed7f750` (N01), `fcd0aa2` (N02). This report adds documentation to those revisions.

Retained runtime databases, installations, paused worlds, actor identities, allocations, unknowns and private evidence were not opened or changed. This is a source-work preservation statement, not a fresh observation of the paused world's state. Only newly owned, nonce-marked loopback PostgreSQL fixtures were mutated. Owned containers were removed after each invocation; retained containers were not stopped. No production PACT rule or migration changed.

## Implemented behavior

- F00 creates disposable loopback fixtures, checks database ownership before migrations/destructive test setup, strips inherited runtime/provider configuration from child processes, routes PACT unit/integration configs, and cleans up only its labelled container. Abort during fixture creation is covered.
- F01 pins complete decision-visible fake-provider packets, commands, accounting, continuity and recovery outcomes across the five existing profiles. Ten scenarios include unknown spend, corrective output, zero dispatch, stale specialist proposals and sibling failure. Seeded legacy-owned rows survive repeated migration, recovery and original receipt reconciliation unchanged.
- N01 freezes C01–C06 states, private goals, consent/settlement evidence and E1–E4 limits in matching manifests. Strict outcome contracts use decimal internal-unit strings and require exact signed offer versions/terms. Public evidence excludes message bodies and private interpretations. Cell generation grants no execution authority.
- N02 creates two normally onboarded founders per independent world, binds actor reads to ownership and commands to authenticated synthetic agent principals, and uses normal mandates, delegation, write leases, shared dispatcher, canonical receipts and every ordinary tick phase. The evaluator's database handle is separate from actor adapters. Solo controls have separate identities/database schemas and refuse interactions.
- The 2 Iron/hour for 1 Silver/hour reference settles exactly 60 installments per direction and expires naturally. At the same final refill boundary, A has donor Iron unchanged and Silver +600 internal units (+1 whole); B has donor Silver unchanged and Iron +1200 (+2 whole), versus a separate no-interaction control world. Benefit requires a recognized desired resource, current frozen goal limits, no resource decrease and no unmet/defaulted contract.
- C02 uses the original synthetic goal for its seed, then the normal owner-goal amendment. Countering invalidates the old version; revoked supply authority and expired offers reject. C03's legal unfavorable exchange loses B 6000 internal Silver (10 whole). C05 produces actual fulfilled/defaulted contracts through settlement, retains ten newer actor observations and labels scripted prefix commands. C06 creates no social activity.
- Cross-world actor/cursor/record access, another owner's receipt, modified cell limits, unknown goals, mismatched horizons and incomplete coverage do not produce supported success. Same-ID signature readback/retry returns the original receipt without another effect.

## Verification

| Check | Result |
| --- | --- |
| Fleet unit suite | 339 passed |
| PACT unit suite | 414 passed |
| F01 parity, preservation, legacy, recovery, continuity and specialist integration | 67 passed |
| N02 plus existing social-material, supply-offers, supply-settlement, game-command-social and game-command-faults | 99 passed across 7 files (7 new tests) |
| Existing paired acceptance | 14 passed (F00 verification) |
| F00 environment binding / focused ownership guards | 5 / 6 passed |
| Fleet type/style and build | Passed; existing 26 warnings / 16 informational diagnostics |
| PACT typecheck, lint, contract/boundary/dependency checks and package build | Passed; 26 published v1 schemas unchanged |
| Mirrored manifests | Byte-identical SHA256 `c3f2b0664e620852aa8da6cd976c8bda5eddb0fd781438db1b293fa3a451c306` |
| Outcome JSON Schema | Both repositories `d7aafe4e58093eabca682e4e2ac04e3dda2eaa07c77863c60abc96d7f0854403` |

New tests were observed failing against explicit missing behavior before implementation. Two additional hardening assertions failed before whole-cell validation and goal-aware benefit checks. An initial fixture failure correctly exposed missing wiring to the existing outgoing-message allowance service; that fixture wiring was corrected. Expired-offer expectation was corrected to canonical `EXPIRED`. Neither required a production rule change.

Repeat verification from Fleet using the owned runner (after normal local dependency/package builds):

```sh
npm run test:architecture -- tests/integration/architecture-parity.test.ts tests/integration/multi-engine-preservation.test.ts tests/integration/legacy-engine.test.ts tests/integration/model-recovery.test.ts tests/integration/profile-continuity.test.ts tests/integration/specialist-engine.test.ts
npm run test:architecture -- --repo pact tests/integration/negotiation-worlds.test.ts tests/integration/negotiation-lifecycle.test.ts tests/integration/social-material.test.ts tests/integration/supply-offers.test.ts tests/integration/supply-settlement.test.ts tests/integration/game-command-social.test.ts tests/integration/game-command-faults.test.ts
```

## Inline review and limitations

Reviewed actor/peer/version joins, first-signature versus activation distinction, independent obligations, exact costs versus controls and fixture cleanup. No delegation was used. This is self-review, not an independent review.

The new adapter supplies a synthetic server-derived external-agent principal after real guest identity authentication. It proves handler/lease/mandate behavior, not a new OAuth/MCP transport certification. Existing paired transport tests remain unchanged. C05 restores the scripted owner's reserve before later decisions to isolate historical default from a mechanically blocked current offer; that owner intervention is disclosed and is not agent initiative.

Economic controls currently qualify the stateless trade cases C01/C02/C03. A control containing social receipts/history is rejected rather than silently accepted as solo. C05 currently qualifies historical mechanics, not a post-history economic comparison. The controlled clock refuses native E4 advancement. No Fleet-selected negotiation action, later memory use, free-prose factuality rubric, native scheduling or model competence is certified by N02.

Vitest 5 requires a config wrapper for setup files rather than the unsupported setupFiles CLI flag. The native desktop worktree tool rejected UNC ownership; WSL Git created isolated worktrees without changing global trust. F01 omits database-only dedup hashes derived from generated UUIDs, while retaining complete decision-visible packets and episode metadata; existing cognition tests retain dedup coverage. No broad import/boundary exception was added.

## Next dependency

Continue F02–F06: exact-version manifests, transactional launch/configuration, scoped host ports, independent shared-module composition and architecture boundaries. Then N03/N04 can register `reactive-cognition@2` for complete negotiation facts and outcome-grounded memory. N05–N08 add assessment, paired fake-provider lifecycle/fault acceptance, disarmed protocol preparation and final source reporting. Persistent specialist A07/A08 are later consumers; they are not prerequisites for the single-controller benchmark. UI/CLI F07/F08 are separate follow-on work. No real-provider stage follows automatically from any offline pass.
