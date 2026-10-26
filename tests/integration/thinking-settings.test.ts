import { expect, it } from "vitest";
import { fixture, ready } from "../helpers.js";

it("audits thinking/output changes only on resolved paused cohorts, retaining history and other limits", async () => {
  const f = await fixture();
  try {
    const id = await ready(f.store, 1);
    await expect(f.store.enableThinking(id, 8192, "Owner requests a bounded thinking-mode experiment")).rejects.toThrow(
      "COHORT_NOT_EDITABLE",
    );
    await f.store.setState(id, "paused", false);
    const before = (await f.pool.query("SELECT model,budget,anchor_at FROM cohorts WHERE id=$1", [id])).rows[0];
    await f.store.enableThinking(id, 8192, "Owner requests a bounded thinking-mode experiment");
    const after = (await f.pool.query("SELECT model,budget,anchor_at FROM cohorts WHERE id=$1", [id])).rows[0];
    expect(after.model).toEqual({ ...before.model, thinking: true });
    expect(after.budget).toEqual({ ...before.budget, maxOutputTokens: 8192 });
    expect(after.anchor_at).toEqual(before.anchor_at);
    expect((await f.pool.query("SELECT kind FROM audit_events WHERE kind='cohort.thinking_enabled'")).rowCount).toBe(1);
    await f.store.setState(id, "running", true);
    const claim = await f.store.claim("synthetic");
    expect(claim).toBeTruthy();
    expect(claim!.deadline.getTime() - f.store.now().getTime()).toBeGreaterThan(350000);
    await f.store.setState(id, "paused", false);
    await expect(f.store.enableThinking(id, 8192, "Never alter a running or unresolved execution")).rejects.toThrow(
      "UNRESOLVED_EXECUTION",
    );
  } finally {
    await f.pool.end();
  }
});
