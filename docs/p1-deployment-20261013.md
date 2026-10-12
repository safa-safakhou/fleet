# P1 deployment and same-fleet recovery — 13 October 2026

Status: deployed and resumed under the founder's explicit request. This supersedes the earlier P1 launch-pending boundary for this deployment/review only. No new cohort, account, mandate, owner exception, model or allowance was created.

## Releases and backups

- PACT: `fleet-p1-20261013-1`, built from `b40ee5dd91febe4bea1f979bfa436824091dd4bd`. Runtime and gateway are on that release. Source archive SHA-256: `958cf29b427e101be523cd7a5ad656775f9fc26f7176ee4443661a5351d915a2`.
- Fleet: `3407e5a550d3921e30e8e7bb80710b883af9128b`, at `/opt/fleet/current`. Its Linux build/check/boundary verification succeeded. The prior 217 passing tests cover this exact code; no controller code changed during deployment.
- Fresh PACT encrypted backup: `bfe23d82`; backup service returned `Result=success`, `ExecMainStatus=0` before application replacement.
- Fleet backup: protected `/var/lib/fleet/backups/pre-p1-20261013.dump`. An isolated PostgreSQL restore with no network or live data mount verified every row in all seven tracked Fleet tables against the post-deployment database before recovery. The temporary restore container and its own volume were removed.
- PACT previous release/configuration and source archive, Fleet previous release and original protected configuration remain available for code rollback. Do not restore an old database over new turns.

PACT's canonical deployment verifier passed. A real authenticated, read-only request for an existing fleet account confirmed the same account/kingdom binding, seven owned `nextUpgradeChecks`, two builder slots and current game time. Both public HTTPS health endpoints pass. Fleet services were replaced with execution disabled and the target cohort paused, then its original protected configuration was restored byte-for-byte. No account enrollment or inference was used for read acceptance.

## Cancelled model execution

The unresolved record was agent ordinal 31, turn `6b4a661b-6be1-42d9-ba6d-d81655850333`, ledger `a6cffb0e-b820-48a7-825b-683dd4a4302d`. It began at `2026-10-12T20:30:14.875Z`; the model began at 20:30:15.703 and the turn ended at 20:31:45.814 with `CODEX_CANCELLED`. This matches the existing 90-second execution timeout. There was one reserved call, zero game actions, no pending game command and no returned decision.

No worker Codex child or execution lock survived. The dedicated ephemeral CLI's thread and log databases were empty, and no retained completion/usage event was available. Unrelated root-owned Codex processes were left untouched.

**Exact usage cannot be reconstructed.** The original ledger remains `unknown`, with its full **40,000-token allocation**, null reported input/output and the turn's `unknown_usage=true`. It was neither refunded nor relabelled as reported/zero. The founder-authorized review is recorded as `compute.unknown.reviewed`, the existing non-command `turn.reviewed` and a consented inspector event explaining the retained allocation. The original turn becomes `cancelled`; its code, deadline, calls, actions and counters are retained. Nothing was replayed. The same agent was made ready through the existing guarded operator method, then the same cohort resumed through the existing scheduler method.

The dashboard therefore still truthfully contains **one historical unknown-usage execution**. Its operational blocker has been reviewed; it is not an unresolved running process or a fabricated exact usage figure. A future new unknown/overrun still halts admission and needs its own review. This request does not authorize automatically acknowledging future uncertainty.

## Preservation and actual resumed behavior

Before recovery, the restored pre-deployment backup and live database matched all seven complete tables: 3 cohorts, 60 agent rows, 1,393 turns, 2,209 compute entries, 16 communication observations, zero owner decisions and 44 audit entries. This includes the historical five-owner pilot, the inactive five-agent draft and the active fifty-owner cohort. The earlier P1 four-table hashes matched again before recovery.

After recovery and resumption, private verification compared every original account/entity binding and strategy, all original cohort model/budget/policy/anchor/interval settings, every original ledger/communication/owner-decision row and original turn records (allowing only the reviewed turn's state change). Historical agents remained exactly unchanged. New ordinary turns and audit events append to the existing history; counters increase rather than reset. Grant ciphertext may rotate normally during authenticated refresh without changing its account binding.

The same cohort `bf6eb294-316f-4225-a7b2-957f3f452a34` resumed at **2026-10-13 01:51:37 Berlin / 2026-10-12T23:51:37Z**:

- 50 original agents ready, zero new attention agents or pending game commands.
- Model `gpt-6-luna`, `codex-cli`, medium reasoning; shared concurrency one.
- Original staggered 15-minute schedule and anchor; two decisions/two actions per turn, 40,000 reservation and 90-second execution bound unchanged.
- Existing continuous mode, no end date or lifetime ceiling, with all lifetime usage retained.
- Pilot remains finished; learning draft remains draft/unconfigured.

The first 11 resumed turns completed with 17 executions and one additional committed game action: continuous totals advanced from **1,362 turns / 2,122 calls / 218 commits** to **1,373 / 2,139 / 219**. Actual events include protected requested-read delivery, schema lookup, read completion and a preflight deferral. New completed execution usage is reported. The worker had zero restarts, and the server retained about 21 GiB free. This is initial live acceptance, not a full-round completion or negotiation-success claim.

Protected operational evidence and the review/preservation helper are under `/var/lib/fleet/state/p1-release-20261013`. They contain private state and must not be copied into Git. Future operational snapshots can use the helper's aggregate `observe` mode. The public dashboard remains https://fleet.tinyagenttools.com/ with the existing operator password; refresh to load the new inspector.
