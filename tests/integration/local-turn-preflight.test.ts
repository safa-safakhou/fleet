import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import * as verification from "../../scripts/local-turn-verification.js";
import { fixture, ready } from "../helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => close?.());
it("admits an audited historical review without changing its unknown allocation, but blocks new uncertainty", async () => {
  const f = await fixture();
  close = () => f.pool.end();
  const cohort = await ready(f.store, 1),
    claim = await f.store.claim("reviewed-history");
  if (!claim) throw Error("MISSING_CLAIM");
  const execution = randomUUID();
  await f.pool.query("UPDATE turns SET state='needs_owner',code='TRANSPORT_UNCERTAIN',unknown_usage=true WHERE id=$1", [
    claim.id,
  ]);
  await f.pool.query(
    "INSERT INTO compute_ledger(id,cohort_id,turn_id,period,tokens,created_at,status) VALUES($1,$2,$3,'fixture',40000,$4,'unknown')",
    [execution, cohort, claim.id, f.now()],
  );
  expect(await verification.unresolvedLocalWork?.(f.pool)).toBeGreaterThan(0);
  const original = (await f.pool.query("SELECT * FROM compute_ledger WHERE id=$1", [execution])).rows[0];
  await f.store.setState(cohort, "paused", true);
  await f.store.reviewTurn(
    claim.id,
    "Synthetic owner explicitly reviewed this exact allocation; preserve all history and do not replay.",
  );
  expect(await verification.unresolvedLocalWork?.(f.pool)).toBe(0);
  expect((await f.pool.query("SELECT * FROM compute_ledger WHERE id=$1", [execution])).rows[0]).toEqual(original);
  await f.pool.query(
    "INSERT INTO compute_ledger(id,cohort_id,turn_id,period,tokens,created_at,status) VALUES($1,$2,$3,'fixture',40000,$4,'unknown')",
    [randomUUID(), cohort, claim.id, new Date(f.now().getTime() + 1000)],
  );
  expect(await verification.unresolvedLocalWork?.(f.pool)).toBeGreaterThan(0);
});

it("does not accept a cancellation without an audited review or an in-flight reservation", async () => {
  const f = await fixture();
  close = () => f.pool.end();
  const cohort = await ready(f.store, 1),
    claim = await f.store.claim("unreviewed-history");
  if (!claim) throw Error("MISSING_CLAIM");
  await f.pool.query("UPDATE turns SET state='cancelled' WHERE id=$1", [claim.id]);
  const execution = randomUUID();
  await f.pool.query(
    "INSERT INTO compute_ledger(id,cohort_id,turn_id,period,tokens,created_at,status) VALUES($1,$2,$3,'fixture',40000,$4,'unknown')",
    [execution, cohort, claim.id, f.now()],
  );
  expect(await verification.unresolvedLocalWork?.(f.pool)).toBeGreaterThan(0);
  await f.pool.query("UPDATE compute_ledger SET status='reserved' WHERE id=$1", [execution]);
  expect(await verification.unresolvedLocalWork?.(f.pool)).toBeGreaterThan(0);
});
