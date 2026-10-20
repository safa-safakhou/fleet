# Repaired four-fleet observation —19–20 October 2026

All four types ran on the same local world for the full authorized hour. The 71 turns and 113 actual model responses produced 45 independently verified construction commitments and 34 completed upgrades. Six completions came from orders already pending at the baseline; 28 were ordered and completed within this hour. There was no successful inter-kingdom communication, agreement, transfer, scouting or raid. Reactive cognition produced the most new orders and completions in this run; this is an observation of these twelve actors, not a general architecture ranking.

## Window and setup

`hour-20261019b` ran 19 October 2026 **21:22:10.088–22:22:10.088 UTC**, equivalent to 19 October 23:22–20 October 00:22 Berlin. The registered interval is exactly 3,600,000ms. The gate's closed-file update was 1ms after the boundary; the existing gate checks wall time directly and refused new work at the boundary independently of that update. One reactive-cognition response already in flight returned 20.599s after cutoff, completed as WAIT, and was accounted normally. Draining, worker shutdown and final snapshot finished 23.457s after cutoff. No new committed game receipt has a timestamp at or after the deadline.

The same 12 original kingdoms/bindings participated, three per type. All identities, ownership, model settings, cohort budgets/anchors, mandates, owner goals and existing orders were preserved. C0 retained the prior explicit Hall-prerequisite priority. No model command was scripted, no account replaced, no uncertain action replayed and no mid-run tuning applied. The original hour and every repair pass remain closed and unchanged.

The experiment had **no aggregate model/helper-call, token, turn or action quota**, and no equal-compute mechanism. All four lifetime budgets remained continuous with null total call/token/deadline fields. Normal game rules/authority, 15-minute periodic reviews, reactive event wakes, existing operation/context/transport bounds and the shared inference slot remained. Each operation retains the native three-call/three-action maximum; finishing an operation does not end the group's hour. The previously repaired legacy-loop group retained 4,096 output tokens; the other groups retained 2,000, all within the same 40,000-token per-call reservation and 48KB input allowance. These differences and the unequal starting queues limit comparisons.

Installed Fleet application source was `9770333`; PACT application code was unchanged from the existing isolated installation. Launch protocol/documentation heads were Fleet `39ccc89` and PACT `a787a40`. All 1,626 installed artifact hashes matched before launch and after completion. No hosted/server or historical population was changed, and nothing was pushed.

## Per-group achievements

Counts below are deltas from the quiescent 67-turn/70-execution baseline. Every group reached all three of its original actors. An accepted order may still wait on prerequisites, stock or an active builder; it is not a completed upgrade.

| Group | Turns | Model calls | New committed orders | Upgrades completed during hour | New orders still active/waiting |
| --- | ---: | ---: | ---: | --- | ---: |
| legacy-loop | 15 | 36 | 9 | 7 (5 new / 2 inherited) | 4 |
| legacy-cognition | 13 | 21 | 9 | 6 (5 new / 1 inherited) | 4 |
| reactive-basic | 22 | 30 | 11 | 10 (8 new / 2 inherited) | 3 |
| reactive-cognition | 21 | 26 | 16 | 11 (10 new / 1 inherited) | 6 |

- **Legacy loop:** completed two FarmII, two MarketII, two BarracksII and one StorehouseII upgrades. Five of those seven were newly ordered in the window. A new MineII remained active; HallII/FarmIII orders remained waiting. Four turns ended on local busy-building/slot rejections, including one turn that had already committed a MineII order. The confirmed progress and later failure are both retained.
- **Legacy cognition:** completed two FarmII plus one each StorehouseII, MarketII, WallII and MineII. Five were newly ordered. It queued further HallII, FarmIII and WallII work, with four new orders still waiting. Its 13 turns ended in 12 WAIT and one COMMITTED, without a terminal failure. 21 Laya invocations, 21 accepted legacy cognition updates and one new interpretation were recorded; update counts do not establish memory accuracy or useful learning.
- **Reactive basic:** completed three FarmII, two BarracksII, two MarketII, two WallII and one MineII. Eight were newly ordered. Its selected Hall-focused kingdom now has both **FarmII and BarracksII complete**. Fresh owned checks show HallII's building prerequisites ready, but the stock quote is unaffordable, so HallII remains waiting. Three new orders remained pending.
- **Reactive cognition:** completed three FarmII, three MarketII, two BarracksII, two MineII and one WallII. Ten were newly ordered. Six of its 16 new orders remained active/waiting, including an active MineII and future HallII/BarracksII/FarmIII work. All 21 turns ended WAIT, including turns that committed actions. Six accepted continuity updates were recorded; final modern states still had no memories, reflections, beliefs, predictions or active plan, so material memory benefit is unproved.

All twelve kingdoms still have HallI. The selected legacy kingdom also has FarmII/BarracksII complete and an unaffordable, prerequisite-ready HallII order. Other kingdoms still have missing prerequisites or stock/builder waits. A queued Hall promotion is not counted as a completed promotion.

## Interaction and failure evidence

There were **zero** accepted contact requests, new contacts, delivered direct messages, supply offers/contracts, supplied units, scout operations or raids. No training batch was created. The groups developed independently in this hour.

Reactive basic did try to interact. One trade greeting addressed its own kingdom and returned INVALID_COMMAND; no message/receipt was created. A later action used `game.garrison.offer` while describing an open trade, with a self-targeted recipient/placeholder offer data; that turn ended FORBIDDEN before commitment. These are unsuccessful attempts, not negotiations with another group or evidence of a login failure.

Three reactive-basic training attempts were rejected: archer1 and rider10 returned INVALID_COMMAND; spearman12 returned INSUFFICIENT_STOCK. The generic invalid-command code does not, by itself, identify the exact domain prerequisite that failed. The exported training shapes are valid; no wire-format defect or troop capability certification is claimed from these denials.

Legacy loop's four terminal failures were two OBSERVED_BUILDING_BUSY and two OBSERVED_WAITING_SLOT_BUSY. Saved responses show repeated proposals for already queued buildings or occupied waiting positions after factual corrective feedback. Local preflight prevented those submissions. One failed turn also contained a separately verified successful MineII order; it is not mislabeled a clean turn. Known failures remain in history and the actors remain ready for a separately authorized future run.

All 113 model responses had reported usage, totaling 908,706 input and72,902 output tokens (**981,608 total**). Per-group input/output: legacy loop 213,641/17,458; legacy cognition 146,956/12,984; reactive basic 241,611/22,345; reactive cognition 306,498/20,115. No model execution, output truncation, session collision or context-limit failure was recorded. Largest complete requests were 32,928/35,223/47,485/47,392 bytes respectively, within their configured envelopes. The 113 calls are actual responses; the 4,520,000 reserved tokens are accounting allocations, not reported consumption.

## Closure and verification

The observer recorded 119 samples at roughly 30-second intervals, with zero observation read failures. All 45 COMMITTED building command IDs were independently read back through their original authenticated game receipts and matched server receipts; zero committed receipts were late. Accepted orders/completions were checked against actual construction records, not model summaries. Failed remote/preflight attempts are retained separately and were not retried by the operator.

Final state: **138 lifetime turns/183 reported executions**, 12 original actors/credentials ready, zero active turns, unknown/reserved allocations, pending commands or active agent blockers. Historical reasons (including busy/FORBIDDEN) remain visible. The previous 67 turns/70 executions and original kingdom/cohort identities were retained. All four cohorts and the game clock are paused at tick136 (60 new ticks); the owned worker is stopped and its PID file removed. The original and new hour gates are closed. PACT/Fleet health checks passed.

Independent before/after/final verified snapshots remain encrypted privately. After all receipt/owned reads, `hour-20261019b-verified` was restored into a disposable network-isolated PostgreSQL clone, comparing complete rows in 10 core PACT and 39 Fleet tables; it passed and the clone was removed. No dump was restored over live gameplay. Runtime keys, credentials, raw responses and private state are excluded from Git.

No application source changed for this observation. Existing installed-source acceptance was 266 unit/403 integration/12 paired checks; those were not rerun as a new release claim. Fresh operator syntax checks, source/artifact verification, identity/budget/anchor checks, receipt readbacks, planning render/check, diff checks and the restore test supply this run's acceptance. Author review was inline without delegation. This was a founder-assigned observation, not a reopened roadmap ticket or hosted-CI/deployment certification.

Private evidence includes the new window/provenance/baseline/cutoff/final/completed records, 119 aggregate observations, final metrics/details/terminal failures, encrypted owned observations, receipt/achievement proof, verified snapshots and restore verification. Further gameplay is not implied by this completed hour.
