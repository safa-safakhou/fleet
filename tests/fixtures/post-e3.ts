import { randomBytes } from "node:crypto";
import { prepareOwnedRC1World } from "../../../pact/tests/evaluation/post-e3-owned-world.js";
import { prepareOwnedRC1Cohort } from "../../scripts/lib/post-e3-owned-run.js";
import { prepareRC1Protocol } from "../../src/post-e3-plan.js";
import type { RC1Grant } from "../../src/post-e3-run.js";
import { fixture } from "../helpers.js";

export async function ownedRC1Fixture(stage: "R1-D" | "R1-N" = "R1-D") {
  const pactUrl = process.env.PACT_ACCEPTANCE_DATABASE_URL,
    nonce = process.env.FLEET_ARCHITECTURE_NONCE;
  if (process.env.FLEET_ARCHITECTURE_TEST !== "1" || !pactUrl || !nonce) throw Error("OWNED_PAIRED_REQUIRED");
  const f = await fixture();
  f.advance(Date.now() - f.now().getTime());
  const protocol = prepareRC1Protocol({
    stage,
    sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
    modelDigest: "c".repeat(64),
    policyDigest: "d".repeat(64),
    settingsDigest: "e".repeat(64),
    bundleDigest: "f".repeat(64),
    seedNonce: "1".repeat(64),
  });
  const worlds: Awaited<ReturnType<typeof prepareOwnedRC1World>>[] = [],
    prepared = [];
  const close = async () => {
    for (const w of worlds) await w.disconnect();
    await f.pool.end();
  };
  try {
    for (const cell of protocol.cells) {
      const secrets = {
        rulesKey: randomBytes(32).toString("base64"),
        tokenKey: randomBytes(32).toString("base64"),
        encryptionKey: randomBytes(32).toString("base64"),
      };
      const world = await prepareOwnedRC1World({ pactUrl, nonce }, protocol, cell, { secrets, retention: "preserve" });
      worlds.push(world);
      const control = await prepareOwnedRC1World({ pactUrl, nonce }, protocol, cell, {
        secrets,
        retention: "preserve",
        control: true,
      });
      worlds.push(control);
      prepared.push(
        await prepareOwnedRC1Cohort(
          f.store,
          world,
          control,
          cell,
          { route: "ollama", model: "authored-fake", thinking: true },
          nonce,
          "fake-encrypted-evidence",
          "fake-private-key",
        ),
      );
    }
    const startsAt = new Date().toISOString();
    const grant: RC1Grant = {
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
      scope: "new_owned_synthetic_worlds",
      startsAt,
      cutoffAt: new Date(Date.parse(startsAt) + protocol.maxima.wallDeadlineMs).toISOString(),
      bindings: prepared.map((p) => p.binding),
    };
    return { ...f, protocol, grant, prepared, close };
  } catch (e) {
    await close();
    throw e;
  }
}
