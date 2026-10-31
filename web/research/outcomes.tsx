import { object } from "./context.js";
import { ResearchTable } from "./table.js";
import type { EvidenceEvent, MetricSet } from "./types.js";
export function outcomeRows(events: EvidenceEvent[]) {
  return events
    .filter(
      (e) =>
        e.kind.startsWith("command.") ||
        e.kind === "task.state" ||
        e.kind === "decision.proposed" ||
        e.kind === "participant.message",
    )
    .map((e) => ({
      id: e.id,
      at: e.occurredAt,
      meaning:
        e.kind === "command.receipt"
          ? "Admission receipt; completion not established"
          : e.kind === "task.state"
            ? `Task state ${e.attributes.code ?? e.attributes.outcome ?? "unavailable"}; prior effects remain recorded`
            : e.kind === "participant.message"
              ? "Recorded communication; delivery/reply/agreement need separate evidence"
              : e.kind === "decision.proposed"
                ? "Proposal; admission not established"
                : `${e.kind}; inspect native result`,
      parents: e.parentIds,
    }));
}
export function PactOutcomeTimeline({
  events,
  evaluation,
  metrics,
  onSelect,
}: {
  snapshotId: string;
  events: EvidenceEvent[];
  evaluation?: unknown;
  metrics?: MetricSet;
  onSelect: (id: string) => void;
}) {
  const result = object(evaluation),
    objectives = result.version === "fleet.evaluation/v1" && Array.isArray(result.objectives) ? result.objectives : [];
  const communication = [
    { id: "confirmed_contacts.v1", label: "Confirmed contacts" },
    { id: "messages_delivered.v1", label: "Messages delivered" },
    { id: "verified_replies.v1", label: "Verified replies" },
    { id: "confirmed_agreements.v1", label: "Confirmed agreements" },
  ];
  return (
    <section>
      <h2>PACT outcome evidence</h2>
      <p>
        Proposed, admitted, confirmed and independently observed completion remain separate. A final WAIT cannot erase
        earlier effects. Communication volume is not a measure of intelligence.
      </p>
      <div className="research-graph-scroll">
        <svg
          width={Math.max(700, outcomeRows(events).length * 180)}
          height="170"
          role="img"
          aria-label="Outcome evidence timeline"
        >
          <title>Recorded outcome points in ingestion page order; spacing is not duration</title>
          <text x="12" y="22" fill="#e8edf7">
            Recorded outcome points · ingestion page order · no duration inferred
          </text>
          {outcomeRows(events).map((e, i) => (
            <g key={e.id} transform={`translate(${30 + i * 180} 65)`}>
              <title>
                {e.id} / {e.at} / {e.meaning}
              </title>
              <circle r="8" fill={e.meaning.startsWith("Admission") ? "#ffdb95" : "#9edcff"} />
              <text x="0" y="30" fill="#e8edf7" fontSize="12">
                {e.id.slice(-8)}
              </text>
              <text x="0" y="49" fill="#e8edf7" fontSize="11">
                {e.meaning.startsWith("Admission") ? "Admitted (not completed)" : "Recorded activity"}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <ResearchTable
        caption="Recorded outcome sequence (current event page)"
        headers={["Event / observed UTC", "Meaning", "Evidence"]}
        rows={outcomeRows(events).map((e) => ({
          id: e.id,
          cells: [
            `${e.id} / ${e.at}`,
            e.meaning,
            <button key={e.id} type="button" onClick={() => onSelect(e.id)}>
              Inspect outcome {e.id.slice(-8)}
            </button>,
          ],
        }))}
      />
      <ResearchTable
        caption={`Independent objective grading / ${String(result.evaluatorDigest ?? "unavailable")}`}
        headers={["Objective", "Observed status", "Source evidence"]}
        rows={objectives.map((o: { id: string; status: string; sourceRefs: string[] }) => ({
          id: o.id,
          cells: [
            o.id,
            o.sourceRefs.length ? o.status : "ungraded / no evidence",
            <div key={o.id}>
              {o.sourceRefs.map((id) => (
                <button type="button" key={id} onClick={() => onSelect(id)}>
                  Inspect {id}
                </button>
              ))}
            </div>,
          ],
        }))}
      />
      <h3>Communication stages</h3>
      <p>
        Stage counts use their published independent definitions. Edges appear only with recorded causal parents;
        acceptance alone never implies a message or agreement.
      </p>
      <div className="research-kpis">
        {communication.map((c) => (
          <article key={c.id}>
            <span>{c.label}</span>
            <strong>{metrics?.values.find((v) => v.id === c.id)?.value ?? "unavailable"}</strong>
            <code>{c.id}</code>
          </article>
        ))}
      </div>
      <ResearchTable
        caption="Explicit communication causal links (current page)"
        headers={["Event", "Recorded parents", "Delivery meaning"]}
        rows={events
          .filter((e) => e.kind === "participant.message")
          .map((e) => ({
            id: e.id,
            cells: [e.id, e.parentIds.join(", ") || "No recorded parent", "No inferred delivery/reply/agreement"],
          }))}
      />
    </section>
  );
}
