import { afterEach, expect, test, vi } from "vitest";
import { FleetError } from "../../src/domain.js";
import { HttpModel } from "../../src/model.js";
import { CaptureSession } from "../../src/research/evidence/boundaries.js";
import { vllmCompletion } from "../../src/vllm-transport.js";

afterEach(() => vi.restoreAllMocks());
test("prepared HTTP body equals wire body and never includes transport credentials", async () => {
  const packets: unknown[] = [];
  let wire: unknown;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    wire = JSON.parse(String(init?.body));
    return Response.json({ message: { content: "{}" }, prompt_eval_count: 1, eval_count: 2 });
  });
  await new HttpModel({ ollama: "http://fixture.invalid" }, "secret-sentinel").decide({
    model: { route: "ollama", model: "fake", temperature: 0.2 },
    messages: [{ role: "user", content: "x".repeat(300000) }],
    schema: { type: "object" },
    signal: new AbortController().signal,
    maxOutputTokens: 10,
    onEvidence: async (e) => {
      packets.push(e);
    },
  });
  expect(packets[0]).toEqual({ kind: "prepared", body: wire });
  expect(packets).toHaveLength(2);
  expect(JSON.stringify(packets)).not.toContain("secret-sentinel");
});
test("SSE delivers provider packets in order and refuses failed required capture before fetch", async () => {
  const packets: unknown[] = [],
    data = [
      { choices: [{ index: 0, delta: { content: "{}" }, finish_reason: "stop" }] },
      { choices: [], usage: { prompt_tokens: 3, completion_tokens: 4 } },
    ];
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(data.map((v) => `data: ${JSON.stringify(v)}\n\n`).join("") + "data: [DONE]\n\n", {
        headers: { "content-type": "text/event-stream" },
      }),
    );
  await vllmCompletion("http://fixture.invalid", {}, "key", new AbortController().signal, async (e) => {
    packets.push(e);
  });
  expect(packets.slice(1)).toEqual(data.map((body) => ({ kind: "packet", body })));
  await expect(
    vllmCompletion("http://fixture.invalid", {}, "key", new AbortController().signal, async () => {
      throw new FleetError("EVIDENCE_UNAVAILABLE", true);
    }),
  ).rejects.toMatchObject({ notDispatched: true });
  expect(fetch).toHaveBeenCalledTimes(1);
});
test("observation wrappers preserve synchronous host contracts", () => {
  const session = new CaptureSession({} as never, {} as never);
  const source = {
    environment: {
      accountObjective: () => ({ value: 1 }),
      projectObservation: (v: unknown) => v,
      packObservation: (v: unknown) => v,
      observationSemanticsFor: () => "v1",
    },
    continuity: { restrict: () => {} },
    model: { inputBytes: () => 5 },
  };
  const wrapped = session.scoped({ id: "fake", agentId: "fake", cohortId: "fake" }, source);
  expect(wrapped.environment.accountObjective()).toEqual({ value: 1 });
  expect(wrapped.environment.projectObservation(4)).toBe(4);
  expect(wrapped.environment.packObservation(4)).toBe(4);
  expect(wrapped.continuity.restrict()).toBeUndefined();
  expect(wrapped.model.inputBytes()).toBe(5);
});
