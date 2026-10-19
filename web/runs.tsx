import { useEffect, useState } from "react";
import type { evidenceChain } from "../src/platform/evidence.js";
import { type RecordedTurn, readable } from "./observe.js";
import { explainStep, StepExplanation } from "./run-steps.js";

type RunData = {
  turn: RecordedTurn & { deadline_at?: string; unknown_usage?: boolean };
  agent: { id: string; name: string };
  executions: Record<string, unknown>[];
  engine?: unknown;
  platform?: {
    taskId: string;
    profile: { id: string; version: string };
    environment: { id: string; version: string; instanceId: string };
    trigger: unknown;
  };
  evidence?: ReturnType<typeof evidenceChain>;
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
  const selected = events.filter((e, index) => {
    const view = explainStep(e, events, index);
    return (
      (!stage || e.stage === stage) &&
      `${e.label} ${e.stage} ${view.explanation} ${view.outcome} ${JSON.stringify(e.detail)}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  });
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
      <section className="run-provenance">
        <h3>Engine, environment and task</h3>
        {data.platform ? (
          <>
            <p>
              {data.platform.profile.id}@{data.platform.profile.version} · {data.platform.environment.id}@
              {data.platform.environment.version}
            </p>
            <p>
              Task <code>{data.platform.taskId}</code>
            </p>
            <Json title="Trigger references and environment" value={data.platform} />
          </>
        ) : (
          <p>Historical task/environment references unavailable.</p>
        )}
        <Json title="Engine provenance" value={data.engine ?? { coverage: "No retained manifest" }} />
        {data.evidence && (
          <>
            <p>{data.evidence.coverage}</p>
            <div>
              {data.evidence.stages.map((s) => (
                <a className="evidence-link" key={s.eventId} href={`#step-${s.eventId}`}>
                  {s.label}
                </a>
              ))}
            </div>
            {!!data.evidence.predictions?.length && (
              <div>
                <h4>Predictions and observed evidence</h4>
                {data.evidence.predictions.map((p) => (
                  <p key={`${p.predictionId}:${p.eventId}`}>
                    <a href={`#step-${p.eventId}`}>{p.predictionId}</a>: expected {String(p.expected)}, observed{" "}
                    {String(p.observed ?? "unavailable")} · {String(p.status)} · evidence{" "}
                    {String(p.outcomeRef ?? "unresolved")}
                  </p>
                ))}
              </div>
            )}
            {!!data.evidence.commands?.length && (
              <div>
                <h4>Proposal through command result</h4>
                {data.evidence.commands.map((c) => (
                  <p key={`${c.commandId}:${c.proposalEventId}`}>
                    <a href={`#step-${c.proposalEventId}`}>{String(c.expectedOutcome)}</a> →{" "}
                    {c.resultEventId ? (
                      <a href={`#step-${c.resultEventId}`}>{String(c.status)} command</a>
                    ) : (
                      "Result unavailable"
                    )}
                    . Material fulfilment unmeasured here.
                  </p>
                ))}
              </div>
            )}
            <Json title="Exact evidence links" value={data.evidence} />
          </>
        )}
      </section>
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
            <li key={e.id} id={`step-${e.id}`}>
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
                {seconds(Date.parse(e.at) - Date.parse(previous?.at ?? t.started_at))} gap since previous event (not
                step duration)
              </p>
              {typeof e.detail?.execution === "number" && <p>Model execution {e.detail.execution}</p>}
              {typeof e.detail?.elapsedMs === "number" && (
                <p>Measured operation duration: {seconds(e.detail.elapsedMs)}</p>
              )}
              <StepExplanation
                event={e}
                events={events}
                index={index}
                showStep={(id) => {
                  setSearch("");
                  setStage("");
                  requestAnimationFrame(() =>
                    document.getElementById(`step-${id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }),
                  );
                }}
              />
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
