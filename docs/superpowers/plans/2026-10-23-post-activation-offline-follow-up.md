# Post-activation offline follow-up implementation plan

> Execute inline using superpowers:executing-plans. No delegation. Executed under the user’s subsequent explicit approval; no additional model calls were authorized.

**Goal:** Reconcile the completed console activation and identify the next genuine acceptance gap without starting gameplay or another trial loop.

**Architecture:** Keep the immutable installed package and original request intact. Use documentation updates, a separate read-only status helper and existing fake-provider/isolated-database checks; do not modify or restart the running console.

**Tech stack:** Native WSL, Node 24/TypeScript, PostgreSQL 17 owned synthetic fixtures; Nemotron 4B only for any separately approved later inference.

**Basis:** User requests a bounded next-step plan, with game execution disabled, E4/KQ1 blocked and inline execution. Completed acceptance is recorded in ../../final-facts-qualification-and-installation-20261023.md and the private activation receipt at /home/mnim/.local/share/fleet-candidate-final-facts-20261023-2141/ACTIVATED.md.

## Boundaries and completion rule

- One 30-minute session total, including verification and handoff. Task caps below share that ceiling; they do not reset it.
- Zero model calls, game commands, workers, enrollment, service restarts, autostart changes or existing-instance cutover.
- Preserve the running candidate, ordinary services, paused worlds, unknown usage and pending commands. E4/KQ1 remain blocked and unrun.
- Use main repositories on master; preserve private evidence. No pushing.
- Stop at first unexpected safety/state mismatch. Do not repair and silently repeat qualification. At the deadline, report completed work and the exact remaining gap, even if incomplete.
- Success means accurate durable checkpoint, reliable read-only running status, and an evidence-based coverage/gap report. It does not mean general gameplay acceptance.

## Task 1 — Reconcile activation records (5 minutes)

Files: /home/mnim/repos/mine/fleet/docs/current-state.md; /home/mnim/repos/mine/pact/docs/current-state.md; add /home/mnim/repos/mine/fleet/docs/isolated-console-activation-20261023.md. Link the old qualification report to the later activation result without rewriting its historical findings.

- [x] Read the private approval/result and verify hashes against the original request and receipt; print no credentials.
- [x] Record that user-approved isolated console startup completed and all 20 post-start checks passed. Distinguish the historical stopped checkpoint from the activated checkpoint. Preserve the closed six-call allowance and narrow four-case qualification scope.
- [x] Check local links and `git diff --check` in both repositories. No application suite is needed for this documentation task.

Output: both current-state files agree with the latest activation receipt, with one concise committed-safe activation report. Do not describe old gameplay failures as resolved.

## Task 2 — Add safe running-status inspection (10 minutes)

Files: create private /home/mnim/.local/share/fleet-candidate-final-facts-20261023-2141/status-console.mjs and status-console.test.mjs. Do not edit pinned service-control.mjs, candidate files or the immutable activation request.

Interface: CLI `status-console.mjs`; read protected installation-private.json and active-process.json; return only `{status, pid, url, liveEnabled, workerPresent, counts}` plus bounded failure codes. No secrets or session tokens in output. Exit nonzero for identity/configuration/listener drift; normal worker absence is expected.

- [x] Use injected filesystem/network/database readers for synthetic checks: stopped PID, reused PID/start-tick mismatch, wrong executable/directory, changed environment, foreign listener, live-enabled health, and healthy console with no worker. Assert the helper never signals a process, spawns a service or calls a provider.
- [x] Implement the read-only inspector. Check exact recorded process identity, protected environment match, sole loopback listener, /health liveEnabled false, and zero agents/tasks/allocations/commands/worker heartbeat in the positively owned installed database. Ownership checks precede database inspection.
- [x] Run `runtime/node --test status-console.test.mjs` from the private installation root; then invoke the status helper once against the running console. Preserve its safe result privately.

Output: a working status command for an already-running console. The old pre-start check intentionally requires a free port and frozen pre-start state; do not reuse it for running status. Existing ownership-checked stop stays available. Restart/autostart is outside this task.

## Task 3 — Check real wiring with offline fixtures and report gaps (15 minutes)

Inspect: /home/mnim/repos/mine/fleet/src/games/pact/requested-facts.ts; src/engines/autonomous-specialists/requested-facts.ts; src/engines/autonomous-specialists/engine.ts; docs/pact-requested-facts-20261023.md. Tests: tests/unit/pact-requested-facts.test.ts; tests/unit/requested-facts.test.ts; tests/unit/specialist-read-progress-engine.test.ts; tests/integration/environment-bindings.test.ts; tests/integration/autonomous-specialist-engine.test.ts.

- [x] Compare the installed disabled configuration with the qualified fixture and implemented typed-fact path. Separate source implementation, installed configuration and real-model coverage. In particular, inspect whether FLEET_PACT_FACT_REQUESTS and read-final.v3 are configured; do not enable them or enroll actors.
- [x] Run focused existing unit tests with fake providers. Run the selected binding/engine integration tests only through the owned-fixture wrapper: `node --import tsx scripts/test-architecture-offline.ts --repo fleet --suite integration tests/integration/environment-bindings.test.ts tests/integration/autonomous-specialist-engine.test.ts`. Never use the running installed database as a test fixture.
- [x] Produce a compact coverage table for request configuration/authenticated scope, metadata → read → final, pending-request proposal, unavailable/unknown facts, known literals and rejection/preservation paths. Reference existing passing evidence; add a regression only for a demonstrated uncovered failure, within the shared time ceiling.
- [x] Report actual results, any installed-profile mismatch and exactly what remains unqualified. Check documentation links/whitespace and, if requested for execution, commit verified repository changes in both main repos. Do not run a real-model probe automatically.

Output: a finite list of demonstrated gaps, or a finding that no further offline fix is currently required. Do not invent new tasks simply to extend testing.

## Subsequent decisions, outside the 30-minute session

If a concrete behavioral gap remains, propose one new game-free Nemotron 4B probe covering that gap, at most six calls / ten minutes, no retries, stop on first failure. Freeze its candidate, fixture, expected results and budgets before requesting authorization. Do not reuse the completed allowance. If no uncovered behavior justifies inference, propose no further trial.

Persistent console startup at reboot and promotion to the ordinary instance are optional operational changes, not outstanding requirements of the completed isolated-console assignment. Each needs an explicit scoped decision. Broader real negotiation/gameplay acceptance remains unestablished and cannot be completed while gameplay and E4/KQ1 are prohibited; leave those stages deferred.

## Review focus

Checkpoint drift is covered by Task 1. PID reuse, foreign listeners, live-enabled settings and secret leakage are covered by Task 2's synthetic status checks. Confusing configured/installed behavior with source-only or synthetic acceptance is covered by Task 3. No step needs delegation, real inference or a retained-world write.

## Execution result

Completed inline on 24 October 2026 local within the shared 30-minute ceiling. [Results, exact checks and remaining decisions](../../offline-post-activation-follow-up-20261024.md). No additional source regression was needed because the selected existing checks passed. Repository documentation and plan are committed at handoff; private status tooling and evidence remain protected outside Git.
