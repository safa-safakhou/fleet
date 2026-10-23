import { expect, it } from "vitest";
import { config } from "../../src/config.js";

const privateFixture = {
  DATABASE_URL: "postgres://fixture/fixture",
  FLEET_OPERATOR_SECRET: "fixture",
  FLEET_VAULT_KEY: "fixture",
};
it("defaults fact requests off and accepts only validated operator configuration", () => {
  expect(config(privateFixture).pactFactRequests).toEqual([]);
  const requests = [
    {
      entityRef: "self",
      id: "records",
      tool: "pact_council_thread_v1",
      args: { kingdomId: "peer" },
      path: ["records"],
    },
  ];
  expect(config({ ...privateFixture, FLEET_PACT_FACT_REQUESTS: JSON.stringify(requests) }).pactFactRequests).toEqual(
    requests,
  );
  expect(() => config({ ...privateFixture, FLEET_PACT_FACT_REQUESTS: "broken" })).toThrow("PACT_FACT_REQUESTS_INVALID");
});
it("selects the configured PACT integration and supports its old endpoint variable", () => {
  expect(config({ ...privateFixture, FLEET_GAME: "pact", FLEET_GAME_BASE_URL: "https://game.example" }).gameBase).toBe(
    "https://game.example",
  );
  expect(config({ ...privateFixture, PACT_BASE_URL: "https://legacy.example" }).gameBase).toBe(
    "https://legacy.example",
  );
});
it("refuses unsupported real games instead of silently connecting to PACT", () => {
  expect(() => config({ ...privateFixture, FLEET_GAME: "another-game" })).toThrow("GAME_ADAPTER_UNSUPPORTED");
});

it("keeps the factual outlook default off and requires the exact version", () => {
  expect(config(privateFixture).pactOutlookVersion).toBeUndefined();
  expect(config({ ...privateFixture, FLEET_PACT_OUTLOOK_VERSION: "pact.agent-outlook.v1" }).pactOutlookVersion).toBe(
    "pact.agent-outlook.v1",
  );
  expect(() => config({ ...privateFixture, FLEET_PACT_OUTLOOK_VERSION: "unknown" })).toThrow();
});
