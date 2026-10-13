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

Read the actual ChatGPT chat **“Slave Game scheduler 1”** (`6acabd8b-2f54-83ed-808a-152014db7dc5`). Its final report says the gameplay write-session request was blocked by an **OpenAI safety check**, and the chat disabled its automation because autonomous gameplay was blocked. Earlier messages report safety-blocked introductions and a separate PACT permission refusal on construction cancellation. This explains the game-result gap; it is not a PACT database/authentication outage. The chat is idle. All of its game identities and pending construction remain intact.

This is direct chat-report evidence; the app's read tool exposes summaries/messages, not the safety review's detailed internal decision or authoritative schedule configuration. No blocked request was retried, no alternate route used, and the automation was not silently re-enabled. Legitimate recovery is owner review of that request and its existing app/task permissions in the same chat; if permitted, resume only its existing task without bypassing a denial. Any renewed failure should leave a clear blocked status rather than pretend success or endlessly retry.

Official [ChatGPT action-review documentation](https://learn.chatgpt.com/docs/dots/controls#how-action-review-works) explains that automatic review can require approval or a human step according to instructions, permissions and safeguards. It does not identify the exact reason for this particular refusal. The OpenAI Docs skill was used for this product investigation. Consumer scheduling/approval policy was not changed as part of repairing the native local fleet.
