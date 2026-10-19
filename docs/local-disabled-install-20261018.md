# Local disabled release installation — 18 October 2026

Founder authorized installing the verified Fleet release **locally with execution disabled**, keeping server Fleet untouched and starting no new runs. Installed exact Fleet `953034e24b5f93f82f0571eef55ecce9a61999d2`; PACT counterpart application source remains `60ec57b98c825eb1756d63121aa53d1aaa3b3315` (documentation69dfb7a at preflight). PACT runtime/game host and server/Mac Fleet were neither contacted nor upgraded. This is installation acceptance, not real-provider or live-engine qualification.

## Installed result

| Item | Accepted state |
| --- | --- |
| Local current | `windows-nemotron-comparison-20261014/current` selects immutable `releases/953034e24b5f93f82f0571eef55ecce9a61999d2` |
| Console and worker | Active/enabled; both actual process working directories resolve to953034e; inherited `FLEET_LIVE_ENABLED=0` verified |
| Primary configuration | Exactly one existing setting changed: `FLEET_LIVE_ENABLED=1` →0; every other configuration byte preserved |
| Restart protection | Owned `80-execution-disabled-20261018.conf` in both persistent user-service drop-in directories sets `Environment=FLEET_LIVE_ENABLED=0`; restarts/keepalive retain disabled execution |
| Health | HTTP200 with liveEnabledfalse |
| Dispatch readiness | Intentionally HTTP503, `ready:false`, `reason:LIVE_DISABLED`; no dispatch eligibility claim |
| Keepalive | Original existing Windows task restored Ready/enabled, one unchanged trigger; no task run invoked |
| Existing owners | Original two ten-account cohorts retain running intent; all20 agents still needs_owner/credential-ready;10121 turns and40 unknown40000 allocations (1600000 conservative tokens) retained |
| New architecture records | Every new binding/profile/task/event/admission/coordination/comparison table empty; no backfill, enrollment, draft or conversion |
| Helpers/state | Old7093cb8 release, encrypted state, database/operator credentials, Laya model/venv/certificates and original unit files retained; helper source byte-identical and original helper process left running |

Execution disable is deliberately separate from owner intent: no cohort was paused/resumed or account made eligible. No model, allowance, route, concurrency, schedule, anchor, authority, grant, identity, recovery review, reconnect, replay/cancellation or terminal population changed. Primary live flag and owned service overrides both require separately authorized execution work before changing them. Future deployment must not restore live1 from an old snapshot. No push was performed.

## Fresh backup, fencing and migration

The [earlier rehearsal](local-release-rehearsal-20261018.md) was followed by a **new installation-time** snapshot. Original keepalive was temporarily disabled; runtime negative-path conditions stopped console/worker and blocked attempted starts with MainPID0/ConditionResult=no. Port8820 closed; no active turns/reserved allocations/pending commands/credential refreshes/OAuth exchanges/other active database clients remained. All original22 business-table hashes matched the earlier handoff before work began.

GnuPG AES256/OCB streamed fresh PostgreSQL custom dump, globals and full installed release/config/state/helper/unit archive to authenticated encrypted artifacts. Separate fresh0600 archive key and matching vault key are outside artifact storage. No plaintext SQL/dumps were written to disk. Decryption completed successfully into anonymous RAM files before any extraction/psql/pg_restore consumer. Full authenticated file restore matched28266 entries and original units including modes, owners/groups and symlink targets (`--same-permissions`). Fresh network-none/no-host-port database restore matched all25 original tables; credentials, feedback, continuations, retained events/cognition/command resolutions/messages authenticated with original key/AAD; wrong key/AAD rejected.

On that clone, migration001–019 ran twice identically, preserved every original business table, and disabled archived old source read the newest schema/data with an inert new-schema marker retained. Inference stayed disabled and no old worker was qualified to execute newer profiles. This verified the fresh snapshot before actual migration/selection. Actual local migrations then ran twice with execution disabled, retaining all22 original business-table hashes. Only after that proof did atomic current-link replacement select953034e.

The console was admitted first while the worker stayed fenced. All25 HTTP acceptance checks passed before worker admission. Worker then started only after primary flag0 and persistent service Env0 were verified; process environment, selected revision and disabled readiness were read back. Temporary barriers were removed and the original keepalive restored. Label-verified clone/container/volumes and the0700 plaintext restored installation were removed; encrypted backups/keys/private proofs remain. No old backup was restored over the actual database.

## Installed acceptance and scope

Actual loopback HTTP checks cover health/livefalse, unauthenticated denial, origin/CSRF rejection, legitimate operator login/logout, HttpOnly/SameSite cookie, credential omission, retained history/decrypted run detail, all five profile descriptors, unsupported PACT specialist preview, empty new comparisons, shareable export without original account/cohort IDs/names, dashboard/JS/CSS delivery and no-store/nosniff headers. **Start, provision, connect and reconciliation requests return LIVE_EXECUTION_DISABLED before network/game work.** No create/review/replay endpoints were used. The temporary operator session was logged out.

The first history verifier incorrectly supplied an undocumented `limit` query field; strict input validation correctly returned400/INVALID_INPUT. The documented cursor-only request passed. This was a verifier correction; no application patch or database repair was required.

Current adapter settings preserve default-off event/outlook opt-ins: legacy-loop/1 and legacy-cognition/1 are compatible; reactive-basic/1, reactive-cognition/1 and specialist-coordinator/1 are listed but unsupported on this unchanged adapter descriptor. No capability, PACT feature flag or cohort profile was enabled to improve a check. F6 still lacks a supported PACT coordination/parallel protocol. Configuration compatibility is separate from provider quality/qualification.

A clean source archive was built and production-pruned privately; all77 compiled artifacts exactly matched the qualified build and all348 installed Git-tracked files matched Git blob hashes/modes. Installed production dependency graph/audit passed. All old release/state/helper files match their pre-installation inventory; original configuration differs only in the live flag. These proofs cover the actual selected artifact, not merely a separate development checkout.

## Verification record

Post-install full verification passed; detailed results follow. Private logs/proofs/scripts/encrypted archives: `/home/mnim/.local/share/fleet-phase0-validation-20261017/local-disabled-install-20261018/`. Separate keys: `/home/mnim/.local/share/fleet-local-rehearsal-keys/20261018-install/`. Keep both protected; never copy keys, configuration, credentials, private messages or raw run exports into Git. Same-machine backup/key retention is not off-host disaster recovery.

The generic F8 live-profile manifest remains disarmed with empty runs, no selected route/provider, no run authorization and unresolved authority/live-deployment/current-maintenance gates. The separate local receipt records this **authorized disabled installation**; it does not fabricate approval of the broader live-profile proposal. Current workers are active but execution-disabled, not under a maintenance fence. A later install needs fresh quiescence and a new snapshot; any live execution needs its own exact approved scope plus original recovery prerequisites.

Author review only under repository no-delegation instructions; no independent review, physical-device/provider certification or hosted CI is claimed. Source worktrees/main checkouts and historical evidence remain. This operational assignment selects no new backlog/deferred ticket.

## Supported rollback from this installed state

Fence both entrypoints and the keepalive again; preserve execution disable in both primary configuration and service overrides. Select retained7093cb8782e1b81df1ebddfd24a00eec9927b5b5 atomically **while retaining the newest database/schema/state/history/allocations**, then verify the same row/config/receipt/account proofs with inference disabled. Do not downgrade/drop tables, overwrite later history from this pre-install snapshot, replay uncertain commands, reconnect/review agents or enable older workers on unsupported task cohorts. Credential rotation and full older-worker live execution remain unqualified. Encrypted restore is disaster recovery after reconciliation, not an undo for gameplay. The private recovery recipe records owned barriers and exact paths.

### Final verification

| Command/check | Result |
| --- | --- |
| Exact staged clean `npm ci` → build → production prune | Passed; all77 compiled artifacts match qualified and post-install rebuilt outputs |
| Actual selected source/dependency packaging |348 tracked file blobs/executable modes match953034e; `npm ls --omit=dev` and production audit pass |
| PACT pre-install `check:dependencies` / audit | Provenance/actual-consumer guard passed;0 findings; no PACT runtime change |
| Fleet post-install `npm run check` | Type/style passed; existing non-failing diagnostics retained |
| Fleet post-install `npm test` |185 unit checks /43 files passed |
| Fleet post-install `npm run test:integration` |326 integration checks /39 files passed; existing isolated5437/fleet_test |
| Fleet post-install `npm run test:acceptance` |12 actual-handler/profile checks /2 files passed; owned isolated5438/pact_test started only for tests, stopped afterward |
| Fleet post-install build/boundaries/full audit | Passed;0 vulnerabilities |
| Actual installed HTTP checks |25 passed; worker fenced during negative-admission checks |
| Actual idle service acceptance |Both process directories953034e/Env0; health200/livefalse; readiness503/LIVE_DISABLED; keepalive Ready/enabled |
| Handoff preservation |22 original business table fingerprints exact;16 newly added tables empty; same10121 turns and40 unknown allocations; no new turns/allocations |
| Idle activity/session check |0 running turns, reservations, pending commands, refreshing agents, OAuth attempts and operator sessions |

All523 local source/integration/paired acceptance checks passed after installation. No real provider/game/account run was started. PACT's full application suite was not rerun for its documentation-only part; paired checks exercise actual qualified handler packages. Backlog/diff/report-link and final documentation style checks are recorded with local commits. Existing non-failing style/UUID-format/bundle warnings remain in private logs; no hosted-CI claim.

The installed root's0600 `local-disabled-install-20261018.json` is the local receipt, naming the exact selected source and protected evidence without credentials. The source worktree gains subsequent documentation commits; the installed artifact stays953034e and is never edited in place. Author review covers scope, durable disable, preservation, fresh rollback evidence, packaging and cleanup; independent review was prohibited by repository instructions.
