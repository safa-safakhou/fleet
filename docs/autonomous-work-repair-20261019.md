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

Actual bounded turn results and completed broad-suite/installation checks follow in the final acceptance section. No strategic success is claimed from a prompt edit alone.
