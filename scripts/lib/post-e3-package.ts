import { prepareRC1Protocol, rc1Configuration } from "../../src/post-e3-plan.js";
import { prepareRC2Protocol } from "../../src/post-e3-rc2-plan.js";
/** Passive package description, never an operational grant or launcher. */
export function postE3PackageSettings<
  T extends {
    controller: unknown;
    provider: { request: unknown; childEnvironment: Record<string, unknown> };
    leases: unknown;
  },
>(base: T, candidate: "RC1" | "RC2" = "RC1") {
  const original = structuredClone(base);
  const stages = (["D", "H", "N"] as const).map((suffix) => {
    const stage = `${candidate === "RC2" ? "R2" : "R1"}-${suffix}`;
    const protocol = (candidate === "RC2" ? prepareRC2Protocol : prepareRC1Protocol)({
      stage,
      sources: { fleet: "0".repeat(40), pact: "0".repeat(40) },
      modelDigest: "0".repeat(64),
      policyDigest: "0".repeat(64),
      settingsDigest: "0".repeat(64),
      bundleDigest: "0".repeat(64),
      seedNonce: "0".repeat(64),
      batchNonce: "00000000-0000-4000-8000-000000000000",
    });
    return {
      stage,
      ...protocol.maxima,
      cells: protocol.cells.map((c) => ({
        family: c.family,
        variant: c.variant,
        replicate: c.replicate,
        rolesReversed: c.rolesReversed,
        clockMode: c.clockMode,
        turnsPerKingdom: c.limits.turnsPerActor,
        calls: c.limits.callsPerWorld,
        reservedTokens: c.limits.reservedTokensPerWorld,
        gameHorizonMinutes: c.limits.gameHorizonMinutes,
        wallDeadlineMs: c.limits.wallDeadlineMs,
        workLimits: c.workLimits,
      })),
    };
  });
  return {
    ...original,
    schemaVersion: candidate === "RC2" ? "fleet.rc2-settings.v1" : "fleet.rc1-settings.v2",
    study: candidate === "RC2" ? "negotiation-r2" : "negotiation-r1",
    provider: {
      ...original.provider,
      runtimeRootTemplate: "%LOCALAPPDATA%/PACT/Negotiation/bundles/<artifactUUID>/runtime",
      childEnvironment: {
        ...original.provider.childEnvironment,
        OLLAMA_MODELS: "%LOCALAPPDATA%/PACT/Negotiation/provider-stores/<storeUUID>",
      },
    },
    architecture: { id: "autonomous-specialists", version: "1", configuration: rc1Configuration },
    scheduling: {
      periodicMinutes: candidate === "RC2" ? 30 : 15,
      eventTriggeredTurns: false,
      providerSlots: 1,
      callsPerTurn: 3,
      inputBytes: candidate === "RC2" ? 32000 : 24000,
      outputTokens: 2000,
      reservationPerCall: 40000,
      helpers: 0,
    },
    budget: {
      stages,
      accounting:
        "All role turns, corrections, extraction, guarded work and native bookkeeping share the assigned world ceilings. Unknown usage retains its full reservation.",
    },
    leases: {
      ...(original.leases as object),
      scope:
        "Only newly assigned study treatment kingdoms; solo controls have separate identities. Preserve same account/holder/lease IDs.",
    },
    candidateSources: {
      fleet: "7ca67b2891c511a33ad129396ac5aaeed1305fb7",
      pact: "81007a449aab049bbb0beb9ccef18eca0b6d40aa",
    },
    realProviderAuthorized: false,
    productionQualification: false,
    installation: false,
    activation: false,
  };
}
