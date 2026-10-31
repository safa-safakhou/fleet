import { expect, test } from "vitest";
import { ManifestRepository } from "../../src/research/manifests/repository.js";
import { QualificationPolicy } from "../../src/research/qualification/policy.js";
import { QualificationRepository } from "../../src/research/qualification/repository.js";
import { memoryFixture } from "../fixtures/research/memory.js";
import { qualificationEvidence, qualificationNow } from "../fixtures/research/qualification.js";

test("qualification records resist edited labels, immutable persistence and changed current capabilities", async () => {
  const f = await memoryFixture(false);
  try {
    const e = qualificationEvidence(),
      policy = new QualificationPolicy(() => qualificationNow),
      repo = new QualificationRepository(f.pool, policy);
    await new ManifestRepository(f.pool).save(e.manifest);
    const decision = policy.assess(e.testedManifestDigest, e);
    await expect(repo.record({ ...decision, scope: "provider" })).rejects.toThrow("UNASSESSED_QUALIFICATION");
    const id = await repo.record(decision);
    expect(await repo.record(decision)).toBe(id);
    expect((await repo.reassess(id, e)).status).toBe("qualified");
    const changed = structuredClone(e);
    changed.capability.model.tools = false;
    const invalidated = await repo.reassess(id, changed);
    expect(invalidated.status).toBe("blocked");
    await expect(repo.record(invalidated)).resolves.toMatch(/^[a-f0-9]{64}$/);
    await expect(
      f.pool.query("UPDATE research_qualifications SET scope='provider' WHERE id=$1", [id]),
    ).rejects.toThrow();
  } finally {
    await f.close();
  }
});
