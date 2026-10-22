import { readFile } from "node:fs/promises";
import { Ajv } from "ajv";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { type Data, object, type Tool } from "../../src/domain.js";
import { createPactEnvironment } from "../../src/environments/pact.js";
import { pactReadQuerySchema } from "../../src/games/pact/read-queries.js";
import { bindActionContracts, ReactiveDecision } from "../../src/modules/decision-step/v1/engine.js";

const readTool: Tool = {
  name: "pact_council_thread_v1",
  description: "Read an authorized peer thread",
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: "object",
    properties: { kingdomId: { type: "string", minLength: 1 } },
    required: ["kingdomId"],
    additionalProperties: false,
  },
};
async function setup() {
  const read = vi.fn(async (name: string) =>
    name === "pact_world_read_v1" ? { profile: { kingdomId: "self" }, asOfGameTimeMs: 0 } : {},
  );
  const environment = createPactEnvironment({
    bindings: { agentFor: async () => "actor" },
    game: async () => ({
      profile: async () => ({ accountId: "owner" }),
      tools: async () => [
        readTool,
        { ...readTool, name: "pact_write_v1", annotations: { readOnlyHint: false } },
        { ...readTool, name: "sandbox.draft.read" },
      ],
      read,
      close: async () => {},
    }),
    now: () => new Date(0),
  } as never);
  return { session: await environment.connect({ accountRef: "owner", entityRef: "self" } as never), read };
}
it("advertises exact read selectors, explicit refresh and bounded schema lookup without write tools", async () => {
  const { session } = await setup();
  const schema = await session.readQuerySchema?.();
  expect(schema).toBeDefined();
  const accepts = new Ajv({ strict: false }).compile(object(schema));
  for (const query of [{}, { readSchema: readTool.name }, { tool: readTool.name, args: { kingdomId: "peer" } }])
    expect(accepts(query), JSON.stringify(query)).toBe(true);
  for (const query of [
    { document: "review", requestType: "resource_availability" },
    { tool: "pact_write_v1", args: {} },
    { readSchema: "sandbox.draft.read" },
    { tool: readTool.name },
    { readSchema: readTool.name, tool: readTool.name, args: {} },
    { continuity: true },
  ])
    expect(accepts(query), JSON.stringify(query)).toBe(false);
  // Schema delivery stays small even when argument contracts are large.
  expect(JSON.stringify(schema).length).toBeLessThan(2200);
  await session.close();
});
it("delivers the actual read argument schema without dispatching that read", async () => {
  const { session, read } = await setup();
  const observation = await session.observe({ readSchema: readTool.name });
  expect(observation.payload.requestedRead).toEqual({
    name: readTool.name,
    description: readTool.description,
    inputSchema: readTool.inputSchema,
  });
  expect(observation.payload.requestedReadTool).toBe(`schema:${readTool.name}`);
  expect(read.mock.calls.some(([name]) => name === readTool.name)).toBe(false);
  await session.observe({ tool: readTool.name, args: { kingdomId: "peer" } });
  expect(read).toHaveBeenCalledWith(readTool.name, { kingdomId: "peer" });
  await session.close();
});
it("rejects invented query fields before reading the world and validates explicit tool arguments", async () => {
  const { session, read } = await setup();
  for (const query of [
    { document: "review", requestType: "resource_availability" },
    { tool: readTool.name, args: { kingdomId: "peer" }, requestType: "signal" },
    { readSchema: readTool.name, continuity: true },
  ])
    await expect(session.observe(query)).rejects.toThrow("INVALID_READ_QUERY");
  expect(read).not.toHaveBeenCalled();
  await expect(session.observe({ readSchema: "pact_write_v1" })).rejects.toThrow("READ_TOOL_FORBIDDEN");
  await expect(session.observe({ tool: readTool.name, args: {} })).rejects.toThrow("INVALID_TOOL_ARGUMENTS");
  await session.observe({});
  expect(read).toHaveBeenCalled();
  await session.close();
});
it("binds environment query shapes into nested specialist output while leaving other environments compatible", () => {
  const base = z.toJSONSchema(z.object({ decision: ReactiveDecision }), { target: "draft-7" }),
    querySchema = { type: "object", properties: {}, additionalProperties: false },
    bound = bindActionContracts(base, [], [], undefined, querySchema),
    accepts = new Ajv({ strict: false }).compile(bound),
    output = (query: Data) => ({ decision: { kind: "read", query, summary: "Fresh authorized view" } });
  expect(accepts(output({}))).toBe(true);
  expect(accepts(output({ invented: true }))).toBe(false);
  expect(new Ajv({ strict: false }).compile(bindActionContracts(base, [], []))(output({ legacy: true }))).toBe(true);
});

it("keeps an empty read catalog valid and allows continuity only when the adapter advertises it", () => {
  const empty = new Ajv({ strict: false }).compile(pactReadQuerySchema([], false));
  expect(empty({})).toBe(true);
  expect(empty({ tool: "guessed", args: {} })).toBe(false);
  const accepts = new Ajv({ strict: false }).compile(pactReadQuerySchema([readTool.name], true));
  expect(accepts({ continuity: true, coordination: true })).toBe(true);
  expect(accepts({ continuity: true, tool: readTool.name, args: {} })).toBe(true);
  expect(accepts({ coordination: true })).toBe(false);
  expect(accepts({ continuity: true, invented: true })).toBe(false);
});

it("bounds the production read catalog overhead within the pinned specialist packet headroom", async () => {
  const catalog = JSON.parse(await readFile("tests/fixtures/production-read-catalog.json", "utf8")) as Tool[];
  const names = catalog
    .filter((tool) => tool.name.startsWith("pact_") && tool.annotations?.readOnlyHint === true)
    .map((tool) => tool.name);
  const querySchema = {
    anyOf: [
      pactReadQuerySchema(names, true),
      {
        type: "object",
        properties: { skillSchema: { const: true } },
        required: ["skillSchema"],
        additionalProperties: false,
      },
    ],
  };
  // Conservative incremental bound, not a fresh positive-world acceptance claim.
  const previousRestoredFakeMaximum = 29158;
  expect(previousRestoredFakeMaximum + Buffer.byteLength(JSON.stringify(querySchema))).toBeLessThanOrEqual(32000);
});
