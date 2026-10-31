import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "../../db.js";
import { FleetError } from "../../domain.js";
import type { Store } from "../../store.js";
import { type ArtifactRef, canonical, digest, type RunScope } from "../contracts.js";
import type { ArtifactFiles } from "./filesystem.js";
import { EvidenceRepository } from "./repository.js";
export async function* bytes(body: Uint8Array) {
  yield body;
}
export type ArtifactPolicy = {
  contentType: string;
  privacyClass: "private";
  retentionClass: "30d";
  maxBytes: number;
  runQuotaBytes: number;
  consentVersion: string;
  expectedBytes?: number;
  signal?: AbortSignal;
};
type Chunk = { index: number; bytes: number; diskBytes: number; digest: string };
export type ArtifactRecord = {
  id: string;
  run_id: string;
  scope: RunScope;
  consent_version: string;
  content_type: string;
  privacy_class: string;
  retention_class: string;
  status: string;
  bytes: string;
  disk_bytes: string;
  chunks: Chunk[];
  inline_cipher: string[] | null;
  ciphertext_digest: string | null;
  created_at: Date;
  expires_at: Date;
  purged: boolean;
  reserved_bytes: string;
};
export type RetentionReport = { expired: number; withheld: number; orphans: number };
const CHUNK = 1024 * 1024;
export class ArtifactStore {
  constructor(
    readonly store: Store,
    readonly files: ArtifactFiles,
  ) {}
  private aad(scope: RunScope, id: string, index: number) {
    return `fleet-artifact:v1:${digest(scope)}:${id}:${index}`;
  }
  async record(scope: RunScope, id: string): Promise<ArtifactRecord> {
    await new EvidenceRepository(this.store).assertScope(scope);
    const row = (
      await this.store.pool.query("SELECT * FROM research_artifacts WHERE id=$1 AND run_id=$2", [id, scope.runId])
    ).rows[0];
    if (!row || canonical(row.scope) !== canonical(scope)) throw new FleetError("ARTIFACT_SCOPE_MISMATCH", true);
    return row;
  }
  async authorize(scope: RunScope, consentVersion: string, db: Pick<PoolClient, "query"> = this.store.pool) {
    await new EvidenceRepository(this.store).assertScope(scope, db);
    const row = (
      await db.query(
        "SELECT c.observation_consent,c.observation_consent_version::text v FROM research_runs r JOIN cohorts c ON c.id=r.cohort_id WHERE run_id=$1 FOR SHARE OF c",
        [scope.runId],
      )
    ).rows[0];
    if (!row?.observation_consent || row.v !== String(consentVersion)) throw new FleetError("ARTIFACT_WITHHELD", true);
  }
  async policy(scope: RunScope, maxBytes = 32 * 1024 * 1024, runQuotaBytes?: number): Promise<ArtifactPolicy> {
    const row = (
      await this.store.pool.query(
        "SELECT c.observation_consent_version::text v,r.artifact_quota_bytes::text quota FROM research_runs r JOIN cohorts c ON c.id=r.cohort_id WHERE run_id=$1",
        [scope.runId],
      )
    ).rows[0];
    if (!row) throw new FleetError("EVIDENCE_RUN_NOT_FOUND", true);
    return {
      contentType: "application/json",
      privacyClass: "private",
      retentionClass: "30d",
      maxBytes,
      runQuotaBytes: runQuotaBytes ?? Number(row.quota ?? 1073741824),
      consentVersion: row.v,
    };
  }
  /** Commit private input with native intent; materialize after commit, without FS IO in the native transaction. */
  async putWithin(scope: RunScope, body: Uint8Array, policy: ArtifactPolicy, db: PoolClient): Promise<ArtifactRef> {
    await new EvidenceRepository(this.store).bind(scope, db);
    await this.authorize(scope, policy.consentVersion, db);
    if (
      body.length > policy.maxBytes ||
      !Number.isSafeInteger(policy.maxBytes) ||
      !Number.isSafeInteger(policy.runQuotaBytes) ||
      policy.maxBytes < 0 ||
      policy.runQuotaBytes < policy.maxBytes ||
      policy.privacyClass !== "private" ||
      policy.retentionClass !== "30d" ||
      !["application/json", "application/octet-stream", "application/x-ndjson", "text/plain"].includes(
        policy.contentType,
      )
    )
      throw new FleetError("ARTIFACT_QUOTA", true);
    if (policy.expectedBytes !== undefined && policy.expectedBytes !== body.length)
      throw new FleetError("ARTIFACT_INCOMPLETE", true);
    const run = (
      await db.query(
        "SELECT artifact_reserved_bytes,artifact_quota_bytes FROM research_runs WHERE run_id=$1 FOR UPDATE",
        [scope.runId],
      )
    ).rows[0];
    if (run.artifact_quota_bytes !== null && BigInt(run.artifact_quota_bytes) !== BigInt(policy.runQuotaBytes))
      throw new FleetError("ARTIFACT_QUOTA_POLICY_MISMATCH", true);
    if (BigInt(run.artifact_reserved_bytes) + BigInt(body.length) > BigInt(policy.runQuotaBytes))
      throw new FleetError("ARTIFACT_QUOTA", true);
    const id = randomUUID(),
      chunks: Chunk[] = [],
      ciphers: string[] = [],
      hash = createHash("sha256");
    let disk = 0;
    for (let offset = 0; offset < body.length; offset += CHUNK) {
      const plain = Buffer.from(body.subarray(offset, offset + CHUNK)),
        index = chunks.length,
        cipher = this.store.vault.encrypt(plain.toString("base64"), this.aad(scope, id, index));
      ciphers.push(cipher);
      const raw = Buffer.from(cipher);
      hash.update(raw);
      disk += raw.length;
      chunks.push({
        index,
        bytes: plain.length,
        diskBytes: raw.length,
        digest: createHash("sha256").update(raw).digest("hex"),
      });
    }
    const cipherDigest = hash.digest("hex"),
      now = this.store.now();
    await db.query(
      "INSERT INTO research_artifacts(id,run_id,scope,consent_version,content_type,privacy_class,retention_class,status,reserved_bytes,bytes,disk_bytes,chunks,inline_cipher,ciphertext_digest,created_at,expires_at,expected_bytes) VALUES($1,$2,$3,$4,$5,'private','30d','complete',$6,$6,$7,$8,$9,$10,$11,$12,$6)",
      [
        id,
        scope.runId,
        scope,
        policy.consentVersion,
        policy.contentType,
        body.length,
        disk,
        JSON.stringify(chunks),
        JSON.stringify(ciphers),
        cipherDigest,
        now,
        new Date(now.getTime() + 30 * 86400000),
      ],
    );
    await db.query(
      "UPDATE research_runs SET artifact_reserved_bytes=artifact_reserved_bytes+$2,artifact_quota_bytes=$3 WHERE run_id=$1",
      [scope.runId, body.length, policy.runQuotaBytes],
    );
    return {
      id,
      contentType: policy.contentType,
      bytes: String(body.length),
      chunks: String(chunks.length),
      ciphertextDigest: cipherDigest,
      privacyClass: "private",
      retentionClass: "30d",
    };
  }
  async materialize(limit = 100, runId?: string): Promise<number> {
    const rows = (
      await this.store.pool.query(
        "SELECT * FROM research_artifacts WHERE inline_cipher IS NOT NULL AND status='complete' AND ($2::text IS NULL OR run_id=$2) ORDER BY created_at,id LIMIT $1",
        [limit, runId ?? null],
      )
    ).rows as ArtifactRecord[];
    let count = 0;
    for (const row of rows) {
      const ciphers = row.inline_cipher;
      if (!ciphers) continue;
      try {
        await this.authorize(row.scope, String(row.consent_version));
        for (const chunk of row.chunks) {
          const cipher = Buffer.from(ciphers[chunk.index]);
          try {
            await this.files.writeChunk(row.id, chunk.index, cipher);
          } catch (error) {
            const existing = await this.files.readChunk(row.id, chunk.index).catch(() => null);
            if (!existing?.equals(cipher)) throw error;
          }
        }
        await this.authorize(row.scope, String(row.consent_version));
        await this.store.pool.query(
          "UPDATE research_artifacts SET inline_cipher=NULL WHERE id=$1 AND status='complete'",
          [row.id],
        );
        count++;
      } catch (error) {
        if (error instanceof FleetError && error.code === "ARTIFACT_WITHHELD") {
          await this.files.remove(row.id);
          continue;
        }
        throw error;
      }
    }
    return count;
  }
  async put(scope: RunScope, body: AsyncIterable<Uint8Array>, policy: ArtifactPolicy): Promise<ArtifactRef> {
    if (
      !Number.isSafeInteger(policy.maxBytes) ||
      policy.maxBytes < 0 ||
      !Number.isSafeInteger(policy.runQuotaBytes) ||
      policy.runQuotaBytes < policy.maxBytes ||
      (policy.expectedBytes !== undefined &&
        (!Number.isSafeInteger(policy.expectedBytes) || policy.expectedBytes < 0)) ||
      !["application/json", "application/x-ndjson", "application/octet-stream", "text/plain"].includes(
        policy.contentType,
      ) ||
      policy.privacyClass !== "private" ||
      policy.retentionClass !== "30d"
    )
      throw new FleetError("ARTIFACT_POLICY_INVALID", true);
    await this.authorize(scope, policy.consentVersion);
    const id = randomUUID(),
      now = this.store.now();
    await transaction(this.store.pool, async (db) => {
      const run = (
        await db.query(
          "SELECT r.*,c.observation_consent,c.observation_consent_version::text v FROM research_runs r JOIN cohorts c ON c.id=r.cohort_id WHERE run_id=$1 FOR UPDATE OF r",
          [scope.runId],
        )
      ).rows[0];
      if (!run.observation_consent || run.v !== policy.consentVersion) throw new FleetError("ARTIFACT_WITHHELD", true);
      if (run.artifact_quota_bytes !== null && BigInt(run.artifact_quota_bytes) !== BigInt(policy.runQuotaBytes))
        throw new FleetError("ARTIFACT_QUOTA_POLICY_MISMATCH", true);
      if (BigInt(run.artifact_reserved_bytes) + BigInt(policy.maxBytes) > BigInt(policy.runQuotaBytes))
        throw new FleetError("ARTIFACT_QUOTA", true);
      await db.query(
        "UPDATE research_runs SET artifact_reserved_bytes=artifact_reserved_bytes+$2,artifact_quota_bytes=$3 WHERE run_id=$1",
        [scope.runId, policy.maxBytes, policy.runQuotaBytes],
      );
      await db.query(
        "INSERT INTO research_artifacts(id,run_id,scope,consent_version,content_type,privacy_class,retention_class,status,reserved_bytes,created_at,expires_at,expected_bytes) VALUES($1,$2,$3,$4,$5,$6,$7,'writing',$8,$9,$10,$11)",
        [
          id,
          scope.runId,
          scope,
          policy.consentVersion,
          policy.contentType,
          policy.privacyClass,
          policy.retentionClass,
          policy.maxBytes,
          now,
          new Date(now.getTime() + 30 * 86400000),
          policy.expectedBytes ?? null,
        ],
      );
    });
    let pending = Buffer.alloc(0),
      size = 0,
      disk = 0;
    const chunks: Chunk[] = [],
      hash = createHash("sha256");
    const write = async (plain: Buffer) => {
      await this.authorize(scope, policy.consentVersion);
      if (policy.signal?.aborted) throw new FleetError("ARTIFACT_INCOMPLETE", true);
      const index = chunks.length,
        cipher = Buffer.from(this.store.vault.encrypt(plain.toString("base64"), this.aad(scope, id, index)));
      await this.files.writeChunk(id, index, cipher);
      try {
        await this.authorize(scope, policy.consentVersion);
      } catch (error) {
        await this.files.remove(id);
        throw error;
      }
      hash.update(cipher);
      disk += cipher.length;
      size += plain.length;
      chunks.push({
        index,
        bytes: plain.length,
        diskBytes: cipher.length,
        digest: createHash("sha256").update(cipher).digest("hex"),
      });
      await this.store.pool.query("UPDATE research_artifacts SET bytes=$2,disk_bytes=$3,chunks=$4 WHERE id=$1", [
        id,
        size,
        disk,
        JSON.stringify(chunks),
      ]);
    };
    try {
      for await (const part of body) {
        if (size + pending.length + part.length > policy.maxBytes) throw new FleetError("ARTIFACT_QUOTA", true);
        let offset = 0;
        while (offset < part.length) {
          const amount = Math.min(CHUNK - pending.length, part.length - offset);
          pending = Buffer.concat([pending, part.subarray(offset, offset + amount)]);
          offset += amount;
          if (pending.length === CHUNK) {
            await write(pending);
            pending = Buffer.alloc(0);
          }
        }
      }
      if (pending.length) await write(pending);
      if (policy.expectedBytes !== undefined && size !== policy.expectedBytes)
        throw new FleetError("ARTIFACT_INCOMPLETE", true);
      await this.authorize(scope, policy.consentVersion);
      const ciphertextDigest = hash.digest("hex");
      await transaction(this.store.pool, async (db) => {
        const consent = (
          await db.query(
            "SELECT c.observation_consent,c.observation_consent_version::text v FROM cohorts c JOIN research_runs r ON r.cohort_id=c.id WHERE r.run_id=$1 FOR SHARE OF c",
            [scope.runId],
          )
        ).rows[0];
        if (!consent.observation_consent || consent.v !== policy.consentVersion)
          throw new FleetError("ARTIFACT_WITHHELD", true);
        await db.query(
          "UPDATE research_artifacts SET status='complete',ciphertext_digest=$2,reserved_bytes=$3,expected_bytes=$3 WHERE id=$1",
          [id, ciphertextDigest, size],
        );
        await db.query(
          "UPDATE research_runs SET artifact_reserved_bytes=artifact_reserved_bytes-$2+$3 WHERE run_id=$1",
          [scope.runId, policy.maxBytes, size],
        );
      });
      return {
        id,
        contentType: policy.contentType,
        bytes: String(size),
        chunks: String(chunks.length),
        ciphertextDigest,
        privacyClass: "private",
        retentionClass: "30d",
      };
    } catch (error) {
      await this.store.pool.query(
        "UPDATE research_artifacts SET status='partial',reason=$2 WHERE id=$1 AND status='writing'",
        [id, error instanceof FleetError ? error.code : "ARTIFACT_STORAGE"],
      );
      const tombstone = (await this.store.pool.query("SELECT status,purged FROM research_artifacts WHERE id=$1", [id]))
        .rows[0];
      if (
        tombstone?.purged ||
        ["expired", "withheld"].includes(tombstone?.status) ||
        (error instanceof FleetError && error.code === "ARTIFACT_WITHHELD")
      )
        await this.files.remove(id);
      if (error instanceof FleetError) throw error;
      throw new FleetError("ARTIFACT_STORAGE", true);
    }
  }
  async *read(scope: RunScope, ref: ArtifactRef): AsyncIterable<Uint8Array> {
    const record = await this.record(scope, ref.id);
    await this.authorize(scope, String(record.consent_version));
    if (record.status === "expired" || new Date(record.expires_at) <= this.store.now())
      throw new FleetError("ARTIFACT_EXPIRED", true);
    if (record.status === "withheld") throw new FleetError("ARTIFACT_WITHHELD", true);
    if (record.status !== "complete") throw new FleetError("ARTIFACT_INCOMPLETE", true);
    const expected = {
      id: record.id,
      contentType: record.content_type,
      bytes: String(record.bytes),
      chunks: String(record.chunks.length),
      ciphertextDigest: record.ciphertext_digest,
      privacyClass: record.privacy_class,
      retentionClass: record.retention_class,
    };
    if (canonical(expected) !== canonical(ref)) throw new FleetError("ARTIFACT_INTEGRITY", true);
    const hash = createHash("sha256");
    let size = 0;
    for (const chunk of record.chunks) {
      await this.authorize(scope, String(record.consent_version));
      if (new Date(record.expires_at) <= this.store.now()) throw new FleetError("ARTIFACT_EXPIRED", true);
      let plain: Buffer;
      try {
        const cipher = record.inline_cipher
          ? Buffer.from(record.inline_cipher[chunk.index])
          : await this.files.readChunk(ref.id, chunk.index);
        if (createHash("sha256").update(cipher).digest("hex") !== chunk.digest || cipher.length !== chunk.diskBytes)
          throw Error("digest");
        hash.update(cipher);
        plain = Buffer.from(
          this.store.vault.decrypt<string>(cipher.toString(), this.aad(scope, ref.id, chunk.index)),
          "base64",
        );
        if (plain.length !== chunk.bytes || plain.length > CHUNK) throw Error("size");
      } catch {
        await this.store.pool
          .query(
            "UPDATE research_artifacts SET status='partial',reason='ARTIFACT_INTEGRITY' WHERE id=$1 AND status='complete'",
            [ref.id],
          )
          .catch(() => {});
        throw new FleetError("ARTIFACT_INTEGRITY", true);
      }
      size += plain.length;
      await this.authorize(scope, String(record.consent_version));
      yield plain;
    }
    if (hash.digest("hex") !== record.ciphertext_digest || String(size) !== String(record.bytes))
      throw new FleetError("ARTIFACT_INTEGRITY", true);
  }
  async expire(now: Date): Promise<RetentionReport> {
    const rows = (
      await this.store.pool.query(
        "SELECT a.*,c.observation_consent,c.observation_consent_version::text v FROM research_artifacts a JOIN research_runs r ON r.run_id=a.run_id JOIN cohorts c ON c.id=r.cohort_id WHERE NOT a.purged AND (a.expires_at<=$1 OR NOT c.observation_consent OR c.observation_consent_version<>a.consent_version)",
        [now],
      )
    ).rows;
    let expired = 0,
      withheld = 0;
    for (const row of rows) {
      const status = !row.observation_consent || String(row.v) !== String(row.consent_version) ? "withheld" : "expired";
      await this.store.pool.query("UPDATE research_artifacts SET status=$2,inline_cipher=NULL WHERE id=$1", [
        row.id,
        status,
      ]);
      await this.files.remove(row.id);
      await transaction(this.store.pool, async (db) => {
        const result = await db.query(
          "UPDATE research_artifacts SET purged=true WHERE id=$1 AND NOT purged RETURNING reserved_bytes",
          [row.id],
        );
        if (result.rowCount)
          await db.query(
            "UPDATE research_runs SET artifact_reserved_bytes=greatest(0,artifact_reserved_bytes-$2) WHERE run_id=$1",
            [row.run_id, result.rows[0].reserved_bytes],
          );
      });
      if (status === "expired") expired++;
      else withheld++;
    }
    return { expired, withheld, orphans: 0 };
  }
  /** Report orphan ciphertext for reconciliation; never erase unknown/private evidence automatically. */
  async reconcileOrphans() {
    let count = 0;
    for (const id of await this.files.list())
      if (!(await this.store.pool.query("SELECT 1 FROM research_artifacts WHERE id=$1", [id])).rowCount) count++;
    return count;
  }
}
