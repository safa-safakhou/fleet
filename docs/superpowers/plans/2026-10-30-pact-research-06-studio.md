# PACT Research Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans`, inline without delegation. Checkboxes are future implementation under a covering assignment.

**Goal:** Make every important run sequence, source transformation, resource bottleneck and comparison inspectable through mandatory visual views.

**Architecture:** React screens consume authorized, paginated research read models and versioned metrics. ECharts/deterministic graph layout render views with keyboard controls, source deep links and equivalent tables; execution controls remain on existing authorized paths.

**Tech Stack:** React/TypeScript, Apache ECharts, `@dagrejs/dagre`, Vitest and Playwright, existing Vite/Fastify API.

**Spec:** [Design §§6–9, 11](../specs/2026-10-30-pact-research-engine-design.md); [master constraints](2026-10-30-pact-research-engine.md). Depends on O4–O6, M4 and A1–A2. Visualizations are a release requirement, not optional polish.

## Global Constraints

- UI inspection never initiates inference, evaluation, gameplay or extra PACT polling. Existing draft/start/recovery permissions are preserved.
- All visible rows/chart points retain source/snapshot/metric IDs and coverage. No fictitious durations, zero-filled unknowns or automatic winner.
- Private observation retains 30 days; client caches clear on revocation/expiry/logout. Event pages default 200/max 500; artifact chunks at most 1 MiB.
- Large-run fixture: 100,000 events/16 MiB artifact. Reference target: first timeline interaction within 2 seconds after initial metadata load, page API p95 at most 500 ms. Record runner and absolute results.

## Review Focus

1. Large concurrent traces retain causal meaning without loading everything — U1.
2. Displayed context differs from actual final input or hides omitted sources — U2.
3. Unknown usage or admitted actions look like zero cost/completed objectives — U3.
4. A small/confounded sample looks like a statistically established winner — U4.
5. Keyboard users, narrow screens or revoked permissions cannot access/clear private detail — all tasks, especially U1/U4.

---

## File responsibilities

Create `web/research/{api,types,route}.ts`, `web/research/{workspace,chart,table,filters,timeline,causal-graph,context,lineage,manifest,resources,outcomes,comparison}.tsx` and `web/research/styles.css`. `chart.tsx` registers only required ECharts modules including accessibility support; tables/filter state are reusable. Business formulas live in A1, never chart components.

Adapt `web/main.tsx`, `web/runs.tsx`, `web/metrics.tsx`, `web/comparisons.tsx`, `web/observe.tsx` to link the studio while preserving current routes. Create `playwright.research.config.ts`, `scripts/serve-research-ui-fixture.ts`, `tests/browser/research/` and ignored screenshot/report output paths. The fixture server has synthetic data and refuses real DB/provider/game routes.

## U1 — Build the overview, causal timeline and graph

**Files:** Create shared studio modules, `timeline.tsx`, `causal-graph.tsx`, `tests/unit/research-timeline.test.tsx`, `tests/browser/research/timeline.spec.ts` and fixture server/config; modify main/runs/observe route links and root scripts (`test:research-ui`).

**Consumes:** O4 run/event/coverage APIs and O6 trace links. Read models use C1/O4 generated contracts through `web/research/types.ts`; do not duplicate private domain models in the client.

**Produces:** `ResearchWorkspace({ runId })`, `RunTimeline({ snapshotId, selectedEventId, filters, onSelect })`, `CausalGraph({ snapshotId, selectedEventId, onSelect })`; deep link `#research/run/<runId>?event=<eventId>`. Overview surfaces actual state, blocked/unknown work, evidence completeness and manifest/profile identity.

- [x] Write `parallel_lanes_preserve_sequence`: skewed clocks, parent fan-in, late arrival, missing event, censored wait and same-time events. Assert stream order, explicit causal edges, distinct queue/provider/action spans and "gap" labels for unmeasured intervals. 1,205 events paginate; 100,000-event fixture never renders/requests all events initially.
- [x] Run `npx vitest run tests/unit/research-timeline.test.tsx` and `npx playwright test --config playwright.research.config.ts tests/browser/research/timeline.spec.ts`; expect RED.
- [x] Implement viewport-bounded lanes/graph, cursor loading, expand-on-demand parents, zoom/filter/search and stable selection/deep links. Use deterministic DAG layout; missing parent remains visible as unavailable. Add table/keyboard selection, loading/error/expired states and consent-aware cancellation/cache clearing. Keep existing run URLs functional with links into the research view.
- [x] Run both tests at 1440px and 390px viewport, keyboard-only navigation, revoked session and fixture performance mode. Expect PASS and recorded synthetic screenshots; verify the reference latency budgets separately from flaky CI wall-clock assertions.
- [x] Review/checkpoint U1; no run/start action is reachable merely by following an inspection link.

## U2 — Build context, memory, statechart and skill lineage inspectors

**Files:** Create `context.tsx`, `lineage.tsx`, `manifest.tsx`, `tests/unit/research-context-view.test.tsx`, `tests/browser/research/lineage.spec.ts`; adapt run detail tabs.

**Consumes:** M3 `ContextPacket/ContextLineage`, M1 typed memory/versions, O4 authorized artifact/lineage APIs and R3 transition evidence.

**Produces:** `ContextInspector({ runId, eventId })`, `LineageInspector({ runId, sourceId })`, `ManifestInspector({ manifestDigest })`; source→memory/transform→context→decision/skill/statechart navigation with exact version and coverage display. Manifest inspection shows resolved settings, capability/qualification scope and differences from draft inputs; editing stays in R5's existing draft flow.

- [x] Write `final_input_is_auditable`: a context contains selected/omitted/expired sources, a contradictory peer belief and a transformed excerpt; assert displayed messages/schema match the final captured artifact byte content and all omissions are visible. Statechart shows real recorded transitions; skill adoption does not imply skill success. Revoked source click must not show cached body.
- [x] Run `npx vitest run tests/unit/research-context-view.test.tsx` and `npx playwright test --config playwright.research.config.ts tests/browser/research/lineage.spec.ts`; expect RED.
- [x] Implement source/span highlight, packet/schema/model-parameter tabs, diff of source/checkpoint revisions, mandatory-source coverage and virtualized large-text inspection. Label observed fact/peer claim/inference/plan/admission distinctly. Default collapsed payloads fetch only on authorized selection; never render peer text as executable HTML/Markdown with active links/scripts.
- [x] Run both tests with a 16 MiB artifact, malicious peer HTML, partial body, keyboard graph-to-table navigation and expired content; expect PASS without freezing the page or disclosing foreign state.
- [x] Review/checkpoint U2 with a reproducible synthetic "why did this action happen?" walkthrough.

## U3 — Build resource charts and PACT outcome timelines

**Files:** Create `resources.tsx`, `outcomes.tsx`, `tests/unit/research-resource-view.test.tsx`, `tests/browser/research/resources.spec.ts`; adapt `web/metrics.tsx` to link full drilldowns.

**Consumes:** A1 catalog/MetricSet, O4 sequence/receipt records, O6 operational dashboard links.

**Produces:** `ResourceDashboard({ snapshotId })` and `PactOutcomeTimeline({ snapshotId })`; charts for queue/service/latency distribution, concurrency, reservations/known/unknown usage, context/output limits, deadlines, storage/export health, and supported PACT objectives/communication outcomes.

- [x] Write `activity_is_not_effectiveness`: action then WAIT, admitted construction with no completion observation, contact accepted but no message, output cap, queue deferral, unknown tokens and late usage. Assert separate task/attempt/call/action populations, null markers, known/reserved/unknown series and no "completed" label without evidence. Communication graph distinguishes sent/delivered/replied/agreed edges.
- [x] Run `npx vitest run tests/unit/research-resource-view.test.tsx` and `npx playwright test --config playwright.research.config.ts tests/browser/research/resources.spec.ts`; expect RED.
- [x] Implement linked time/filter windows with declared clock/units, distribution sample counts, coverage badges and event drilldowns. Reuse metric definitions for tooltips/tables. Distinguish current operational state from historical time-window aggregates; never make up monetary prices or call latency from an event gap.
- [x] Run both tests including more than 200 calls, incomplete history and narrow/color-blind/keyboard views; expect PASS with aggregates matching A1 and no claim that communication volume measures intelligence.
- [x] Review/checkpoint U3 with synthetic screenshots of uncertainty and delayed completion, not just successful runs.

## U4 — Build comparison workspace and authorized exports

**Files:** Create `comparison.tsx`, `tests/unit/research-comparison-view.test.tsx`, `tests/browser/research/comparison.spec.ts`; modify `web/comparisons.tsx`, chart/table export utilities and route docs.

**Consumes:** A2 `ComparisonReport`, manifest diffs, A1 metric definitions/coverage and O5 full archive links.

**Produces:** `ResearchComparison({ experimentSnapshotId })`; condition/dataset/budget diff, distributions and effect intervals, outcome-versus-cost/latency Pareto plot, independent-unit/missingness table, metric-level source drilldown and explicit full archive export. Chart SVG/PNG and table CSV/JSON exports are separately requested decrypted outputs under the export policy, never a substitute for the complete encrypted archive.

- [x] Write `comparison_refuses_false_certainty`: shared-world sample with two clusters, unknown-cost candidate, mismatched horizon and changed evaluator. Assert descriptive/insufficient-unit labels, no fabricated interval/winner, unsuitable ranking disabled and all exclusions visible. Missing runs remain listed. Exported data includes metric/version/window/denominator/coverage/snapshot IDs and neutralizes CSV formula injection.
- [x] Run `npx vitest run tests/unit/research-comparison-view.test.tsx` and `npx playwright test --config playwright.research.config.ts tests/browser/research/comparison.spec.ts`; expect RED.
- [x] Implement accessible linked plots/tables with predeclared primary metric/effect margin and caveats from A2. Add explicit user-triggered authorized exports, no public sharing links or private analytics. Full archive export streams all pages through O5; chart export states its filters/coverage. Preserve draft comparison behavior and never start a run on compare/view/export.
- [x] Run both tests, `npm run test:research-ui` and `npm run build`; expect PASS with inspected synthetic screenshots for every mandatory design view, keyboard/table equivalents and no external or gameplay requests.
- [x] Review/checkpoint U4. The studio is accepted only after the causal failure investigation and comparison walkthroughs work end to end.

## Completion — 31 October 2026

U1–U4 source/offline implementation is complete inline on master. [Delivered interfaces, commits, checks, Linux performance and acceptance limits](../../research/studio-20261031.md). Browser checks use owned synthetic read models; native databases are fresh isolated fixtures. Inspection/export never launches runs or evaluations. Q qualification and operational installation are not resumed by these checkmarks.
