# Codex server installation and login preparation — 11 October 2026

Founder authorization: install Codex on `2.31.62.91`, prepare subscription login and give the human a device-login link/code; do not start agents. This is installation/authentication scope only, not fleet deployment or inference certification.

## Verified installation

- Server `ubuntu-8gb-nbg1-2`, native Linux x86_64. Node/npm were absent; used OpenAI's reviewed standalone installer from `https://chatgpt.com/codex/install.sh`.
- Pinned **Codex CLI 0.162.1**, resolved against official release metadata. Installer verifies the downloaded package checksum and installed version. Non-interactive installation explicitly declines launching Codex.
- Executable `/opt/pact-codex/bin/codex`, visible through `/usr/local/bin/codex`. Packages stored under root-owned `/opt/pact-codex/runtime/packages/standalone/`; no user-owned binary updates or scheduled updater were added.
- Executable SHA-256: `628e35487d888a28f0427fc37501da529dd3d81fcbad7a2c3421c1e8670d92e1`.
- New system account `pact-codex`, shell `/usr/sbin/nologin`, home `/var/lib/pact-codex`. Home permission 0700, configuration 0600, owned by this account. No PACT grants, owner keys or fleet database credentials were added.
- Login config requires ChatGPT authentication, file-backed protected cache, OpenAI provider, read-only sandbox, no interactive approval prompts and disabled web search. No model or compute budget selected.

## Actual checks

- Under the service account, `codex --version` reports `codex-cli 0.162.1`.
- Native CLI parser accepts `exec --ignore-user-config --ignore-rules --ephemeral --json --sandbox read-only --help`.
- `codex login status` under the prepared home reports **Not logged in** before device-flow initiation. No cached token or credential body was read.
- No Codex process remained after installation/checks. No fleet worker/service/scheduler was installed, enabled or started; no inference executed. Existing game services and historical populations were not changed.

## Device login handoff

Run as root over the existing authorized SSH route:

```sh
runuser -u pact-codex -- env CODEX_HOME=/var/lib/pact-codex /opt/pact-codex/bin/codex login --device-auth
```

The human opens the CLI-provided OpenAI link and enters its short-lived code. Codes, refresh/access tokens and private login output must not be committed. After human completion check only:

```sh
runuser -u pact-codex -- env CODEX_HOME=/var/lib/pact-codex /opt/pact-codex/bin/codex login status
stat -c '%a %U %n' /var/lib/pact-codex/auth.json
```

## Completed human login verification

After the founder reported completing device login, the original login process exited successfully with `Successfully logged in`. A separate SSH check as `pact-codex`, using `CODEX_HOME=/var/lib/pact-codex`, returned **Logged in using ChatGPT**. The home remains 0700 and `auth.json` is 0600, both owned by `pact-codex`; no credential contents or account identifiers were inspected or copied.

No Codex process remains, and the server's service inventory contains no `pact-codex` or `pact-agent-fleet` service. No agents, workers, scheduler, account enrollment or inference were started during verification. This establishes successful server ChatGPT authentication, not selected-model availability, inference quality, throughput or subscription allowance certification. Model/budget selection and a bounded real-provider test remain pending.

Later, an approved native fleet worker must run under this same service user (or a separately reviewed credential ownership setup), with `FLEET_CODEX_EXECUTABLE=/opt/pact-codex/bin/codex`, `FLEET_CODEX_HOME=/var/lib/pact-codex`, and `FLEET_LIVE_ENABLED=0` until a launch is authorized. That worker is not deployed by this assignment. A model/budget decision and bounded actual-model verification still precede any agent launch.

Sources: [official CLI installation](https://learn.chatgpt.com/docs/codex/cli), [authentication/device flow](https://learn.chatgpt.com/docs/auth).
