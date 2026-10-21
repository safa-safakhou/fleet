import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { PrimitiveRegistry, validateRecipe } from "../../src/modules/skills/v1/primitives.js";
import {
  QualificationPolicy,
  qualifyRecipe,
  runTrustedCases,
  TrustedCaseSet,
} from "../../src/modules/skills/v1/qualification.js";
import { type SkillVersion, skillContentDigest } from "../../src/modules/skills/v1/schema.js";
import { candidate } from "../fixtures/skills/candidate.js";

function setup() {
  const body = candidate();
  body.representation = "recipe";
  body.compatibility.primitives = [{ id: "stock.read", version: "1" }];
  body.procedure.nodes = [
    { id: "read", kind: "observe", primitive: { id: "stock.read", version: "1" }, args: {}, saveAs: "stock" },
  ];
  const skill: SkillVersion = {
    ref: { id: randomUUID(), version: 1, digest: skillContentDigest(body) },
    author: "resources",
    body,
    status: "candidate",
    published: false,
    createdAt: "2026-10-21T00:00:00Z",
    outcomeSupport: "unproven",
  };
  const registry = new PrimitiveRegistry([
    {
      ref: { id: "stock.read", version: "1" },
      kind: "observe",
      argsSchema: { type: "object", properties: {}, additionalProperties: false },
      work: { reads: 1, actions: 0, messages: 0, steps: 1 },
      actionKeys: [],
      run: async () => ({ value: { stock: "10" } }),
    },
  ]);
  return { skill, registry };
}
it("rejects unknown dependencies, cycles, hidden work and dynamic code or destinations", () => {
  const { skill, registry } = setup();
  expect(validateRecipe(skill, registry)).toEqual([]);
  const bad = structuredClone(skill);
  bad.body.procedure.nodes[0] = {
    id: "read",
    kind: "observe",
    primitive: { id: "stock.read", version: "2" },
    args: {},
  };
  expect(validateRecipe(bad, registry).map((i) => i.code)).toContain("UNKNOWN_PRIMITIVE");
  const dynamic = structuredClone(skill);
  dynamic.body.procedure.nodes[0] = {
    id: "read",
    kind: "observe",
    primitive: { id: "stock.read", version: "1" },
    args: { url: "https://invalid.example", code: "eval()" },
  };
  expect(validateRecipe(dynamic, registry).map((i) => i.code)).toContain("DYNAMIC_RECIPE_ARGUMENT");
  const cyclic = structuredClone(skill);
  cyclic.body.procedure.nodes = [{ id: "child", kind: "invoke", skill: cyclic.ref, args: {} }];
  cyclic.body.procedure.children = [cyclic.ref];
  expect(validateRecipe(cyclic, registry, new Map([[cyclic.ref.digest, cyclic]])).map((i) => i.code)).toContain(
    "SKILL_COMPOSITION_CYCLE",
  );
  const hidden = structuredClone(skill);
  hidden.body.limits.reads = 0;
  expect(validateRecipe(hidden, registry).map((i) => i.code)).toContain("HIDDEN_CHILD_OR_PRIMITIVE_WORK");
});
it("requires independent host cases for the exact immutable skill and dependencies", async () => {
  const { skill, registry } = setup(),
    policy = new QualificationPolicy();
  expect(qualifyRecipe(skill, registry, policy, { id: "forged", passed: true } as never).mode).toBe("advisory");
  const cases = new TrustedCaseSet(
    "read-only.v1",
    policy.requiredCases.map((id) => ({
      id,
      run: async () => ({ observed: "10", worldEffects: 0 }),
      accept: (v: unknown) => JSON.stringify(v) === JSON.stringify({ observed: "10", worldEffects: 0 }),
    })),
    "fixtures.read-only.v1",
  );
  const evidence = await runTrustedCases(skill, registry, policy, cases, skill.body.evidence.sourceIds);
  expect(qualifyRecipe(skill, registry, policy, evidence).reasons).toContain("UNREGISTERED_QUALIFICATION_FIXTURES");
  policy.registerCases(cases);
  const registeredEvidence = await runTrustedCases(skill, registry, policy, cases, skill.body.evidence.sourceIds);
  expect(qualifyRecipe(skill, registry, policy, registeredEvidence)).toMatchObject({ mode: "guarded", reasons: [] });
  const changed = structuredClone(skill);
  changed.ref.digest = "b".repeat(64);
  expect(qualifyRecipe(changed, registry, policy, registeredEvidence).mode).toBe("advisory");
  const alteredRegistry = new PrimitiveRegistry([
    {
      ref: { id: "stock.read", version: "1" },
      kind: "observe",
      argsSchema: { type: "object", properties: {}, additionalProperties: false },
      work: { reads: 1, actions: 0, messages: 0, steps: 1 },
      actionKeys: [],
      run: async () => ({ value: { stock: "11" } }),
    },
  ]);
  expect(qualifyRecipe(skill, alteredRegistry, policy, registeredEvidence).reasons).toContain(
    "SKILL_EVALUATION_MISMATCH",
  );
  expect(() => registeredEvidence.cases.push({ id: "forged", passed: true, wallTimeMs: 0, error: null })).toThrow();
  const missing = await runTrustedCases(skill, registry, policy, cases, []);
  expect(qualifyRecipe(skill, registry, policy, missing).reasons).toContain("MISSING_SKILL_SUPPORT");
  const guide = structuredClone(skill);
  guide.body.representation = "guide";
  guide.body.procedure.nodes = [];
  expect(qualifyRecipe(guide, registry, policy, evidence).mode).toBe("advisory");
});
