import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import design from "./negotiation/design.json" with { type: "json" };
import { designDigest, type NegotiationCell } from "./negotiation-plan.js";

function immutable<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const RC1SelectionSchema = z
  .object({
    stage: z.enum(["R1-D", "R1-H", "R1-N"]),
    sources: z.object({ fleet: z.string().regex(/^[a-f0-9]{40}$/), pact: z.string().regex(/^[a-f0-9]{40}$/) }).strict(),
    modelDigest: hash,
    policyDigest: hash,
    settingsDigest: hash,
    bundleDigest: hash,
    seedNonce: hash,
    batchNonce: z.uuid().optional(),
  })
  .strict();
export const rc1Configuration = immutable({
  preset: "full",
  learning: true,
  skillMode: "guarded",
  qualificationPolicy: "skills-policy.v1",
  maxActiveGoals: 8,
  memoryBytes: 6000,
  ownerPriorities: {},
});
export type RC1Selection = z.infer<typeof RC1SelectionSchema>;
export type RC1Cell = Omit<NegotiationCell, "stage" | "baselineAmendment"> & {
  stage: RC1Selection["stage"];
  study: "negotiation-r1";
  seedCommitment: string;
  bundleDigest: string;
  settingsDigest: string;
  configuration: typeof rc1Configuration;
  workLimits: { reads: number; actions: number; messages: number; steps: number; wallTimeMs: number };
};
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
/** Evaluator-only selection; no provider, database, grant or actor is created. */
export function prepareRC1Protocol(raw: unknown) {
  const input = RC1SelectionSchema.parse(raw),
    selection = { ...input, batchNonce: input.batchNonce ?? randomUUID() },
    seedCommitment = sha256(selection.seedNonce),
    cells: RC1Cell[] = [];
  const add = (familyId: string, variant: string, replicate: number) => {
    const family = design.families.find((f) => f.id === familyId);
    if (!family?.variants.includes(variant)) throw Error("RC1_UNPLANNED_FAMILY");
    const rolesReversed = replicate % 2 === 0,
      limits = {
        ...design.classes[family.class as keyof typeof design.classes],
        turnsPerActor: design.classes[family.class as keyof typeof design.classes].turnsPerActor * 4,
      },
      worldSeed = sha256(
        JSON.stringify(["negotiation-r1", selection.stage, familyId, variant, replicate, selection.seedNonce]),
      ),
      cell = {
        study: "negotiation-r1" as const,
        stage: selection.stage,
        id: `negotiation-r1:${selection.stage}:${familyId}:${variant}:${replicate}:${rolesReversed ? "BA" : "AB"}:${seedCommitment}`,
        family: familyId,
        variant,
        replicate,
        rolesReversed,
        seed: Number.parseInt(worldSeed.slice(0, 8), 16),
        worldSeed,
        seedCommitment,
        split: selection.stage === "R1-D" ? ("development" as const) : ("heldOut" as const),
        profile: { id: "autonomous-specialists", version: "1" },
        configuration: rc1Configuration,
        // Native per-turn reservations, shared by both kingdoms. Actual elapsed
        // time is still independently capped by the cell/grant UTC deadline.
        workLimits: {
          reads: limits.turnsPerActor * 2 * 32,
          actions: limits.turnsPerActor * 2 * 3,
          messages: limits.turnsPerActor * 2 * 8,
          steps: limits.turnsPerActor * 2 * 64,
          wallTimeMs: limits.turnsPerActor * 2 * 300000,
        },
        sources: selection.sources,
        modelDigest: selection.modelDigest,
        policyDigest: selection.policyDigest,
        settingsDigest: selection.settingsDigest,
        bundleDigest: selection.bundleDigest,
        clockMode: selection.stage === "R1-N" ? ("native" as const) : ("controlled" as const),
        realProviderAuthorized: false as const,
        initialStateDigest: designDigest({
          state: family.initialState,
          variant,
          rolesReversed,
          rulesId: design.rulesId,
        }),
        limits,
      };
    cells.push({ ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) });
  };
  if (selection.stage === "R1-D")
    for (const replicate of [1, 2]) for (const family of ["C01", "C02"]) add(family, "default", replicate);
  if (selection.stage === "R1-H")
    for (let replicate = 1; replicate <= 5; replicate++)
      for (const family of design.families) for (const variant of family.variants) add(family.id, variant, replicate);
  if (selection.stage === "R1-N") for (const replicate of [1, 2]) add("C01", "default", replicate);
  const protocol = {
    schemaVersion: "fleet.rc1-protocol.v2" as const,
    study: "negotiation-r1" as const,
    ready: false as const,
    realProviderAuthorized: false as const,
    selection,
    seedCommitment,
    configuration: rc1Configuration,
    cells,
    maxima: cells.reduce(
      (a, c) => ({
        calls: a.calls + c.limits.callsPerWorld,
        reservedTokens: a.reservedTokens + c.limits.reservedTokensPerWorld,
        wallDeadlineMs: a.wallDeadlineMs + c.limits.wallDeadlineMs,
      }),
      { calls: 0, reservedTokens: 0, wallDeadlineMs: 0 },
    ),
    native: {
      periodicMinutes: 15,
      providerSlots: 1,
      callsPerTurn: 3,
      inputBytes: 24000,
      outputTokens: 2000,
      helpers: 0,
      eventTriggeredTurns: false,
    },
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC1Protocol = ReturnType<typeof prepareRC1Protocol>;
export function validateRC1Cell(protocol: RC1Protocol, cell: RC1Cell): void {
  const canonical = prepareRC1Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC1_UNPLANNED_OR_CHANGED_CELL");
}
