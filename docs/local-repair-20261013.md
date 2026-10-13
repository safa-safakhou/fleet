# Local fleet repair and recovery — 13 October 2026

Founder authorized correcting local model/output failures and sleep interruptions, reviewing exactly three unknown executions with history and allocations retained, resuming the same five accounts and verifying operation. Codex owns implementation without delegation. Server Fleet and PACT runtime changes are not part of this assignment.

## Implemented behavior

Completed HTTP model responses return usage independently of decision JSON parsing. Malformed/truncated answers are explicitly classified. Known usage is recorded before validating the answer; missing usage still stops the owner for explicit review. The controller never infers zero usage from a bad answer or refunds reservations. All routes now enforce the original per-call allocation ceiling before gameplay.

An action decision requires a concrete inner `kind`. Human-only capability refusal is preserved before structural validation. Game action schemas are checked before opening a lease or creating a pending command; missing/incorrect fields return exact bounded feedback. PACT preflight refuses an invented optional mandate version and supplies its current observed version; it does not rewrite the model's command or expand authority. The model may correct an error using remaining decisions only. Final known failures retain scheduled readiness and encrypted bounded feedback for the next turn (maximum 8KB; excluded after 24 hours and purged after 30 days); successful waiting/action admission clears it. Thinking, 2,000 output tokens, two calls/actions and the fifteen-minute anchor are unchanged.

On macOS, opt-in `FLEET_KEEP_AWAKE=1` makes the worker hold process-scoped idle/system sleep assertions while any authorized cohort is running. It launches `/usr/bin/caffeinate -i -s -w <worker PID>`, releases on pause/shutdown and retries a lost helper. System-sleep protection applies on AC. No `pmset` or global display/power setting changes. Forced lid-close, shutdown, power loss and provider interruption remain possible; the existing deadline/uncertain-outcome gates still apply. The assertion is not a substitute for Docker, Ollama, internet or a logged-in session.

The inspector now shows the recovery path from actual credentials and unresolved turns. An authenticated execution review requires a paused/quiescent cohort, rejects pending commands or reserved in-flight executions, audits the original code/state and usage allocations, preserves ledger rows and counters, and makes the same account ready only if no other blocker remains and credentials are ready. The cohort remains paused until explicitly resumed. Original failures stay visible as reviewed/cancelled history; unknown entries stay unknown.

## Reusable recovery approach

| Failure class | Recovery |
| --- | --- |
| Known completed model output/input failure, usage reported, no command | Correct within remaining decisions or replan next original scheduled slot with fresh facts and bounded persisted feedback. |
| Provider/worker interruption or missing usage | Stop that owner's admission; inspect retained reservation/outcome, pause at a quiescent boundary and explicitly review. Retain historical unknown usage and full allocation; never replay inference. |
| Pending/transport-uncertain game command | Read the original receipt and reconcile that exact ID. Missing receipt remains uncertain; no automatic replacement ID or replay. |
| Account/refresh problem | Reconnect the same account through the existing owner flow while paused. Do not repeat uncertain refresh exchanges or replace identities. |
| Construction/authority blocker | Read current prerequisites/policy; choose a permitted prerequisite or obtain exact owner review. Do not autonomously cancel work or expand permission. |
| Process/dependency restart | Preserve the database/vault and original schedule. Existing stale-turn fencing retains reservations/commands; do not rebuild a cohort as recovery. |
| Terminal finite/stopped cohort | Preserve its original terminal state; recovery never extends or restarts it. |

This implements reusable local recovery surfaces and bounded replanning. It does not promise every provider response will be valid, automatically authorize all future uncertainty reviews, or bypass platform safety review. General deployment of these source changes to the fifty-server cohort would require separate rollout acceptance.

## Verification and installation

Native build/type/format/boundary checks and production dependency audit passed (zero vulnerabilities). Native unit tests: 45 passed, 17 Linux-only cases skipped. Native integrations excluding the Linux-specific Codex file: 99 passed. Full Linux build/check/boundaries passed; **62 unit + 112 integration tests = 174 passed**, including Linux subprocess containment/accounting tests. The Linux production dependency audit also has zero vulnerabilities. Actual pinned installation/resumption is recorded below after completion. Tests use only a separate `fleet_test` PostgreSQL database and fake providers; they initiate no production inference.

The first regression run exposed the missing migration registration and a fixture with an invalid pseudo-UUID; both were corrected before acceptance. The daily-renewal fixture now explicitly reports its completed usage instead of treating an unreported reservation as a harmless WAIT. Regression tests preserve refusal of human-only actions before shape validation. These are fixture/correction history, not passing evidence for an earlier failing candidate.

The local fleet was paused at a quiescent boundary at **14:39:10 Berlin / 12:39:10 UTC**. Protected backup `backups/pre-repair-20261013.dump` was restored into a temporary networkless PostgreSQL container. All nine complete tracked tables matched the paused live source: cohorts, agents, turns, compute ledger, communications, owner decisions, audit events, turn events and command resolutions. Private proofs are under `state/repair-20261013` in the existing local installation; no credentials, raw contexts or correspondence are committed.

## Khanom investigation

Read the actual ChatGPT chat **“Slave Game scheduler 1”** (`6acabd8b-2f54-83ed-808a-152014db7dc5`). Its final report says the gameplay write-session request was blocked by an **OpenAI safety check**, and the chat disabled its automation because autonomous gameplay was blocked. Earlier messages report safety-blocked introductions and a separate PACT permission refusal on construction cancellation. This explains the game-result gap; it is not a PACT database/authentication outage. The chat is idle. The actual ChatGPT Scheduled UI additionally confirms **PACT Khanom MNIM Steward** is **Paused**, with automation ID `6acabd90df748191aebf5bb19c989de9`. Its final report is visibly timestamped **09:38 Berlin**. The separate older Khanom task is also paused; Agha/Mashala steward tasks show their next hourly slots. All game identities and pending construction remain intact.

This is direct chat-report evidence; the app's read tool exposes summaries/messages, not the safety review's detailed internal decision. Schedule pause was separately verified in the browser UI, without changing it. No blocked request was retried, no alternate route used, and the automation was not silently re-enabled. Legitimate recovery is owner review of that request and its existing app/task permissions in the same chat; if permitted, resume only its existing task without bypassing a denial. Any renewed failure should leave a clear blocked status rather than pretend success or endlessly retry.

Official [ChatGPT action-review documentation](https://learn.chatgpt.com/docs/dots/controls#how-action-review-works) explains that automatic review can require approval or a human step according to instructions, permissions and safeguards. It does not identify the exact reason for this particular refusal. The OpenAI Docs skill was used for this product investigation. Consumer scheduling/approval policy was not changed as part of repairing the native local fleet.

## Actual local installation and reviewed recovery

Pinned local release: **`a627cae3e386a038c6e072054ffc579be79b446e`**, built from the committed archive with independent production dependencies. Both per-user launch agents now reference that private release. The additive feedback migration is installed; all nine complete prior table hashes matched across replacement (new null feedback columns excluded). Protected configuration changed only by adding `FLEET_KEEP_AWAKE=1`. The first worker bootstrap returned a transient launchd I/O error; a fresh status inspection showed no worker service, and retry succeeded. The fleet remained paused throughout, with zero inference or command replay. This failure/recovery is recorded rather than counted as first-attempt success.

The founder-authorized exact reviews completed at **14:55:15 Berlin / 12:55:15 UTC**:

| Account | Original turn retained | Historical result |
| --- | --- | --- |
| Mac Nemotron 5 02 | `511a1174-d207-48ec-b7a7-5e53857f89a8` | INVALID_DECISION |
| Mac Nemotron 5 05 | `3a010ba2-13e1-429f-8cc4-873a012364e5` | INVALID_DECISION |
| Mac Nemotron 5 04 | `fe99bd10-91c9-4860-9c1c-c58c7c6110c8` | TRANSPORT_UNCERTAIN |

All compute-ledger rows matched byte-for-byte across review. The three original records remain unknown with null measured usage and **40,000 allocation each (120,000 total)**; no refund or fabricated report was made. All original turn fields matched except the three reviewed states becoming cancelled. Agent identity, schedule, counters, notes and other fields matched except the approved readiness/fence changes. Audits and consented review events append the founder's explicit authorization and preservation facts. No pending game command existed on these three turns; nothing was replayed.

Normal authenticated profile/owned-world MCP reads passed for all five with exact retained account/kingdom bindings. Expiring access tokens refreshed through the normal locked rotation flow; no account, grant authority or permission was replaced. The same cohort resumed at **14:56:00.491 Berlin / 12:56:00.491 UTC**. Its anchor remains `2026-10-13T10:07:02.661Z`, model remains `nemotron-3-nano:4b` / thinking true, and all original execution limits and continuous accounting remain.

Real `pmset -g assertions` showed idle/system sleep prevention owned by the worker's caffeinate child, explicitly bound to its PID. Global power settings and display-sleep settings were not changed. Inspector UI readback showed account 02 scheduled for its next original phase, its old failure and unknown allocation still visible, and the new Recovery path explaining readiness. No scheduling/permission control was changed through the browser. Live post-repair acceptance follows below after the complete five-account round.

Rollback: pause at a quiescent boundary and use the saved previous launch-agent paths to run the previous source against the **current** database. The new columns are additive. Preserve current credentials, pending commands and accumulated history; do not restore the pre-repair database over gameplay that has since committed. A disaster restore needs a matching protected database/vault/configuration backup and receipt/account reconciliation. The tested restore is evidence of backup integrity, not authorization to reset live progress.

## Complete first post-repair round

Fixed observation cutoff **15:11:22.873 Berlin / 13:11:22.873 UTC**, after the 14:56 resume: all five original agents finished one scheduled turn. All remained ready on their original phases; no active, pending or needs-owner turn remained at cutoff. **Six executions all reported usage: 38,127 input + 1,295 output = 39,422 measured tokens**. Their conservative allocations remain separately recorded. There were **zero new unknown calls, malformed-output final failures, invalid-action submissions or new owner blockers**. Existing historical unknown calls remain exactly three, reviewed/cancelled and fully allocated.

| Account | Finished, Berlin | Calls | Final result |
| --- | --- | --- | --- |
| 01 | 15:07:20 | 1 | WAIT |
| 02 | 15:10:17 | 1 | WAIT |
| 03 | 14:58:45 | 2 | WAIT |
| 04 | 15:01:20 | 1 | WAIT |
| 05 | 15:04:18 | 1 | WAIT |

Account 03 first proposed a busy building order. `OBSERVED_BUILDING_BUSY` deferred it before submission; it used its second permitted decision to wait. There were **zero committed actions** in this short round. This establishes recovered scheduling, bounded valid decision handling and accounting across all five, including the three reviewed owners; it does not establish useful planning, negotiation or guaranteed error-free future provider responses. Those limitations remain visible.

Local health passed with execution enabled; both launch agents have live pinned-release PIDs, stderr remains empty, worker heartbeat is current and real sleep assertions remain present. Final identity checks matched all original bindings. Live acceptance uses only ordinary automatic turns on the original schedule; no extra manual inference or gameplay command was injected. The Mac fleet remains running until stopped. Server Fleet was not deployed or restarted by this assignment.

Final source is the tested/installed a627cae snapshot. Separate concurrent decision-service source edits later appeared in the sibling working tree; they were not installed or included in this repair's evidence/commits. Only the scoped repair/report files were committed here. PACT planning validation passed at the final check: 168 tickets, acyclic dependencies, 37 criteria, matching source snapshots and six generated views. `git diff --check` passed. No GitHub push was performed.
