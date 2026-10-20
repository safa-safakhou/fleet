import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction } from "../db.js";
import { FleetError, safeCode } from "../domain.js";
import type { Bindings } from "./bindings.js";
import type { BindingRef, EventPage, Observation } from "./contracts.js";
import type { EnvironmentRegistry } from "./environment-registry.js";
import type { TaskStore } from "./tasks.js";
export const WakePolicySchema = z
  .object({
    enabled: z.boolean(),
    categories: z.array(z.string().min(1).max(64)).max(32),
    periodicReviewMinutes: z.number().int().min(1).max(1440),
    quietCategories: z.array(z.string().min(1).max(64)).max(32),
  })
  .strict();
export type WakePolicy = z.infer<typeof WakePolicySchema>;
export class EventIntake {
  constructor(
    private readonly tasks: TaskStore,
    private readonly bindings: Bindings,
    private readonly environments: EnvironmentRegistry,
  ) {}
  async enroll(cohortId: string, raw: WakePolicy) {
    const policy = WakePolicySchema.parse(raw);
    await transaction(this.tasks.store.pool, async (db) => {
      const c = (await db.query("SELECT * FROM cohorts WHERE id=$1 FOR UPDATE", [cohortId])).rows[0];
      if (!c) throw new FleetError("NOT_FOUND");
      if (
        (
          await db.query(
            "SELECT 1 FROM turns WHERE cohort_id=$1 UNION ALL SELECT 1 FROM platform_tasks WHERE cohort_id=$1 LIMIT 1",
            [cohortId],
          )
        ).rowCount
      )
        throw new FleetError("CONSUMED_PROFILE_IMMUTABLE");
      if (!["draft", "paused"].includes(c.state)) throw new FleetError("COHORT_NOT_EDITABLE");
      const profile = (await db.query("SELECT * FROM cohort_engine_profiles WHERE cohort_id=$1", [cohortId])).rows[0];
      if (
        !profile ||
        !this.tasks.store.architectures
          .resolve({ id: profile.profile_id, version: profile.profile_version })
          .manifest.triggers.includes("event")
      )
        throw new FleetError("UNSUPPORTED_ENGINE");
      await db.query(
        "INSERT INTO cohort_wake_policies(cohort_id,policy,created_at) VALUES($1,$2,$3) ON CONFLICT(cohort_id) DO UPDATE SET policy=excluded.policy",
        [cohortId, policy, this.tasks.store.now()],
      );
    });
  }
  async cursor(binding: BindingRef) {
    await this.bindings.agentFor(binding);
    return (
      (await this.tasks.store.pool.query("SELECT cursor FROM environment_cursors WHERE binding_id=$1", [binding.id]))
        .rows[0]?.cursor ?? null
    );
  }
  async ingest(
    binding: BindingRef,
    page: EventPage,
    snapshot?: Observation,
  ): Promise<{ inserted: number; cursor: string | null }> {
    const agentId = await this.bindings.agentFor(binding);
    if (page.events.length > 50 || Buffer.byteLength(JSON.stringify(page)) > 65536)
      throw new FleetError("EVENT_PAGE_LIMIT");
    return transaction(this.tasks.store.pool, async (db) => {
      await db.query("SELECT id FROM environment_bindings WHERE id=$1 FOR UPDATE", [binding.id]);
      const agent = await this.tasks.store.agent(agentId, db),
        row = (await db.query("SELECT policy FROM cohort_wake_policies WHERE cohort_id=$1", [agent.cohort_id])).rows[0];
      if (!row) throw new FleetError("EVENT_ENROLLMENT_REQUIRED");
      const policy = WakePolicySchema.parse(row.policy);
      if (!policy.enabled) throw new FleetError("EVENT_WAKE_DISABLED");
      const old =
        (await db.query("SELECT cursor FROM environment_cursors WHERE binding_id=$1", [binding.id])).rows[0]?.cursor ??
        null;
      if (page.fromCursor !== undefined && page.fromCursor !== old) throw new FleetError("STALE_EVENT_PAGE");
      if (old !== null && page.fromCursor === undefined) throw new FleetError("EVENT_CURSOR_REQUIRED");
      let cursor = page.nextCursor ?? old,
        inserted = 0;
      if (page.resyncRequired) {
        if (
          page.events.length ||
          !page.resumeFrom ||
          !snapshot ||
          !snapshot.revision ||
          snapshot.revision === "unavailable"
        )
          throw new FleetError("EVENT_RESYNC_REQUIRED");
        cursor = page.resumeFrom;
        const gapId = randomUUID();
        await db.query(
          "INSERT INTO environment_event_gaps(id,binding_id,observed_at,snapshot_revision,snapshot_source_refs,delivery) VALUES($1,$2,$3,$4,$5,$6)",
          [
            gapId,
            binding.id,
            this.tasks.store.now(),
            snapshot.revision,
            JSON.stringify(snapshot.sourceRefs.slice(0, 20)),
            this.environments.resolve(binding.environment).capabilities.events,
          ],
        );
        await this.tasks.upsertWithin(
          db,
          binding,
          {
            id: `resync:${gapId}`,
            type: "snapshot_resync",
            sourceRef: `resync:${gapId}`,
            observedAt: snapshot.observedAt,
            environmentTime: snapshot.environmentTime,
            metadata: {},
          },
          "resync_review",
        );
      } else
        for (const event of page.events) {
          const category = event.metadata.category,
            group = event.metadata.groupRef;
          if (
            typeof category !== "string" ||
            category.length > 64 ||
            typeof group !== "string" ||
            !group ||
            group.length > 200 ||
            !event.id ||
            event.id.length > 2000 ||
            !event.sourceRef ||
            event.sourceRef.length > 8000 ||
            !Number.isFinite(Date.parse(event.observedAt))
          )
            throw new FleetError("INVALID_EVENT_METADATA");
          const admitted =
            policy.categories.includes(category) &&
            !(event.metadata.quiet === true && policy.quietCategories.includes(category));
          const receipt = await db.query(
            "INSERT INTO environment_event_receipts(binding_id,event_id,received_at,disposition) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING event_id",
            [binding.id, event.id, this.tasks.store.now(), admitted ? "task" : "quiet_or_unselected"],
          );
          if (!receipt.rowCount) continue;
          if (admitted) {
            await this.tasks.upsertWithin(
              db,
              binding,
              event,
              `event:${category}:${group.length <= 120 ? group : "sha256:" + createHash("sha256").update(group).digest("hex")}`,
            );
            inserted++;
          }
        }
      await db.query(
        "INSERT INTO environment_cursors(binding_id,cursor,updated_at,next_review_at,next_poll_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(binding_id) DO UPDATE SET cursor=excluded.cursor,updated_at=excluded.updated_at,next_poll_at=excluded.next_poll_at",
        [
          binding.id,
          cursor,
          this.tasks.store.now(),
          new Date(this.tasks.store.now().getTime() + policy.periodicReviewMinutes * 60000),
          new Date(this.tasks.store.now().getTime() + 10000),
        ],
      );
      return { inserted, cursor };
    });
  }
  async poll(binding: BindingRef) {
    await this.bindings.agentFor(binding);
    const lock = await this.tasks.store.pool.connect();
    let held = false;
    try {
      held = (await lock.query("SELECT pg_try_advisory_lock(hashtextextended($1,19281480)) AS held", [binding.id]))
        .rows[0].held;
      if (!held) return;
      const cursor = await this.cursor(binding),
        session = await this.environments.connect(binding, { eventDelivery: ["poll", "native"] });
      try {
        if (!session.events) throw new FleetError("UNSUPPORTED_CAPABILITY");
        const page = await session.events(cursor);
        const snapshot = page.resyncRequired ? await session.observe({}) : undefined;
        return await this.ingest(binding, { ...page, fromCursor: cursor }, snapshot);
      } finally {
        await session.close();
      }
    } finally {
      if (held) await lock.query("SELECT pg_advisory_unlock(hashtextextended($1,19281480))", [binding.id]);
      lock.release();
    }
  }
  async tick(failed: (bindingId: string, code: string) => void = () => {}) {
    const rows = (
      await this.tasks.store.pool.query(
        `SELECT b.id FROM environment_bindings b JOIN agents a ON a.id=b.agent_id JOIN cohorts c ON c.id=a.cohort_id JOIN cohort_wake_policies p ON p.cohort_id=c.id LEFT JOIN environment_cursors x ON x.binding_id=b.id WHERE b.state='active' AND c.state='running' AND a.credential_state='ready' AND p.policy->>'enabled'='true' AND (x.next_poll_at IS NULL OR x.next_poll_at<=$1) ORDER BY x.next_poll_at NULLS FIRST,b.id LIMIT 10`,
        [this.tasks.store.now()],
      )
    ).rows;
    for (const row of rows)
      try {
        const binding = await this.bindings.get(row.id);
        await this.review(binding);
        await this.poll(binding);
      } catch (error) {
        await this.tasks.store.pool.query("UPDATE environment_cursors SET next_poll_at=$2 WHERE binding_id=$1", [
          row.id,
          new Date(this.tasks.store.now().getTime() + 30000),
        ]);
        failed(row.id, safeCode(error));
      }
  }
  async review(binding: BindingRef) {
    const agentId = await this.bindings.agentFor(binding);
    await transaction(this.tasks.store.pool, async (db) => {
      await db.query("SELECT id FROM environment_bindings WHERE id=$1 FOR UPDATE", [binding.id]);
      const agent = await this.tasks.store.agent(agentId, db),
        row = (await db.query("SELECT policy FROM cohort_wake_policies WHERE cohort_id=$1", [agent.cohort_id])).rows[0];
      if (!row) return;
      const p = WakePolicySchema.parse(row.policy);
      if (!p.enabled) return;
      const now = this.tasks.store.now();
      await db.query(
        "INSERT INTO environment_cursors(binding_id,cursor,updated_at,next_review_at) VALUES($1,NULL,$2,$3) ON CONFLICT DO NOTHING",
        [binding.id, now, new Date(now.getTime() + p.periodicReviewMinutes * 60000)],
      );
      const state = (await db.query("SELECT next_review_at FROM environment_cursors WHERE binding_id=$1", [binding.id]))
        .rows[0];
      if (!state.next_review_at || state.next_review_at > now) return;
      const due = state.next_review_at.toISOString();
      await this.tasks.upsertWithin(
        db,
        binding,
        {
          id: `review:${due}`,
          type: "periodic_review",
          sourceRef: `review:${due}`,
          observedAt: now.toISOString(),
          environmentTime: { clockId: "utc", value: due },
          metadata: {},
        },
        "periodic_review",
      );
      await db.query("UPDATE environment_cursors SET next_review_at=$2 WHERE binding_id=$1", [
        binding.id,
        new Date(now.getTime() + p.periodicReviewMinutes * 60000),
      ]);
    });
  }
}
