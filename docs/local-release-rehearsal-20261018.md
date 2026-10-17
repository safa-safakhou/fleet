# Local release rehearsal — 18 October 2026

Founder authorized local encrypted backup, restore, rollback and maintenance fencing, with server Fleet untouched and no new runs. **Passed for the existing local target and disabled source rollback.** This is operational evidence, not an installation, provider qualification or permission to resume blocked agents. Berlin date18 October; observations are17 October21:59–22:05 UTC.

Candidate source: Fleet `6f565e10cdf27d2069a584621466c5da2062447a`, PACT `60ec57b98c825eb1756d63121aa53d1aaa3b3315`. Existing local current remains `7093cb8782e1b81df1ebddfd24a00eec9927b5b5`. Candidate migrations ran only on a disposable network-isolated copy. PACT application/runtime and server Fleet were not contacted or modified.

## Actual acceptance

| Check | Observed result |
| --- | --- |
| Authenticated encryption | GnuPG2.4.4, AES256/OCB; small preflight roundtrip passed; wrong key and tampering rejected |
| Full backup | Encrypted PostgreSQL custom dump41,579,386bytes, globals820bytes and installation archive1,261,824,784bytes; SHA256 recorded privately |
| Installation coverage | Exact release/current symlink, protected configuration/operator credential, state, certified Laya model/venv/metadata and original three systemd units;28,266 file entries |
| Key custody | Random archive passphrase and matching vault key retained separately under0700/0600 local permissions; neither in Git nor archive evidence logs |
| Restore authentication | GPG must finish successfully into an anonymous RAM file before tar/psql/pg_restore receives plaintext; no persistent plaintext dump files |
| Files | All28,266 restored entries match content, modes, owners/groups and symlink targets; original service units also match |
| Database | All25 original public tables match complete ordered row fingerprints; original25 relation ownership/ACL records and4 original sequence configurations/positions match after migration/rollback |
| Vault recovery |20 credentials,10 read memories,20 feedback records,20 continuations,114732 event details,2000 cognitive episodes,10 cognitive states,5207 updates,463 command resolutions and139 communications decrypted with original associated data; wrong key/AAD rejected; a second network-none restore confirms every populated ciphertext column is covered using the separately preserved key |
| Migration | Candidate001–019 applied twice; identical second result and all22 original application-table fingerprints retained; no account enrollment/backfill |
| Rollback | Exact archived old source read the migrated database and performed a disabled tick; a new inert comparison marker and all latest non-ephemeral data/schema survived; heartbeat-only operational change in clone |
| Real-target fence | Existing keepalive temporarily disabled; runtime systemd negative-path conditions blocked worker and console start attempts; both MainPID0, ConditionResult=no; local console port closed |
| Drain checks |0 active turns/reservations/pending commands/credential refreshes/exchanging callbacks/other active DB clients while fenced |
| Hold boundaries on clone | Wrong owner cannot renew; active turn, refreshing credential and exchanging callback each block release; quiescent owner can release; released hold cannot renew; fixture changes rolled back |
| Restoration of original target | Worker/console/helper active and enabled; keepalive Ready/enabled with original trigger; console HTTP200; all22 application tables exactly unchanged;0 new turns/allocations |
| Cleanup | Label-verified network-none clone, socket volume, anonymous DB volume and protected plaintext restored tree removed; encrypted archives, separate keys and evidence retained |

The existing two ten-account cohorts retain running intent, all20 agents remain `needs_owner` with ready credentials,10121 retained turns and40 original unknown allocations of40000 each (1600000 conservative tokens). No uncertainty review, reconnect, command replay/cancellation, identity/configuration/model/budget/schedule/anchor change occurred. Stopping/restarting entrypoints did not resume an eligible agent. Existing source checkouts, game host, Windows Ollama and historical terminal populations were not altered.

## Findings incorporated into the procedure

Default non-root tar extraction applied its umask to one empty venv lock file, changing0666 to0644. The encrypted archive was correct; authenticated re-extraction with `--same-permissions` matched every entry. This option is now mandatory in the [repeatable procedure](local-release-rehearsal-runbook.md). An initial private validator used `agent_id` instead of communications' actual `owner_agent_id` for AAD; correcting the validator to the unchanged application binding authenticated all139 rows. Initial proof-helper environment propagation and Windows ledger-path writes were also corrected before backup acceptance; evidence retains failures. No application defect or production data repair was required.

A DB maintenance hold fences claims, but does not itself close existing credential/OAuth entrypoints or recovery loops. Actual maintenance therefore used both process startup barriers and the disabled keepalive. Clone drain tests verify hold ownership/release checks without changing original hold/history rows. A future deployment must fence again and obtain a fresh quiescence observation: the temporary barriers were removed and **`workersFenced:false` remains in the saved manifest**.

Old workers have not been certified to execute newer profile cohorts or refresh rotated credentials. Rollback acceptance is explicitly **inference-disabled source rollback while retaining the newest database/schema/state**, not old-worker live execution. Never restore this pre-upgrade snapshot over later gameplay or allocation history; reconcile disaster recovery separately. This same-machine backup does not certify recovery after loss of the machine or independent off-host key availability.

## Evidence, checks and remaining gates

Private ledger: `/home/mnim/.local/share/fleet-phase0-validation-20261017/local-release-rehearsal/`. It retains guarded scripts, encrypted artifacts/checksums, before/fenced/after proofs, full file manifest, isolated validation logs and cleanup receipts. Key directory is separate under `/home/mnim/.local/share/fleet-local-rehearsal-keys/20261017/`. Do not copy credentials, decrypted rows or keys into source/reports.

The saved-proposal regression failed on the old false rollback gate before updating the manifest. It now requires the accepted local rollback gate while explicitly proving that a false rollback gate blocks again. Exact run selection remains empty; authority, deployment, current quiescence and run authorization remain blockers. No provider is qualified and no push is authorized. Final verification results are recorded below.

Author review only, as repository instructions prohibit delegation; independent review and hosted CI are not claimed. This assignment covers no new feature/ticket or deferred roadmap work. Source worktrees are retained and verified changes receive local commits only.

### Final verification for this follow-up

| Command/check | Result |
| --- | --- |
| Fleet `npm run check` | Type/style passed; existing non-failing diagnostics retained |
| Fleet `npm test` |185 unit checks /43 files passed; saved-proposal regression red before gate update, green after |
| Fleet `npm run test:integration` |326 integration checks /39 files passed against existing isolated5437/fleet_test fixture; synthetic only |
| Fleet `npm run build` / `check:boundaries` | Passed |
| Fleet `npm audit` |0 vulnerabilities |
| Compiled `reviewProfileRelease` | Not ready; execution false, push false; rollback gate cleared, authority/deployment/current quiescence/exact run/run authorization blockers retained |
| PACT backlog render/check | Passed; application source/tracker/deferred tasks unchanged |
| Both `git diff --check`; report-link review | Passed |
| Final protected source/runtime proof |22 original business table digests and all28266 installed file entries/original units match; same7093cb8; no new turns/allocations |

All511 Fleet checks passed locally. PACT application tests and the12 cross-repository handler/profile acceptance checks were not rerun for this documentation/gate-only follow-up; their earlier exact-revision acceptance remains documented separately. Main checkouts remain clean; no private artifacts/keys/state are staged. The protected author review records scope, preservation, key/cleanup proof and operational limitations.
