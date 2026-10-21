import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { prepareRC1Protocol } from "../../src/post-e3-plan.js";
import { validateRC1Grant } from "../../src/post-e3-run.js";

const now = Date.parse("2026-10-21T10:00:00Z");
function fixture() {
  const protocol = prepareRC1Protocol({
    stage: "R1-D",
    sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
    modelDigest: "c".repeat(64),
    policyDigest: "d".repeat(64),
    settingsDigest: "e".repeat(64),
    bundleDigest: "f".repeat(64),
    seedNonce: "1".repeat(64),
  });
  const grant = {
    schemaVersion: "fleet.rc1-grant.v2",
    approved: true,
    authorizationRef: "authored-fake-only",
    protocolDigest: protocol.digest,
    batchNonce: protocol.selection.batchNonce,
    sources: protocol.selection.sources,
    modelDigest: protocol.selection.modelDigest,
    policyDigest: protocol.selection.policyDigest,
    settingsDigest: protocol.selection.settingsDigest,
    bundleDigest: protocol.selection.bundleDigest,
    seedCommitment: protocol.seedCommitment,
    startsAt: new Date(now).toISOString(),
    cutoffAt: new Date(now + 43200000).toISOString(),
    scope: "new_owned_synthetic_worlds",
    bindings: protocol.cells.map((c) => ({
      cellId: c.id,
      worldId: randomUUID(),
      controlWorldId: randomUUID(),
      cohortId: randomUUID(),
      actorIds: [randomUUID(), randomUUID()],
      bindingIds: [randomUUID(), randomUUID()],
      fixtureNonce: "2".repeat(64),
      evidenceRef: "private-fixture-evidence",
      keyRef: "private-fixture-key",
    })),
  };
  return { protocol, grant };
}
it("requires a distinct exact one-shot grant for all R1 worlds and retains UTC/nonce fences", () => {
  const { protocol, grant } = fixture();
  expect(validateRC1Grant(protocol, grant, now).valid).toBe(true);
  expect(validateRC1Grant(protocol, grant, now - 1).valid).toBe(false);
  expect(validateRC1Grant(protocol, grant, now + 43200000).valid).toBe(false);
  expect(validateRC1Grant(protocol, grant, now, [grant.batchNonce]).valid).toBe(false);
  expect(validateRC1Grant(protocol, { ...grant, schemaVersion: "fleet.negotiation-grant.v1" }, now).valid).toBe(false);
  expect(validateRC1Grant(protocol, { ...grant, schemaVersion: "fleet.rc1-grant.v1" }, now).valid).toBe(false);
  expect(validateRC1Grant(protocol, { ...grant, bindings: grant.bindings.slice(1) }, now).valid).toBe(false);
  expect(validateRC1Grant(protocol, { ...grant, bundleDigest: "3".repeat(64) }, now).valid).toBe(false);
  expect(validateRC1Grant({ ...protocol, maxima: { ...protocol.maxima, calls: 1152 } }, grant, now).valid).toBe(false);
});
it("rejects cross-world identity sharing and allowance expansion before any execution", () => {
  const { protocol, grant } = fixture();
  grant.bindings[1].actorIds[0] = grant.bindings[0].actorIds[0];
  expect(validateRC1Grant(protocol, grant, now).valid).toBe(false);
  expect(validateRC1Grant(protocol, { ...grant, cutoffAt: new Date(now + 43200001).toISOString() }, now).valid).toBe(
    false,
  );
  expect(validateRC1Grant(protocol, { ...grant, approved: false }, now).valid).toBe(false);
});
