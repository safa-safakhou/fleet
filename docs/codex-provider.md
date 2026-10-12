# Codex CLI subscription provider

Implemented on 11 October 2026 under the founder's explicit instruction to add and test the provider, commit it, and keep agents stopped until model/budget selection. Route: `codex-cli`. No subscription login, credential transfer, inference, game account enrollment or live launch was performed. Real selected-model certification remains pending.

## How it works

The existing fleet scheduler prepares one agent's strategy, private notes and authenticated game observations. A fresh ephemeral `codex exec` receives those facts on stdin and writes a schema-constrained envelope containing a JSON decision. The adapter validates the inner decision using the same fleet contract as the HTTP providers. PACT reads and writes still go through the existing authenticated game controller, command IDs, reservations, claim fences and receipts. The CLI does not receive PACT grants or owner/operator credentials. Additional game reads return to the model in the next bounded execution; there is no shared Codex conversation between agents.

The route accepts only an explicit model name. It rechecks `codex login status`, rejects API-key login, and pins `forced_login_method="chatgpt"` and the OpenAI provider for inference. The child environment is an allowlist, excluding API keys, database URLs and fleet secrets. A private per-execution directory is removed after completion. User config/rules, shell/unified execution, apps, multi-agent tools, JS REPL, memories and web search are disabled for this decision-only invocation. Read-only sandboxing remains enabled. Game mechanisms and human authority stay unchanged.

One shared ChatGPT login serves separate game agents; it does not multiply subscription allowance. Availability of a particular model, effective rate limits, throughput and provider-side safety behavior require actual certification of the chosen account/model. Authentication cache refresh is performed by Codex itself, not this application.

## Host setup, without launching

This adapter supports a **native Linux executable** on a trusted private runner. It does not launch the Windows desktop CLI through WSL. The Windows installation inspected locally is `codex-cli 0.162.0-alpha.17.2`; its help/parser supports the required flags. Following the separate installation authorization, native **0.162.1** is installed on the server; see [actual setup evidence](codex-server-setup-20261011.md). Inference is not certified. Pin a reviewed native CLI version with `--ignore-user-config`, `--ignore-rules`, `--ephemeral`, `--json`, `--output-schema` and `--output-last-message` support. A CLI which lacks those flags fails closed rather than falling back.

Use a dedicated service-user-owned `0700` authentication directory **outside either repository**, not the owner's desktop Codex home. As that service user, sign in interactively using the official CLI:

```sh
mkdir -m 700 /private/service-user/pact-codex
CODEX_HOME=/private/service-user/pact-codex /opt/pact-codex/bin/codex -c 'cli_auth_credentials_store="file"' login --device-auth
CODEX_HOME=/private/service-user/pact-codex /opt/pact-codex/bin/codex -c 'cli_auth_credentials_store="file"' login status
```

Replace the example paths with reviewed absolute locations owned by that user. The human completes the browser/device code login. Device login may need enabling in ChatGPT settings. Do not paste auth caches, one-time codes or logs into tickets/Git. Keep `auth.json` protected (0600) and the directory writable so normal token refresh persists. Do not reuse this directory for interactive coding, plugins or other runners.

Set protected service configuration:

```dotenv
FLEET_CODEX_EXECUTABLE=/opt/pact-codex/bin/codex
FLEET_CODEX_HOME=/private/service-user/pact-codex
FLEET_LIVE_ENABLED=0
```

No CLI is invoked by configuration, application startup, migration, draft creation or a disabled worker. Selecting and saving `Codex CLI · ChatGPT subscription` in the console does not start agents. Leave model/budget unselected for the current assignment.

The stock Docker image does not include Codex or an auth mount. For a later approved deployment either run the Node worker under a native Linux service user, or extend a **private worker image only** with the pinned native CLI and a writable protected home mount. Never bake the cache into an image or mount it into the console. Use service/container process containment: for systemd use `KillMode=control-group`, `TimeoutStopSec=10s`, `SendSIGKILL=yes`, a private temp directory and no new privileges. Container stop likewise must kill its remaining processes. This matters if the worker itself is forcibly killed; JavaScript timers cannot survive that event. No deployment was performed by this assignment.

## Budget semantics and recovery

`callLimit` counts **CLI executions**, each potentially containing several internal model calls. `perCallTokenLimit` is an admission reservation for the whole execution, not a provider-enforced token ceiling. `maxOutputTokens` is a desired answer length for this route, not a hard sampling cap. CLI instructions/reasoning can add usage beyond the fleet's compact game prompt. These distinctions are explicit in the console and require `executionAccountingAccepted: true`; Codex cohorts must use concurrency 1.

The adapter reads the single `turn.completed` event's aggregate input/output usage. Cached input is already part of input and is not added again. Invalid/absent usage stays unknown. Ledger charge is at least the original reservation, increased to reported total when larger, without refunds. A overrun or unknown usage pauses the whole cohort before a decision can commit; completion failure, auth failure, cancellation, malformed output/events and expired workers also halt Codex cohort admission. Errors store only fixed codes, never CLI stderr or raw output. Neither the token reservation nor this stop guarantees a hard spending cap for an in-flight execution. Subscription quotas are shared with other Codex use and are not converted into a currency estimate.

Each execution is bounded by the original turn deadline and a maximum 90 seconds, including its authentication check. Abort sends TERM then KILL to the process group; exiting processes' remaining descendants are killed. A home-directory lock serializes subscription use across adapter instances/processes. A crashed worker deliberately leaves that lock; do not automatically delete it or restart inference. Inspect the service process group, ensure no old inference survives, inspect unknown usage/pending commands, then remove the stale lock and explicitly review recovery. Preserve all counters and pending command IDs. Never change consumed settings to reset an allowance.

Before an approved population launch, select the exact available model and an execution allowance acknowledging these semantics; verify login, structured output, observed tokens, cancellation, timing and game effects with an explicitly bounded live certification. Code/fixture tests do not prove subscription eligibility or live model quality.

## Official references

- [Non-interactive mode and ChatGPT-managed automation](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Authentication, device login and persistent cache](https://learn.chatgpt.com/docs/auth)
- [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
