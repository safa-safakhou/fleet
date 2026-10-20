import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { object } from "../../src/domain.js";
import { Engine } from "../../src/engine.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { FakeGame, fixture, ready } from "../helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => close?.());
it.each([false, true])(
  "delivers optional bookkeeping and actual unsigned-offer meaning in the native legacy request, cognition=%s",
  async (cognition) => {
    const f = await fixture();
    close = () => f.pool.end();
    const cohort = await ready(f.store, 1);
    if (cognition)
      await f.pool.query('UPDATE cohorts SET model=model||\'{"cognition":"llm-centered-v1"}\'::jsonb WHERE id=$1', [
        cohort,
      ]);
    const claim = await f.store.claim("operation-grounding");
    if (!claim) throw Error("MISSING_CLAIM");
    const game = new FakeGame(claim),
      peer = randomUUID(),
      original = game.read.bind(game);
    game.read = async (tool, args) =>
      tool === "pact_agent_guide_v1"
        ? { ...(await original(tool, args)), contacts: [{ kingdomId: peer }] }
        : original(tool, args);
    let calls = 0;
    const contexts: import("../../src/domain.js").Data[] = [];
    await new Engine(
      f.store,
      {
        decide: async (input) => {
          const context = JSON.parse(input.messages[1].content);
          contexts.push(context);
          calls++;
          const decision =
            calls === 1
              ? {
                  kind: "action",
                  action: {
                    kind: "game.supply.offer",
                    counterpartyKingdomId: peer,
                    terms: {
                      aToB: null,
                      bToA: { resource: "grain", wholePerHour: 1 },
                      aBond: null,
                      bBond: null,
                      durationHours: 1,
                      noticeHours: 0,
                    },
                  },
                  summary: "Propose one incoming Grain per hour; no signature or delivery yet",
                }
              : { kind: "wait", summary: "Await a response; no income is established" };
          return {
            decision: cognition
              ? {
                  cognition: {
                    expectedVersion: object(context.cognition).version,
                    analysis: { type: "none", reason: "No new interpretation" },
                  },
                  decision,
                }
              : decision,
            inputTokens: 1,
            outputTokens: 1,
          };
        },
      },
      async () => game,
      true,
      pactAdapter,
    ).run(claim);
    expect(calls).toBe(2);
    expect(object(contexts[0].continuationGuide).requiredForAction).toBe(false);
    expect(object(contexts[1].continuation).outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionKind: "game.supply.offer",
          operationMeaning: {
            stage: "unsigned_proposal_created",
            ownSignatureRecorded: false,
            contractActivated: false,
            resourcesDelivered: false,
          },
        }),
      ]),
    );
    expect(contexts[1].commandResults).toEqual([
      expect.objectContaining({
        actionKind: "game.supply.offer",
        receipt: expect.objectContaining({ code: "COMMITTED" }),
        meaning: {
          stage: "unsigned_proposal_created",
          ownSignatureRecorded: false,
          contractActivated: false,
          resourcesDelivered: false,
        },
      }),
    ]);
    expect(game.submits).toHaveLength(1);
    expect(game.submits[0].action.kind).toBe("game.supply.offer");
  },
);
