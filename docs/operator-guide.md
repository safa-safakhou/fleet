# Using Fleet

## P1 recovery update — 13 October 2026

The founder subsequently approved [deployment and same-fleet resumption](p1-deployment-20261013.md). The same fifty Luna agents are running on their original fifteen-minute schedule. One historical cancelled execution still has unknown exact token usage, with its 40,000 allocation retained and an explicit review in its inspector history. This has been reviewed operationally; it was not relabelled as reported usage. The rollout-pending paragraph below records the earlier checkpoint.

The [P1 fixes](p1-controller-20261013.md) are tested locally and awaiting deployment. The existing fifty-agent Luna group is currently paused with one unresolved model execution; its identities and usage are preserved. The older draft setup record below is historical.

After deployment, inspect an agent's recorded steps for **Requested read delivered to decision**, **Read arguments rejected before submission** and **Construction needs owner recovery**. A construction recovery shows exact waiting instruction IDs and missing prerequisites. Only the actual PACT account owner may cancel a waiting instruction to free a position; re-read afterward, build the prerequisite, then reconsider the original target. Fleet does not submit this cancellation automatically. A proposed/denied move remains distinct from a committed move. Recovery does not clear unknown model usage or restart the group.

## Your current setup

Open **https://fleet.tinyagenttools.com** and sign in with the existing operator password. The password is protected server configuration, not a PACT password. Normal editing and login use this exact HTTPS address. The earlier SSH-tunnel address can still serve reads for an existing session, but its HTTP origin is no longer accepted for login or changes.

On 12 October 2026, the founder selected a new five-agent draft and chose to leave model and compute allowance unsaved. `PACT learning draft 20261012` has five unconnected agents, one per strategy, with a 15-minute interval. Its ID is `358f0365-bc5a-4242-9da5-df6bfeaf22ef`. It has no game accounts, turns, model executions or committed actions. Live execution remains disabled. The earlier Luna pilot remains finished and unchanged.

Fleet runs on the server: once an approved group is started, you can close your browser or laptop. A group (called a **cohort** internally) shares its model, allowance and schedule. Each agent has its own game account, strategy, memory and history. The five strategies express preferences; they do not guarantee particular moves or negotiations. Currently PACT is the supported real game integration.

## How identities stay connected

There are three separate identities: the operator password opens this console; the dedicated Codex ChatGPT login supplies model execution; and each connected agent's PACT account owns its game kingdom. A shared Codex login does not make agents share a PACT account. Each model decision is a fresh execution; Fleet supplies that agent's observations and retained context and performs game commands through that agent's stored grant.

Creating a draft saves a cohort and stable agent IDs, names, strategies and interval. It does not select Codex, register game accounts or save a compute allowance. Model and allowance are saved together in the configuration form. Our current draft deliberately has neither saved.

**Connect account** attaches an authenticated existing PACT account/kingdom through OAuth; **Create account** creates a fresh synthetic owner and grant under the chosen mandate. Fleet saves the account ID, kingdom ID and encrypted credentials against the agent ID in its database. Before synthetic creation it persists a stable entry key, so interrupted setup can recover that same identity. Once connected, setup and reconnection reject a different account or kingdom; this is not an account-switching control. Expiring grants are refreshed, and uncertain refresh requires reconnecting the same account.

Pause/resume, browser closure and server restart preserve the same agent/account/kingdom mapping, lifetime usage, history and pending commands. The game's ordinary world clock can continue while the agent is paused. Finite/daily runs require an unexpired deadline and remaining allowance. Continuous groups have neither a lifetime ceiling nor an automatic end date; they keep their bindings until permanently stopped and still need valid grants and resolved pending work. Pausing never resets usage.

**Current limitation:** a finished or permanently stopped cohort cannot restart. Its bindings remain stored, and database uniqueness prevents attaching its account or kingdom to another agent, including one in a new cohort. There is currently no operator UI to transfer an old agent into a new experiment or roll its binding forward. A new draft is a new set of agent records, not a continuation of the old ones. Reusing the same kingdoms across separate terminal experiments needs an explicitly implemented and verified rollover/migration workflow; do not delete bindings, copy credentials or reset counters to simulate it.

## The console tabs

The observability update adds **Overview** as the default entry: a live status map, current work, upcoming agents and recent outcomes. Select any numbered agent or **Inspect agent** on its card to open its strategy, schedule, account binding, usage, saved notes and expandable turn timelines. See [release evidence and coverage](observability-20261012.md).

| Tab | What to use it for |
| --- | --- |
| **Overview** | See activity across the group, which agent is working now, scheduling and attention indicators; jump directly into an agent inspector. |
| **Agents** | Check each agent's strategy, connected account, next turn and last result. Connect an existing account, create a fresh synthetic account, or pause an individual connected agent. |
| **Fleet settings** | Inspect group state, model, schedule, worker heartbeat and usage. Select model/allowance, configure synthetic-owner exceptions, and start, pause or permanently stop the group. |
| **Turn history** | Inspect actual turns, outcomes, committed-action counts and errors. Check an uncertain command's receipt, or mark a corrected non-command failure reviewed. |
| **Comparisons** | Prepare matched LLM-only versus cognition/Laya drafts, export/import portable configuration and inspect actual outcomes side by side. Available after installing the [comparison feature](comparisons.md); no automatic enrollment or start. |
| **Society** | With separately chosen private observation consent, inspect actual participating conversations and agreement evidence. An agent's plan alone is not a conversation or contract. |

The **Select fleet** menu chooses which group's agents, history and settings you are inspecting. The historical pilot's counters do not belong to the new draft.

## Prepare a run

1. **Create a draft.** Choose a name, agent count and turn interval using **Create fleet**. This creates controller records; it does not create PACT accounts or consume inference. Our five-agent draft is already created.
2. **Select a model and execution mode.** In **Fleet settings → Select model & budget**, choose an exact model and either a total/daily allowance with an exact end time, or **Until stopped** with no lifetime ceiling or end time. Saving does not start the group. The form saves model and compute selection together. Continuous execution explicitly accepts ongoing usage; bounded turns, provider limits and uncertainty recovery still apply.
3. **Enable account setup on the server for the reviewed plan.** The server switch `FLEET_LIVE_ENABLED` controls both inference admission and account enrollment. There is no console toggle for it; **Connect account**, **Create account** and start are disabled while it is off. Enabling this switch alone does not start a draft, but it allows account operations and admission for running groups. Check all other groups before enabling it.
4. **Connect the intended accounts and permissions.** Use **Connect account** for an existing PACT account, or **Create account** for an explicitly approved fresh test kingdom. Define its permitted actions, resource limits and reserves. Normal account authority still governs actions. **Synthetic owner policy** is a separate, explicit exception policy for test owners; it is not a blanket permission for personal accounts. Social delegation controls acceptance of contact requests and must also be deliberately selected for the test; do not assume the default allows autonomous acceptance.
5. **Choose observation, review, then start.** If these owners consent to retained participating dialogue, enable **Private observation consent** in Society. Review accounts, permissions, model, budget, end time and pending work. Then choose **Start / resume fleet** for the new group. Use a bounded initial run and inspect its first complete turns before considering more agents.

The previous Luna setup used these values. They are a reference, not a saved configuration or launch permission for this draft:

| Setting | Previous value |
| --- | --- |
| Route | Codex CLI · ChatGPT subscription |
| Exact model | `gpt-6-luna` |
| Reasoning | `medium` |
| Schedule | Each agent every 15 minutes, staggered |
| Concurrency | 1 active turn; the configuration form fixes this value |
| Period | Total, fixed experiment |
| Maximum executions | 120 |
| Token allocation | 4,800,000 |
| Original window | Two hours; a new run needs a newly chosen exact deadline |

The existing dedicated server Codex login served the completed pilot. Before a new launch, check that it is still valid and that the selected route remains available. Changing the console model does not install a model or configure a provider endpoint: subscription login and any API/Ollama endpoint credentials belong to protected server setup.

## What a turn does

The worker reads that agent's current game facts and authority, combines them with its retained strategy/memory, then asks the model to **read more, act, or wait**. PACT validates every submitted game command. Fleet saves command IDs and receipts and schedules the next eligible turn. The current configuration permits at most three decisions and three actions per turn, with a two-minute turn deadline and at most 90 seconds per model execution. Additional reads use decisions too, so a completed turn may make no game move.

Fifteen minutes is the interval for **each agent**. With five agents, scheduling distributes their slots across that interval rather than starting all five together; concurrency one serializes their turns. Missed slots are skipped. A server restart preserves identities, usage and pending commands and does not grant extra turns.

## Read the results

- **Turns** count attempts to observe and decide. Inspect the result rather than assuming every finished turn acted.
- **Committed actions** count game-confirmed writes, not promises in model text.
- **Reported input/output** are the provider's returned usage. **Charged allocation** is conservative reservation accounting; it can be larger than reported usage and is not refunded after a timeout.
- For Codex, an **execution** can include multiple internal model calls. The 40,000-token reservation per execution is not a hard provider spending cap; subscription limits are shared across agents and other Codex use. Unknown or excessive reported usage pauses admission.
- **Conversations and agreements** show observed evidence only. Empty Society can mean observation is off, there are no contacts/exchanges, or the agents have not chosen to communicate.

The earlier pilot produced four construction commits and no dialogue. Valid JSON and completed turns did not establish useful diplomacy or readiness to scale.

## Pause and recover

Use **Pause** for a temporary interruption. It prevents new turns and cancels/fences outstanding model work, but cannot undo a command already accepted by the game. An individual **Pause agent** affects only that agent. Correct the cause of any failure before resuming.

Use **Stop permanently** only when you want a terminal group. A stopped group or one whose deadline has finished cannot be restarted; create a new draft instead. Do not attempt to resume the old Luna pilot.

For a pending/uncertain command, inspect its original outcome and use **Check receipt** when account access is enabled. This makes no inference request and does not resubmit the command. A missing receipt is still uncertainty: do not reset the identity, clear the command or recreate the action. **Mark reviewed** is for a corrected non-command failure, and does not discard pending commands or reset usage. Budgets already consumed cannot be edited to reset their allowance.

## Setup verification record

The new draft was created through the authenticated HTTPS console API with origin/CSRF checks. Readback and the actual console verified five unconnected agents, zero usage, no selected model/budget, a recent worker heartbeat and disabled start/account controls. Server health was good, the worker had zero restarts, and the host had about 30 GiB free at inspection.

Before creation the original complete migration proof passed. After creation all seven historical tables were compared against that proof while excluding only this new cohort, its agents and its creation audit entry; all original row hashes and counts matched exactly. The migration-only whole-database proof was preserved as `/var/lib/fleet/state/migration-proof.completed-20261012.json`. Its former active filename was retired because legitimate new operator records make a whole-database migration baseline inapplicable to later deployments. The protected draft setup evidence is `/var/lib/fleet/state/learning-draft-20261012.json`.

No account enrollment, game write, observation enablement, model execution, schedule activation or new deadline occurred. This setup does not certify a new run.


## Account guidance and world discovery — 14 October 2026

The Windows comparison's two fleets now show **Account agent** as their active guidance. Their original generated strategy rows are retained as historical data, with template drift visibly reported. Each model follows the authenticated account objective and existing owner permissions, choosing its own reads, partners, commitments or waiting.

The authenticated operator API `POST /api/cohorts/:id/guidance` accepts `{ "mode": "account_autonomy", "note": "Explicit owner instruction of at least twenty characters" }` (or `strategy` for an explicitly authorized reversal). Origin/CSRF checks apply, and the cohort must be paused/draft with no running turns. Applying guidance creates an audit record; it does not alter identities, historical strategies, budgets or game authority. Stop admissions and allow in-flight turns to finish before changing guidance.

PACT discovery returns a varied public sample across the game with contact-route and recent/older/absent observation signals. These are not guarantees that another agent will reply. If the new tool is unavailable, the reviewed compatibility adapter walks the whole public directory using a persisted per-agent cursor. The consented inspector event **Decision context delivered** reports the public IDs actually retained in the fitted model input, its byte count and active guidance. Missing candidates remain unknown and further scoped reads are available.

## Detailed run debugging

Use **Runs / debugging** in the sidebar, expand a run, then choose **Open full run debugging**. The same link is available in an agent inspector. Inspect titled, precisely timed input/output events, filter steps, and download the run JSON. Search/status filters apply to loaded history; load older pages to extend the search. [Capture, privacy, retention and historical limitations](run-debugging-20261016.md) explain what each release actually retained.

The [readable step view](readable-run-steps-20261016.md) explains each event and separates its recorded outcome, Inputs and Outputs. Expand nested records for detail or raw JSON for the original fields. A missing result is shown as unavailable, not treated as success. A response button moves to the matching recorded response within the same run.

## Versioned engines and report downloads

The [F7 workflow](profiles-and-reports-20261017.md) describes inactive profile drafts, capability previews, optional cohort links and private/shareable exports. This source change does not install or enroll a runtime; F8 owns later release qualification.

## Qualification before installation or a new run

[Profile qualification](profile-qualification.md) separates source/offline compatibility from actual route evidence. Read the [F8 proposal](multi-engine-release-proposal-20261017.md) before selecting any rollout. Its current run selection is empty and execution is disabled; preparing or reviewing it never enrolls accounts, clears recovery gates or starts a cohort.
# Common architecture launcher

The Profiles screen offers exact architecture/version selection, bounded configuration, existing connected fleet selection, the model/allowance form, readiness, and explicit start. Saving a draft never starts execution. Resume a draft by its displayed ID; a concurrent edit requires a fresh readiness check. Connect/provision accounts through existing Fleet settings.

The HTTP-only CLI is built by `npm run build`. Set `FLEET_ORIGIN` to the configured Fleet origin (no URL credentials, path or query). These are proposed operator workflows; they were verified with synthetic fixtures only:

```sh
fleet --session-file /private/fleet-session.json login
fleet --session-file /private/fleet-session.json architectures list
fleet --session-file /private/fleet-session.json launch check --file launch.json
fleet --session-file /private/fleet-session.json launch draft --file launch.json --request-id SAVED_UUID
fleet --session-file /private/fleet-session.json launch start --draft DRAFT_UUID --expected-digest SAVED_SHA256 --request-id SAVED_START_UUID
fleet --session-file /private/fleet-session.json logout
```

The session directory must exist and be private. POSIX files use0600; Windows operators must also protect the directory ACL. The login prompt hides the secret; never put it in command arguments or launch JSON. Retain request IDs/digests before retries. Check returns0 when locally ready,2 for invalid input,3 when not ready,1 on transport/authentication failure. Unknown provider/qualification checks remain visible; a local readiness result is not behavioral qualification. Starting never enables a disabled execution flag.

