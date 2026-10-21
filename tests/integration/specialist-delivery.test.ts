import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { transaction } from "../../src/db.js";
import { route } from "../../src/engines/autonomous-specialists/routing.js";
import { EventIntake } from "../../src/platform/event-intake.js";
import { ParticipantDelivery } from "../../src/platform/participant-delivery.js";
import { launchFixture } from "../fixtures/architecture-launch.js";

let f: Awaited<ReturnType<typeof launchFixture>>;
afterEach(async () => {
  await f?.close();
});
async function setup() {
  f = await launchFixture(false);
  const original = f.architectures.resolve({ id: "fixture", version: "2" });
  f.architectures.register({
    ...original,
    manifest: { ...original.manifest, ref: { id: "routing-fixture", version: "1" } },
    route: (event) =>
      route(event, [
        { participantId: "resources", subscriptionVersion: "1", categories: ["contract"], periodic: true },
        { participantId: "diplomacy", subscriptionVersion: "1", categories: ["contract", "offer"], periodic: false },
      ]),
  });
  await f.tasks.enroll(f.id, { id: "routing-fixture", version: "1" });
  const binding = await f.tasks.bindings.forAgent(f.agent);
  if (!binding) throw Error("BINDING_REQUIRED");
  const intake = new EventIntake(f.tasks, f.tasks.bindings, f.environments);
  await intake.enroll(f.id, {
    enabled: true,
    categories: ["contract", "offer"],
    quietCategories: [],
    periodicReviewMinutes: 15,
  });
  const event = {
    id: randomUUID(),
    type: "contract_changed",
    sourceRef: "receipt:1",
    observedAt: f.now().toISOString(),
    environmentTime: { clockId: "board.ply", value: "1" },
    metadata: { category: "contract", groupRef: "opaque:".repeat(27) },
  };
  return { binding, intake, event };
}
it("fans out one event to two recipients and deduplicates each recipient on retry", async () => {
  const { binding, intake, event } = await setup();
  await intake.ingest(binding, { events: [event], nextCursor: "1", fromCursor: null, resyncRequired: false });
  const rows = (await f.pool.query("SELECT recipient,task_id FROM specialist_deliveries ORDER BY recipient")).rows;
  expect(rows.map((d) => d.recipient)).toEqual(["diplomacy", "resources"]);
  expect(new Set(rows.map((d) => d.task_id)).size).toBe(2);
  for (const row of rows) {
    const task = await f.tasks.get(row.task_id);
    expect(task.participantId).toBe(row.recipient);
    expect(task.sourceRefs).toEqual(["receipt:1"]);
    expect(task.key.length).toBeLessThanOrEqual(200);
  }
  await intake.ingest(binding, { events: [event], nextCursor: "2", fromCursor: "1", resyncRequired: false });
  expect((await f.pool.query("SELECT * FROM specialist_deliveries")).rowCount).toBe(2);
  expect((await f.pool.query("SELECT * FROM platform_task_sources")).rowCount).toBe(0);
});
it("rolls back all deliveries, tasks and cursor after failure and rejects stale publication", async () => {
  const { binding, intake, event } = await setup();
  await expect(
    intake.ingest(binding, {
      events: [event, { ...event, id: "", sourceRef: "invalid" }],
      nextCursor: "bad",
      fromCursor: null,
      resyncRequired: false,
    }),
  ).rejects.toThrow("INVALID_EVENT_METADATA");
  expect(await intake.cursor(binding)).toBeNull();
  expect((await f.pool.query("SELECT * FROM specialist_deliveries")).rowCount).toBe(0);
  await intake.ingest(binding, { events: [event], nextCursor: "1", fromCursor: null, resyncRequired: false });
  await expect(
    intake.ingest(binding, { events: [event], nextCursor: "2", fromCursor: null, resyncRequired: false }),
  ).rejects.toThrow("STALE_EVENT_PAGE");
});
it("resyncs recipients without inventing missing events and accepts out-of-order observations", async () => {
  const { binding, intake, event } = await setup();
  await intake.ingest(
    binding,
    { events: [], nextCursor: null, fromCursor: null, resumeFrom: "resume", resyncRequired: true },
    {
      schemaId: "board.position.v1",
      revision: "fresh",
      observedAt: f.now().toISOString(),
      environmentTime: event.environmentTime,
      sourceRefs: ["fresh:1"],
      payload: {},
      coverage: { complete: true },
    },
  );
  expect(
    (await f.pool.query("SELECT event_id FROM specialist_deliveries")).rows.every((x) =>
      x.event_id.startsWith("resync:"),
    ),
  ).toBe(true);
  await intake.ingest(binding, {
    events: [{ ...event, observedAt: "2026-10-10T00:00:00Z" }],
    nextCursor: "later",
    fromCursor: "resume",
    resyncRequired: false,
  });
  expect((await f.pool.query("SELECT * FROM specialist_deliveries")).rowCount).toBe(4);
});
it("rolls back the first recipient when a later recipient is invalid", async () => {
  const { binding, event } = await setup();
  const delivery = new ParticipantDelivery(f.tasks);
  await expect(
    transaction(f.pool, (db) =>
      delivery.ingestWithin(db, binding, event, [
        { participantId: "resources", taskKey: "same", subscriptionVersion: "1" },
        { participantId: "invalid/id", taskKey: "same", subscriptionVersion: "1" },
      ]),
    ),
  ).rejects.toThrow();
  expect((await f.pool.query("SELECT * FROM specialist_deliveries")).rowCount).toBe(0);
  expect((await f.pool.query("SELECT * FROM platform_tasks")).rowCount).toBe(0);
});
