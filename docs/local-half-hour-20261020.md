# Thirty-minute local world observation —20 October 2026

The same twelve original kingdoms ran across all four fleet types for thirty elapsed minutes. The run produced real building development and supply delivery, together with recurring context failures and weak/redundant planning. It does not establish a generally healthy autonomous system or an architecture ranking.

## Window and preservation

The fresh `half-hour-20261020` interval was **08:48:44.581–09:18:44.581 UTC**, or **10:48:44.581–11:18:44.581 Berlin**, exactly 1,800,000 ms. No aggregate model/helper-call, token, turn or action ceiling was added. Original identities, credentials/bindings, owner goals, mandates, model settings, budgets, schedule anchors, queues, all 147 prior turns/195 reported executions and original closed gates were retained. No actions were scripted, failed identity replaced, uncertain action replayed or mid-run gameplay/model tuning applied. Other local/server populations were untouched.

The native 15-minute reviews, reactive event wakes, one shared inference slot, per-operation three-call/three-action structure and 48 KB input envelope remained. Output allowances stayed 4,096 for legacy loop and 2,000 for the other groups; total call/token/deadline fields stayed null. These starting-state and execution differences limit comparisons.

The operator gate was extended from exact one-hour support to also accept exactly thirty minutes. Five existing gate tests plus a new boundary/invalid-duration regression passed after the new regression first failed on the old source. Fresh `npm test`: 281 passed/18 skipped; type/style check passed with 26 existing warnings / 15 infos; build and import boundaries passed. Full integration/paired tests were not rerun or claimed as new acceptance. Fleet launch source was `45abda8`; PACT source was `0820771` with installed application unchanged from `fb7a1ba`. Only the Fleet run-window artifact changed from the prior verified installation. All 1,630 installed hashes matched before launch and after completion.

## Achievements by group

Actor labels A1–A3, B1–B3, C1–C3 and D1–D3 correspond to native ordinals 0–2 in each group. Thus C1 is the original Hall-focused C0 actor.

| Group | Turns | Reported model calls | Committed commands | New building orders | Upgrades completed (new / inherited) |
| --- | ---: | ---: | ---: | ---: | --- |
| Legacy loop | 7 | 12 | 2 | 2 | 3 (1 / 2) |
| Legacy cognition | 8 | 11 | 2 | 2 | 2 (1 / 1) |
| Reactive basic | 18 | 22 | 15 | 0 | 0 (0 / 0) |
| Reactive cognition | 13 | 6 | 2 | 1 | 0 (0 / 0) |

All three original actors in each group reached at least one turn. Committed commands include offers and signatures; they are not all distinct productive outcomes. Native WAIT bookkeeping can accompany a committed action, so outcomes were classified from actual actions and original game receipts.

- **Legacy loop:** completed upgrades: A2 Mine II (inherited), A1 Market II (inherited), A2 Storehouse II (new). New building orders still pending: A1 Wall II waiting. Turn codes: `{"WAIT": 7}`.
- **Legacy cognition:** completed upgrades: B1 Barracks II (inherited), B2 Farm II (new). New building orders still pending: B1 Hall II waiting. Turn codes: `{"WAIT": 8}`.
- **Reactive basic:** no building upgrade or new building order; five new supply offers and ten signature commands, producing two active contracts. Three of those signature commands repeated an existing signer/offer/version. Its inherited one-Spearman batch completed. Turn codes: `{"WAIT": 18}`.
- **Reactive cognition:** completed upgrades: none. New building orders still pending: D1 Wall II waiting. Turn codes: `{"CONTEXT_LIMIT": 9, "WAIT": 4}`.

The pre-existing reactive-basic Spearman batch completed; this is one inherited trained troop, not a new training order. No Hall II completed. The selected Hall-focused kingdom still has completed Farm II / Barracks II and a resource-blocked Hall II, with its original instructions retained.

## Interaction, planning and reliability

There are **2 new active supply contracts**. Settlement totals below are actual committed transfers; a signed contract alone is not counted as delivery. One whole resource unit is 600 internal marked units.

- Iron: 34 installments, 1,360/600 units delivered (about 2.267); all due units paid, no overflow or failure marker.
- Silver: 34 installments, 2,720/600 units delivered (about 4.533); all due units paid, no overflow or failure marker.

Both active contracts connect C2 and C3, the merchant/diplomat reactive-basic kingdoms. C2 sends 4 Iron/hour and receives 8 Silver/hour under each: the second is economically a duplicate despite the reversed A/B labeling. The thirty-minute observation proves initial settlement only, not sustainable fulfillment of their 24-hour terms. Additional repeated/opposing offers and re-signing already signed offers are activity, not separate strategic achievements.

The original C1→D3 offer remains part of history. New cross-group interest also includes D1→C2: an outgoing 4 Iron/hour offer for one hour with no return leg. It is a one-way offer, not resource acquisition. Both cross-group offers remain open; there was no active cross-group contract. Among six newly created offers, two became active, one expired and three remained open. No successful direct message, contact establishment, scouting or raid occurred.

Reactive basic submitted an INVALID_COMMAND raid attempt. Some later Hall reasoning again described completed prerequisites incorrectly, and at least one claimed Hall-building action actually signed a supply offer. The wait-state guard also rejected stale factual waits. These observations prevent treating accepted trading commands as proof that Hall planning is solved.

Reactive cognition hit CONTEXT_LIMIT on nine of thirteen turns. Eight failed before any model dispatch; one followed two reported responses and a rejected stale wait, demonstrating that correction/context continuation is also affected. The other four turns finished with native WAIT bookkeeping, including its accepted Wall II order and outgoing Iron offer. No session-collision or output-truncation failure was recorded. All model usage was reported. No source fix or manual gameplay intervention was applied during the window.

## Usage and closure

- Legacy loop: 86,440 input/6,908 output tokens; 0 helper requests; 0 legacy and 0 modern continuity updates.
- Legacy cognition: 94,331 input/9,142 output tokens; 11 helper requests; 11 legacy and 0 modern continuity updates.
- Reactive basic: 229,886 input/22,372 output tokens; 0 helper requests; 0 legacy and 0 modern continuity updates.
- Reactive cognition: 70,414 input/4,526 output tokens; 0 helper requests; 0 legacy and 3 modern continuity updates.

The run added **46 turns, 51 reported model executions and 21 committed commands**. Reported usage was 481,071 input / 42,948 output tokens (524,019 total); the 2,040,000 reserved tokens are allocations, not reported consumption. Largest complete requests were 31,334 / 34,969 / 47,752 / 47,596 bytes for A/B/C/D. Continuity/helper activity does not establish useful learning.

Final lifetime totals: **193 turns/246 reported executions**. Zero active turns, pending commands, unknown/reserved allocations or active actor blockers. All twelve actors/credentials are ready; groups and world clock are paused at tick 169. The owned worker stopped and its PID file was removed; the new and historical gates are closed. Existing orders, offers, active contracts and all failures remain recorded. No continuation is implied.

Observer: 60 samples, 0 read failures. No new turn started at/after the deadline and no committed receipt was late. One already-dispatched response returned 17.836 seconds after cutoff. Its proposed supply offer was refused with RUN_WINDOW_CLOSED before game submission; its usage was accounted without cancellation. The closed-file update was 1 ms after the deadline; the gate checks the wall-clock boundary directly, so admission does not depend on that file-update timing. Controller completion was 21.041s after the deadline; this drain is separate from gameplay admission.

All 21 committed commands were independently read back through their original authenticated receipts and matched server records. Old settings/bindings/history/windows were compared exactly; owned before/after reads confirm all twelve goals and mandates unchanged, and existing jobs were not cancelled. After those reads, the final verified snapshot was restored to a disposable network-isolated PostgreSQL clone and complete rows compared in 10 core PACT and 39 Fleet tables. The clone was removed. Dumps, keys, credentials, model packets and private runtime evidence stay outside Git.

This is a separately authorized local observation, not a reopened roadmap ticket, hosted-CI claim, deployment or permission for another run. Reports and the small gate support change are committed locally; nothing is pushed.
