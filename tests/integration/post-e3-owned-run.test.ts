import { afterEach, expect, it } from "vitest";
import { executeOwnedRC1Protocol } from "../../scripts/lib/post-e3-owned-run.js";
import { FleetError } from "../../src/domain.js";
import { ownedRC1Fixture } from "../fixtures/post-e3.js";

let f: Awaited<ReturnType<typeof ownedRC1Fixture>> | undefined;
afterEach(async () => {
  await f?.close();
  f = undefined;
});
it("runs both independent model kingdoms and all four roles within one shared model allowance, then parks without inventing success", async () => {
  f = await ownedRC1Fixture();
  const result = await executeOwnedRC1Protocol(f.protocol, f.grant, {
    store: f.store,
    prepared: f.prepared,
    evidenceLevel: "fake-provider",
    verifyArtifacts: async () => {},
    reviewResponse: async () => {},
    reviewOutcome: async () => ({ claims: [], reviews: [] }),
    persist: async () => {},
    provider: {
      decide: async () => ({
        decision: { decision: { kind: "wait", summary: "No trade or completed delivery is claimed." } },
        inputTokens: 20,
        outputTokens: 10,
      }),
    },
  });
  expect(result.status).toBe("stopped");
  expect(result.productionQualified).toBe(false);
  expect(result.cells[0].reason).toBe("RC1_MODEL_CAP");
  expect(result.cells.slice(1).every((c) => c.status === "not_started")).toBe(true);
  const rows = (
    await f.pool.query(
      "SELECT a.kingdom_id,count(*)::int n FROM turns t JOIN agents a ON a.id=t.agent_id GROUP BY a.kingdom_id",
    )
  ).rows;
  expect(rows.map((r) => r.n).sort()).toEqual([36, 36]);
  expect(
    (
      await f.pool.query(
        "SELECT DISTINCT t.participant_id FROM platform_task_claims c JOIN platform_tasks t ON t.id=c.task_id",
      )
    ).rows
      .map((r) => r.participant_id)
      .sort(),
  ).toEqual(["defense", "development", "diplomacy", "resources"]);
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger WHERE status='reported'")).rows[0].n).toBe(72);
  expect((await f.pool.query("SELECT count(*)::int n FROM platform_commands")).rows[0].n).toBe(0);
  for (const p of f.prepared)
    for (const w of [p.world, p.control])
      expect((await w.pool.query("SELECT status FROM world_clocks")).rows[0].status).toBe("paused");
}, 180000);

it("closes its never-dispatched claim when start evidence fails and parks every owned world", async () => {
  f = await ownedRC1Fixture();
  const result = await executeOwnedRC1Protocol(f.protocol, f.grant, {
    store: f.store,
    prepared: f.prepared,
    evidenceLevel: "fake-provider",
    verifyArtifacts: async () => {},
    reviewResponse: async () => {},
    reviewOutcome: async () => ({ claims: [], reviews: [] }),
    persist: async (kind) => {
      if (kind === "turn-start") throw new FleetError("EVIDENCE_WRITE_FAILED", true);
    },
    provider: {
      decide: async () => {
        throw Error("MUST_NOT_DISPATCH");
      },
    },
  });
  expect(result.cells[0].reason).toBe("EVIDENCE_WRITE_FAILED");
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
  expect((await f.pool.query("SELECT count(*)::int n FROM turns WHERE state='running'")).rows[0].n).toBe(0);
  for (const p of f.prepared)
    for (const w of [p.world, p.control])
      expect((await w.pool.query("SELECT status FROM world_clocks")).rows[0].status).toBe("paused");
}, 180000);

it("refuses model drift before any call", async () => {
  f = await ownedRC1Fixture();
  const current = f;
  let changed = false;
  const result = await executeOwnedRC1Protocol(f.protocol, f.grant, {
    store: f.store,
    prepared: f.prepared,
    evidenceLevel: "fake-provider",
    verifyArtifacts: async () => {
      if (!changed) {
        changed = true;
        await current.pool.query("UPDATE cohorts SET model=jsonb_set(model,'{model}','\"UNAPPROVED\"') WHERE id=$1", [
          current.prepared[0].binding.cohortId,
        ]);
      }
    },
    reviewResponse: async () => {},
    reviewOutcome: async () => ({ claims: [], reviews: [] }),
    persist: async () => {},
    provider: {
      decide: async () => {
        throw Error("MUST_NOT_DISPATCH");
      },
    },
  });
  expect(result.cells[0].reason).toBe("RC1_CONFIGURATION_DRIFT");
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
}, 180000);

it("stops on a lost write lease after settling the reply and never reacquires it", async () => {
  f = await ownedRC1Fixture();
  const current = f,
    world = f.prepared[0].world;
  const result = await executeOwnedRC1Protocol(f.protocol, f.grant, {
    store: f.store,
    prepared: f.prepared,
    evidenceLevel: "fake-provider",
    verifyArtifacts: async () => {},
    reviewOutcome: async () => ({ claims: [], reviews: [] }),
    persist: async () => {},
    reviewResponse: async () => {
      expect((await current.pool.query("SELECT status FROM compute_ledger")).rows).toEqual([{ status: "reported" }]);
      await world.pool.query(
        "UPDATE write_leases SET released_at=clock_timestamp() WHERE product_scope='pact' AND subject_id=$1",
        [world.players[0].accountId],
      );
    },
    provider: {
      decide: async () => ({
        decision: { decision: { kind: "wait", summary: "No completed outcome is claimed." } },
        inputTokens: 20,
        outputTokens: 10,
      }),
    },
  });
  expect(result.cells[0].reason).toBe("RC1_OPERATIONAL_STOP");
  expect((await current.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(1);
  expect((await world.pool.query("SELECT count(*)::int n FROM write_leases")).rows[0].n).toBe(2);
  expect((await current.pool.query("SELECT count(*)::int n FROM platform_commands")).rows[0].n).toBe(0);
}, 180000);

it("starts only ordinary native clocks and stops a withheld dispatched reply at its exact cutoff", async () => {
  f = await ownedRC1Fixture("R1-N");
  f.grant.cutoffAt = new Date(Date.now() + 2500).toISOString();
  const result = await executeOwnedRC1Protocol(f.protocol, f.grant, {
    store: f.store,
    prepared: f.prepared,
    evidenceLevel: "fake-provider",
    verifyArtifacts: async () => {},
    reviewResponse: async () => {},
    reviewOutcome: async () => ({ claims: [], reviews: [] }),
    persist: async () => {},
    provider: {
      decide: async (request) =>
        new Promise((_resolve, reject) => {
          if (request.signal.aborted) reject(new FleetError("TRANSPORT_UNCERTAIN"));
          else
            request.signal.addEventListener("abort", () => reject(new FleetError("TRANSPORT_UNCERTAIN")), {
              once: true,
            });
        }),
    },
  });
  expect(result.status).toBe("stopped");
  expect((await f.pool.query("SELECT status,tokens::int,input_tokens,output_tokens FROM compute_ledger")).rows).toEqual(
    [{ status: "unknown", tokens: 40000, input_tokens: null, output_tokens: null }],
  );
  for (const p of f.prepared)
    for (const w of [p.world, p.control])
      expect((await w.pool.query("SELECT status FROM world_clocks")).rows[0].status).toBe("paused");
}, 180000);
it("settles a critical reply before closing all sibling admission and preserves the consumed nonce", async () => {
  f = await ownedRC1Fixture();
  const current = f;
  const deps = {
    store: f.store,
    prepared: f.prepared,
    evidenceLevel: "fake-provider" as const,
    verifyArtifacts: async () => {},
    persist: async () => {},
    reviewOutcome: async () => ({ claims: [], reviews: [] }),
    provider: {
      decide: async () => ({
        decision: { decision: { kind: "wait", summary: "critical authored fake" } },
        inputTokens: 20,
        outputTokens: 10,
      }),
    },
    reviewResponse: async () => {
      expect((await current.pool.query("SELECT status FROM compute_ledger")).rows).toEqual([{ status: "reported" }]);
      throw new FleetError("CRITICAL_CLAIM", true);
    },
  };
  const result = await executeOwnedRC1Protocol(f.protocol, f.grant, deps);
  expect(result.cells[0].reason).toBe("CRITICAL_CLAIM");
  expect(result.status).toBe("stopped");
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(1);
  expect((await f.pool.query("SELECT count(*)::int n FROM turns WHERE state='running'")).rows[0].n).toBe(0);
  await expect(executeOwnedRC1Protocol(f.protocol, f.grant, deps)).rejects.toThrow("RC1_NONCE_CONSUMED");
}, 180000);
it("retains the full native unknown reservation and never retries the uncertain call", async () => {
  f = await ownedRC1Fixture();
  const result = await executeOwnedRC1Protocol(f.protocol, f.grant, {
    store: f.store,
    prepared: f.prepared,
    evidenceLevel: "fake-provider",
    verifyArtifacts: async () => {},
    reviewResponse: async () => {
      throw Error("MUST_NOT_REVIEW_UNKNOWN");
    },
    reviewOutcome: async () => ({ claims: [], reviews: [] }),
    persist: async () => {},
    provider: {
      decide: async () => {
        throw new FleetError("TRANSPORT_UNCERTAIN");
      },
    },
  });
  expect(result.status).toBe("stopped");
  expect((await f.pool.query("SELECT status,tokens::int,input_tokens,output_tokens FROM compute_ledger")).rows).toEqual(
    [{ status: "unknown", tokens: 40000, input_tokens: null, output_tokens: null }],
  );
  expect((await f.pool.query("SELECT count(*)::int n FROM platform_commands")).rows[0].n).toBe(0);
}, 180000);

it("meters native wake observations outside a claim and stops on bookkeeping errors", async () => {
  f = await ownedRC1Fixture();
  let calls = 0;
  const result = await executeOwnedRC1Protocol(f.protocol, f.grant, {
    store: f.store,
    prepared: f.prepared,
    evidenceLevel: "fake-provider",
    verifyArtifacts: async () => {},
    persist: async () => {},
    reviewOutcome: async () => ({ claims: [], reviews: [] }),
    reviewResponse: async () => {
      if (calls === 2) throw new FleetError("TEST_REVIEW_STOP", true);
    },
    provider: {
      decide: async () => {
        calls++;
        return {
          decision: {
            decision: { kind: "wait", summary: "No outcome is claimed." },
            ...(calls === 1
              ? {
                  update: {
                    goals: [],
                    memories: [],
                    predictions: [],
                    plan: null,
                    messages: [],
                    wakeConditions: [
                      { kind: "deadline", at: { clockId: "utc", value: new Date(Date.now() - 1000).toISOString() } },
                    ],
                  },
                }
              : {}),
          },
          inputTokens: 20,
          outputTokens: 10,
        };
      },
    },
  });
  expect(result.cells[0].reason).toBe("TEST_REVIEW_STOP");
  expect(
    (
      await f.pool.query(
        "SELECT coalesce(sum(units),0)::int n FROM specialist_turn_work WHERE specialist_id='host-bookkeeping' AND kind='reads'",
      )
    ).rows[0].n,
  ).toBeGreaterThan(0);
  expect(
    (await f.pool.query("SELECT last_code FROM specialist_work_cursors")).rows.every((r) => r.last_code === "OK"),
  ).toBe(true);
}, 180000);
