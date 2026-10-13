# LLM-centered continuity in Fleet

Fleet's optional `cognition: "llm-centered-v1"` model setting adds episodic memory, persistent intentions, reflection and revisable beliefs about other players. The LLM remains responsible for interpreting the situation, forming plans, negotiating and choosing each read/action/wait. No building/contact reward or focus selector directs this mode. VW is not wired into the runtime, is no longer offered in configuration and new VW selections return `VW_UNUSED`; historical source/journal rows are preserved.

Choose **LLM with memory, reflection, plans and beliefs** when configuring an unconsumed fleet. Saving a setting enrolls no accounts and initiates no inference. Existing consumed configurations, identities, counters, unknown records, schedules and releases are not rewritten. This implementation has not been rolled out to the existing local/server fleets.

## Turn lifecycle

1. Read authenticated current game facts and the agent's available exchanges. The game adapter produces a small dated observation and observed peer IDs. Fleet captures actual delivered messages/agreements and actual command receipts in a separate encrypted episode journal, scoped to this one agent. Peer statements prove only what the peer said.
2. Retrieve account-owned experiences using relevance, peer relevance, recency and importance. Always include the current observation and latest available command receipt; return a bounded set of other episodes, the persistent plan, relevant beliefs and recent reflections. Missing/expired sources and partial bodies are explicitly labeled. `fleet_memory_recall` lets the LLM request a specific question about its own history through the normal decision allowance, without inference of other players' private history.
3. The LLM makes its normal decision and may return a concise `cognition` update in the same answer. It can keep/revise/complete/abandon a plan; form or revise a player's hypothesis, alternative, confidence, prediction and assessment; compare expected versus observed results in a reflection; and save a source-linked interpretation. There is no extra reflection/planning model call, no forced conversation and no scheduled inference initiated by incoming messages. Learning here means retaining experience and revising beliefs/plans in context, not updating Nemotron weights.
4. Fleet validates update size, expected version, actual delivered evidence references and observed peer IDs. Interpretations cannot be used as independent corroborating evidence. Sources are rechecked against this agent's retained journal at commit; foreign/expired/invented references are refused. State/update/interpretation writes are atomic, fenced and idempotent for the turn/decision. A conflicting replay is rejected. An optional cognitive-update error is visible and does not authorize or silently replace the game decision.
5. The original game permission/schema/preflight/lease/receipt pipeline executes any chosen commitment. Proposed commands and subjective plan completion are never recorded as committed gameplay. A saved plan is an intention, not a queue; every future action is freshly decided and validated. Unknown model usage and pending commands retain the existing admission/recovery rules.

The output schema remains the usual wait/read/action decision with an optional `cognition` object. Existing LLM-only models keep their original schema and behavior. Both HTTP and Codex adapters preserve the optional update; the controller owns validation and execution. For maximum output reliability, update only what needs changing. Owner values and current facts always outrank stored interpretations.

## Memory and privacy

`006_cognition.sql` owns `cognitive_episodes`, `cognitive_states` and `cognitive_updates`. Detail is encrypted with per-agent/per-episode or per-turn vault bindings. The controller does not merge memory across agents or reveal someone else's private contacts. Choosing cognition authorizes operational memory for that agent independently of observation consent. Operator inspection withholds cognitive detail when existing observation consent is off.

Episodes are bounded to 200 per agent and 3 KB per captured representation, with explicit coverage when larger observations are represented partially. Eviction preserves references supporting retained plans/beliefs/reflections, the newest 80 episodes, then important episodes within the total bound. Retrieval delivers at most five evidence items, three relevant beliefs and two recent reflections. Oversized optional recall can be omitted from a single input with a notice while preserving the plan, fresh game facts and requested-read priority; omitted references cannot be cited by a saved update. No stored plan or note is truncated by input fitting.

Episodes and updates are purged after 30 days. Each plan/belief/reflection expires after 30 days without its own revision; a fresh unrelated update does not rejuvenate an old belief. Inactive state rows are also purged after 30 days. The journal's durable sequence preserves observation order when timestamps tie. Source availability is reported rather than fabricating forgotten evidence. Back up the normal Fleet database and matching vault key; do not restore old state over new gameplay to change modes.

The agent inspector shows plan goal/steps/status/reconsideration condition, each player's hypothesis/alternative/prediction/subjective confidence, reflections and retained source episodes. Turn history records which continuity/recall route was actually delivered and which updates were accepted/rejected. These declarations are not certifications of truth, game progress or human-like intelligence.

## Optional, evaluated Laya assistance

`recallAssist: "laya-recall-v1"` requires cognition. Its only role is **selective ordering of two already retrieved memory candidates** for the current question/plan. It never supplies commands, chooses strategic priorities, approves authority, changes beliefs or removes memory candidates. Current observations/receipts retain priority. Both candidates remain available to the LLM. If the helper is absent, slow, invalid or uncertain, Fleet records the exact fallback and retains deterministic recall.

Selected model: **`convaiinnovations/laya-typed-decisions`**, fixed revision **`e929ae5cf69bc34259cd2f95c9e91145b818b1f0`**, with **Laya 0.4.6**, CPU and two Torch threads. The full Python dependency selection is pinned in `laya-service/requirements.lock`. No GPU use or cloud model account is needed. Confidence is not assumed calibrated; the 0.65 cutoff is an empirically evaluated abstention rule for this limited recall task.

Initial unrestricted evaluation failed at 21/24. A first conservative selective configuration was correct on its accepted answers but accepted only 5/32, failing its coverage gate. After treating those as development data, a 0.65 cutoff and minimum 25% coverage were fixed before evaluating a new frozen 16-case validation set in both option orders. Final result: **18 accepted / 18 correct / 14 abstained out of 32**, against **8/18 correct** from lexical ordering on those same accepted cases. Development data had zero accepted errors. This is limited synthetic evidence supporting the optional recall helper; the small sample does not prove calibrated confidence, broad generalization, improved LLM play or better social intelligence. The actual checkpoint reports a temperature-clamp warning for 11+ options; this task uses exactly two and still makes no calibration claim.

The loopback service refuses startup without a passing certificate matching the exact frozen validation suite, runtime/revision/instructions/threshold and every checkpoint file digest. `laya-service/acceptance.json` records the source acceptance; the protected local certificate retains the installation's actual artifact proof. `POST /recall` accepts two bounded candidates and a bounded query only. It rejects other shapes, duplicate IDs, oversized bodies and browser-origin requests. Each Fleet request is bounded to three seconds and remaining turn time. The service logs no request bodies, keeps no player data files and accesses no game/LLM/database API.

## Local installation and verification

The evaluated recall cases are English. The client and service refuse non-ASCII material and use deterministic fallback rather than claim multilingual validation. ASCII alone does not establish English or guarantee relevance. Core memory supports Unicode and bounds captured excerpts by UTF-8 bytes without splitting characters.

Use a separate Python 3.12 environment and an explicit protected model directory. The downloaded weights are Apache-2.0 and must remain outside Git. From this repository:

```sh
uv venv --python 3.12 "$HOME/Library/Application Support/Fleet/cognition-laya"
uv pip install --python "$HOME/Library/Application Support/Fleet/cognition-laya/bin/python" -r laya-service/requirements.lock
```

Download the exact checkpoint revision with `huggingface_hub.snapshot_download`, passing `token=False`, into a protected directory. The installation on this Mac uses `$HOME/Library/Application Support/Fleet/laya-typed-decisions`. Generate a certificate against those local files; this uses fabricated fixtures only, with no game account or LLM inference:

```sh
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 "$HOME/Library/Application Support/Fleet/cognition-laya/bin/python" laya-service/verify_recall.py "$HOME/Library/Application Support/Fleet/laya-typed-decisions" "$HOME/Library/Application Support/Fleet/laya-recall-certificate.json"
```

A failed gate leaves Laya unused. Keep the failure evidence; do not mark a failed certificate passed or rewrite cases to conceal errors. The unrestricted diagnostic can be reproduced with `laya-service/evaluate.py` and a separate output path; do not overwrite a passing certificate with a diagnostic result.

Start the native helper only for the installation that will use it:

```sh
FLEET_LAYA_MODEL_PATH="$HOME/Library/Application Support/Fleet/laya-typed-decisions" FLEET_LAYA_CERT_PATH="$HOME/Library/Application Support/Fleet/laya-recall-certificate.json" "$HOME/Library/Application Support/Fleet/cognition-laya/bin/python" laya-service/server.py
```

It binds `127.0.0.1:8832`. Set `FLEET_LAYA_URL=http://127.0.0.1:8832` in that Fleet installation's protected environment, apply the additive migration and use the new source release. No persistent service or runtime replacement was installed by this feature assignment. A container's loopback is its own namespace; this native setup is intended for the native Mac controller.

With the temporary helper running, `npx tsx scripts/verify-recall.ts` verifies actual HTTP accepted/abstained outcomes using the frozen synthetic cases. Python protocol/certificate tests run with `python -m unittest discover -s laya-service -p 'test_*.py' -v`. Normal Fleet tests use fake providers and only a separate `fleet_test` database.

[Implementation and acceptance report](llm-centered-cognition-20261013.md). [Official Laya source](https://github.com/NandhaKishorM/laya), [pinned checkpoint](https://huggingface.co/convaiinnovations/laya-typed-decisions/tree/e929ae5cf69bc34259cd2f95c9e91145b818b1f0).
