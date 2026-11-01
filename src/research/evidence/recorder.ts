import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "../../db.js";
import { FleetError } from "../../domain.js";
import type { Store } from "../../store.js";
import { canonical, digest, type RunScope } from "../contracts.js";
import { EvidenceRepository } from "./repository.js";
import { EventInputSchema, type EventRef, type EvidenceEventInput } from "./types.js";
export function prepareEvent(store: Store, scope: RunScope, input: EvidenceEventInput) {
  const value = EventInputSchema.parse(input);
  const { producerKey, ...rest } = value;
  return {
    producerKey,
    inputDigest: digest(value),
    event: {
      ...rest,
      schemaVersion: "fleet.evidence/v1",
      id: randomUUID(),
      scope,
      occurredAt: value.occurredAt ?? store.now().toISOString(),
      recordedAt: store.now().toISOString(),
    },
  };
}
export class EvidenceRecorder {
  constructor(readonly store: Store) {}
  async append(scope: RunScope, input: EvidenceEventInput, tx?: PoolClient): Promise<EventRef> {
    if (!tx) return transaction(this.store.pool, (c) => this.append(scope, input, c));
    const prepared = prepareEvent(this.store, scope, input);
    await new EvidenceRepository(this.store).bind(scope, tx);
    try {
      return (await tx.query("SELECT research_append_event($1::jsonb,$2::jsonb) ref", [canonical(scope), prepared]))
        .rows[0].ref;
    } catch (error) {
      if (
        error instanceof Error &&
        ["EVENT_KEY_CONFLICT", "EVIDENCE_PARENT_SCOPE", "EVIDENCE_SCOPE_MISMATCH"].includes(error.message)
      )
        throw new FleetError(error.message, true);
      throw error;
    }
  }
}
