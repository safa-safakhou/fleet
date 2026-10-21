import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { skillLibraryFixture } from "../fixtures/skills/library.js";

let s: Awaited<ReturnType<typeof skillLibraryFixture>>;
afterEach(async () => {
  await s?.f.close();
});
it("persists actual success/failure support separately from a model's claimed outcome", async () => {
  s = await skillLibraryFixture();
  for (const fulfilled of [true, false]) {
    const id = await s.capture("outcome", { fulfilled }),
      body = {
        ...s.body,
        evidence: { sourceIds: [id], episodeIds: [id], claimedOutcome: "success" as const },
        procedure: { ...s.body.procedure, guide: `A distinct ${fulfilled} hypothesis` },
      };
    const ref = await s.repository.propose(s.scope, body);
    expect((await s.repository.loadSelected(s.scope, [ref]))[0].outcomeSupport).toBe(
      fulfilled ? "observed_success" : "observed_failure",
    );
  }
});
it("has no implicit extraction allowance and suppresses duplicate procedure signatures across episodes", async () => {
  s = await skillLibraryFixture();
  await expect(s.repository.proposeFromOperation(s.scope, randomUUID(), [s.body])).rejects.toThrow(
    "LEARNING_ALLOWANCE_UNAVAILABLE",
  );
  expect((await s.f.pool.query("SELECT * FROM skill_versions")).rowCount).toBe(0);
  const first = await s.repository.propose(s.scope, s.body),
    second = await s.repository.propose(s.scope, {
      ...s.body,
      evidence: { ...s.body.evidence, episodeIds: [randomUUID()] },
    });
  expect(second).toEqual(first);
});
