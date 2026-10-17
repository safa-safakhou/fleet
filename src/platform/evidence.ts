import { type Data, object } from "../domain.js";

type EvidenceEvent = { id: string; label: string; detail: Data | null };
/** Only exact retained identifiers form links. Missing history is never inferred from nearby events. */
export function evidenceChain(events: EvidenceEvent[]) {
  const requests = events.filter(
    (e) => e.label.replace(/^Debug: /, "") === "Model request" && typeof e.detail?.allocationId === "string",
  );
  const packets = requests.flatMap((e) => {
    const messages = Array.isArray(e.detail?.messages) ? e.detail.messages : [];
    return messages.flatMap((raw) => {
      const m = object(raw);
      if (m.role !== "user" || typeof m.content !== "string") return [];
      try {
        return [{ eventId: e.id, payload: object(JSON.parse(m.content)) }];
      } catch {
        return [];
      }
    });
  });
  const predictions = packets.flatMap((p) => {
    const state = object(p.payload.continuity);
    if (state.schemaVersion !== "fleet.continuity.v1" || !Array.isArray(state.predictions)) return [];
    return state.predictions.flatMap((raw) => {
      const v = object(raw);
      return typeof v.id === "string"
        ? [
            {
              eventId: p.eventId,
              predictionId: v.id,
              expected: v.expected,
              observed: v.observed ?? null,
              status: v.status ?? "unresolved",
              outcomeRef: v.outcomeRef ?? null,
              evidenceRefs: v.evidenceRefs ?? [],
              meaning: "Retained subjective prediction tested against observed evidence; motive unproved.",
            },
          ]
        : [];
    });
  });
  const commands = packets.flatMap((p) =>
    Array.isArray(p.payload.proposals)
      ? p.payload.proposals.flatMap((raw) => {
          const v = object(raw),
            intent = object(v.intent);
          if (typeof intent.commandId !== "string") return [];
          const result = events.find(
            (e) => e.detail?.commandId === intent.commandId && typeof e.detail?.committed === "boolean",
          );
          const outcome = object(result?.detail?.environmentOutcome);
          return [
            {
              commandId: intent.commandId,
              proposalEventId: p.eventId,
              expectedOutcome: v.expectedOutcome ?? null,
              evidenceRefs: v.evidenceRefs ?? [],
              resultEventId: result?.id ?? null,
              status: outcome.status ?? "unavailable",
              sourceRefs: outcome.sourceRefs ?? [],
              materialFulfilment: "unmeasured",
            },
          ];
        })
      : [],
  );
  return {
    predictions,
    commands,
    modelLinks: requests.map((e) => ({
      allocationId: String(e.detail?.allocationId),
      requestEventId: e.id,
      responseEventId:
        events.find(
          (x) =>
            x.label.replace(/^Debug: /, "") === "Model response" && x.detail?.allocationId === e.detail?.allocationId,
        )?.id ?? null,
    })),
    stages: events
      .filter((e) => e.detail && /prediction|proposal|coordinator|continuity|command|action result/i.test(e.label))
      .map((e) => ({
        eventId: e.id,
        label: e.label,
        commandId: typeof e.detail?.commandId === "string" ? e.detail.commandId : null,
        sourceRefs: Array.isArray(e.detail?.sourceRefs) ? e.detail.sourceRefs : [],
      })),
    coverage:
      "Links require retained exact allocation/command/source references. Proposed or admitted commands do not establish later material fulfilment; beliefs and predictions remain subjective. Missing links stay unavailable.",
  };
}
