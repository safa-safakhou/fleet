# Local five-agent Nemotron fleet — 13 October 2026

Founder explicitly requested five new accounts using this Mac's existing Nemotron model, selected fifteen-minute execution until stopped, and clarified that the Fleet controller itself must run on this Mac. This authorizes the independent local setup, normal PACT account enrollment and the new continuous cohort. The server Luna cohort, historical pilot/draft and old experiments remain separate and unchanged. No model relay, server cohort or server controller configuration was created.

## Implementation and pre-launch verification

Installed model: **`nemotron-3-nano:4b`**, 4.0B Q4_K_M, digest `6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197`, through local Ollama **0.40.3** at `127.0.0.1:11434`. Its actual `/api/show` advertises boolean thinking choices with default true. Fleet now persists an optional Ollama-only `thinking` selection, sends the native `think` field and displays it in Overview/configuration. Existing unspecified selections retain their old default; other routes reject this option. This change is installed locally only.

For this cohort thinking is explicitly **off** to use the bounded decision-only flow. Native structured JSON output, a 32K context, maximum 2,000 generated tokens and immediate model unloading remain. This does not establish planning quality. [Ollama's official chat API](https://docs.ollama.com/api/chat) documents these fields; the selected local model's reported capabilities and actual request were checked rather than assuming every model supports them.

Linux verification: build/type/format/boundary checks passed, **54 unit tests + 108 integration tests = 162 passed**. The added configuration test ran separately against the same isolated test database after the original 107-case suite; it confirms five draft agents, exact thinking/continuous setting round trip, no account/inference side effects and refusal of thinking on Codex. Native build/check passed; native unit tests passed 37 and explicitly skipped 17 Linux process cases. Production dependency audit: zero findings. No production database was used by tests.

One separately recorded synthetic local compatibility call completed in **3.316 seconds**, returned a valid wait decision and reported **49 input + 26 output tokens**. It made zero game actions and predates cohort inference; it is not hidden in or presented as a scheduled agent turn. Protected evidence is `state/model-certification.json` under the local private installation.

## Local installation

Private root: `/Users/safa.safakhou/Library/Application Support/Fleet/nemotron-local` (0700), with independent `fleet.env` and `database.env` (0600), vault key, state, logs, backups and versioned runtime releases. No server credentials or database rows are copied.

- Database: local Docker container `fleet-mac-nemotron-db`, PostgreSQL 17.9, volume `fleet_mac_nemotron_database`, loopback `127.0.0.1:5439`, database/user `fleet_mac`; bounded to 512 MiB / 0.5 CPU, restart unless stopped.
- Controller and console: native Node 24 on the Mac, intended per-user launch agents with a pinned private runtime release. Console binds only `127.0.0.1:8820`.
- Inference: this Mac's Ollama loopback endpoint. No public Ollama listener or reverse SSH connection is required.
- Game: existing hosted PACT HTTPS API, authenticated independently for each new account. The game remains hosted; its Fleet scheduling and model execution are local.

Launch acceptance, actual cohort/account identities and first completed turns are appended only after they occur.

## Working with the local fleet

Open **http://127.0.0.1:8820/** on this Mac. Its new operator password is the `FLEET_OPERATOR_SECRET` value in the protected local `fleet.env`; it differs from the server console password and must not be pasted into Git/logs. Overview, Agents, Fleet settings, Turn history and Society refer to this independent database. Pause/resume in this local console retains these five identities and counters.

The cohort is intended to have one owner per existing strategy family, the installed Nemotron tag with thinking off, one concurrent turn, the original fifteen-minute stagger, two decisions/two actions per turn, a two-minute deadline and 90-second individual inference bound. Continuous mode has no lifetime ceiling/end date; all usage still accumulates. No synthetic-owner exception policy is selected. Normal PACT mandates, lease, stock, quotas, prerequisites and human-only boundaries remain authoritative.

This fleet needs the Mac awake, the local Docker database running, Ollama running and internet access to PACT. Per-user launch agents operate in this user's logged-in session. Sleeping/shutting down pauses local execution; missed slots are skipped when the machine returns, rather than caught up in a burst. An interrupted/uncertain turn may require explicit recovery; uptime and endless useful gameplay are not guaranteed. Do not silently clear pending commands or unknown usage, or replace an account on restart. Neither the server's dashboard nor the server worker owns this local cohort.
