import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { LearningPolicy } from "../../src/engines/autonomous-specialists/learning.js";
import { retrieveSkills } from "../../src/modules/skills/v1/retrieval.js";
import type { SkillSummary } from "../../src/modules/skills/v1/schema.js";

it("retrieves a compact compatible index without bodies from a large library", () => {
  const base: SkillSummary = {
    ref: { id: randomUUID(), version: 1, digest: "a".repeat(64) },
    author: "resources",
    status: "advisory",
    purpose: "Stock safety",
    goalKinds: ["stock"],
    environment: { id: "board", version: "1" },
    roles: ["resources"],
    actionKeys: [],
    representation: "guide",
    published: false,
    outcomeSupport: "unproven",
  };
  const values = Array.from({ length: 1000 }, (_, i) => ({
    ...base,
    ref: { ...base.ref, id: randomUUID() },
    purpose: i === 999 ? "Hall stock goal" : "Unrelated routine",
  }));
  const selected = retrieveSkills(values, {
    goal: "Hall stock goal",
    event: "stock",
    limit: 8,
    environment: base.environment,
    role: "resources",
  });
  expect(selected).toHaveLength(8);
  expect(selected[0].purpose).toBe("Hall stock goal");
  expect(JSON.stringify(selected)).not.toContain("procedure");
  expect(
    retrieveSkills(values, {
      goal: "stock",
      event: "",
      limit: 8,
      environment: { id: "other", version: "1" },
      role: "resources",
    }),
  ).toEqual([]);
});
it("offers learning from observed successes and failures while unresolved outcomes stay unproven", () => {
  const policy = new LearningPolicy(),
    original = {
      id: randomUUID(),
      bindingId: randomUUID(),
      kind: "outcome" as const,
      createdAt: "2026-10-21T00:00:00Z",
      expiresAt: "2026-11-21T00:00:00Z",
      sourceRefs: ["actual:outcome"],
      causalKey: "episode",
      entityRefs: [],
      goalRefs: [],
      detail: { fulfilled: true },
    };
  expect(policy.opportunities([original], true, 1)[0].outcome).toBe("observed_success");
  expect(policy.opportunities([{ ...original, detail: { fulfilled: false } }], true, 1)[0].outcome).toBe(
    "observed_failure",
  );
  expect(policy.opportunities([{ ...original, detail: { receiptOnly: true } }], true, 1)).toEqual([]);
  expect(policy.opportunities([original], false, 1)).toEqual([]);
  expect(policy.opportunities([original], true, 0)).toEqual([]);
  const referenceOnly = { ...original, kind: "observation" as const, detail: { payloadOmitted: true } };
  expect(policy.opportunities([referenceOnly, { ...referenceOnly, id: randomUUID() }], true, 1)).toEqual([]);
});
