import { useMemo } from "react";
import { ResearchTable } from "./table.js";
import type { EvidenceEvent } from "./types.js";
export function buildTrace(events: EvidenceEvent[]) {
  const sorted = [...events].sort(
    (a, b) =>
      a.streamId.localeCompare(b.streamId) ||
      (BigInt(a.sequence) < BigInt(b.sequence)
        ? -1
        : BigInt(a.sequence) > BigInt(b.sequence)
          ? 1
          : a.id.localeCompare(b.id)),
  );
  const nodes = sorted.map((e) => ({
    ...e,
    durationMs: e.processId && e.durationNs !== undefined ? Number(BigInt(e.durationNs)) / 1e6 : null,
    label: `${e.kind} · ${e.durationNs && e.processId ? `${Number(BigInt(e.durationNs)) / 1e6} ms measured` : e.kind === "queue.enter" ? "censored wait / unmeasured gap" : "unmeasured gap"}`,
  }));
  const lanes = [...new Set(nodes.map((e) => e.streamId))].map((id) => ({
      id,
      events: nodes.filter((e) => e.streamId === id),
    })),
    ids = new Set(nodes.map((e) => e.id)),
    gaps: string[] = [];
  for (const lane of lanes)
    for (let i = 1; i < lane.events.length; i++) {
      const a = BigInt(lane.events[i - 1].sequence),
        b = BigInt(lane.events[i].sequence);
      if (b > a + 1n) gaps.push(`${lane.id}: missing sequence ${a + 1n}–${b - 1n} (outside page or recording gap)`);
    }
  return {
    nodes,
    lanes,
    gaps,
    edges: nodes.flatMap((e) => e.parentIds.map((source) => ({ source, target: e.id, unavailable: !ids.has(source) }))),
  };
}
export function RunTimeline({
  events,
  selectedEventId,
  onSelect,
  zoom = 1,
}: {
  snapshotId: string;
  events: EvidenceEvent[];
  selectedEventId?: string;
  onSelect: (id: string) => void;
  zoom?: number;
}) {
  const trace = useMemo(() => buildTrace(events), [events]);
  return (
    <section aria-label="Causal timeline">
      <h2>Parallel stream timeline</h2>
      <p>
        Per-stream sequence is authoritative. UTC timestamps may be skewed; ingestion ordinal is a locator, not global
        chronology. Event gaps are not durations.
      </p>
      <div className="research-lanes" style={{ maxHeight: 240 + zoom * 60 }}>
        {trace.lanes.map((l) => (
          <div key={l.id} className="research-lane">
            <strong>{l.id}</strong>
            <div>
              {l.events.map((e) => (
                <button
                  type="button"
                  key={e.id}
                  aria-pressed={e.id === selectedEventId}
                  title={e.label}
                  onClick={() => onSelect(e.id)}
                >
                  {e.sequence} · {e.kind}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {trace.gaps.map((g) => (
        <p className="research-warning" key={g}>
          {g}
        </p>
      ))}
      <ResearchTable
        caption="Timeline event evidence (current page)"
        headers={["Inspect", "Stream / sequence", "Event", "Observed UTC / ingested UTC", "Measured duration"]}
        rows={trace.nodes.map((e) => ({
          id: e.id,
          cells: [
            <button key={e.id} type="button" aria-label={`Inspect event ${e.id}`} onClick={() => onSelect(e.id)}>
              Inspect {e.id.slice(-8)}
            </button>,
            `${e.streamId} / ${e.sequence}`,
            e.kind,
            `${e.occurredAt} / ${e.recordedAt}`,
            e.label,
          ],
        }))}
      />
    </section>
  );
}
