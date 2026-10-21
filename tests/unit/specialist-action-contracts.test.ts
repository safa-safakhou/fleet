import { expect, it } from "vitest";
import { object } from "../../src/domain.js";
import { pactActionContracts } from "../../src/games/pact/proposals.js";

it("narrows specialist generation to its immutable charter without changing ordinary profile contracts", () => {
  const original = pactActionContracts({});
  expect(original.length).toBeGreaterThan(0);
  expect(pactActionContracts({}, [])).toEqual([]);
  const constrained = pactActionContracts({}, ["game.contact.request"]);
  expect(constrained.length).toBeGreaterThan(0);
  expect(
    constrained.flatMap((c) =>
      (c.payloadSchema.anyOf as unknown[]).map((s) => object(object(object(s).properties).kind).const),
    ),
  ).toEqual(["game.contact.request"]);
  expect(pactActionContracts({})).toEqual(original);
});
