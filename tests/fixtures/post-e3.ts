import { randomBytes } from "node:crypto";
import { prepareOwnedRC1World } from "../../../pact/tests/evaluation/post-e3-owned-world.js";
import { prepareOwnedRC1Cohort } from "../../scripts/lib/post-e3-owned-run.js";
import { builtinArchitectures } from "../../src/app/builtins.js";
import { prepareRC1Protocol } from "../../src/post-e3-plan.js";
import {
  prepareRC2Protocol,
  prepareRC3Protocol,
  prepareRC5Protocol,
  prepareRC6Protocol,
  prepareRC7Protocol,
  prepareRC8Protocol,
  prepareRC9Protocol,
  prepareRC10Protocol,
} from "../../src/post-e3-rc2-plan.js";
import type { PostE3Grant } from "../../src/post-e3-run.js";
import { Store } from "../../src/store.js";
import { fixture } from "../helpers.js";

export async function ownedRC1Fixture(
  stage:
    | "R1-D"
    | "R1-N"
    | "R2-D"
    | "R2-N"
    | "R3-D"
    | "R3-N"
    | "R5-D"
    | "R5-N"
    | "R6-D"
    | "R6-N"
    | "R7-D"
    | "R7-N"
    | "R8-D"
    | "R8-N"
    | "R9-D"
    | "R9-N"
    | "R10-D"
    | "R10-N" = "R1-D",
) {
  const pactUrl = process.env.PACT_ACCEPTANCE_DATABASE_URL,
    nonce = process.env.FLEET_ARCHITECTURE_NONCE;
  if (process.env.FLEET_ARCHITECTURE_TEST !== "1" || !pactUrl || !nonce) throw Error("OWNED_PAIRED_REQUIRED");
  const f = await fixture();
  f.advance(Date.now() - f.now().getTime());
  const store = !stage.startsWith("R1-")
    ? new Store(f.pool, f.store.vault, () => new Date(), builtinArchitectures())
    : f.store;
  const protocol = (
    stage.startsWith("R10-")
      ? prepareRC10Protocol
      : stage.startsWith("R9-")
        ? prepareRC9Protocol
        : stage.startsWith("R8-")
          ? prepareRC8Protocol
          : stage.startsWith("R7-")
            ? prepareRC7Protocol
            : stage.startsWith("R6-")
              ? prepareRC6Protocol
              : stage.startsWith("R5-")
                ? prepareRC5Protocol
                : stage.startsWith("R3-")
                  ? prepareRC3Protocol
                  : stage.startsWith("R2-")
                    ? prepareRC2Protocol
                    : prepareRC1Protocol
  )({
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
          store,
          world,
          control,
          cell,
          stage.startsWith("R8-") || stage.startsWith("R9-") || stage.startsWith("R10-")
            ? { route: "ollama", model: "qwen3.5:9b", thinking: false }
            : { route: "ollama", model: "authored-fake", thinking: true },
          nonce,
          "fake-encrypted-evidence",
          "fake-private-key",
        ),
      );
    }
    const startsAt = new Date().toISOString();
    const grant: PostE3Grant = {
      schemaVersion:
        protocol.study === "negotiation-r10"
          ? "fleet.rc10-grant.v1"
          : protocol.study === "negotiation-r9"
            ? "fleet.rc9-grant.v1"
            : protocol.study === "negotiation-r8"
              ? "fleet.rc8-grant.v1"
              : protocol.study === "negotiation-r7"
                ? "fleet.rc7-grant.v1"
                : protocol.study === "negotiation-r6"
                  ? "fleet.rc6-grant.v1"
                  : protocol.study === "negotiation-r5"
                    ? "fleet.rc5-grant.v1"
                    : protocol.study === "negotiation-r3"
                      ? "fleet.rc3-grant.v1"
                      : protocol.study === "negotiation-r2"
                        ? "fleet.rc2-grant.v1"
                        : "fleet.rc1-grant.v2",
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
    return { ...f, store, protocol, grant, prepared, close };
  } catch (e) {
    await close();
    throw e;
  }
}

export function ownedRC2Fixture(stage: "R2-D" | "R2-N" = "R2-D") {
  return ownedRC1Fixture(stage);
}

export function ownedRC3Fixture(
  stage:
    | "R3-D"
    | "R3-N"
    | "R5-D"
    | "R5-N"
    | "R6-D"
    | "R6-N"
    | "R7-D"
    | "R7-N"
    | "R8-D"
    | "R8-N"
    | "R9-D"
    | "R9-N"
    | "R10-D"
    | "R10-N" = "R3-D",
) {
  return ownedRC1Fixture(stage);
}

export function ownedRC5Fixture(
  stage:
    | "R5-D"
    | "R5-N"
    | "R6-D"
    | "R6-N"
    | "R7-D"
    | "R7-N"
    | "R8-D"
    | "R8-N"
    | "R9-D"
    | "R9-N"
    | "R10-D"
    | "R10-N" = "R5-D",
) {
  return ownedRC1Fixture(stage);
}

export function ownedRC6Fixture(
  stage: "R6-D" | "R6-N" | "R7-D" | "R7-N" | "R8-D" | "R8-N" | "R9-D" | "R9-N" | "R10-D" | "R10-N" = "R6-D",
) {
  return ownedRC1Fixture(stage);
}

export function ownedRC7Fixture(
  stage: "R7-D" | "R7-N" | "R8-D" | "R8-N" | "R9-D" | "R9-N" | "R10-D" | "R10-N" = "R7-D",
) {
  return ownedRC1Fixture(stage);
}

export function ownedRC8Fixture(stage: "R8-D" | "R8-N" | "R9-D" | "R9-N" | "R10-D" | "R10-N" = "R8-D") {
  return ownedRC1Fixture(stage);
}

export function ownedRC9Fixture(stage: "R9-D" | "R9-N" | "R10-D" | "R10-N" = "R9-D") {
  return ownedRC1Fixture(stage);
}

export function ownedRC10Fixture(stage: "R10-D" | "R10-N" = "R10-D") {
  return ownedRC1Fixture(stage);
}
