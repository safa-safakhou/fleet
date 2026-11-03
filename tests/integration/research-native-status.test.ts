import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { nativeCommands } from "../../src/research/orchestration/native-status.js";
import { researchFixture } from "../research-helpers.js";

test("counts legacy receipts, deduplicates modern projections, and exposes pending/conflicting commands", async () => {
  const f = await researchFixture();
  try {
    const id = randomUUID();
    await f.store.pending(f.claim.turn, id, { kind: "synthetic" });
    await f.store.receipt(f.claim.turn, { commandId: id, code: "COMMITTED" });
    let rows = await nativeCommands(f.store, [f.group.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      commandId: id,
      state: "confirmed",
      code: "COMMITTED",
      origins: ["legacy"],
      projectionConflict: false,
    });
    expect(await nativeCommands(f.store, [])).toEqual([]);
    await f.pool.query(
      "INSERT INTO platform_commands(command_id,turn_id,task_id,binding_id,intent_cipher,state,outcome,created_at,updated_at) VALUES($1,$2,$3,$4,'synthetic','confirmed',$5,$6,$6)",
      [id, f.claim.turn.id, f.claim.taskId, f.claim.bindingId, { code: "COMMITTED" }, f.now()],
    );
    rows = await nativeCommands(f.store, [f.group.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ origins: ["platform", "legacy"], projectionConflict: false });
    await f.pool.query("UPDATE platform_commands SET state='unknown' WHERE command_id=$1", [id]);
    expect((await nativeCommands(f.store, [f.group.id]))[0]).toMatchObject({
      state: "unknown",
      projectionConflict: true,
    });
    const modern = randomUUID();
    await f.pool.query(
      "INSERT INTO platform_commands(command_id,turn_id,task_id,binding_id,intent_cipher,state,outcome,created_at,updated_at) VALUES($1,$2,$3,$4,'synthetic','confirmed',$5,$6,$6)",
      [modern, f.claim.turn.id, f.claim.taskId, f.claim.bindingId, { code: "COMMITTED" }, f.now()],
    );
    expect((await nativeCommands(f.store, [f.group.id])).find((x) => x.commandId === modern)).toMatchObject({
      state: "confirmed",
      code: "COMMITTED",
      origins: ["platform"],
      projectionConflict: false,
    });
    expect(await nativeCommands(f.store, [randomUUID()])).toEqual([]);
    const pending = randomUUID();
    await f.store.pending(f.claim.turn, pending, { kind: "synthetic" });
    rows = await nativeCommands(f.store, [f.group.id]);
    expect(rows.find((x) => x.commandId === pending)).toMatchObject({ state: "pending", origins: ["pending"] });
  } finally {
    await f.pool.end();
  }
});
