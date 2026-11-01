import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "../../db.js";
import { FleetError } from "../../domain.js";
import type { Store } from "../../store.js";
import { digest, type RunScope } from "../contracts.js";
import { EvidenceRepository } from "./repository.js";
import { EventInputSchema, type EventRef, type EvidenceEventInput } from "./types.js";
export class EvidenceRecorder {
  constructor(readonly store: Store) {}
  async append(scope: RunScope, input: EvidenceEventInput, tx?: PoolClient): Promise<EventRef> {
    if (!tx) return transaction(this.store.pool, (c) => this.append(scope, input, c));
    const value = EventInputSchema.parse(input),
      repo = new EvidenceRepository(this.store);
    await repo.bind(scope, tx);
    const hash = digest(value);
    const { producerKey, ...rest } = value;
    const event = {
      ...rest,
      schemaVersion: "fleet.evidence/v1",
      id: randomUUID(),
      scope,
      occurredAt: value.occurredAt ?? this.store.now().toISOString(),
      recordedAt: this.store.now().toISOString(),
    };
    // bind holds the run lock, serializing producers before this snapshot.
    // Duplicate/conflicting keys and foreign parents must allocate no sequence.
    const row = (
      await tx.query(
        `WITH old AS MATERIALIZED (
 SELECT id,input_digest,event->>'streamId' stream_id,event->>'sequence' sequence
 FROM research_events WHERE run_id=$1 AND stream_id=$2 AND producer_key=$3
), foreign_parent AS MATERIALIZED (
 SELECT 1 FROM research_events WHERE id=ANY($5::uuid[]) AND run_id<>$1 LIMIT 1
), stream AS (
 INSERT INTO research_evidence_streams(run_id,stream_id,last_sequence)
 SELECT $1,$2,1 WHERE NOT EXISTS(SELECT 1 FROM old) AND NOT EXISTS(SELECT 1 FROM foreign_parent)
 ON CONFLICT(run_id,stream_id) DO UPDATE SET last_sequence=research_evidence_streams.last_sequence+1
 RETURNING last_sequence
), ordinal AS (
 UPDATE research_runs SET next_ordinal=next_ordinal+1 WHERE run_id=$1 AND EXISTS(SELECT 1 FROM stream)
 RETURNING next_ordinal
), inserted AS (
 INSERT INTO research_events(id,run_id,stream_id,sequence,ordinal,producer_key,input_digest,event)
 SELECT $6::uuid,$1,$2,stream.last_sequence,ordinal.next_ordinal,$3,$4,
 $7::jsonb||jsonb_build_object('sequence',stream.last_sequence::text,'ordinal',ordinal.next_ordinal::text)
 FROM stream CROSS JOIN ordinal RETURNING id,input_digest,stream_id,sequence::text
)
 SELECT id,input_digest,stream_id,sequence,false foreign_parent FROM old
 UNION ALL SELECT id,input_digest,stream_id,sequence,false FROM inserted
 UNION ALL SELECT NULL::uuid,NULL::text,NULL::text,NULL::text,true
 WHERE NOT EXISTS(SELECT 1 FROM old) AND EXISTS(SELECT 1 FROM foreign_parent)`,
        [scope.runId, value.streamId, producerKey, hash, value.parentIds, event.id, event],
      )
    ).rows[0];
    if (row.foreign_parent) throw new FleetError("EVIDENCE_PARENT_SCOPE", true);
    if (row.input_digest !== hash) throw new FleetError("EVENT_KEY_CONFLICT", true);
    return { id: row.id, streamId: row.stream_id, sequence: row.sequence };
  }
}
