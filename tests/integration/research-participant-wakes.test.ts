import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { transaction } from "../../src/db.js";
import { ParticipantDelivery } from "../../src/platform/participant-delivery.js";
import { compileManifest } from "../../src/research/manifests/compiler.js";
import { ManifestRepository } from "../../src/research/manifests/repository.js";
import { TemporalTaskOwner } from "../../src/research/orchestration/outbox.js";
import { pendingCapacityWork } from "../../src/research/orchestration/pending-work.js";
import { capability, manifestInput } from "../fixtures/research/manifest.js";
import { platformFixture, profile } from "../platform-helpers.js";

test("native participant deliveries publish distinct durable Temporal wakes atomically without platform-source fabrication", async () => {
  const f = await platformFixture();
  try {
    const [binding, foreign] = f.group.bindings;
    await f.store.setState(f.group.id, "paused", false);
    const input = manifestInput();
    input.environment.bindingId = binding.id;
    input.profile = profile;
    const compiled = compileManifest(input, capability);
    await new ManifestRepository(f.pool).save(compiled.manifest);
    const owner = new TemporalTaskOwner(f.store, f.tasks, { send: async () => {} }, async () => {});
    await owner.enrollBinding(binding.id, compiled.digest);
    const delivery = new ParticipantDelivery(f.tasks),
      event = {
        id: "native-event",
        type: "scheduled",
        sourceRef: "native:fixture",
        observedAt: f.now().toISOString(),
        environmentTime: { clockId: "board.turn", value: "1" },
        metadata: {},
      };
    const recipients = [
      { participantId: "resources", subscriptionVersion: "1", taskKey: "review" },
      { participantId: "diplomacy", subscriptionVersion: "1", taskKey: "review" },
    ];
    const ids = await transaction(f.pool, (db) => delivery.ingestWithin(db, binding, event, recipients));
    expect(ids).toHaveLength(2);
    expect((await f.pool.query("SELECT count(*)::int n FROM research_task_outbox WHERE kind='wake'")).rows[0].n).toBe(
      2,
    );
    expect((await f.pool.query("SELECT count(*)::int n FROM platform_task_sources")).rows[0].n).toBe(0);
    await transaction(f.pool, (db) => delivery.ingestWithin(db, binding, event, recipients));
    expect((await f.pool.query("SELECT count(*)::int n FROM research_task_outbox")).rows[0].n).toBe(2);
    await transaction(f.pool, (db) =>
      delivery.ingestWithin(db, binding, event, [{ ...recipients[0], subscriptionVersion: "2" }]),
    );
    expect((await f.pool.query("SELECT count(*)::int n FROM research_task_outbox")).rows[0].n).toBe(3);
    await transaction(f.pool, (db) => delivery.ingestWithin(db, foreign, { ...event, id: "foreign" }, recipients));
    expect((await f.pool.query("SELECT count(*)::int n FROM research_task_outbox")).rows[0].n).toBe(3);
    await f.store.setState(f.group.id, "running", true);
    const selected = await pendingCapacityWork(f.store, { cohortIds: [f.group.id], notBefore: f.now().getTime() });
    expect(selected).toHaveLength(2);
    expect(selected.every((x) => x.bindingId === binding.id && x.participantId)).toBe(true);
    for (const x of selected)
      expect(
        (await f.pool.query("SELECT task_id FROM research_task_outbox WHERE id=$1", [x.deliveryId])).rows[0].task_id,
      ).toBe(x.taskId);
    expect(await pendingCapacityWork(f.store, { cohortIds: [], notBefore: 0 })).toEqual([]);
    const before = (await f.pool.query("SELECT id,dedupe_key FROM research_task_outbox ORDER BY id")).rows;
    await expect(
      transaction(f.pool, async (db) => {
        await delivery.ingestWithin(db, binding, { ...event, id: "rollback" }, recipients);
        throw Error("SYNTHETIC_ROLLBACK");
      }),
    ).rejects.toThrow("SYNTHETIC_ROLLBACK");
    expect((await f.pool.query("SELECT id,dedupe_key FROM research_task_outbox ORDER BY id")).rows).toEqual(before);
    await f.pool.query(await readFile("migrations/062_research_participant_wakes.sql", "utf8"));
    await f.pool.query(await readFile("migrations/062_research_participant_wakes.sql", "utf8"));
    expect((await f.pool.query("SELECT id,dedupe_key FROM research_task_outbox ORDER BY id")).rows).toEqual(before);
    const legacy = await f.enqueue(binding, "legacy-source", "legacy-event");
    expect(
      (await pendingCapacityWork(f.store, { cohortIds: [f.group.id], notBefore: 0 })).some(
        (x) => x.taskId === legacy.id && !x.participantId,
      ),
    ).toBe(true);
  } finally {
    await f.pool.end();
  }
});
