import { useEffect, useRef, useState } from "react";
import type { ResearchAPI } from "./api.js";
import { scheduleExpiry } from "./expiry.js";
import { LineageInspector } from "./lineage.js";
import { ResearchTable } from "./table.js";
import type { ArtifactChunk, ContextLineage, EvidenceEvent } from "./types.js";
export const object = (v: unknown): Record<string, any> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {};
export function contextView(raw: unknown) {
  const root = object(raw),
    wire = object(root.wire ?? root),
    lineage = object(root.lineage),
    messages = Array.isArray(wire.messages)
      ? wire.messages.filter((m: any) => typeof m.role === "string" && typeof m.content === "string")
      : [];
  return {
    messages: messages as { role: string; content: string }[],
    schema: wire.schema ?? wire.format ?? object(object(wire.response_format).json_schema).schema ?? null,
    lineage: {
      spans: Array.isArray(lineage.spans) ? (lineage.spans as ContextLineage["spans"]) : [],
      omitted: Array.isArray(lineage.omitted) ? (lineage.omitted as ContextLineage["omitted"]) : [],
      mandatoryCoverage: lineage.mandatoryCoverage ?? null,
    },
    lineageRef: object(root.contextLineageRef).id as string | undefined,
    parameters: {
      model: wire.model ?? null,
      maxOutputTokens: wire.maxOutputTokens ?? wire.max_tokens ?? null,
      temperature: wire.temperature ?? null,
      topP: wire.top_p ?? null,
    },
    accounting: root.accounting ?? null,
  };
}
export function SourceSpan({ text, startByte, endByte }: { text: string; startByte: number; endByte: number }) {
  const bytes = new TextEncoder().encode(text),
    decoder = new TextDecoder(),
    windowStart = Math.max(0, Math.min(bytes.length, startByte) - 2048),
    windowEnd = Math.min(bytes.length, windowStart + 65536);
  return (
    <pre>
      {decoder.decode(bytes.slice(windowStart, Math.max(windowStart, startByte)))}
      <mark>{decoder.decode(bytes.slice(Math.max(windowStart, startByte), Math.min(windowEnd, endByte)))}</mark>
      {decoder.decode(bytes.slice(Math.min(windowEnd, endByte), windowEnd))}
    </pre>
  );
}
export function ContextInspector({
  runId,
  snapshotId,
  event,
  api,
}: {
  runId: string;
  snapshotId: string;
  event: EvidenceEvent;
  api: ResearchAPI;
}) {
  const [chunk, setChunk] = useState<ArtifactChunk | null>(null),
    [artifactId, setArtifactId] = useState(""),
    [sourceVia, setSourceVia] = useState<string | undefined>(),
    [error, setError] = useState(""),
    [tab, setTab] = useState("packet"),
    [textOffset, setTextOffset] = useState(0),
    [highlight, setHighlight] = useState<ContextLineage["spans"][number] | null>(null),
    [previous, setPrevious] = useState<{ text: string; expiresAt: string; id: string; via?: string } | null>(null),
    [diff, setDiff] = useState(false);
  const epoch = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: switching evidence identity must erase private state.
  useEffect(() => {
    epoch.current++;
    setChunk(null);
    setPrevious(null);
    setArtifactId("");
    setError("");
    return () => {
      epoch.current++;
    };
  }, [event.id]);
  const load = async (id: string, index = 0, via?: string) => {
    setSourceVia(via);
    const t = ++epoch.current;
    setChunk(null);
    setTextOffset(0);
    setHighlight(null);
    setError("");
    setArtifactId(id);
    try {
      const c = await api.chunk(runId, snapshotId, id, index, via);
      if (epoch.current === t) {
        if (c.expiresAt && Date.parse(c.expiresAt) <= Date.now()) throw Error("SOURCE_EXPIRED");
        setChunk(c);
      }
    } catch {
      if (epoch.current === t) {
        setChunk(null);
        setPrevious(null);
        setError("Private source unavailable or expired.");
      }
    }
  };
  useEffect(() => {
    if (!chunk?.expiresAt) return;
    return scheduleExpiry(chunk.expiresAt, () => {
      epoch.current++;
      setChunk(null);
      setPrevious(null);
      setError("Private source expired.");
    });
  }, [chunk]);
  useEffect(() => {
    if (!previous) return;
    return scheduleExpiry(previous.expiresAt, () => {
      setPrevious(null);
      setDiff(false);
    });
  }, [previous]);
  const bytes = chunk ? Uint8Array.from(atob(chunk.body), (c) => c.charCodeAt(0)) : null,
    text = bytes ? new TextDecoder().decode(bytes) : "";
  let raw: unknown = null;
  if (chunk?.complete) {
    try {
      raw = JSON.parse(text);
    } catch {}
  }
  const view = contextView(raw),
    shown = text.slice(textOffset, textOffset + 65536),
    span = highlight && view.messages[highlight.messageIndex];
  return (
    <section aria-label="Context inspector">
      <h2>Context & lineage inspector</h2>
      <p>
        Captured event {event.id} · stream {event.streamId}. Provider-boundary artifacts establish delivered input;
        assembly packets retain their recorded role. Payloads are plain text.
      </p>
      <div className="research-actions">
        {event.artifacts.map((a) => (
          <button type="button" key={a.id} onClick={() => void load(a.id)}>
            Load artifact {a.id}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      {chunk && (
        <>
          <p>
            {chunk.complete ? "Complete artifact" : "Partial body"} · chunk {chunk.index + 1}/{chunk.chunks} ·{" "}
            {chunk.bytes}/{chunk.totalBytes} bytes · at most65536 characters displayed. Split UTF8 code points may need
            adjacent chunks.
          </p>
          <button
            type="button"
            disabled={chunk.index === 0}
            onClick={() => void load(artifactId, chunk.index - 1, sourceVia)}
          >
            Previous artifact chunk
          </button>
          <button
            type="button"
            disabled={chunk.index + 1 >= chunk.chunks}
            onClick={() => void load(artifactId, chunk.index + 1, sourceVia)}
          >
            Next artifact chunk
          </button>
          <p>
            Text viewport characters [{textOffset},{Math.min(text.length, textOffset + 65536)}). UTF8 rendering can
            replace binary or split code points; the encrypted archive retains exact bytes.
          </p>
          <button
            type="button"
            disabled={textOffset === 0}
            onClick={() => setTextOffset(Math.max(0, textOffset - 65536))}
          >
            Previous text window
          </button>
          <button
            type="button"
            disabled={textOffset + 65536 >= text.length}
            onClick={() => setTextOffset(textOffset + 65536)}
          >
            Next text window
          </button>
          <nav aria-label="Artifact views">
            {["packet", "schema", "parameters", "bytes", "lineage"].map((k) => (
              <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>
                {k === "bytes" ? "Captured bytes" : k}
              </button>
            ))}
          </nav>
          {tab === "bytes" ? (
            <section aria-label="Captured artifact text">
              <pre>
                {shown}
                {textOffset + shown.length < text.length ? "\n[Display window ends; original bytes retained]" : ""}
              </pre>
            </section>
          ) : !chunk.complete ? (
            <p>Structured inspection unavailable for partial body. Use bounded chunk text.</p>
          ) : (
            <>
              {tab === "packet" && (
                <>
                  <p>Mandatory source coverage: {JSON.stringify(view.lineage.mandatoryCoverage ?? "unavailable")}</p>
                  <ResearchTable
                    caption="Omitted sources (all recorded reasons)"
                    headers={["Source", "Reason"]}
                    rows={view.lineage.omitted.map((x) => ({ id: x.id, cells: [x.id, x.reason] }))}
                  />
                  <ResearchTable
                    caption="Selected source spans"
                    headers={["Source / classification", "Transform / UTF8 span", "Inspect"]}
                    rows={view.lineage.spans.map((s) => ({
                      id: s.id,
                      cells: [
                        `${s.id} / ${s.sourceClass}`,
                        `${s.transform} / message ${s.messageIndex} bytes ${s.startByte}–${s.endByte}`,
                        <button key={s.id} type="button" onClick={() => setHighlight(s)}>
                          Highlight {s.id}
                        </button>,
                      ],
                    }))}
                  />
                  {span && highlight ? (
                    <SourceSpan text={span.content} startByte={highlight.startByte} endByte={highlight.endByte} />
                  ) : (
                    <section aria-label="Captured messages">
                      <pre>{JSON.stringify(view.messages, null, 2).slice(0, 65536)}</pre>
                    </section>
                  )}
                  {view.lineageRef && (
                    <button type="button" onClick={() => void load(view.lineageRef!)}>
                      Inspect recorded assembly lineage
                    </button>
                  )}
                  {view.lineage.spans
                    .flatMap((s) => s.sourceRefs)
                    .filter((id, i, a) => a.indexOf(id) === i)
                    .map((id) => (
                      <button type="button" key={id} onClick={() => void load(id, 0, artifactId)}>
                        Inspect source {id}
                      </button>
                    ))}
                </>
              )}
              {tab === "schema" && (
                <section aria-label="Captured schema">
                  <pre>{JSON.stringify(view.schema, null, 2).slice(0, 65536)}</pre>
                </section>
              )}
              {tab === "parameters" && (
                <pre>{JSON.stringify({ parameters: view.parameters, accounting: view.accounting }, null, 2)}</pre>
              )}
              {tab === "lineage" && <LineageInspector runId={runId} sourceId={artifactId} body={raw} />}
            </>
          )}
          <button
            type="button"
            disabled={!chunk.complete}
            onClick={() => {
              setPrevious({
                text,
                expiresAt: chunk.expiresAt ?? new Date().toISOString(),
                id: artifactId,
                via: sourceVia,
              });
              setDiff(false);
            }}
          >
            Pin this recorded revision for comparison
          </button>
          <button
            type="button"
            disabled={!previous || !chunk.complete}
            onClick={() => {
              setDiff(false);
              if (previous)
                void api
                  .chunk(runId, snapshotId, previous.id, 0, previous.via)
                  .then(() => setDiff(true))
                  .catch(() => {
                    setPrevious(null);
                    setError("Pinned revision unavailable.");
                  });
            }}
          >
            Compare recorded revisions
          </button>
          {diff && previous && (
            <div className="research-grid">
              <pre>{previous.text.slice(0, 65536)}</pre>
              <pre>{shown}</pre>
            </div>
          )}
        </>
      )}
    </section>
  );
}
