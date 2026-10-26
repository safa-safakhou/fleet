# Thinking trial and Fleet metrics implementation plan

Owner scope: enable Nemotron4B thinking with enough output allowance, run the same world for15minutes and pause; build a Fleet dashboard with meaningful charts during observation. Inline, no desktop GUI, E4/KQ1 blocked; preserve four original holds and all history/quotas/anchors. No commit/push requested. Owner delegates metric/design choices.

Design: existing authenticated Fleet console gains a Metrics section with per-fleet/all-fleet and time filters. Charts use ledger/turn facts, not narration: calls and confirmed actions over time, context fill per call, output fill, outcomes and architecture totals. Unknown usage/context stays unknown. Store only bounded numeric/classification metrics, never prompts/reasoning text. No chart library/dependency or model-based analysis.

- [x] Add tested paused/unresolved-safe audited thinking enablement with8192 output tokens. Thinking-only bounded timing:180s/call,360s/turn; original finite deadlines still cap both. Fake SSE proves reasoning deltas coexist with final structured output and usage.
- [x] Add additive per-call numeric metrics and both execution-path instrumentation; fresh synthetic DB tests prove recording/aggregation/privacy/unknown handling. Build and qualify offline before model/game activation.
- [x] Prepare fresh private continuation, pinned worker, native publisher, cache/clock/restore gates. Enable only20 eligible cohorts; retain four holds. Run15min with independent supervision and bounded drain; no extra canary/model trial. Observe while implementing dashboard against staged worker.
- [x] Implement authenticated aggregate API and existing-console Metrics tab using accessible SVG charts and tables. Verify empty/mixed/unknown/error/time-filter cases; types/build/style/boundaries and bounded relevant integrations. Install execution-disabled console without starting workers.
- [x] Close/drain/pause and restore-check; preserve new uncertainty if any. Report actual thinking activity, calls/actions/contacts/loop/failure outcomes and dashboard URL. Record intentional dashboard-only source changes separately from immutable worker pins.

Rulings: use main master worktrees perAGENTS. Inline self-review; no delegation. Broad requested dashboard and delegated selection cover design choices without further approval.8192 is a bounded increased generation allowance, not a promise every answer fits. No hidden removal of freshness/authority checks or forced activity.

Completion: see [actual results](../../thinking-fifteen-metrics-20261026.md). The live wire-cap failure is retained; its source repair is staged/offline-qualified only. No additional trial.
