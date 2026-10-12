import { randomUUID } from "node:crypto";
import { transaction } from "./db.js";
import { type Data, FleetError } from "./domain.js";
import type { Store } from "./store.js";

export interface CommunicationEntry {
  source: string;
  kind: string;
  direction: string;
  gameTime: string | null;
  body: Data;
}
export type NormalizeCommunications = (entityId: string | null, tool: string, result: Data) => CommunicationEntry[];
export class Communications {
  constructor(
    private store: Store,
    private normalize: NormalizeCommunications = () => [],
  ) {}
  async ingest(agentId: string, peer: string, tool: string, result: Data) {
    await transaction(this.store.pool, async (c) => {
      const a = await this.store.agent(agentId, c),
        cohort = (await c.query("SELECT observation_consent FROM cohorts WHERE id=$1 FOR SHARE", [a.cohort_id]))
          .rows[0];
      if (!cohort.observation_consent) return;
      const entries = this.normalize(a.kingdom_id, tool, result);
      for (const e of entries) {
        const id = randomUUID();
        await c.query(
          "INSERT INTO communications(id,cohort_id,owner_agent_id,peer_kingdom_id,source_id,kind,direction,occurred_at,game_time,body_cipher) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(owner_agent_id,kind,source_id) DO NOTHING",
          [
            id,
            a.cohort_id,
            a.id,
            peer,
            e.source,
            e.kind,
            e.direction,
            this.store.now(),
            e.gameTime,
            this.store.vault.encrypt(e.body, `communication:${a.id}:${e.kind}:${e.source}`),
          ],
        );
      }
    });
  }
  async thread(agentId: string, peer: string, before?: { at: string; id: string; time?: string }) {
    return transaction(this.store.pool, async (c) => {
      const a = await this.store.agent(agentId, c),
        cohort = (await c.query("SELECT observation_consent FROM cohorts WHERE id=$1 FOR SHARE", [a.cohort_id]))
          .rows[0];
      if (!cohort.observation_consent) throw new FleetError("OBSERVATION_NOT_CONSENTED");
      const rows = (
        await c.query(
          "SELECT *,CASE WHEN game_time ~ '^[0-9]{1,20}$' THEN game_time::numeric ELSE 0 END sort_time FROM communications WHERE owner_agent_id=$1 AND peer_kingdom_id=$2 AND ($3::timestamptz IS NULL OR (occurred_at,CASE WHEN game_time ~ '^[0-9]{1,20}$' THEN game_time::numeric ELSE 0 END,id)<($3::timestamptz,$5::numeric,$4::uuid)) ORDER BY occurred_at DESC,sort_time DESC,id DESC LIMIT 41",
          [agentId, peer, before?.at ?? null, before?.id ?? null, before?.time ?? "0"],
        )
      ).rows;
      const page = rows.slice(0, 40),
        last = page.at(-1);
      const events = page.reverse().map((r) => ({
        id: r.id,
        kind: r.kind,
        direction: r.direction,
        observedAt: r.occurred_at,
        gameTime: r.game_time,
        body: this.store.vault.decrypt<Data>(r.body_cipher, `communication:${a.id}:${r.kind}:${r.source_id}`),
      }));
      const msgs = events.filter((e) => e.kind === "message"),
        incoming = msgs.filter((e) => e.direction === "incoming").length,
        outgoing = msgs.filter((e) => e.direction === "outgoing").length;
      return {
        events,
        next:
          rows.length > 40 && last
            ? { at: last.occurred_at.toISOString(), id: last.id, time: String(last.sort_time) }
            : null,
        coverage:
          "Retained pages actually delivered to this account; missing pages or messages are not inferred. Observation time is not original wall send time.",
        metrics: { incoming, outgoing, scope: "this page", negotiationDuration: null },
      };
    });
  }
  async prune(retentionDays = 30) {
    await this.store.pool.query(
      "UPDATE agents SET read_memory_cipher=NULL,read_memory_updated_at=NULL WHERE read_memory_updated_at<$1",
      [new Date(this.store.now().getTime() - retentionDays * 86400000)],
    );
    await this.store.pool.query("DELETE FROM communications WHERE occurred_at<$1", [
      new Date(this.store.now().getTime() - retentionDays * 86400000),
    ]);
  }
}
