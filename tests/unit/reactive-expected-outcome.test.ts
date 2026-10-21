import { Ajv } from "ajv";
import { expect, it } from "vitest";
import { type Data, object } from "../../src/domain.js";
import { ReactiveEngine } from "../../src/engines/reactive/engine.js";
import { decisionProbe } from "../scoped-probe.js";

it("binds environment-specific outcome assertions and delivers a pre-commit correction without importing game semantics", async () => {
  const inputs: Data[] = [],
    submitted: unknown[] = [];
  const good = {
    kind: "action",
    schemaId: "fixture.action.v1",
    payload: { kind: "act" },
    expectedOutcome: { delta: "right" },
    summary: "Synthetic supported effect",
  };
  const wrong = { ...good, expectedOutcome: { delta: "wrong" } };
  const decisions = [wrong, good];
  await new ReactiveEngine().run(
    decisionProbe({
      claim: {
        taskId: "task",
        turn: {
          cohort: {
            model: { route: "fixture", model: "fake" },
            budget: { maxCallsPerTurn: 3, inputByteLimit: 24000, maxOutputTokens: 2000 },
          },
        },
      },
      binding: { id: "binding" },
      observation: { schemaId: "fixture", payload: {}, sourceRefs: [] },
      task: { key: "focus", sourceCount: 1, sourceRefsOmitted: 0 },
      eventRefs: [],
      schemas: { actions: ["fixture.action.v1"] },
      signal: new AbortController().signal,
      actionContracts: async () => [
        {
          schemaId: "fixture.action.v1",
          payloadSchema: {
            type: "object",
            properties: { kind: { const: "act" } },
            required: ["kind"],
            additionalProperties: false,
          },
          expectedOutcomeSchema: {
            type: "object",
            properties: { delta: { type: "string" } },
            required: ["delta"],
            additionalProperties: false,
          },
        },
      ],
      model: {
        decide: async (_claim: unknown, input: Data) => {
          inputs.push(input);
          return { decision: decisions.shift(), inputTokens: 1, outputTokens: 1 };
        },
      },
      validateProposal: async (p: Data) =>
        object(p.expectedOutcome).delta === "right"
          ? { valid: true, code: "VALID" }
          : {
              valid: false,
              code: "DIRECTION_WRONG",
              guidance: "Use the exact computed effect",
              detail: { actualDelta: "right" },
            },
      commands: {
        submit: async (_claim: unknown, intent: unknown) => {
          submitted.push(intent);
          return { status: "confirmed", code: "COMMITTED" };
        },
      },
    } as never),
  );
  expect(inputs).toHaveLength(2);
  expect(submitted).toHaveLength(1);
  const check = new Ajv({ strict: false, validateFormats: false }).compile(object(inputs[0].schema));
  const { expectedOutcome: _omit, ...missing } = good;
  expect(check(missing)).toBe(false);
  expect(check(good)).toBe(true);
  const packet = JSON.parse(String(object((inputs[1].messages as Data[])[1]).content));
  expect(packet.previousProposal).toMatchObject({
    code: "DIRECTION_WRONG",
    submitted: false,
    committed: false,
    guidance: "Use the exact computed effect",
    detail: { actualDelta: "right" },
  });
});
