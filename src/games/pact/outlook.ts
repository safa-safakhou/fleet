import { z } from "zod";
import { type Data, FleetError } from "../../domain.js";
import type { ContinuityFact, ContinuityObservation } from "../../platform/contracts.js";

const units = z.string().regex(/^\d{1,30}$/),
  time = z.string().regex(/^\d{1,20}$/),
  ref = z.string().min(1).max(256),
  refs = z.array(ref).min(1).max(12);
const source = z.object({ sourceRefs: refs }).passthrough();
const Outlook = z
  .object({
    schemaVersion: z.literal("pact.agent-outlook.v1"),
    ownerRef: z.uuid(),
    revision: z.string().min(1).max(100),
    asOfGameTimeMs: time,
    committedTickSequence: time,
    sourceRefs: refs,
    ownerValues: z.string().max(8000),
    resources: z
      .array(
        source.extend({
          resource: z.enum(["iron", "silver", "grain"]),
          ordinaryUnits: units,
          forecastUnits: units,
          throughGameTimeMs: time,
        }),
      )
      .max(3),
    commitments: z
      .array(
        source.extend({
          id: z.uuid(),
          counterpartyRef: z.uuid().nullable(),
          admission: z.literal("confirmed"),
          fulfilment: z.enum(["pending", "fulfilled", "defaulted", "cancelled", "unknown"]),
          settledGameTimeMs: time.nullable(),
        }),
      )
      .max(80),
    outcomes: z
      .array(
        source.extend({
          id: z.uuid(),
          kind: z.literal("battle"),
          result: z.enum(["won", "lost", "unknown"]),
          gameTimeMs: time,
        }),
      )
      .max(20),
    dependencies: z.array(source).max(80),
    knownThreats: z.array(source).max(40),
    feasibility: z
      .object({ candidates: z.array(z.record(z.string(), z.unknown())).max(64), meaning: z.string() })
      .passthrough(),
    coverage: z.record(z.string(), z.unknown()),
    assumptions: z.array(source).max(12),
  })
  .passthrough();
/** PACT-specific meaning is translated here; generic engines see only authorized facts. */
export function pactContinuity(
  raw: Data,
  entityRef: string,
): { revision: string; time: string; sourceRefs: string[]; continuity: ContinuityObservation } {
  const parsed = Outlook.safeParse(raw);
  if (!parsed.success || Buffer.byteLength(JSON.stringify(raw)) > 100000) throw new FleetError("INVALID_OUTLOOK");
  const v = parsed.data;
  if (v.ownerRef !== entityRef) throw new FleetError("IDENTITY_MISMATCH");
  const facts: ContinuityFact[] = [];
  for (const r of v.resources)
    facts.push({
      sourceRef: r.sourceRefs.at(-1) ?? v.sourceRefs[0] ?? "",
      kind: "state",
      subject: "self",
      predicate: `stock:${r.resource}`,
      value: r.ordinaryUnits,
    });
  for (const c of v.commitments)
    facts.push({
      sourceRef: c.sourceRefs.at(-1) ?? v.sourceRefs[0] ?? "",
      kind: "commitment",
      subject: c.counterpartyRef ?? "self",
      predicate: `fulfilment:${c.id}`,
      value: c.fulfilment,
      ...(c.settledGameTimeMs === null
        ? {}
        : { occurredAt: { clockId: "pact.game-time-ms", value: c.settledGameTimeMs } }),
    });
  for (const o of v.outcomes)
    facts.push({
      sourceRef: o.sourceRefs.at(-1) ?? v.sourceRefs[0] ?? "",
      kind: "outcome",
      subject: "self",
      predicate: `battle:${o.id}`,
      value: o.result,
      occurredAt: { clockId: "pact.game-time-ms", value: o.gameTimeMs },
    });
  const selected = facts.slice(0, 40),
    sourceRefs = [...new Set([...v.sourceRefs, ...selected.map((f) => f.sourceRef)])];
  // Authoritative settlement times keep historical outcomes separate from later predictions.
  return {
    revision: v.revision,
    time: v.asOfGameTimeMs,
    sourceRefs,
    continuity: {
      schemaVersion: "fleet.continuity-observation.v1",
      self: {
        capabilities: [], // Filled from the authenticated tool catalog, not account-level allowance quotes.
        needs: {
          resources: v.resources,
          feasibility: v.feasibility.candidates,
          threats: v.knownThreats,
          assumptions: v.assumptions,
          coverage: { ...v.coverage, factsOmitted: Math.max(0, facts.length - selected.length) },
        },
        dependencies: { observed: v.dependencies },
        ownerValues: { text: v.ownerValues },
      },
      facts: selected,
    },
  };
}
