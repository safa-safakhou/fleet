import type { ArtifactChunk, ComparisonReport, EventPage, InspectedEvent, MetricSet, RunSnapshot } from "./types.js";
export class ResearchAPI {
  private controllers = new Set<AbortController>();
  constructor(readonly invalid: () => void = () => {}) {}
  dispose() {
    for (const c of this.controllers) c.abort();
    this.controllers.clear();
  }
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const c = new AbortController();
    this.controllers.add(c);
    try {
      const r = await fetch(`/api/research${path}`, {
        ...init,
        signal: c.signal,
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await r.json();
      if (!r.ok) {
        const code = data.error?.code ?? "EVIDENCE_UNAVAILABLE";
        if ([401, 403, 410].includes(r.status) || /WITHHELD|EXPIRED|FORBIDDEN|SESSION|CONSENT/.test(code)) {
          this.dispose();
          this.invalid();
        }
        throw Error(code);
      }
      return data as T;
    } finally {
      this.controllers.delete(c);
    }
  }
  async archive(runId: string, snapshotId: string, key: string, write: (part: Uint8Array) => Promise<void>) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw Error("EXPORT_KEY_REQUIRED");
    const c = new AbortController();
    this.controllers.add(c);
    try {
      const r = await fetch(
        `/api/research/runs/${encodeURIComponent(runId)}/export?snapshotId=${encodeURIComponent(snapshotId)}`,
        { credentials: "same-origin", cache: "no-store", headers: { "x-fleet-export-key": key }, signal: c.signal },
      );
      if (!r.ok) {
        this.dispose();
        this.invalid();
        throw Error("ARCHIVE_UNAVAILABLE");
      }
      if (!r.headers.get("content-type")?.includes("application/vnd.fleet.encrypted-archive") || !r.body)
        throw Error("ARCHIVE_INVALID");
      const reader = r.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (let i = 0; i < value.length; i += 1048576) {
            if (c.signal.aborted) throw Error("ARCHIVE_ABORTED");
            await write(value.subarray(i, i + 1048576));
          }
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
    } finally {
      this.controllers.delete(c);
    }
  }
  snapshot(runId: string) {
    return this.request<RunSnapshot>(`/runs/${encodeURIComponent(runId)}`);
  }
  page(runId: string, snapshotId: string, cursor?: string, kind?: string, streamId?: string) {
    const q = new URLSearchParams({ snapshotId, limit: "200" });
    if (cursor) q.set("cursor", cursor);
    if (kind) q.set("kind", kind);
    if (streamId) q.set("streamId", streamId);
    return this.request<EventPage>(`/runs/${encodeURIComponent(runId)}/events?${q}`);
  }
  event(runId: string, snapshotId: string, eventId: string) {
    return this.request<InspectedEvent>(
      `/runs/${encodeURIComponent(runId)}/events/${encodeURIComponent(eventId)}?snapshotId=${encodeURIComponent(snapshotId)}`,
    );
  }
  chunk(runId: string, snapshotId: string, artifactId: string, index: number, viaArtifactId?: string) {
    return this.request<ArtifactChunk>(
      `/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}/chunks/${index}?snapshotId=${encodeURIComponent(snapshotId)}${viaArtifactId ? `&viaArtifactId=${encodeURIComponent(viaArtifactId)}` : ""}`,
    );
  }
  metrics(runId: string) {
    return this.request<{ id: string; metrics: MetricSet }[]>(`/runs/${encodeURIComponent(runId)}/metric-sets`);
  }
  comparison(id: string) {
    return this.request<ComparisonReport>(`/experiment-snapshots/${encodeURIComponent(id)}`);
  }
}
