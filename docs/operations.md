# Current Fleet deployment — 12 October 2026

Latest, 13 October: Fleet `b4ad9db` is deployed and the same fifty agents are resumed after the explicitly approved five waiting-job cancellations and Agent 36 timeout review. Both historical unknown allocations remain, all original settings/history are preserved, and no autonomous cancellation permission was added. Read [the reliability follow-up](reliability-follow-up-20261013.md) for exact live acceptance and remaining planning limitations. The older release notes below preserve their checkpoints.

Update, 13 October: P1 Fleet `3407e5a` and PACT `fleet-p1-20261013-1` are deployed, with the original fifty-agent Luna group resumed after the founder-authorized review of its cancelled execution. The full reservation and historical unknown marker remain. See [backup/restore preservation, live acceptance and exact recovery](p1-deployment-20261013.md). The older deployment notes below retain their dates.

The current release root is `/opt/fleet/current`, Compose project `fleet`, and protected configuration/state/backups `/var/lib/fleet`. The five-agent pilot remains finished. The later 12 October founder assignment started **Luna 50 continuous 20261012** with 50 fresh accounts, Luna medium, a 15-minute schedule, no end time and observation enabled. Live execution is enabled for that new group. See [its exact configuration and actual launch evidence](continuous-fleet-20261012.md). Historical installation and pilot notes below preserve provenance; the disabled [migration report](repository-migration-20261012.md) describes the earlier completed migration, not the current live flag.

The later 12 October setup assignment created an inactive five-agent learning draft; model/allowance and accounts remain unselected. See [the operator guide and setup evidence](operator-guide.md). The completed migration baseline is preserved in `state/migration-proof.completed-20261012.json`: it is historical, since authorized new drafts legitimately add rows. Do not treat that original whole-database snapshot as a current operational baseline or reset records to make it match.

## Reproducible deployment

Configure a private `/var/lib/fleet/fleet.env` from `.env.example`, set `FLEET_GAME=pact`, `FLEET_GAME_BASE_URL`, independent database/operator/vault secrets, correct worker UID/GID and protected state path, and keep `FLEET_LIVE_ENABLED=0`. For the existing pilot migration, use `scripts/migrate-pact-deployment.sh` on the reviewed server checkout: it refuses an existing Fleet database/configuration, backs up the quiescent old fleet, copies its protected state/vault configuration and restores into a fresh isolated volume. It never creates accounts or starts a cohort. Do not use it to reset an existing deployment.

From a clean, verified, committed local checkout, run `./scripts/deploy.sh root@2.31.62.91`. It archives exactly HEAD, rebuilds the image on the server, runs only Fleet's idempotent migration, starts disabled services, checks health and any terminal state proof, then updates the current symlink. It refuses dirty/untracked source and an enabled configuration. For an active continuous group, coordinate a pause and inspect in-flight/pending work before disabling and deploying; never automatically clear unknown usage to satisfy deployment. Restore live configuration and explicitly resume only the same authorized group after recovery checks. No Git remote push is required for this archive deployment.

The console's host port remains private at server `127.0.0.1:8820`. For public HTTPS access, see the configuration below. The Codex executable/login remain in their existing dedicated protected paths; only the worker sees the login. Base Compose caps are 1 GiB total; the Codex override raises the worker to 512 MiB (1.25 GiB total). Resource caps are not capacity certification.

## HTTPS console

The 12 October founder assignment authorized `https://fleet.tinyagenttools.com` access with the existing operator password while execution was disabled; the subsequent continuous-fleet assignment enabled its new group. See [HTTPS deployment and acceptance evidence](https-console-20261012.md). Set `FLEET_ORIGIN=https://fleet.tinyagenttools.com` and `FLEET_EDGE_NETWORK=pact-production_application` in the protected configuration. Deployment automatically includes `compose.edge.yml` when that network setting is present. Only the console joins the existing public edge's Docker network with alias `fleet-console`; Fleet's database and worker stay on its private network. Do not publish port 8820 to the Internet.

Create an A record `fleet` pointing to `2.31.62.91` in Cloudflare (proxied, automatic TTL). Append `infra/fleet.caddy` to `/srv/pact/config/edge/Caddyfile`, validate it in `pact-production-public-edge-1`, and reload Caddy without restarting PACT. Caddy issues and renews the origin certificate. Preserve the existing HTTPS origin encryption settings; never bypass certificate validation to claim acceptance. The protected configuration's exact HTTPS origin enables Secure session cookies and the correct origin/CSRF checks. An SSH tunnel can still inspect health, but login through its HTTP URL is no longer accepted.

Verify public HTTPS, HTTP-to-HTTPS redirect, existing operator login, Secure/HttpOnly/SameSite cookies, unauthorized API rejection, wrong-origin rejection and logout; then verify PACT health and the terminal migration state proof. No inference or cohort activation is part of this change. For rollback, remove only the Fleet Caddy block and reload, restore the previous protected origin, and recreate only Fleet console/worker with the previously selected Compose files. Keep the database volume and operator/vault secrets.

## Rollback

Stop the new console and worker before restoring the old services; never run two controllers against the same game accounts. During the disabled, terminal migration, the original `pact-agent-fleet` database, state, images and release remain intact, and only its console/worker stop. Rollback restores that controller's services with its original database; keep all cohorts terminal and verify the stored proof. Once a future authorized run has made new writes, the frozen database is stale and must not be substituted: restore the latest Fleet backup plus its matching vault/state instead.

For later Fleet releases, `/var/lib/fleet/previous-release` identifies the prior release. Stop new worker/console, select the prior compose/image files and protected configuration, and recreate only Fleet services. Never delete volumes, reset usage, rerun provisioning or extend a deadline as part of rollback.

---

# Operating Fleet

The 12 October continuous-owner repair adds encrypted command-resolution archival and explicit paused operator review for the diagnosed invalid-level/tick/policy rejections. Receipt absence alone never authorizes replay or dismissal. See [recovery criteria, communication diagnosis and acceptance](recovery-communication-20261012.md). Ordinary known denials permit the next scheduled turn; transport uncertainty, unsupported errors and unknown provider usage retain recovery gates. Court authority is unchanged.

The independent server deployment and five-owner Luna medium pilot are authorized and recorded in [the pilot report](luna-pilot-20261011.md). Other installations must keep `FLEET_LIVE_ENABLED=0` until separately authorized. Do not import personal credentials, historical pending commands or stopped population state into this fleet.

## Activation checklist

1. Select the host and storage. The packaged controller/database cap is 1 GiB and 1 CPU combined. Inference is separate; do not assume this cap includes a model or guarantees N-player throughput. The previously inspected game server had limited disk headroom. Choose sufficient independent storage before deploying.
2. Select one exact model and endpoint, a finite experiment or recurring daily allowance, its original terminal deadline, call/token ceilings and concurrency. Check that model's actual API format using a separately approved bounded certification. An API-compatible route is not a ChatGPT subscription or Codex subscription route.
3. Generate private database/operator secrets and an independent vault key. Put `.env` outside public serving, mode 600; back it up securely. Keep the console loopback-only unless behind HTTPS with correct origin and trusted access. Configure an operator-accessible OAuth callback origin accepted by PACT.
4. Install/migrate this database only. Do not reuse a PACT database, credential vault, Windows task or namespace. Run the services disabled and check health/heartbeat, restart, backups and restore.
5. With explicit population consent, enable the selected route and provision fresh synthetic accounts or individually connect approved existing accounts. Set a reviewed mandate and optional synthetic-owner exception kinds/quota. Personal-account approvals remain the actual owner's responsibility. Revoking observation deletes the retained conversation contents.
6. Explicitly start the configured cohort and observe actual provider turns, game receipts, language quality, negotiations, latency, lease contention and cost. Start conservatively. Increasing N does not increase default inference concurrency. A worker handles one turn at a time; multiple workers share the database admission gate.

The standalone durable scheduler needs no desktop application or ChatGPT task scheduler. The Codex CLI subscription adapter is implemented; see [its setup, budget semantics and recovery](codex-provider.md). The authorized Luna pilot uses the verified native server ChatGPT login and actual medium-route certification; other models/routes still need their own acceptance. The API-compatible route does not use a consumer subscription.

## Authorized pilot deployment

Server `root@2.31.62.91`, current release `/opt/pact-agent-fleet/current`; compose files `compose.yml`, `compose.codex.yml`, and generated `compose.image.yml`. Project `pact-agent-fleet` has its own PostgreSQL container and volume. Root-only secrets are in `/var/lib/pact-agent-fleet/fleet.env`; worker-private pilot identity, certification counter and deadline are in `/var/lib/pact-agent-fleet/state`. The independent pre-launch database backup and tested restoration are under `/var/lib/pact-agent-fleet/backups`. Back up the vault key separately and keep both private.

The console listens only at server `127.0.0.1:8820`. Access through a trusted SSH forward to local `127.0.0.1:8820` and its private operator secret; do not expose it publicly or paste the secret into logs. The console receives no Codex auth mount. The worker uses UID 995/GID 983, root-owned native CLI mounted read-only, and the dedicated login mounted privately. Those IDs are specific to this server and must be checked before using the override elsewhere.

Safe status inspection: from the current release, run `docker compose -f compose.yml -f compose.codex.yml -f compose.image.yml run --rm --no-deps -T --interactive=false -v /opt/pact-agent-fleet/current/status.mjs:/app/status.mjs:ro worker node /app/status.mjs`. This prints aggregates without credentials or private correspondence. The operator scripts on the server are deployment aids, not permission to reset the experiment. Never rerun provisioning/start scripts against a terminal cohort. The heartbeat observer checks this same fixed run and disables itself after the committed final report; server enforcement owns the deadline even when the desktop is closed.

## Pause, stop and recovery

Pause the cohort to fence outstanding decisions; pause an individual agent to keep it paused even when the cohort resumes. A provider request is aborted when shutdown/pause is detected, but any usage already incurred remains reserved. A command already accepted by PACT can still finish after a pause; inspect its original receipt.

Worker crashes do not refund call reservations or generate new owner identities. Expired claims become recovery records. Exact pending commands prevent further turns for that agent. `Check receipt` makes no inference request and never resubmits a write. Missing or pending receipts retain the command. A definite matching receipt updates the outcome once. Investigate any still-uncertain result rather than clearing it or inventing a replacement ID.

For non-command failures, correct the cause, mark the recorded turn reviewed and explicitly resume the agent. Review preserves counters and the original result. It cannot discard pending commands. Permanent stop and finished deadlines are terminal; create a separately authorized new cohort for a new experiment. Consumed model/budget configuration and consumed synthetic-owner policy are immutable.

OAuth refreshes rotate under an account lock. Uncertain exchange/refresh stops use of that grant. Reconnect the same account; foreign account or kingdom rebinding is rejected. Synthetic enrollment stores the entry key before the first network call and recovers the existing identity. The bulk provisioning CLI does not start agents.

## Privacy, storage and inspection

Agent read checkpoints retain up to four rule/schema discoveries and four current observations, deduplicated within a 24KB encrypted account-bound checkpoint. Decision context uses at most 12KB of observations (8KB fallback), with explicit partial coverage and whole retained action blueprints. They are private model memory, excluded from console state responses. Each new turn starts with fresh game/authority observations; historical reads are dated, explicitly potentially stale, and never confer authority. A checkpoint and each dated observation older than 24 hours are excluded from decisions; hourly retention pruning deletes checkpoints older than 30 days. Pending commands and reported usage remain separate and unchanged. Missing history is not invented or recovered by buying extra calls.

The console has a single operator credential, eight-hour database sessions, HttpOnly cookies, CSRF/origin checks and bounded login failures. Put it behind an access-controlled private deployment; this is not a multi-operator role system. Do not log request bodies, OAuth tokens, owner cookies or correspondence. Application errors expose bounded codes.

Credentials and observed message/agreement contents use AES-256-GCM with account-bound associated data. The vault key is outside the database. Participant/metadata identifiers and exact pending actions remain private database data. Protect the **entire** database and backup, not just encrypted columns. The console can retain participating exchanges only with explicit observation consent, and only reads permitted by PACT's account grant.

Observation retention is 30 days, pruned by the worker. Ledgers, identities, pending commands and audit records are retained for recovery. Monitor PostgreSQL storage separately; the worker's filesystem free-space gate does not prove a remote database has sufficient storage. Back up this database and its vault key privately, stop workers before recovery, restore them together, and verify original identities/counters/pending IDs before re-enabling admission. Never reset usage as a restore workaround.

Dashboard pairs are the latest 200 observed relationships; turn history is the latest 100 turns. Full retained thread pages are paginated with stable cursors. Agreement observations count revisions, not unique contracts. Reported usage differs from reserved allowance; missing provider usage is explicitly unknown. These are not billing guarantees. Conversation game times, observation times and real negotiation duration are distinct.

The host admission default is one turn, with a 60-second minimum owner cooling gap. Individual calls have a 90-second bound and turns a two-minute original deadline. Providers, game HTTP calls and lease release are independently bounded. A read-heavy turn can exhaust its deadline before inference, which must be measured in the selected-route pilot. No retries silently buy another model call.

Synthetic contact acceptance is an explicit setup choice: include socialDelegation with mode manual, allowlist or agent_decides and allowedKingdomIds in provisioning, or POST the same object to /api/agents/:id/social-delegation while draft/paused before the deadline. This authenticated operator route rejects personal attachments. Unknown setup retains its exact encrypted command and blocks resume; reconcile current policy before further configuration. It grants no Court or contract authority and performs no automatic request acceptance. See [the repair evidence](controller-communication-repair-20261012.md).
