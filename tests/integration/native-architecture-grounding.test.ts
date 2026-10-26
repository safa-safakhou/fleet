import { expect, it } from "vitest";
import { nativeArchitectureHarness, scriptedNativeProvider } from "../../scripts/lib/native-architecture-harness.js";
import { object } from "../../src/domain.js";
import { fixture } from "../helpers.js";

it.each(["shape", "support"])(
  "corrects an optional native memory %s failure before effects",
  async (mode) => {
    const f = await fixture(),
      rejected = new Set<string>();
    const h = await nativeArchitectureHarness(
      f.pool,
      {
        tracksDispatch: true,
        decide: async (request) => {
          const result = await scriptedNativeProvider.decide(request);
          const grounding = request.messages
            .map((m) => {
              try {
                return object(JSON.parse(m.content)).nativeGrounding;
              } catch {
                return undefined;
              }
            })
            .filter(Boolean)
            .at(-1);
          const binding = String(object(object(grounding).selection).bindingId);
          if (object(request.schema.properties).memory && !rejected.has(binding)) {
            rejected.add(binding);
            return {
              ...result,
              decision: {
                ...object(result.decision),
                memory: {
                  memories: [
                    {
                      id: "fixture-memory",
                      text: "Synthetic unsupported interpretation",
                      evidenceRefs: [mode === "shape" ? "x".repeat(196) : "00000000-0000-4000-8000-000000000001"],
                    },
                  ],
                },
              },
            };
          }
          return result;
        },
      },
      { route: "ollama", model: "fake-model" },
    );
    try {
      await h.round(1);
      await h.drain();
      expect(rejected.size).toBe(3);
      expect(
        (await f.pool.query("SELECT count(*)::int n FROM sim_requests WHERE answered_at IS NOT NULL")).rows[0].n,
      ).toBe(24);
      expect(
        (await f.pool.query("SELECT count(*)::int n FROM sim_receipts WHERE outcome->>'status'<>'confirmed'")).rows[0]
          .n,
      ).toBe(0);
      expect((await f.pool.query("SELECT max(calls)::int n FROM turns")).rows[0].n).toBeLessThanOrEqual(3);
    } finally {
      await h.close();
      await f.pool.query("DROP TABLE IF EXISTS sim_requests,sim_messages,sim_receipts,sim_kingdoms");
      await f.pool.end();
    }
  },
  60000,
);

it("narrows rejected numerical choices consistently across every native architecture", async () => {
  const f = await fixture(),
    rejected = new Set<string>(),
    refined = new Set<string>();
  const h = await nativeArchitectureHarness(
    f.pool,
    {
      tracksDispatch: true,
      decide: async (request) => {
        const result = await scriptedNativeProvider.decide(request);
        const grounding = request.messages
          .map((m) => {
            try {
              return object(JSON.parse(m.content)).nativeGrounding;
            } catch {
              return undefined;
            }
          })
          .filter(Boolean)
          .at(-1);
        const binding = String(object(object(grounding).selection).bindingId);
        const d = object(result.decision),
          inner = object(d.decision ?? d);
        const payload = object(inner.action ?? inner.payload ?? object(object(d.proposal).intent).payload);
        if (payload.choice !== undefined && !rejected.has(binding)) {
          rejected.add(binding);
          payload.choice = "stone";
          return result;
        }
        const scan = (value: unknown): boolean => {
          if (!value || typeof value !== "object") return false;
          const choice = object(object(object(value).properties).choice);
          if (JSON.stringify(choice.enum) === '["oak"]') return true;
          return Object.values(value).some(scan);
        };
        if (rejected.has(binding) && scan(request.schema)) refined.add(binding);
        return result;
      },
    },
    { route: "ollama", model: "fake-model" },
  );
  try {
    await h.round(3);
    await h.drain();
    expect(rejected.size).toBe(24);
    expect(refined.size).toBe(24);
    expect(
      (await f.pool.query("SELECT count(*)::int n FROM sim_requests WHERE answered_at IS NOT NULL")).rows[0].n,
    ).toBe(24);
    expect(
      (await f.pool.query("SELECT count(*)::int n FROM sim_receipts WHERE outcome->>'status'<>'confirmed'")).rows[0].n,
    ).toBe(0);
  } finally {
    await h.close();
    await f.pool.query("DROP TABLE IF EXISTS sim_requests,sim_messages,sim_receipts,sim_kingdoms");
    await f.pool.end();
  }
}, 60000);

it("retains an unanswered request when a later round is offered", async () => {
  let release!: () => void,
    entered = false;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const f = await fixture(),
    h = await nativeArchitectureHarness(
      f.pool,
      {
        tracksDispatch: true,
        decide: async (request) => {
          entered = true;
          await gate;
          return scriptedNativeProvider.decide(request);
        },
      },
      { route: "ollama", model: "fake-model" },
    );
  try {
    await h.round(1);
    await h.dispatch();
    await expect.poll(() => entered).toBe(true);
    await h.round(2);
    const view = await h.sim.current(h.roster[0].binding);
    expect((view.payload.selection as { requestId: string }).requestId).toBe(`sim-request:${h.roster[0].binding.id}:1`);
    release();
    await h.drain();
    expect(
      (await f.pool.query("SELECT count(*)::int n FROM sim_receipts WHERE outcome->>'status'='confirmed'")).rows[0].n,
    ).toBe(48);
  } finally {
    release();
    await h.close();
    await f.pool.query("DROP TABLE IF EXISTS sim_requests,sim_messages,sim_receipts,sim_kingdoms");
    await f.pool.end();
  }
}, 60000);

it("runs all eight native definitions and both specialist presets through isolated task, ledger, HTTP and receipt paths", async () => {
  const f = await fixture();
  const h = await nativeArchitectureHarness(f.pool, scriptedNativeProvider, { route: "ollama", model: "fake-model" });
  try {
    await h.round(1);
    await h.drain();
    expect(new Set(h.runs.map((r) => r.architecture)).size).toBe(8);
    expect(h.runs.every((r) => r.code === "RETURNED")).toBe(true);
    const counts = (await f.pool.query("SELECT count(*)::int n FROM sim_receipts WHERE outcome->>'status'='confirmed'"))
      .rows[0].n;
    expect(counts).toBeGreaterThanOrEqual(24);
    expect(
      (await f.pool.query("SELECT count(*)::int n FROM compute_ledger WHERE status <> 'reported'")).rows[0].n,
    ).toBe(0);
    expect(h.peakCalls).toBeLessThanOrEqual(4);
    expect(h.runs.length).toBeLessThan(60); // Receipt-triggered work must drain, not feed itself.
    const before = h.runs.length;
    await h.round(2);
    await h.drain();
    const stale = h.runs.slice(before);
    expect(stale.every((r) => r.code === "RETURNED")).toBe(true);
    expect(h.checks.some((c) => c.code === "STALE_OBSERVATION")).toBe(true);
    expect(
      (await f.pool.query("SELECT count(*)::int n FROM sim_receipts WHERE outcome->>'status'='rejected'")).rows[0].n,
    ).toBe(0);
    expect(
      (await f.pool.query("SELECT count(*)::int n FROM compute_ledger WHERE status <> 'reported'")).rows[0].n,
    ).toBe(0);
    await h.round(8);
    await h.drain();
    expect(
      (
        await f.pool.query(
          "SELECT count(*)::int n FROM sim_receipts WHERE intent->'payload'->>'requestId' LIKE '%:8' AND intent->'payload'->>'choice'<>'none'",
        )
      ).rows[0].n,
    ).toBe(0);
  } finally {
    await h.close();
    await f.pool.query("DROP TABLE IF EXISTS sim_requests,sim_messages,sim_receipts,sim_kingdoms");
    await f.pool.end();
  }
}, 60000);

it("sustains thirty native rounds with stale corrections, both presets and bounded history", async () => {
  const f = await fixture(),
    h = await nativeArchitectureHarness(f.pool, scriptedNativeProvider, { route: "ollama", model: "fake-model" });
  try {
    for (let round = 1; round <= 30; round++) {
      await h.round(round);
      await h.drain();
    }
    expect(h.runs.filter((r) => r.code !== "RETURNED")).toEqual([]);
    expect(
      (
        await f.pool.query(
          "SELECT count(DISTINCT intent->'payload'->>'requestId')::int n FROM sim_receipts WHERE outcome->>'status'='confirmed'",
        )
      ).rows[0].n,
    ).toBe(720);
    expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger WHERE status<>'reported'")).rows[0].n).toBe(
      0,
    );
    expect((await f.pool.query("SELECT max(calls)::int n FROM turns")).rows[0].n).toBeLessThanOrEqual(3);
    expect(h.peakCalls).toBeLessThanOrEqual(4);
  } finally {
    await h.close();
    await f.pool.query("DROP TABLE IF EXISTS sim_requests,sim_messages,sim_receipts,sim_kingdoms");
    await f.pool.end();
  }
}, 180000);
