import { expect, test } from "vitest";
import { compileManifest } from "../../src/research/manifests/compiler.js";
import { ManifestRepository } from "../../src/research/manifests/repository.js";
import { TemporalTaskOwner } from "../../src/research/orchestration/outbox.js";
import { capability, manifestInput } from "../fixtures/research/manifest.js";
import { platformFixture, profile } from "../platform-helpers.js";

async function setup() {
  const f = await platformFixture(4);
  f.advance(Date.now() - f.now().getTime());
  const group = await f.cohort(2, { deadlineAt: new Date(Date.now() + 7200000).toISOString() });
  await f.store.setState(group.id, "paused", false);
  const owner = new TemporalTaskOwner(f.store, f.tasks, { send: async () => {} }, async () => {});
  const save = async (bindingId: string, selectedProfile = profile, seed = "first") => {
    const input = manifestInput();
    input.environment.bindingId = bindingId;
    input.profile = selectedProfile;
    input.seed = seed;
    const manifest = compileManifest(input, capability);
    await new ManifestRepository(f.pool).save(manifest.manifest);
    return manifest.digest;
  };
  return { ...f, group, owner, save };
}

test("fresh binding enrollment owns every later event and periodic task without claiming another binding", async () => {
  const f = await setup();
  try {
    const [binding, foreign] = f.group.bindings,
      digest = await f.save(binding.id);
    await f.owner.enrollBinding(binding.id, digest);
    await f.owner.enrollBinding(binding.id, digest);
    const tasks = [];
    for (const key of [
      "initial-review",
      "event:contact:peer-a",
      "event:completion:order-b",
      "periodic_review",
      "resync_review",
    ]) {
      const task = await f.enqueue(binding, key, `source:${key}`);
      tasks.push(task);
      const row = (
        await f.pool.query(
          "SELECT t.scheduler_owner,t.research_manifest_digest,o.phase FROM platform_tasks t JOIN research_task_owners o ON o.task_id=t.id WHERE t.id=$1",
          [task.id],
        )
      ).rows[0];
      expect(row).toEqual({ scheduler_owner: "temporal", research_manifest_digest: digest, phase: "ready" });
      expect(await f.tasks.claim("ordinary", f.now(), task.id)).toBeNull();
      expect(
        (await f.pool.query("SELECT count(*)::int n FROM research_task_outbox WHERE task_id=$1", [task.id])).rows[0].n,
      ).toBe(1);
    }
    const duplicate = await f.enqueue(binding, "event:contact:peer-a", "source:event:contact:peer-a");
    expect(duplicate.id).toBe(tasks[1].id);
    expect(
      (await f.pool.query("SELECT count(*)::int n FROM platform_task_sources WHERE task_id=$1", [duplicate.id])).rows[0]
        .n,
    ).toBe(1);
    const unowned = await f.enqueue(foreign, "event:contact:peer-a", "foreign-source");
    expect(
      (await f.pool.query("SELECT scheduler_owner FROM platform_tasks WHERE id=$1", [unowned.id])).rows[0]
        .scheduler_owner,
    ).toBe("platform");
  } finally {
    await f.pool.end();
  }
});

test("binding enrollment refuses foreign identity, profile mismatch and consumed bindings", async () => {
  const f = await setup();
  try {
    const [binding, foreign] = f.group.bindings,
      digest = await f.save(binding.id);
    await expect(f.owner.enrollBinding(foreign.id, digest)).rejects.toMatchObject({ code: "OPERATION_SCOPE_MISMATCH" });
    const wrong = await f.save(binding.id, { id: "different-profile", version: "1" });
    await expect(f.owner.enrollBinding(binding.id, wrong)).rejects.toMatchObject({ code: "OPERATION_SCOPE_MISMATCH" });
    await f.enqueue(binding, "already-created", "existing-source");
    await expect(f.owner.enrollBinding(binding.id, digest)).rejects.toMatchObject({
      code: "CONSUMED_PROFILE_IMMUTABLE",
    });
    expect((await f.pool.query("SELECT count(*)::int n FROM research_binding_routes")).rows[0].n).toBe(0);
  } finally {
    await f.pool.end();
  }
});

test("immutable binding manifests cannot be replaced or bypassed by an exact-key route", async () => {
  const f = await setup();
  try {
    const binding = f.group.bindings[0],
      digest = await f.save(binding.id),
      replacement = await f.save(binding.id, profile, "replacement");
    await f.owner.enrollBinding(binding.id, digest);
    await expect(f.owner.enrollBinding(binding.id, replacement)).rejects.toMatchObject({
      code: "RESEARCH_ROUTE_PROFILE_MISMATCH",
    });
    await f.pool.query(
      "INSERT INTO research_task_routes(binding_id,task_key,profile_id,profile_version,manifest_digest) VALUES($1,'conflict',$2,$3,$4)",
      [binding.id, profile.id, profile.version, replacement],
    );
    await expect(f.enqueue(binding, "conflict", "conflicting-source")).rejects.toThrow(
      "RESEARCH_ROUTE_PROFILE_MISMATCH",
    );
    expect((await f.pool.query("SELECT count(*)::int n FROM platform_tasks")).rows[0].n).toBe(0);
  } finally {
    await f.pool.end();
  }
});

test("two-minute native cadence survives replayed migrations without changing existing five-minute support", async () => {
  const f = await setup();
  try {
    const { migrate } = await import("../../src/db.js");
    const made = await f.store.create({
      name: "Two-minute synthetic",
      count: 1,
      intervalMinutes: 2,
      seed: "capacity",
      strategies: ["guardian"],
    });
    await migrate(f.pool);
    expect(
      (await f.pool.query("SELECT interval_minutes FROM cohorts WHERE id=$1", [made.id])).rows[0].interval_minutes,
    ).toBe(2);
    await expect(
      f.store.create({
        name: "Existing five-minute",
        count: 1,
        intervalMinutes: 5,
        seed: "preserved",
        strategies: ["guardian"],
      }),
    ).resolves.toHaveProperty("id");
  } finally {
    await f.pool.end();
  }
});
