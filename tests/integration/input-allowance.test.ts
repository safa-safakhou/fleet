import { afterEach, expect, it } from "vitest";
import { fixture, ready } from "../helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => close?.());
it("audits only a paused cohort input increase while retaining consumed history and refusing active or terminal changes", async () => {
  const f = await fixture();
  close = () => f.pool.end();
  const id = await ready(f.store, 1);
  const claim = await f.store.claim("fixture");
  if (!claim) throw Error("NO_CLAIM");
  await expect(
    f.store.increaseInputAllowance(id, 48000, "Current facts and continuity require a larger packet"),
  ).rejects.toThrow("COHORT_NOT_EDITABLE");
  await f.store.finish(claim, "WAIT");
  await f.store.setState(id, "paused", true);
  const before = await f.store.cohort(id);
  const turns = (await f.pool.query("SELECT * FROM turns")).rows;
  await f.store.increaseInputAllowance(id, 48000, "Current facts and continuity require a larger packet");
  const after = await f.store.cohort(id);
  expect(after.budget).toEqual({ ...before.budget, inputByteLimit: 48000 });
  expect(after.model).toEqual(before.model);
  expect(after.anchor_at).toEqual(before.anchor_at);
  expect((await f.pool.query("SELECT * FROM turns")).rows).toEqual(turns);
  expect(
    (await f.pool.query("SELECT detail FROM audit_events WHERE kind='cohort.input_allowance_increased'")).rows[0]
      .detail,
  ).toMatchObject({ previousInputByteLimit: 24000, inputByteLimit: 48000 });
  await expect(f.store.configure(id, { model: after.model, budget: after.budget })).rejects.toThrow(
    "CONSUMED_CONFIG_IMMUTABLE",
  );
  await f.store.setState(id, "stopped", true);
  await expect(f.store.increaseInputAllowance(id, 64000, "Current facts need more space")).rejects.toThrow(
    "COHORT_NOT_EDITABLE",
  );
});
