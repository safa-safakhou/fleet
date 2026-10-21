import { expect, it } from "vitest";
import { SkillCandidateSchema, skillContentDigest } from "../../src/modules/skills/v1/schema.js";
import { candidate } from "../fixtures/skills/candidate.js";

it("requires bounded source-linked data and a canonical immutable digest", () => {
  const a = candidate(),
    b = Object.fromEntries(Object.entries(a).reverse());
  expect(skillContentDigest(a)).toBe(skillContentDigest(b));
  expect(SkillCandidateSchema.safeParse({ ...a, passed: true, status: "guarded" }).success).toBe(false);
  expect(SkillCandidateSchema.safeParse({ ...a, limits: { ...a.limits, wallTimeMs: Infinity } }).success).toBe(false);
  expect(SkillCandidateSchema.safeParse({ ...a, evidence: { ...a.evidence, sourceIds: [] } }).success).toBe(false);
});
