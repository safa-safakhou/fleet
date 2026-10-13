# Post-P1 live observation — 13 October 2026

Read-only follow-up to [deployment and resumption](p1-deployment-20261013.md). The observation covers the same fifty-agent cohort from `2026-10-12T23:51:37Z` to `2026-10-13T00:42:30.757Z` (01:51:37–02:42:30 Berlin), about 51 minutes. No extra inference, gameplay command, cancellation, permission change, restart or schedule change was initiated for this check.

## Progress

All fifty agents had scheduled turns, with three or four turns each. At the fixed cutoff the cohort was running, all fifty scheduler records were ready, and none had a pending command or needed-owner scheduler state. These flags do not establish that each agent can progress in the game.

- 169 completed turns, 246 model executions and 24 committed actions by 17 distinct agents.
- 16 committed building orders from 13 agents. Authenticated owned-world reads classified five as completed and eleven as waiting; none remained active or unclassified at the scan.
- Three contact requests, four messages and one supply offer comprised the other eight committed actions.
- 149 of 169 completed turns (88.2%) committed no action. Reads and waits can be legitimate, but useful activity remains sparse. Thirty-three agents made no commitment during this window.
- All 246 executions reported usage: 3,884,674 input/output tokens. No new unknown usage appeared. The previously reviewed unknown record and its full 40,000-token allocation remain preserved.

The last fifty completed turns before the pause had five actions and 90% no-action turns. The older four-hour investigation recorded 90.6% no-action turns. The modest difference is not a controlled improvement measurement: the windows differ, resources accumulated during the pause, and the equal-length interval immediately before resumption was paused.

## Communication

All four new messages were Agent 19 → Agent 17. Agent 19 also committed a supply offer to Agent 17 at `2026-10-13T00:41:37.424Z`, only about 53 seconds before the cutoff. It was unsigned, with no contract yet; it is too fresh to conclude that response or negotiation failed. Both participants' current mandates permit supply signing, and the offer had about 59 game minutes remaining at the owned-world scan.

Agents 4, 15 and 39 made the three new contact requests. There were still seven accepted relationships involving eleven accounts, unchanged from the earlier diagnosis, and 21 unique pending contact requests. Communication is therefore occurring, but broad reciprocal interaction and completed agreements have not been demonstrated.

## Remaining blockers

Five pre-existing construction deadlocks remain. User-facing agent numbers below are one-based; both observed waiting queue positions are occupied and the missing prerequisite cannot be queued:

| Agent | Waiting instructions / missing prerequisites |
| --- | --- |
| 15 | Farm III and Storehouse III both require Hall II |
| 21 | Farm III requires Hall II; Hall II requires Barracks II |
| 26 | Farm III requires Hall II; Hall II requires Barracks II |
| 36 | Farm III requires Hall II; Hall II requires Barracks II |
| 43 | Market III requires Hall II; Hall II requires Barracks II |

The inspector now exposes owner recovery, but prevention does not clear old queues. Each requires an exact owner-reviewed cancellation to free a position, followed by fresh reads and prerequisite construction. No cancellation was submitted during this diagnosis. These agents can still perform other permitted actions; Agent 15 made a contact request.

Agent 50 hit `CONTEXT_LIMIT` in three successive turns at approximately 00:05, 00:20 and 00:35 UTC. The first committed one action before a later context failure; the third made zero model calls and zero actions. Reconstructing its fresh input through the deployed context-fitting code reproduced the 24,000-byte limit without invoking a model. Its private notes were small; context packing remains a controller defect despite its scheduler state being ready.

There were also three invalid read-argument events: Agent 38 omitted a conversation counterparty, then supplied an invalid inbox cursor on a later turn; Agent 39 supplied an unsupported world-read offset and successfully corrected it within the turn. These are distinct from unknown usage or pending-command recovery.

## What the fixes are doing

The window recorded 82 delivered requested-read events. Construction preflight deferred five deadlock-causing proposals and five occupied-waiting-slot proposals. All sixteen building submissions that did proceed committed successfully. This supports the fresh-read and prevention paths, without claiming all decision quality, packing or historical queue recovery is solved.

Priorities are Agent 50's context packing and the five exact owner queue recoveries. Broader communication and incentives remain a separate investigation; the fresh offer is an encouraging first observable step, not completed bargaining evidence.

## Evidence and verification

Fleet runtime `3407e5a`; PACT release `fleet-p1-20261013-1`. A repeatable-read Fleet database snapshot supplied cohort-specific turn, ledger and receipt totals. Protected action records were decoded on the server only to classify action kinds and results. Authenticated profile/world/guide reads succeeded for all fifty existing account bindings; no PACT database shortcut was used. Owned observations were deduplicated for mirrored contacts and offers. Actual receipt timestamps distinguish new actions from old observed history.

Protected scripts and snapshots are under `/var/lib/fleet/state/post-p1-check-20261013*` and `/var/lib/fleet/state/post-p1-detail-20261013*`. They contain private runtime evidence and are not committed. Context reproduction used the deployed adapter and fitting logic without paid inference. This report contains aggregates and operational blockers, not message bodies or credentials. Documentation verification: `git diff --check`; no runtime source changes or additional application test run were necessary for this observation report.
