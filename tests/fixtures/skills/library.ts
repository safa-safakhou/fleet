import { randomUUID } from "node:crypto";
import { SpecialistRepository } from "../../../src/app/participant-services.js";
import { ScopedSkillRepository } from "../../../src/app/skill-services.js";
import { launchFixture } from "../architecture-launch.js";
import { candidate } from "./candidate.js";
export async function skillLibraryFixture(actions: string[] = []) {
  const f = await launchFixture(false);
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
      allowedActions: actions,
      maxActiveGoals: 8,
    })),
  );
  const capture = async (kind: "observation" | "outcome" | "promise", detail: Record<string, unknown>) => {
    const id = randomUUID(),
      evidence = {
        id,
        kind: `specialist-${kind}.v1`,
        detail: {
          id,
          kind,
          bindingId: binding.id,
          createdAt: f.now().toISOString(),
          expiresAt: new Date(f.now().getTime() + 30 * 86400000).toISOString(),
          detail,
        },
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
    return id;
  };
  const id = await capture("observation", { stock: "10" });
  return { f, scope, body: candidate(id), capture, repository: new ScopedSkillRepository(f.store, scope) };
}
