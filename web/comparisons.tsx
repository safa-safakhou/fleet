import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

type Obj = Record<string, unknown>;
type Api = <T>(path: string, body?: unknown) => Promise<T>;
type Preview = {
  template: Obj;
  arms: { key: string; name: string; model: Obj }[];
  totalAgents: number;
  totalCallLimit: number | null;
  totalTokenLimit: number | null;
  coverage: string;
};
type Report = {
  id: string;
  template: Obj;
  asOf: string;
  coverage: string;
  matchesTemplate: boolean;
  arms: {
    key: string;
    cohortId: string;
    name: string;
    state: string;
    connected: number;
    ready: number;
    anchorAt: string | null;
    observationConsent: boolean;
    metrics: Record<string, number | string>;
    cognition: Record<string, number> | null;
  }[];
};
function download(template: Obj) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(template, null, 2)], { type: "application/json" })),
    link = document.createElement("a");
  link.href = url;
  link.download = "fleet-comparison.json";
  link.click();
  URL.revokeObjectURL(url);
}
export function ComparisonWorkspace({
  api,
  openFleet,
  renderConfigure,
}: {
  api: Api;
  openFleet: (id: string) => void;
  renderConfigure: (save: (selection: Obj) => void, busy: boolean) => ReactNode;
}) {
  const [name, setName] = useState(""),
    [count, setCount] = useState(5),
    [intervalMinutes, setIntervalMinutes] = useState(15),
    [laya, setLaya] = useState(true),
    [seed, setSeed] = useState<string>(() => crypto.randomUUID()),
    [stage, setStage] = useState("details"),
    [preview, setPreview] = useState<Preview | null>(null),
    [importText, setImportText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [items, setItems] = useState<{ id: string; name: string }[]>([]),
    [selected, setSelected] = useState(""),
    [report, setReport] = useState<Report | null>(null);
  const requestId = useRef(crypto.randomUUID());
  const list = useCallback(
    async () => setItems((await api<{ comparisons: { id: string; name: string }[] }>("/comparisons")).comparisons),
    [api],
  );
  useEffect(() => {
    void list().catch((e) => setError(e.message));
  }, [list]);
  useEffect(() => {
    setReport(null);
    if (!selected) return;
    let cancelled = false;
    const refresh = () =>
      void api<Report>(`/comparisons/${selected}`)
        .then((r) => {
          if (!cancelled) setReport(r);
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        });
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selected, api]);
  async function work(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }
  async function prepare(template: unknown) {
    const result = await api<Preview>("/comparisons/preview", template);
    setPreview(result);
    setStage("preview");
    requestId.current = crypto.randomUUID();
  }
  return (
    <section className="comparison-workspace">
      <article className="panel">
        <h2>Prepare a comparison</h2>
        <p className="muted">
          Five LLM-only agents and five with memory, reflection, plans and beliefs by default. Both use your selected
          LLM. Laya orders recall; the LLM decides.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {stage === "details" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setStage("configure");
            }}
          >
            <label>
              Name
              <input required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="form-row">
              <label>
                Agents in each group
                <input
                  required
                  type="number"
                  min={1}
                  max={500}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
              </label>
              <label>
                Turn interval
                <select value={intervalMinutes} onChange={(e) => setIntervalMinutes(Number(e.target.value))}>
                  {[10, 15, 30, 60].map((n) => (
                    <option key={n} value={n}>
                      {n} minutes
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Shared strategy seed
              <input required maxLength={80} value={seed} onChange={(e) => setSeed(e.target.value)} />
            </label>
            <label className="execution-consent">
              <input type="checkbox" checked={laya} onChange={(e) => setLaya(e.target.checked)} />
              <span>Enable Laya recall in the cognition group</span>
            </label>
            <p className="muted">
              Matching pairs receive identical strategy preferences. Initial game states and opponents still need
              review.
            </p>
            <button type="submit" className="primary">
              Choose shared model & allowance
            </button>
          </form>
        )}
        {stage === "configure" && (
          <>
            <button type="button" onClick={() => setStage("details")}>
              Back to groups
            </button>
            {renderConfigure(
              (selection) =>
                void work(() =>
                  prepare({
                    version: 1,
                    name,
                    countPerArm: count,
                    intervalMinutes,
                    seed,
                    strategies: ["guardian", "expansionist", "merchant", "diplomat", "opportunist"],
                    ...selection,
                    ...(laya ? { recallAssist: "laya-recall-v1" } : {}),
                  }),
                ),
              busy,
            )}
          </>
        )}
        {stage === "preview" && preview && (
          <>
            <h3>
              {String(preview.template.name)} · {preview.totalAgents} draft agents
            </h3>
            <div className="comparison-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Model selection</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.arms.map((a) => (
                    <tr key={a.key}>
                      <td>{a.name}</td>
                      <td>
                        <code>{JSON.stringify(a.model)}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              {preview.totalCallLimit === null
                ? "Until stopped; no combined lifetime ceiling."
                : `Combined ${preview.totalCallLimit} calls and ${preview.totalTokenLimit} allocated tokens per configured budget period.`}
            </p>
            <details>
              <summary>Shared allowance and configuration</summary>
              <pre>{JSON.stringify(preview.template, null, 2)}</pre>
            </details>
            <p className="muted">{preview.coverage}</p>
            <div className="header-actions">
              <button type="button" onClick={() => download(preview.template)}>
                Export template
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setStage("details");
                }}
              >
                Change setup
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() =>
                  void work(async () => {
                    const saved = await api<{ id: string }>("/comparisons", {
                      requestId: requestId.current,
                      template: preview.template,
                    });
                    setSelected(saved.id);
                    setStage("saved");
                    await list();
                  })
                }
              >
                Save two inactive drafts
              </button>
            </div>
          </>
        )}
        {stage === "saved" && (
          <>
            <p>
              Drafts saved. Connect accounts, choose permissions and observation consent, then review each fleet before
              starting it.
            </p>
            <button
              type="button"
              onClick={() => {
                setStage("details");
                setPreview(null);
              }}
            >
              Prepare another
            </button>
          </>
        )}
        <details>
          <summary>Import a portable template</summary>
          <label>
            Configuration JSON
            <textarea rows={8} value={importText} onChange={(e) => setImportText(e.target.value)} />
          </label>
          <button
            type="button"
            disabled={busy || !importText.trim()}
            onClick={() => void work(() => prepare(JSON.parse(importText)))}
          >
            Validate & preview import
          </button>
          <p className="muted">
            Templates contain configuration only. Provider endpoints, game integration, credentials and accounts belong
            to the destination host. Importing never starts agents.
          </p>
        </details>
      </article>
      <article className="panel">
        <h2>Saved comparisons</h2>
        <label>
          Choose comparison (latest 100)
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Choose a comparison</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        {items.length === 0 && <p className="muted">No comparison drafts saved.</p>}
        {report && (
          <>
            <p>
              {report.matchesTemplate
                ? "Model, allowance, interval and strategy pairs match the saved template."
                : "Configuration changed; groups no longer match the saved template. Review before interpreting results."}
            </p>
            <div className="comparison-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Recorded measure</th>
                    {report.arms.map((a) => (
                      <th key={a.key}>{a.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th>State</th>
                    {report.arms.map((a) => (
                      <td key={a.key}>{a.state}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Connected / ready</th>
                    {report.arms.map((a) => (
                      <td key={a.key}>
                        {a.connected} / {a.ready}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Start anchor (UTC)</th>
                    {report.arms.map((a) => (
                      <td key={a.key}>{a.anchorAt ?? "Not started"}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Private observation</th>
                    {report.arms.map((a) => (
                      <td key={a.key}>{a.observationConsent ? "Consented" : "Off; dialogue not measured"}</td>
                    ))}
                  </tr>
                  {[
                    ["turns", "Turns"],
                    ["committed_actions", "Committed actions"],
                    ["waits", "Waits"],
                    ["pending_commands", "Pending commands"],
                    ["calls", "Executions"],
                    ["unknown_calls", "Unknown usage"],
                    ["reserved_calls", "Reserved calls"],
                    ["allocated_tokens", "Charged allocation"],
                    ["input_tokens", "Reported input tokens"],
                    ["output_tokens", "Reported output tokens"],
                    ["incoming", "Retained incoming messages"],
                    ["outgoing", "Retained outgoing messages"],
                  ].map(([key, label]) => (
                    <tr key={key}>
                      <th>{label}</th>
                      {report.arms.map((a) => (
                        <td key={a.key}>{String(a.metrics[key])}</td>
                      ))}
                    </tr>
                  ))}
                  {[
                    ["decisionsWithRecall", "Decisions with recall"],
                    ["layaAccepted", "Laya pair accepted"],
                    ["layaDelivered", "Laya pair delivered"],
                    ["layaAbstained", "Laya abstentions"],
                    ["layaUnavailable", "Laya unavailable"],
                    ["beliefsRevised", "Accepted belief revisions"],
                    ["reflectionsAdded", "Accepted reflections"],
                    ["duplicateReflectionsSkipped", "Duplicate reflections skipped"],
                  ].map(([key, label]) => (
                    <tr key={key}>
                      <th>{label} · retained telemetry</th>
                      {report.arms.map((a) => (
                        <td key={a.key}>{a.cognition ? a.cognition[key] : "Not measured"}</td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <th>Evidence</th>
                    {report.arms.map((a) => (
                      <td key={a.key}>
                        <button type="button" onClick={() => openFleet(a.cohortId)}>
                          Inspect fleet & agents
                        </button>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="muted">
              As of {report.asOf}. {report.coverage}
            </p>
            <button type="button" onClick={() => download(report.template)}>
              Export configuration
            </button>
          </>
        )}
      </article>
    </section>
  );
}
