export type ResearchRoute =
  | { kind: "run"; runId: string; eventId?: string }
  | { kind: "comparison"; snapshotId: string }
  | { kind: "home" };
export function researchRoute(hash: string): ResearchRoute | null {
  try {
    const match = hash.match(/^#research\/(run|comparison)\/([^?]+)(?:\?(.*))?$/);
    if (!match) return hash === "#research" ? { kind: "home" } : null;
    const id = decodeURIComponent(match[2]);
    if (!id || id.length > 2000) return null;
    return match[1] === "comparison"
      ? { kind: "comparison", snapshotId: id }
      : {
          kind: "run",
          runId: id,
          ...(new URLSearchParams(match[3]).get("event")
            ? { eventId: new URLSearchParams(match[3]).get("event")! }
            : {}),
        };
  } catch {
    return null;
  }
}
export const runLink = (runId: string, eventId?: string) =>
  `#research/run/${encodeURIComponent(runId)}${eventId ? `?event=${encodeURIComponent(eventId)}` : ""}`;
