import { afterEach, expect, it } from "vitest";
import { fixture, ready } from "../helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => close?.());
it("audits a quiescent output-only repair without resetting the original model, allocation, turn, schedule or quotas", async () => {
  const f = await fixture();
  close = () => f.pool.end();
  const id = await ready(f.store, 1),
    claim = await f.store.claim("fixture");
  if (!claim) throw Error("NO_CLAIM");
  await expect(
    f.store.increaseOutputAllowance(id, 4096, "Founder requests repair of thinking output cut off at 2000 tokens"),
  ).rejects.toThrow("COHORT_NOT_EDITABLE");
  const allocation = await f.store.reserveCall(claim);
  await f.store.recordUsage(allocation, 500, 2000);
  await f.store.finish(claim, "MODEL_OUTPUT_TRUNCATED");
  await f.store.setState(id, "paused", true);
  const before = await f.store.cohort(id),
    turns = (await f.pool.query("SELECT * FROM turns")).rows,
    ledger = (await f.pool.query("SELECT * FROM compute_ledger")).rows;
  await f.store.increaseOutputAllowance(id, 4096, "Founder requests repair of thinking output cut off at 2000 tokens");
  const after = await f.store.cohort(id);
  expect(after.budget).toEqual({ ...before.budget, maxOutputTokens: 4096 });
  expect(after.model).toEqual(before.model);
  expect(after.anchor_at).toEqual(before.anchor_at);
  expect((await f.pool.query("SELECT * FROM turns")).rows).toEqual(turns);
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rows).toEqual(ledger);
  expect(
    (await f.pool.query("SELECT detail FROM audit_events WHERE kind='cohort.output_allowance_increased'")).rows[0]
      .detail,
  ).toMatchObject({ previousMaxOutputTokens: 2000, maxOutputTokens: 4096 });
  await expect(f.store.configure(id, { model: after.model, budget: after.budget })).rejects.toThrow(
    "CONSUMED_CONFIG_IMMUTABLE",
  );
  await f.store.setState(id, "stopped", true);
  await expect(f.store.increaseOutputAllowance(id, 4096, "A terminal experiment must stay unchanged")).rejects.toThrow(
    "COHORT_NOT_EDITABLE",
  );
});
it("refuses an output amendment while a prior inference allocation is unresolved", async () => {
  const f = await fixture();
  close = () => f.pool.end();
  const id = await ready(f.store, 1),
    claim = await f.store.claim("fixture");
  if (!claim) throw Error("NO_CLAIM");
  await f.store.reserveCall(claim);
  await f.store.finish(claim, "TRANSPORT_UNCERTAIN");
  await f.store.setState(id, "paused", true);
  await expect(
    f.store.increaseOutputAllowance(id, 4096, "Unknown usage must retain its original allocation and review boundary"),
  ).rejects.toThrow("UNRESOLVED_EXECUTION");
});
