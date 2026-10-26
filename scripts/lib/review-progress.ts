/** Diagnostic only. Repeated waits need review; they do not prove an invalid strategy. */
export function reviewProgress(rows: { agentId: string; code: string | null; actions: number }[]) {
  const actors = new Map<
    string,
    { agentId: string; consecutiveWaits: number; latestCode: string | null; ended: boolean }
  >();
  for (const row of rows) {
    let actor = actors.get(row.agentId);
    if (!actor) {
      actor = { agentId: row.agentId, consecutiveWaits: 0, latestCode: row.code, ended: false };
      actors.set(row.agentId, actor);
    }
    if (actor.ended) continue;
    if (row.code === "WAIT" && row.actions === 0) actor.consecutiveWaits++;
    else actor.ended = true;
  }
  return [...actors.values()].map(({ ended, ...actor }) => ({
    ...actor,
    reviewNeeded: actor.consecutiveWaits >= 3,
    historyTruncated: !ended,
  }));
}
