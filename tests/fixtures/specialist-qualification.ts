import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { OwnedSpecialistWorld } from "../../../pact/tests/evaluation/specialist-owned-world.js";
import { prepareOwnedSpecialistCohort } from "../../scripts/lib/specialist-owned-run.js";
import { prepareSpecialistQualification } from "../../src/specialist-qualification.js";
import { fixture } from "../helpers.js";
export async function ownedSpecialistQualificationFixture() {
  const root = process.env.PACT_ACCEPTANCE_ROOT,
    pactUrl = process.env.TEST_DATABASE_URL,
    nonce = process.env.FLEET_ARCHITECTURE_NONCE;
  if (process.env.FLEET_ARCHITECTURE_TEST !== "1" || !root || !pactUrl || !nonce) throw Error("OWNED_PAIRED_REQUIRED");
  const f = await fixture(),
    opened: OwnedSpecialistWorld[] = [];
  const close = async () => {
    for (const w of opened.splice(0)) await w.disconnect();
    await f.pool.end();
  };
  try {
    f.advance(Date.now() - f.now().getTime());
    const { prepareOwnedSpecialistWorld } = await import(
      pathToFileURL(resolve(root, "tests/evaluation/specialist-owned-world.ts")).href
    );
    const protocol = prepareSpecialistQualification({
        sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
        modelDigest: "c".repeat(64),
        policyDigest: "d".repeat(64),
        settingsDigest: "e".repeat(64),
        bundleDigest: "f".repeat(64),
      }),
      prepared = [];
    for (const cell of protocol.cells) {
      const world: OwnedSpecialistWorld = await prepareOwnedSpecialistWorld(
        { pactUrl, nonce },
        {
          id: cell.id,
          configurationDigest: cell.configurationDigest,
          scenario: cell.scenario,
          sources: cell.selection.sources,
          modelDigest: cell.selection.modelDigest,
          policyDigest: cell.selection.policyDigest,
        },
        {
          retention: "preserve",
          secrets: Object.fromEntries(
            ["rulesKey", "tokenKey", "encryptionKey"].map((k) => [k, randomBytes(32).toString("base64")]),
          ),
        },
      );
      opened.push(world);
      prepared.push(
        await prepareOwnedSpecialistCohort(
          f.store,
          world,
          cell,
          { route: "ollama", model: "authored-fake", thinking: true },
          nonce,
          "encrypted-owned-evidence",
          "private-test-key",
        ),
      );
    }
    const startsAt = new Date().toISOString(),
      grant = {
        schemaVersion: "fleet.specialist-qualification-grant.v1" as const,
        approved: true as const,
        authorizationRef: "authored-fake-only",
        scope: "new_owned_synthetic_worlds" as const,
        protocolDigest: protocol.digest,
        batchNonce: protocol.batchNonce,
        startsAt,
        cutoffAt: new Date(Date.parse(startsAt) + protocol.maxima.wallDeadlineMs).toISOString(),
        bindings: prepared.map((p) => p.binding),
      };
    return { ...f, protocol, grant, prepared, close };
  } catch (error) {
    await close();
    throw error;
  }
}
