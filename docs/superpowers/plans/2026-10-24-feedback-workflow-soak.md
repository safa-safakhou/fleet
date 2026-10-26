# Feedback and bounded workflow correction

User authorization: implement inline and run 24 synthetic kingdom sessions for 30 minutes, Nemotron4B only, no GUI, game execution disabled, E4/KQ1 blocked. Preserve existing changes and services; no commits/push or installed cutover requested.

Design: add an opt-in generic correction loop over accounted model attempts. It validates schema and host semantic rules, delivers actionable feedback plus the prior proposal, and permits at most two corrections within existing call/input/deadline limits. Unknown usage, transport uncertainty, authorization failures and repeated identical failures terminate without replay. Existing default retry behavior remains unchanged. Expose the loop through ModelAdmission so every actual correction reserves and settles independently.

Metrics: attempt validity, recovery, task completion, factual accuracy, rejected valid proposals, invalid effects, repeated failures, input/output/unknown usage, call/total/queue latency and scope isolation. Unmeasured judgments are null, not success or zero. The synthetic runner supplies independent outcome grades; production code cannot infer strategic quality from schema validity.

Protocol: fresh isolated vLLM run using the previously hashed BF16 Nemotron4B snapshot, four inference slots, 24 independent synthetic sessions. Each complete workflow obtains current evidence, proposes a nonexecuting choice and answers the owner from verified facts. Include schedule/event triggers, pending requests, historical/peer text, stale observations and denied proposals. Do not claim these session variants execute all eight existing architectures. Thirty-minute observation window, one workflow per session per minute, no catch-up backlog, at most 4320 actual calls, six calls per workflow including up to two corrections per step, 60-second per-call and 90-second task deadlines. Stop new work at window end and drain/abort owned in-flight calls; no game/runtime port. Record checkpoint progress and all failures; no mid-run repair or replay. Stop owned provider after completion.

- [x] RED→GREEN correction loop: errors reach next call, input/authority preserved, known usage, hard bounds, repeated failures, cancellation, no retry on unknown outcomes.
- [x] Ledger-backed integration verifies multiple allocations settled once, no command execution and existing scope/budget fences.
- [x] RED→GREEN workflow metrics and synthetic workflow checks with independent expected results.
- [x] Offline unit/integration/type/build/style/boundary checks before inference.
- [x] Fresh 24-session/30-minute run; observe actual concurrency, latency, resources and complete-task outcomes.
- [x] Inline self-review, final verification and evidence report. Preserve failures and distinguish synthetic workflow acceptance from gameplay/architecture acceptance.

Ruling: the user's explicit implementation instruction approves the previously discussed feedback-loop design; no repeated design approval. Work on master per AGENTS. Review inline per user, without a delegated reviewer. Thirty minutes describes the observation window, not installation/implementation time. No new training or context deletion.

Review ruling during observation: expose the already-tested correction capability through the scoped architecture service, retaining fixed model/binding and guards. This is source/API plumbing outside the running synthetic harness; none of the pinned runner/model/loop/fixture sources change during observation. Added scoped integration checks; existing architectures remain opt-in and unactivated.

Observation ledger: private root `/home/mnim/.local/share/fleet-feedback-20261024-1232/`; runner session71546. The 30-minute monotonic observation remains in progress. Live-candidate source pins are unchanged; no retry/replay of failed workflows. Offline verification now958unit/50selectedisolatedintegration/type/build/boundaries. New scoped API passed13scoped-service integrations. Dependency audit retains one moderate fast-uri finding. Source/API changes are uncommitted; installed settings remain unchanged.

Observation complete:720workflows,2564calls,1481991measured tokens, zero unknowns/game commands.447answered/364correct/98recovered,273incomplete/83suboptimal. All candidate source pins matched at closure, provider stopped with exact ownership checks. Post-run RED→GREEN repairs retain metrics if retry-budget eligibility throws and distinguish393rejection-affected workflows from454first-pass failures, exposing queued end-to-end latency. Original result remains untouched. No extra model trials. See [actual report](../../feedback-workflow-soak-20261024.md). Final verification pending.

Final verification:960unit/50selectedisolatedintegrations, types/build/boundaries/changed-code style/links/whitespace passed. Inline self-review complete; existing moderate fast-uri finding and pinned-proposal formatting issue preserved. PACT clean; Fleet master uncommitted. No further model calls, live activation or game execution. Provider confirmed stopped.
