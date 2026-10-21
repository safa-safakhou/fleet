import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { PrimitiveRegistry } from "../../src/modules/skills/v1/primitives.js";
import { skillContentDigest } from "../../src/modules/skills/v1/schema.js";
import { executionFixture } from "../fixtures/skills/execution.js";

let f: Awaited<ReturnType<typeof executionFixture>>;
afterEach(async () => {
  await f?.close();
});
it.each(["after_checkpoint", "after_reservation", "before_io", "after_io", "before_finish", "after_finish"])(
  "recovers %s on the exact command and does not repeat its effect",
  async (point) => {
    f = await executionFixture();
    let once = true;
    f.ports.fault = async (p, _inv, cp) => {
      if (once && p === point && cp?.nodeId === "move") {
        once = false;
        throw Error("OWNED_CRASH");
      }
    };
    await expect(f.runner().start(f.scope, f.input())).rejects.toThrow("OWNED_CRASH");
    const inv = (await f.pool.query("SELECT * FROM skill_invocations")).rows[0],
      checkpoint = (await f.pool.query("SELECT * FROM skill_checkpoints WHERE node_id='move'")).rows[0],
      original = checkpoint.command_id;
    f.ports.fault = undefined;
    const resumed = await f.runner().resume(inv.id, "owned-recovery");
    expect(resumed.state).toBe("completed");
    expect(f.board.executions).toBe(1);
    expect((await f.pool.query("SELECT command_id FROM platform_commands")).rows).toEqual([{ command_id: original }]);
    expect((await f.runner().resume(inv.id, "owned-recovery")).id).toBe(inv.id);
    expect(f.board.executions).toBe(1);
    expect(
      (
        await f.pool.query(
          "SELECT units::int,actual_units::int FROM skill_work_reservations WHERE node_id='move' AND kind='actions'",
        )
      ).rows,
    ).toEqual([{ units: 1, actual_units: 1 }]);
    expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(0);
  },
);
it("reconciles a committed original even if the skill is suspended, without starting another action", async () => {
  f = await executionFixture();
  f.ports.fault = async (point, _inv, cp) => {
    if (point === "after_io" && cp?.nodeId === "move") throw Error("OWNED_CRASH");
  };
  await expect(f.runner().start(f.scope, f.input())).rejects.toThrow("OWNED_CRASH");
  const id = (await f.pool.query("SELECT id FROM skill_invocations")).rows[0].id;
  await f.pool.query("UPDATE skill_versions SET status='suspended'");
  f.ports.fault = undefined;
  const result = await f.runner().resume(id, "suspended-receipt");
  expect(result).toMatchObject({ state: "reason", reason: "SKILL_NOT_QUALIFIED" });
  expect(f.board.executions).toBe(1);
  expect(result.values.__lastReceipt).toMatchObject({ status: "confirmed" });
});
it("does not blindly repeat an interrupted read or alter unrelated unknown model usage", async () => {
  f = await executionFixture();
  const foreign = f.group.bindings[1];
  await f.enqueue(foreign, "foreign", "foreign-source");
  const claim = await f.tasks.claim("foreign", f.now());
  if (!claim) throw Error("FOREIGN_CLAIM_REQUIRED");
  const allocation = randomUUID();
  await f.pool.query(
    "INSERT INTO compute_ledger(id,cohort_id,turn_id,period,tokens,created_at,status) VALUES($1,$2,$3,'fixture',40000,$4,'unknown')",
    [allocation, f.group.id, claim.turn.id, f.now()],
  );
  const before = (await f.pool.query("SELECT * FROM compute_ledger WHERE id=$1", [allocation])).rows[0];
  f.ports.fault = async (point, _inv, cp) => {
    if (point === "after_io" && cp?.nodeId === "read") throw Error("OWNED_CRASH");
  };
  await expect(f.runner().start(f.scope, f.input())).rejects.toThrow("OWNED_CRASH");
  const id = (await f.pool.query("SELECT id FROM skill_invocations")).rows[0].id;
  f.ports.fault = undefined;
  expect(await f.runner().resume(id, "read-recovery")).toMatchObject({
    state: "reason",
    reason: "INTERRUPTED_NON_ACTION_STEP",
  });
  expect(f.board.executions).toBe(0);
  expect((await f.pool.query("SELECT * FROM compute_ledger WHERE id=$1", [allocation])).rows[0]).toEqual(before);
});
it("waits across restart without holding work capacity and charges each new assessment once", async () => {
  f = await executionFixture({ reads: 6, actions: 1, messages: 0, steps: 12, wallTimeMs: 60000 });
  const original = await f.library.loadSelected(f.scope, [f.ref]),
    body = structuredClone(original[0].body);
  body.limits.reads = 5;
  body.compatibility.primitives.push({ id: "delivery", version: "1" });
  body.procedure.nodes.push({
    id: "delivery",
    kind: "await",
    primitive: { id: "delivery", version: "1" },
    args: {},
    saveAs: "later",
  });
  const skill = { ...original[0], body, ref: { ...f.ref, digest: skillContentDigest(body) } };
  let ready = false,
    assessments = 0;
  const observe = f.ports.observe;
  f.ports.registry = new PrimitiveRegistry([
    ...body.compatibility.primitives.filter((r) => r.id !== "delivery").map((r) => f.registry.get(r)!),
    {
      ref: { id: "delivery", version: "1" },
      kind: "await",
      argsSchema: { type: "object", additionalProperties: false },
      work: { reads: 1, actions: 0, messages: 0, steps: 1 },
      actionKeys: [],
      run: async (_a, c) => {
        const facts = await c.observe({});
        assessments++;
        return facts.delivered ? { value: { satisfied: true } } : { wait: true };
      },
    },
  ]);
  f.ports.load = async () => skill;
  f.ports.eligible = async () => true;
  f.ports.observe = async (q) => ({ ...(await observe(q)), delivered: ready });
  const first = await f.runner().start(f.scope, { ...f.input(), skillRef: skill.ref });
  expect(first.state).toBe("waiting");
  expect(assessments).toBe(1);
  expect(f.board.executions).toBe(1);
  ready = true;
  const second = await f.runner().resume(first.id, "owned-later-event");
  expect(second.state).toBe("completed");
  expect(assessments).toBe(2);
  expect(f.board.executions).toBe(1);
  await f.runner().resume(first.id, "owned-later-event");
  expect(assessments).toBe(2);
});
it("retains uncertain protection and settles only the original receipt after transport loss", async () => {
  f = await executionFixture();
  const connect = f.board.adapter.connect;
  f.board.adapter.connect = async (b) => {
    const s = await connect(b);
    return {
      ...s,
      execute: async (i) => {
        await s.execute(i);
        throw Error("RESPONSE_LOST");
      },
    };
  };
  await f
    .runner()
    .start(f.scope, f.input())
    .catch(() => {});
  const invocation = (await f.pool.query("SELECT * FROM skill_invocations")).rows[0],
    command = (await f.pool.query("SELECT * FROM platform_commands")).rows[0];
  expect(f.board.executions).toBe(1);
  expect(command.state).toBe("unknown");
  expect((await f.pool.query("SELECT status FROM specialist_claims")).rows).toEqual([{ status: "held" }]);
  expect((await f.ports.recover(command.command_id)).status).toBe("confirmed");
  await f.refreshClaim();
  const result = await f.runner().resume(invocation.id, "owned-receipt-event");
  expect(result.state).toBe("completed");
  expect(f.board.executions).toBe(1);
  expect((await f.pool.query("SELECT command_id FROM platform_commands")).rows).toEqual([
    { command_id: command.command_id },
  ]);
});
it("expires only a proven never-dispatched original preparation and never replaces it", async () => {
  f = await executionFixture();
  f.native.commands.dispatchPrepared = async () => {
    throw Error("OWNED_CRASH_BEFORE_DISPATCH");
  };
  await expect(f.runner().start(f.scope, f.input())).rejects.toThrow("OWNED_CRASH_BEFORE_DISPATCH");
  const inv = (await f.pool.query("SELECT * FROM skill_invocations")).rows[0],
    command = (await f.pool.query("SELECT * FROM platform_commands")).rows[0];
  expect(command.state).toBe("prepared");
  expect((await f.runner().resume(inv.id, "owned-before-expiry")).state).toBe("unknown");
  expect(f.board.executions).toBe(0);
  f.advance(60001);
  expect((await f.ports.recover(command.command_id)).status).toBe("rejected");
  await f.refreshClaim();
  expect(await f.runner().resume(inv.id, "owned-after-expiry")).toMatchObject({
    state: "reason",
    reason: "ORIGINAL_COMMAND_REJECTED",
  });
  expect(f.board.executions).toBe(0);
  expect((await f.pool.query("SELECT command_id FROM platform_commands")).rows).toEqual([
    { command_id: command.command_id },
  ]);
});
it("resolves the original before stopping on deleted private skill support", async () => {
  f = await executionFixture();
  f.ports.fault = async (point, _inv, cp) => {
    if (point === "after_io" && cp?.nodeId === "move") throw Error("OWNED_CRASH");
  };
  await expect(f.runner().start(f.scope, f.input())).rejects.toThrow("OWNED_CRASH");
  const inv = (await f.pool.query("SELECT id FROM skill_invocations")).rows[0];
  await f.pool.query("DELETE FROM architecture_scoped_evidence WHERE id=$1", [f.body.evidence.sourceIds[0]]);
  f.ports.fault = undefined;
  expect(await f.runner().resume(inv.id, "owned-redacted-receipt")).toMatchObject({
    state: "reason",
    reason: "SKILL_PRIVATE_SOURCE_UNAVAILABLE",
  });
  expect(f.board.executions).toBe(1);
  expect((await f.pool.query("SELECT state FROM platform_commands")).rows).toEqual([{ state: "confirmed" }]);
});
it("does not turn another retry's completed checkpoint into a stale-state failure", async () => {
  f = await executionFixture();
  let entered: () => void = () => {},
    release: () => void = () => {},
    once = true;
  const parked = new Promise<void>((r) => {
      entered = r;
    }),
    resume = new Promise<void>((r) => {
      release = r;
    }),
    checkpoint = f.db.checkpoint.bind(f.db);
  f.db.checkpoint = async (inv, node, command) => {
    if (once && node === "move") {
      once = false;
      entered();
      await resume;
    }
    return checkpoint(inv, node, command);
  };
  const first = f.runner().start(f.scope, f.input());
  await parked;
  const second = await f.runner().start(f.scope, { ...f.input(), triggerId: "concurrent-owned-retry" });
  release();
  const result = await first;
  expect(second.state).toBe("completed");
  expect(result.state).toBe("completed");
  expect(f.board.executions).toBe(1);
  expect((await f.pool.query("SELECT state FROM skill_invocations")).rows).toEqual([{ state: "completed" }]);
});
