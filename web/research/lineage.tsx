import { object } from "./context.js";
export function LineageInspector({ runId, sourceId, body }: { runId: string; sourceId: string; body: unknown }) {
  const value = object(body);
  return (
    <section>
      <h3>Recorded memory, statechart and skill lineage</h3>
      <p>
        Run {runId} · source {sourceId}. Observed fact, peer claim, inference, plan and admission retain their source
        classification. Invocation or adoption does not establish skill success.
      </p>
      <p>
        Revision {String(value.version ?? value.revision ?? "unavailable")} · parent/source references{" "}
        {JSON.stringify(value.sourceRefs ?? value.lineage ?? "unavailable")}
      </p>
      <p>
        Recorded state transition:{" "}
        {JSON.stringify(
          value.transition ?? { from: value.from ?? null, to: value.to ?? null, reason: value.reason ?? null },
        )}
      </p>
      <pre>{JSON.stringify(body, null, 2).slice(0, 65536)}</pre>
    </section>
  );
}
