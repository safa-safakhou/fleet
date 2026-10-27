import { type CommunicationEntry, Communications as Journal } from "../../communications.js";
import { type Data, object } from "../../domain.js";
import type { Store } from "../../store.js";
export function normalize(entityId: string | null, tool: string, result: Data): CommunicationEntry[] {
  const entries: CommunicationEntry[] = [];
  if (tool === "pact_council_thread_v1" && Array.isArray(result.messages))
    for (const raw of result.messages) {
      const m = object(raw);
      if (typeof m.id !== "string") continue;
      entries.push({
        source: m.id,
        kind: "message",
        direction: m.senderKingdomId === entityId ? "outgoing" : "incoming",
        gameTime: String(m.sentGameTimeMs ?? ""),
        body: m,
      });
    }
  if (tool === "pact_conversation_history_v2" && Array.isArray(result.offers))
    for (const raw of result.offers) {
      const o = object(raw);
      if (typeof o.id !== "string") continue;
      entries.push({
        source: `${o.id}:${String(o.version)}:${String(o.status)}:${String(object(o.contract).status ?? "")}:${JSON.stringify(o.deliveries ?? {})}`,
        kind: "agreement",
        direction: "shared",
        gameTime: String(o.gameTimeMs ?? ""),
        body: o,
      });
    }

  return entries;
}
export class Communications extends Journal {
  constructor(store: Store) {
    super(store, normalize);
  }
  async observeRead(agentId: string, tool: string, args: Data, result: Data) {
    if (!["pact_council_thread_v1", "pact_conversation_history_v2"].includes(tool)) return;
    if (typeof args.kingdomId !== "string" || !args.kingdomId) return;
    await this.ingest(agentId, args.kingdomId, tool, result);
  }
}
