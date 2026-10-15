import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterEach, expect, it } from "vitest";
import type { ModelPort } from "../../src/domain.js";
import { Engine } from "../../src/engine.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { FakeGame, fixture, ready } from "../helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
});
for (const decision of ["sign", "decline", "wait"] as const)
  it(`delivers fresh whole offer for a two-decision ${decision} handoff and preserves the scheduled next turn`, async () => {
    const f = await fixture();
    close = () => f.pool.end();
    await ready(f.store, 1);
    await f.pool.query(`UPDATE cohorts SET budget=jsonb_set(budget,'{maxCallsPerTurn}','2')`);
    const read = JSON.parse(await readFile("vendor/pact-observations.json", "utf8")).reads[0],
      offerId = randomUUID(),
      peer = randomUUID();
    const terms = {
      aToB: { resource: "grain", wholePerHour: 10 },
      bToA: null,
      aBond: null,
      bBond: null,
      durationHours: 6,
      noticeHours: 0,
    };
    let totalCalls = 0;
    for (let turn = 0; turn < 2; turn++) {
      const claim = await f.store.claim("social");
      if (!claim) throw Error("claim");
      const game = new FakeGame(claim),
        original = game.read.bind(game),
        tools = game.tools.bind(game);
      game.tools = async () => [...(await tools()), read];
      game.read = async (tool, args) =>
        tool === read.name
          ? {
              section: "social_attention",
              ownerKingdomId: claim.agent.kingdom_id,
              asOfGameTimeMs: 60000,
              records: [
                {
                  id: offerId,
                  type: "SupplyOffer",
                  kingdomA: peer,
                  kingdomB: claim.agent.kingdom_id,
                  counterpartyKingdomId: peer,
                  yourRole: "party_b",
                  version: 2,
                  status: "open",
                  terms,
                  youReceive: terms.aToB,
                  youSend: null,
                  signedBy: [peer],
                  expiresGameTimeMs: 3600000,
                  reason: "signature_decision",
                },
              ],
              socialDelegation: { mode: "manual", version: 0 },
              coverage: { complete: true },
              next: null,
            }
          : original(tool, args);
      let calls = 0;
      const model: ModelPort = {
        decide: async (input) => {
          totalCalls++;
          calls++;
          const c = JSON.parse(input.messages[1].content);
          expect(
            Buffer.byteLength(JSON.stringify(input.messages)) + Buffer.byteLength(JSON.stringify(input.schema)),
          ).toBeLessThanOrEqual(24000);
          expect(c.environment.socialAttention.records[0]).toMatchObject({
            id: offerId,
            version: 2,
            terms,
            youSend: null,
            yourRole: "party_b",
            signedBy: [peer],
          });
          expect(c.environment.openSupplyOffers).toEqual([]);
          return {
            decision:
              turn === 1 || decision === "wait"
                ? { kind: "wait", summary: "No further action justified" }
                : calls === 1
                  ? {
                      kind: "read",
                      tool: "fleet_action_schema",
                      args: { kind: decision === "sign" ? "game.supply.sign" : "game.supply.withdraw" },
                      summary: "Check exact optional action",
                    }
                  : {
                      kind: "action",
                      action: {
                        kind: decision === "sign" ? "game.supply.sign" : "game.supply.withdraw",
                        offerId,
                        ...(decision === "sign" ? { version: 2 } : { expectedVersion: 2 }),
                      },
                      summary: "Choose observed current terms",
                    },
            inputTokens: 100,
            outputTokens: 40,
          };
        },
      };
      await new Engine(f.store, model, async () => game, true, pactAdapter).run(claim);
      const row = (await f.pool.query("SELECT code,pending_command,actions FROM turns WHERE id=$1", [claim.id]))
        .rows[0];
      expect(row.pending_command).toBeNull();
      expect(row.code).not.toMatch(/ERROR|UNCERTAIN|CONTEXT/);
      expect(game.submits).toHaveLength(turn === 0 && decision !== "wait" ? 1 : 0);
      if (game.submits.length)
        expect(game.submits[0].action).toMatchObject({
          offerId,
          ...(decision === "sign" ? { version: 2 } : { expectedVersion: 2 }),
        });
      if (turn === 0 && decision !== "wait") expect(calls).toBe(2);
      f.advance(900000);
    }
    expect(totalCalls).toBe(decision === "wait" ? 2 : 3);
  });
