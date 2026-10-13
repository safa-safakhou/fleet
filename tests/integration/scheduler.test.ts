import { afterEach, describe, expect, it } from "vitest";
import { budget, continuousBudget, fixture, ready } from "../helpers.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
});
describe("durable fleet scheduler", () => {
  it("continuous 50-owner schedules retain bindings and lifetime usage across cycles, years and resume", async () => {
    const f = await fixture();
    cleanup = () => f.pool.end();
    const id = await ready(f.store, 50);
    await f.store.setState(id, "paused", true);
    await f.store.configure(id, { model: { route: "codex-cli", model: "synthetic-luna" }, budget: continuousBudget });
    const identities = (await f.store.publicState()).agents.map((a) => [a.id, a.account_id, a.kingdom_id]);
    await f.store.setState(id, "running", true);
    const cycles: string[][] = [[], []];
    for (const cycle of cycles) {
      for (let i = 0; i < 50; i++) {
        const claim = await f.store.claim("synthetic-worker");
        if (!claim) throw Error("missing staggered turn");
        expect(claim.deadline.getTime() - f.now().getTime()).toBe(120000);
        cycle.push(claim.agentId);
        const reservation = await f.store.reserveCall(claim);
        await f.store.recordUsage(reservation, 123, 45);
        await f.store.finish(claim, "WAIT");
        f.advance(18000);
      }
    }
    expect(new Set(cycles[0]).size).toBe(50);
    expect(cycles[1]).toEqual(cycles[0]);
    await f.store.setState(id, "paused", true);
    f.advance(3653 * 86400000);
    await f.store.setState(id, "running", true);
    const later = await f.store.claim("replacement-worker");
    if (!later) throw Error("missing continuous turn after years");
    expect(later.deadline.getTime() - f.now().getTime()).toBe(120000);
    for (let i = 0; i < 3; i++) await f.store.reserveCall(later);
    await expect(f.store.reserveCall(later)).rejects.toThrow("TURN_CALL_LIMIT");
    expect((await f.store.publicState()).usage[0].calls).toBe(103);
    expect((await f.store.publicState()).agents.map((a) => [a.id, a.account_id, a.kingdom_id])).toEqual(identities);
    expect((await f.store.cohort(id)).state).toBe("running");
    await f.store.setState(id, "paused", true);
    await expect(f.store.active(later)).rejects.toThrow("CLAIM_FENCED");
    await f.store.setState(id, "stopped", true);
    await expect(f.store.setState(id, "running", true)).rejects.toThrow("TERMINAL_COHORT");
  });
  it("repeated start is idempotent and cohort resume preserves individually paused agents", async () => {
    const f = await fixture();
    cleanup = () => f.pool.end();
    const id = await ready(f.store, 2);
    const before = await f.store.cohort(id);
    await f.store.setState(id, "running", true);
    expect((await f.store.cohort(id)).generation).toBe(before.generation);
    const agent = (await f.store.publicState()).agents[0];
    await f.store.agentState(agent.id, "paused", true);
    await f.store.setState(id, "paused", true);
    await f.store.setState(id, "running", true);
    expect((await f.store.agent(agent.id)).state).toBe("paused");
  });
  it("creates N independent drafts without accounts, inference or schedules", async () => {
    const f = await fixture();
    cleanup = () => f.pool.end();
    const c = await f.store.create({
      name: "New fleet",
      count: 50,
      intervalMinutes: 15,
      seed: "balanced",
      strategies: ["guardian", "expansionist", "merchant", "diplomat", "opportunist"],
    });
    const s = await f.store.publicState();
    expect(s.agents).toHaveLength(50);
    expect(new Set(s.agents.map((a) => a.id)).size).toBe(50);
    expect(s.agents.every((a) => a.account_id === null)).toBe(true);
    expect(await f.store.claim("worker")).toBe(null);
    expect((await f.store.cohort(c.id)).model).toBe(null);
  });
  it("requires model, allowance, accounts and explicit execution permission", async () => {
    const f = await fixture();
    cleanup = () => f.pool.end();
    const c = await f.store.create({
      name: "Draft",
      count: 1,
      intervalMinutes: 15,
      seed: "a",
      strategies: ["guardian"],
    });
    await expect(f.store.setState(c.id, "running", false)).rejects.toThrow("LIVE_EXECUTION_DISABLED");
    await expect(f.store.setState(c.id, "running", true)).rejects.toThrow("MODEL_AND_BUDGET_REQUIRED");
    await f.store.configure(c.id, { model: { route: "ollama", model: "fake" }, budget });
    await expect(f.store.setState(c.id, "running", true)).rejects.toThrow("ACCOUNTS_INCOMPLETE");
  });
  it("staggering and concurrent claims avoid duplicate account turns", async () => {
    const f = await fixture();
    cleanup = () => f.pool.end();
    await ready(f.store, 50);
    const s = await f.store.publicState();
    expect(new Set(s.agents.map((a) => new Date(a.next_due_at).getTime())).size).toBe(50);
    const claims = await Promise.all([f.store.claim("one", 2), f.store.claim("two", 2)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    f.advance(18000);
    const next = await f.store.claim("two", 2);
    expect(next?.agentId).not.toBe(claims.find(Boolean)?.agentId);
  });
  it("atomic budget reservation prevents concurrent overspend", async () => {
    const f = await fixture();
    cleanup = () => f.pool.end();
    const id = await ready(f.store, 50);
    await f.pool.query("UPDATE cohorts SET budget=$2 WHERE id=$1", [
      id,
      { ...budget, callLimit: 1, tokenLimit: 40000 },
    ]);
    const a = await f.store.claim("one", 2);
    f.advance(18000);
    const b = await f.store.claim("two", 2);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    if (!a || !b) throw Error("missing concurrent claim");
    const results = await Promise.allSettled([f.store.reserveCall(a), f.store.reserveCall(b)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(1);
  });
  it("pause fences an in-flight turn; stop is terminal", async () => {
    const f = await fixture();
    cleanup = () => f.pool.end();
    const id = await ready(f.store, 1),
      claim = await f.store.claim("worker");
    if (!claim) throw Error("missing");
    await f.store.setState(id, "paused", true);
    await expect(f.store.active(claim)).rejects.toThrow("CLAIM_FENCED");
    await f.store.setState(id, "stopped", true);
    await expect(f.store.setState(id, "running", true)).rejects.toThrow("TERMINAL_COHORT");
  });
  it("a crashed dispatched request preserves its reservation and pauses recovery", async () => {
    const f = await fixture();
    cleanup = () => f.pool.end();
    await ready(f.store, 1);
    const t = await f.store.claim("worker");
    if (!t) throw Error("missing");
    await f.store.reserveCall(t);
    f.advance(121000);
    expect(await f.store.claim("replacement")).toBe(null);
    const s = await f.store.publicState();
    expect(s.agents[0].reason).toBe("WORKER_EXPIRED");
    expect(s.usage[0].unknown_calls).toBe(1);
    expect(s.usage[0].allocated_tokens).toBe("40000");
  });
  it("daily renewal follows explicit UTC periods; lifetime use is never reset", async () => {
    const f = await fixture();
    cleanup = () => f.pool.end();
    const id = await ready(f.store, 1);
    await f.pool.query("UPDATE cohorts SET budget=$2 WHERE id=$1", [
      id,
      { ...budget, mode: "daily", callLimit: 1, tokenLimit: 40000 },
    ]);
    const t = await f.store.claim("one");
    if (!t) throw Error("missing");
    const reservation = await f.store.reserveCall(t);
    await f.store.recordUsage(reservation, 100, 10);
    await expect(f.store.reserveCall(t)).rejects.toThrow("BUDGET_EXHAUSTED");
    await f.store.finish(t, "WAIT");
    f.advance(13 * 3600000);
    const second = await f.store.claim("two");
    if (!second) throw Error("missing next day");
    await f.store.reserveCall(second);
    expect((await f.store.publicState()).usage[0].calls).toBe(2);
  });
  it("late reported usage remains distinct from conservative allocation", async () => {
    const f = await fixture();
    cleanup = () => f.pool.end();
    await ready(f.store, 1);
    const t = await f.store.claim("one");
    if (!t) throw Error("missing");
    const r = await f.store.reserveCall(t);
    await f.store.recordUsage(r, 123, 45);
    await f.store.recordUsage(r, 9999, 9999);
    const u = (await f.store.publicState()).usage[0];
    expect(u.allocated_tokens).toBe("40000");
    expect(u.input_tokens).toBe("123");
    expect(u.output_tokens).toBe("45");
  });
  it("consumed model/budget settings cannot be reset through configuration", async () => {
    const f = await fixture();
    cleanup = () => f.pool.end();
    const id = await ready(f.store, 1),
      t = await f.store.claim("one");
    if (!t) throw Error("missing");
    await f.store.reserveCall(t);
    await f.store.setState(id, "paused", true);
    await expect(f.store.configure(id, { model: { route: "ollama", model: "replacement" }, budget })).rejects.toThrow(
      "CONSUMED_CONFIG_IMMUTABLE",
    );
  });
});
