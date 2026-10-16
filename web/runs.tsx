import { useEffect, useState } from "react";
import { type RecordedTurn, readable } from "./observe.js";

type RunData = {
  turn: RecordedTurn & { deadline_at?: string; unknown_usage?: boolean };
  agent: { id: string; name: string };
  executions: Record<string, unknown>[];
  coverage: string;
};
const instant = (at?: string | null) =>
  at
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Berlin",
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        fractionalSecondDigits: 3,
        timeZoneName: "short",
      }).format(new Date(at))
    : "Not recorded";
const payloadTitles: Record<string, string> = {
  messages: "Model input messages",
  outputSchema: "Expected output schema",
  decision: "Parsed model output",
  outputText: "Final answer text",
  result: "Response body",
  input: "System input",
  output: "System output",
  update: "Accepted cognition update",
  state: "Recorded state",
  facts: "Observed facts",
  candidates: "Recall candidates",
  action: "Game action",
  receipt: "Command receipt",
};
const seconds = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(3)} s`;
function Json({ title, value }: { title: string; value: unknown }) {
  return (
    <details className="step-data">
      <summary>{title}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
export function RunReport({ data }: { data: RunData }) {
  const [search, setSearch] = useState(""),
    [stage, setStage] = useState("");
  const t = data.turn,
    events = t.events ?? [];
  const selected = events.filter(
    (e) =>
      (!stage || e.stage === stage) &&
      `${e.label} ${e.stage} ${JSON.stringify(e.detail)}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">RUN DEBUGGING</p>
          <h2>
            {data.agent.name} · {readable(t.code ?? t.state)}
          </h2>
          <p>{t.summary ?? "Run in progress"}</p>
          <code className="run-id">{t.id}</code>
        </div>
        <button
          type="button"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = `fleet-run-${t.id}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Download run JSON
        </button>
      </div>
      <dl className="run-facts">
        <div>
          <dt>Started</dt>
          <dd>{instant(t.started_at)}</dd>
        </div>
        <div>
          <dt>Finished</dt>
          <dd>{t.finished_at ? instant(t.finished_at) : "In progress"}</dd>
        </div>
        <div>
          <dt>Total duration</dt>
          <dd>{t.finished_at ? seconds(Date.parse(t.finished_at) - Date.parse(t.started_at)) : "In progress"}</dd>
        </div>
        <div>
          <dt>Scheduled / queue delay</dt>
          <dd>
            {instant(t.due_at)}
            {t.due_at && ` · ${seconds(Date.parse(t.started_at) - Date.parse(t.due_at))}`}
          </dd>
        </div>
        <div>
          <dt>Deadline</dt>
          <dd>{instant(t.deadline_at)}</dd>
        </div>
        <div>
          <dt>Model calls / committed actions</dt>
          <dd>
            {t.calls} / {t.actions}
          </dd>
        </div>
        <div>
          <dt>Reported input / output tokens</dt>
          <dd>
            {t.input_tokens ?? "0"} / {t.output_tokens ?? "0"}
          </dd>
        </div>
        <div>
          <dt>Unknown usage</dt>
          <dd>{t.unknown_usage ? "Yes — original allocation retained" : "No"}</dd>
        </div>
      </dl>
      <p className="trace-coverage">{data.coverage}</p>
      <div className="run-filters">
        <label>
          Search steps and payloads
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Model, recall, tool, error…"
          />
        </label>
        <label>
          Stage
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">All stages</option>
            {[...new Set(events.map((e) => e.stage))].map((s) => (
              <option key={s} value={s}>
                {readable(s)}
              </option>
            ))}
          </select>
        </label>
        <span>
          {selected.length} / {events.length} steps
        </span>
      </div>
      {!events.length && (
        <p className="small-empty">
          No detailed steps retained for this run. Historical inputs and outputs cannot be reconstructed.
        </p>
      )}
      {!!events.length && !selected.length && <p className="small-empty">No steps match these filters.</p>}
      <ol className="step-timeline run-timeline">
        {selected.map((e) => {
          const index = events.indexOf(e),
            previous = events[index - 1];
          return (
            <li key={e.id}>
              <span className="step-dot" />
              <div className="step-header">
                <strong>
                  {index + 1}. {e.label.replace(/^Debug: /, "")}
                </strong>
                <span className="tool-tag">{readable(e.stage)}</span>
              </div>
              <p className="run-timing">
                <time dateTime={e.at} title={e.at}>
                  {instant(e.at)}
                </time>{" "}
                · +{seconds(Date.parse(e.at) - Date.parse(t.started_at))} from start ·{" "}
                {seconds(Date.parse(e.at) - Date.parse(previous?.at ?? t.started_at))} since previous event
              </p>
              {e.detail ? (
                <>
                  {typeof e.detail.execution === "number" && <p>Model execution {e.detail.execution}</p>}
                  {typeof e.detail.elapsedMs === "number" && <p>Operation duration: {seconds(e.detail.elapsedMs)}</p>}
                  {typeof e.detail.tool === "string" && (
                    <p>
                      <b>Tool:</b> {e.detail.tool}
                    </p>
                  )}
                  {typeof e.detail.code === "string" && (
                    <p>
                      <b>Result:</b> {e.detail.code}
                    </p>
                  )}
                  {typeof e.detail.summary === "string" && <p>{e.detail.summary}</p>}
                  {e.detail.omitted === true && (
                    <p className="error">Payload omitted: {String(e.detail.bytes)} bytes exceeded the capture limit.</p>
                  )}
                  {Object.entries(e.detail)
                    .filter(
                      ([key, value]) =>
                        value !== null &&
                        [
                          "messages",
                          "outputSchema",
                          "decision",
                          "outputText",
                          "result",
                          "input",
                          "output",
                          "update",
                          "state",
                          "facts",
                          "candidates",
                          "action",
                          "receipt",
                        ].includes(key),
                    )
                    .map(([key, value]) => (
                      <Json key={key} title={payloadTitles[key] ?? readable(key)} value={value} />
                    ))}
                  <Json title="All recorded fields · raw JSON" value={e.detail} />
                </>
              ) : (
                <p className="muted">Private details were not captured, have expired, or observation consent is off.</p>
              )}
            </li>
          );
        })}
      </ol>
      <h3>Execution accounting</h3>
      <p>Allocations and reported usage are separate. Unknown usage remains unknown.</p>
      {data.executions.length ? (
        data.executions.map((e) => (
          <Json
            key={String(e.id)}
            title={`${instant(String(e.created_at))} · ${readable(String(e.status))} · allocation ${e.allocated_tokens}`}
            value={e}
          />
        ))
      ) : (
        <p>No model execution records.</p>
      )}
      {t.pending_command && (
        <>
          <h3>Pending command</h3>
          <code>{t.pending_command}</code>
          <Json title="Recorded pending action" value={t.pending_action} />
        </>
      )}
      {!!t.resolutions?.length && <Json title="Archived command outcomes and reviews" value={t.resolutions} />}
      <Json title="Complete run report" value={data} />
    </>
  );
}
export function RunDetails({
  id,
  api,
  back,
  inspect,
}: {
  id: string;
  api: <T>(path: string) => Promise<T>;
  back: () => void;
  inspect: (id: string) => void;
}) {
  const [data, setData] = useState<RunData | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false,
      inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await api<RunData>(`/turns/${id}`);
        if (!cancelled) {
          setData(next);
          setError("");
        }
      } catch (e) {
        if (!cancelled) {
          setData(null);
          setError(e instanceof Error ? e.message : "Could not load run");
        }
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id, api]);
  return (
    <section className="panel run-report">
      <div className="run-navigation">
        <button type="button" onClick={back}>
          ← All runs
        </button>
        {data && (
          <button type="button" onClick={() => inspect(data.agent.id)}>
            Inspect agent
          </button>
        )}
        <span className="muted">Refreshes every 5 seconds · times in Europe/Berlin</span>
      </div>
      {error && (
        <p className="error" role="alert">
          {readable(error)}
        </p>
      )}
      {data ? <RunReport data={data} /> : !error && <p>Loading run…</p>}
    </section>
  );
}
