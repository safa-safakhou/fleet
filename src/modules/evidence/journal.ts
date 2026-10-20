import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "../../db.js";
import type { Data } from "../../domain.js";
import type { Claim, Store } from "../../store.js";

const lifetime = 30 * 86400000;
/** Account-owned encrypted originals, preserving the historical journal identity and trimming policy. */
export class EvidenceJournal {
  constructor(
    private store: Store,
    private prepare: (kind: "observation" | "message" | "agreement" | "receipt", detail: Data) => Data,
    private trim: (client: PoolClient, agentId: string, current: string[]) => Promise<void>,
  ) {}
  async capture(
    claim: Claim,
    kind: "observation" | "message" | "agreement" | "receipt",
    source: string,
    detail: Data,
  ): Promise<string> {
    const body = this.prepare(kind, detail);
    const sourceKey = `${kind}:${createHash("sha256").update(source).digest("hex")}`;
    return transaction(this.store.pool, async (c) => {
      await c.query("SELECT id FROM cohorts WHERE id=$1 FOR UPDATE", [claim.cohortId]);
      await this.store.active(claim, c);
      const existing = (
        await c.query("SELECT id FROM cognitive_episodes WHERE agent_id=$1 AND source_key=$2", [
          claim.agentId,
          sourceKey,
        ])
      ).rows[0];
      if (existing) return existing.id;
      const id = randomUUID();
      await c.query(
        "INSERT INTO cognitive_episodes(id,agent_id,cohort_id,turn_id,source_key,occurred_at,kind,detail_cipher) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          id,
          claim.agentId,
          claim.cohortId,
          claim.id,
          sourceKey,
          this.store.now(),
          kind,
          this.store.vault.encrypt(body, `episode:${claim.agentId}:${id}`),
        ],
      );
      // Bound storage independently of model selection or output frequency.
      await this.trim(c, claim.agentId, [id]);
      return id;
    });
  }
  /** Retained account-owned originals; callers still enforce delivered refs and namespace. */
  async retainedEvidence(
    agentId: string,
    ids: string[],
    client: PoolClient | typeof this.store.pool = this.store.pool,
  ) {
    const rows = (
      await client.query(
        "SELECT id,kind,occurred_at,detail_cipher FROM cognitive_episodes WHERE agent_id=$1 AND id=ANY($2::uuid[]) AND occurred_at>$3 ORDER BY occurred_at DESC,sequence DESC",
        [agentId, ids, new Date(this.store.now().getTime() - lifetime)],
      )
    ).rows;
    return rows.map((row) => ({
      id: String(row.id),
      kind: String(row.kind),
      at: row.occurred_at.toISOString(),
      detail: this.store.vault.decrypt<Data>(row.detail_cipher, `episode:${agentId}:${row.id}`),
    }));
  }
}
