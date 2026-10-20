# Phase2 — scoped event intake and reactive-basic@1

F4 implements the approved selectable-engine path alongside the preserved legacy engines. Source/offline validation only; no installed release, current cohort, model, allowance, anchor, credential, recovery gate or server Fleet was changed.

```mermaid
flowchart LR
 A[Versioned environment event page] --> B[Explicit cohort wake policy]
 B --> C[Atomic receipts + grouped tasks + cursor]
 C --> D[One coordinating actor lane]
 E[Periodic review] --> D
 D --> F[Fresh authorized snapshot]
 F --> G[reactive-basic@1]
 G --> H[Shared provider + budget admission]
 H --> I[Wait / scoped read / exact command journal]
 I --> J[Original receipt + recovery]
 A --> K[Gap: fresh snapshot + resync token]
 K --> C
```

Related completions share one development task; separate conversation/group references retain separate tasks. All admitted source IDs remain durable, while model-visible references and observations disclose budget omissions. Receipt order never overwrites current environment state. On a gap, Fleet saves metadata-only evidence of the fresh authorized snapshot, advances to the server's resume token atomically, and schedules a named `resync_review`. This is snapshot work, not fabricated historical events.

`WakePolicy` stores explicit `enabled`, selected `categories`, `quietCategories`, and `periodicReviewMinutes` (1–1440). Quiet categories suppress events marked quiet by the environment; unselected/quiet receipts are deduplicated without model work. Periodic reviews continue independently of event arrivals. Conditional waiting (`untilNextEvent`) leaves a task waiting; a new source for that task or a separate periodic review can lead to admitted work. No busy inference loop is created. Long opaque grouping IDs are hashed into bounded task keys; the event IDs remain unchanged.

Intake accepts at most50 events/65,536 normalized bytes per page; PACT's wire page remains32,768 bytes. It commits event receipts, task revisions and cursor together under the binding lock. `fromCursor` compares the page's starting cursor, rejecting stale concurrent pages instead of moving backwards. Per-binding poll locking prevents duplicate network polling. Worker intake is separately supervised and polls at most10 due bindings per batch, normally every10 seconds, with30-second failure backoff. Native versus polled delivery is advertised by each adapter; current PACT delivery is polling. No human session stream fallback exists. Provider routes remain serial in real composition; task overlap cannot expand per-account model or action authority.

The generic engine reasons from a focused task and current owner-authorized observation. It does not use Fleet-generated strategy text as an authenticated owner preference. The adapter supplies its general goal; actual owner instructions come from authorized observations. Waiting, declining, communicating and acting remain available. Bounded scoped reads can precede an action, and every model call goes through the original allowance ledger and shared provider queue. Exact command IDs are journaled before network submission and use the same receipt reconciliation as F3. No unknown usage or uncertain action is replayed. The legacy controller body and existing model input golden fixtures remain unchanged.

## Integration and opt-in

The PACT adapter supports only `pact.agent-events.v1`, enabled in source composition with `FLEET_PACT_EVENT_FEED_VERSION=pact.agent-events.v1`. Omit it for the existing `events:none` compatibility behavior. This config assertion does not enable a remote server: the authenticated MCP catalog must actually expose read-only `pact_agent_events_v1`; missing/invalid capability fails closed. PACT needs its independently reviewed P1 API/worker release and explicit default-off feed flag. Current server/local installations were not updated or qualified.

New inactive cohorts may explicitly select `tasks.enroll(id,{id:"reactive-basic",version:"1"})`, then `intake.enroll(id,policy)` through trusted operator composition. These service methods do not create game accounts, start a cohort or call models. Consumed profiles/policies are immutable. Selecting a different unconsumed engine clears its unused wake policy. Migration015 creates empty tables/columns only. Profile selection UI and release/run qualification are F7/F8; no operator activation or new real-model experiment was performed here.

The worker polls only explicit running wake enrollments. Received events never bypass paused/stopped state, account credential blocks, unknown usage holds, one actor lane, provider capacity or shared budgets. Polling reads use the same account credentials, not owner sessions. Event receipt/gap metadata is pruned after30 days; existing task/command and accounting history remains intact. New fake/live provider qualification is a separate release gate.

## Evidence

| Command | Result |
| --- | --- |
| `npx vitest run tests/unit tests/integration --maxWorkers=1` |446 passed /71 files (165 unit,281 integration) |
| `npm run check` | TypeScript and Biome passed; non-blocking lint warnings/info retained |
| `npm run build` | server and web passed |
| `npm run check:boundaries` | recursive platform/engine boundary passed |
| `npm audit` | zero vulnerabilities |

PACT P1 source is8688586, with contract-test verification7f04bd5:386 unit and447 integration passed,1 existing real-model skip; build/type/lint/contracts/boundaries/backlog passed. No remote host/provider qualification is inferred.

Author review corrected unused wake policy after profile reselection and a transaction-pool starvation regression: a one-slot pool failed with the extra binding lookup, then passed after lookup reused the transaction client. An initial overlap of two Fleet verification commands interfered through shared isolated fixture truncation; the final standalone serial acceptance run above passed. No runtime database was used by tests.

New tests cover grouping/separation, no implicit enrollment/inference, replay/restart, atomic rollback/cursor CAS, gap resync, missed deadlines, a100-event flood, quiet categories, timed/conditional waits, read/action receipts, fresh state after out-of-order sources, input omissions, unsupported capability and unused-policy removal. The PACT transport validates versioned metadata, game clocks/deadlines and invalid gap envelopes. Full legacy/scheduler/recovery/model/receipt tests remain part of the full run.

Local installed-state readback: all22 non-ephemeral table hashes match the preceding phase; same7093cb8 release, three services active,20 agents already `needs_owner`,40 historical unknown allocations totaling1,600,000 retained tokens, zero running turns. The read used a read-only repeatable transaction and recorded only aggregates/hashes. Server Fleet was not contacted.

Limitations: deterministic fake providers prove plumbing, accounting and preservation, not strategy quality, real-provider behavior or live response latency. The basic engine has no F5 belief/relationship continuity or F6 specialists. Feed coverage is explicit and incomplete; events are triggers and references, never a replacement for current authorized reads. Installation and a concrete new run remain separate.

## 20 October trade validation follow-up

Optional `ActionContract.expectedOutcomeSchema` binds model assertions outside server action arguments. Reactive proposals forward the assertion, and adapter refusal guidance/detail reaches the next decision within the unchanged native allowance. Non-opt-in contracts retain their existing generation shape and legacy fixtures. PACT requires checked `trade.youSend/youReceive` for offers/counters and applies canonical observed bond rules. See [implementation and live evidence](reactive-trade-repair-20261020.md).
