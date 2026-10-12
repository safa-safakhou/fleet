import { expect, it } from "vitest";
import { fitMessages } from "../../src/context.js";
import { decisionSchema, object } from "../../src/domain.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { capabilityMatrix, humanGameKinds } from "../../src/games/pact/capabilities.js";
import { constructionRecovery } from "../../src/games/pact/construction.js";
import { boundedReads, narrowRead } from "../../src/games/pact/context.js";
import { actionKinds } from "../../src/games/pact/contracts.js";

it("keeps requested read feedback while evicting optional cached knowledge; narrows oversized results explicitly", () => {
  const requestedRead = {
    tool: "pact_inbox_read_v1",
    args: {},
    result: { messages: [], requests: [] },
    observedAt: "2026-10-13T00:00:00Z",
  };
  const context = {
    environment: { profile: { kingdomId: "fixture" } },
    requestedRead,
    readResults: Array.from({ length: 4 }, (_, n) => ({
      tool: "fleet_read_schema",
      args: { name: `${n}` },
      result: { description: "界".repeat(1500) },
    })),
  };
  const full = fitMessages(context, "Choose", decisionSchema, 4000, boundedReads, narrowRead);
  expect(JSON.parse(full[1].content).requestedRead).toEqual(requestedRead);
  const large = fitMessages(
    { ...context, requestedRead: { ...requestedRead, result: { privatePage: "界".repeat(30000) } } },
    "Choose",
    decisionSchema,
    4000,
    boundedReads,
    narrowRead,
  );
  const narrowed = JSON.parse(large[1].content).requestedRead;
  expect(narrowed.tool).toBe(requestedRead.tool);
  expect(narrowed.narrowing.schemaLookup.args.name).toBe(requestedRead.tool);
  expect(narrowed.narrowing.omittedFields).toContain("privatePage");
  expect(object(narrowed.coverage).complete).not.toBe(true);
  expect(
    Buffer.byteLength(JSON.stringify(large)) + Buffer.byteLength(JSON.stringify(decisionSchema)),
  ).toBeLessThanOrEqual(4000);
});
it("covers every action, excludes all six human-only game actions, and reports mandate/delegation restrictions without expanding policy", () => {
  const facts = { guide: { mandate: { allowedActions: ["world.read"] }, socialDelegation: { mode: "manual" } } };
  const matrix = capabilityMatrix(facts, null);
  expect(matrix.map((m) => m.kind)).toEqual(actionKinds);
  for (const kind of humanGameKinds)
    expect(matrix.find((m) => m.kind === kind)?.blocked).toBe("HUMAN_DECISION_REQUIRED");
  expect(matrix.find((m) => m.kind === "game.building.queue")?.blocked).toBe("OBSERVED_MANDATE_DENIED");
  expect(matrix.find((m) => m.kind === "game.contact.answer")?.blocked).toBe("SOCIAL_DELEGATION_REQUIRED");
  const exception = capabilityMatrix(facts, { allowedKinds: ["game.building.cancel"] });
  expect(exception.find((m) => m.kind === "game.building.cancel")).toMatchObject({
    route: "owner_policy_only",
    blocked: null,
  });
  expect(exception.find((m) => m.kind === "game.training.cancel")?.blocked).toBe("HUMAN_DECISION_REQUIRED");
  expect(
    capabilityMatrix(facts, { allowedKinds: ["game.building.queue"] }).find((m) => m.kind === "game.building.queue"),
  ).toMatchObject({ route: "owner_policy_only", blocked: null });
  expect(
    capabilityMatrix({ guide: { mandate: null } }, null).find((m) => m.kind === "game.building.queue")?.blocked,
  ).toBe("OBSERVED_MANDATE_DENIED");
});
const base = {
  asOfGameTimeMs: 120000,
  buildings: [
    { kind: "hall", level: 1 },
    { kind: "farm", level: 2 },
    { kind: "barracks", level: 1 },
    { kind: "mine", level: 2 },
  ],
  builders: [
    {
      slot: 1,
      instructionId: "hall-fixture",
      kind: "hall",
      targetLevel: 2,
      state: "waiting",
      prerequisiteCheck: "hall_prerequisite",
      missingBuildings: [{ kind: "barracks", level: 2 }],
    },
    {
      slot: 2,
      instructionId: "mine-fixture",
      kind: "mine",
      targetLevel: 3,
      state: "waiting",
      prerequisiteCheck: "hall_limit",
      missingBuildings: [{ kind: "hall", level: 2 }],
    },
  ],
  nextUpgradeChecks: [
    { kind: "mine", targetLevel: 3, prerequisiteCheck: "hall_limit", missingBuildings: [{ kind: "hall", level: 2 }] },
  ],
};
it("replays two occupied waiting slots and gives exact human recovery options", () => {
  const before = structuredClone(base);
  const report = constructionRecovery(base);
  expect(report.status).toBe("owner_required");
  expect(object((report.ownerOptions as unknown[])[0]).action).toEqual({
    kind: "game.building.cancel",
    instructionId: "hall-fixture",
  });
  expect(base).toEqual(before);
});
it("distinguishes active dependency progress, open capacity, unknown prerequisites and a dependency cycle", () => {
  expect(
    constructionRecovery({
      ...base,
      builders: [
        base.builders[0],
        { slot: 2, instructionId: "barracks-active", kind: "barracks", targetLevel: 2, state: "active" },
      ],
    }).status,
  ).toBe("progress_possible");
  expect(constructionRecovery({ ...base, builders: [base.builders[0], { slot: 2, state: null }] }).status).toBe(
    "waiting_or_unknown",
  );
  expect(
    constructionRecovery({ ...base, builders: base.builders.map((b) => ({ ...b, missingBuildings: [] })) }).status,
  ).toBe("waiting_or_unknown");
  expect(
    constructionRecovery({
      ...base,
      builders: [base.builders[0], { ...base.builders[1], kind: "barracks", targetLevel: 2 }],
    }).status,
  ).toBe("owner_required");
});
it("prevents consuming the last waiting position with a blocked queue while allowing a ready prerequisite", () => {
  const world = {
    ...base,
    builders: [base.builders[0], { slot: 2, state: null }],
    nextUpgradeChecks: [
      ...base.nextUpgradeChecks,
      { kind: "barracks", targetLevel: 2, prerequisiteCheck: "ready", missingBuildings: [] },
    ],
  };
  expect(
    pactAdapter.preflight?.({ kind: "game.building.queue", building: "mine", targetLevel: 3, slot: 2 }, { world })
      ?.code,
  ).toBe("CONSTRUCTION_DEADLOCK_PREVENTED");
  expect(
    pactAdapter.preflight?.({ kind: "game.building.queue", building: "barracks", targetLevel: 2, slot: 2 }, { world }),
  ).toBeUndefined();
});
