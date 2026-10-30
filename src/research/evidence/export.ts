import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { link, open, rm } from "node:fs/promises";
import { FleetError } from "../../domain.js";
import { Vault } from "../../vault.js";
import { type ArtifactRef, ArtifactSchema, canonical, digest } from "../contracts.js";
import type { ResearchPrincipal, RunInspection, RunSnapshot } from "./inspection.js";
import { EventSchema } from "./types.js";

const FRAME = 1024 * 1024,
  RECORD = 16 * 1024 * 1024;
const error = () => new FleetError("ARCHIVE_INVALID", true);
const json = (v: unknown) => Buffer.from(`${JSON.stringify(v)}\n`);
function vault(key: Uint8Array) {
  if (key.length !== 32) throw new FleetError("EXPORT_KEY_REQUIRED", true);
  return new Vault(Buffer.from(key).toString("base64"));
}
export class RunArchive {
  private cipher: Vault;
  constructor(
    readonly inspection: RunInspection,
    key: Uint8Array,
  ) {
    this.cipher = vault(key);
  }
  async *export(snapshot: RunSnapshot, principal: ResearchPrincipal): AsyncIterable<Uint8Array> {
    const snap = await this.inspection.retained(snapshot.runId, principal, snapshot.id);
    if (canonical(snap) !== canonical(snapshot)) throw new FleetError("EVIDENCE_SNAPSHOT_INVALID", true);
    const archiveId = randomUUID();
    let index = 0;
    yield json({ format: "fleet.archive/v1", encryption: "AES-256-GCM", archiveId });
    for await (const record of this.records(snap, principal)) {
      await this.inspection.retained(snap.runId, principal, snap.id);
      for (let i = 0; i < record.length; i += FRAME) {
        const cipher = this.cipher.encrypt(
          record.subarray(i, i + FRAME).toString("base64"),
          `fleet-archive:v1:${archiveId}:${index}`,
        );
        yield json({ index: index++, cipher });
      }
    }
  }
  private async *records(snap: RunSnapshot, principal: ResearchPrincipal) {
    const hash = createHash("sha256"),
      refs = new Map<string, ArtifactRef>();
    let records = 0,
      events = 0,
      artifacts = 0,
      gaps = 0,
      totalBytes = 0n;
    const encode = (v: unknown) => {
      const b = json(v);
      if (b.length > RECORD) throw new FleetError("EXPORT_RECORD_TOO_LARGE", true);
      hash.update(b);
      records++;
      return b;
    };
    yield encode({ type: "snapshot", snapshot: snap });
    let cursor: string | undefined;
    do {
      const page = await this.inspection.events(snap.runId, principal, { snapshotId: snap.id, cursor, limit: 500 });
      for (const event of page.events) {
        for (const ref of event.artifacts) {
          if (refs.has(ref.id) && canonical(refs.get(ref.id)) !== canonical(ref)) throw error();
          refs.set(ref.id, ref);
        }
        yield encode({ type: "event", event });
        events++;
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    for (const [id, ref] of refs) {
      await this.inspection.retained(snap.runId, principal, snap.id);
      const { scope } = await this.inspection.artifactReference(snap.runId, principal, id, snap.id),
        record = await this.inspection.artifacts.record(scope, id);
      if (record.status !== "complete" || new Date(record.expires_at) <= this.inspection.store.now()) {
        yield encode({
          type: "artifact.gap",
          id,
          ref,
          status: new Date(record.expires_at) <= this.inspection.store.now() ? "expired" : record.status,
        });
        gaps++;
        continue;
      }
      yield encode({ type: "artifact.begin", id, scope, ref });
      const bodyHash = createHash("sha256");
      let offset = 0;
      for await (const part of this.inspection.artifact(snap.runId, principal, id, snap.id)) {
        bodyHash.update(part);
        for (let i = 0; i < part.length; i += 512 * 1024) {
          const chunk = part.subarray(i, i + 512 * 1024);
          yield encode({
            type: "artifact.data",
            id,
            offset: String(offset),
            data: Buffer.from(chunk).toString("base64"),
          });
          offset += chunk.length;
        }
      }
      if (String(offset) !== ref.bytes) throw error();
      yield encode({ type: "artifact.end", id, bytes: String(offset), digest: bodyHash.digest("hex") });
      artifacts++;
      totalBytes += BigInt(offset);
    }
    yield json({
      type: "footer",
      events,
      artifacts,
      gaps,
      bytes: String(totalBytes),
      records,
      digest: hash.digest("hex"),
    });
  }
}
/** Publish a private destination only after a complete producer succeeds. No overwrite or resume. */
export async function writeArchive(path: string, source: AsyncIterable<Uint8Array>) {
  const temporary = `${path}.${randomUUID()}.partial`,
    file = await open(temporary, "wx", 0o600);
  try {
    for await (const part of source) {
      let offset = 0;
      while (offset < part.length) {
        const { bytesWritten } = await file.write(part, offset, part.length - offset);
        if (!bytesWritten) throw new FleetError("EXPORT_STORAGE", true);
        offset += bytesWritten;
      }
    }
    await file.sync();
    await file.close();
    await link(temporary, path);
  } finally {
    await file.close().catch(() => {});
    await rm(temporary, { force: true });
  }
}
async function* lines(path: string) {
  let pending = Buffer.alloc(0);
  for await (const part of createReadStream(path, { highWaterMark: 65536 })) {
    pending = Buffer.concat([pending, part]);
    for (;;) {
      const i = pending.indexOf(10);
      if (i < 0) break;
      if (i > 3 * FRAME) throw error();
      yield pending.subarray(0, i);
      pending = pending.subarray(i + 1);
    }
    if (pending.length > 3 * FRAME) throw error();
  }
  if (pending.length) throw error();
}
export type ArchiveVerification = {
  status: "verified" | "key_required" | "invalid";
  coverageStatus?: string;
  events?: number;
  artifacts?: number;
  gaps?: number;
  bytes?: string;
  code?: string;
};
/** Offline streaming verification. A missing key is never reported as successful integrity verification. */
export async function verifyArchive(path: string, key?: Uint8Array): Promise<ArchiveVerification> {
  try {
    const cipher = key ? vault(key) : undefined;
    let archiveId: string | undefined,
      index = 0,
      pending = Buffer.alloc(0),
      snapshot: RunSnapshot | undefined,
      ended = false;
    const hash = createHash("sha256"),
      eventIds = new Set<string>(),
      refs = new Map<string, ArtifactRef>(),
      used = new Set<string>(),
      sequences = new Map<string, bigint>();
    let events = 0,
      artifacts = 0,
      gaps = 0,
      totalBytes = 0n,
      records = 0,
      ordinal = 0n;
    let active: { id: string; ref: ArtifactRef; bytes: number; hash: ReturnType<typeof createHash> } | undefined;
    const accept = (raw: Buffer) => {
      if (ended) throw error();
      const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
      if (!snapshot) {
        if (value.type !== "snapshot" || value.snapshot?.version !== "fleet.snapshot/v1") throw error();
        snapshot = value.snapshot;
        const s = snapshot!;
        if (
          !Number.isSafeInteger(s.total) ||
          s.total < 0 ||
          !Array.isArray(s.scopes) ||
          !s.scopes.length ||
          s.scopes.some((scope) => scope.runId !== s.runId || scope.manifestDigest !== s.manifestDigest)
        )
          throw error();
        if (s.manifest !== null && digest(s.manifest) !== s.manifestDigest) throw error();
      } else if (value.type === "event") {
        if (active) throw error();
        const e = EventSchema.parse(value.event);
        if (
          e.scope.runId !== snapshot.runId ||
          !snapshot.scopes.some((s) => canonical(s) === canonical(e.scope)) ||
          eventIds.has(e.id) ||
          BigInt(e.ordinal) <= ordinal ||
          BigInt(e.ordinal) > BigInt(snapshot.maximumOrdinal)
        )
          throw error();
        const stream = `${e.scope.operationId}:${e.scope.operationEpoch}:${e.streamId}`;
        if (BigInt(e.sequence) <= (sequences.get(stream) ?? 0n)) throw error();
        sequences.set(stream, BigInt(e.sequence));
        ordinal = BigInt(e.ordinal);
        eventIds.add(e.id);
        events++;
        for (const ref of e.artifacts) {
          if (refs.has(ref.id) && canonical(refs.get(ref.id)) !== canonical(ref)) throw error();
          refs.set(ref.id, ref);
        }
      } else if (value.type === "artifact.begin" || value.type === "artifact.gap") {
        const ref = ArtifactSchema.parse(value.ref);
        if (active || value.id !== ref.id || used.has(ref.id) || canonical(refs.get(ref.id)) !== canonical(ref))
          throw error();
        used.add(ref.id);
        if (value.type === "artifact.gap") {
          if (!["partial", "withheld", "expired", "writing"].includes(value.status)) throw error();
          gaps++;
        } else {
          if (!snapshot.scopes.some((s) => canonical(s) === canonical(value.scope))) throw error();
          active = { id: ref.id, ref, bytes: 0, hash: createHash("sha256") };
        }
      } else if (value.type === "artifact.data") {
        if (
          !active ||
          active.id !== value.id ||
          String(active.bytes) !== value.offset ||
          typeof value.data !== "string"
        )
          throw error();
        const data = Buffer.from(value.data, "base64");
        if (data.toString("base64") !== value.data || data.length > 512 * 1024 || !data.length) throw error();
        active.hash.update(data);
        active.bytes += data.length;
        if (BigInt(active.bytes) > BigInt(active.ref.bytes)) throw error();
      } else if (value.type === "artifact.end") {
        if (
          !active ||
          active.id !== value.id ||
          String(active.bytes) !== value.bytes ||
          value.bytes !== active.ref.bytes ||
          active.hash.digest("hex") !== value.digest
        )
          throw error();
        totalBytes += BigInt(active.bytes);
        artifacts++;
        active = undefined;
      } else if (value.type === "footer") {
        if (
          active ||
          events !== snapshot.total ||
          used.size !== refs.size ||
          value.events !== events ||
          value.artifacts !== artifacts ||
          value.gaps !== gaps ||
          value.bytes !== String(totalBytes) ||
          value.records !== records ||
          value.digest !== hash.digest("hex")
        )
          throw error();
        ended = true;
        return;
      } else throw error();
      hash.update(raw);
      hash.update("\n");
      records++;
    };
    for await (const line of lines(path)) {
      const value = JSON.parse(line.toString("utf8"));
      if (!archiveId) {
        if (
          value.format !== "fleet.archive/v1" ||
          value.encryption !== "AES-256-GCM" ||
          typeof value.archiveId !== "string" ||
          !/^[a-f0-9-]{36}$/.test(value.archiveId)
        )
          throw error();
        archiveId = value.archiveId;
        continue;
      }
      if (ended || value.index !== index || typeof value.cipher !== "string") throw error();
      const parts = value.cipher.split(".");
      if (
        parts.length !== 4 ||
        parts[0] !== "v1" ||
        parts.slice(1).some((p: string) => Buffer.from(p, "base64").toString("base64") !== p)
      )
        throw error();
      if (cipher) {
        const data = cipher.decrypt<string>(value.cipher, `fleet-archive:v1:${archiveId}:${index}`),
          raw = Buffer.from(data, "base64");
        if (raw.toString("base64") !== data || raw.length > FRAME || !raw.length) throw error();
        pending = Buffer.concat([pending, raw]);
        for (;;) {
          const i = pending.indexOf(10);
          if (i < 0) break;
          accept(pending.subarray(0, i));
          pending = pending.subarray(i + 1);
        }
        if (pending.length > RECORD) throw error();
      }
      index++;
    }
    if (!archiveId || !index) throw error();
    if (!cipher) return { status: "key_required", code: "EXPORT_KEY_REQUIRED" };
    if (!ended || pending.length) throw error();
    return {
      status: "verified",
      events,
      artifacts,
      gaps,
      bytes: String(totalBytes),
      coverageStatus: snapshot?.coverage.status,
    };
  } catch {
    return { status: "invalid", code: "ARCHIVE_INVALID" };
  }
}

export async function readExportKey(path: string): Promise<Buffer> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 200 || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.())
      throw new FleetError("EXPORT_PRIVATE_KEY_FILE_REQUIRED", true);
    const value = (await file.readFile("utf8")).trim(),
      key = /^[a-f0-9]{64}$/.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
    if (key.length !== 32) throw new FleetError("EXPORT_KEY_REQUIRED", true);
    return key;
  } finally {
    await file.close();
  }
}
