import { useEffect, useState } from "react";
import type { FleetMetrics } from "../src/call-metrics.js";
export type MetricsData = Awaited<ReturnType<FleetMetrics["read"]>>;
const fmt = (n: number | null) =>
  n === null ? "Not recorded" : new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(n);
const time = (s: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(
    new Date(s),
  );
function Trend({ data }: { data: MetricsData }) {
  const points = data.series,
    max = Math.max(1, ...points.flatMap((p) => [p.calls, p.actions]));
  const line = (key: "calls" | "actions") =>
    points.map((p, i) => `${40 + (i * 600) / Math.max(1, points.length - 1)},${175 - (p[key] / max) * 145}`).join(" ");
  return (
    <figure className="metric-card">
      <figcaption>
        <h3>Calls & confirmed actions</h3>
        <p>Counts per time bucket · Berlin time</p>
      </figcaption>
      <svg viewBox="0 0 680 210" role="img" aria-label="Model calls and confirmed actions over time">
        <title>Calls and actions over time</title>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1="40" x2="640" y1={175 - f * 145} y2={175 - f * 145} className="metric-grid" />
            <text x="2" y={180 - f * 145}>
              {fmt(max * f)}
            </text>
          </g>
        ))}
        <polyline points={line("calls")} className="metric-line calls" />
        <polyline points={line("actions")} className="metric-line actions" />
        {points.length > 0 && (
          <>
            <text x="40" y="202">
              {time(points[0].at)}
            </text>
            <text x="600" y="202">
              {time(points.at(-1)!.at)}
            </text>
          </>
        )}
      </svg>
      <div className="metric-legend">
        <span className="calls">● Model calls</span>
        <span className="actions">● Confirmed actions</span>
      </div>
    </figure>
  );
}
function CallChart({ data, kind }: { data: MetricsData; kind: "context" | "output" }) {
  const calls = [...data.calls].reverse(),
    field = kind === "context" ? "contextPercent" : "outputPercent",
    known = calls.filter((c) => c[field] !== null),
    max = Math.max(100, ...known.map((c) => Number(c[field]))),
    title = kind === "context" ? "Context usage" : "Output allowance used";
  return (
    <figure className="metric-card">
      <figcaption>
        <h3>{title}</h3>
        <p>
          {kind === "context"
            ? "Reported input tokens ÷ provider context window"
            : "Reported output tokens ÷ call output allowance"}
        </p>
      </figcaption>
      <svg viewBox="0 0 680 210" role="img" aria-label={`${title} for each recorded call`}>
        <title>{title} per call; newer calls on the right</title>
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1="40" x2="640" y1={175 - (v / max) * 145} y2={175 - (v / max) * 145} className="metric-grid" />
            <text x="2" y={180 - (v / max) * 145}>
              {v}%
            </text>
          </g>
        ))}
        {calls.map((c, i) =>
          c[field] === null ? null : (
            <circle
              key={c.id}
              cx={40 + (i * 600) / Math.max(1, calls.length - 1)}
              cy={175 - (Number(c[field]) / max) * 145}
              r="4"
              className={c.error ? "metric-dot error" : "metric-dot"}
            >
              <title>
                {c.cohort} · {time(c.at)} · {fmt(c[field])}% ·{" "}
                {c.thinking === true ? "Thinking on" : c.thinking === false ? "Thinking off" : "Mode not recorded"}
                {c.error ? ` · ${c.error}` : ""}
              </title>
            </circle>
          ),
        )}
        <text x="40" y="202">
          Older calls
        </text>
        <text x="570" y="202">
          Newer calls
        </text>
      </svg>
      <p>
        {known.length} measured · {calls.length - known.length} not recorded.{" "}
        {kind === "context"
          ? "Output space is reserved separately before dispatch."
          : "Thinking and final-answer output share this allowance. Red marks output errors."}
      </p>
    </figure>
  );
}
export function MetricsCharts({ data }: { data: MetricsData }) {
  const max = Math.max(1, ...data.architectures.flatMap((a) => [a.calls, a.actions])),
    thinking = data.calls.filter((c) => c.thinking === true).length;
  return (
    <>
      <div className="stats metrics-stats">
        {[
          ["Model calls", data.totals.calls],
          ["Confirmed actions", data.totals.actions],
          ["Turns without effects", data.totals.no_action_turns],
          ["Reported input tokens", data.totals.inputTokens],
          ["Reported output tokens", data.totals.outputTokens],
          ["Unknown / in flight", `${data.totals.unknownCalls} / ${data.totals.reservedCalls}`],
        ].map(([label, value]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>{typeof value === "number" ? fmt(value) : value}</strong>
          </div>
        ))}
      </div>
      {data.totals.calls === 0 && (
        <p className="quiet-banner">No calls in this period. Choose a longer time range or another fleet.</p>
      )}
      <div className="metric-grid-layout">
        <Trend data={data} />
        <CallChart data={data} kind="context" />
        <CallChart data={data} kind="output" />
        <section className="metric-card">
          <h3>By architecture</h3>
          <p>Model calls and confirmed effects, not narrated intentions.</p>
          {data.architectures
            .filter((a) => a.calls || a.actions)
            .map((a) => (
              <div className="metric-architecture" key={a.architecture}>
                <strong>{a.architecture}</strong>
                <svg viewBox="0 0 100 7" role="img" aria-label={`${a.calls} model calls`}>
                  <title>Model calls</title>
                  <rect className="metric-fill calls" width={(a.calls / max) * 100} height="7" rx="2" />
                </svg>
                <span>{fmt(a.calls)} calls</span>
                <svg viewBox="0 0 100 7" role="img" aria-label={`${a.actions} confirmed actions`}>
                  <title>Confirmed actions</title>
                  <rect className="metric-fill actions" width={(a.actions / max) * 100} height="7" rx="2" />
                </svg>
                <span>{fmt(a.actions)} actions</span>
              </div>
            ))}
        </section>
      </div>
      <section className="metric-card">
        <h3>Research coverage</h3>
        <div className="metric-outcomes">
          {[
            ["Distinct tasks", data.research.distinctTasksAttempted],
            ["Task attempts", data.research.taskAttempts],
            ["Repeated task attempts", data.research.repeatedTaskAttempts],
            ["Legacy attempts", data.research.legacyAttempts],
            ["Attempts with effects", data.research.attemptsWithEffects],
            ["Waits without effects", data.research.waitsWithoutEffects],
            ["Recorded truncations", data.research.truncatedCalls],
            ["Correction calls", data.research.correctionCalls],
            ["Empty final answers", data.research.emptyFinalCalls],
            ["Late usage observations", data.research.lateUsage.observations],
          ].map(([label, n]) => (
            <span key={label}>
              {label} <strong>{fmt(Number(n))}</strong>
            </span>
          ))}
        </div>
        <p>
          {data.research.responseMetadataCalls} calls have response metadata. {data.research.finishReasonCalls} calls
          report a finish reason; {data.research.reasoningMetadataCalls} report reasoning metadata. Strategy quality and
          reciprocal cooperation are not inferred from these counts.
        </p>
        <p className="muted">{data.research.coverage}</p>
        <h4>Observed communication</h4>
        <p>
          {data.research.reciprocalCommunication.messages} distinct messages ·{" "}
          {data.research.reciprocalCommunication.pairs} pairs · {data.research.reciprocalCommunication.reciprocal_pairs}{" "}
          pairs with messages in both directions. These counts cover retained observations, not the whole world;
          reciprocity does not prove cooperation.
        </p>
        <h4>Current availability</h4>
        <div className="metric-outcomes">
          {data.research.availability.map((a) => (
            <span key={`${a.cohort_state}:${a.agent_state}:${a.credential_state}`}>
              {a.cohort_state} / {a.agent_state} / {a.credential_state}: <strong>{fmt(a.agents)}</strong>
            </span>
          ))}
        </div>
      </section>
      <section className="metric-card">
        <h3>Turn outcomes</h3>
        <p>
          WAIT is a runtime code and can include an action. Turns without effects above include waits and rejected
          attempts.
        </p>
        <div className="metric-outcomes">
          {data.outcomes.map((o) => (
            <span key={o.code}>
              {o.code} <strong>{fmt(o.n)}</strong>
            </span>
          ))}
        </div>
      </section>
      <section className="metric-card">
        <h3>Recorded command outcomes</h3>
        <p>
          Receipts from the platform execution path. Older engine attempts are covered by turn outcomes and run details.
        </p>
        <div className="metric-outcomes">
          {data.commandOutcomes.map((o) => (
            <span key={`${o.state}:${o.code}`}>
              {o.code} <strong>{fmt(o.n)}</strong>
            </span>
          ))}
        </div>
      </section>
      <section className="metric-card">
        <h3>Individual calls</h3>
        <p>
          Latest {data.calls.length} calls · {thinking} recorded with thinking on. Hover chart points for details.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "Time",
                  "Fleet",
                  "State",
                  "Thinking",
                  "Input / context",
                  "Context fill",
                  "Output / allowance",
                  "Output fill",
                  "End-to-end",
                  "Queue / generation",
                  "Request bytes / limit",
                  "Schema bytes",
                  "Final text chars",
                  "Inbox delivered / omitted",
                  "Result",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.calls.map((c) => (
                <tr key={c.id}>
                  <td>{time(c.at)}</td>
                  <td>{c.cohort}</td>
                  <td>{c.status}</td>
                  <td>{c.thinking === null ? "Not recorded" : c.thinking ? "On" : "Off"}</td>
                  <td>
                    {fmt(c.inputTokens)} / {fmt(c.contextWindowTokens)}
                  </td>
                  <td>{c.contextPercent === null ? "Not recorded" : `${fmt(c.contextPercent)}%`}</td>
                  <td>
                    {fmt(c.outputTokens)} / {fmt(c.maxOutputTokens)}
                  </td>
                  <td>{c.outputPercent === null ? "Not recorded" : `${fmt(c.outputPercent)}%`}</td>
                  <td>{c.endToEndMs === null ? "Not recorded" : `${fmt(c.endToEndMs / 1000)}s`}</td>
                  <td>
                    {fmt(c.queueDelayMs === null ? null : c.queueDelayMs / 1000)} /{" "}
                    {fmt(c.generationMs === null ? null : c.generationMs / 1000)} s
                  </td>
                  <td>
                    {fmt(c.requestBytes)} / {fmt(c.inputLimitBytes)} ({fmt(c.inputBytePercent)}%)
                  </td>
                  <td>{fmt(c.schemaBytes)}</td>
                  <td>{fmt(c.finalTextChars)}</td>
                  <td>
                    {fmt(c.inboxDelivered)} / {fmt(c.inboxOmitted)}
                  </td>
                  <td>{c.error ?? c.finishReason ?? "Not recorded"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">{data.coverage.scope}</p>
      </section>
    </>
  );
}
export function MetricsWorkspace({
  api,
  cohorts,
}: {
  api: <T>(path: string) => Promise<T>;
  cohorts: { id: string; name: string }[];
}) {
  const [minutes, setMinutes] = useState(60),
    [scope, setScope] = useState(""),
    [data, setData] = useState<MetricsData | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const next = await api<MetricsData>(
          `/metrics?minutes=${minutes}${scope ? `&cohortId=${encodeURIComponent(scope)}` : ""}`,
        );
        if (alive) {
          setData(next);
          setError("");
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Unable to load metrics");
      }
    };
    setData(null);
    void load();
    const id = setInterval(() => void load(), 10000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [api, minutes, scope]);
  return (
    <div className="metrics-workspace">
      <div className="section-heading">
        <div>
          <h2>Fleet metrics</h2>
          <p>Measured calls, context and game effects. Refreshes every 10 seconds.</p>
        </div>
        <div className="metric-filters">
          <label>
            Scope
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="">All fleets</option>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Period
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {[
                [15, "15 minutes"],
                [60, "1 hour"],
                [360, "6 hours"],
                [1440, "24 hours"],
              ].map(([n, label]) => (
                <option key={n} value={n}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {error && (
        <p role="alert">
          Metrics unavailable: {error}. {data ? "Last successful values are retained." : "Retrying automatically."}
        </p>
      )}
      {data ? (
        <>
          <p className="muted">Updated {time(data.asOf)} Berlin</p>
          <MetricsCharts data={data} />
        </>
      ) : (
        <p>{error ? "No metrics available yet." : "Loading metrics…"}</p>
      )}
    </div>
  );
}
