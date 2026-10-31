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

it("agent content expiry keeps fresh fields and stays inside the existing32-hook and row bounds", async () => {
  const f = await fixture();
  end = () => f.pool.end();
  const created = await f.store.create({
    name: "Synthetic expiry",
    count: 3,
    intervalMinutes: 15,
    seed: "fixture",
    strategies: ["guardian"],
  });
  const agents = (await f.pool.query("SELECT id FROM agents WHERE cohort_id=$1 ORDER BY ordinal", [created.id])).rows;
  const old = new Date(f.now().getTime() - 31 * 86400000),
    fresh = f.now();
  for (const [i, a] of agents.entries())
    await f.pool.query(
      "UPDATE agents SET read_memory_cipher='synthetic-memory',read_memory_updated_at=$2,decision_feedback_cipher='synthetic-feedback',decision_feedback_at=$3 WHERE id=$1",
      [a.id, i === 0 ? old : fresh, i === 0 ? fresh : old],
    );
  const results = await createMaintenance(f.store).run(1, new AbortController().signal);
  expect(results.length).toBeLessThanOrEqual(32);
  expect(results.every((x) => x.code === "OK" && x.processed <= 1)).toBe(true);
  const rows = (
    await f.pool.query(
      "SELECT read_memory_cipher memory,decision_feedback_cipher feedback FROM agents WHERE cohort_id=$1 ORDER BY ordinal",
      [created.id],
    )
  ).rows;
  expect(rows.filter((x) => x.memory === null || x.feedback === null)).toHaveLength(1);
  expect(rows.filter((x) => x.memory === null && x.feedback === null)).toHaveLength(0);
  await createMaintenance(f.store).run(3, new AbortController().signal);
  expect(
    (
      await f.pool.query(
        "SELECT read_memory_cipher memory,decision_feedback_cipher feedback FROM agents WHERE cohort_id=$1 ORDER BY ordinal",
        [created.id],
      )
    ).rows,
  ).toEqual([
    { memory: null, feedback: "synthetic-feedback" },
    { memory: "synthetic-memory", feedback: null },
    { memory: "synthetic-memory", feedback: null },
  ]);
});
