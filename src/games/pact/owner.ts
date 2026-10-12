import { createHash } from "node:crypto";
import { z } from "zod";
import { transaction } from "../../db.js";
import { type Data, FleetError, object } from "../../domain.js";
import type { OwnerPort } from "../../engine.js";
import type { Claim, Store } from "../../store.js";
import { actionContract, actionKinds } from "./contracts.js";
import type { CredentialBroker } from "./credentials.js";
export const OwnerPolicy = z
  .object({
    allowedKinds: z.array(z.string().refine((k) => actionKinds.includes(k))).max(100),
    maxCommands: z.number().int().min(1).max(10000),
  })
  .strict();
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.entries(v)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`)
      .join(",")}}`;
  return JSON.stringify(v);
}
export class SyntheticOwner implements OwnerPort {
  constructor(
    private store: Store,
    private broker: Pick<CredentialBroker, "ownerRequest">,
  ) {}
  private async policy(claim: Claim, action: Data) {
    const c = await this.store.cohort(claim.cohortId),
      p = OwnerPolicy.safeParse(c.synthetic_owner_policy);
    if (!p.success || !p.data.allowedKinds.includes(String(action.kind)))
      throw new FleetError("OWNER_APPROVAL_REQUIRED");
    return p.data;
  }
  async prepare(claim: Claim, action: Data) {
    actionContract(action);
    if (["seal.publish", "chronicle.publish"].includes(String(action.kind))) {
      await this.policy(claim, action);
      await this.store.active(claim);
      const p = await this.broker.ownerRequest(
        claim.agentId,
        action.kind === "seal.publish" ? "seal-preview" : "chronicle-preview",
        object(action.selection),
      );
      if (typeof p.previewDigest !== "string" || !/^[a-f0-9]{64}$/.test(p.previewDigest))
        throw new FleetError("PUBLICATION_PREVIEW_REQUIRED");
      return { ...action, previewDigest: p.previewDigest };
    }
    return action;
  }
  async submit(claim: Claim, id: string, action: Data) {
    const policy = await this.policy(claim, action),
      parsed = actionContract(action),
      hash = createHash("sha256").update(canonical(action)).digest("hex");
    await transaction(this.store.pool, async (c) => {
      await c.query("SELECT id FROM cohorts WHERE id=$1 FOR UPDATE", [claim.cohortId]);
      await this.store.active(claim, c);
      const existing = (await c.query("SELECT * FROM owner_decisions WHERE command_id=$1", [id])).rows[0];
      if (existing) {
        if (existing.agent_id !== claim.agentId || existing.action_hash !== hash)
          throw new FleetError("OWNER_DECISION_CONFLICT");
        return;
      }
      const used = (
        await c.query(
          "SELECT count(*)::int n FROM owner_decisions d JOIN agents a ON a.id=d.agent_id WHERE a.cohort_id=$1",
          [claim.cohortId],
        )
      ).rows[0].n;
      if (used >= policy.maxCommands) throw new FleetError("OWNER_BUDGET_EXHAUSTED");
      await c.query("INSERT INTO owner_decisions(command_id,agent_id,action_hash) VALUES($1,$2,$3)", [
        id,
        claim.agentId,
        hash,
      ]);
    });
    await this.store.active(claim);
    const r = await this.broker.ownerRequest(claim.agentId, "command", {
      schemaVersion: parsed.version,
      commandId: id,
      actor: {
        principalId: "server-derived",
        productScope: "pact",
        audience: "human",
        subject: { type: "account", id: "server-derived" },
      },
      action: parsed.action,
      submittedAt: this.store.now().toISOString(),
    });
    if (r.commandId !== id) throw new FleetError("RECEIPT_MISMATCH");
    await this.store.pool.query("UPDATE owner_decisions SET state=$2 WHERE command_id=$1", [id, String(r.code)]);
    return r;
  }
}
