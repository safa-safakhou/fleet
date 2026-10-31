import { useEffect, useMemo, useState } from "react";
import catalog from "../../config/research/metrics.v1.json" with { type: "json" };
import type { ResearchAPI } from "./api.js";
import { ResearchChart } from "./chart.js";
import { PactOutcomeTimeline } from "./outcomes.js";
import { ResearchTable } from "./table.js";
import type { EvidenceEvent, MetricSet } from "./types.js";
export function resourceSeries(set: MetricSet) {
  return set.values.map((m) => ({ ...m, label: m.value === null ? "Unavailable / unknown" : String(m.value) }));
}
export function ResourceDashboard({
  snapshotId,
  runId,
  api,
  events,
  onSelect,
}: {
  snapshotId: string;
  runId: string;
  api: ResearchAPI;
  events: EvidenceEvent[];
  onSelect: (id: string) => void;
}) {
  const [records, setRecords] = useState<{ id: string; metrics: MetricSet; evaluation?: unknown }[]>([]),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(0);
  useEffect(() => {
    let active = true;
    setRecords([]);
    void api
      .metrics(runId)
      .then((r) => {
        if (active) setRecords(r);
      })
      .catch(() => {
        if (active) setError("Published metrics unavailable; no evaluation is started by inspection.");
      });
    return () => {
      active = false;
    };
  }, [api, runId]);
  const record = records[selected],
    series = useMemo(() => (record ? resourceSeries(record.metrics) : []), [record]),
    groups = [...new Set(series.map((x) => x.unit))];
  return (
    <section>
      <h2>Resources & outcomes</h2>
      <p>
        Current run snapshot {snapshotId}. Historical aggregates retain their own published source snapshot, half-open
        window, population and time basis.
      </p>
      {error && <p role="alert">{error}</p>}
      {record ? (
        <>
          <label>
            Published metric window (latest20 publications)
            <select value={selected} onChange={(e) => setSelected(Number(e.target.value))}>
              {records.map((r, i) => (
                <option key={r.id} value={i}>
                  {r.id} / {r.metrics.values[0]?.window.start} – {r.metrics.values[0]?.window.end}
                </option>
              ))}
            </select>
          </label>
          <p>{record.metrics.unresolvedUsage.allocations} unresolved allocations</p>
          <p>
            Reserved tokens with unresolved usage: {record.metrics.unresolvedUsage.reservedTokens ?? "unavailable"}.
            Known usage does not imply complete cost.
          </p>
          {record.metrics.exclusions.map((x) => (
            <p className="research-warning" key={x}>
              {x}
            </p>
          ))}
          <div className="research-grid">
            {groups.map((unit) => (
              <ResourcePlot key={unit} unit={unit} values={series.filter((s) => s.unit === unit)} />
            ))}
          </div>
          <ResearchTable
            caption={`Published metric evidence / ${record.metrics.snapshotId}`}
            headers={[
              "Metric / version",
              "Value",
              "Numerator / denominator",
              "Population / window / time basis",
              "Coverage / exclusions",
              "Source",
            ]}
            rows={series.map((m) => ({
              id: m.id,
              cells: [
                <span key={m.id} title={catalog.definitions.find((d) => d.id === m.id)?.formula}>
                  {m.id} / {m.version} · {m.unit}
                </span>,
                m.label,
                `${m.numerator ?? "null"} / ${m.denominator ?? "null"}`,
                `${m.population} / [${m.window.start}, ${m.window.end}) / ${m.timeBasis}`,
                `${m.coverage.status} ${m.coverage.recorded}/${m.coverage.expected}; censored ${m.coverage.censored}, ungraded ${m.coverage.ungraded}; ${m.exclusions.join(", ")}`,
                <div key={m.id}>
                  {m.sourceRefs.map((id) => (
                    <button key={id} type="button" onClick={() => onSelect(id)}>
                      Inspect source {id}
                    </button>
                  ))}
                </div>,
              ],
            }))}
          />
        </>
      ) : (
        <p>No published metric set available. Fields never recorded remain unavailable.</p>
      )}
      <PactOutcomeTimeline
        snapshotId={snapshotId}
        events={events}
        evaluation={record?.evaluation}
        metrics={record?.metrics}
        onSelect={onSelect}
      />
    </section>
  );
}
function ResourcePlot({ unit, values }: { unit: string; values: ReturnType<typeof resourceSeries> }) {
  const option = useMemo(
    () => ({
      tooltip: { trigger: "axis", renderMode: "richText" },
      grid: { left: 60, right: 20, top: 35, bottom: 75 },
      xAxis: {
        type: "category",
        data: values.map((v) => v.id),
        axisLabel: { rotate: 30, width: 100, overflow: "truncate", color: "#aebbd0" },
      },
      yAxis: { type: "value", name: unit, axisLabel: { color: "#aebbd0" } },
      series: [{ type: "bar", data: values.map((v) => v.value), itemStyle: { color: "#80caff" } }],
      dataZoom: [{ type: "inside" }, { type: "slider", bottom: 0 }],
    }),
    [unit, values],
  );
  return <ResearchChart label={`Resource measurements (${unit}) · null values have no bar`} option={option} />;
}
