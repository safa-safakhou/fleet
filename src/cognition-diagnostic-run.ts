import type { DiagnosticScenario, RecallCase } from "./cognition-diagnostic-cases.js";
import type { DiagnosticJournal } from "./cognition-diagnostic-journal.js";
import { FleetError, type ModelPort, safeCode } from "./domain.js";
import type { DiagnosticEpisodes } from "./games/pact/cognition-diagnostics.js";
/** One serial diagnostic; no worker, game transport, automatic restart or old grant supplied. */
export async function runCognitionDiagnostics(
  journal: DiagnosticJournal,
  episodes: DiagnosticEpisodes,
  model: ModelPort,
  cases: RecallCase[],
  transport: typeof fetch = fetch,
  progress: (event: Record<string, unknown>) => Promise<void> = async () => {},
) {
  if (cases.length !== 88) throw new FleetError("DIAGNOSTIC_RECALL_COVERAGE");
  const helpers: Record<string, unknown>[] = [],
    turns: Awaited<ReturnType<DiagnosticEpisodes["run"]>>[] = [];
  for (const c of cases) {
    journal.assertActive();
    let outcome: unknown;
    try {
      outcome = await journal
        .recall({ lane: "standalone", turn: c.id, arm: c.arm, order: c.order, expected: c.expected }, transport)
        .choose(c.query, c.candidates, AbortSignal.timeout(3000));
    } catch (e) {
      if (safeCode(e) !== "LAYA_ABSTAINED") throw e;
      outcome = { code: "LAYA_ABSTAINED" };
    }
    helpers.push({ id: c.id, arm: c.arm, order: c.order, expected: c.expected, outcome });
    if (helpers.length % 8 === 0) await progress({ stage: "helper", completed: helpers.length, ...journal.summary() });
  }
  for (const thinking of [true, false])
    for (const profile of ["legacy-cognition", "reactive-cognition"] as const)
      for (const scenario of ["memory-control", "no-evidence", "promise", "reserve"] as DiagnosticScenario[]) {
        for (let step = 0; step < (scenario === "promise" || scenario === "reserve" ? 3 : 1); step++) {
          journal.assertActive();
          const scope = { thinking, profile, turn: `${scenario}:${step}` };
          const result = await episodes.run(
            profile,
            thinking,
            scenario,
            step,
            journal.model(model, scope),
            journal.recall({ ...scope, lane: "embedded" }, transport),
          );
          turns.push(result);
          await progress({ stage: "engine", thinking, profile, scenario, step, result, ...journal.summary() });
          journal.assertActive();
          if (result.pending || result.scopeViolation) throw new FleetError("DIAGNOSTIC_SCOPE_OR_COMMAND_UNCERTAINTY");
          if (result.calls === 0) break;
        }
      }
  return { helpers, turns, summary: journal.summary() };
}
