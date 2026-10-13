# Optional learned decision model

Historical implementation: the founder subsequently selected [LLM-centered cognition](cognition.md). VW is unused, no longer offered in new configuration and not connected in the runtime. Existing journal/source and the original acceptance below are retained; no accounts or comparisons were started. The following setup is a historical record, not the current recommended mode.

Fleet can combine an LLM, including local Nemotron, with a **Vowpal Wabbit contextual bandit**. Select **LLM + Vowpal Wabbit · experimental** in a fresh fleet's model configuration. The saved model field is `decisionPolicy: "vw-focus-v1"`; omitting it keeps LLM-only behavior. Saving a selection starts no accounts, schedules or inference. Consumed model configurations remain immutable. The policy requires cohort concurrency one.

## What it decides

Once per turn, after authenticated game observations, the policy samples one strategic focus: development, trade, relationships, resilience or observation. Nemotron receives that focus with the owner's values and fresh game context, then chooses the exact read, action or wait. The focus is advisory. It cannot supply command fields, change authority, approve exceptions or bypass game preflight, schemas, leases, stock, quotas or receipts. It uses no additional LLM calls and fits inside the same input/turn budget.

This is a real learned policy using VW's contextual-bandit learner, not a pretrained PACT player. It starts with uniform exploration. With useful feedback it estimates focus preferences conditioned on numeric game features and owner profile/risk. No evidence of stronger real gameplay is claimed by synthetic acceptance.

The first adapter observes completed building levels, established contact count and active contract count. Context includes bounded stock utilization, busy builders, hunger, threats, requests and offers. Feature extraction uses authenticated projections only; peer prose, names, account IDs, credentials and private correspondence never reach VW. Missing required measurements stop that turn before inference rather than creating zero measurements. Another game must implement `GameAdapter.decisionObservation`; the controller has no imported game rules.

## Learning and limitations

The next scheduled observation of the same agent provides this fixed progress proxy:

`reward = 0.5 × clip(building-level change / 2) + 0.25 × clip(contact-count change) + 0.25 × clip(active-contract-count change)`

Each `clip` bounds its input to −1…1. The total reward is −1…1. Passive stock production and action/message counts earn no reward. The proxy is deliberately explicit; it does not measure trade value, defensive success, reply quality, delivered contracts, victory or human enjoyment. Other players, game-clock progress and earlier queued construction also affect it. Contract expiry can produce negative feedback even when the contract was beneficial. The selected focus can be overridden by the LLM. Learning estimates the utility of this **advice channel**, not a causal value for an exact command. Long-term planning and sparse/delayed outcomes need a later evaluated policy version.

Feedback is admitted once only when the preceding turn finished, used inference with known usage, has no pending command, ended in WAIT/READ/COMMITTED/ALREADY_COMMITTED/TURN_ACTION_LIMIT, and its observation is 1–45 minutes old. Rejected, uncertain, cancelled, unused, superseded or older samples are marked censored with a reason; no fabricated reward is learned. A long interval can therefore censor this version's feedback. The last turn stays awaiting when there is no later observation. Choosing this policy authorizes retaining its encrypted operational learning state even when detailed observation is off; console details remain controlled by the existing observation consent.

One cohort shares its learned history; profiles remain features and no samples cross cohorts. The fixed policy replays the latest 2,000 learned samples from the last 30 days in original selection order. The worker purges journal rows after 30 days. There is no durable Python checkpoint: the encrypted Fleet database/vault is the source of truth, so a Python restart cannot lose a successfully recorded update or double-train a retry. Window rollover intentionally forgets older examples. A persisted choice is reused rather than resampled during controller retry.

VW configuration is pinned: version **9.11.9**, `--cb_explore_adf --cb_type mtr --epsilon 0.2 --random_seed 17 -b 18 --learning_rate 0.5 -q sa`. Context and focus namespaces interact. Until a nonzero feedback signal exists, the prediction remains uniform to avoid startup tie-order bias. Fleet samples the returned distribution with cryptographic randomness and saves the exact chosen probability for bandit labels. Rewards become negative costs. The Python service retrains transiently on the supplied window, then returns the probability distribution; it does not sample or commit game actions.

## Local setup

Requires the existing Node 24 Fleet setup and Python 3.10+ with a supported VW wheel. Python 3.14 on this Apple Silicon Mac was verified. Install in a separate virtual environment; nothing is installed into system Python:

```sh
python3 -m venv "$HOME/Library/Application Support/Fleet/decision-vw"
"$HOME/Library/Application Support/Fleet/decision-vw/bin/pip" install --only-binary=:all: -r decision-service/requirements.txt
"$HOME/Library/Application Support/Fleet/decision-vw/bin/python" decision-service/server.py
```

The foreground service binds only `127.0.0.1:8831`. It runs on CPU, needs no GPU, API key or game credentials, keeps no files and logs no requests. Keep this process running when using the hybrid option. Install an ordinary process supervisor only as part of a chosen deployment; this feature assignment does not install an always-running service or change existing workers.

For that Fleet installation, add the following to its protected environment, apply normal additive database migrations, and use the built source release:

```text
FLEET_DECISION_URL=http://127.0.0.1:8831
```

Only a loopback HTTP endpoint is accepted. A container's loopback is its own network namespace: a native Mac service is intended for the native Mac Fleet worker. Container deployments must colocate the service and worker in a reviewed shared network namespace, or add a separately reviewed authenticated transport. The sample is not a public service.

`GET /health` reports the loaded VW version. `POST /predict` accepts bounded numeric features, an allowlisted focus set and up to 2,000 labeled examples. It rejects malformed feature names, unsupported policies, duplicate focuses, invalid propensities/rewards, browser Origin headers and oversized bodies. Fleet checks version, learned-sample count and finite positive probability normalization. Each decision request is bounded to five seconds and remaining turn time. Missing/unavailable/invalid service results produce a visible non-committing turn error and consume no LLM allowance; the original scheduler may retry next slot. There is no silent LLM-only fallback.

## Verification and inspection

From the repository, while the local service is running:

```sh
"$HOME/Library/Application Support/Fleet/decision-vw/bin/python" -m unittest discover -s decision-service -p 'test_*.py' -v
npx tsx scripts/verify-decision.ts
```

These use fabricated data only: no Fleet database, LLM calls, account enrollment or game API calls. The HTTP check verifies uniform cold start, contextual learning and deterministic history replay.

Detailed turn steps show the focus, its full distribution, chosen probability, training-example count, observed metrics and later feedback/censoring, when observation is enabled. Authenticated `GET /api/cohorts/:id/decision-policy` reports the selected policy, awaiting/learned/censored counts, training window and reward definition without exposing raw training data. Fleet settings and Overview label the selected mode.

Back up the normal Fleet database and matching vault key to retain encrypted learning history. Restart the decision service without modifying Fleet state. New accounts and a comparison run are separate future work; existing Nemotron/Luna accounts are unchanged. Disabling the policy on a consumed cohort requires a separately reviewed configuration migration; never reset a cohort's history or counters to change mode.

## Sources

- [Official VW contextual-bandit tutorial](https://vowpalwabbit.org/docs/vowpal_wabbit/python/latest/tutorials/python_Contextual_bandits_and_Vowpal_Wabbit.html): action-dependent examples, chosen-action cost and selection propensity.
- [Official VW repository](https://github.com/VowpalWabbit/vowpal_wabbit) and [BSD 3-Clause license](https://github.com/VowpalWabbit/vowpal_wabbit/blob/master/LICENSE).
- [Pinned PyPI release](https://pypi.org/project/vowpalwabbit/9.11.9/): local CPU wheel distribution.
