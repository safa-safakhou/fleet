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
  prepareRC11Protocol,
  prepareRC12Protocol,
  prepareRC13Protocol,
  prepareRC14Protocol,
  prepareRC15Protocol,
  prepareRC16Protocol,
  prepareRC17Protocol,
  prepareRC18Protocol,
  prepareRC19Protocol,
  prepareRC20Protocol,
  prepareRC21Protocol,
  prepareRC22Protocol,
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
    | "R10-N"
    | "R11-D"
    | "R11-N"
    | "R12-D"
    | "R12-N"
    | "R13-D"
    | "R13-N"
    | "R14-D"
    | "R14-N"
    | "R15-D"
    | "R15-N"
    | "R16-D"
    | "R16-N"
    | "R17-D"
    | "R17-N"
    | "R18-D"
    | "R18-N"
    | "R19-D"
    | "R19-N"
    | "R20-D"
    | "R20-N"
    | "R21-D"
    | "R21-N"
    | "R22-D"
    | "R22-N" = "R1-D",
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
    stage.startsWith("R22-")
      ? prepareRC22Protocol
      : stage.startsWith("R21-")
        ? prepareRC21Protocol
        : stage.startsWith("R20-")
          ? prepareRC20Protocol
          : stage.startsWith("R19-")
            ? prepareRC19Protocol
            : stage.startsWith("R18-")
              ? prepareRC18Protocol
              : stage.startsWith("R17-")
                ? prepareRC17Protocol
                : stage.startsWith("R16-")
                  ? prepareRC16Protocol
                  : stage.startsWith("R15-")
                    ? prepareRC15Protocol
                    : stage.startsWith("R14-")
                      ? prepareRC14Protocol
                      : stage.startsWith("R13-")
                        ? prepareRC13Protocol
                        : stage.startsWith("R12-")
                          ? prepareRC12Protocol
                          : stage.startsWith("R11-")
                            ? prepareRC11Protocol
                            : stage.startsWith("R10-")
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
          stage.startsWith("R17-") ||
            stage.startsWith("R18-") ||
            stage.startsWith("R19-") ||
            stage.startsWith("R20-") ||
            stage.startsWith("R21-") ||
            stage.startsWith("R22-")
            ? { route: "ollama", model: "qwen3:14b", thinking: false }
            : stage.startsWith("R15-") || stage.startsWith("R16-")
              ? { route: "ollama", model: "gemma4:12b", thinking: false }
              : stage.startsWith("R14-")
                ? { route: "ollama", model: "gemma4:12b", thinking: true }
                : stage.startsWith("R13-")
                  ? { route: "ollama", model: "gemma4:12b", thinking: false }
                  : stage.startsWith("R8-") ||
                      stage.startsWith("R9-") ||
                      stage.startsWith("R10-") ||
                      stage.startsWith("R11-") ||
                      stage.startsWith("R12-")
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
        protocol.study === "negotiation-r22"
          ? "fleet.rc22-grant.v1"
          : protocol.study === "negotiation-r21"
            ? "fleet.rc21-grant.v1"
            : protocol.study === "negotiation-r20"
              ? "fleet.rc20-grant.v1"
              : protocol.study === "negotiation-r19"
                ? "fleet.rc19-grant.v1"
                : protocol.study === "negotiation-r18"
                  ? "fleet.rc18-grant.v1"
                  : protocol.study === "negotiation-r17"
                    ? "fleet.rc17-grant.v1"
                    : protocol.study === "negotiation-r16"
                      ? "fleet.rc16-grant.v1"
                      : protocol.study === "negotiation-r15"
                        ? "fleet.rc15-grant.v1"
                        : protocol.study === "negotiation-r14"
                          ? "fleet.rc14-grant.v1"
                          : protocol.study === "negotiation-r13"
                            ? "fleet.rc13-grant.v1"
                            : protocol.study === "negotiation-r12"
                              ? "fleet.rc12-grant.v1"
                              : protocol.study === "negotiation-r11"
                                ? "fleet.rc11-grant.v1"
                                : protocol.study === "negotiation-r10"
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
    | "R10-N"
    | "R11-D"
    | "R11-N"
    | "R12-D"
    | "R12-N"
    | "R13-D"
    | "R13-N"
    | "R14-D"
    | "R14-N"
    | "R15-D"
    | "R15-N"
    | "R16-D"
    | "R16-N"
    | "R17-D"
    | "R17-N"
    | "R18-D"
    | "R18-N"
    | "R19-D"
    | "R19-N"
    | "R20-D"
    | "R20-N"
    | "R21-D"
    | "R21-N"
    | "R22-D"
    | "R22-N" = "R3-D",
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
    | "R10-N"
    | "R11-D"
    | "R11-N"
    | "R12-D"
    | "R12-N"
    | "R13-D"
    | "R13-N"
    | "R14-D"
    | "R14-N"
    | "R15-D"
    | "R15-N"
    | "R16-D"
    | "R16-N"
    | "R17-D"
    | "R17-N"
    | "R18-D"
    | "R18-N"
    | "R19-D"
    | "R19-N"
    | "R20-D"
    | "R20-N"
    | "R21-D"
    | "R21-N"
    | "R22-D"
    | "R22-N" = "R5-D",
) {
  return ownedRC1Fixture(stage);
}

export function ownedRC6Fixture(
  stage:
    | "R6-D"
    | "R6-N"
    | "R7-D"
    | "R7-N"
    | "R8-D"
    | "R8-N"
    | "R9-D"
    | "R9-N"
    | "R10-D"
    | "R10-N"
    | "R11-D"
    | "R11-N"
    | "R12-D"
    | "R12-N"
    | "R13-D"
    | "R13-N"
    | "R14-D"
    | "R14-N"
    | "R15-D"
    | "R15-N"
    | "R16-D"
    | "R16-N"
    | "R17-D"
    | "R17-N"
    | "R18-D"
    | "R18-N"
    | "R19-D"
    | "R19-N"
    | "R20-D"
    | "R20-N"
    | "R21-D"
    | "R21-N"
    | "R22-D"
    | "R22-N" = "R6-D",
) {
  return ownedRC1Fixture(stage);
}

export function ownedRC7Fixture(
  stage:
    | "R7-D"
    | "R7-N"
    | "R8-D"
    | "R8-N"
    | "R9-D"
    | "R9-N"
    | "R10-D"
    | "R10-N"
    | "R11-D"
    | "R11-N"
    | "R12-D"
    | "R12-N"
    | "R13-D"
    | "R13-N"
    | "R14-D"
    | "R14-N"
    | "R15-D"
    | "R15-N"
    | "R16-D"
    | "R16-N"
    | "R17-D"
    | "R17-N"
    | "R18-D"
    | "R18-N"
    | "R19-D"
    | "R19-N"
    | "R20-D"
    | "R20-N"
    | "R21-D"
    | "R21-N"
    | "R22-D"
    | "R22-N" = "R7-D",
) {
  return ownedRC1Fixture(stage);
}

export function ownedRC8Fixture(
  stage:
    | "R8-D"
    | "R8-N"
    | "R9-D"
    | "R9-N"
    | "R10-D"
    | "R10-N"
    | "R11-D"
    | "R11-N"
    | "R12-D"
    | "R12-N"
    | "R13-D"
    | "R13-N"
    | "R14-D"
    | "R14-N"
    | "R15-D"
    | "R15-N"
    | "R16-D"
    | "R16-N"
    | "R17-D"
    | "R17-N"
    | "R18-D"
    | "R18-N"
    | "R19-D"
    | "R19-N"
    | "R20-D"
    | "R20-N"
    | "R21-D"
    | "R21-N"
    | "R22-D"
    | "R22-N" = "R8-D",
) {
  return ownedRC1Fixture(stage);
}

export function ownedRC9Fixture(
  stage:
    | "R9-D"
    | "R9-N"
    | "R10-D"
    | "R10-N"
    | "R11-D"
    | "R11-N"
    | "R12-D"
    | "R12-N"
    | "R13-D"
    | "R13-N"
    | "R14-D"
    | "R14-N"
    | "R15-D"
    | "R15-N"
    | "R16-D"
    | "R16-N"
    | "R17-D"
    | "R17-N"
    | "R18-D"
    | "R18-N"
    | "R19-D"
    | "R19-N"
    | "R20-D"
    | "R20-N"
    | "R21-D"
    | "R21-N"
    | "R22-D"
    | "R22-N" = "R9-D",
) {
  return ownedRC1Fixture(stage);
}

export function ownedRC10Fixture(
  stage:
    | "R10-D"
    | "R10-N"
    | "R11-D"
    | "R11-N"
    | "R12-D"
    | "R12-N"
    | "R13-D"
    | "R13-N"
    | "R14-D"
    | "R14-N"
    | "R15-D"
    | "R15-N"
    | "R16-D"
    | "R16-N"
    | "R17-D"
    | "R17-N"
    | "R18-D"
    | "R18-N"
    | "R19-D"
    | "R19-N"
    | "R20-D"
    | "R20-N"
    | "R21-D"
    | "R21-N"
    | "R22-D"
    | "R22-N" = "R10-D",
) {
  return ownedRC1Fixture(stage);
}

export function ownedRC11Fixture(
  stage:
    | "R11-D"
    | "R11-N"
    | "R12-D"
    | "R12-N"
    | "R13-D"
    | "R13-N"
    | "R14-D"
    | "R14-N"
    | "R15-D"
    | "R15-N"
    | "R16-D"
    | "R16-N"
    | "R17-D"
    | "R17-N"
    | "R18-D"
    | "R18-N"
    | "R19-D"
    | "R19-N"
    | "R20-D"
    | "R20-N"
    | "R21-D"
    | "R21-N"
    | "R22-D"
    | "R22-N" = "R11-D",
) {
  return ownedRC1Fixture(stage);
}

export function ownedRC12Fixture(
  stage:
    | "R12-D"
    | "R12-N"
    | "R13-D"
    | "R13-N"
    | "R14-D"
    | "R14-N"
    | "R15-D"
    | "R15-N"
    | "R16-D"
    | "R16-N"
    | "R17-D"
    | "R17-N"
    | "R18-D"
    | "R18-N"
    | "R19-D"
    | "R19-N"
    | "R20-D"
    | "R20-N"
    | "R21-D"
    | "R21-N"
    | "R22-D"
    | "R22-N" = "R12-D",
) {
  return ownedRC1Fixture(stage);
}

export function ownedRC13Fixture(
  stage:
    | "R13-D"
    | "R13-N"
    | "R14-D"
    | "R14-N"
    | "R15-D"
    | "R15-N"
    | "R16-D"
    | "R16-N"
    | "R17-D"
    | "R17-N"
    | "R18-D"
    | "R18-N"
    | "R19-D"
    | "R19-N"
    | "R20-D"
    | "R20-N"
    | "R21-D"
    | "R21-N"
    | "R22-D"
    | "R22-N" = "R13-D",
) {
  return ownedRC1Fixture(stage);
}

export function ownedRC14Fixture(
  stage:
    | "R14-D"
    | "R14-N"
    | "R15-D"
    | "R15-N"
    | "R16-D"
    | "R16-N"
    | "R17-D"
    | "R17-N"
    | "R18-D"
    | "R18-N"
    | "R19-D"
    | "R19-N"
    | "R20-D"
    | "R20-N"
    | "R21-D"
    | "R21-N"
    | "R22-D"
    | "R22-N" = "R14-D",
) {
  return ownedRC1Fixture(stage);
}

export function ownedRC15Fixture(
  stage:
    | "R15-D"
    | "R15-N"
    | "R16-D"
    | "R16-N"
    | "R17-D"
    | "R17-N"
    | "R18-D"
    | "R18-N"
    | "R19-D"
    | "R19-N"
    | "R20-D"
    | "R20-N"
    | "R21-D"
    | "R21-N"
    | "R22-D"
    | "R22-N" = "R15-D",
) {
  return ownedRC1Fixture(stage);
}

export function ownedRC16Fixture(
  stage:
    | "R16-D"
    | "R16-N"
    | "R17-D"
    | "R17-N"
    | "R18-D"
    | "R18-N"
    | "R19-D"
    | "R19-N"
    | "R20-D"
    | "R20-N"
    | "R21-D"
    | "R21-N"
    | "R22-D"
    | "R22-N" = "R16-D",
) {
  return ownedRC1Fixture(stage);
}

export function ownedRC17Fixture(
  stage:
    | "R17-D"
    | "R17-N"
    | "R18-D"
    | "R18-N"
    | "R19-D"
    | "R19-N"
    | "R20-D"
    | "R20-N"
    | "R21-D"
    | "R21-N"
    | "R22-D"
    | "R22-N" = "R17-D",
) {
  return ownedRC1Fixture(stage);
}

export function ownedRC18Fixture(
  stage: "R18-D" | "R18-N" | "R19-D" | "R19-N" | "R20-D" | "R20-N" | "R21-D" | "R21-N" | "R22-D" | "R22-N" = "R18-D",
) {
  return ownedRC1Fixture(stage);
}

export function ownedRC19Fixture(
  stage: "R19-D" | "R19-N" | "R20-D" | "R20-N" | "R21-D" | "R21-N" | "R22-D" | "R22-N" = "R19-D",
) {
  return ownedRC1Fixture(stage);
}

export function ownedRC20Fixture(stage: "R20-D" | "R20-N" | "R21-D" | "R21-N" | "R22-D" | "R22-N" = "R20-D") {
  return ownedRC1Fixture(stage);
}

export function ownedRC21Fixture(stage: "R21-D" | "R21-N" | "R22-D" | "R22-N" = "R21-D") {
  return ownedRC1Fixture(stage);
}

export function ownedRC22Fixture(stage: "R22-D" | "R22-N" = "R22-D") {
  return ownedRC1Fixture(stage);
}
