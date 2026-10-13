import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import {
  AgentInspector,
  agentStatus,
  type CohortStats,
  type ObservedAgent,
  Overview,
  type RecordedTurn,
  Status,
  TurnHistory,
} from "./observe.js";

type Obj = Record<string, unknown>;
type Agent = {
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
} & ObservedAgent;
type Cohort = {
  id: string;
  name: string;
  count: number;
  state: string;
  interval_minutes: number;
  model: { route: string; model: string; reasoningEffort?: string; thinking?: boolean } | null;
  budget: Obj | null;
  observation_consent: boolean;
  synthetic_owner_policy: Obj | null;
};
type Pair = { owner_agent_id: string; peer_kingdom_id: string; events: number; messages: number; last_at: string };
type Turn = {
  id: string;
  agent_id: string;
  cohort_id: string;
  state: string;
  code: string | null;
  started_at: string;
  finished_at: string | null;
  summary: string | null;
  calls: number;
  actions: number;
  pending_command: string | null;
} & RecordedTurn;
type State = {
  cohorts: Cohort[];
  agents: Agent[];
  pairs: Pair[];
  turns: Turn[];
  hosts: { id: string; updated_at: string; live_enabled: boolean }[];
  usage: {
    cohort_id: string;
    calls: number;
    allocated_tokens: string;
    input_tokens: string;
    output_tokens: string;
    unknown_calls: number;
    reserved_calls: number;
  }[];
  cohortStats: CohortStats[];
  liveEnabled: boolean;
  demo: boolean;
  asOf: string;
  profiles: Record<string, string>;
  gameKinds: string[];
};
type Event = { id: string; kind: string; direction: string; observedAt: string; gameTime: string; body: Obj };
type Thread = {
  events: Event[];
  next: { at: string; id: string; time: string } | null;
  coverage: string;
  metrics: { incoming: number; outgoing: number };
};
const date = (s: string | null) =>
  s
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Berlin",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "short",
      }).format(new Date(s))
    : "—";
const fmt = (s: number | string) => new Intl.NumberFormat("en-GB").format(Number(s));
function App() {
  const [csrf, setCsrf] = useState(""),
    [password, setPassword] = useState(""),
    [state, setState] = useState<State | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("overview"),
    [cohortId, setCohortId] = useState(""),
    [selected, setSelected] = useState<Pair | null>(null),
    [thread, setThread] = useState<Thread | null>(null),
    [modal, setModal] = useState<"create" | "configure" | "permissions" | "provision" | null>(null),
    [agentId, setAgentId] = useState(""),
    [search, setSearch] = useState(""),
    [kind, setKind] = useState("all"),
    [inspectionId, setInspectionId] = useState(""),
    [agentSearch, setAgentSearch] = useState(""),
    [agentFilter, setAgentFilter] = useState("all");
  const api = useCallback(
    async <T,>(path: string, body?: unknown): Promise<T> => {
      const r = await fetch(`/api${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "content-type": "application/json", ...(body !== undefined ? { "x-csrf-token": csrf } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const d = await r.json();
      if (!r.ok) {
        if (r.status === 401) {
          setCsrf("");
          setState(null);
        }
        throw Error(d.error?.code ?? "REQUEST_FAILED");
      }
      return d as T;
    },
    [csrf],
  );
  const refresh = useCallback(async () => {
    const s = await api<State>("/state");
    setState(s);
    setCohortId((id) => (s.cohorts.some((c) => c.id === id) ? id : (s.cohorts[0]?.id ?? "")));
  }, [api]);
  async function act(work: () => Promise<void>, refreshAfter = true) {
    setBusy(true);
    setNotice("");
    try {
      await work();
      if (refreshAfter) await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void api<{ csrf: string }>("/session")
      .then((s) => setCsrf(s.csrf))
      .catch(() => {});
  }, [api]);
  useEffect(() => {
    if (!csrf) return;
    void refresh().catch((e) => setNotice(e.message));
    const timer = setInterval(() => {
      void refresh().catch((e) => setNotice(e.message));
    }, 5000);
    return () => clearInterval(timer);
  }, [csrf, refresh]);
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setThread(null);
    void api<Thread>(`/agents/${selected.owner_agent_id}/thread?peer=${selected.peer_kingdom_id}`)
      .then((t) => {
        if (!cancelled) setThread(t);
      })
      .catch((e) => {
        if (!cancelled) setNotice(e.message);
      });
    const timer = setInterval(() => {
      void api<Thread>(`/agents/${selected.owner_agent_id}/thread?peer=${selected.peer_kingdom_id}`)
        .then((t) => {
          if (cancelled) return;
          setThread((previous) =>
            previous
              ? {
                  ...t,
                  next: previous.next,
                  events: [...previous.events.filter((e) => !t.events.some((n) => n.id === e.id)), ...t.events],
                }
              : t,
          );
        })
        .catch((e) => {
          if (!cancelled) setNotice(e.message);
        });
    }, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selected, api]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (modal) dialogRef.current?.showModal();
  }, [modal]);
  const cohort = state?.cohorts.find((c) => c.id === cohortId),
    agents = state?.agents.filter((a) => a.cohort_id === cohortId) ?? [],
    pairs = state?.pairs.filter((p) => agents.some((a) => a.id === p.owner_agent_id)) ?? [],
    turns = state?.turns.filter((t) => t.cohort_id === cohortId) ?? [],
    usage = state?.usage.find((u) => u.cohort_id === cohortId);
  const cohortStats = state?.cohortStats?.find((s) => s.cohort_id === cohortId);
  const visibleAgents = agents.filter((a) => {
    const match = `${a.name} ${a.strategy.profile} ${a.account_id ?? ""} ${a.kingdom_id ?? ""}`
      .toLowerCase()
      .includes(agentSearch.toLowerCase());
    const status = agentStatus(a, cohort?.state ?? "draft");
    return (
      match &&
      (agentFilter === "all" ||
        (agentFilter === "active" && a.latest_state === "running" && cohort?.state === "running") ||
        (agentFilter === "attention" && status === "Needs attention") ||
        (agentFilter === "scheduled" && ["Scheduled", "Queued"].includes(status)) ||
        (agentFilter === "paused" && ["Paused", "Fleet paused"].includes(status)))
    );
  });
  const recoverTurn = (t: RecordedTurn) =>
    void act(async () => {
      if (t.pending_command) await api(`/turns/${t.id}/reconcile`, {});
      else await api(`/turns/${t.id}/review`, {});
    });
  const agent = (id: string) => state?.agents.find((a) => a.id === id),
    peer = (id: string) => state?.agents.find((a) => a.kingdom_id === id)?.name ?? `Kingdom ${id.slice(0, 8)}`;
  if (!csrf)
    return (
      <main className="login">
        <div className="brand-mark">F</div>
        <p className="eyebrow">FLEET · PACT</p>
        <h1>
          A window into
          <br />
          your agent society.
        </h1>
        <p className="muted">A private console for schedules, strategies and the conversations shaping the world.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              const s = await api<{ csrf: string }>("/login", { password });
              setPassword("");
              setCsrf(s.csrf);
            });
          }}
        >
          <label>
            Operator password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="primary" disabled={busy}>
            Open console →
          </button>
        </form>
        {notice && (
          <p role="alert" className="error">
            {notice}
          </p>
        )}
      </main>
    );
  return (
    <div className="shell">
      <aside className="sidebar">
        <a href="/" className="brand">
          <span className="brand-mark small">F</span>
          <span>
            FLEET<span className="brand-sub">PACT · OPERATIONS</span>
          </span>
        </a>
        <p className="sidebar-label">WORKSPACE</p>
        <nav>
          {[
            ["overview", "◉", "Overview"],
            ["society", "◎", "Society"],
            ["agents", "◈", "Agents"],
            ["activity", "↗", "Turn history"],
            ["settings", "⚙", "Fleet settings"],
          ].map(([key, icon, label]) => (
            <button type="button" key={key} className={tab === key ? "nav active" : "nav"} onClick={() => setTab(key)}>
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className={`dot ${state?.liveEnabled ? "green" : ""}`} />
          {state?.liveEnabled ? "Execution permitted" : "Live execution disabled"}
          <p>
            Independent controller
            <br />
            Europe / Berlin
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              void act(async () => {
                await api("/logout", {});
                setCsrf("");
                setState(null);
              }, false)
            }
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header>
          <div>
            <p className="eyebrow">YOUR PERSISTENT WORLD</p>
            <h1>
              {tab === "overview"
                ? "Fleet overview"
                : tab === "society"
                  ? "The society"
                  : tab === "agents"
                    ? "Your agents"
                    : tab === "activity"
                      ? "Turn history"
                      : "Fleet settings"}
            </h1>
          </div>
          <div className="header-actions">
            <select
              aria-label="Select fleet"
              value={cohortId}
              onChange={(e) => {
                setCohortId(e.target.value);
                setSelected(null);
                setThread(null);
                setInspectionId("");
              }}
            >
              <option value="">Choose a fleet</option>
              {state?.cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button type="button" className="primary" onClick={() => setModal("create")}>
              + Create fleet
            </button>
          </div>
        </header>
        {state?.demo && (
          <div className="banner">
            SYNTHETIC PREVIEW <span>Example accounts and conversations. No real players or model calls.</span>
          </div>
        )}
        {!state?.liveEnabled && (
          <div className="quiet-banner">
            <span className="dot" />
            Agents are not running. Choose a model and budget before enabling live execution.
          </div>
        )}
        {notice && (
          <div role="alert" className="error">
            {notice.replaceAll("_", " ")}
            <button type="button" onClick={() => setNotice("")}>
              Dismiss
            </button>
          </div>
        )}
        <section className="stats" aria-label="Fleet summary">
          <div>
            <span>AGENTS</span>
            <strong>{agents.length}</strong>
            <small>{agents.filter((a) => a.account_id).length} accounts connected</small>
          </div>
          <div>
            <span>CONVERSATIONS</span>
            <strong>{pairs.length}</strong>
            <small>Observed participating exchanges</small>
          </div>
          <div>
            <span>COMMITTED ACTIONS</span>
            <strong>{fmt(cohortStats?.actions ?? 0)}</strong>
            <small>Across {fmt(cohortStats?.turns ?? 0)} lifetime turns</small>
          </div>
          <div>
            <span>{cohort?.model?.route === "codex-cli" ? "CODEX EXECUTIONS" : "MODEL CALLS"}</span>
            <strong>{fmt(usage?.calls ?? 0)}</strong>
            <small>
              {fmt(usage?.reserved_calls ?? 0)} in flight · {fmt(usage?.unknown_calls ?? 0)} unknown
            </small>
          </div>
        </section>
        {!cohort ? (
          <div className="empty">
            <span>◈</span>
            <h2>Your first society starts here.</h2>
            <p>
              Create a fleet with N agents and different priorities. Draft agents stay inactive until their accounts,
              model and budget are ready.
            </p>
            <button type="button" className="primary" onClick={() => setModal("create")}>
              Create a fleet
            </button>
          </div>
        ) : tab === "overview" ? (
          <Overview
            cohort={cohort}
            agents={agents}
            turns={turns}
            stats={cohortStats}
            inspect={setInspectionId}
            history={() => setTab("activity")}
            society={() => setTab("society")}
          />
        ) : tab === "society" ? (
          <>
            <div className="section-heading">
              <div>
                <h2>Conversations & commitments</h2>
                <p>What agents said, what they signed, and what actually happened.</p>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={cohort.observation_consent}
                  disabled={busy}
                  onChange={(e) => {
                    setSelected(null);
                    setThread(null);
                    void act(async () => {
                      await api(`/cohorts/${cohort.id}/observation`, { enabled: e.target.checked });
                    });
                  }}
                />
                Private observation consent
              </label>
            </div>
            <div className="society">
              <section className="pair-list">
                <div className="search">
                  <input
                    aria-label="Search conversations"
                    placeholder="Find an agent or kingdom…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {!cohort.observation_consent ? (
                  <div className="small-empty">
                    Private observation is off. Enable it only for accounts whose owners authorize this console to
                    retain their participating exchanges.
                  </div>
                ) : pairs.length === 0 ? (
                  <div className="small-empty">
                    <h3>No conversations observed yet</h3>
                    <p>
                      Observation is on. Agents have recorded {fmt(cohortStats?.turns ?? 0)} turns and{" "}
                      {fmt(cohortStats?.actions ?? 0)} committed actions, but no participating exchange is in the
                      journal.
                    </p>
                    <p>
                      Reading and construction do not appear as conversations. Follow their work in Overview or inspect
                      an agent.
                    </p>
                    <button type="button" onClick={() => setTab("overview")}>
                      See live activity →
                    </button>
                  </div>
                ) : (
                  pairs
                    .filter((p) =>
                      `${agent(p.owner_agent_id)?.name} ${peer(p.peer_kingdom_id)}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((p) => (
                      <button
                        type="button"
                        key={`${p.owner_agent_id}:${p.peer_kingdom_id}`}
                        className={`pair ${selected?.owner_agent_id === p.owner_agent_id && selected.peer_kingdom_id === p.peer_kingdom_id ? "selected" : ""}`}
                        onClick={() => setSelected(p)}
                      >
                        <div className="pair-avatars">
                          <span>{agent(p.owner_agent_id)?.name.charAt(0)}</span>
                          <span>{peer(p.peer_kingdom_id).charAt(0)}</span>
                        </div>
                        <div>
                          <strong>
                            {agent(p.owner_agent_id)?.name} ↔ {peer(p.peer_kingdom_id)}
                          </strong>
                          <p>
                            {p.messages} messages · {p.events - p.messages} agreement observations
                          </p>
                          <small>{date(p.last_at)} · Berlin</small>
                        </div>
                        <span>›</span>
                      </button>
                    ))
                )}
              </section>
              <section className="thread" aria-label="Selected conversation">
                {!selected ? (
                  <div className="empty">
                    <span>◎</span>
                    <h2>Follow a relationship.</h2>
                    <p>
                      Select an exchange to read the dialogue alongside its offers, signatures and delivery outcomes.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="thread-header">
                      <div>
                        <p className="eyebrow">PARTICIPATING EXCHANGE</p>
                        <h2>
                          {agent(selected.owner_agent_id)?.name} <span>↔</span> {peer(selected.peer_kingdom_id)}
                        </h2>
                      </div>
                      <div className="tabs">
                        {["all", "messages", "agreements"].map((k) => (
                          <button
                            type="button"
                            className={kind === k ? "selected" : ""}
                            key={k}
                            onClick={() => setKind(k)}
                          >
                            {k.charAt(0).toUpperCase() + k.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="thread-body">
                      {!thread ? (
                        <p className="muted">Loading retained history…</p>
                      ) : (
                        <>
                          {thread.next && (
                            <button
                              type="button"
                              className="load-more"
                              disabled={busy}
                              onClick={() =>
                                void act(async () => {
                                  const cursor = thread.next;
                                  if (!cursor) return;
                                  const older = await api<Thread>(
                                    `/agents/${selected.owner_agent_id}/thread?peer=${selected.peer_kingdom_id}&beforeAt=${encodeURIComponent(cursor.at)}&beforeId=${cursor.id}&beforeTime=${cursor.time}`,
                                  );
                                  setThread({ ...older, events: [...older.events, ...thread.events] });
                                })
                              }
                            >
                              Load earlier history
                            </button>
                          )}
                          {thread.events
                            .filter((e) => kind === "all" || e.kind === (kind === "messages" ? "message" : "agreement"))
                            .map((e) =>
                              e.kind === "message" ? (
                                <article key={e.id} className={`message ${e.direction}`}>
                                  <div className="message-meta">
                                    <strong>
                                      {e.direction === "outgoing"
                                        ? agent(selected.owner_agent_id)?.name
                                        : peer(selected.peer_kingdom_id)}
                                    </strong>
                                    <span>{date(e.observedAt)} observed</span>
                                  </div>
                                  <p>{String(e.body.body ?? "Message body unavailable")}</p>
                                  <small>
                                    Game time {e.gameTime || "unavailable"} · {String(e.body.authorKind ?? "agent")}
                                  </small>
                                </article>
                              ) : (
                                <Agreement key={e.id} event={e} />
                              ),
                            )}
                          <p className="coverage">{thread.coverage}</p>
                        </>
                      )}
                    </div>
                  </>
                )}
              </section>
            </div>
          </>
        ) : tab === "agents" ? (
          <>
            <div className="section-heading">
              <div>
                <h2>Different values. Independent memories.</h2>
                <p>Profiles influence priorities; each agent chooses its own moves.</p>
              </div>
              <span className="badge">Every {cohort.interval_minutes} minutes</span>
            </div>
            <div className="roster-toolbar">
              <input
                aria-label="Search agents"
                placeholder="Search name, strategy, account or kingdom…"
                value={agentSearch}
                onChange={(e) => setAgentSearch(e.target.value)}
              />
              <select
                aria-label="Filter agents by status"
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="active">Working now</option>
                <option value="scheduled">Scheduled / queued</option>
                <option value="attention">Needs attention</option>
                <option value="paused">Paused</option>
              </select>
              <span>
                {visibleAgents.length} of {agents.length} agents
              </span>
            </div>
            <div className="agent-grid">
              {visibleAgents.map((a) => (
                <article className="agent-card" key={a.id}>
                  <div className="agent-top">
                    <span className={`avatar ${a.strategy.profile}`}>{String(a.ordinal + 1).padStart(2, "0")}</span>
                    <Status agent={a} state={cohort.state} />
                  </div>
                  <h3>{a.name}</h3>
                  <p className="profile">{a.strategy.profile}</p>
                  <p className="objective">{a.strategy.objective}</p>
                  <dl>
                    <div>
                      <dt>Account</dt>
                      <dd>{a.account_id ? "Connected" : "Not connected"}</dd>
                    </div>
                    <div>
                      <dt>Lifetime turns / commits</dt>
                      <dd>
                        {a.total_turns ?? 0} / {a.committed_actions ?? 0}
                      </dd>
                    </div>
                    <div>
                      <dt>Next turn</dt>
                      <dd>{date(a.next_due_at)}</dd>
                    </div>
                    <div>
                      <dt>Last turn</dt>
                      <dd>{date(a.last_turn_at)}</dd>
                    </div>
                  </dl>
                  <div className="agent-intent">
                    <span>{a.latest_state === "running" ? "Current work" : "Latest recorded intent"}</span>
                    <p>{a.current_label ?? a.latest_summary ?? "No recorded turn yet."}</p>
                  </div>
                  {a.reason && <p className="reason">{a.reason.replaceAll("_", " ")}</p>}
                  <div className="card-actions">
                    <button type="button" className="primary" onClick={() => setInspectionId(a.id)}>
                      Inspect agent →
                    </button>
                    {!a.account_id || a.credential_state !== "ready" ? (
                      <>
                        <button
                          type="button"
                          disabled={busy || !state?.liveEnabled}
                          onClick={() =>
                            void act(async () => {
                              const r = await api<{ url: string }>(`/agents/${a.id}/connect`, {});
                              window.location.assign(r.url);
                            })
                          }
                        >
                          {a.account_id ? "Reconnect account" : "Connect account"}
                        </button>
                        <button
                          type="button"
                          disabled={busy || !state?.liveEnabled}
                          onClick={() => {
                            setAgentId(a.id);
                            setModal("provision");
                          }}
                        >
                          {a.account_id ? "Recover synthetic account" : "Create account"}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            await api(`/agents/${a.id}/state`, { state: a.state === "paused" ? "ready" : "paused" });
                          })
                        }
                      >
                        {a.state === "paused" ? "Resume" : "Pause"} agent
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {visibleAgents.length === 0 && (
              <p className="small-empty">No agents match this search and status filter.</p>
            )}
          </>
        ) : tab === "activity" ? (
          <TurnHistory
            key={`${cohort.id}:${cohort.observation_consent}`}
            cohort={cohort}
            agents={agents}
            api={api}
            inspect={setInspectionId}
            recover={recoverTurn}
          />
        ) : (
          <section className="settings-grid">
            <article className="panel">
              <p className="eyebrow">EXECUTION</p>
              <h2>{cohort.name}</h2>
              <dl>
                <div>
                  <dt>Status</dt>
                  <dd>{cohort.state}</dd>
                </div>
                <div>
                  <dt>Schedule</dt>
                  <dd>Every {cohort.interval_minutes} minutes, staggered</dd>
                </div>
                <div>
                  <dt>Model</dt>
                  <dd>{cohort.model?.model ?? "Not selected"}</dd>
                </div>
                {cohort.model?.reasoningEffort && (
                  <div>
                    <dt>Reasoning</dt>
                    <dd>{cohort.model.reasoningEffort}</dd>
                  </div>
                )}
                {cohort.budget && (
                  <div>
                    <dt>Decisions per turn</dt>
                    <dd>{String(cohort.budget.maxCallsPerTurn)}</dd>
                  </div>
                )}
                <div>
                  <dt>Budget</dt>
                  <dd>
                    {cohort.budget?.mode === "continuous"
                      ? "Until stopped · lifetime usage retained"
                      : cohort.budget
                        ? `${fmt(String(cohort.budget.callLimit))} ${cohort.model?.route === "codex-cli" ? "executions" : "calls"} · ${String(cohort.budget.mode)}`
                        : "Not selected"}
                  </dd>
                </div>
                <div>
                  <dt>Host</dt>
                  <dd>
                    {state?.hosts.some((h) => Date.now() - new Date(h.updated_at).getTime() < 30000)
                      ? "Recent worker heartbeat"
                      : "No recent worker heartbeat"}
                  </dd>
                </div>
              </dl>
              <div className="card-actions">
                <button
                  type="button"
                  onClick={() => setModal("configure")}
                  disabled={busy || cohort.state === "running"}
                >
                  Select model & budget
                </button>
                <button type="button" onClick={() => setModal("permissions")}>
                  Synthetic owner policy
                </button>
              </div>
              <div className="run-actions">
                <button
                  type="button"
                  className="primary"
                  disabled={
                    busy ||
                    !state?.liveEnabled ||
                    !cohort.model ||
                    !cohort.budget ||
                    agents.some((a) => !a.account_id) ||
                    ["stopped", "finished"].includes(cohort.state)
                  }
                  onClick={() =>
                    void act(async () => {
                      await api(`/cohorts/${cohort.id}/state`, { state: "running" });
                    })
                  }
                >
                  Start / resume fleet
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await api(`/cohorts/${cohort.id}/state`, { state: "paused" });
                    })
                  }
                >
                  Pause
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Permanently stop this fleet? Accounts, history and pending commands will be preserved.",
                      )
                    )
                      void act(async () => {
                        await api(`/cohorts/${cohort.id}/state`, { state: "stopped" });
                      });
                  }}
                >
                  Stop permanently
                </button>
              </div>
            </article>
            <article className="panel">
              <p className="eyebrow">COMPUTE LEDGER</p>
              <h2>Allocation and actual usage</h2>
              <dl>
                <div>
                  <dt>Charged allocation</dt>
                  <dd>{fmt(usage?.allocated_tokens ?? 0)}</dd>
                </div>
                <div>
                  <dt>Reported input</dt>
                  <dd>{fmt(usage?.input_tokens ?? 0)}</dd>
                </div>
                <div>
                  <dt>Reported output</dt>
                  <dd>{fmt(usage?.output_tokens ?? 0)}</dd>
                </div>
                <div>
                  <dt>Usage unknown</dt>
                  <dd>{fmt(usage?.unknown_calls ?? 0)} calls</dd>
                </div>
              </dl>
              <p className="muted">
                Reservations are retained when usage is missing. They do not guarantee a currency bill. Daily allowances
                reset at UTC midnight only when explicitly configured.
              </p>
              <p className="muted">
                The exact decision calculator is available through PACT. No trained decision selector is deployed.
              </p>
            </article>
          </section>
        )}
        <footer>
          Independent fleet state · Last refreshed {date(state?.asOf ?? null)} Berlin · Game rules enforced by PACT
        </footer>
        {inspectionId && cohort && (
          <AgentInspector
            key={`${inspectionId}:${cohort.observation_consent}`}
            id={inspectionId}
            api={api}
            close={() => setInspectionId("")}
            pause={(a) =>
              void act(async () => {
                await api(`/agents/${a.id}/state`, { state: a.state === "paused" ? "ready" : "paused" });
              })
            }
          />
        )}
      </main>
      {modal && (
        <div className="modal-backdrop">
          <dialog
            ref={dialogRef}
            onCancel={(e) => {
              e.preventDefault();
              setModal(null);
            }}
            className="modal"
            aria-modal="true"
            aria-label={modal === "create" ? "Create fleet" : "Configure fleet"}
          >
            <button type="button" className="close" aria-label="Close dialog" onClick={() => setModal(null)}>
              ×
            </button>
            {modal === "create" ? (
              <Create
                busy={busy}
                save={(input) =>
                  void act(async () => {
                    const c = await api<{ id: string }>("/cohorts", input);
                    setCohortId(c.id);
                    setModal(null);
                    setTab("agents");
                  })
                }
              />
            ) : modal === "configure" ? (
              <Configure
                busy={busy}
                save={(input) =>
                  void act(async () => {
                    await api(`/cohorts/${cohortId}/configure`, input);
                    setModal(null);
                  })
                }
              />
            ) : (
              <ConfigurationForm
                mode={modal === "permissions" ? "permissions" : "provision"}
                gameKinds={state?.gameKinds ?? []}
                initial={cohort?.synthetic_owner_policy}
                busy={busy}
                save={(input) =>
                  void act(async () => {
                    await api(
                      modal === "permissions" ? `/cohorts/${cohortId}/owner-policy` : `/agents/${agentId}/provision`,
                      input,
                    );
                    setModal(null);
                  })
                }
              />
            )}
          </dialog>
        </div>
      )}
    </div>
  );
}
function Agreement({ event: e }: { event: Event }) {
  const b = e.body,
    c = b.contract as Obj | undefined,
    v = Array.isArray(b.versions) ? (b.versions as Obj[]) : [];
  return (
    <article className="agreement">
      <div className="agreement-heading">
        <span>◇ AGREEMENT OBSERVATION</span>
        <span className="badge">{String(c?.status ?? b.status ?? "Observed")}</span>
      </div>
      <h3>
        {String(b.kind ?? "Supply")} offer · version {String(b.version ?? "—")}
      </h3>
      <p className="muted">
        {date(e.observedAt)} observed · game time {e.gameTime || "unavailable"}
      </p>
      <div className="terms">
        <Facts value={b.terms ?? {}} />
      </div>
      <details>
        <summary>Terms history, signatures & delivery</summary>
        {v.map((x) => (
          <div className="version" key={String(x.version)}>
            Version {String(x.version)}
            <Facts value={x.terms} />
          </div>
        ))}
        <Facts value={{ signatures: b.signatures ?? [], contract: c ?? null, deliveries: b.deliveries ?? null }} />
      </details>
    </article>
  );
}
function Facts({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="muted">Not observed</span>;
  if (Array.isArray(value))
    return (
      <div>
        {value.length ? (
          value.map((v, i) => (
            <div key={JSON.stringify(v) + String(i)} className="fact-item">
              <Facts value={v} />
            </div>
          ))
        ) : (
          <span className="muted">None observed</span>
        )}
      </div>
    );
  if (typeof value === "object")
    return (
      <dl className="fact-list">
        {Object.entries(value).map(([k, v]) => (
          <div key={k}>
            <dt>{k.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ")}</dt>
            <dd>
              <Facts value={v} />
            </dd>
          </div>
        ))}
      </dl>
    );
  return <span>{String(value)}</span>;
}
function Create({ busy, save }: { busy: boolean; save: (data: unknown) => void }) {
  const [name, setName] = useState(""),
    [count, setCount] = useState(10),
    [interval, setInterval] = useState(15);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save({
          name,
          count,
          intervalMinutes: interval,
          seed: crypto.randomUUID(),
          strategies: ["guardian", "expansionist", "merchant", "diplomat", "opportunist"],
        });
      }}
    >
      <p className="eyebrow">A NEW SOCIETY</p>
      <h2>Create a fleet</h2>
      <p className="muted">Draft agents get independent strategies. Accounts and execution remain inactive.</p>
      <label>
        Fleet name
        <input
          required
          minLength={2}
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Northern kingdoms"
        />
      </label>
      <div className="form-row">
        <label>
          Number of agents
          <input
            type="number"
            min={1}
            max={1000}
            required
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </label>
        <label>
          Turn interval
          <select value={interval} onChange={(e) => setInterval(Number(e.target.value))}>
            {[10, 15, 30, 60].map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="profile-preview">
        Guardian · Expansionist · Merchant · Diplomat · Opportunist
        <p>Balanced distribution with saved variations in risk and patience.</p>
      </div>
      <button type="submit" className="primary" disabled={busy}>
        Create {count} draft agents
      </button>
    </form>
  );
}
function Configure({ busy, save }: { busy: boolean; save: (data: unknown) => void }) {
  const [route, setRoute] = useState("openai-compatible"),
    [thinking, setThinking] = useState(false),
    [reasoningEffort, setReasoningEffort] = useState("medium"),
    [model, setModel] = useState(""),
    [mode, setMode] = useState("finite"),
    [calls, setCalls] = useState(240),
    [tokens, setTokens] = useState(3000000),
    [deadline, setDeadline] = useState(""),
    [executionAccountingAccepted, setExecutionAccountingAccepted] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save({
          model: {
            route,
            model,
            ...(route === "codex-cli" ? { reasoningEffort } : {}),
            ...(route === "ollama" ? { thinking } : {}),
          },
          budget: {
            mode,
            callLimit: mode === "continuous" ? null : calls,
            tokenLimit: mode === "continuous" ? null : tokens,
            deadlineAt: mode === "continuous" ? null : new Date(deadline).toISOString(),
            ...(mode === "continuous" ? { continuousExecutionAccepted: true } : {}),
            perCallTokenLimit: 40000,
            maxOutputTokens: 2000,
            inputByteLimit: 24000,
            maxCallsPerTurn: 3,
            maxActionsPerTurn: 3,
            concurrency: 1,
            ...(route === "codex-cli" ? { executionAccountingAccepted } : {}),
          },
        });
      }}
    >
      <p className="eyebrow">OPERATOR CONSENT</p>
      <h2>Model & compute allowance</h2>
      <p className="muted">
        The endpoint and credentials come from private server configuration. Saving does not start the fleet.
      </p>
      <label>
        Route
        <select value={route} onChange={(e) => setRoute(e.target.value)}>
          <option value="openai-compatible">API provider</option>
          <option value="ollama">Private Ollama host</option>
          <option value="codex-cli">Codex CLI · ChatGPT subscription</option>
        </select>
      </label>
      <label>
        Exact model name
        <input required value={model} onChange={(e) => setModel(e.target.value)} placeholder="Select before launch" />
      </label>
      {route === "codex-cli" && (
        <label>
          Reasoning effort · must be supported by the selected model
          <select value={reasoningEffort} onChange={(e) => setReasoningEffort(e.target.value)}>
            {["low", "medium", "high", "xhigh", "max"].map((effort) => (
              <option key={effort} value={effort}>
                {effort}
              </option>
            ))}
          </select>
        </label>
      )}
      {route === "ollama" && (
        <label className="execution-consent">
          <input type="checkbox" checked={thinking} onChange={(e) => setThinking(e.target.checked)} />
          <span>Enable model thinking · selected model must support this option</span>
        </label>
      )}
      <label>
        Budget period
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="finite">Total, fixed experiment</option>
          <option value="daily">Recurring daily, UTC midnight</option>
          <option value="continuous">Until stopped · no total allowance or end date</option>
        </select>
      </label>
      {mode !== "continuous" && (
        <div className="form-row">
          <label>
            {route === "codex-cli" ? "Maximum Codex executions" : "Maximum calls"}
            <input required type="number" min={1} value={calls} onChange={(e) => setCalls(Number(e.target.value))} />
          </label>
          <label>
            Token allocation
            <input
              required
              type="number"
              min={40000}
              value={tokens}
              onChange={(e) => setTokens(Number(e.target.value))}
            />
          </label>
        </div>
      )}
      {mode === "continuous" && (
        <p className="muted">
          Runs until you pause or stop it, with no lifetime call/token ceiling or automatic end date. Every turn remains
          bounded and all usage is retained. Provider limits, uncertain results and excessive per-execution usage can
          still pause admission. Saving explicitly accepts continuous execution; it does not start agents.
        </p>
      )}
      {route === "codex-cli" && (
        <label className="execution-consent">
          <input
            type="checkbox"
            required
            checked={executionAccountingAccepted}
            onChange={(e) => setExecutionAccountingAccepted(e.target.checked)}
          />
          <span>
            Each execution can contain multiple model calls. The 40,000-token reservation is not a hard cap. Unknown or
            excessive usage pauses the cohort. All agents share my subscription limits. I accept this accounting.
          </span>
        </label>
      )}
      {mode !== "continuous" && (
        <label>
          Original deadline, browser local time
          <input type="datetime-local" required value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </label>
      )}
      <p className="muted">
        The picker uses this browser's timezone; the saved deadline is an exact UTC instant. Usage is recorded
        separately from reserved allowance.
      </p>
      <button type="submit" className="primary" disabled={busy}>
        Save selection
      </button>
    </form>
  );
}
function ConfigurationForm({
  mode,
  gameKinds,
  initial,
  busy,
  save,
}: {
  mode: "permissions" | "provision";
  gameKinds: string[];
  initial: Obj | null | undefined;
  busy: boolean;
  save: (data: unknown) => void;
}) {
  const [selected, setSelected] = useState<string[]>(
      Array.isArray(initial?.allowedKinds) ? (initial.allowedKinds as string[]) : [],
    ),
    [cap, setCap] = useState(Number(initial?.maxCommands ?? 100)),
    [iron, setIron] = useState(1000),
    [silver, setSilver] = useState(1000),
    [grain, setGrain] = useState(1000),
    [reserve, setReserve] = useState(20),
    [troops, setTroops] = useState(0),
    [socialDecisions, setSocialDecisions] = useState(false);
  const options =
    mode === "permissions"
      ? gameKinds
      : [
          "world.read",
          "inbox.read",
          "message.send.contact",
          "contact.request",
          "building.queue",
          "training.queue",
          "supply.sign",
          "scout.start",
          "raid.commit",
          "transfer",
        ];
  const label = (s: string) =>
    s
      .replace(/^game\./, "")
      .replaceAll(".", " ")
      .replaceAll("_", " ");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(
          mode === "permissions"
            ? { allowedKinds: selected, maxCommands: cap }
            : {
                allowedActions: selected.length ? selected : ["world.read", "inbox.read", "message.send.contact"],
                resourceLimits: {
                  iron: String(BigInt(iron) * 600n),
                  silver: String(BigInt(silver) * 600n),
                  grain: String(BigInt(grain) * 600n),
                },
                reserveFloors: { grain: String(BigInt(reserve) * 600n) },
                troopLimit: troops,
                sessionLimit: 1,
                ...(socialDecisions ? { socialDelegation: { mode: "agent_decides", allowedKingdomIds: [] } } : {}),
              },
        );
      }}
    >
      <p className="eyebrow">EXPLICIT GAME AUTHORITY</p>
      <h2>{mode === "permissions" ? "Synthetic owner exceptions" : "Create a synthetic account"}</h2>
      <p className="muted">
        {mode === "permissions"
          ? "Selected gameplay actions can use the separate synthetic owner controller. Attached real accounts retain human approvals."
          : "Create this agent's own kingdom with the permissions below. The model receives no owner credentials. No inference starts."}
      </p>
      <div className="permission-list">
        {mode === "provision" && (
          <label className="check-label">
            <input type="checkbox" checked={socialDecisions} onChange={(e) => setSocialDecisions(e.target.checked)} />
            <span>Let this synthetic agent accept or decline contact requests</span>
          </label>
        )}
        {options.map((k) => (
          <label className="check-label" key={k}>
            <input
              type="checkbox"
              checked={selected.includes(k)}
              onChange={(e) => setSelected((v) => (e.target.checked ? [...v, k] : v.filter((x) => x !== k)))}
            />
            <span>{label(k)}</span>
          </label>
        ))}
      </div>
      {mode === "permissions" ? (
        <label>
          Maximum owner decisions for this fleet
          <input
            required
            type="number"
            min={1}
            max={10000}
            value={cap}
            onChange={(e) => setCap(Number(e.target.value))}
          />
        </label>
      ) : (
        <>
          <div className="form-row">
            {[
              ["Iron allowance", iron, setIron],
              ["Silver allowance", silver, setSilver],
              ["Grain allowance", grain, setGrain],
            ].map(([title, value, setter]) => (
              <label key={String(title)}>
                {String(title)}
                <input
                  type="number"
                  min={0}
                  step={1}
                  required
                  value={Number(value)}
                  onChange={(e) => (setter as (v: number) => void)(Number(e.target.value))}
                />
              </label>
            ))}
          </div>
          <div className="form-row">
            <label>
              Protected grain reserve
              <input
                type="number"
                required
                min={0}
                step={1}
                value={reserve}
                onChange={(e) => setReserve(Number(e.target.value))}
              />
            </label>
            <label>
              Troop commitment limit
              <input
                type="number"
                required
                min={0}
                step={1}
                value={troops}
                onChange={(e) => setTroops(Number(e.target.value))}
              />
            </label>
          </div>
          <p className="muted">
            Resource amounts above are whole game units. Normal ownership, stock, prerequisites and game quotas always
            apply.
          </p>
        </>
      )}
      <button type="submit" className="primary" disabled={busy}>
        Save explicit permissions
      </button>
    </form>
  );
}
const root = document.getElementById("root");
if (!root) throw Error("ROOT_REQUIRED");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
