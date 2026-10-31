import { useCallback, useEffect, useRef, useState } from "react";
import { ResearchAPI } from "./api.js";
import { ArchiveExport } from "./archive.js";
import { CausalGraph } from "./causal-graph.js";
import { ResearchComparison } from "./comparison.js";
import { ContextInspector } from "./context.js";
import { ResearchFilters, type TraceFilters } from "./filters.js";
import { ManifestInspector } from "./manifest.js";
import { ResourceDashboard } from "./resources.js";
import { researchRoute, runLink } from "./route.js";
import { RunTimeline } from "./timeline.js";
import type { EventPage, InspectedEvent, RunSnapshot } from "./types.js";
import "./styles.css";
export function ResearchWorkspace({ runId: initialRunId }: { runId?: string }) {
  const [runId, setRunId] = useState(initialRunId ?? ""),
    [entry, setEntry] = useState(initialRunId ?? ""),
    [snapshot, setSnapshot] = useState<RunSnapshot | null>(null),
    [page, setPage] = useState<EventPage | null>(null),
    [selected, setSelected] = useState<InspectedEvent | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [filters, setFilters] = useState<TraceFilters>({ search: "", kind: "", stream: "", zoom: 1 }),
    [view, setView] = useState("timeline");
  const knownKinds = useRef(new Set<string>()),
    knownStreams = useRef(new Set<string>());
  const receivePage = useCallback((p: EventPage) => {
    for (const e of p.events) {
      knownKinds.current.add(e.kind);
      if (knownStreams.current.size < 200) knownStreams.current.add(e.streamId);
    }
    setPage(p);
  }, []);
  const scopeEpoch = useRef(0),
    pageEpoch = useRef(0);
  const ticket = useRef(0),
    api = useRef<ResearchAPI>(null);
  const clear = useCallback(() => {
    ticket.current++;
    scopeEpoch.current++;
    pageEpoch.current++;
    api.current?.dispose();
    knownKinds.current.clear();
    knownStreams.current.clear();
    setSnapshot(null);
    setPage(null);
    setSelected(null);
    setError("Private evidence unavailable: authorization, consent or retention changed.");
  }, []);
  if (!api.current) api.current = new ResearchAPI(clear);
  const load = useCallback(async () => {
    api.current!.dispose();
    const scopeVersion = ++scopeEpoch.current;
    pageEpoch.current++;
    ticket.current++;
    setSnapshot(null);
    setSelected(null);
    setPage(null);
    setError("");
    if (!runId) return;
    setBusy(true);
    try {
      const s = await api.current!.snapshot(runId);
      if (scopeVersion !== scopeEpoch.current) return;
      performance.mark("fleet.metadata.loaded");
      setSnapshot(s);
      const p = await api.current!.page(runId, s.id);
      if (scopeVersion === scopeEpoch.current) receivePage(p);
    } catch (e) {
      if (scopeVersion === scopeEpoch.current && (e as Error).name !== "AbortError")
        setError(`Evidence unavailable: ${(e as Error).message}`);
    } finally {
      if (scopeVersion === scopeEpoch.current) setBusy(false);
    }
  }, [runId, receivePage]);
  useEffect(() => {
    void load();
    return () => api.current!.dispose();
  }, [load]);
  useEffect(() => {
    if (!snapshot) return;
    const check = () => {
      void api
        .current!.request(`/runs/${encodeURIComponent(runId)}/coverage?snapshotId=${snapshot.id}`)
        .catch(() => clear());
    };
    const timer = setInterval(check, 15000);
    const expiry = setTimeout(clear, Math.max(0, Date.parse(snapshot.expiresAt) - Date.now()));
    window.addEventListener("focus", check);
    window.addEventListener("pagehide", clear);
    window.addEventListener("fleet:logout", clear);
    return () => {
      clearInterval(timer);
      clearTimeout(expiry);
      window.removeEventListener("focus", check);
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("fleet:logout", clear);
    };
  }, [snapshot, runId, clear]);
  const select = useCallback(
    async (id: string) => {
      if (!snapshot) return;
      const t = ++ticket.current;
      setSelected(null);
      try {
        const e = await api.current!.event(runId, snapshot.id, id);
        if (t === ticket.current) {
          setSelected(e);
          if (location.hash !== runLink(runId, id)) history.replaceState(null, "", runLink(runId, id));
        }
      } catch (e) {
        setError(`Source unavailable: ${(e as Error).message}`);
      }
    },
    [snapshot, runId],
  );
  useEffect(() => {
    const r = researchRoute(location.hash);
    if (snapshot && r?.kind === "run" && r.eventId) void select(r.eventId);
  }, [snapshot, select]);
  useEffect(() => {
    if (page) {
      requestAnimationFrame(() => {
        performance.mark("fleet.timeline.ready");
        performance.measure("fleet.timeline.interaction", "fleet.metadata.loaded", "fleet.timeline.ready");
      });
    }
  }, [page]);
  const next = async () => {
    if (!snapshot || !page?.nextCursor) return;
    const g = scopeEpoch.current,
      p = ++pageEpoch.current;
    setBusy(true);
    setSelected(null);
    try {
      const next = await api.current!.page(runId, snapshot.id, page.nextCursor, filters.kind, filters.stream);
      if (g === scopeEpoch.current && p === pageEpoch.current) receivePage(next);
    } catch (e) {
      setError(`Page unavailable: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  const changeFilters = (f: TraceFilters) => {
    setFilters(f);
    if (snapshot && (f.kind !== filters.kind || f.stream !== filters.stream)) {
      setSelected(null);
      setPage(null);
      const g = scopeEpoch.current,
        p = ++pageEpoch.current;
      void api
        .current!.page(runId, snapshot.id, undefined, f.kind, f.stream)
        .then((next) => {
          if (g === scopeEpoch.current && p === pageEpoch.current) receivePage(next);
        })
        .catch((e) => setError(`Page unavailable: ${e.message}`));
    }
  };
  const events = (page?.events ?? []).filter(
    (e) =>
      !filters.search ||
      `${e.id} ${e.kind} ${e.streamId} ${e.attributes.code ?? ""}`.toLowerCase().includes(filters.search.toLowerCase()),
  );
  return (
    <main className="research-studio">
      <header>
        <p>FLEET / RESEARCH · RECORDED EVIDENCE</p>
        <h1>Research studio</h1>
        <a href="#research">Open another recorded run</a> · <a href="/">Operations console</a>
      </header>
      <form
        className="research-actions"
        onSubmit={(e) => {
          e.preventDefault();
          setRunId(entry);
          location.hash = runLink(entry);
        }}
      >
        <label>
          Run identifier <input value={entry} onChange={(e) => setEntry(e.target.value)} required />
        </label>
        <button type="submit">Inspect recorded run</button>
        <button type="button" onClick={() => void load()}>
          Refresh authorization
        </button>
      </form>
      {busy && <p role="status">Loading authorized evidence…</p>}
      {error && <p role="alert">{error}</p>}
      {snapshot && (
        <>
          <section>
            <h2>Run overview</h2>
            <div className="research-kpis">
              <article>
                <span>Recorded population</span>
                <strong>{snapshot.total} recorded events</strong>
              </article>
              <article>
                <span>Evidence completeness</span>
                <strong>{snapshot.coverage.status}</strong>
                <span>
                  {snapshot.coverage.recorded}/{snapshot.coverage.expected} required records
                </span>
              </article>
              <article>
                <span>Native cohort state</span>
                <strong>
                  {snapshot.native.cohorts?.map((c) => c.state ?? "unavailable").join(", ") || "unavailable"}
                </strong>
              </article>
              <article>
                <span>Profile / manifest</span>
                <strong>
                  {String((snapshot.manifest as { profile?: { id?: string } })?.profile?.id ?? "unavailable")}
                </strong>
                <code>{snapshot.manifestDigest}</code>
              </article>
            </div>
            <p>
              Run {runId} · snapshot {snapshot.id} · cutoff {snapshot.maximumOrdinal} · expires {snapshot.expiresAt}
            </p>
            <p>
              Unknown or blocked work:{" "}
              {snapshot.native.allocations
                .filter((a) => ["unknown", "reserved"].includes(a.status))
                .map((a) => `${a.id}: ${a.status}`)
                .join("; ") || "none in frozen native metadata"}
            </p>
            {snapshot.coverage.missing.map((g) => (
              <p className="research-warning" key={`${g.kind}:${g.sourceId}`}>
                Recording gap: {g.kind} / {g.sourceId}
              </p>
            ))}
          </section>
          <ArchiveExport runId={runId} snapshotId={snapshot.id} api={api.current!} />
          <nav aria-label="Research views">
            {["timeline", "causal", "context", "manifest", "resources"].map((x) => (
              <button type="button" key={x} aria-pressed={view === x} onClick={() => setView(x)}>
                {
                  {
                    timeline: "Timeline",
                    causal: "Causal graph",
                    context: "Context & lineage",
                    manifest: "Manifest",
                    resources: "Resources & outcomes",
                  }[x]
                }
              </button>
            ))}
          </nav>
          <ResearchFilters
            value={filters}
            onChange={changeFilters}
            kinds={[...knownKinds.current].sort()}
            streams={[...knownStreams.current].sort()}
          />
          <p>
            Showing {events.length} of {page?.total ?? snapshot.total} matching events. Metadata is page bounded; search
            applies to loaded events.
          </p>
          {view === "timeline" ? (
            <RunTimeline
              snapshotId={snapshot.id}
              events={events}
              selectedEventId={selected?.id}
              onSelect={(id) => void select(id)}
              zoom={filters.zoom}
            />
          ) : view === "resources" ? (
            <ResourceDashboard
              allocations={snapshot.native.allocations}
              snapshotId={snapshot.id}
              runId={runId}
              api={api.current!}
              events={events}
              onSelect={(id) => void select(id)}
            />
          ) : view === "context" ? (
            selected ? (
              <ContextInspector
                key={selected.id}
                runId={runId}
                snapshotId={snapshot.id}
                event={selected}
                api={api.current!}
              />
            ) : (
              <p>Select a recorded event to inspect its context and lineage.</p>
            )
          ) : view === "manifest" ? (
            <ManifestInspector manifestDigest={snapshot.manifestDigest} manifest={snapshot.manifest} />
          ) : (
            <CausalGraph
              snapshotId={snapshot.id}
              events={events}
              selectedEventId={selected?.id}
              onSelect={(id) => void select(id)}
            />
          )}
          <button type="button" disabled={busy || !page?.hasMore} onClick={() => void next()}>
            Load next event page
          </button>
          {selected && (
            <section aria-label="Selected event">
              <h2>{selected.kind}</h2>
              {selected.traceparent && (
                <p>
                  OTel trace correlation <code>{selected.traceparent}</code>
                </p>
              )}
              <p>
                {selected.id} · stream {selected.streamId} · sequence {selected.sequence} · {selected.coverage.status}
              </p>
              <p>
                Occurrence {selected.occurredAt} · ingestion {selected.recordedAt}.{" "}
                {selected.processId ? `Process ${selected.processId}` : "No comparable process clock recorded"}
              </p>
              {selected.parentIds.map((id) => (
                <button type="button" key={id} onClick={() => void select(id)}>
                  Inspect cause {id}
                </button>
              ))}
              <pre>{JSON.stringify(selected.attributes, null, 2)}</pre>
              <p>{selected.artifacts.length} private artifact references · bodies load only on explicit inspection.</p>
            </section>
          )}
        </>
      )}
    </main>
  );
}

export function ResearchStudio() {
  const [route, setRoute] = useState(researchRoute(location.hash)),
    [experiment, setExperiment] = useState("");
  useEffect(() => {
    const update = () => setRoute(researchRoute(location.hash));
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  if (route?.kind === "turn") return <RecordedTurnRuns key={route.turnId} turnId={route.turnId} />;
  if (route?.kind === "comparison")
    return <ResearchComparison key={route.snapshotId} experimentSnapshotId={route.snapshotId} />;
  return (
    <>
      <ResearchWorkspace
        key={route?.kind === "run" ? route.runId : "home"}
        runId={route?.kind === "run" ? route.runId : undefined}
      />
      {route?.kind !== "run" && (
        <section className="research-studio">
          <h2>Inspect a published experiment</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              location.hash = `research/comparison/${encodeURIComponent(experiment)}`;
            }}
          >
            <label>
              Experiment snapshot identifier
              <input value={experiment} onChange={(e) => setExperiment(e.target.value)} required />
            </label>
            <button type="submit">Open published comparison</button>
          </form>
        </section>
      )}
    </>
  );
}

function RecordedTurnRuns({ turnId }: { turnId: string }) {
  const [runs, setRuns] = useState<Pick<RunSnapshot, "runId" | "provenance">[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const api = new ResearchAPI(() => {
      if (active) {
        setRuns([]);
        setError("Recorded evidence unavailable.");
      }
    });
    void api
      .request<Pick<RunSnapshot, "runId" | "provenance">[]>(`/turns/${encodeURIComponent(turnId)}/runs`)
      .then((r) => {
        if (active) setRuns(r);
      })
      .catch(() => {
        if (active) setError("Recorded evidence unavailable.");
      });
    return () => {
      active = false;
      api.dispose();
    };
  }, [turnId]);
  return (
    <main className="research-studio">
      <h1>Recorded runs for turn</h1>
      <p>{turnId}</p>
      {error && <p role="alert">{error}</p>}
      {runs.map((r) => (
        <p key={r.runId}>
          <a href={runLink(r.runId)}>Open recorded run {r.runId}</a> · {r.provenance}
        </p>
      ))}
      {!runs.length && !error && <p>No authorized research run recorded for this turn.</p>}
      <a href="#research">Research studio</a>
    </main>
  );
}
