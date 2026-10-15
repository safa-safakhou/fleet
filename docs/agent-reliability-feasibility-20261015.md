# Goal and authority feasibility

AR-P09 / PACT-179 and AR-F09 source acceptance, 15 October 2026. No owner authority alternative is selected or activated.

The authenticated start guide derives pact.goal-feasibility.v1 from the current rules, Hall level and observed full ceilings. Fleet retains the projection with core owner intent/authority during packing. Missing authority is unknown, not zero permission; costs are per upgrade, not a complete stock/prerequisite path. The current quote remains the authority for immediate admission and overlaps. Waiting may release rolling spending; it cannot raise the full ceiling. Receiving a trade changes stock, never permission.

| Target Hall | Iron whole | Silver whole | Required Farm / Barracks / Storehouse | Original 1,000 whole ceiling |
|---|---:|---:|---|---|
| II | 180 | 90 | II / II / I | Per-action cost fits; actual headroom still required |
| III | 540 | 270 | III / III / II | Per-action cost fits; actual headroom still required |
| IV | 1,260 | 630 | IV / IV / III | Iron cannot fit even after rolling releases |
| V | 2,700 | 1,350 | V / V / IV | Both cannot fit |
| VI | 4,500 | 2,250 | VI / VI / V | Both cannot fit |

Costs and prerequisite rule are in packages/domain/src/rules-catalog.ts (upgradeCost/checkUpgrade). One whole resource is 600 ledger units. Storehouse capacities and ordinary/founding/locked provenance remain separate; preceding Halls, stock, builders and floors must all be reachable. Hall I–II / III–IV / V–VI are comparison filters, not promotion payouts or protected combat leagues. Current mechanics offer no territory expansion, and autonomous Court creation/joining/publication or political signatures remain unavailable. Such goals must be scored unsupported/unresolved, not model failure. A declared bounded construction goal uses the actual next-level quote; free-form ambition is not automatically converted into a command or certified feasible.

The unresolved owner choice has three valid alternatives: constrain the goal to the current authority path; approve an exact chosen action using the existing authenticated proposal/approval flow; or review a bounded mandate version. A proposed minimum ceiling is the sum of legacy spending, still-live rolling spending, existing reservations and explicitly intended NEW, disjoint reservations within the chosen 24 GAME-hour cadence. The pure proposedAuthorityMinimum helper rejects negative inputs and makes no write. For example 100 spent + 20 legacy + 300 reserved + 1,260 new Hall + 180 new Storehouse = 1,860 whole, before considering whether those are the intended actions or stock can support them. This is a worked proposal, not a recommendation to grant that amount to every account. A reviewed change would record exact account/action set, version, resource floors, troop/session limits and restoration of the prior version without discarding later game effects. Existing server exact approvals and reserve checks remain unchanged.

Verification: PACT 383 unit tests, 55 affected social-command/world-view integration tests, full build/typecheck/lint (including boundaries/build order and 26 frozen v1 schemas) pass. Fleet 133 unit and full 192 integration tests, check/build/boundaries pass. Rules-derived fixtures distinguish Hall III temporary headroom from Hall IV permanent ceiling, unknown authority, bounded proposals and unchanged owner intent. Original replay fixtures remain. This is source feasibility acceptance; owner goal/authority selection, actual approval/mandate change and live progression remain gated. No policy, economy, cohort, inference or deployment changed.
