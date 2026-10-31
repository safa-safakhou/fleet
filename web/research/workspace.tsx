import { useCallback, useEffect, useRef, useState } from "react";
import { ResearchAPI } from "./api.js";
import { CausalGraph } from "./causal-graph.js";
import { ContextInspector } from "./context.js";
import { ResearchFilters, type TraceFilters } from "./filters.js";
import { ManifestInspector } from "./manifest.js";
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
  const ticket = useRef(0),
    api = useRef<ResearchAPI>(null);
  const clear = useCallback(() => {
    ticket.current++;
    setSnapshot(null);
    setPage(null);
    setSelected(null);
    setError("Private evidence unavailable: authorization, consent or retention changed.");
  }, []);
  if (!api.current) api.current = new ResearchAPI(clear);
  const load = useCallback(async () => {
    api.current!.dispose();
    ticket.current++;
    setSnapshot(null);
    setSelected(null);
    setPage(null);
    setError("");
    if (!runId) return;
    setBusy(true);
    try {
      const s = await api.current!.snapshot(runId);
      performance.mark("fleet.metadata.loaded");
      setSnapshot(s);
      const p = await api.current!.page(runId, s.id);
      setPage(p);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(`Evidence unavailable: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [runId]);
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
    setBusy(true);
    setSelected(null);
    try {
      setPage(await api.current!.page(runId, snapshot.id, page.nextCursor, filters.kind, filters.stream));
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
      void api
        .current!.page(runId, snapshot.id, undefined, f.kind, f.stream)
        .then(setPage)
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
          <nav aria-label="Research views">
            {["timeline", "causal", "context", "manifest"].map((x) => (
              <button type="button" key={x} aria-pressed={view === x} onClick={() => setView(x)}>
                {
                  { timeline: "Timeline", causal: "Causal graph", context: "Context & lineage", manifest: "Manifest" }[
                    x
                  ]
                }
              </button>
            ))}
          </nav>
          <ResearchFilters
            value={filters}
            onChange={changeFilters}
            kinds={[...new Set(page?.events.map((e) => e.kind))].sort()}
            streams={[...new Set(page?.events.map((e) => e.streamId))].sort()}
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
