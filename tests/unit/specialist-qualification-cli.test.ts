import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { OwnedSpecialistManifestSchema } from "../../scripts/lib/specialist-windows.js";
import { prepareSpecialistQualification } from "../../src/specialist-qualification.js";
import { specialistQualificationCLI } from "../../src/specialist-qualification-cli.js";

const selection = {
  sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
  modelDigest: "c".repeat(64),
  policyDigest: "d".repeat(64),
  settingsDigest: "e".repeat(64),
  bundleDigest: "f".repeat(64),
  batchNonce: randomUUID(),
};
it("previews KQ1 without loading operational ports and rejects a missing exact grant", async () => {
  let executions = 0;
  const io = {
    readJSON: async () => selection,
    executeApproved: async () => {
      executions++;
      return {};
    },
  };
  expect(await specialistQualificationCLI(["--selection", "synthetic-selection"], io)).toMatchObject({
    stage: "KQ1",
    maxima: { calls: 288 },
  });
  expect(executions).toBe(0);
  await expect(
    specialistQualificationCLI(["--protocol", "p", "--execute-approved", "g", "--prepared", "m"], io),
  ).rejects.toThrow();
  expect(executions).toBe(0);
});
it("accepts exactly eight specialist records and no negotiation controls, arbitrary code or provider route", () => {
  const protocol = prepareSpecialistQualification(selection);
  const manifest = {
    schemaVersion: "fleet.owned-specialist-manifest.v1",
    ...selection,
    bundleRoot: "C:\\owned\\bundle",
    privateRoot: "C:\\owned\\KQ1",
    vaultKeyRef: "C:\\owned\\KQ1\\keys\\vault.key",
    reviewKeyRef: "C:\\owned\\KQ1\\keys\\review.key",
    providerModelsRoot: "C:\\owned\\models",
    pins: Array.from({ length: 3 }, (_, i) => ({ relativePath: `fixture-${i}`, bytes: 1, sha256: "1".repeat(64) })),
    fixture: {
      fleetUrl: "postgres://fixture:private@127.0.0.1:33190/fleet_test",
      pactUrl: "postgres://fixture:private@127.0.0.1:33190/pact_test",
      nonce: "2".repeat(64),
      containerId: "3".repeat(64),
    },
    providerPid: 123,
    providerUrl: "http://127.0.0.1:11436",
    model: { route: "ollama", model: "nemotron-3-nano:4b", thinking: true },
    prepared: protocol.cells.map((cell) => ({
      cell,
      binding: {
        cellId: cell.id,
        worldId: randomUUID(),
        cohortId: randomUUID(),
        actorId: randomUUID(),
        peerId: randomUUID(),
        bindingId: randomUUID(),
        fixtureNonce: "2".repeat(64),
        evidenceRef: "encrypted-evidence",
        keyRef: "private-key",
      },
      authorityDigest: "4".repeat(64),
      budgetDeadline: "2026-10-21T21:00:00Z",
      world: { cipher: "retained-encrypted-checkpoint" },
    })),
  };
  const { batchNonce: _nonce, ...base } = manifest;
  expect(OwnedSpecialistManifestSchema.safeParse(base).success).toBe(true);
  expect(OwnedSpecialistManifestSchema.safeParse({ ...base, providerUrl: "https://foreign.invalid" }).success).toBe(
    false,
  );
  expect(OwnedSpecialistManifestSchema.safeParse({ ...base, adapterPath: "arbitrary.js" }).success).toBe(false);
  expect(OwnedSpecialistManifestSchema.safeParse({ ...base, prepared: base.prepared.slice(1) }).success).toBe(false);
  expect(
    OwnedSpecialistManifestSchema.safeParse({
      ...base,
      prepared: base.prepared.map((p) => ({ ...p, control: { cipher: "not-a-specialist-control" } })),
    }).success,
  ).toBe(false);
});
