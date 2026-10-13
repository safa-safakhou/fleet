import { afterEach, expect, it } from "vitest";
import { continuousBudget, fixture } from "../helpers.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => cleanup?.());
it("persists an explicit local Ollama selection and continuous allowance without creating accounts or admitting work", async () => {
  const f = await fixture();
  cleanup = () => f.pool.end();
  const { id } = await f.store.create({
    name: "Local Nemotron fixture",
    count: 5,
    intervalMinutes: 15,
    seed: "local-fixture",
    strategies: ["guardian", "expansionist", "merchant", "diplomat", "opportunist"],
  });
  const model = { route: "ollama", model: "nemotron-3-nano:4b", thinking: false };
  await f.store.configure(id, { model, budget: continuousBudget });
  expect((await f.store.cohort(id)).model).toEqual(model);
  expect((await f.store.publicState()).cohorts[0].model).toEqual(model);
  expect((await f.store.publicState()).agents).toHaveLength(5);
  expect((await f.store.publicState()).agents.every((a) => a.account_id === null)).toBe(true);
  await expect(f.store.setState(id, "running", false)).rejects.toThrow("LIVE_EXECUTION_DISABLED");
  expect(await f.store.claim("fixture")).toBeNull();
  await expect(
    f.store.configure(id, { model: { ...model, route: "codex-cli" }, budget: continuousBudget }),
  ).rejects.toThrow();
  expect((await f.store.cohort(id)).model).toEqual(model);
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
});
