import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { compactFacts } from "../../src/games/pact/adapter.js";
import { projectRead } from "../../src/games/pact/context.js";
import { compactEnvironment } from "../../src/games/pact/environment.js";

const data = JSON.parse(readFileSync(new URL("../fixtures/admission-replays-20261014.json", import.meta.url), "utf8"));
it("delivers each of 106 source quota observations without recomputing server permission", () => {
  for (const r of data.quotaRefusals) {
    const resources = Object.fromEntries(
      Object.entries(r.permissionWhole).map(([asset, raw]) => {
        const a = raw as Record<string, number>;
        return [
          asset,
          {
            ceilingUnits: String(a.limit * 600),
            legacySpentUnits: String(a.legacy * 600),
            rollingSpentUnits: String(a.rolling_spent * 600),
            reservedUnits: String(a.reserved * 600),
            headroomUnits: String(a.remaining * 600),
            reserveFloorUnits: "0",
            releaseSchedule: [],
            reservations: [],
          },
        ];
      }),
    );
    const facts = compactFacts({
      world: { authority: { schemaVersion: "pact.authority-observation.v1", resources } },
      guide: {},
    });
    const delivered = compactEnvironment({ ...facts, optional: "x".repeat(12000) }, 6000);
    for (const asset of Object.keys(resources)) {
      const { releaseSchedule: _s, reservations: _r, ...totals } = resources[asset] as Record<string, unknown>;
      expect((delivered.authority as { resources: Record<string, unknown> }).resources[asset]).toMatchObject(totals);
    }
  }
});
it("keeps a selected admission quote whole or explicitly omitted, never certifies truncated terms", () => {
  const quote = {
    schemaVersion: "pact.construction-quote.v1",
    admission: { allowed: false, blockers: ["INSUFFICIENT_ALLOWANCE:iron"] },
    resources: {
      iron: {
        headroomUnits: "60000",
        requiredReservationUnits: "108000",
        reservedUnits: "324000",
        reserveFloorUnits: "0",
      },
    },
    immediateStart: { possible: false, blockers: ["PREREQUISITE", "INSUFFICIENT_STOCK"] },
  };
  const entry = {
    tool: "pact_decision_support_v2",
    args: { candidateId: "owned-current" },
    result: { candidate: { id: "owned-current", checks: { admissionQuote: quote } } },
  };
  expect(projectRead(entry, 6000)).toEqual(entry);
  const huge = { ...entry, result: { candidate: { ...entry.result.candidate, extra: "x".repeat(20000) } } };
  const result = projectRead(huge, 2500);
  expect(JSON.stringify(result)).not.toContain('"admissionQuote"');
  expect(result.coverage ?? result.omitted).toBeTruthy();
});
