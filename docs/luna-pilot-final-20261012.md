# Final five-agent Luna medium pilot — 12 October 2026

The finite pilot is **finished**. It verified the subscribed Codex route, durable scheduling, accounting and a small amount of autonomous construction. It **did not demonstrate agent society, useful bargaining or efficient decision making**. Do not scale this configuration on the strength of valid JSON alone. No new run was started, and the original population experiments remain unchanged.

## Scope and terminal evidence

Five original fresh synthetic owners, cohort a16f402f-e97e-4b1a-8612-86d8af349e19, gpt-6-luna with medium reasoning, 15-minute stagger and concurrency one. The immutable deadline was 11 October 22:44:35.420Z, or **12 October 00:44:35 Berlin**. The maximum was 120 Codex executions / 4.8M conservative token allocation, with 40K reserved per execution and three decisions/actions maximum per turn.

The first post-deadline check at 22:48:07Z confirmed state finished. A subsequent database boundary check found **zero turns or reservations admitted at/after the deadline**, zero running turns, last reservation at 22:41:53.434Z and last finished turn at 22:42:00.554Z. A later terminal release verified all 87 ledger records, original model/budget/anchor, owner bindings and the exact pending ID/action unchanged before and after deployment; pilot.json hash also matched. Agent ready labels and stored future due times do not override the terminal cohort. No terminal resume, replacement identity or replay occurred.

Five repair pauses totaled **27.65 minutes**, consuming the original two-hour window. The fixed schedule recorded 31 turns instead of the nominal 40; missed slots were skipped. These pauses and the evolving controller make this an operational pilot, not a controlled comparison of strategy families or model intelligence.

## Actual usage and outcomes

| Measure | Recorded result |
|---|---:|
| Codex executions | 87, all reported |
| Input tokens | 1,256,709 |
| Output tokens | 9,760 |
| Total reported tokens | **1,266,469** |
| Conservative allocated tokens | **3,480,000** |
| Unknown / still-reserved executions | 0 / 0 |
| Read-only finished turns | 25 |
| Committed-final-code turns | 2, with 3 commits |
| WAIT turns | 1 |
| Startup failures | 2: INVALID_TOOL_ARGUMENTS and CONTEXT_LIMIT |
| Pending SLOT_BUSY turn | 1, with 1 earlier commit and 1 preserved pending command |
| Total committed commands | **4** |
| Communications / contact requests / contracts observed | **0** |

Turn codes and counters, together with the controller's one-decision loop, imply **81 read decisions, five write attempts and one wait decision**: about 93.1% of decisions were reads. This is a reconstruction, not a retained full per-call transcript. There were no recorded invalid model decisions or live provider-failure codes. Parsing success is separate from meaningful play.

These are CLI executions, not guaranteed one-for-one provider HTTP requests. Input includes any cached input; no cached tokens were added again. Reserved allocation was never refunded. The subscription's currency cost or remaining account quota is not inferred from these numbers. The separate, terminal three-attempt certification had one passed call with 10,288 input + 43 output tokens; two TLS/process failures supplied no reported usage. It was not rerun, and those attempts are not silently included in pilot totals.

## Per-agent behavior

| Strategy | Turns | Executions | Reported tokens | Commits | Actual behavior |
|---|---:|---:|---:|---:|---|
| Guardian | 7 | 18 | 262,668 | 0 | Six read-only turns and the original pre-inference guide failure; repeatedly inspected development and forecasts. |
| Expansionist | 6 | 17 | 244,856 | 2 | Queued Hall 2 prematurely, then Barracks 2. A subsequent Farm 2 request selected an occupied slot. |
| Merchant | 6 | 16 | 232,879 | 0 | Repeated economics/social discovery after the context failure; ultimately waited because it saw no contacts or offers. Did not initiate one. |
| Diplomat | 6 | 18 | 264,078 | 0 | Read diplomacy, Court listings and politics; no introduction, message or agreement followed. |
| Opportunist | 6 | 18 | 261,988 | 2 | After five read-only turns, queued Barracks 2 and Farm 2 in its two free slots. |

All five final private-note fields are empty. Their short per-turn intents were inspected and paraphrased here; no raw correspondence or private plans are committed. They returned nonempty decisions, but none chose to maintain a durable strategic note. Strategy preferences visibly aligned with some topics/actions, while the small, confounded sample does not establish a causal strategy effect.

## Read-only game effects

Protected encrypted baseline observations were captured at 20:49:10–12Z, before the first committed action. The final encrypted observations were captured at 22:48:30–33Z. The report records that snapshot; ordinary game settlement continues after inference ends.

- Expansionist: Barracks 2 completed; Hall 2 still waiting for Farm 2. Slot 2 was free at final readback. The earlier Farm-in-slot-1 command remains private and pending, with receipt lookup returning RECEIPT_NOT_FOUND both before and after the deadline. Preserve it without replay or inventing a receipt. The controller would not give this owner another turn after the original deadline anyway.
- Opportunist: Barracks 2 and Farm 2 were active in separate slots at the final snapshot, with four and five **game-minutes** remaining. Do not convert these to model execution deadlines or claim completed upgrades from the queue receipts.
- Guardian, merchant and diplomat: all seven buildings remained level 1 and both builder slots were empty.
- Every owner retained its original eight home Spearmen; no training, scouting, raids or supply contracts appeared in final owner views. Four observed build instructions account for all four recorded commits.
- Ordinary stock floors rose identically across owners: Grain 2 → 45, Iron 2 → 41, Silver 1 → 20. This passive income is not a model-generated return. Founding allowances fell from Iron/Silver 200/100 to 120/60 for expansionist and 80/40 for opportunist; idle owners retained 200/100. Grain allowance stayed 80. Waiting Hall had not consumed its construction funding at that snapshot.

## Communication and coverage

All five authenticated final guides report zero contacts, zero incoming/outgoing contact requests, zero open supply/garrison offers and zero active supply/garrison contracts. The private communication journal is also empty. There is **no negotiation to time**: duration is not applicable, rather than a fabricated zero-second negotiation. No contract activation or language-quality assessment can be made from nonexistent dialogue.

Introductions were free and contact-request/message permissions were present. Social delegation was initially manual and explicitly changed, with owner receipts and guide readback, to agent_decides for all five at 22:29Z. No request or message attempt was rejected in this run; manual mode was a latent acceptance obstruction, not the demonstrated cause of silence. The latest memory confirms diplomat explored Court and politics reads. It made no Court/political commitment. Military, Court writes, publication, contracts and human exceptions remain **unexercised**, not certified by the owner's broad synthetic policy. The owner_decisions table is empty: no synthetic-owner fallback was used.

The final context repair left only one ordinary remaining scheduled turn per owner. Its effects were three additional construction commits, one busy-slot attempt, continued guardian/diplomat reads and merchant waiting. There was no later scheduled turn to test longer bargaining or persistence under the fully repaired configuration. A different outcome in a new acceptance run would require separate authorization; this one cannot be extended or restarted.

## Defects, fixes and limits

The actual controller initially discarded discoveries between turns. Its first memory patch stored heavily truncated data. Live reproduction then showed a 17.5KB decision-support response losing all candidates, older reads becoming mostly version headers, and nested compaction reducing retained knowledge further. Those findings—not a speculative safety block—justify the semantic projections and separate rule/state slots. Shorter catalogs, exact schema lookup, continuation notes, current authority and visible remaining call counts are implemented. Repeated Codex context and its provider overhead remain; lower token usage was not demonstrated.

The repaired live projection retained all 20 real candidate IDs, two whole actionable blueprints and all nine discovered player IDs. The first repaired guardian checkpoint stored useful flat observations, yet it still chose repeated reads. Models must choose what to do with complete observations; the repair does not force communication or aggression.

Social setup also needed the actual human /v1/social/commands endpoint, nested receipt handling and the normal locked MCP token-refresh path. Live receipts/readback verified the intended policy without creating conversations or adding model calls.

SLOT_BUSY exposed a rejection-classification gap. The initial defensive patch covered owner HTTP 4xx. Terminal inspection corrected the source attribution: zero owner fallbacks means the observed rejection was the normal MCP isError route. That route now preserves provenance and classifies the known busy-slot denial; 5xx/unknown results remain pending. This post-completion correction preserves the old unjournaled command instead of retroactively declaring it resolved.

Latest repair code passes **37 unit + 68 PostgreSQL integration tests (105 total)**, type/format checks with the six existing warnings and two informational diagnostics, production/Docker builds, and zero-vulnerability production dependency audit. Synthetic regressions cover whole candidate/player preservation, dated flat memory, expiry, continuation, budgets, discovery/introduction/acceptance/message ingestion, social setup identity/CSRF/refresh/readback, terminal/resume guards and 4xx/tool rejection versus uncertain transport. These checks do not manufacture live negotiation acceptance.

## Operations and next acceptance gate

The independent console/database and heartbeat stayed healthy; PACT production processes retained their original uptime. Full three-call turns had median 18.87s, p95 23.96s, range 15.99–24.54s. Final idle snapshots showed roughly 52MiB worker, 29MiB console and 48MiB database, with no Codex child running. These are snapshots, not peak-capacity measurements. No local GPU was used by this remote subscription route, and no rate-limit/shared-quota failure was observed; provider-side contention was not measured.

Release ff18860/image pact-agent-fleet:luna-pilot-20261012-10 is the post-terminal correction. Terminal checks before/after deployment kept the pilot finished, all 87 ledger records and its existing pending command unchanged, with zero post-deadline admissions. No new run or certification was started. Protected credentials, original identities, backups, checkpoints and baseline/final snapshots remain outside Git. The console stays private; idle worker health checks do not constitute resumed gameplay.

Before scaling, require an explicitly bounded real-route acceptance demonstrating voluntary player discovery, an actual introduction/answer/message exchange, useful follow-up and correct prerequisite/slot choices. The exact decision calculator exists and can expose current costs/checks; no trained decision selector was created. Further host design should address repeated discovery and full-context execution overhead while preserving account isolation and server authority, then measure actual actions/negotiations per token. Do not attribute this run solely to low incentives or solely to weak Luna intelligence: controller loss, late policy repair, brief fully repaired exposure and actual model choices all matter.

The observation monitor is disabled after this committed report; its final status is recorded in the primary pilot report. No approval for another fleet run is implied.
