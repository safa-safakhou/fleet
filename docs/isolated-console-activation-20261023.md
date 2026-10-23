# Isolated console activation — 23 October 2026 (follow-up 24 October local)

The user explicitly approved starting only the isolated candidate console, with game execution disabled and no worker or model calls. The package was unchanged and within its approval window. Startup completed at source `966f2d2069d027cb382b67beba70aef30a228ff8` using native Node 24.12.0.

Console: `http://127.0.0.1:38765`, bound only to loopback. Native PID at verification: 1069049. It remains a separate empty installation; existing Fleet at port 8840 and paused PACT worlds were not changed. No autostart was installed.

All 20 post-start checks passed at 23 October 2026 21:57:45 UTC / 23:57:45 Europe/Berlin: exact PID/start ticks/executable/directory and environment, sole loopback listener, disabled health, HTML and built assets, unauthenticated denial, bad-password rejection, valid operator login/session and authenticated state, verification logout/revocation, empty installation and no worker process/health. `/ready` returning 503/ready false is expected because no worker is running.

Zero cohorts, agents, turns, allocations, tasks, task claims, commands or worker-health records were observed. Zero model calls or game commands were made. `FLEET_LIVE_ENABLED=0` remains fixed. E4/KQ1 remain blocked and unrun. Four-case behavioral acceptance does not imply general negotiation/gameplay qualification.

Immutable request SHA-256: `0cdb595ebb95e677f57c8599338505003250c1e62bcb6ad756e33691f82bddd8`. Activation result SHA-256: `340bf927bee26bdf6831db0f9e6b0253525c4fecb0003060e708aacd246bef0c`. Explicit user approval matches the request; proof hashes were checked again during the offline follow-up. The original request is preserved unchanged; approval/result are separate private artifacts.

Private receipt: `/home/mnim/.local/share/fleet-candidate-final-facts-20261023-2141/ACTIVATED.md`. Credentials, private settings, approval and raw results remain outside Git. The [earlier qualification/installation report](final-facts-qualification-and-installation-20261023.md) records the historical pre-activation state.

The running console must be inspected with a read-only running-status command. The original pre-start check requires a free port and frozen pre-start database state; it is not a running-status or automatic restart command. No restart, worker, enrollment, model trial, persistent startup or ordinary-instance cutover is authorized by this receipt.

The [24 October offline follow-up](offline-post-activation-follow-up-20261024.md) reconciled both checkpoints, added a separate read-only running-status helper and checked configuration/coverage without further inference or activation.
