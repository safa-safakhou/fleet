import { expect, it } from "vitest";
import { type Data, object } from "../../src/domain.js";
import { compactFacts, pactAdapter } from "../../src/games/pact/adapter.js";

it("explains a committed offer as unsigned terms, never consent, delivery or a completed owner goal", () => {
  const result = pactAdapter.commandMeaning?.({ kind: "game.supply.offer" }, { code: "COMMITTED" });
  expect(result).toEqual({
    stage: "unsigned_proposal_created",
    ownSignatureRecorded: false,
    contractActivated: false,
    resourcesDelivered: false,
  });
  expect(pactAdapter.commandMeaning?.({ kind: "game.supply.offer" }, { code: "TRANSPORT_UNCERTAIN" })).toBeUndefined();
  expect(pactAdapter.commandMeaning?.({ kind: "game.supply.offer" }, { code: "FORBIDDEN" })).toBeUndefined();
});

it("distinguishes own consent and construction admission from their eventual outcomes", () => {
  expect(pactAdapter.commandMeaning?.({ kind: "game.supply.sign" }, { code: "ALREADY_COMMITTED" })).toEqual({
    stage: "own_consent_recorded",
    activation: "Check current same-version peer consent and contract state.",
    resourcesDelivered: false,
  });
  expect(pactAdapter.commandMeaning?.({ kind: "game.building.queue" }, { code: "COMMITTED" })).toEqual({
    stage: "construction_instruction_admitted",
    completedByReceipt: false,
    existingOrdersCancelled: false,
    resourcesAcquired: false,
  });
});

it("retains authoritative production and construction effects through initial and scoped development reads", async () => {
  const development = {
    productionBuildings: { farm: "grain", mine: "iron", market: "silver" },
    constructionEffect: { admitted: "Adds an order", started: "Spends stock", completed: "Changes level" },
  };
  const game = {
    read: async (tool: string, args: Data) =>
      tool === "pact_world_read_v1"
        ? { profile: { kingdomId: "self" } }
        : args.topic === "development"
          ? development
          : {},
    tools: async () => [],
  };
  const facts = await pactAdapter.initial(game as never, "self");
  const construction = () => object(object(compactFacts(facts).agentBriefing).construction);
  expect(construction().productionBuildings).toEqual(development.productionBuildings);
  expect(construction().effect).toEqual(development.constructionEffect);
  pactAdapter.applyRead?.(
    facts,
    "pact_agent_guide_v1",
    { topic: "development" },
    {
      ...development,
      productionBuildings: { mine: "iron" },
    },
    "self",
  );
  expect(construction().productionBuildings).toEqual({ mine: "iron" });
  expect(object(object(compactFacts({ world: {} }).agentBriefing).construction).productionBuildings).toBeUndefined();
});
