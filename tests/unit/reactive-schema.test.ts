import { Ajv } from "ajv";
import { expect, it } from "vitest";
import { ReactiveEngine } from "../../src/engines/reactive/engine.js";
import { reactiveProbe } from "../reactive-probe-context.js";

it("constrains action schema IDs to the current environment before admission", async () => {
  await new ReactiveEngine().run(
    reactiveProbe(async (_claim, input) => {
      const check = new Ajv({ strict: false, validateFormats: false }).compile(input.schema);
      expect(check({ kind: "action", schemaId: "invented", payload: {}, summary: "Act" })).toBe(false);
      expect(check({ kind: "action", schemaId: "board.move.v1", payload: {}, summary: "Act" })).toBe(true);
      expect(check({ kind: "wait", summary: "Wait" })).toBe(true);
      return { decision: { kind: "wait", summary: "Wait" }, inputTokens: 10, outputTokens: 2 };
    }),
  );
});

it("retains wait/read decisions in an environment with no action schemas", async () => {
  const ctx = reactiveProbe(async (_claim, input) => {
    const check = new Ajv({ strict: false, validateFormats: false }).compile(input.schema);
    expect(check({ kind: "wait", summary: "Wait" })).toBe(true);
    expect(check({ kind: "action", schemaId: "invented", payload: {}, summary: "Act" })).toBe(false);
    return { decision: { kind: "wait", summary: "Wait" }, inputTokens: 10, outputTokens: 2 };
  });
  ctx.schemas = { actions: [], observations: ["board.position.v1"] };
  await new ReactiveEngine().run(ctx);
});

it("replans a rejected local proposal before command preparation", async () => {
  let attempts = 0,
    submitted = 0;
  const ctx = reactiveProbe(async (_claim, input) => {
    attempts++;
    if (attempts === 2)
      expect(JSON.parse(input.messages[1].content).previousProposal).toMatchObject({
        code: "INVALID_PAYLOAD",
        submitted: false,
      });
    return {
      decision:
        attempts === 1
          ? { kind: "action", schemaId: "board.move.v1", payload: { invented: true }, summary: "Act" }
          : { kind: "wait", summary: "Wait" },
      inputTokens: 10,
      outputTokens: 2,
    };
  });
  ctx.validateProposal = async () => ({ valid: false, code: "INVALID_PAYLOAD" });
  ctx.commands = {
    submit: async () => {
      submitted++;
      throw Error("MUST_NOT_SUBMIT");
    },
  } as never;
  await new ReactiveEngine().run(ctx);
  expect(attempts).toBe(2);
  expect(submitted).toBe(0);
});

it("does not retry a submitted command with an unknown outcome", async () => {
  let calls = 0,
    submits = 0;
  const ctx = reactiveProbe(async () => {
    calls++;
    return {
      decision: { kind: "action", schemaId: "board.move.v1", payload: { move: "b2" }, summary: "Move" },
      inputTokens: 10,
      outputTokens: 2,
    };
  });
  ctx.commands = {
    submit: async () => {
      submits++;
      return { commandId: "id", status: "unknown", code: "TRANSPORT_UNCERTAIN", sourceRefs: [] };
    },
  } as never;
  await new ReactiveEngine().run(ctx);
  expect(calls).toBe(1);
  expect(submits).toBe(1);
});
