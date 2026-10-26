# Audit of the six doubled-input wait responses

**Verdict: waiting for the operator to resume was justified in all six supplied states.** Each actual request delivered `worldStatus: paused` in both its world and guide. Each response explicitly cited that pause and said to reconsider when the world became active. These were paused-world decisions, not evidence of failure to act in an active world.

This corrects the interpretation of the [input-allowance comparison](input-allowance-comparison-20261025.md). The larger requests were admitted and the decisions were waits, but describing those waits as continued behavioral passivity omitted their actual reason. The experiment establishes packing/provider behavior and appropriate pause recognition; it cannot establish whether the model would take useful action in active play.

## Checks against actual state

The six saved native snapshots were compared with current native owner views using database connections forced read-only. World status, tick/game time, balances, buildings, builders, training and authority matched for every case. Current native contact/request/offer/contract views matched too. Clock remains paused at tick 633.

All six kingdoms have the same relevant economic/development situation:

- Seven buildings at level I; two idle builder slots; **zero queued construction orders**.
- Ordinary stock: **211 iron, 105.5 silver and 232.1 grain**. Separate construction allowance: **200 iron, 100 silver and 80 grain**. No mandate reserve floors are specified.
- Farm II costs **40 iron / 20 silver**; Barracks II costs **80 iron / 40 silver**. Both are stock-affordable with prerequisites satisfied. Hall II still needs Farm II and Barracks II.
- The delivered briefing identifies six local construction candidates (Barracks, Farm, Market, Mine, Storehouse, Wall upgrades), plus eight visible potential introduction targets. These are local resource/prerequisite opportunities, **not globally admitted actions**.
- No contacts, pending contact requests, open supply offers or active supply contracts in the checked views; delivered social attention is empty and marked complete. There is no delivered pending social request that these responses ignored.

Pause blocks the relevant mutations before execution. The production API connects gameplay admission to [WorldClockService.admitCommand](../../pact/services/api/src/main.ts), whose [paused branch](../../pact/packages/world/src/service.ts) returns before invoking the mutation callback. The [dispatcher](../../pact/packages/application/src/dispatcher.ts) returns `WORLD_PAUSED`. Construction, training, introductions, messages and supply actions all use the `game.*` path. Authorized reads remain possible; old receipts can still be retrieved. No commands or quotes were submitted to verify this branch.

## Individual responses

| Saved case | Actual wait explanation | Assessment |
|---|---|---|
| v1 `1-1` | Paused; cannot proceed with upgrades/actions until status changes. | Wait justified. Summary talks about queued upgrades although there are no orders. |
| v1 `1-2` | Paused; production/trade cannot advance; reconsider when active. | Wait justified. Queued-upgrade wording is misleading; actual queue is empty. |
| v1 `1-3` | Paused; cannot queue or complete builds until unpaused. | Wait justified. Summary again refers to queued upgrades without actual orders. |
| v1.1 `1.1-4` | Paused; waiting for game-state change; correctly reports no queued upgrades. | Wait justified. Its “No fresh intent or action required” wording adds no necessary condition; existing owner intent remains standing guidance for after resume. |
| v1.1 `1.1-5` | Paused; cannot queue or complete builds. | Wait justified. Queued-upgrade wording and proposed reflection are imprecise; no reflection was committed. |
| v1.1 `1.1-6` | Paused; cannot proceed with upgrades/trades until unpaused. | Wait justified. “Only constraint” overstates the position if applied to Hall II, which also has building prerequisites. |

All six correctly reproduce the delivered completed-level map and empty queued-phase map. Waiting **because of a resource shortage** would not be supported by the available construction stock; none actually gives shortage as its explanation.

## Remaining quality and validation gaps

All six use the enum code `resource_reserve` despite explaining a pause. The current wait schema only offers `different_owner_priority`, `resource_reserve`, `risk_review` and `deliberate_pacing`; it has no explicit pause reason. The [wait validator](../src/games/pact/goal-state.ts) checks the factual building/queue basis, opportunity revision, an allowed reason code and nonempty bounded explanation/reconsideration strings. It does not prove that the prose matches the enum or certify every narrative claim. Thus the earlier “factually valid waits” wording should be read as **accepted factual basis**, not certification of all response prose.

The opportunity calculation labels local construction/introduction candidates as actionable without incorporating global pause. Raw world status still reached all six models, and they correctly recognized that stronger admission constraint. Eligibility before the world gate and availability for immediate execution should be distinguished in future presentation/validation work. No source behavior was changed in this audit.

There is no evidence from these six to claim the model is unable to initiate work while active. Conversely, they do not qualify active play or explain earlier waits in the running world. Those are separate observations. A future active-behavior evaluation would need a clearly separate simulated active environment while preserving the real world's pause; none was run here.

## Preservation

No model/tokenizer/provider calls, new trials, game commands, service starts, deployment, settings changes, uncertainty review or database writes. Only scoped native reads and private derived evidence were used. Both previous test providers remain stopped. Unknown allocations and the authorized 20-at-64,000 / four-at-32,000 input settings remain unchanged; E4/KQ1 blocked.

Private per-case checks are retained under the comparison root's `wait-audit/verified.json`. Credentials, raw responses and peer correspondence are not included in this report.
