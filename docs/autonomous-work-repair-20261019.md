# Autonomous-work investigation and repair — 19 October 2026

Founder assignment: investigate why the four local fleet types wait, verify goals/context/permissions, and fix barriers to useful autonomous work. This covers only the existing isolated local world and a bounded verification; no old hour, background schedule, other population, identity, mandate, provider or budget is reset or expanded.

## Why they waited

The retained seven-call trace contradicts several wait explanations. Every selected actor received the current owner objective: sustain/develop the kingdom, preserve position/supplies/alliances, and choose its own legal actions. Legacy prompts explicitly contained `ownerValues.mode=account_autonomy` and `objectiveStatus=provided`; modern prompts contained the goal in the owned world, and cognition also in continuity owner values. The goal was broad, not missing.

Current authenticated reads of all12 original actors show at least one available construction queue position and prerequisite-ready, stock-affordable, non-busy upgrades. The already-waiting Hall in reactive-basic requires FarmII/BarracksII; waiting cannot make those missing prerequisites build themselves. Legacy-loop already has FarmII but can build BarracksII toward HallII. Its schema read followed by "await owner instructions" was not explained by a general game prohibition. Stock/prerequisite candidates are observations, not promises of admission or prescribed strategy.

All12 actual OAuth connections advertised the game action tool and successfully opened/closed their own account-bound write lease. No inference or game command was needed for this check. Their existing mandates include development and other ordinary gameplay. Human-only actions and exact exceptions remain separate; no permission was added.

Two controller handoff defects were reproduced:

1. The modern `EnvironmentAdapter`/host path dropped PACT's trusted controller instructions. Reactive agents received generic engine instructions and raw external-client guidance, including the requirement to open `run.open`, without learning that Fleet manages that step. The prior reactive-basic raid proposal was **a valid raid kind with invalid arguments** (`text: "I will open the run."`), not an unknown action kind. The earlier report's "invented raid action" description was imprecise. It attempted to express lease management as gameplay.
2. A normal reactive scoped read replaced the entire observation with its answer, discarding current world/goal/mandate context on the next decision. Legacy and continuity paths already retained surrounding facts. This was a real subsequent-work defect, even though the sampled reactive waits themselves did not issue a read.

There was also a presentation gap: autonomous goals, permission caveats, queue prerequisites, affordability and lease responsibilities were scattered across large raw observations. The models treated a broad standing goal as though the owner needed to choose an exact next action, or treated a blocked Hall as though all construction was blocked. These are observed mistaken explanations, not evidence that the user failed to authorize play.

## Repairs

An optional trusted `EnvironmentAdapter.instructions` field now reaches the host's `EngineContext` and both reactive profiles' system instructions. Only registered adapter code supplies it; peer messages remain observation data and cannot populate the system channel. Environments omitting the field retain their prior packet. PACT uses the same concise579-byte instruction block across legacy and modern controllers: a provided goal is standing guidance for delegated steps; Fleet manages lease/command IDs/receipts; normal human-only boundaries and server checks remain.

PACT also supplies a protected factual `agentBriefing` in raw and packed observations. It exposes the exact fresh owner goal/status, actual mandate action names, Fleet-managed lease semantics, observed available queue positions, and each projected upgrade's prerequisite/stock/busy facts. Unknown stock, capacity, goals or permissions stay unknown/absent. The briefing joins server-supplied checks without duplicating economy rules, ranking a preferred strategy, selecting a partner or granting authority. A blocked target does not imply that prerequisites or other lawful activity are unavailable. Waiting remains a valid judgment when grounded in current dependency, stock, risk or owner constraints.

Basic scoped reads now retain fresh owned observations plus the requested result, apply existing owned-read updates, retain the owner briefing and explicitly mark the separate requested snapshot. Read/write classification and proposal/receipt validation remain unchanged.

The historical source inventory and earlier golden fixtures remain intact. `legacy-autonomy-guidance-20261019.json` explicitly records the intentional prompt change and its prior/current digests; direct-controller/bridge parity still compares complete current packets, actions, reads and accounting. No source/spec hash was silently refreshed to conceal drift.

## Verification

Failing regressions first demonstrated the missing system instruction for both reactive types, the lost owner goal after a scoped read, and absence/loss of packed briefing. These now pass, including malicious peer text staying outside system instructions, missing-data handling, busy Hall/available prerequisite distinction and whole-briefing retention. Existing largest populated/accepted-recall packets still fit24KB. The original proposed verbose instruction block failed that regression; the final block is concise rather than relaxing the test or silently evicting accepted evidence.

Before inference, current observations for all six reactive actors passed fake-provider replay with full existing output contracts and retained owned evidence. Final packets fit42222–45666 bytes within the existing local48KB allowance, retained8 peers, the real owner objective, controller instructions and useful construction options. No real inference was spent during these audits. Encrypted before-run backups preserve the55 prior turns and48 reported executions.

The first repaired-source pass (`62eb4bc`) finished all four selected turns with seven reported calls and two accepted construction orders: legacy cognition queued Farm II, and reactive cognition queued Barracks II. Legacy loop still said "Awaiting owner direction"; reactive basic read current state, then returned `wait` with the summary "queue farm 2". A wait summary does not dispatch a command. All attempts and allocations remain recorded.

These traces motivated a focused assignment/serialization clarification. The adapter now exposes the exact authenticated current owner objective through an optional callback. Legacy account-autonomy instructions and modern system instructions present that actual objective as current standing guidance; modern `goal` carries it directly and refreshes after reads. Peer statements cannot supply this callback. Modern adapter-backed profiles receive an explicit outer action/read/wait example, with the cognition wrapper stated separately. This clarifies the existing schema without converting a wait into an action or forcing a particular strategy. Archived environments without this hook/instruction remain unchanged. The original legacy source pin is still checked after reversing only the individually reviewed context and assignment deltas.

The new regressions first failed without this assignment handoff, then passed for both legacy and modern delivery, refreshed objectives, trusted-host forwarding and response-format boundaries. Focused native verification passed42 integration checks plus the goal/source-pin checks; build, type and boundaries checks passed. Fresh full reactive packets fit43506–46765 bytes within the unchanged48KB local allowance and retained owner goals, peer discovery and actionable observations. A targeted new pass for only legacy loop/reactive basic then checked the changed assignment/serialization handoff against the same identities and unchanged model. Its outcomes are recorded below.


## Actual results and remaining limitation

The first pass used Fleet `62eb4bc6565c6deead3f7922bc22250060439373`; the targeted second pass used `dc080e992f96a9b44a51b9f159452c65d5bdf6b1`. PACT remained `20c41efe583379422396973d3f12ffc01ccc8930`. Each pass has its own closed private registration, source proof, complete metered attempts and command receipts. Only original ordinal0 actors were selected. There was no background worker or replay of uncertain work.

| Profile | New turns / model calls | Committed work | Actual interpretation |
| --- | ---: | --- | --- |
| Legacy loop | 2 / 2 | None | Both replies requested owner direction. The last delivered system message explicitly quoted the real standing objective; the owned briefing showed free queues and affordable ready upgrades. This remains a goal-use/model judgment failure, not a missing credential or general approval requirement. |
| Legacy cognition | 1 / 3 | Farm II construction accepted and active | Chose a grain-supply improvement, retained a plan and then waited for its active construction. Three Laya requests abstained; deterministic fallback remained usable. |
| Reactive basic | 2 / 5 | None | First described `queue farm 2` in a wait. After format clarification it emitted a real Hall II proposal, correctly rejected locally as `OBSERVED_BUILDING_BUSY` before any command preparation; it read feasibility and waited for prerequisites rather than constructing them. Its existing Hall still needs Farm II/Barracks II and slot2 is free. This remains weak prerequisite planning. |
| Reactive cognition | 1 / 1 | Barracks II construction accepted and active | Independently chose a delegated upgrade under the standing objective. It omitted optional continuity changes. |

Both accepted orders are **ongoing construction**, not completed upgrades: final owned observations show Farm II with7 game minutes remaining and Barracks II with10. No new building level completed and no communication, contract or military outcome was achieved. A turn's `WAIT` terminal code can follow a committed action; receipts and action counters distinguish work followed by waiting from doing nothing.

Across this assignment: **6 turns,11 reported model calls,107208 input tokens,4372 output tokens,2 accepted commands**. Every new allocation is reported; no pending command or unknown usage remains. Together with untouched prior history, the world now contains61 turns/59 model executions. All12 original actors and bindings remain, credentials ready and no active agent blocker. Four cohorts and the clock are paused at tick72; all one-pass gates and the original hour remain closed, Fleet worker stopped. Model/digest/thinking/output settings, existing budgets, mandates, identities and old installations remain unchanged.

The concrete handoff defects are repaired. Actual comprehension is not established merely by delivering text: the two cognition profiles demonstrated a useful lawful choice; the two non-cognition profiles did not. They are **operationally runnable but not all strategically reliable**. Further work should qualify goal use and prerequisite planning on this exact model/profile combination before another long observation. This report does not label a false wait as healthy play or infer authorization for a further run.

## Completed acceptance and installation

- Fresh final-source Linux fixture checks: `npm test` **251/251**, `npm run test:integration` **401/401**, `npm run test:acceptance` **12/12**. These include real paired PACT admission/receipt and account-isolation checks, failure/retry/authority paths, legacy bridge parity, old source pins and largest accepted-recall packets. No native/Linux fixture suites shared a database concurrently.
- Native Node24: `npm run check`, `npm run build`, `npm run check:boundaries` and `git diff --check` passed. Check output has26 warnings/15 infos and no errors. A shell invocation accidentally selected the broken system Node25 before a boundaries check; the documented pinned Node24 rerun passed. Dependencies did not change; full `npm audit --json` reports0 vulnerabilities.
- The owned local console was gracefully restarted onto the built `dc080e9` source. Health checks passed; `autonomy-installation.json` pins1626 artifacts and verifies12 actors/12 bindings/61 turns/59 executions/zero unresolved allocations. This is local installation only, not server deployment or source push.
- Authenticated encrypted `autonomy-before` and `autonomy-after` backups preserve the before/after world. The final network-isolated restore compared10 PACT and39 Fleet business tables successfully and removed its clone. Private source proofs, two pass receipts, metering, before/after observations and the exact last legacy prompt remain protected outside Git. Old hour/config/source pins and all prior failures remain historical evidence.

The disposable owned test database is removed after verification. Local commits and the paired PACT report complete this repair assignment; a new long run has not been launched.
