import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { FleetError } from "../../src/domain.js";
import { createPactEnvironment } from "../../src/environments/pact.js";
import { RemoteRejection } from "../../src/http.js";

async function execute(error: unknown) {
  const binding = { id: randomUUID(), accountRef: randomUUID(), entityRef: randomUUID() };
  const environment = createPactEnvironment({
    bindings: { agentFor: async () => "actor" },
    now: () => new Date(0),
    game: async () => ({
      profile: async () => ({ accountId: binding.accountRef }),
      open: async () => {},
      close: async () => {},
      submit: async () => {
        throw error;
      },
    }),
  } as never);
  const session = await environment.connect(binding as never);
  try {
    return await session.execute({
      bindingId: binding.id,
      commandId: randomUUID(),
      schemaId: "pact.action.v1",
      payload: { kind: "game.contact.request", recipientKingdomId: randomUUID(), note: "Synthetic" },
    });
  } finally {
    await session.close();
  }
}
it("preserves a trusted pre-dispatch guard refusal for the command executor", async () => {
  const error = new FleetError("RC1_OPERATIONAL_STOP", true);
  await expect(execute(error)).rejects.toBe(error);
});
it("keeps typed native denials rejected and unknown or server failures uncertain", async () => {
  expect(await execute(new RemoteRejection("REQUEST_EXISTS", 400))).toMatchObject({
    status: "rejected",
    code: "REQUEST_EXISTS",
  });
  for (const error of [
    Object.assign(new Error("opaque"), { code: "REQUEST_EXISTS" }),
    new RemoteRejection("REQUEST_EXISTS", 500),
    new FleetError("REQUEST_EXISTS"),
  ])
    expect(await execute(error)).toMatchObject({ status: "unknown" });
});
