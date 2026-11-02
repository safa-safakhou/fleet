import { expect, test } from "vitest";
import { config } from "../../src/config.js";
import { connect } from "../../src/db.js";

const env = {
  DATABASE_URL: "postgres://synthetic:synthetic@127.0.0.1:1/synthetic",
  FLEET_OPERATOR_SECRET: "synthetic",
  FLEET_VAULT_KEY: Buffer.alloc(32).toString("base64"),
};
test("parallel runtime config changes only its explicit bounded shared database pool", async () => {
  expect(config(env).databasePoolMax).toBe(8);
  const selected = config({ ...env, FLEET_DATABASE_POOL_MAX: "16" });
  expect(selected.databasePoolMax).toBe(16);
  const defaultPool = connect(env.DATABASE_URL),
    expanded = connect(env.DATABASE_URL, selected.databasePoolMax);
  try {
    expect(defaultPool.options.max).toBe(8);
    expect(expanded.options.max).toBe(16);
  } finally {
    await defaultPool.end();
    await expanded.end();
  }
});
test.each(["0", "33", "1.5", "NaN"])("refuses invalid database capacity %s before connecting", (input) => {
  expect(() => config({ ...env, FLEET_DATABASE_POOL_MAX: input })).toThrow();
  expect(() => connect(env.DATABASE_URL, Number(input))).toThrow("DATABASE_POOL_LIMIT");
});

test("two-minute cadence is an explicit choice while unsupported intervals remain refused", async () => {
  const { Draft } = await import("../../src/domain.js");
  const draft = { name: "Synthetic capacity", count: 1, seed: "capacity", strategies: ["guardian"] };
  expect(Draft.parse({ ...draft, intervalMinutes: 2 }).intervalMinutes).toBe(2);
  for (const intervalMinutes of [1, 3, 0, -1]) expect(() => Draft.parse({ ...draft, intervalMinutes })).toThrow();
});
