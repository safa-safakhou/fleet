import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ResearchAPI } from "./api.js";
import { ResearchChart } from "./chart.js";
import { runLink } from "./route.js";
import { ResearchTable } from "./table.js";
import type { ComparisonReport } from "./types.js";
export function comparisonView(report: ComparisonReport) {
  const reasons = [
    ...new Set([...report.flags, ...report.intervals.map((i) => i.reason).filter((x): x is string => Boolean(x))]),
  ];
  return { rankable: false, descriptive: reasons.length > 0, reasons };
}
export function comparisonPlotData(report: ComparisonReport, metricId: string) {
  return {
    bounds: report.flags.length
      ? []
      : report.intervals.filter((i) => i.metricId === metricId && !i.reason && i.lower !== null && i.upper !== null),
    observations: report.units.flatMap((u, index) =>
      u.runs.flatMap((r) => {
        const value = r.metrics.values.find((v) => v.id === metricId)?.value;
        return typeof value === "number" ? [{ name: `${u.id} / ${r.runId}`, value: [value, index] }] : [];
      }),
    ),
  };
}
function ComparisonDetailPlots({ report, metric }: { report: ComparisonReport; metric: string }) {
  const plot = comparisonPlotData(report, metric),
    selected = report.intervals.filter((i) => i.metricId === metric),
    candidates = [...new Set(selected.map((i) => i.candidate))];
  const intervals = {
    tooltip: { renderMode: "richText" },
    grid: { left: 80, right: 30, bottom: 45, top: 30 },
    xAxis: { type: "value", name: metric, axisLabel: { color: "#aebbd0" } },
    yAxis: { type: "category", data: candidates, axisLabel: { color: "#aebbd0" } },
    series: [
      ...plot.bounds.map((i) => ({
        type: "line",
        data: [
          [i.lower, candidates.indexOf(i.candidate)],
          [i.upper, candidates.indexOf(i.candidate)],
        ],
        symbol: "rect",
        symbolSize: 8,
        lineStyle: { color: "#9edcff" },
      })),
      {
        type: "scatter",
        data: selected
          .filter((i) => i.estimate !== null)
          .map((i) => ({
            name: `${i.candidate} / ${i.reason ?? "eligible"}`,
            value: [i.estimate, candidates.indexOf(i.candidate)],
          })),
        symbolSize: 10,
        itemStyle: { color: "#ffdb95" },
      },
    ],
  };
  const distribution = {
    tooltip: { renderMode: "richText" },
    grid: { left: 80, right: 30, bottom: 45, top: 30 },
    xAxis: { type: "value", name: metric, axisLabel: { color: "#aebbd0" } },
    yAxis: { type: "category", data: report.units.map((u) => u.id), axisLabel: { color: "#aebbd0" } },
    series: [{ type: "scatter", data: plot.observations, symbolSize: 10, itemStyle: { color: "#9edcff" } }],
  };
  return (
    <div className="research-grid">
      <ResearchChart label="Recorded effect estimates and eligible intervals" option={intervals} />
      <ResearchChart label="Recorded run observations grouped by world unit" option={distribution} />
      <p>
        Points can be descriptive. Interval bars require the native eligibility gate. Repeated runs within a world
        remain dependent; these views do not change the independent-unit count.
      </p>
    </div>
  );
}
export function comparisonRows(report: ComparisonReport) {
  return report.units.flatMap((u) =>
    u.runs.flatMap((r) =>
      r.metrics.values.map((m) => ({
        comparisonSnapshotId: report.snapshotId,
        comparisonDigest: report.digest,
        experimentSnapshotDigest: report.snapshotDigest,
        unitId: u.id,
        worldId: u.worldId,
        arm: u.arm,
        runId: r.runId,
        runSnapshotId: r.snapshotId,
        metricPublicationId: r.metricId,
        metricId: m.id,
        metricVersion: m.version,
        unit: m.unit,
        value: m.value,
        numerator: m.numerator,
        denominator: m.denominator,
        population: m.population,
        window: m.window,
        timeBasis: m.timeBasis,
        coverage: m.coverage,
        sourceRefs: m.sourceRefs,
        evaluatorDigest: m.evaluatorDigest,
        exclusions: m.exclusions,
      })),
    ),
  );
}
export function csv(rows: Record<string, unknown>[]) {
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) => {
    let text = v === null || v === undefined ? "null" : typeof v === "object" ? JSON.stringify(v) : String(v);
    // biome-ignore lint/suspicious/noControlCharactersInRegex: strip-leading controls are part of the CSV formula-injection threat model.
    if (typeof v === "string" && /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [headers.map(cell).join(","), ...rows.map((r) => headers.map((h) => cell(r[h])).join(","))].join("\r\n");
}
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ResearchComparison({ experimentSnapshotId }: { experimentSnapshotId: string }) {
  const [report, setReport] = useState<ComparisonReport | null>(null),
    [error, setError] = useState(""),
    [metric, setMetric] = useState(""),
    [cost, setCost] = useState("calls.v1"),
    [busy, setBusy] = useState(false),
    root = useRef<HTMLElement>(null),
    api = useRef<ResearchAPI>(null),
    generation = useRef(0);
  const clear = useCallback(() => {
    generation.current++;
    setReport(null);
    setError("Private comparison unavailable: authorization or retention changed.");
  }, []);
  if (!api.current) api.current = new ResearchAPI(clear);
  useEffect(() => {
    let active = true;
    setReport(null);
    void api
      .current!.comparison(experimentSnapshotId)
      .then((r) => {
        if (active) {
          setReport(r);
          setMetric(r.spec.primaryMetric);
        }
      })
      .catch(() => {
        if (active) setError("Comparison unavailable.");
      });
    const check = () => {
      void api.current!.comparison(experimentSnapshotId).catch(clear);
    };
    const timer = setInterval(check, 15000);
    window.addEventListener("focus", check);
    window.addEventListener("pagehide", clear);
    window.addEventListener("fleet:logout", clear);
    return () => {
      active = false;
      generation.current++;
      clearInterval(timer);
      api.current!.dispose();
      window.removeEventListener("focus", check);
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("fleet:logout", clear);
    };
  }, [experimentSnapshotId, clear]);
  const metricIds = [
      ...new Set(report?.units.flatMap((u) => u.runs.flatMap((r) => r.metrics.values.map((m) => m.id))) ?? []),
    ],
    rows = report ? comparisonRows(report) : [],
    view = report ? comparisonView(report) : null;
  const points =
    report?.paretoCoordinates
      .filter((p) => typeof p.coordinates[metric] === "number" && typeof p.coordinates[cost] === "number")
      .map((p) => ({ name: p.unitId, value: [p.coordinates[cost], p.coordinates[metric]] })) ?? [];
  const option = useMemo(
    () => ({
      tooltip: { renderMode: "richText" },
      grid: { left: 65, right: 25, bottom: 65, top: 35 },
      xAxis: { type: "value", name: cost, nameLocation: "middle", nameGap: 35, axisLabel: { color: "#aebbd0" } },
      yAxis: { type: "value", name: metric, axisLabel: { color: "#aebbd0" } },
      series: [{ type: "scatter", data: points, symbolSize: 14, itemStyle: { color: "#9edcff" } }],
    }),
    [metric, cost, points],
  );
  const authorize = async () => {
    const current = await api.current!.comparison(experimentSnapshotId);
    if (!report || current.digest !== report.digest) throw Error("SNAPSHOT_CHANGED");
    return current;
  };
  const exportView = async (format: "csv" | "json") => {
    setBusy(true);
    try {
      const current = await authorize();
      const data = comparisonRows(current);
      saveBlob(
        new Blob(
          [
            format === "csv"
              ? csv([
                  {
                    recordType: "comparison-summary",
                    comparisonSnapshotId: current.snapshotId,
                    filters: { metric, cost },
                    coverage: current.flags,
                    missingRuns: current.missingRuns,
                  },
                  ...data.map((row) => ({ ...row, viewFilters: { metric, cost } })),
                ])
              : JSON.stringify(
                  {
                    version: "fleet.view-export/v1",
                    filters: { metric, cost },
                    coverage: current.flags,
                    missingRuns: current.missingRuns,
                    rows: data,
                  },
                  null,
                  2,
                ),
          ],
          { type: format === "csv" ? "text/csv;charset=utf-8" : "application/json" },
        ),
        `comparison-${current.snapshotId}.${format}`,
      );
    } catch {
      clear();
    } finally {
      setBusy(false);
    }
  };
  const exportPlot = async (format: "svg" | "png") => {
    const requestGeneration = generation.current;
    setBusy(true);
    try {
      const current = await authorize(),
        svg = root.current?.querySelector(".research-chart svg")?.cloneNode(true) as SVGSVGElement | undefined;
      if (!svg) throw Error("PLOT_UNAVAILABLE");
      const metadata = document.createElementNS("http://www.w3.org/2000/svg", "metadata");
      metadata.textContent = JSON.stringify({
        snapshotId: current.snapshotId,
        digest: current.digest,
        filters: { metric, cost },
        flags: current.flags,
        rows: comparisonRows(current),
      });
      const width = Number(svg.getAttribute("width")) || 1000,
        height = Number(svg.getAttribute("height")) || 280;
      const lines = [
        `Snapshot ${current.snapshotId}`,
        `Axes ${cost} / ${metric}`,
        `Coverage ${current.flags.join(", ") || "No quality flags"}`,
      ].flatMap((line) => line.match(new RegExp(`.{1,${Math.max(25, Math.floor(width / 7))}}`, "g")) ?? []);
      svg.setAttribute("height", String(height + lines.length * 14 + 20));
      const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      background.setAttribute("width", String(width));
      background.setAttribute("height", svg.getAttribute("height")!);
      background.setAttribute("fill", "#0a1220");
      svg.insertBefore(background, svg.firstChild);
      lines.forEach((line, index) => {
        const footer = document.createElementNS("http://www.w3.org/2000/svg", "text");
        footer.setAttribute("x", "10");
        footer.setAttribute("y", String(height + 18 + index * 14));
        footer.setAttribute("fill", "#e8edf7");
        footer.setAttribute("font-size", "10");
        footer.textContent = line;
        svg.append(footer);
      });
      svg.append(metadata);
      const text = new XMLSerializer().serializeToString(svg);
      if (format === "svg")
        saveBlob(new Blob([text], { type: "image/svg+xml" }), `comparison-${current.snapshotId}.svg`);
      else {
        const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
        try {
          const image = new Image();
          image.src = url;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = Number(svg.getAttribute("width")) || 1000;
          canvas.height = Number(svg.getAttribute("height")) || 350;
          canvas.getContext("2d")!.drawImage(image, 0, 0);
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob((b) => (b ? resolve(b) : reject(Error("EXPORT_FAILED"))), "image/png"),
          );
          if (generation.current === requestGeneration && report)
            saveBlob(blob, `comparison-${current.snapshotId}.png`);
        } finally {
          URL.revokeObjectURL(url);
        }
      }
    } catch {
      setError("Plot export unavailable.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="research-studio" ref={root}>
      <a href="#research">Research studio</a>
      <h1>Experiment comparison</h1>
      {error && <p role="alert">{error}</p>}
      {!report && !error && <p role="status">Loading authorized comparison…</p>}
      {report && view && (
        <>
          <p>
            Snapshot {report.snapshotId} · source {report.snapshotDigest} · method{" "}
            {report.intervals[0]?.method ?? "unavailable"}
          </p>
          <h2>Predeclared design</h2>
          <p>
            Primary metric {report.spec.primaryMetric} · practical margin {report.spec.margin} · baseline{" "}
            {report.baseline} · assignment {report.spec.assignmentUnit} · seed {report.spec.seed}
          </p>
          <p>
            Window [{report.spec.window.start}, {report.spec.window.end}) · horizon {report.spec.horizonMs}ms ·{" "}
            {report.spec.stoppingRule} · {report.spec.missingness}
          </p>
          <pre>
            {JSON.stringify(
              {
                datasets: report.spec.splitDigests,
                budgets: report.spec.units.map((u) => ({ id: u.id, limits: u.limits })),
                evaluator: report.spec.evaluator ?? "catalog/native measurement",
              },
              null,
              2,
            )}
          </pre>
          <p className="research-warning">
            {view.descriptive ? "Descriptive comparison only" : "Eligible intervals are estimates, not proof of power"}.
            No automatic winner or promotion.
          </p>
          {view.reasons.map((r) => (
            <p key={r} className="research-warning">
              {r}
            </p>
          ))}
          <p>Missing runs: {report.missingRuns.join(", ") || "none declared missing"}</p>
          <button type="button" disabled>
            Rank candidates
          </button>
          <ResearchTable
            caption="Independent units and interval eligibility"
            headers={["Metric / candidate", "Independent units", "Estimate / interval", "Method / reason"]}
            rows={report.intervals.map((i) => ({
              id: `${i.candidate}:${i.metricId}`,
              cells: [
                `${i.metricId} / ${i.candidate}`,
                i.independentUnits,
                `${i.estimate ?? "unavailable"} / ${report.flags.length || i.reason || i.lower === null || i.upper === null ? "unavailable" : `[${i.lower}, ${i.upper}]`}`,
                `${i.method} / ${i.reason ?? "eligible"}; ${i.resamples} resamples, seed ${i.seed}`,
              ],
            }))}
          />
          <div className="research-actions">
            <label>
              Outcome metric
              <select value={metric} onChange={(e) => setMetric(e.target.value)}>
                {metricIds.map((id) => (
                  <option key={id}>{id}</option>
                ))}
              </select>
            </label>
            <label>
              Resource / latency axis
              <select value={cost} onChange={(e) => setCost(e.target.value)}>
                {metricIds.map((id) => (
                  <option key={id}>{id}</option>
                ))}
              </select>
            </label>
          </div>
          <ResearchChart label="Descriptive outcome versus resource coordinates" option={option} />
          <ComparisonDetailPlots report={report} metric={metric} />
          <p>
            Only fully measured coordinates appear. Missing/unknown axes remain in the table. Unit distributions are
            descriptive; plot position does not rank candidates.
          </p>
          <ResearchTable
            caption="Condition differences and missingness"
            headers={["Unit / world", "Manifest differences", "Missing runs / flags"]}
            rows={report.units.map((u) => ({
              id: u.id,
              cells: [
                `${u.id} / ${u.worldId}`,
                JSON.stringify(report.manifestDiffs.filter((d) => d.unitId === u.id)),
                `${u.missingRuns.join(", ")} / ${u.flags.join(", ")}`,
              ],
            }))}
          />
          <ResearchTable
            caption="Metric observations and source drilldown"
            headers={["Unit / metric", "Value / denominator", "Coverage / window", "Evidence"]}
            rows={rows.map((r) => ({
              id: `${r.unitId}:${r.runId}:${r.metricId}`,
              cells: [
                `${r.unitId} / ${r.metricId}`,
                `${r.value ?? "unavailable"} / ${r.denominator ?? "null"}`,
                `${r.coverage.status} / [${r.window.start},${r.window.end})`,
                <a key={`${r.unitId}:${r.runId}:${r.metricId}`} href={runLink(r.runId, r.sourceRefs[0])}>
                  Inspect run {r.runId} / snapshot {r.runSnapshotId}
                </a>,
              ],
            }))}
          />
          <h2>Explicit exports</h2>
          <p>
            Decrypted view exports use your browser's private download destination and include snapshot, filter and
            coverage provenance. Full encrypted evidence remains a separate run archive.
          </p>
          <div className="research-actions">
            {(["csv", "json"] as const).map((f) => (
              <button key={f} type="button" disabled={busy} onClick={() => void exportView(f)}>
                Export view {f.toUpperCase()}
              </button>
            ))}
            {(["svg", "png"] as const).map((f) => (
              <button key={f} type="button" disabled={busy} onClick={() => void exportPlot(f)}>
                Export plot {f.toUpperCase()}
              </button>
            ))}
          </div>
          {report.units
            .flatMap((u) => u.runs.map((r) => ({ ...r, unitId: u.id })))
            .map((r) => (
              <p key={`${r.unitId}:${r.runId}`}>
                <a href={runLink(r.runId)}>Open run {r.runId} for its complete encrypted archive</a>
              </p>
            ))}
        </>
      )}
    </main>
  );
}
