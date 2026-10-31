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
  chunk(runId: string, snapshotId: string, artifactId: string, index: number) {
    return this.request<ArtifactChunk>(
      `/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}/chunks/${index}?snapshotId=${encodeURIComponent(snapshotId)}`,
    );
  }
  metrics(runId: string) {
    return this.request<{ id: string; metrics: MetricSet }[]>(`/runs/${encodeURIComponent(runId)}/metric-sets`);
  }
  comparison(id: string) {
    return this.request<ComparisonReport>(`/experiment-snapshots/${encodeURIComponent(id)}`);
  }
}
