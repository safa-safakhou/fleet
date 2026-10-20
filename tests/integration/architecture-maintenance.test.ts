import { afterEach, expect, it } from "vitest";
import { createMaintenance } from "../../src/app/maintenance.js";
import { fixture } from "../helpers.js";

let end: (() => Promise<void>) | undefined;
afterEach(async () => {
  await end?.();
});
it("bounds persisted cleanup while preserving fresh sessions and unrelated history", async () => {
  const f = await fixture();
  end = () => f.pool.end();
  for (let i = 0; i < 5; i++)
    await f.pool.query("INSERT INTO operator_sessions(hash,csrf,expires_at) VALUES($1,'fixture',$2)", [
      `old-${i}`,
      new Date(f.now().getTime() - 1000),
    ]);
  await f.pool.query("INSERT INTO operator_sessions(hash,csrf,expires_at) VALUES('fresh','fixture',$1)", [
    new Date(f.now().getTime() + 60000),
  ]);
  const result = await createMaintenance(f.store).run(2, new AbortController().signal);
  expect(result.every((r) => r.code === "OK" && r.processed <= 2)).toBe(true);
  expect((await f.pool.query("SELECT count(*)::int n FROM operator_sessions WHERE hash LIKE 'old-%'")).rows[0].n).toBe(
    3,
  );
  expect((await f.pool.query("SELECT hash FROM operator_sessions WHERE hash='fresh'")).rows[0].hash).toBe("fresh");
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(0);
});
