# Mandatory native run repairs implementation plan

> Inline execution with existing main master workspaces. Use executing-plans and test-driven-development. User/repository instructions override skill delegation/worktree/commit defaults; no delegation or unsolicited commit/push.

**Goal:** repair demonstrated native-run failures with minimal changes, verify offline, deploy a bounded same-world continuation and inspect a couple of real turns.
**Architecture:** extend existing process supervision, credential broker, coordinator and input fitter; keep PACT authoritative. No new service/framework/model. The user approved the minimal mandatory scope after the [investigation](../../run-failure-investigation-20261025.md).
**Stack:** existing Node24/TypeScript/Postgres17/Fastify; installed pinned Nemotron4B/vLLM only for the final authorized live check.

## Constraints

- Work inline on master in mine/fleet and mine/pact; preserve pre-existing dirty edits and private evidence.
- World remains paused until offline checks and deployment preparation pass. Existing closed segments/operator-stop records remain retained; a new continuation records this user authorization.
- Preserve identities, goals, mandates, budgets, original accounting, schedules, pending commands and four unknown allocations/three held actors. No recovery/uncertainty review or replay. E4/KQ1 blocked; no GUI.
- Final live check is two scheduled fleet-wide rounds, bounded to 30 minutes; user selected this scope. No new 24-hour soak.
- Fake providers and fresh isolated synthetic databases only for offline tests. No network/model calls within DB transactions. No unexplained retry loops.

## Tasks and verification

- [x] 1. Credential lifetime: src/games/pact/credentials.ts and mcp.ts; native OAuth integration regression. Reproduce rotation while an existing client is idle on a fake model; get current credentials on request dispatch with bounded known-auth recovery, preserve the session/grant, never replay uncertain writes. Verify native quote/read/close after rotation.
- [x] 2. Command identity and staleness: src/games/pact/coordination.ts, specialist coordinator/proposals and existing native tests. Reproduce command-keyed training claims and native tick during reasoning. Preserve exact candidate IDs, bounded fresh replanning, explicit rejection outcomes. Keep atomic native guards and original three-call/one-action bounds.
- [ ] 3. Memory/progress: continuity decision modules, shared packer, goal-state. Reproduce retained context losing every source and repeated unchanged deferral. Remove duplication before withholding grounded memory; preserve a declared evidence minimum or return an explicit capacity failure. Record stagnation/actual blockers without forcing actions. Verify all eight native compositions.
- [x] 4. Supervision: scripts/local-run-guardian.py and control-real-pact.ts plus focused tests. Reproduce helper EOF, delayed telemetry and concurrent finalization. Recover a helper only after same-clock/deadline validation, keep heartbeat independent, preserve original reasons and exception details, serialize finalization. No new Windows/WSL daemon stack.
- [x] 5. Native-sized capacity: cache admission/profile checks and isolated provider configuration. Calculate demand for four actual packets and physical/activation headroom. Preserve safe admission; no unsupported claim based on configured slots. A live four-call control, if necessary, is part of the bounded verification budget rather than an extra soak.
- [x] 6. Whole verification: affected units/integrations, full unit suite, types/style/boundaries/build. Native test includes real OAuth, advancing clocks, delayed fake inference and receipts. Capture actual final decoder grammars and compile CPU-only. Inline review; repair substantive regressions; document limits.
- [x] 7. Deployment and live check: versioned artifacts and ownership/hash verification, genuine control heartbeat before guardian. Preserve old closed root; run only authorized Nemotron4B and the same world under a new bounded segment. Observe chosen turn scope without manually manufacturing successful gameplay. Stop on systemic failure and report native effects, held states and actual usage.

## Ledger

- Planning: current stop verified from records; no runtime started. User now explicitly authorizes repair and bounded restart. No code changed yet.

- Resumption: user explicitly authorized continuing after the GPU pause. Partial credential/training/staleness repairs preserved; no prior deployment of these changes. Temporary /tmp evidence was lost across the pause; durable private world and investigation evidence remain. Fresh verification is required.

- Offline progress: native OAuth rotation/old-session write/close passes; native tick invalidation and exact-ID training checks added; independent heartbeat/finalization exclusion and bounded helper replacement pass focused tests. Initial full native matrix exposed retained-memory/core pressure and host-added coordinator-schema pressure; fixes preserve current facts, declare omitted prose and measure prepared constraints before admission. Five-minute Windows/WSL clock control passed (300.39 seconds, max sample RTT10.26ms). Source not deployed; no model calls/game execution yet.

- Offline completion: 1073/1073 units; 69 focused native integrations plus36 final native/refresh cases passed in fresh fixtures (overlap disclosed). Types/style (110 warnings/60 infos), boundaries, production build and whitespace passed. All eight native prerequisite/introduction/message flows plus actual prerequisite/Hall completion pass. Six retained-state read-only reconstructions fit31917–31927(v1)/31754–31770(v1.1) bytes with one evidence item each; zero model calls/retained writes. CPU Guidance compilation34distinct schemas from43requests passed. Guardian CPU2tests, actual Windows helper replacement preserving clock anchors and primary-loss fixture passed.
- Review: inline self-review per user instruction; preserve original goals, budgets, held actors and unknown usage. Optional briefing prose is withheld only under measured pressure, with exact omitted paths; all stock/authority/goal-feasibility/current-construction facts remain protected. Prepared coordinator constraints are measured before admission; whole quoted alternatives may be omitted with coverage, never weakened or invented.
- Operational preparation: the two retained databases were stopped after environment restart; ownership labels verified before restart. Docker reassigned loopback ports. A separate continuation config uses verified current ports; old config/closed segments are retained. World stillpaused tick616, ledger786 allocations/four unknown, threeheld actors. New provider capacity94physical/92usable admits4*23blocks for full16384-token contexts; token capacity65536, fourinference slots, eightworkers, original peractor budgets unchanged. Live export/memory verification pending.

- Bounded live result: two scheduled rounds,42turns/46reported calls/343853tokens;20dispatchable actors (threeoriginalautonomous holds andoneoldfencedcoordinator retained). Fouractualconcurrentrequests, zero sampled providerwaiting/preemptions; two training orders+onecontact committed. Same threev1actors hitCONTEXT_LIMIT ineachround, two legacy factual waits rejected, one stale building proposal rejected. Metadata correction qualified offline and swapped into an idle worker inside the same window; live v1 packing still failed. Task3/live readiness remains incomplete. No extended window or further trial.
- Final: worldpaused tick633,24cohorts paused; all owned services/provider stopped; zero runningturns/leases/pending-or-unknowncommands; allfourunknownrows andcohortbudget/model/anchors matchbaseline; finalrestore167/77tables; GPU1684MiB. Detailedactuals: docs/mandatory-native-run-repairs-20261025.md. No commit/push.
