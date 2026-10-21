import { afterEach, expect, it } from "vitest";
import { skillLibraryFixture } from "../fixtures/skills/library.js";

let s: Awaited<ReturnType<typeof skillLibraryFixture>>;
afterEach(async () => {
  await s?.f.close();
});
it("propagates exact pinned child invalidation to explicitly adopted parents without broadcasting bodies", async () => {
  s = await skillLibraryFixture();
  const child = await s.repository.propose(s.scope, s.body);
  await s.repository.transition(s.scope, child, { expectedStatus: "candidate", nextStatus: "advisory" });
  const source = await s.capture("observation", { stock: "fresh" }),
    parentBody = structuredClone(s.body);
  parentBody.evidence.sourceIds = [source];
  parentBody.evidence.episodeIds = ["parent-episode"];
  parentBody.representation = "recipe";
  parentBody.procedure = {
    guide: "Pinned bounded child",
    children: [child],
    nodes: [{ id: "child", kind: "invoke", skill: child, args: {} }],
  };
  const parent = await s.repository.propose(s.scope, parentBody),
    peer = { ...s.scope, specialistId: "diplomacy" };
  await s.repository.transition(s.scope, parent, { expectedStatus: "candidate", nextStatus: "advisory" });
  await expect(s.repository.loadSelected(peer, [parent])).rejects.toThrow("SKILL_NOT_ADOPTED");
  await s.repository.publish(s.scope, parent);
  await s.repository.adopt(peer, parent);
  expect((await s.repository.loadSelected(peer, [parent]))[0].body.procedure.children).toEqual([child]);
  await s.f.pool.query("DELETE FROM architecture_scoped_evidence WHERE id=$1", [s.body.evidence.sourceIds[0]]);
  expect(
    (await s.f.pool.query("SELECT status,body_cipher,summary_cipher FROM skill_versions ORDER BY created_at")).rows,
  ).toEqual([
    { status: "suspended", body_cipher: null, summary_cipher: null },
    { status: "suspended", body_cipher: null, summary_cipher: null },
  ]);
  await expect(s.repository.loadSelected(peer, [parent])).rejects.toThrow("SKILL_SUPPORT_UNAVAILABLE");
});
