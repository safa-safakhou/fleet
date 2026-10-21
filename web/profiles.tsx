import { useCallback, useEffect, useState } from "react";
import { exactKey } from "./launch.js";

type Ref = { id: string; version: string };
type Preview = { profile: Ref; compatible: boolean; code: string; coverage: string; triggers?: string[] };
type Group = {
  cohortId: string;
  name: string;
  profile: Ref | null;
  configurationDigest: string;
  configurationDrift?: boolean;
  state: string;
  metrics: Record<string, number | string | null>;
  coverage: { details: string; materialOutcomes: string };
};
export function ProfileComparison({
  report,
  open,
}: {
  report: { cohorts: Group[]; coverage: string; design?: string; asOf?: string };
  open: (id: string) => void;
}) {
  return (
    <>
      <p className="muted">Snapshot {report.asOf ?? "time unavailable"}. Open the comparison again to refresh.</p>
      <p>
        {report.design ?? "Design unspecified"} · {report.coverage}
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Measure</th>
              {report.cohorts.map((g) => (
                <th key={g.cohortId}>
                  {g.name}
                  <p>{g.profile ? `${g.profile.id}@${g.profile.version}` : "Historical profile unavailable"}</p>
                  <small>{g.configurationDrift ? "Configuration changed since linking" : "Configuration pinned"}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ["turns", "Turns"],
              ["calls", "Calls"],
              ["committedActions", "Accepted commands"],
              ["unknownAllocatedTokens", "Unknown allocated tokens"],
              ["meanQueueDelayMs", "Mean queue delay (ms)"],
              ["meanFinishedDurationMs", "Mean finished duration (ms)"],
            ].map(([key, label]) => (
              <tr key={key}>
                <th>{label}</th>
                {report.cohorts.map((g) => (
                  <td key={g.cohortId}>{g.metrics[key] ?? "Unmeasured"}</td>
                ))}
              </tr>
            ))}
            <tr>
              <th>Material outcomes</th>
              {report.cohorts.map((g) => (
                <td key={g.cohortId}>{g.coverage.materialOutcomes}</td>
              ))}
            </tr>
            <tr>
              <th>Evidence</th>
              {report.cohorts.map((g) => (
                <td key={g.cohortId}>
                  <button type="button" onClick={() => open(g.cohortId)}>
                    Inspect fleet
                  </button>
                  <p>{g.coverage.details}</p>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
export function ProfileWorkspace({
  api,
  cohorts,
  open,
  created,
}: {
  api: <T>(path: string, body?: unknown) => Promise<T>;
  cohorts: { id: string; name: string }[];
  open: (id: string) => void;
  created: (id: string) => Promise<void>;
}) {
  const [catalog, setCatalog] = useState<{
      environment: Ref & { instanceId: string };
      capabilities: { events: string };
      profiles: Preview[];
    } | null>(null),
    [selected, setSelected] = useState(exactKey({ id: "legacy-loop", version: "1" })),
    [eventWake, setEventWake] = useState(false),
    [categories, setCategories] = useState("raid,offer,contract,completion,conversation,resource"),
    [name, setName] = useState(""),
    [count, setCount] = useState(5),
    [interval, setInterval] = useState(15),
    [chosen, setChosen] = useState<string[]>([]),
    [design, setDesign] = useState("unspecified"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [links, setLinks] = useState<{ id: string; name: string }[]>([]),
    [report, setReport] = useState<{ cohorts: Group[]; coverage: string; design?: string; asOf?: string } | null>(null);
  const load = useCallback(async () => {
    setCatalog(await api("/profiles"));
    setLinks((await api<{ comparisons: typeof links }>("/profile-comparisons")).comparisons);
  }, [api]);
  useEffect(() => {
    void load().catch((e) => setError(String(e.message)));
  }, [load]);
  const work = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };
  const preview = catalog?.profiles.find((p) => exactKey(p.profile) === selected);
  const download = (scope: "private" | "shareable") =>
    work(async () => {
      const data = await api("/reports/export", { scope, cohortIds: chosen });
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `fleet-${scope}-report.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  return (
    <section className="comparison-workspace">
      <article className="panel">
        <h2>Engine profiles</h2>
        <p>
          Operate a fleet with no study. Choose its engine before execution; configure the model, allowance, accounts
          and start separately in Fleet settings.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {catalog && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void work(async () => {
                const result = await api<{ cohortId: string }>("/profiles/drafts", {
                  name,
                  count,
                  intervalMinutes: interval,
                  seed: crypto.randomUUID(),
                  strategies: ["guardian", "expansionist", "merchant", "diplomat", "opportunist"],
                  profile: preview?.profile,
                  ...(eventWake && preview?.triggers?.includes("event")
                    ? {
                        wakePolicy: {
                          enabled: true,
                          categories: categories
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                          quietCategories: [],
                          periodicReviewMinutes: interval,
                        },
                      }
                    : {}),
                });
                await created(result.cohortId);
              });
            }}
          >
            <p>
              Environment: {catalog.environment.id}@{catalog.environment.version} · {catalog.environment.instanceId}
            </p>
            <label>
              Engine
              <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                {catalog.profiles.map((p) => (
                  <option key={exactKey(p.profile)} value={exactKey(p.profile)}>
                    {p.profile.id}@{p.profile.version}
                  </option>
                ))}
              </select>
            </label>
            <p role="status">
              {preview?.compatible
                ? "Compatible capabilities; provider qualification separate"
                : `Unavailable: ${preview?.code ?? "Unknown profile"}`}
            </p>
            <p className="muted">{preview?.coverage}</p>
            <label>
              Fleet name
              <input required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="form-row">
              <label>
                Draft agents
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
                Timed review
                <select value={interval} onChange={(e) => setInterval(Number(e.target.value))}>
                  {[5, 10, 15, 30, 60].map((n) => (
                    <option key={n} value={n}>
                      {n} minutes
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p>
              No game accounts or model calls. Event wakes remain off unless explicitly configured. A consumed profile
              is immutable.
            </p>
            {catalog.capabilities.events !== "none" && preview?.triggers?.includes("event") && (
              <>
                <label className="profile-event-toggle">
                  <input type="checkbox" checked={eventWake} onChange={(e) => setEventWake(e.target.checked)} />
                  Enable event wakes on future start
                </label>
                {eventWake && (
                  <label>
                    Event categories, comma separated
                    <input value={categories} onChange={(e) => setCategories(e.target.value)} />
                  </label>
                )}
              </>
            )}
            <button className="primary" type="submit" disabled={busy || !preview?.compatible}>
              Create inactive profile draft
            </button>
          </form>
        )}
      </article>
      <article className="panel">
        <h2>Optional cohort comparison</h2>
        <p>
          Link 2–10 existing cohorts. Ownership, history, models and allowances remain with each fleet. No automatic
          ranking.
        </p>
        <label>
          Comparison design
          <select value={design} onChange={(e) => setDesign(e.target.value)}>
            <option value="unspecified">Unspecified</option>
            <option value="interacting_world">One interacting world</option>
            <option value="independent_replicas">Independent replicas (operator declaration)</option>
          </select>
        </label>
        <div className="profile-cohorts">
          {cohorts.map((c) => (
            <label key={c.id}>
              <input
                type="checkbox"
                checked={chosen.includes(c.id)}
                disabled={!chosen.includes(c.id) && chosen.length >= 10}
                onChange={(e) => setChosen(e.target.checked ? [...chosen, c.id] : chosen.filter((id) => id !== c.id))}
              />
              {c.name}
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={busy || chosen.length < 2}
          onClick={() =>
            void work(async () => {
              const link = await api<{ id: string }>("/profile-comparisons", {
                requestId: crypto.randomUUID(),
                name: `${chosen.length} cohort comparison`,
                cohortIds: chosen,
                design,
              });
              await load();
              setReport(await api(`/profile-comparisons/${link.id}`));
            })
          }
        >
          Link selected cohorts
        </button>
        <p>
          {links.map((l) => (
            <button
              key={l.id}
              type="button"
              disabled={busy}
              onClick={() =>
                void work(async () => {
                  setReport(await api(`/profile-comparisons/${l.id}`));
                })
              }
            >
              {l.name}
            </button>
          ))}
        </p>
        {report && <ProfileComparison report={report} open={open} />}
        <h3>Report downloads</h3>
        <p>
          Select one or more fleets above. Private reports include retained consented evidence; shareable reports
          contain allowlisted aggregates with definitions and coverage. Inspect aggregates before sharing.
        </p>
        <button type="button" disabled={busy || !chosen.length} onClick={() => void download("private")}>
          Download private evidence
        </button>
        <button type="button" disabled={busy || !chosen.length} onClick={() => void download("shareable")}>
          Download shareable aggregates
        </button>
      </article>
    </section>
  );
}
