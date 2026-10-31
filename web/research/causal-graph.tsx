import dagre from "@dagrejs/dagre";
import { useMemo, useState } from "react";
import { ResearchTable } from "./table.js";
import { buildTrace } from "./timeline.js";
import type { EvidenceEvent } from "./types.js";
export function CausalGraph({
  events,
  selectedEventId,
  onSelect,
}: {
  snapshotId: string;
  events: EvidenceEvent[];
  selectedEventId?: string;
  onSelect: (id: string) => void;
}) {
  const [offset, setOffset] = useState(0);
  const graph = useMemo(() => {
    const chosen = events.findIndex((e) => e.id === selectedEventId),
      start = chosen >= 0 ? Math.max(0, chosen - 5) : Math.min(offset, Math.max(0, events.length - 1));
    const ids = new Set<string>();
    if (chosen >= 0) {
      ids.add(events[chosen].id);
      for (let depth = 0; depth < 3 && ids.size < 24; depth++) {
        const frontier = new Set(ids);
        for (const e of events) {
          if (ids.size >= 24) break;
          if (frontier.has(e.id))
            for (const parent of e.parentIds) {
              if (ids.size < 24 && events.some((x) => x.id === parent)) ids.add(parent);
            }
          if (e.parentIds.some((p) => frontier.has(p))) ids.add(e.id);
        }
      }
    }
    const selectedEvents = chosen >= 0 ? events.filter((e) => ids.has(e.id)) : events.slice(start, start + 24);
    const trace = buildTrace(selectedEvents),
      missing = [...new Set(trace.edges.filter((e) => e.unavailable).map((e) => e.source))],
      g = new dagre.graphlib.Graph()
        .setGraph({ rankdir: "LR", ranksep: 60, nodesep: 40, marginx: 20, marginy: 20 })
        .setDefaultEdgeLabel(() => ({}));
    for (const id of [...trace.nodes.map((e) => e.id), ...missing].sort()) g.setNode(id, { width: 130, height: 55 });
    for (const e of [...trace.edges].sort((a, b) => (a.source + a.target).localeCompare(b.source + b.target)))
      g.setEdge(e.source, e.target);
    dagre.layout(g);
    return { g, trace, missing, start };
  }, [events, offset, selectedEventId]);
  return (
    <section>
      <h2>Causal graph</h2>
      <p>
        24-node viewport · page offset {graph.start}. Explicit expansions may be outside page filters. Per-stream order
        and explicit parents; unavailable parents use dashed edges. Scroll the graph or use equivalent table controls.
      </p>
      <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 24))}>
        Previous graph window
      </button>
      <button type="button" disabled={offset + 24 >= events.length} onClick={() => setOffset(offset + 24)}>
        Next graph window
      </button>
      <div className="research-graph-scroll">
        <svg
          width={Math.max(650, graph.g.graph().width ?? 650)}
          height={Math.max(220, graph.g.graph().height ?? 220)}
          role="img"
          aria-label="Explicit event causality"
        >
          <title>Deterministic event DAG, explicit parent edges</title>
          <defs>
            <marker
              id="research-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#9edcff" />
            </marker>
          </defs>
          {graph.trace.edges.map((e) => (
            <polyline
              key={`${e.source}:${e.target}`}
              points={graph.g
                .edge(e.source, e.target)
                .points.map((p: { x: number; y: number }) => `${p.x},${p.y}`)
                .join(" ")}
              fill="none"
              stroke="#9edcff"
              strokeDasharray={e.unavailable ? "4 4" : undefined}
              markerEnd="url(#research-arrow)"
            />
          ))}
          {graph.g.nodes().map((id: string) => {
            const node = graph.g.node(id),
              event = graph.trace.nodes.find((e) => e.id === id);
            return (
              <g key={id} transform={`translate(${node.x - 65} ${node.y - 27})`}>
                <rect width="130" height="54" rx="6" fill={event ? "#192f49" : "#382e20"} stroke="#9edcff" />
                <text x="8" y="21" fill="#e8edf7" fontSize="11">
                  {event?.kind ?? "Unavailable parent"}
                </text>
                <text x="8" y="39" fill="#e8edf7" fontSize="10">
                  {event ? `${event.streamId} #${event.sequence}` : id.slice(-12)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <ResearchTable
        caption="Causal graph keyboard navigation"
        headers={["Event", "Parents", "Inspect"]}
        rows={graph.trace.nodes.map((e) => ({
          id: e.id,
          cells: [
            `${e.id} / ${e.kind}`,
            e.parentIds.join(", ") || "none",
            <button key={e.id} type="button" onClick={() => onSelect(e.id)}>
              Inspect graph event {e.id.slice(-8)}
            </button>,
          ],
        }))}
      />
      {graph.missing.map((id) => (
        <button key={id} type="button" onClick={() => onSelect(id)}>
          Load parent {id}
        </button>
      ))}
    </section>
  );
}
