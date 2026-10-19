import { useEffect, useRef, useState } from "react";

export type ObservedAgent = {
  id: string;
  cohort_id: string;
  name: string;
  ordinal: number;
  account_id: string | null;
  kingdom_id: string | null;
  state: string;
  credential_state: string;
  next_due_at: string | null;
  last_turn_at: string | null;
  reason: string | null;
  strategy: { profile: string; objective: string; riskTolerance: number; patience: number; horizon: string };
  total_turns?: number;
  committed_actions?: number;
  latest_summary?: string | null;
  latest_state?: string | null;
  latest_code?: string | null;
  current_stage?: string | null;
  current_label?: string | null;
  game_attention_label?: string | null;
};
type CohortView = {
  engine_profile?: { id: string; version: string } | null;
  owner_guidance?: "strategy" | "account_autonomy";
  ownerGuidance?: "strategy" | "account_autonomy";
  id: string;
  name: string;
  state: string;
  interval_minutes: number;
  observation_consent: boolean;
  model: {
    model: string;
    route: string;
    reasoningEffort?: string;
    thinking?: boolean;
    decisionPolicy?: string;
    cognition?: string;
    recallAssist?: string;
  } | null;
};
export type RecordedTurn = {
  id: string;
  agent_id: string;
  cohort_id: string;
  state: string;
  code: string | null;
  started_at: string;
  finished_at: string | null;
  due_at?: string;
  summary: string | null;
  calls: number;
  actions: number;
  pending_command: string | null;
  pending_action?: Record<string, unknown> | null;
  resolutions?: {
    commandId: string;
    at: string;
    code: string;
    source: string;
    action: Record<string, unknown> | null;
  }[];
  input_tokens?: string;
  output_tokens?: string;
  events?: Step[];
};
type Step = {
  id: string;
  sequence: string;
  at: string;
  stage: string;
  label: string;
  detail: Record<string, unknown> | null;
};
type Page = { turns: RecordedTurn[]; next: { beforeAt: string; beforeId: string } | null; coverage: string };
type Usage = {
  executions?: number;
  calls?: number;
  input_tokens: string;
  output_tokens: string;
  allocated_tokens: string;
  reserved_calls: number;
  unknown_calls: number;
};
type Inspection = Page & {
  cognition?: Record<string, unknown>;
  recovery?: { resumable: boolean; status: string; steps: { kind: string; instruction: string; turnId?: string }[] };
  agent: ObservedAgent;
  cohort: {
    state: string;
    model: CohortView["model"];
    observation: boolean;
    ownerGuidance?: "strategy" | "account_autonomy";
  };
  usage: Usage;
  notes: string | null;
  memory: {
    reads: { id: string; tool: string; observedAt: string | null }[];
    updatedAt: string | null;
    coverage: string;
  };
};
export type CohortStats = {
  cohort_id: string;
  turns: number;
  actions: string;
  running: number;
  pending: number;
  errors: number;
  read_only: number;
  waits: number;
};
type Api = <T>(path: string) => Promise<T>;
const number = (n: number | string | undefined) => new Intl.NumberFormat("en-GB").format(Number(n ?? 0));
const when = (s: string | null | undefined) =>
  s
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Berlin",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        day: "2-digit",
        month: "short",
      }).format(new Date(s))
    : "Not yet";
export const readable = (s: string) =>
  s
    .replace(/^pact_|^game\./, "")
    .replace(/_v\d+$/, "")
    .replaceAll("_", " ")
    .replaceAll(".", " ");
export function agentStatus(a: ObservedAgent, state: string) {
  if (!a.account_id) return "Not connected";
  if (state === "stopped" || state === "finished") return state === "stopped" ? "Stopped" : "Finished";
  if (a.state === "needs_owner" || a.credential_state !== "ready") return "Needs attention";
  if (
    a.latest_state !== "running" &&
    ([
      "CONTEXT_LIMIT",
      "READ_TOOL_FORBIDDEN",
      "INVALID_TOOL_ARGUMENTS",
      "INVALID_MODEL_OUTPUT",
      "MODEL_OUTPUT_TRUNCATED",
      "INVALID_GAME_ACTION",
      "OBSERVED_MANDATE_VERSION_MISMATCH",
    ].includes(a.latest_code ?? "") ||
      a.game_attention_label)
  )
    return "Needs attention";
  if (a.state === "paused") return "Paused";
  if (state !== "running") return state === "draft" ? "Ready to start" : "Fleet paused";
  if (a.latest_state === "running")
    return (
      (
        {
          thinking: "Thinking",
          reading: "Reading",
          acting: "Acting",
          observing: "Observing",
          ready: "Preparing",
          deciding: "Deciding",
          result: "Checking result",
        } as Record<string, string>
      )[a.current_stage ?? ""] ?? "Running"
    );
  if (a.next_due_at && Date.parse(a.next_due_at) <= Date.now()) return "Queued";
  return "Scheduled";
}
const tone = (s: string) =>
  ["Thinking", "Reading", "Acting", "Observing", "Preparing", "Deciding", "Running", "Checking result"].includes(s)
    ? "live"
    : s === "Needs attention"
      ? "warning"
      : "quiet";
export function Status({ agent, state }: { agent: ObservedAgent; state: string }) {
  const text = agentStatus(agent, state);
  return (
    <span className={`status-pill ${tone(text)}`}>
      <i />
      {text}
    </span>
  );
}
export function Overview({
  cohort,
  agents,
  turns,
  stats,
  inspect,
  history,
  society,
}: {
  cohort: CohortView;
  agents: ObservedAgent[];
  turns: RecordedTurn[];
  stats?: CohortStats;
  inspect: (id: string) => void;
  history: () => void;
  society: () => void;
}) {
  const active = agents.filter((a) => a.latest_state === "running"),
    attention = agents.filter((a) => agentStatus(a, cohort.state) === "Needs attention");
  const due = agents
    .filter((a) => a.state === "ready" && a.latest_state !== "running" && a.next_due_at)
    .sort((a, b) => Date.parse(a.next_due_at ?? "") - Date.parse(b.next_due_at ?? ""));
  return (
    <div className="overview-grid">
      <section className="panel operation-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LIVE OPERATIONS</p>
            <h2>{cohort.name}</h2>
          </div>
          <span className={`status-pill ${cohort.state === "running" ? "live" : "quiet"}`}>
            <i />
            {readable(cohort.state)}
          </span>
        </div>
        <p className="operation-lead">
          {cohort.state === "running"
            ? `${agents.length} agents, one shared world.`
            : "This fleet is not currently admitting turns."}
        </p>
        <p className="muted">
          {cohort.model?.model ?? "Choose a model"} · Every {cohort.interval_minutes} minutes · Staggered turns
          {cohort.model?.thinking !== undefined ? ` · Thinking ${cohort.model.thinking ? "on" : "off"}` : ""}
          {cohort.engine_profile
            ? ` · ${cohort.engine_profile.id}@${cohort.engine_profile.version}`
            : cohort.model?.cognition
              ? " · Memory, reflection & plans"
              : cohort.model?.decisionPolicy
                ? " · Legacy VW unused"
                : " · LLM only"}
        </p>
        <div className="operation-metrics">
          <div>
            <strong>{active.length}</strong>
            <span>working now</span>
          </div>
          <div>
            <strong>
              {
                agents.filter(
                  (a) => agentStatus(a, cohort.state) === "Scheduled" || agentStatus(a, cohort.state) === "Queued",
                ).length
              }
            </strong>
            <span>scheduled / queued</span>
          </div>
          <div>
            <strong>{attention.length}</strong>
            <span>need attention</span>
          </div>
        </div>
        <fieldset className="agent-map" aria-label="All agents at a glance">
          {agents.map((a) => (
            <button
              type="button"
              key={a.id}
              className={`agent-dot ${tone(agentStatus(a, cohort.state))}`}
              title={`${a.name} · ${agentStatus(a, cohort.state)}`}
              aria-label={`Inspect ${a.name}`}
              onClick={() => inspect(a.id)}
            >
              {String(a.ordinal + 1).padStart(2, "0")}
            </button>
          ))}
        </fieldset>
        <p className="muted">
          Select a numbered agent to inspect it. A scheduled agent may be idle while another takes its turn.
        </p>
      </section>
      <section className="panel now-panel">
        <p className="eyebrow">HAPPENING NOW</p>
        <h2>Inside the fleet</h2>
        {active.length ? (
          active.map((a) => (
            <button type="button" className="live-agent" key={a.id} onClick={() => inspect(a.id)}>
              <Status agent={a} state={cohort.state} />
              <strong>{a.name}</strong>
              <span>
                {a.current_label ?? "Turn in progress; detailed steps were not recorded by the earlier release."}
              </span>
              <small>Open agent inspector →</small>
            </button>
          ))
        ) : (
          <p className="small-empty">
            {cohort.state === "running"
              ? "Between turns. The next scheduled agent will appear here."
              : "No active turn."}
          </p>
        )}
        <div className="next-agent">
          <span>Next scheduled</span>
          <strong>{due[0]?.name ?? "No scheduled agent"}</strong>
          <small>{when(due[0]?.next_due_at)} Berlin</small>
        </div>
        {attention.length > 0 && (
          <div className="attention-box">
            <strong>{attention.length} agents need inspection</strong>
            {attention.slice(0, 3).map((a) => (
              <button type="button" key={a.id} onClick={() => inspect(a.id)}>
                {a.name} ·{" "}
                {a.game_attention_label
                  ? "Construction needs owner recovery"
                  : readable(a.reason ?? a.latest_code ?? "Check credentials")}
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="panel activity-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">RECENT ACTIVITY</p>
            <h2>What actually happened</h2>
          </div>
          <button type="button" onClick={history}>
            All turn history →
          </button>
        </div>
        <div className="outcome-strip">
          <span>{number(stats?.read_only)} read-only turns</span>
          <span>{number(stats?.waits)} waits</span>
          <span>{number(stats?.errors)} turns with errors</span>
          <span>{number(stats?.pending)} pending outcomes</span>
        </div>
        <div className="activity-feed">
          {turns.slice(0, 8).map((t) => (
            <button type="button" key={t.id} onClick={() => inspect(t.agent_id)}>
              <span className={`activity-mark ${t.actions ? "success" : t.state === "running" ? "live" : ""}`}>
                {t.actions ? "✓" : t.state === "running" ? "◌" : "↗"}
              </span>
              <span>
                <strong>{agents.find((a) => a.id === t.agent_id)?.name ?? "Agent"}</strong>
                <span>{t.summary ?? (t.state === "running" ? "Working on this turn…" : "No summary recorded")}</span>
              </span>
              <span className="activity-result">
                <b>{readable(t.code ?? t.state)}</b>
                <small>{when(t.started_at)}</small>
              </span>
            </button>
          ))}
          {turns.length === 0 && <p className="small-empty">No recorded turns yet.</p>}
        </div>
      </section>
      <section className="panel society-explainer">
        <p className="eyebrow">SOCIETY</p>
        <h2>Activity and conversation are different.</h2>
        <p>
          Agents can build, read and wait without speaking to another kingdom. Society shows participating messages and
          agreements once they are observed.
        </p>
        <p className="muted">
          Observation is {cohort.observation_consent ? "on" : "off"}. It records exchanges; it does not make agents
          initiate them.
        </p>
        <button type="button" onClick={society}>
          Open Society →
        </button>
      </section>
    </div>
  );
}
function ConstructionRecovery({ value }: { value: Record<string, unknown> }) {
  const blocks = Array.isArray(value.blockedInstructions) ? value.blockedInstructions : [];
  return (
    <div className="trace-coverage">
      <strong>Construction recovery</strong>
      <p>{String(value.guidance ?? "")}</p>
      <ul>
        {blocks
          .filter((b) => b && typeof b === "object")
          .map((raw) => {
            const b = raw as Record<string, unknown>;
            const missing = Array.isArray(b.missingBuildings) ? b.missingBuildings : [];
            return (
              <li key={String(b.instructionId)}>
                {readable(String(b.building))} {String(b.targetLevel)} · Builder {String(b.slot)}
                <p>
                  Needs{" "}
                  {missing.map((m) => `${String(m.kind)} ${String(m.level)}`).join(", ") ||
                    "a fresh prerequisite check"}
                  .
                </p>
                <small>Instruction: {String(b.instructionId)}</small>
              </li>
            );
          })}
      </ul>
      <p>
        Only the account owner can cancel construction. Review a blocked waiting instruction in PACT to free a queue
        position, then re-read and build its missing prerequisite before re-queueing. Fleet has submitted no
        cancellation.
      </p>
    </div>
  );
}
function Steps({ turn }: { turn: RecordedTurn }) {
  if (!turn.events?.length)
    return (
      <p className="trace-coverage">
        Detailed steps were not recorded for this turn, or have passed the 30-day retention window. Its saved outcome
        and counters are shown above.
      </p>
    );
  return (
    <ol className="step-timeline">
      {turn.events.map((e) => (
        <li key={e.id}>
          <span className={`step-dot ${e.stage === "thinking" ? "live" : ""}`} />
          <div className="step-header">
            <strong>{e.label}</strong>
            <time>{when(e.at)}</time>
          </div>
          {e.detail && (
            <>
              <p>{typeof e.detail.summary === "string" ? e.detail.summary : ""}</p>
              {typeof e.detail.guidance === "string" && <p>{e.detail.guidance}</p>}
              {e.detail.constructionRecovery && typeof e.detail.constructionRecovery === "object" && (
                <ConstructionRecovery value={e.detail.constructionRecovery as Record<string, unknown>} />
              )}
              {e.detail.tool != null && <span className="tool-tag">{readable(String(e.detail.tool))}</span>}
              {e.detail.code != null && <span className="tool-tag">{readable(String(e.detail.code))}</span>}
              {e.detail.action && typeof e.detail.action === "object" && (
                <p className="action-description">
                  <strong>
                    {readable(String((e.detail.action as Record<string, unknown>).kind ?? "Game action"))}
                  </strong>
                  {Object.entries(e.detail.action as Record<string, unknown>)
                    .filter(([k, v]) => k !== "kind" && ["string", "number", "boolean"].includes(typeof v))
                    .slice(0, 5)
                    .map(([k, v]) => (
                      <span key={k}>
                        {" "}
                        · {k.replace(/([a-z])([A-Z])/g, "$1 $2")}: {String(v).slice(0, 160)}
                        {String(v).length > 160 ? "…" : ""}
                      </span>
                    ))}
                </p>
              )}
              <details className="step-data">
                <summary>Inspect recorded details</summary>
                <pre>{JSON.stringify(e.detail, null, 2)}</pre>
              </details>
            </>
          )}
          {!e.detail && (
            <small className="muted">Private observation details were not retained or consent is off.</small>
          )}
        </li>
      ))}
    </ol>
  );
}
function TurnList({
  turns,
  agents,
  inspect,
  recover,
  openRun,
}: {
  openRun?: (id: string) => void;
  turns: RecordedTurn[];
  agents?: ObservedAgent[];
  inspect?: (id: string) => void;
  recover?: (t: RecordedTurn) => void;
}) {
  return (
    <div className="turn-list">
      {turns.map((t) => (
        <details className={`turn-entry ${t.state === "running" ? "active-turn" : ""}`} key={t.id}>
          <summary>
            <span className="turn-result">
              <b>{readable(t.code ?? t.state)}</b>
              <small>{when(t.started_at)}</small>
            </span>
            <span className="turn-summary">
              {agents?.find((a) => a.id === t.agent_id)?.name && <b>{agents.find((a) => a.id === t.agent_id)?.name}</b>}
              {t.summary ?? "Turn in progress…"}
            </span>
            <span className="turn-counts">
              {t.calls} calls · {t.actions} commits
              {t.finished_at && (
                <small>{((Date.parse(t.finished_at) - Date.parse(t.started_at)) / 1000).toFixed(3)} s</small>
              )}
            </span>
          </summary>
          <div className="turn-expanded">
            <div className="turn-meta">
              {openRun && (
                <button type="button" onClick={() => openRun(t.id)}>
                  Open full run debugging →
                </button>
              )}
              <span>Reported tokens: {number(Number(t.input_tokens ?? 0) + Number(t.output_tokens ?? 0))}</span>
              <span>Finished: {when(t.finished_at)}</span>
              {inspect && (
                <button type="button" onClick={() => inspect(t.agent_id)}>
                  Inspect agent →
                </button>
              )}
              {recover && (t.pending_command || t.state === "needs_owner") && (
                <button type="button" onClick={() => recover(t)}>
                  {t.pending_command ? "Check receipt" : "Mark reviewed"}
                </button>
              )}
            </div>
            <Steps turn={t} />
            {t.pending_action && (
              <details className="step-data">
                <summary>Inspect stored pending command</summary>
                <p className="trace-coverage">
                  This is the exact recorded command, not confirmation that the game accepted it. Checking its receipt
                  does not resubmit it.
                </p>
                <pre>{JSON.stringify(t.pending_action, null, 2)}</pre>
              </details>
            )}
            {!!t.resolutions?.length && (
              <details className="step-data">
                <summary>Archived command outcomes ({t.resolutions.length})</summary>
                <p>
                  Original commands remain stored. An operator review is a reviewed rejection, not a game receipt or a
                  replay.
                </p>
                {t.resolutions.map((r) => (
                  <div key={r.commandId}>
                    <p>
                      {r.code} · {r.source.replaceAll("_", " ")} · {when(r.at)}
                    </p>
                    <pre>{JSON.stringify({ commandId: r.commandId, action: r.action }, null, 2)}</pre>
                  </div>
                ))}
              </details>
            )}
            <details className="identifiers">
              <summary>Turn and command identifiers</summary>
              <dl>
                <dt>Turn</dt>
                <dd>{t.id}</dd>
                <dt>Agent</dt>
                <dd>{t.agent_id}</dd>
                {t.pending_command && (
                  <>
                    <dt>Pending command</dt>
                    <dd>{t.pending_command}</dd>
                  </>
                )}
              </dl>
            </details>
          </div>
        </details>
      ))}
    </div>
  );
}
function mergeTurns(previous: RecordedTurn[], next: RecordedTurn[]) {
  return [...next, ...previous.filter((p) => !next.some((n) => n.id === p.id))].sort(
    (a, b) => b.started_at.localeCompare(a.started_at) || b.id.localeCompare(a.id),
  );
}
export function AgentInspector({
  id,
  api,
  close,
  pause,
  openRun,
}: {
  openRun: (id: string) => void;
  id: string;
  api: Api;
  close: () => void;
  pause: (a: ObservedAgent) => void;
}) {
  const [data, setData] = useState<Inspection | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDialogElement>(null),
    loadedOlder = useRef(false);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    loadedOlder.current = false;
    const refresh = () =>
      api<Inspection>(`/agents/${id}/inspection`)
        .then((next) => {
          if (!cancelled)
            setData((old) =>
              old && loadedOlder.current ? { ...next, next: old.next, turns: mergeTurns(old.turns, next.turns) } : next,
            );
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        });
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id, api]);
  async function older() {
    if (!data?.next) return;
    setLoading(true);
    try {
      const next = await api<Inspection>(
        `/agents/${id}/inspection?beforeAt=${encodeURIComponent(data.next.beforeAt)}&beforeId=${data.next.beforeId}`,
      );
      loadedOlder.current = true;
      setData((old) => (old ? { ...old, next: next.next, turns: mergeTurns(old.turns, next.turns) } : next));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load history");
    } finally {
      setLoading(false);
    }
  }
  return (
    <dialog className="agent-inspector" ref={ref} onCancel={close} aria-labelledby="inspector-title">
      <div className="inspector-header">
        <div>
          <p className="eyebrow">AGENT INSPECTOR</p>
          <h2 id="inspector-title">{data?.agent.name ?? "Loading agent…"}</h2>
        </div>
        <button type="button" onClick={close} aria-label="Close agent inspector">
          Close ×
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {readable(error)}
        </p>
      )}
      {data && (
        <div className="inspector-content">
          <div className="inspector-identity">
            <Status agent={data.agent} state={data.cohort.state} />
            <span className="profile">
              {data.cohort.ownerGuidance === "account_autonomy" ? "Account agent" : data.agent.strategy.profile}
            </span>
            <span>{data.cohort.model?.model ?? "No model selected"}</span>
            <button
              type="button"
              disabled={["finished", "stopped"].includes(data.cohort.state)}
              onClick={() => pause(data.agent)}
            >
              {data.agent.state === "paused" ? "Resume agent" : "Pause agent"}
            </button>
          </div>
          <div className="inspector-stats">
            <div>
              <strong>{number(data.agent.total_turns)}</strong>
              <span>turns</span>
            </div>
            <div>
              <strong>{number(data.agent.committed_actions)}</strong>
              <span>committed actions</span>
            </div>
            <div>
              <strong>{number(data.usage.executions)}</strong>
              <span>executions</span>
            </div>
            <div>
              <strong>{number(Number(data.usage.input_tokens) + Number(data.usage.output_tokens))}</strong>
              <span>reported tokens</span>
            </div>
          </div>
          <div className="inspector-columns">
            <section className="inspector-panel">
              <h3>Current work & schedule</h3>
              <p className="current-work">
                {data.agent.current_label ?? data.agent.latest_summary ?? "This agent has not completed a turn yet."}
              </p>
              <dl>
                <dt>Next scheduled turn</dt>
                <dd>{when(data.agent.next_due_at)} Berlin</dd>
                <dt>Last completed turn</dt>
                <dd>{when(data.agent.last_turn_at)}</dd>
                <dt>Last result</dt>
                <dd>{readable(data.agent.reason ?? "No result yet")}</dd>
                <dt>In-flight executions</dt>
                <dd>{data.usage.reserved_calls}</dd>
                <dt>Unknown usage</dt>
                <dd>{data.usage.unknown_calls}</dd>
              </dl>
            </section>
            {data.recovery && (
              <section className="inspector-panel">
                <h3>Recovery path</h3>
                {data.recovery.steps.map((step, i) => (
                  <p key={`${step.kind}:${step.turnId ?? i}`}>{step.instruction}</p>
                ))}
              </section>
            )}
            <section className="inspector-panel">
              <h3>Strategy & continuity</h3>
              {data.cohort.ownerGuidance === "account_autonomy" && (
                <p>
                  Active guidance follows this account's owner and current game facts. The historical controller
                  preferences below are retained for audit and are not supplied as active strategy.
                </p>
              )}
              <p>{data.agent.strategy.objective}</p>
              <div className="strategy-values">
                <span>Risk {Math.round(data.agent.strategy.riskTolerance * 100)}%</span>
                <span>Patience {data.agent.strategy.patience}</span>
                <span>{data.agent.strategy.horizon}</span>
              </div>
              <h4>Saved notes</h4>
              {data.cognition?.enabled === true && (
                <details>
                  <summary>Memory, plan, reflections & social hypotheses</summary>
                  <p className="muted">
                    Observed evidence and subjective interpretations are labeled separately. These intentions never
                    authorize or queue game commands.
                  </p>
                  <CognitiveInspector value={data.cognition} />
                </details>
              )}
              <p className="saved-notes">
                {!data.cohort.observation
                  ? "Private observation is off."
                  : data.notes || "No durable note chosen by this agent yet."}
              </p>
              <p className="muted">
                {data.memory.reads.length} retained read checkpoints · Updated {when(data.memory.updatedAt)}
              </p>
              <details>
                <summary>Retained read metadata</summary>
                {data.memory.reads.map((r) => (
                  <p key={r.id}>
                    {readable(r.tool)} · {when(r.observedAt)}
                  </p>
                ))}
                <p className="muted">{data.memory.coverage}</p>
              </details>
            </section>
          </div>
          <section className="inspector-panel">
            <div className="section-heading">
              <div>
                <h3>Turn-by-turn activity</h3>
                <p>Expand a turn to follow its decisions, reads and command outcomes.</p>
              </div>
              <span className="live-indicator">Refreshes every 5 seconds</span>
            </div>
            {data.turns.length ? (
              <TurnList turns={data.turns} openRun={openRun} />
            ) : (
              <p className="small-empty">No turns recorded yet.</p>
            )}
            {data.next && (
              <button type="button" className="load-history" disabled={loading} onClick={() => void older()}>
                {loading ? "Loading…" : "Load older turns"}
              </button>
            )}
            <p className="trace-coverage">{data.coverage}</p>
          </section>
          <details className="identifiers">
            <summary>Account & kingdom identity</summary>
            <dl>
              <dt>Agent ID</dt>
              <dd>{data.agent.id}</dd>
              <dt>Account ID</dt>
              <dd>{data.agent.account_id ?? "Not connected"}</dd>
              <dt>Kingdom ID</dt>
              <dd>{data.agent.kingdom_id ?? "Not connected"}</dd>
              <dt>Credentials</dt>
              <dd>{readable(data.agent.credential_state)} · secrets are never displayed</dd>
            </dl>
          </details>
        </div>
      )}
    </dialog>
  );
}
export function TurnHistory({
  cohort,
  agents,
  api,
  inspect,
  recover,
  openRun,
}: {
  openRun: (id: string) => void;
  cohort: CohortView;
  agents: ObservedAgent[];
  api: Api;
  inspect: (id: string) => void;
  recover: (t: RecordedTurn) => void;
}) {
  const [filter, setFilter] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState<Page | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    loadedOlder = useRef(false),
    requestGeneration = useRef(0);
  const visible = (page?.turns ?? []).filter(
    (t) =>
      (!status || t.state === status) &&
      `${t.id} ${t.code ?? ""} ${t.summary ?? ""} ${agents.find((a) => a.id === t.agent_id)?.name ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const base = `/cohorts/${cohort.id}/turns`,
    filterQuery = filter ? `agentId=${filter}` : "";
  useEffect(() => {
    let cancelled = false;
    requestGeneration.current++;
    setPage(null);
    setLoading(false);
    setError("");
    loadedOlder.current = false;
    const refresh = () =>
      api<Page>(`${base}${filterQuery ? `?${filterQuery}` : ""}`)
        .then((next) => {
          if (!cancelled)
            setPage((old) =>
              old && loadedOlder.current ? { ...next, next: old.next, turns: mergeTurns(old.turns, next.turns) } : next,
            );
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        });
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [base, filterQuery, api]);
  async function older() {
    if (!page?.next) return;
    const generation = requestGeneration.current;
    setLoading(true);
    try {
      const next = await api<Page>(
        `${base}?${filterQuery ? `${filterQuery}&` : ""}beforeAt=${encodeURIComponent(page.next.beforeAt)}&beforeId=${page.next.beforeId}`,
      );
      if (generation !== requestGeneration.current) return;
      loadedOlder.current = true;
      setPage((old) => (old ? { ...next, turns: mergeTurns(old.turns, next.turns) } : next));
    } catch (e) {
      if (generation === requestGeneration.current) setError(e instanceof Error ? e.message : "Could not load history");
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">RUNS</p>
          <h2>Browse recorded runs</h2>
          <p>Decisions, reads, confirmed actions and interruptions.</p>
        </div>
        <label className="compact-filter">
          Agent
          <select aria-label="Filter turn history by agent" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All agents</option>
            {agents.map((a) => (
              <option value={a.id} key={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="run-filters">
        <label>
          Search loaded runs
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Agent, run ID, summary or error"
          />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {["running", "finished", "pending", "needs_owner", "cancelled"].map((s) => (
              <option key={s} value={s}>
                {readable(s)}
              </option>
            ))}
          </select>
        </label>
        <span>
          {visible.length} matching / {page?.turns.length ?? 0} loaded. Load older runs to search further.
        </span>
      </div>
      {error && (
        <p className="error" role="alert">
          {readable(error)}
        </p>
      )}
      {!page ? (
        <p className="small-empty">Loading history…</p>
      ) : visible.length ? (
        <TurnList turns={visible} agents={agents} inspect={inspect} recover={recover} openRun={openRun} />
      ) : (
        <p className="small-empty">No turns recorded for this selection.</p>
      )}
      {page?.next && (
        <button type="button" className="load-history" disabled={loading} onClick={() => void older()}>
          {loading ? "Loading…" : "Load older turns"}
        </button>
      )}
      <p className="trace-coverage">{page?.coverage}</p>
    </section>
  );
}

function CognitiveInspector({ value }: { value: Record<string, unknown> }) {
  const obj = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const list = (v: unknown) => (Array.isArray(v) ? v.map(obj) : []);
  if (value.withheld) return <p className="muted">Private observation is off.</p>;
  const plan = obj(value.plan),
    beliefs = list(value.beliefs),
    reflections = list(value.reflections),
    review = obj(value.latestReview),
    reviewResult = obj(value.latestReviewResult);
  return (
    <div>
      {review.reason ? (
        <>
          <h4>Latest evidence review</h4>
          <p>
            Beliefs: {String(review.beliefs).replaceAll("_", " ")} · Reflection:{" "}
            {String(review.reflection).replaceAll("_", " ")}
          </p>
          <p>{String(review.reason)}</p>
          {value.latestReviewResult ? (
            <p className="muted">
              Saved changes: {String(reviewResult.beliefsRevised)} beliefs, {String(reviewResult.reflectionsAdded)}{" "}
              reflections; {String(reviewResult.duplicateReflectionsSkipped)} repeated reflections skipped.
            </p>
          ) : null}
        </>
      ) : null}
      <h4>Persistent plan</h4>
      {plan.goal ? (
        <>
          <p>
            {String(plan.goal)} <span className="badge">{String(plan.status)}</span>
          </p>
          <ol>{Array.isArray(plan.steps) && plan.steps.map((s) => <li key={String(s)}>{String(s)}</li>)}</ol>
          <p className="muted">Reconsider when: {String(plan.reconsiderWhen)}</p>
        </>
      ) : (
        <p className="muted">No plan saved yet. The LLM may choose one during its normal turn.</p>
      )}
      <h4>Beliefs about players</h4>
      {beliefs.length ? (
        beliefs.map((b) => (
          <article key={String(b.peerId)}>
            <p>
              <strong>Player {String(b.peerId).slice(0, 8)}</strong> · prediction test {String(b.assessment)} ·{" "}
              {String(b.confidence)} subjective confidence ·{" "}
              {String(b.grounding ?? "legacy_unverified").replaceAll("_", " ")}
            </p>
            <p>{String(b.hypothesis)}</p>
            <p className="muted">Alternative: {String(b.alternative)}</p>
            <p>Prediction to review: {String(b.prediction)}</p>
            {b.test ? (
              <p className="muted">
                Test: {String(obj(b.test).kind)}; game-time window {String(obj(b.test).afterGameTimeMs)}–
                {String(obj(b.test).byGameTimeMs)}
              </p>
            ) : null}
          </article>
        ))
      ) : (
        <p className="muted">No social hypothesis saved yet.</p>
      )}
      <h4>Reflections</h4>
      {reflections.length ? (
        reflections.map((r) => (
          <article key={JSON.stringify(r)}>
            <p className="muted">{String(r.grounding ?? "legacy_unverified").replaceAll("_", " ")}</p>
            <p>Recorded intention: {String(r.expected)}</p>
            <p>Observed: {String(r.observed)}</p>
            <p>Revision: {String(r.revision)}</p>
          </article>
        ))
      ) : (
        <p className="muted">No reflection saved yet.</p>
      )}
      <details>
        <summary>Retained episodes and source references</summary>
        <p className="muted">{String(value.coverage)}</p>
        <pre className="cognitive-detail">{JSON.stringify(value, null, 2)}</pre>
      </details>
    </div>
  );
}
