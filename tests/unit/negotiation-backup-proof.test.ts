import { createHash, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  loadPreparationRestoreGate,
  openPreparationArchive,
  sealPreparationArchive,
  verifyPreparationRestore,
} from "../../scripts/lib/negotiation-backup-proof.js";

it("refuses a missing preparation archive before execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "negotiation-backup-"));
  try {
    await expect(
      loadPreparationRestoreGate(root, {
        sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
        protocolDigest: "c".repeat(64),
        fixtureNonce: "d".repeat(64),
      }),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true });
  }
});
it("authenticates the full backup before use and binds restored state to exact source, nonce and protocol", async () => {
  const key = randomBytes(32),
    payload = {
      schemaVersion: "fleet.negotiation-preparation-backup.v1" as const,
      sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
      protocolDigest: "c".repeat(64),
      fixtureNonce: "d".repeat(64),
      databases: {
        fleet_test: { dump: Buffer.from("synthetic dump").toString("base64"), fingerprint: "e".repeat(64) },
        pact_test: { dump: Buffer.from("synthetic dump").toString("base64"), fingerprint: "f".repeat(64) },
      },
    };
  const archive = sealPreparationArchive(payload, key);
  expect(openPreparationArchive(archive, key)).toEqual(payload);
  expect(() => openPreparationArchive(archive, randomBytes(32))).toThrow();
  const proof = {
    schemaVersion: "fleet.negotiation-preparation-restore.v1",
    sources: payload.sources,
    protocolDigest: payload.protocolDigest,
    fixtureNonce: payload.fixtureNonce,
    archiveSha256: createHash("sha256").update(archive).digest("hex"),
    restored: {
      fleet_test: payload.databases.fleet_test.fingerprint,
      pact_test: payload.databases.pact_test.fingerprint,
    },
  };
  expect(verifyPreparationRestore(archive, key, proof, payload)).toBe(true);
  const root = await mkdtemp(join(tmpdir(), "negotiation-backup-"));
  try {
    await mkdir(join(root, "keys"));
    await writeFile(join(root, "preparation-backup.json"), archive);
    await writeFile(join(root, "preparation-restore-proof.json"), JSON.stringify(proof));
    await writeFile(join(root, "keys/backup.key"), key.toString("base64"));
    const guard = await loadPreparationRestoreGate(root, payload);
    await expect(guard()).resolves.toBeUndefined();
    await writeFile(
      join(root, "preparation-restore-proof.json"),
      JSON.stringify({ ...proof, fixtureNonce: "0".repeat(64) }),
    );
    await expect(guard()).rejects.toThrow("PREPARATION_RESTORE_CHANGED");
  } finally {
    await rm(root, { recursive: true });
  }
  expect(() =>
    verifyPreparationRestore(
      archive,
      key,
      { ...proof, restored: { ...proof.restored, fleet_test: "0".repeat(64) } },
      payload,
    ),
  ).toThrow("PREPARATION_RESTORE_MISMATCH");
  expect(() => verifyPreparationRestore(archive, key, proof, { ...payload, fixtureNonce: "0".repeat(64) })).toThrow(
    "PREPARATION_RESTORE_SCOPE",
  );
  const corrupted = Buffer.from(archive);
  corrupted[corrupted.length - 10] ^= 1;
  expect(() => openPreparationArchive(corrupted, key)).toThrow();
});
