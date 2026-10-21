import { afterEach, expect, it } from "vitest";
import { PrimitiveRegistry } from "../../src/modules/skills/v1/primitives.js";
import { QualificationPolicy, runTrustedCases, TrustedCaseSet } from "../../src/modules/skills/v1/qualification.js";
import { skillLibraryFixture } from "../fixtures/skills/library.js";

let s: Awaited<ReturnType<typeof skillLibraryFixture>>;
afterEach(async () => {
  await s?.f.close();
});
it("stores only host-issued exact-digest evaluations and never transfers them to an edit", async () => {
  s = await skillLibraryFixture();
  const body = {
    ...s.body,
    representation: "recipe" as const,
    compatibility: { ...s.body.compatibility, primitives: [{ id: "observe", version: "1" }] },
    procedure: {
      ...s.body.procedure,
      nodes: [{ id: "read", kind: "observe" as const, primitive: { id: "observe", version: "1" }, args: {} }],
    },
  };
  const ref = await s.repository.propose(s.scope, body),
    [skill] = await s.repository.loadSelected(s.scope, [ref]),
    registry = new PrimitiveRegistry([
      {
        ref: { id: "observe", version: "1" },
        kind: "observe",
        argsSchema: { type: "object", additionalProperties: false },
        work: { reads: 1, actions: 0, messages: 0, steps: 1 },
        actionKeys: [],
        run: async () => ({ value: { observed: true } }),
      },
    ]),
    policy = new QualificationPolicy();
  const cases = new TrustedCaseSet(
    "read-only.v1",
    policy.requiredCases.map((id) => ({
      id,
      run: async () => ({ effects: 0 }),
      accept: (v: unknown) => JSON.stringify(v) === '{"effects":0}',
    })),
    "fixture-library.v1",
  );
  policy.registerCases(cases);
  await expect(
    s.repository.recordQualification(s.scope, ref, registry, policy, { id: "forged", passed: true } as never),
  ).rejects.toThrow("TRUSTED_SKILL_EVALUATION_REQUIRED");
  const evidence = await runTrustedCases(skill, registry, policy, cases, body.evidence.sourceIds);
  expect((await s.repository.recordQualification(s.scope, ref, registry, policy, evidence)).mode).toBe("guarded");
  expect((await s.repository.loadSelected(s.scope, [ref]))[0]).toMatchObject({
    status: "guarded",
    evaluationId: evidence.id,
  });
  const edited = await s.repository.propose(s.scope, {
    ...body,
    parent: ref,
    purpose: { ...body.purpose, summary: "Edited procedure hypothesis" },
  });
  expect((await s.repository.loadSelected(s.scope, [edited]))[0]).toMatchObject({
    status: "candidate",
    evaluationId: undefined,
  });
  expect((await s.f.pool.query("SELECT * FROM skill_evaluations")).rowCount).toBe(1);
});
