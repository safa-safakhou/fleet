import { expect, it } from "vitest";
import { OwnedNegotiationManifestSchema } from "../../scripts/lib/negotiation-windows.js";

it("rejects incomplete launch packages and arbitrary provider routes before native composition", () => {
  expect(OwnedNegotiationManifestSchema.safeParse({}).success).toBe(false);
  expect(
    OwnedNegotiationManifestSchema.safeParse({
      schemaVersion: "fleet.owned-negotiation-manifest.v1",
      providerUrl: "https://foreign.invalid",
      prepared: [],
      fixtureNonce: "f".repeat(64),
    }).success,
  ).toBe(false);
});
