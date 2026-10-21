import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { z } from "zod";
import { designDigest } from "../../src/negotiation-plan.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/),
  revision = z.string().regex(/^[a-f0-9]{40}$/),
  sources = z.object({ fleet: revision, pact: revision }).strict();
const db = z.object({ dump: z.string().min(1).max(400000000), fingerprint: hash }).strict();
export const PreparationBackupSchema = z
  .object({
    schemaVersion: z.literal("fleet.negotiation-preparation-backup.v1"),
    sources,
    protocolDigest: hash,
    fixtureNonce: hash,
    databases: z.object({ fleet_test: db, pact_test: db }).strict(),
  })
  .strict();
export type PreparationBackup = z.infer<typeof PreparationBackupSchema>;
const envelope = z
  .object({
    schemaVersion: z.literal("fleet.negotiation-backup-envelope.v1"),
    iv: z.string(),
    tag: z.string(),
    data: z.string(),
  })
  .strict();
const proofSchema = z
  .object({
    schemaVersion: z.literal("fleet.negotiation-preparation-restore.v1"),
    sources,
    protocolDigest: hash,
    fixtureNonce: hash,
    archiveSha256: hash,
    restored: z.object({ fleet_test: hash, pact_test: hash }).strict(),
  })
  .strict();
function validate(raw: unknown) {
  const p = PreparationBackupSchema.parse(raw);
  for (const d of Object.values(p.databases))
    if (Buffer.from(d.dump, "base64").toString("base64") !== d.dump) throw Error("PREPARATION_BACKUP_ENCODING");
  return p;
}
export function sealPreparationArchive(raw: unknown, key: Buffer): Buffer {
  if (key.length !== 32) throw Error("PREPARATION_BACKUP_KEY");
  const p = validate(raw),
    iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from("fleet.negotiation-preparation-backup.v1"));
  const data = Buffer.concat([c.update(gzipSync(Buffer.from(JSON.stringify(p)))), c.final()]);
  return Buffer.from(
    JSON.stringify({
      schemaVersion: "fleet.negotiation-backup-envelope.v1",
      iv: iv.toString("base64"),
      tag: c.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    }),
  );
}
/** Authenticate completely in RAM before a caller can start any restore consumer. */
export function openPreparationArchive(archive: Buffer, key: Buffer): PreparationBackup {
  if (key.length !== 32 || archive.length > 512000000) throw Error("PREPARATION_BACKUP_BOUND");
  const e = envelope.parse(JSON.parse(archive.toString("utf8"))),
    iv = Buffer.from(e.iv, "base64"),
    tag = Buffer.from(e.tag, "base64");
  if (iv.length !== 12 || tag.length !== 16) throw Error("PREPARATION_BACKUP_ENCODING");
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAAD(Buffer.from("fleet.negotiation-preparation-backup.v1"));
  d.setAuthTag(tag);
  const plain = Buffer.concat([d.update(Buffer.from(e.data, "base64")), d.final()]);
  return validate(JSON.parse(gunzipSync(plain, { maxOutputLength: 512000000 }).toString("utf8")));
}
export function verifyPreparationRestore(
  archive: Buffer,
  key: Buffer,
  rawProof: unknown,
  expected: Pick<PreparationBackup, "sources" | "protocolDigest" | "fixtureNonce">,
): true {
  const proof = proofSchema.parse(rawProof),
    payload = openPreparationArchive(archive, key);
  if (proof.archiveSha256 !== createHash("sha256").update(archive).digest("hex"))
    throw Error("PREPARATION_RESTORE_MISMATCH");
  for (const field of ["sources", "protocolDigest", "fixtureNonce"] as const)
    if (
      designDigest(proof[field]) !== designDigest(expected[field]) ||
      designDigest(payload[field]) !== designDigest(expected[field])
    )
      throw Error("PREPARATION_RESTORE_SCOPE");
  for (const name of ["fleet_test", "pact_test"] as const)
    if (proof.restored[name] !== payload.databases[name].fingerprint) throw Error("PREPARATION_RESTORE_MISMATCH");
  return true;
}
/** Fixed private paths; verified bytes stay pinned for every later dispatch. */
export async function loadPreparationRestoreGate(
  root: string,
  expected: Pick<PreparationBackup, "sources" | "protocolDigest" | "fixtureNonce">,
) {
  const paths = [
    join(root, "preparation-backup.json"),
    join(root, "preparation-restore-proof.json"),
    join(root, "keys/backup.key"),
  ];
  const bytes: Buffer[] = [];
  for (const path of paths) {
    const s = await lstat(path);
    if (!s.isFile() || s.isSymbolicLink() || s.size > 512000000) throw Error("PREPARATION_RESTORE_FILE");
    bytes.push(await readFile(path));
  }
  verifyPreparationRestore(
    bytes[0],
    Buffer.from(bytes[2].toString("utf8").trim(), "base64"),
    JSON.parse(bytes[1].toString("utf8")),
    expected,
  );
  const hashes = bytes.map((b) => createHash("sha256").update(b).digest("hex"));
  return async () => {
    for (let i = 0; i < paths.length; i++) {
      const s = await lstat(paths[i]);
      if (
        !s.isFile() ||
        s.isSymbolicLink() ||
        createHash("sha256")
          .update(await readFile(paths[i]))
          .digest("hex") !== hashes[i]
      )
        throw Error("PREPARATION_RESTORE_CHANGED");
    }
  };
}
