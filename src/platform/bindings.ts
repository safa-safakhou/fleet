import { randomUUID } from "node:crypto";
import { transaction } from "../db.js";
import { FleetError } from "../domain.js";
import type { Store } from "../store.js";
import type { BindingRef, EnvironmentRef } from "./contracts.js";
import { sameEnvironment } from "./environment-registry.js";

interface BindingRow {
  id: string;
  agent_id: string;
  environment_id: string;
  environment_version: string;
  instance_id: string;
  account_ref: string;
  actor_ref: string;
  entity_ref: string;
  state: string;
  provenance: string;
}
function ref(row: BindingRow): BindingRef {
  return {
    id: row.id,
    environment: { id: row.environment_id, version: row.environment_version, instanceId: row.instance_id },
    accountRef: row.account_ref,
    actorRef: row.actor_ref,
    entityRef: row.entity_ref,
  };
}
function same(a: BindingRef, b: Omit<BindingRef, "id">) {
  return (
    sameEnvironment(a.environment, b.environment) &&
    a.accountRef === b.accountRef &&
    a.actorRef === b.actorRef &&
    a.entityRef === b.entityRef
  );
}
/** Called only by trusted integration enrollment, never exposed as an agent tool. */
export class Bindings {
  constructor(
    readonly store: Store,
    readonly selected: EnvironmentRef,
  ) {}
  async bind(
    agentId: string,
    input: Omit<BindingRef, "id">,
    provenance: "recorded" | "inferred_legacy" = "recorded",
  ): Promise<BindingRef> {
    if (!sameEnvironment(input.environment, this.selected)) throw new FleetError("ENVIRONMENT_NOT_SELECTED");
    if ([input.accountRef, input.actorRef, input.entityRef].some((value) => !value || value.length > 2000))
      throw new FleetError("INVALID_BINDING");
    try {
      return await transaction(this.store.pool, async (db) => {
        await db.query("SELECT id FROM agents WHERE id=$1 FOR UPDATE", [agentId]);
        const old = (
          await db.query<BindingRow>("SELECT * FROM environment_bindings WHERE agent_id=$1 AND state='active'", [
            agentId,
          ])
        ).rows[0];
        if (old) {
          const existing = ref(old);
          if (!same(existing, input)) throw new FleetError("BINDING_IMMUTABLE");
          return existing;
        }
        const id = randomUUID();
        const result = await db.query<BindingRow>(
          "INSERT INTO environment_bindings(id,agent_id,environment_id,environment_version,instance_id,account_ref,actor_ref,entity_ref,provenance,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
          [
            id,
            agentId,
            input.environment.id,
            input.environment.version,
            input.environment.instanceId,
            input.accountRef,
            input.actorRef,
            input.entityRef,
            provenance,
            this.store.now(),
          ],
        );
        return ref(result.rows[0]);
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new FleetError("CONTROLLING_BINDING_EXISTS");
      throw error;
    }
  }
  async get(id: string): Promise<BindingRef> {
    const row = (
      await this.store.pool.query<BindingRow>("SELECT * FROM environment_bindings WHERE id=$1 AND state='active'", [id])
    ).rows[0];
    if (!row) throw new FleetError("BINDING_NOT_FOUND");
    const result = ref(row);
    if (!sameEnvironment(result.environment, this.selected)) throw new FleetError("ENVIRONMENT_NOT_SELECTED");
    return result;
  }
  async forAgent(agentId: string): Promise<BindingRef | null> {
    const row = (
      await this.store.pool.query<BindingRow>(
        "SELECT * FROM environment_bindings WHERE agent_id=$1 AND state='active'",
        [agentId],
      )
    ).rows[0];
    return row ? this.get(row.id) : null;
  }
  async agentFor(binding: BindingRef): Promise<string> {
    const actual = await this.get(binding.id);
    if (!same(actual, binding)) throw new FleetError("BINDING_MISMATCH");
    const row = (
      await this.store.pool.query<BindingRow>("SELECT * FROM environment_bindings WHERE id=$1", [binding.id])
    ).rows[0];
    return row.agent_id;
  }
}
