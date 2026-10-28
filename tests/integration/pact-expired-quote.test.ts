import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { ProposalRejection } from "../../src/domain.js";
import { pactEffectCommand } from "../../src/games/pact/action-effects.js";
import { nativePactWorkflow } from "../fixtures/native-pact-workflow.js";

it("carries native closed-offer expiry through MCP as pre-submission feedback without a receipt", async () => {
  const f = await nativePactWorkflow();
  try {
    const owner = await f.addOwner(),
      peer = await f.addOwner(),
      game = await f.game(owner.token);
    try {
      await game.open();
      await f.pool.query(
        "INSERT INTO social_contacts(product_scope,kingdom_a,kingdom_b,accepted_game_time_ms) VALUES('pact',$1,$2,0)",
        [...[owner.kingdomId, peer.kingdomId].sort()],
      );
      const offerId = randomUUID();
      expect(
        (
          await game.submit(offerId, {
            kind: "game.supply.offer",
            counterpartyKingdomId: peer.kingdomId,
            terms: {
              aToB: { resource: "iron", wholePerHour: 1 },
              bToA: { resource: "silver", wholePerHour: 1 },
              aBond: null,
              bBond: null,
              durationHours: 1,
              noticeHours: 0,
            },
          })
        ).code,
      ).toBe("COMMITTED");
      await f.pool.query("UPDATE supply_offers SET status='expired',expires_game_time_ms=0 WHERE id=$1", [offerId]);
      const binding = { id: randomUUID(), accountRef: owner.accountId };
      const commandId = randomUUID();
      const command = pactEffectCommand(
        binding,
        {
          commandId,
          bindingId: binding.id,
          schemaId: "pact.action.v1",
          payload: { kind: "game.supply.sign", offerId, version: 1 },
        },
        new Date(),
      );
      const error = await game.effects(command).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ProposalRejection);
      expect(error).toMatchObject({
        code: "EXPIRED",
        notDispatched: true,
        feedback: { detail: { phase: "action_effects_quote" } },
      });
      expect((await f.pool.query("SELECT 1 FROM command_receipts WHERE command_id=$1", [commandId])).rowCount).toBe(0);
      expect((await f.pool.query("SELECT 1 FROM supply_contracts WHERE offer_id=$1", [offerId])).rowCount).toBe(0);
    } finally {
      await game.close();
    }
  } finally {
    await f.close();
  }
});
