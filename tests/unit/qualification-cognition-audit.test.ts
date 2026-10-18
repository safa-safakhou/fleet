import { expect, it } from "vitest";
import { auditCognitionOutputs } from "../../src/qualification-cognition-audit.js";

const ref = "00000000-0000-4000-8000-000000000001";
it("counts both cognition envelopes by profile and mode without treating proposals as persisted writes", () => {
  const result = auditCognitionOutputs([
    {
      thinking: true,
      profile: "legacy-cognition",
      valid: true,
      decision: { cognition: { memories: [{ summary: "Earlier offer", importance: 2, evidenceRefs: [ref] }] } },
    },
    {
      thinking: false,
      profile: "legacy-cognition",
      valid: true,
      decision: { cognition: { analysis: { type: "belief" }, memories: [] } },
    },
    { thinking: true, profile: "reactive-cognition", valid: true, decision: { decision: { kind: "wait" } } },
    {
      thinking: false,
      profile: "reactive-cognition",
      valid: true,
      decision: { continuity: { memories: [{ text: "Earlier fact", evidenceRefs: [ref] }] } },
    },
  ]);
  expect(result).toMatchObject({
    evidenceScope: "model_proposals_only",
    modes: [
      {
        thinking: true,
        profiles: [
          { profile: "legacy-cognition", sourceLinkedMemoryProposals: 1, omitted: 0 },
          { profile: "reactive-cognition", sourceLinkedMemoryProposals: 0, omitted: 1 },
        ],
      },
      {
        thinking: false,
        profiles: [
          { profile: "legacy-cognition", sourceLinkedMemoryProposals: 0, omitted: 0 },
          { profile: "reactive-cognition", sourceLinkedMemoryProposals: 1, omitted: 0 },
        ],
      },
    ],
  });
});

it("separates absent, empty, invalid and citation-free memory proposals", () => {
  const base = { thinking: true, profile: "reactive-cognition", valid: true };
  const result = auditCognitionOutputs([
    { ...base, decision: {} },
    { ...base, decision: { continuity: { beliefs: [], memories: [], plan: null } } },
    { ...base, decision: { continuity: { memories: [{ text: "Unsupported", evidenceRefs: [] }] } } },
    { ...base, valid: false, decision: { continuity: { memories: [{ text: "Bad envelope", evidenceRefs: [ref] }] } } },
    { ...base, profile: "legacy-loop", decision: { memories: [{ evidenceRefs: [ref] }] } },
  ]);
  expect(result.modes[0].profiles[1]).toMatchObject({
    outputs: 4,
    invalid: 1,
    omitted: 1,
    empty: 1,
    memoryProposals: 1,
    sourceLinkedMemoryProposals: 0,
  });
});
