import { afterEach, expect, it } from "vitest";
import type { ModelPort } from "../../src/domain.js";
import { ReactiveEngine } from "../../src/engines/reactive/engine.js";
import { platformFixture } from "../platform-helpers.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
});
async function setup(maxCalls = 3) {
  const f = await platformFixture();
  cleanup = () => f.pool.end();
  f.board.adapter.capabilities.events = "poll";
  const connect = f.board.adapter.connect;
  f.board.adapter.connect = async (b) => ({
    ...(await connect(b)),
    events: async (cursor) => ({ events: [], nextCursor: cursor, resyncRequired: false }),
  });
  await f.store.setState(f.group.id, "paused", true);
  await f.tasks.enroll(f.group.id, { id: "reactive-basic", version: "1" });
  await f.pool.query("UPDATE cohorts SET budget=jsonb_set(budget,'{maxCallsPerTurn}',$2::jsonb) WHERE id=$1", [
    f.group.id,
    String(maxCalls),
  ]);
  await f.store.setState(f.group.id, "running", true);
  await f.enqueue();
  return f;
}
const empty = { decision: null, decisionError: "MODEL_THINKING_WITHOUT_FINAL", inputTokens: 70, outputTokens: 44 };
const valid = {
  decision: { kind: "action", schemaId: "board.move.v1", payload: { to: "a4" }, summary: "Move" },
  inputTokens: 90,
  outputTokens: 30,
};
it.each(["empty", "schema"])(
  "recovers %s output with a separately metered attempt and commits exactly once",
  async (kind) => {
    const f = await setup(),
      c = await f.claim();
    const inputs: Parameters<ModelPort["decide"]>[0][] = [];
    const model: ModelPort = {
      decide: async (r) => {
        inputs.push(r);
        return inputs.length === 1
          ? kind === "empty"
            ? empty
            : { ...empty, decisionError: undefined, decision: { kind: "invented" } }
          : valid;
      },
    };
    const h = f.host(model);
    h.engines.register(new ReactiveEngine());
    await h.host.run(c);
    expect(inputs).toHaveLength(2);
    expect(inputs[1].model).toEqual(inputs[0].model);
    expect(inputs[1].schema).toEqual(inputs[0].schema);
    expect(inputs[1].messages[1]).toEqual(inputs[0].messages[1]);
    expect(JSON.stringify(inputs[1].messages)).toContain("previous response");
    expect(f.board.executions).toBe(1);
    const rows = (
      await f.pool.query(
        "SELECT status,tokens::text,input_tokens,output_tokens FROM compute_ledger ORDER BY created_at,id",
      )
    ).rows;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "reported" && r.tokens === "40000")).toBe(true);
    expect(rows.map((r) => Number(r.output_tokens)).sort()).toEqual([30, 44]);
  },
);
it("bounds persistent known failures and schedules the same task for later recovery", async () => {
  const f = await setup(),
    c = await f.claim();
  let calls = 0;
  const h = f.host({
    decide: async () => {
      calls++;
      return empty;
    },
  });
  h.engines.register(new ReactiveEngine());
  await expect(h.host.run(c)).rejects.toThrow("MODEL_THINKING_WITHOUT_FINAL");
  expect(calls).toBe(2);
  expect((await f.tasks.get(c.taskId)).state).toBe("waiting");
  expect((await f.pool.query("SELECT state,reason FROM agents WHERE id=$1", [c.turn.agentId])).rows[0].state).toBe(
    "ready",
  );
  f.advance(15 * 60000);
  const next = await f.claim();
  expect(next.taskId).toBe(c.taskId);
  expect(next.turn.id).not.toBe(c.turn.id);
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(2);
});
it("does not exceed a one-call turn allowance", async () => {
  const f = await setup(1),
    c = await f.claim();
  let calls = 0;
  const h = f.host({
    decide: async () => {
      calls++;
      return empty;
    },
  });
  h.engines.register(new ReactiveEngine());
  await expect(h.host.run(c)).rejects.toThrow("MODEL_THINKING_WITHOUT_FINAL");
  expect(calls).toBe(1);
});
it.each(["reported_unknown", "transport"])("never retries %s uncertainty", async (kind) => {
  const f = await setup(),
    c = await f.claim();
  let calls = 0;
  const model: ModelPort = {
    tracksDispatch: true,
    decide: async (r) => {
      calls++;
      await r.onDispatch?.();
      if (kind === "transport") throw Error("TRANSPORT_UNCERTAIN");
      return { ...empty, inputTokens: null, outputTokens: null };
    },
  };
  const h = f.host(model);
  h.engines.register(new ReactiveEngine());
  await expect(h.host.run(c)).rejects.toThrow();
  expect(calls).toBe(1);
  expect((await f.tasks.get(c.taskId)).state).toBe("blocked");
  expect((await f.pool.query("SELECT status FROM compute_ledger")).rows).toEqual([{ status: "unknown" }]);
});
it("checks cancellation again before corrective dispatch", async () => {
  const f = await setup(),
    c = await f.claim(),
    controller = new AbortController();
  let calls = 0;
  const h = f.host({
    decide: async () => {
      calls++;
      controller.abort();
      return empty;
    },
  });
  await expect(
    h.admission.decide(c, { ...f.request(controller.signal), schema: { type: "object" } }),
  ).rejects.toThrow();
  expect(calls).toBe(1);
  expect((await f.pool.query("SELECT status FROM compute_ledger")).rows).toEqual([{ status: "reported" }]);
});

it("retains reported overrun without attempting another execution", async () => {
  const f = await setup(),
    c = await f.claim();
  let calls = 0;
  const h = f.host({
    decide: async () => {
      calls++;
      return { ...empty, inputTokens: 40001, outputTokens: 1 };
    },
  });
  h.engines.register(new ReactiveEngine());
  await expect(h.host.run(c)).rejects.toThrow("USAGE_EXCEEDED");
  expect(calls).toBe(1);
  expect((await f.pool.query("SELECT status,tokens::text FROM compute_ledger")).rows).toEqual([
    { status: "reported", tokens: "40002" },
  ]);
  expect((await f.tasks.get(c.taskId)).state).toBe("blocked");
});
it("keeps full input facts and does not spend another call when correction exceeds the input allowance", async () => {
  const f = await setup(),
    c = await f.claim(),
    inputs: Parameters<ModelPort["decide"]>[0][] = [];
  const h = f.host({
    decide: async (input) => {
      inputs.push(input);
      return inputs.length === 1 ? empty : { ...valid, decision: {} };
    },
  });
  const request = f.request(),
    bytes = Buffer.byteLength(JSON.stringify(request.messages)) + Buffer.byteLength(JSON.stringify(request.schema));
  request.messages[0].content += "x".repeat(24000 - bytes);
  expect(await h.admission.decide(c, request)).toMatchObject(empty);
  expect(inputs).toHaveLength(1);
  expect(inputs[0].messages).toEqual(request.messages);
  expect((await f.pool.query("SELECT status,input_tokens,output_tokens FROM compute_ledger")).rows).toEqual([
    { status: "reported", input_tokens: "70", output_tokens: "44" },
  ]);
});
it("atomically preserves other-worker and coordinator call slots during competing retries", async () => {
  const f = await setup(4),
    c = await f.claim();
  const initial = await f.store.reserveCall(c.turn);
  await f.store.recordUsage(initial, 70, 44);
  const reserved = await Promise.allSettled([f.store.reserveCall(c.turn, 2), f.store.reserveCall(c.turn, 2)]);
  expect(reserved.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(reserved.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect((await f.pool.query("SELECT calls FROM turns WHERE id=$1", [c.turn.id])).rows[0].calls).toBe(2);
});
