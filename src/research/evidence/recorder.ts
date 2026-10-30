import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "../../db.js";
import { FleetError } from "../../domain.js";
import type { Store } from "../../store.js";
import { digest, type RunScope } from "../contracts.js";
import { EvidenceRepository } from "./repository.js";
import { EventInputSchema, type EventRef, type EvidenceEvent, type EvidenceEventInput } from "./types.js";
export class EvidenceRecorder {
  constructor(readonly store: Store) {}
  async append(scope: RunScope, input: EvidenceEventInput, tx?: PoolClient): Promise<EventRef> {
    if (!tx) return transaction(this.store.pool, (c) => this.append(scope, input, c));
    const value = EventInputSchema.parse(input),
      repo = new EvidenceRepository(this.store);
    await repo.bind(scope, tx);
    const hash = digest(value);
    const old = (
      await tx.query(
        "SELECT id,input_digest,event FROM research_events WHERE run_id=$1 AND stream_id=$2 AND producer_key=$3",
        [scope.runId, value.streamId, value.producerKey],
      )
    ).rows[0];
    if (old) {
      if (old.input_digest !== hash) throw new FleetError("EVENT_KEY_CONFLICT", true);
      return { id: old.id, streamId: old.event.streamId, sequence: old.event.sequence };
    }
    if (value.parentIds.length) {
      const foreign = (
        await tx.query("SELECT 1 FROM research_events WHERE id=ANY($1::uuid[]) AND run_id<>$2 LIMIT 1", [
          value.parentIds,
          scope.runId,
        ])
      ).rowCount;
      if (foreign) throw new FleetError("EVIDENCE_PARENT_SCOPE", true);
    }
    await tx.query("INSERT INTO research_evidence_streams(run_id,stream_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [
      scope.runId,
      value.streamId,
    ]);
    const sequence = (
      await tx.query(
        "UPDATE research_evidence_streams SET last_sequence=last_sequence+1 WHERE run_id=$1 AND stream_id=$2 RETURNING last_sequence::text",
        [scope.runId, value.streamId],
      )
    ).rows[0].last_sequence;
    const ordinal = (
      await tx.query(
        "UPDATE research_runs SET next_ordinal=next_ordinal+1 WHERE run_id=$1 RETURNING next_ordinal::text",
        [scope.runId],
      )
    ).rows[0].next_ordinal;
    const { producerKey, ...rest } = value;
    const event: EvidenceEvent = {
      ...rest,
      schemaVersion: "fleet.evidence/v1",
      id: randomUUID(),
      scope,
      sequence,
      ordinal,
      occurredAt: value.occurredAt ?? this.store.now().toISOString(),
      recordedAt: this.store.now().toISOString(),
    };
    await tx.query(
      "INSERT INTO research_events(id,run_id,stream_id,sequence,ordinal,producer_key,input_digest,event) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [event.id, scope.runId, value.streamId, sequence, ordinal, producerKey, hash, event],
    );
    return { id: event.id, streamId: event.streamId, sequence };
  }
}
