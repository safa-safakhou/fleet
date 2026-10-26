import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { CredentialBroker } from "../../src/games/pact/credentials.js";
import { nativePactWorkflow } from "../fixtures/native-pact-workflow.js";
import { fixture, ready } from "../helpers.js";

it("quotes, writes once and closes the original native session after a second consumer rotates OAuth", async () => {
  const pact = await nativePactWorkflow(),
    f = await fixture();
  try {
    await ready(f.store, 1);
    const owner = await pact.addOwner(),
      grant = await pact.authorize(owner.accountId);
    const agent = (await f.store.publicState()).agents[0];
    await f.pool.query("UPDATE agents SET account_id=$2,kingdom_id=$3 WHERE id=$1", [
      agent.id,
      owner.accountId,
      owner.kingdomId,
    ]);
    const broker = new CredentialBroker(f.store, pact.base, "http://localhost", true);
    await broker.save(
      agent.id,
      {
        clientId: grant.clientId,
        accessToken: grant.accessToken,
        refreshToken: grant.refreshToken,
        expiresAt: f.now().getTime() + 120000,
      },
      "ready",
    );
    const original = await broker.game(agent.id);
    await original.open();
    const before = pact.connections;
    // Delayed reasoning crosses the proactive refresh boundary; another broker rotates the native grant.
    f.advance(61000);
    const second = await new CredentialBroker(f.store, pact.base, "http://localhost", true).game(agent.id);
    expect(await pact.oauth.introspectAccessToken(grant.accessToken)).toBeNull();
    await second.close();
    expect((await original.profile()).accountId).toBe(owner.accountId);
    const commandId = randomUUID();
    expect(
      (await original.submit(commandId, { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1 }))
        .code,
    ).toBe("COMMITTED");
    await original.close();
    expect(pact.connections).toBe(before + 1);
    expect(
      (await pact.pool.query("SELECT count(*)::int n FROM command_receipts WHERE command_id=$1", [commandId])).rows[0]
        .n,
    ).toBe(1);
  } finally {
    await pact.close();
    await f.pool.end();
  }
});
