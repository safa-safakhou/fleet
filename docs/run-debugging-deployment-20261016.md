# Run debugging deployment — 16 October 2026

The founder authorized installing the verified debugging release on both existing Fleet installations. Source `e1cad0e793a284e96df57c9bddc2dc6e7b5d5898`, image `fleet:e1cad0e`, is installed locally and on the server. No source push was requested or performed.

## Installation and acceptance

- Local console and worker run from `/home/mnim/.local/share/fleet/windows-nemotron-comparison-20261014/releases/e1cad0e793a284e96df57c9bddc2dc6e7b5d5898`, selected by the existing current symlink. Actual process working directories match; both services are active.
- Server console and worker use the matching image at `/opt/fleet/releases/e1cad0e793a284e96df57c9bddc2dc6e7b5d5898`, selected by `/opt/fleet/current`.
- Both dashboards pass health, updated JavaScript assets, anonymous API rejection and authenticated historical run-report checks. Access remains `http://localhost:8820/` and `https://fleet.tinyagenttools.com/`, using existing operator credentials.
- Holds released at approximately 13:24 Berlin. By 13:24:53, two original server agents had completed ordinary scheduled turns with reported usage. At 13:25:23, an authenticated actual run report included 26 encrypted debug payloads among 44 events. This verifies installed capture, not fifty-agent round coverage or strategic quality. No extra inference probe was started.

## Preservation and rollback

Supported maintenance holds prevented new admissions while the server's existing turn finished naturally. Local execution was already blocked. No running call was cancelled. All turns, credential refreshes and OAuth exchanges were quiescent before stopping application services.

Both database dumps and configuration/state archives were saved in the existing encrypted restic repository, snapshot `f9969a7a9e6010d876182ac9c38a00633433f94b133eed378f497cb67b1e3f79`. All four files were restored from that snapshot and their SHA256 hashes matched. Protected operator evidence is under `/home/mnim/.local/share/run-debug-deployment-20261016`; server artifacts are under `/var/lib/fleet/state/run-debug-deployment-20261016`. Raw state, grants and correspondence are excluded from Git.

Before starting either new worker, exact row fingerprints matched across all 23 retained application tables. Only ephemeral worker heartbeat/health tables were excluded. Local history included 10,121 turns and 12,592 ledger rows; server history included 13,701 turns and 20,171 ledger rows. Identities, encrypted credentials, histories, pending commands, allocations, cohort intent and model/budget/schedule settings were preserved. Both running installations retain generation18 and their original anchors. Server's finished pilot and inactive draft remain unchanged.

Migration files are byte-identical; no migration was needed. Native application files were extracted from the same image as the server. Laya helper files were separately retained and byte-checked; its existing process and original certificate remain unchanged. PACT API, PostgreSQL, gateway, public edge and Fleet database retained their container IDs/start times. Public PACT health passed. No game or backup-policy deployment occurred.

A staging umask initially made packaged application files unreadable to worker UID995. The pre-activation check rejected that image before either runtime switched. Source file modes were corrected, the same committed source rebuilt, and a UID995:983 readability check passed. Corrected image configuration, architecture, OS and filesystem layers matched after server import. Maintenance leases were renewed, with all non-maintenance tables unchanged. A health assertion was also corrected to PACT's actual `status:ok` response and rerun successfully.

Source verification remains 148 unit tests, 222 integration tests and 52 final focused checks, plus browser workflow and 390-pixel layout checks. Builds reran type/style/boundary/production checks. Deployment acceptance used fresh runtime and authenticated HTTP readbacks. All temporary holds are released.

Previous application release243d9e4 remains available on both machines. Rollback requires supported holds and natural quiescence, then selection of the previous application code with the newest database/configuration retained. Never restore the pre-deployment database over subsequent commands, usage or rotated credentials.

## Existing local recovery gate

All twenty local agents were already `needs_owner` with `TRANSPORT_UNCERTAIN` before deployment. Their 40 historical unknown40000 allocations remain unknown, totaling 1,600,000 allocated tokens. Deployment did not review, reconnect, replay or clear those executions. Local historical reports work, but new local turn capture cannot be certified while these gates remain. A separate exact-interruption recovery review is needed, retaining history/allocations and reconciling any original receipt.

The server's three historical unknown allocations remain exactly 120,000 allocated tokens. No new unknown usage was created by deployment. No model/budget/schedule change, new experiment, terminal-population restart or source push occurred.
