import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "../../db.js";
import { FleetError } from "../../domain.js";
import type { Store } from "../../store.js";
import type { StepJournal } from "../broker/steps.js";
import type { RunScope } from "../contracts.js";
import type { CaptureSession } from "../evidence/boundaries.js";
import { ManifestRepository } from "../manifests/repository.js";
import { IndexPolicy } from "./index-policy.js";
import {
  type MemoryInput,
  MemoryInputSchema,
  type MemoryRecord,
  MemoryUpdateSchema,
  namespaceFor,
  type SourceClass,
  SourceClassSchema,
  textConfiguration,
} from "./schema.js";
export class MemoryRepository {
  readonly indexPolicy: IndexPolicy;
  constructor(
    readonly store: Store,
    readonly journal: StepJournal,
    readonly captureSession: CaptureSession,
  ) {
    this.indexPolicy = new IndexPolicy(store, journal);
  }
  /** Kernel-only registration of a typed public source, not an agent assertion of truth. */
  async registerSource(scope: RunScope, input: { artifactId: string; sourceClass: SourceClass; observedAt: string }) {
    SourceClassSchema.parse(input.sourceClass);
    return transaction(this.store.pool, async (db) => {
      const c = await this.indexPolicy.context(scope, db),
        a = (await db.query("SELECT * FROM research_artifacts WHERE id=$1", [input.artifactId])).rows[0];
      if (!a || !c.consent || a.status !== "complete" || a.purged || new Date(a.expires_at) <= this.store.now())
        throw new FleetError("MEMORY_SOURCE_UNAVAILABLE", true);
      const m = await new ManifestRepository(this.store.pool).load(a.scope.manifestDigest);
      if (namespaceFor(a.scope, m) !== c.namespace || String(a.consent_version) !== c.consentVersion)
        throw new FleetError("MEMORY_SOURCE_UNAVAILABLE", true);
      if (!Number.isFinite(Date.parse(input.observedAt)) || Date.parse(input.observedAt) > this.store.now().getTime())
        throw new FleetError("MEMORY_SOURCE_TIME_INVALID", true);
      await db.query("INSERT INTO research_memory_sources VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING", [
        input.artifactId,
        c.namespace,
        c.cohortId,
        input.sourceClass,
        input.observedAt,
        new Date(Math.min(new Date(a.expires_at).getTime(), Date.parse(input.observedAt) + 30 * 86400000)),
        c.consentVersion,
      ]);
      const saved = (
        await db.query("SELECT source_class FROM research_memory_sources WHERE artifact_id=$1", [input.artifactId])
      ).rows[0];
      if (saved.source_class !== input.sourceClass) throw new FleetError("MEMORY_SOURCE_CLASS_IMMUTABLE", true);
    });
  }
  async capture(scope: RunScope, input: MemoryInput) {
    return transaction(this.store.pool, (db) =>
      this.write(scope, randomUUID(), "1", MemoryInputSchema.parse(input), db),
    );
  }
  private async write(
    scope: RunScope,
    id: string,
    version: string,
    value: ReturnType<typeof MemoryInputSchema.parse>,
    db: PoolClient,
  ) {
    const c = await this.indexPolicy.context(scope, db);
    if (!c.consent) throw new FleetError("MEMORY_SOURCE_UNAVAILABLE", true);
    const sources = (
      await db.query(
        "SELECT s.* FROM research_memory_sources s JOIN research_artifacts a ON a.id=s.artifact_id WHERE s.artifact_id=ANY($1::uuid[]) AND s.namespace=$2 AND s.expires_at>$3 AND a.status='complete' AND NOT a.purged AND s.consent_version=$4",
        [value.sourceRefs, c.namespace, this.store.now(), c.consentVersion],
      )
    ).rows;
    if (sources.length !== new Set(value.sourceRefs).size) throw new FleetError("MEMORY_SOURCE_UNAVAILABLE", true);
    if (value.sourceClass !== "inference" && sources.some((s) => s.source_class !== value.sourceClass))
      throw new FleetError("MEMORY_TRUTH_CLASS_CONFLICT", true);
    if (value.indexPolicyId) await this.indexPolicy.assertAllowed(scope, value.indexPolicyId, db);
    const expiry = new Date(
      Math.min(this.store.now().getTime() + 30 * 86400000, ...sources.map((s) => new Date(s.expires_at).getTime())),
    );
    for (const contradiction of value.contradicts)
      if (
        !(
          await db.query("SELECT 1 FROM research_memories WHERE id=$1 AND namespace=$2 AND expires_at>$3", [
            contradiction,
            c.namespace,
            this.store.now(),
          ])
        ).rowCount
      )
        throw new FleetError("MEMORY_NOT_FOUND", true);
    await db.query(
      "INSERT INTO research_memories VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET version=excluded.version,expires_at=excluded.expires_at",
      [id, c.namespace, c.cohortId, value.kind, value.sourceClass, version, this.store.now(), expiry],
    );
    await db.query("INSERT INTO research_memory_versions VALUES($1,$2,$3)", [
      id,
      version,
      this.store.vault.encrypt(value, `research-memory:${c.namespace}:${id}:${version}`),
    ]);
    for (const source of new Set(value.sourceRefs))
      await db.query("INSERT INTO research_memory_links VALUES($1,$2,$3)", [id, version, source]);
    await db.query("DELETE FROM research_memory_projections WHERE memory_id=$1", [id]);
    if (value.indexPolicyId) await this.project(scope, id, version, value.text, value.indexPolicyId, db);
    const body = Buffer.from(JSON.stringify({ id, version, ...value })),
      policy = await this.captureSession.artifacts.policy(scope, body.length),
      ref = await this.captureSession.artifacts.putWithin(scope, body, policy, db);
    await this.captureSession.recorder.append(
      scope,
      { kind: "memory.write", streamId: "memory", producerKey: `memory:${id}:${version}`, artifacts: [ref] },
      db,
    );
    return { id, version };
  }
  async revise(scope: RunScope, id: string, expectedVersion: string, update: unknown) {
    const change = MemoryUpdateSchema.parse(update);
    return transaction(this.store.pool, async (db) => {
      const c = await this.indexPolicy.context(scope, db),
        old = (
          await db.query("SELECT * FROM research_memories WHERE id=$1 AND namespace=$2 FOR UPDATE", [id, c.namespace])
        ).rows[0];
      if (!old) throw new FleetError("MEMORY_NOT_FOUND", true);
      if (String(old.version) !== expectedVersion) throw new FleetError("MEMORY_VERSION_CONFLICT", true);
      const prior = (await this.get(scope, [id], db))[0];
      if (!prior) throw new FleetError("MEMORY_SOURCE_UNAVAILABLE", true);
      if (change.sourceRefs && prior.sourceRefs.some((s) => !change.sourceRefs!.includes(s)))
        throw new FleetError("SOURCE_LINEAGE_REQUIRED", true);
      const { id: _, version: __, namespace: ___, expiresAt: ____, ...value } = prior;
      return this.write(
        scope,
        id,
        String(BigInt(expectedVersion) + 1n),
        MemoryInputSchema.parse({ ...value, ...change }),
        db,
      );
    });
  }
  async get(scope: RunScope, ids: string[], client?: PoolClient): Promise<MemoryRecord[]> {
    if (ids.length > 500) throw new FleetError("MEMORY_QUERY_LIMIT", true);
    if (!client) return transaction(this.store.pool, (db) => this.get(scope, ids, db));
    const c = await this.indexPolicy.context(scope, client);
    if (!c.consent) return [];
    const rows = (
      await client.query(
        "SELECT m.*,v.value_cipher FROM research_memories m JOIN research_memory_versions v ON v.memory_id=m.id AND v.version=m.version WHERE m.namespace=$1 AND m.id=ANY($2::uuid[]) AND m.expires_at>$3 AND NOT EXISTS(SELECT 1 FROM research_memory_links l JOIN research_memory_sources s ON s.artifact_id=l.artifact_id JOIN research_artifacts a ON a.id=s.artifact_id WHERE l.memory_id=m.id AND l.version=m.version AND (a.expires_at<=$3 OR s.expires_at<=$3 OR s.consent_version<>$4 OR a.status<>'complete' OR a.purged)) ORDER BY m.id",
        [c.namespace, ids, this.store.now(), c.consentVersion],
      )
    ).rows;
    return rows.map((r) => ({
      ...MemoryInputSchema.parse(
        this.store.vault.decrypt(r.value_cipher, `research-memory:${c.namespace}:${r.id}:${r.version}`),
      ),
      id: r.id,
      version: String(r.version),
      namespace: c.namespace,
      expiresAt: new Date(r.expires_at).toISOString(),
    }));
  }
  async all(scope: RunScope) {
    return transaction(this.store.pool, async (db) => {
      const c = await this.indexPolicy.context(scope, db);
      const ids = (
        await db.query("SELECT id FROM research_memories WHERE namespace=$1 ORDER BY id LIMIT 501", [c.namespace])
      ).rows.map((r) => r.id as string);
      if (ids.length > 500) throw new FleetError("MEMORY_QUERY_LIMIT", true);
      return this.get(scope, ids, db);
    });
  }
  private async project(scope: RunScope, id: string, version: string, text: string, policyId: string, db: PoolClient) {
    await this.indexPolicy.assertAllowed(scope, policyId, db);
    const c = await this.indexPolicy.context(scope, db),
      language = textConfiguration(c.manifest.retrieval.language);
    await db.query(
      "INSERT INTO research_memory_projections(memory_id,version,namespace,policy_id,approved_text,language,lexemes) VALUES($1,$2,$3,$4,$5,$6::regconfig,to_tsvector($6::regconfig,$5)) ON CONFLICT(memory_id) DO UPDATE SET version=excluded.version,approved_text=excluded.approved_text,lexemes=excluded.lexemes,embedding_revision=NULL,embedding_digest=NULL,dimension=NULL,normalization=NULL",
      [id, version, c.namespace, policyId, text, language],
    );
  }
  async index(id: string, scope: RunScope, policyId: string) {
    await transaction(this.store.pool, async (db) => {
      const value = (await this.get(scope, [id], db))[0];
      if (!value) throw new FleetError("MEMORY_SOURCE_UNAVAILABLE", true);
      await this.project(scope, id, value.version, value.text, policyId, db);
    });
  }
  async expire() {
    const result = await this.store.pool.query("DELETE FROM research_memories WHERE expires_at<=$1 RETURNING id", [
      this.store.now(),
    ]);
    await this.store.pool.query("DELETE FROM research_memory_sources WHERE expires_at<=$1", [this.store.now()]);
    return result.rowCount ?? 0;
  }
}
