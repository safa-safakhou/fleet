# Local one-hour world preparation — 19 October 2026

The founder requested a fresh PACT world on this Mac with all four Fleet architectures, no added experiment call/token/action/event quotas, and launch deferred until explicitly requested. Prepared source and runtime are separate from every existing Mac/Windows/server population. Work is owned locally without delegation.

## Runtime change

Optional `FLEET_RUN_WINDOW_FILE` is a private operator-owned JSON file. With it unset, existing runtimes are unchanged. With it set, missing/malformed/prepared/closed/expired data refuses new model dispatch, helper inference and game lease/open/submission. Only status=running, valid integer startsAt/endsAt exactly3600000ms apart and current wall time inside that interval admits work. There is no request count or token counter in this gate.

The runtime wraps the shared RoutedModel used by both the legacy bridge and modern ModelAdmission, wraps game ports used by both integrations, and wraps Laya. Provider dispatch rechecks the gate before and after the existing dispatch callback. A response already dispatched can return known usage after cutoff; a new game submission cannot use that late answer. Receipt lookup and lease close remain available. The worker skips task admission while the window is closed; its normal recovery/read-only receipt path remains.

The prepared cohorts use continuous lifetime accounting with null total call/token/deadline fields. Existing transport/context and per-turn engine settings use the supported maxima; no added free-disk reserve is imposed (FLEET_MIN_FREE_BYTES=0); the outer one-hour gate supplies the experiment's time boundary. Models cannot edit its file, approve authority exceptions or obtain operator secrets. No gameplay authority is implemented in this wrapper.

## Actual preparation

Twelve new synthetic accounts/kingdoms and12 normal authenticated bindings are ready, three each for legacy-loop/1, legacy-cognition/1, reactive-basic/1 and reactive-cognition/1. Only legacy cognition enables llm-centered-v1/Laya; the modern profile selects its own continuity module. All use pinned Nemotron4B, thinking=true and one shared route slot. Same15-minute periodic cadence, with eligible event wakes on reactive profiles. The existing certified Laya helper health/certificate matches; no prediction was requested.

Fresh mandates have all listed delegable development, training, contact/message, supply/garrison entry/exit, scouting/raid and transfer permissions, maximum supported resource envelopes, no added reserve floor and no synthetic-owner exception policy. These are not resources or a human-only permission bypass. Owner goals are matched guardian/merchant/diplomat preferences, not required messages or alliances.

Private state is under `~/Library/Application Support/PACT Local Worlds/local-four-20261019-ef5d29eb/`. PACT is on3400 and the new Fleet console8830, with independent PostgreSQL on5451/5452. The game clock is parked, every cohort is draft, window times are null, and no new Fleet worker exists. Actual readback verifies0 turns/0 compute executions/0 new unknowns. The existing Mac Fleet on8820, existing helper and remote/server/historical worlds were left untouched.

[PACT operator controls](../../pact/docs/operations/local-world.md) are documented in the sibling isolated PACT worktree. User launch will verify pinned artifacts, start all four groups at one anchor, observe actual unequal compute/outcomes, and close admission after one hour. A later window cannot erase the existing hour or reset these owners.

## Verification and limits

- Red/green run-window tests:5 passed, including2000 allowed calls inside the same hour, disarmed refusal, exact cutoff, known late-response accounting and original receipt recovery.
- Native type/style/build/boundaries passed;224 unit tests passed and18 Linux-only cases skipped. Linux Node24 verification passed242 unit,393 serial integration and12 paired PACT/Fleet acceptance tests in disposable fixture databases.
- PACT gateway HTTP test, type/lint/build/405-unit suite and actual local account/world/interface acceptance passed. Prepared inference count is0; these are not real-model gameplay or intelligence claims.
- Independent AES256-GCM archives authenticated and restored into a temporary network-disabled PostgreSQL clone, matching complete rows in10 core game tables and39 Fleet tables. Keys/raw evidence remain private and no live data was restored.
- Existing warning diagnostics remain. Author review only, no delegation or hosted CI claim. Test setup failures (read-only npm workspace mount, missing qualification/paired fixture port aliases and exported rules build and transient PostgreSQL initialization socket) remain recorded; corrected isolated source exports/fixtures are used for final checks. No real model/provider/helper was called by tests.

Completed verified changes are committed locally. No push, main/master merge, old-population recovery review, public release or observation launch is authorized or performed by preparation.
