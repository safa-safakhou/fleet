# Recovery and liveness deployment — 15 October 2026

Implemented, tested, installed on the server, and source-pushed to both repositories. This closes RL-F01–04 and RL-P01–04 for the authorized recovery scope. The 23-finding register retains individual implementation and regression evidence. Deployment verifies installation and preservation; failure-path behavior is supported by deterministic synthetic tests, not production fault injection or new model experiments.

## Installed and pushed revisions

| Component | Source commit and verified source push | Runtime image | Active services |
| --- | --- | --- | --- |
| Fleet | `243d9e469c9606987d1a0591d8bef21f69c46d6a` | `fleet:243d9e469c9606987d1a0591d8bef21f69c46d6a` | console, worker |
| PACT | `1e21a6b8c57e32840d0f4cb9ee9352ff055e70a0` | `pact-runtime:recovery-liveness-20261015-2` | API, rules, seals, inference, notification, channel |

Both `origin/master` remote heads were checked after normal, non-force pushes. The later report commit adds documentation and tracker evidence only; these source commits remain the exact runtime revisions.

Fleet active release: `/opt/fleet/releases/243d9e469c9606987d1a0591d8bef21f69c46d6a`, selected by `/opt/fleet/current`. PACT active Compose files: `/srv/pact/releases/recovery-liveness-20261015-2/infra/production/compose.yaml` and `compose.pact-host.yaml`, project `pact-production`, existing private production/current environment files. `/srv/pact/state/current.env` selects the new image. Use this release's Compose directory for subsequent application maintenance; `/srv/pact/source` retains the previous source checkout.

Server image IDs:

- Fleet: `sha256:0010723902abc561937d87d4675c29e5cd04699aa749bdd68ee611a7bedc6605`.
- PACT: `sha256:fe0e6a62cf720e19ebf898db88fc2472c4d3c19b7cea3b1f27f27e2171f27d74`.

Docker rewrote image IDs on import. Every filesystem layer, complete runtime configuration, architecture, OS and creation metadata matched the built images, and revision labels and archive checksums matched. Normalized content/config SHA256: Fleet `de294eb7bca5e2f922777d50b094c9b5a4bec959f5cdbbe570becb3572afdf1b`; PACT `bf81f05bd3b47703db602aba0c959c0fd4ee36e02b309f14cb6ed34ec5a756c6`. Activation waited for this comparison; matching tags alone were not accepted.

## What changed

Fleet now keeps owner cohort intent separate from individual failures. Durable per-agent recovery records distinguish observation, paid inference, prepared commands, dispatch, receipt uncertainty and exposure review. Safe read failures and known nonexecution can recover within the original allowances and cadence. Submitted commands only reconcile their original receipts. Unknown usage retains its full allocation; it cannot silently turn into zero usage or trigger unlimited paid retries.

Codex execution uses kernel-owned exclusion and an independent bounded process-tree guard, including worker-death tests. Worker readiness, progress, expiry supervision, database backoff and disk admission are separate. Candidate capacity checks precede selection, and maintenance holds no longer rewrite owner intent. The console exposes reasons and next recovery actions.

PACT and Fleet share a prospective proof-bound refresh recovery contract. An independent secret proof can recover the same encrypted rotation result for a bounded time after a lost acknowledgment. Account/client/grant checks, revocation, child rotation and expiry remain enforced. This does not retroactively repair a legacy ambiguous refresh.

PACT inference renews uniquely owned job leases, persists model-attempt allocations/phases, bounds provider calls and fences stale results before tools. Final usage survives malformed answers and late acknowledgments; missing final usage is a scoped unknown-exposure gate. Future operational world pauses can recover only after repeated consistency checks. Manual and legacy pauses remain held, and no offline economy catch-up is introduced.

## Verification and installation evidence

- Fleet: **147 unit / 221 integration** tests passed, plus type/style, boundaries, build and production dependency audit. All 147 unit tests also passed inside the built Linux test image with networking disabled.
- PACT: **384 unit / 436 integration** tests passed, with one existing optional live-provider skip, plus full build/type/lint/boundaries/build-order and 26 frozen v1 contract checks. The 436 count includes the final completed-response/missing-usage regression.
- Synthetic tests cover process death and orphan exclusion, low disk/database loss, lost refresh acknowledgments, concurrent refresh/revocation/expiry, receipt reconciliation without replay, a 31-second provider operation beyond the old 30-second job lease, late usage, stop fences, finite exposure limits, original scheduling and operational-versus-manual clock recovery.
- Encrypted rollback snapshot `7414b04fa64cc6c0760a9bfadeec027b1115f193ebf1e5afe19cbdea09c4be21` was restored. Both database dumps and the private runtime/configuration archive matched their original SHA256 hashes. It uses the existing local encrypted backup repository; no server backup or WAL policy was enabled.
- Both real database clones restored successfully. Migration rehearsals preserved every original column in **162 PACT tables / 19 Fleet tables**; Fleet idempotence ran twice. No API, worker or model ran against the clones.
- Production applied `0068_refresh_recovery.sql`, `0069_model_attempts.sql`, `0070_operational_clock_recovery.sql` before dependent Fleet installation. Fleet migration preserved all **19 original production tables**, including encrypted credentials, allocations, review history and account bindings, by exact row fingerprints during process quiescence.
- PACT API switched during a read-only verified local quiet boundary with **10.78 seconds** before the next scheduled slot; canonical readiness returned after **2.769 seconds**. The temporary warmed API was then removed. The other five PACT workers rolled individually. No local service or schedule was altered.
- At **2026-10-15T13:24:52Z**, all eight expected application containers were running the correct image/source with zero restarts. Public Fleet readiness and PACT readiness returned ready; public OAuth metadata advertised `pact.refresh-recovery.v1`. Fleet supervisor heartbeat was fresh. PACT remained active and committed time/tick sequence advanced across readbacks.
- PostgreSQL, gateway and public-edge IDs and start times were unchanged. `archive_mode=off`; `pact-backup.service` and `pact-backup.timer` remain masked. Optional A2A is disabled, verified directly against the API. The existing public `/v2/interfaces` gateway route still returns the web fallback, so a public HTML 200 was not treated as interface proof.
- The two assignment-owned disposable database containers were removed. Encrypted rollback and private verification artifacts remain protected outside Git. No credentials, private messages or raw account exports were committed.

## Existing populations and remaining decisions

The server's same **50 Luna accounts remain paused at generation 17**, with **48 ready / 2 requiring owner action**. Agent17 still requires same-account reconnect after the legacy ambiguous refresh. Agent27's 90-second `CODEX_TIMEOUT` ended at **2026-10-15 04:45:16.880 UTC** and still requires its own exposure review. The failure's exact underlying CLI delay cannot be reconstructed from the surviving historical evidence. No game command was dispatched by that turn. All three historical unknown allocations remain intact; older reviewed cases were not reopened. There are no current-cohort pending commands, running turns or newly backfilled recovery operations. A healthy worker with a paused cohort is readiness, not agent progress.

The Windows/WSL **20-account runtime remains on `9fe70e2d096f209ea73b308789f69d80f23019e0`**. Both original cohorts remain running with their identical identities, settings, budgets, anchor, service start times and zero restarts. The preservation readback had **20 ready / 0 unknown / 0 pending**. Ordinary scheduled work continued after the PACT switch: 15 completed turns and 20 reported model calls by the sampled readback. Two LLM-only turns returned `INVALID_MODEL_OUTPUT`; these were recoverable decision-quality failures and did not block agents or create unknown usage. This was observation of existing scheduling, not an added experiment. Mac was unavailable and excluded; historical draft/terminal populations were preserved.

Further owner actions remain separate: review Agent27's exact uncertainty, reconnect Agent17 to its existing account, and decide whether to resume the existing cohort. No such actions were performed. Unknown actual Codex consumption cannot be proven bounded by Fleet's internal allocation; automatic continuation under unknown cost needs an explicit exposure policy or enforceable provider ceiling. Missing submitted-command receipts, revoked/expired legacy grants, unverifiable legacy locks and corrupt/irreducible protected input retain explicit repair gates.

This release addresses recovery and failure containment. It does **not** certify improved communication, strategic judgment or higher-bracket attainment. Those require observation after an authorized resumption and the existing game/agent investigation, with liveness distinguished from incentives and model decision quality.

## Rollback

Previous Fleet release `9fe70e2d096f209ea73b308789f69d80f23019e0` and PACT image `pact-runtime:agent-reliability-20261015-1` remain available. Private before-selection and deployment proofs are under `/srv/pact/state/operator/recovery-liveness-20261015`; local encrypted-backup/restore/migration/image/readback proofs are under the assignment's protected operator directory. Roll application code only after natural operation quiescence and inspection of newer recovery jobs. A legacy API cannot service saved proof-bound refresh recovery; retain the compatible PACT contract while Fleet has pending recovery attempts. Never restore an older database over newer commands, allocations, game ticks or rotated grants, and never use rollback to clear an owner pause or exposure gate.
