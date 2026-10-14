# Nemotron cognition usability repair — 14 October 2026

The founder requested investigating and fixing the continuing absence of meaningful beliefs/reflections for the same five local agents. Accounts, history, budgets, model/thinking, permissions, schedule anchor and all six unknown allocations must remain. No comparison, extra inference or new accounts is authorized. Implementation is owned locally without delegation.

## Confirmed blockers

Reconstruction of all five fitted inputs from the preceding release showed the belief arrays constrained to `maxItems: 0`: lexical recall over repeated own building/resource observations omitted useful incoming messages, and linking the current observation to `environment` removed its peer facts. Agent 01's reflection array was also disabled because that delivered receipt lacked recorded intent. These were controller restrictions, not a demonstrated refusal by Nemotron to reason about peers. Its next normal turn did attempt a reflection, rejected with `COGNITION_RECORDED_OUTCOME_REQUIRED`; the old telemetry did not retain the rejected proposal, so its exact missing/wrong reference cannot be recovered.

The old model contract required manually constructed source UUIDs, peer IDs, typed basis, event test timestamps and review labels. This introduced bookkeeping failure paths alongside the actual judgment. Merely allowing unsupported fields or forcing nonempty arrays would hide the problem.

## Implemented repair

- Retrieve an incoming peer statement and a verified, unreflected result alongside the current observation. Both accepted Laya candidates retain their relative order and are delivered. Preserve those analysis sources during fitting; keep minimal observed peer facts/game time and factual receipt fields when linking duplicated context.
- Compute available analysis opportunities from the **final visible** owned evidence. Native output offers a short discriminated analysis: tentative belief with alternative and observable future prediction; reflection with lesson/concrete next step; reassessment of a later reply testing an existing prediction; or honest abstention. Fleet supplies IDs, future timestamp arithmetic and canonical recorded intention/result. It never authors the subjective prose or calls an extra model.
- Translate that native proposal into the existing canonical update, then run the same ownership, direction, visible-source, future-test, source-expiry, confidence, factual outcome, duplicate, version/fence and atomicity checks. Already reflected results and already used statement bases are withheld from fresh opportunities. New tests start no earlier than the latest delivered game time. A reply predating persistence of its prediction cannot count as support.
- Add offered source/type diagnostics and rejection type/selector metadata without logging hidden reasoning. Existing encrypted canonical history and legacy unsupported entries remain intact. No migration/dependency/model/helper change.

Official [Ollama structured-output documentation](https://docs.ollama.com/capabilities/structured-outputs) supports the existing schema-in-`format` interface. This repair does not claim a provider grammar bug; its controller-side evidence/schema restrictions are directly reproducible.

## Verification

Focused synthetic regressions rescue an old incoming statement among twenty repetitive observations, admit a concise native hypothesis, supply exact future test bookkeeping, persist a grounded reflection, and exclude its duplicate after restart. Other cases reject self speech, missing/null game time, paged/foreign facts and aliases, uncertain/malformed outcomes, and retrospective reply support. Dense-context integration validates the actual native output schema, Laya pair order and original 24,000-byte allowance without extra inference. All existing authorization, unknown usage and pending-command checks remain in the full suite.

Final Linux Node 24.21 / PostgreSQL 17.9 verification: **98 unit + 148 integration = 246 passing tests**, including the Linux Codex process fixtures. Type/format/lint, build, core game-boundary check and production dependency audit passed (zero vulnerabilities; existing unrelated lint warnings remain). On macOS, the standalone integration suite has five expected Linux-route failures; the complete Linux suite is the acceptance result. An isolated network-disabled restore of the protected pre-deployment dump matched all **15 nonvolatile tables**; the live database was never restored. Reconstructed five-agent input checks retained Laya pairs at **23,591–23,895 bytes**, exposed peer analysis for Agents 01/04 and a verified result for all five. Reconstructed preflight is a size/evidence check, not an actual emitted Nemotron turn. Normal scheduled turns provide live acceptance; model-authored judgments remain subjective, and populated fields alone do not establish human-like intelligence.

## Deployment status

Pending final source verification and same-cohort native acceptance. The cohort is quiescently paused; no call or pending game command was cancelled. Protected evidence is stored outside Git in this installation's `state/cognition-usability-20261014` directory.
