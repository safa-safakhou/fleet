# Readable run steps — 16 October 2026

Founder requested plain-language explanations, actual recorded outcomes and clearly labeled inputs/outputs for each run step, retaining expandable raw JSON. The approved refinement is restricted to local installation first; the server remains on its existing debugging release.

## Behavior

Each event now shows what Fleet was doing, a distinct recorded-outcome panel, and separate Inputs and Outputs sections. Recorded field names use readable labels, booleans display Yes/No, and nested records can be expanded individually. Full raw JSON remains expandable. Guidance distinguishes account objectives from predefined Fleet strategies. Blocker checks distinguish an observed absence of owner-recovery blockers from proof that all actions are available. Model proposals, saved intentions, submitted commands and confirmed game receipts remain separate.

Missing, withheld, expired or oversized payloads remain explicitly unavailable. Historical empty objects are progress markers without retained result fields, not evidence that game state was empty or an operation succeeded. Unknown event types fall back to their recorded fields rather than invented results. Model-request links match the recorded execution number; read-request links match the tool and stop at the next corresponding request. Response buttons clear filters and scroll within the same run without changing its route. Search includes the explanations/outcomes. Timing distinguishes gaps between records from measured operation durations.

## Verification

- Full Linux unit suite:154 passed. Full isolated PostgreSQL integration suite:222 passed.
- Seven focused rendering/interpretation checks cover guidance, negative/positive blockers, proposed versus committed actions, unavailable/omitted payloads, matching model executions, escaped data and timing.
- Type/style checks, production build, game boundaries and dependency audit pass; existing non-failing CSS/schema warnings remain.
- Synthetic browser preview verified readable blocker outcomes, labeled input/output fields, expandable raw JSON, and response navigation restoring all27 steps while preserving the selected run URL. A390-pixel viewport had no horizontal overflow. The temporary viewport was reset. Preview evidence uses fake providers and fictional data only.

## Local installation scope

This is a frontend-only change. Local installation uses an immutable release with byte-identical existing backend, dependencies, migrations and helper files, replacing only the built web assets. Only the local console restarts; the worker/helper continue unchanged. Existing credentials, cohort intent, identities, schedule anchors, allowances, historical allocations, recovery gates and private run records must remain intact. The earlier20 blocked local agents are not reviewed, reconnected or replayed as part of this UI update. No server deployment or source push is authorized by this request.

Installation acceptance is appended after the actual switch and readback. Rollback selects the previous console/web release with the newest database and unchanged worker retained; no database restore is needed for this UI-only release.
