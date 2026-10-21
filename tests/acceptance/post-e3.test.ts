import { randomBytes } from "node:crypto";
import { expect, it } from "vitest";
import { readNegotiationEvidence } from "../../../pact/tests/evaluation/negotiation-outcome.js";
import { prepareOwnedRC1World } from "../../../pact/tests/evaluation/post-e3-owned-world.js";
import { prepareRC1Protocol } from "../../src/post-e3-plan.js";

it("creates two independent canonical RC1 actors and solo controls without borrowing an old study world", async () => {
  if (process.env.FLEET_ARCHITECTURE_TEST !== "1") throw Error("OWNED_PAIRED_REQUIRED");
  const protocol = prepareRC1Protocol({
    stage: "R1-D",
    sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
    modelDigest: "c".repeat(64),
    policyDigest: "d".repeat(64),
    settingsDigest: "e".repeat(64),
    bundleDigest: "f".repeat(64),
    seedNonce: "1".repeat(64),
  });
  const pactUrl = process.env.PACT_ACCEPTANCE_DATABASE_URL,
    nonce = process.env.FLEET_ARCHITECTURE_NONCE;
  if (!pactUrl || !nonce) throw Error("OWNED_PAIRED_REQUIRED");
  const target = { pactUrl, nonce };
  const secrets = {
    rulesKey: randomBytes(32).toString("base64"),
    tokenKey: randomBytes(32).toString("base64"),
    encryptionKey: randomBytes(32).toString("base64"),
  };
  const world = await prepareOwnedRC1World(target, protocol, protocol.cells[0], { secrets, retention: "preserve" });
  let control: Awaited<ReturnType<typeof prepareOwnedRC1World>> | undefined;
  try {
    control = await prepareOwnedRC1World(target, protocol, protocol.cells[0], {
      secrets,
      retention: "preserve",
      control: true,
    });
    expect(world.players).toHaveLength(2);
    expect(new Set([...world.players, ...control.players].map((p) => p.accountId)).size).toBe(4);
    const evidence = await readNegotiationEvidence(world);
    expect(evidence.cellId).toBe(protocol.cells[0].id);
    expect(evidence.receipts).toHaveLength(0);
    await expect(
      prepareOwnedRC1World(
        target,
        protocol,
        { ...protocol.cells[0], worldSeed: "0".repeat(64) },
        { secrets, retention: "preserve" },
      ),
    ).rejects.toThrow("RC1_UNPLANNED_OR_CHANGED_CELL");
    expect((await world.pool.query("SELECT count(*)::int n FROM negotiation_fixture_commands")).rows[0].n).toBe(0);
  } finally {
    await world.pauseClock();
    await control?.pauseClock();
    await world.disconnect();
    await control?.disconnect();
  }
}, 60000);
