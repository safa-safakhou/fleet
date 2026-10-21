import { afterEach, expect, it } from "vitest";
import { executeOwnedSpecialistProtocol } from "../../scripts/lib/specialist-owned-run.js";
import { FleetError } from "../../src/domain.js";
import { ownedSpecialistQualificationFixture } from "../fixtures/specialist-qualification.js";

let f: Awaited<ReturnType<typeof ownedSpecialistQualificationFixture>>;
afterEach(async () => {
  await f?.close();
});
async function prepare() {
  f = await ownedSpecialistQualificationFixture();
  return f;
}
it("bounds all eight native specialist cells and preserves known costs without inventing delivery or learning", async () => {
  const p = await prepare();
  let calls = 0;
  const initialCounterexamplePermissions: boolean[] = [];
  const result = await executeOwnedSpecialistProtocol(p.protocol, p.grant, {
    store: f.store,
    prepared: p.prepared,
    evidenceLevel: "fake-provider",
    verifyArtifacts: async () => {},
    reviewResponse: async () => {},
    persist: async () => {},
    provider: {
      decide: async (request) => {
        calls++;
        const packet = JSON.parse(request.messages[1].content),
          environment = packet.observation.payload.environment ?? packet.observation.payload.world;
        const cell = p.prepared.find((p) => p.world.actorId === environment.profile.kingdomId)?.cell;
        if (cell?.scenario === "changed-consent-reserve" && Number(environment.asOfGameTimeMs) === 0)
          initialCounterexamplePermissions.push(environment.authority.allowedActions.includes("supply.sign"));
        return {
          decision: { decision: { kind: "wait", summary: "No completed trade is claimed" } },
          inputTokens: 20,
          outputTokens: 10,
        };
      },
    },
  });
  expect(calls, JSON.stringify(result.cells)).toBe(96);
  expect(initialCounterexamplePermissions.length).toBe(12);
  expect(initialCounterexamplePermissions.every((allowed) => !allowed)).toBe(true);
  expect(result.status).toBe("complete");
  expect(result.cells).toHaveLength(8);
  expect(result.cells.every((c) => c.assessment?.productionQualified === false)).toBe(true);
  expect(result.cells.every((c) => c.assessment?.status === "fail")).toBe(true);
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger WHERE status<>'reported'")).rows[0].n).toBe(0);
  expect((await f.pool.query("SELECT count(*)::int n FROM platform_commands")).rows[0].n).toBe(0);
  expect((await f.pool.query("SELECT count(*)::int n FROM turns")).rows[0].n).toBe(96);
  for (const w of p.prepared)
    expect((await w.world.pool.query("SELECT status FROM world_clocks")).rows[0].status).toBe("paused");
  await expect(
    executeOwnedSpecialistProtocol(p.protocol, p.grant, {
      store: f.store,
      prepared: p.prepared,
      evidenceLevel: "fake-provider",
      verifyArtifacts: async () => {},
      reviewResponse: async () => {},
      persist: async () => {},
      provider: {
        decide: async () => {
          throw Error("MUST_NOT_DISPATCH");
        },
      },
    }),
  ).rejects.toThrow("KQ1_NONCE_CONSUMED");
}, 180000);

it("finishes its never-dispatched native claim and parks all worlds when start-evidence publication fails", async () => {
  const p = await prepare();
  let calls = 0;
  const result = await executeOwnedSpecialistProtocol(p.protocol, p.grant, {
    store: f.store,
    prepared: p.prepared,
    evidenceLevel: "fake-provider",
    verifyArtifacts: async () => {},
    reviewResponse: async () => {},
    persist: async (kind) => {
      if (kind === "turn-start") throw new FleetError("OWNED_EVIDENCE_WRITE_FAILED", true);
    },
    provider: {
      decide: async () => {
        calls++;
        throw Error("MUST_NOT_DISPATCH");
      },
    },
  });
  expect(result.status).toBe("stopped");
  expect(calls).toBe(0);
  expect((await f.pool.query("SELECT count(*)::int n FROM turns WHERE state='running'")).rows[0].n).toBe(0);
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
  for (const p0 of p.prepared)
    expect((await p0.world.pool.query("SELECT status FROM world_clocks")).rows[0].status).toBe("paused");
}, 180000);

it("retains a dispatched unknown allocation in full and stops without review, replay or sibling work", async () => {
  const p = await prepare();
  let calls = 0,
    reviews = 0;
  const result = await executeOwnedSpecialistProtocol(p.protocol, p.grant, {
    store: f.store,
    prepared: p.prepared,
    evidenceLevel: "fake-provider",
    verifyArtifacts: async () => {},
    persist: async () => {},
    reviewResponse: async () => {
      reviews++;
    },
    provider: {
      decide: async () => {
        calls++;
        throw new FleetError("TRANSPORT_UNCERTAIN");
      },
    },
  });
  expect(calls).toBe(1);
  expect(reviews).toBe(0);
  expect(result.status).toBe("stopped");
  expect(result.cells.slice(1).every((c) => c.status === "not_started")).toBe(true);
  expect((await f.pool.query("SELECT status,tokens::int,input_tokens,output_tokens FROM compute_ledger")).rows).toEqual(
    [{ status: "unknown", tokens: 40000, input_tokens: null, output_tokens: null }],
  );
  expect((await f.pool.query("SELECT count(*)::int n FROM platform_commands")).rows[0].n).toBe(0);
}, 180000);
it("settles the critical response before whole-batch stop and never admits another role or command", async () => {
  const p = await prepare();
  let calls = 0;
  const result = await executeOwnedSpecialistProtocol(p.protocol, p.grant, {
    store: f.store,
    prepared: p.prepared,
    evidenceLevel: "fake-provider",
    verifyArtifacts: async () => {},
    persist: async () => {},
    provider: {
      decide: async () => {
        calls++;
        return {
          decision: { decision: { kind: "wait", summary: "critical fixture response" } },
          inputTokens: 20,
          outputTokens: 10,
        };
      },
    },
    reviewResponse: async () => {
      expect((await f.pool.query("SELECT status FROM compute_ledger")).rows).toEqual([{ status: "reported" }]);
      throw new FleetError("CRITICAL_CLAIM", true);
    },
  });
  expect(calls).toBe(1);
  expect(result.status).toBe("stopped");
  expect(result.cells[0]).toMatchObject({ status: "failed", reason: "CRITICAL_CLAIM" });
  expect(result.cells.slice(1).every((c) => c.status === "not_started")).toBe(true);
  expect((await f.pool.query("SELECT count(*)::int n FROM turns")).rows[0].n).toBe(1);
  expect((await f.pool.query("SELECT count(*)::int n FROM platform_commands")).rows[0].n).toBe(0);
}, 180000);

it("refuses changed native model settings before admitting a turn or allocation", async () => {
  const p = await prepare();
  let calls = 0,
    changed = false;
  const result = await executeOwnedSpecialistProtocol(p.protocol, p.grant, {
    store: f.store,
    prepared: p.prepared,
    evidenceLevel: "fake-provider",
    persist: async () => {},
    verifyArtifacts: async () => {
      if (!changed) {
        changed = true;
        await f.pool.query("UPDATE cohorts SET model=jsonb_set(model,'{model}','\"UNAPPROVED\"') WHERE id=$1", [
          p.prepared[0].binding.cohortId,
        ]);
      }
    },
    reviewResponse: async () => {
      throw new FleetError("CRITICAL_CLAIM", true);
    },
    provider: {
      decide: async () => {
        calls++;
        return {
          decision: { decision: { kind: "wait", summary: "Must never dispatch" } },
          inputTokens: 20,
          outputTokens: 10,
        };
      },
    },
  });
  expect(calls).toBe(0);
  expect((await f.pool.query("SELECT count(*)::int n FROM turns")).rows[0].n).toBe(0);
  expect(result.cells[0]).toMatchObject({ status: "failed", reason: "KQ1_CONFIGURATION_DRIFT" });
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
}, 180000);
