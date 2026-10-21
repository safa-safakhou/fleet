import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { SpecialistRepository } from "../../src/app/participant-services.js";
import { ScopedSkillRepository } from "../../src/app/skill-services.js";
import { launchFixture } from "../fixtures/architecture-launch.js";
import { candidate } from "../fixtures/skills/candidate.js";

let f: Awaited<ReturnType<typeof launchFixture>>;
afterEach(async () => {
  await f?.close();
});
async function setupSkillLibrary() {
  f = await launchFixture(false);
  await f.store.consent(f.id, true);
  const binding = await f.tasks.bindings.forAgent(f.agent);
  if (!binding) throw Error("BINDING_REQUIRED");
  const scope = { instanceId: `${binding.id}:fixture@2`, bindingId: binding.id, specialistId: "resources" };
  await new SpecialistRepository(f.store, scope).initialize(
    ["resources", "diplomacy"].map((id) => ({
      id,
      revision: 1,
      responsibility: id,
      priority: 0,
      allowedActions: [],
      maxActiveGoals: 8,
    })),
  );
  const id = randomUUID(),
    evidence = {
      id,
      kind: "specialist-observation.v1",
      detail: { id, kind: "observation", bindingId: binding.id, detail: { stock: "10" } },
      sourceRefs: ["fixture:original"],
    };
  await f.pool.query("INSERT INTO architecture_scoped_evidence VALUES($1,$2,$3,$4,$5,$6)", [
    id,
    scope.instanceId,
    binding.id,
    evidence.kind,
    f.store.vault.encrypt(evidence, `architecture-evidence:${scope.instanceId}:${binding.id}:${id}`),
    f.now(),
  ]);
  return { f, scope, body: candidate(id), repository: new ScopedSkillRepository(f.store, scope) };
}
it("deduplicates concurrent proposals, pins explicit adoption and resets qualification on edits", async () => {
  const s = await setupSkillLibrary(),
    [a, b] = await Promise.all([s.repository.propose(s.scope, s.body), s.repository.propose(s.scope, s.body)]);
  expect(a).toEqual(b);
  expect((await f.pool.query("SELECT * FROM skill_versions")).rowCount).toBe(1);
  await s.repository.transition(s.scope, a, { expectedStatus: "candidate", nextStatus: "advisory" });
  const peer = { ...s.scope, specialistId: "diplomacy" };
  await expect(s.repository.adopt(peer, a)).rejects.toThrow("SKILL_NOT_PUBLISHED");
  await s.repository.publish(s.scope, a);
  await s.repository.adopt(peer, a);
  expect((await s.repository.loadSelected(peer, [a]))[0].status).toBe("advisory");
  const edited = await s.repository.propose(s.scope, {
    ...s.body,
    parent: a,
    purpose: { ...s.body.purpose, summary: "Revised stock check" },
  });
  expect(edited.version).toBe(2);
  expect(edited.digest).not.toBe(a.digest);
  expect((await s.repository.loadSelected(s.scope, [edited]))[0].status).toBe("candidate");
  expect((await s.repository.loadSelected(peer, [a]))[0].ref).toEqual(a);
  await expect(
    s.repository.transition(s.scope, a, {
      expectedStatus: "advisory",
      nextStatus: "guarded",
      evaluationId: randomUUID(),
    }),
  ).rejects.toThrow("TRUSTED_SKILL_EVALUATION_REQUIRED");
  await expect(s.repository.adopt({ ...peer, bindingId: randomUUID() }, a)).rejects.toThrow("SKILL_SCOPE_MISMATCH");
});
it("expires private support before maintenance and rejects unsupported recipient action scope", async () => {
  const s = await setupSkillLibrary();
  const ref = await s.repository.propose(s.scope, {
    ...s.body,
    compatibility: { ...s.body.compatibility, actionKeys: ["board.move.v1"] },
  });
  await s.repository.transition(s.scope, ref, { expectedStatus: "candidate", nextStatus: "advisory" });
  await s.repository.publish(s.scope, ref);
  await expect(s.repository.adopt({ ...s.scope, specialistId: "diplomacy" }, ref)).rejects.toThrow(
    "SKILL_INCOMPATIBLE",
  );
  f.advance(31 * 86400000);
  await expect(s.repository.loadSelected(s.scope, [ref])).rejects.toThrow("SKILL_SUPPORT_UNAVAILABLE");
  expect((await f.pool.query("SELECT status,body_cipher FROM skill_versions")).rows[0]).toEqual({
    status: "suspended",
    body_cipher: null,
  });
});
it("redacts derived content and suspends use when source evidence or consent disappears", async () => {
  const s = await setupSkillLibrary(),
    ref = await s.repository.propose(s.scope, s.body);
  await s.repository.transition(s.scope, ref, { expectedStatus: "candidate", nextStatus: "advisory" });
  await f.pool.query("DELETE FROM architecture_scoped_evidence WHERE id=$1", [s.body.evidence.sourceIds[0]]);
  await expect(s.repository.loadSelected(s.scope, [ref])).rejects.toThrow("SKILL_SUPPORT_UNAVAILABLE");
  expect((await f.pool.query("SELECT status,body_cipher FROM skill_versions")).rows[0]).toEqual({
    status: "suspended",
    body_cipher: null,
  });
  await f.store.consent(f.id, false);
  await expect(s.repository.retrieve(s.scope, { goal: "stock", event: "stock", limit: 8 })).rejects.toThrow(
    "CONSENT_REQUIRED",
  );
});
