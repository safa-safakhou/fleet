# Run debugging — 16 October 2026

Subsequent founder-authorized installation is complete on the existing local and server runtimes. Read [deployment acceptance and remaining local recovery gates](run-debugging-deployment-20261016.md). Source-only statements below describe the earlier implementation handoff.

Founder requested a dashboard entry on every page, searchable run history, and detailed inputs, outputs and reports for each selected run, with clear titles and timing. The approved bounded design extends the existing authenticated observation/history flow. Implemented locally without delegation; this report does not claim deployment.

## Operator workflow

Select **Runs / debugging** in the persistent navigation. Select a fleet, filter by agent/status, and search loaded runs by agent name, run ID, outcome/error or summary. Load older pages to extend that search; it does not claim to search unloaded history. Expand a run and select **Open full run debugging**. The agent inspector's turn history provides the same link. Each run has a reloadable `#run=TURN_UUID` URL, an All runs return button and an agent inspector link.

The run page refreshes every five seconds. It includes run IDs, status/summary, scheduled/start/finish/deadline timestamps, queue delay, total duration, calls/actions, reported tokens and original execution allocations. Unknown usage remains explicitly unknown. Each retained event has its original sequence position, title, stage, Europe/Berlin timestamp to milliseconds, offset from turn start and gap since the previous event. Gaps describe event spacing, not inferred operation durations. Measured model/read/recall operation durations are labeled separately. Search events and payloads or filter by stage; numbering and timing continue to refer to the original unfiltered sequence.

Expand named input/output sections or all recorded fields as JSON. Download run JSON exports the currently fetched report, including run events, command resolutions, pending action and accounting. It is a private export; normal observation consent and redaction still apply.

## Capture and historical coverage

Future turns on this source release capture model configuration, final prepared messages (JSON contents decoded for inspection), output schema, output limit and input bytes; returned final-answer text and parsed decision, usage/error and model duration; automatic/initial/explicit game read arguments, complete returned bodies, failure codes and duration; internal tool results; Laya query/candidate inputs, returned selection/certificate/probability and fallback/abstention; accepted cognition updates and resulting subjective state. Existing context-packing, grounding, action/receipt, continuation, completion and recovery events remain available. This is telemetry from actual ordinary execution, not extra model calls or gameplay reads triggered by inspection. Provider internal reasoning, provider stderr and credential material are not collected.

Private debug bodies use the existing event-bound encryption, cohort observation consent, serialized consent revocation and 30-day event retention. Credential-like object keys and JSON embedded in final-answer strings are redacted, as are Bearer credentials in text. Debug payloads have a 256 KiB bound each; oversized bodies are explicitly omitted with original byte count. Ordinary summary events retain their existing 8 KiB bound. Detailed pending/resolved command bodies use the larger bound only in the individual run report. Debug events are excluded from bulk history responses, avoiding transmission of every prompt while browsing a page of runs. Richer capture increases retained observation storage; the existing retention policy still applies.

Missing historical prompts, expired events, disabled-consent details, provider answers unavailable after transport failure and oversized omitted bodies are shown honestly; they are never reconstructed. Current agent cognition is not presented as a historical run snapshot. No HMM runtime exists in this implementation; available systems are named according to the actual model, cognition, Laya and game-tool records. VW remains unused.

## Verification

- Test-first authenticated run endpoint and engine capture assertions failed before implementation, then passed. Run rendering checks precise offsets/duration, escaped payloads and historical coverage.
- Full Linux unit suite: **148 passed**. Full isolated PostgreSQL integration suite: **222 passed**. Final focused verification: **52 passed**, including additional integration assertions covering Laya request/response/abstention capture as well as run payload bounds, JSON-embedded secret redaction, anonymous access rejection and revocation.
- Type/format checks, game-boundary check, production build and full dependency audit pass (zero vulnerabilities). Existing CSS specificity and fixture schema-format warnings remain non-failing.
- Isolated browser preview used only `fleet_test`, fake game/model ports and fictional accounts with live execution disabled. Verified login, reloadable run URL, run search, history-to-detail navigation, expanded input payload, event filtering and JSON download. The 390-pixel view had no horizontal document overflow; temporary viewport override was reset. Synthetic fixed-clock data correctly shows zero elapsed time; nonzero timing is verified by the rendering test.
- Code reviewed locally against the approved scope, including consent, historical coverage, bounded storage and unchanged execution/authority. Repository instructions prohibit delegation.

## Runtime scope

No migration is needed. Existing accounts, histories, models, budgets, schedule anchors, unknown allocations, pending commands and all running/terminal populations are unchanged. No deployment, push, experiment, reconnection, unknown-usage review or replay was performed. Rich capture begins only after this source is separately installed in the intended Fleet runtime.
