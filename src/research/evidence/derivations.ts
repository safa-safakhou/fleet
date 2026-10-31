import type { PoolClient } from "pg";
import { transaction } from "../../db.js";
import { FleetError } from "../../domain.js";
import type { Store } from "../../store.js";
import type { RunScope } from "../contracts.js";
/** Native evidence composition only. External game refs have their native retention/freshness policy. */
export async function inheritSources(
  store: Store,
  scope: RunScope,
  artifactId: string,
  sourceRefs: string[],
  client?: PoolClient,
): Promise<void> {
  const ids = [
    ...new Set(sourceRefs.filter((id) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))),
  ];
  if (!ids.length) return;
  if (ids.length > 500) throw new FleetError("MEMORY_QUERY_LIMIT", true);
  if (!client) return transaction(store.pool, (db) => inheritSources(store, scope, artifactId, ids, db));
  const target = (await client.query("SELECT * FROM research_artifacts WHERE id=$1 FOR UPDATE", [artifactId])).rows[0];
  const sources = (
    await client.query("SELECT * FROM research_artifacts WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE", [ids])
  ).rows;
  if (!target || target.scope.agentId !== scope.agentId || target.scope.bindingId !== scope.bindingId)
    throw new FleetError("ARTIFACT_SCOPE_MISMATCH", true);
  for (const source of sources) {
    if (
      source.id === artifactId ||
      source.scope.agentId !== scope.agentId ||
      source.scope.bindingId !== scope.bindingId ||
      (source.scope.participantId ?? null) !== (scope.participantId ?? null) ||
      source.consent_version !== target.consent_version
    )
      throw new FleetError("ARTIFACT_SCOPE_MISMATCH", true);
    if (source.status !== "complete" || source.purged || new Date(source.expires_at) <= store.now())
      throw new FleetError("MEMORY_SOURCE_UNAVAILABLE", true);
    const cycle = (
      await client.query(
        "WITH RECURSIVE ancestry(id) AS (SELECT $1::uuid UNION SELECT s.source_artifact_id FROM research_artifact_sources s JOIN ancestry a ON a.id=s.artifact_id) SELECT 1 FROM ancestry WHERE id=$2",
        [source.id, artifactId],
      )
    ).rowCount;
    if (cycle) throw new FleetError("ARTIFACT_LINEAGE_CYCLE", true);
    await client.query("INSERT INTO research_artifact_sources VALUES($1,$2) ON CONFLICT DO NOTHING", [
      artifactId,
      source.id,
    ]);
    await client.query("UPDATE research_artifacts SET expires_at=LEAST(expires_at,$2) WHERE id=$1", [
      artifactId,
      source.expires_at,
    ]);
  }
}
