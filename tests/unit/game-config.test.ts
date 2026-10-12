import { expect, it } from "vitest";
import { config } from "../../src/config.js";

const privateFixture = {
  DATABASE_URL: "postgres://fixture/fixture",
  FLEET_OPERATOR_SECRET: "fixture",
  FLEET_VAULT_KEY: "fixture",
};
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
