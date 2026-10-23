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
    name === "pact_world_read_v1"
      ? { profile: { kingdomId: "self" }, asOfGameTimeMs: 0 }
      : { name: readTool.name, inputSchema: readTool.inputSchema, records: [] },
  );
  let tools: Tool[] = [
    readTool,
    { ...readTool, name: "pact_write_v1", annotations: { readOnlyHint: false } },
    { ...readTool, name: "sandbox.draft.read" },
  ];
  const environment = createPactEnvironment({
    bindings: { agentFor: async () => "actor" },
    game: async () => ({
      profile: async () => ({ accountId: "owner" }),
      tools: async () => tools,
      read,
      close: async () => {},
    }),
    now: () => new Date(0),
  } as never);
  return {
    session: await environment.connect({ accountRef: "owner", entityRef: "self" } as never),
    read,
    setTools: (next: Tool[]) => {
      tools = next;
    },
  };
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

it("requires authenticated schema retrieval before generating native tool arguments", async () => {
  const { session, read } = await setup();
  let retrievedTool: string | undefined;
  const accepts = async () =>
    new Ajv({ strict: false }).compile(
      object(
        await session.readQuerySchema?.({ requireKnownArguments: true, ...(retrievedTool ? { retrievedTool } : {}) }),
      ),
    );
  let check = await accepts();
  expect(check({})).toBe(true);
  expect(check({ readSchema: readTool.name })).toBe(true);
  expect(check({ tool: readTool.name, args: { kingdomId: "peer" } })).toBe(false);
  const metadata = (await session.catalog()).find((t) => t.name === readTool.name);
  if (!metadata) throw Error("MISSING_READ_TOOL");
  retrievedTool = metadata.name;
  expect(read.mock.calls.some(([name]) => name === readTool.name)).toBe(false);
  check = await accepts();
  expect(check({ tool: readTool.name, args: { kingdomId: "peer" } })).toBe(true);
  for (const args of [{}, { sourceRefs: [] }, { kingdomId: "peer", records: [] }, { kingdomId: 1 }])
    expect(check({ tool: readTool.name, args })).toBe(false);
  await session.observe({ tool: readTool.name, args: { kingdomId: "peer" } });
  retrievedTool = undefined;
  check = await accepts();
  expect(check({ tool: readTool.name, args: { kingdomId: "peer" } })).toBe(false);
  const legacy = new Ajv({ strict: false }).compile(object(await session.readQuerySchema?.()));
  expect(legacy({ tool: readTool.name, args: { arbitraryLegacy: true } })).toBe(true);
  await session.close();
});
it("removes revoked tools and never learns schemas from ordinary read results", async () => {
  const { session, setTools } = await setup();
  await session.observe({ tool: readTool.name, args: { kingdomId: "peer" } });
  const compile = async () =>
    new Ajv({ strict: false }).compile(object(await session.readQuerySchema?.({ requireKnownArguments: true })));
  expect((await compile())({ tool: readTool.name, args: { kingdomId: "peer" } })).toBe(false);
  await session.catalog();
  setTools([]);
  const check = new Ajv({ strict: false }).compile(
    object(await session.readQuerySchema?.({ requireKnownArguments: true, retrievedTool: readTool.name })),
  );
  expect(check({ tool: readTool.name, args: { kingdomId: "peer" } })).toBe(false);
  expect(check({ readSchema: readTool.name })).toBe(false);
  await session.close();
});
it("ports digit-only native patterns without rewriting source schemas or literal data", () => {
  const native = {
    type: "object",
    properties: { tick: { type: "string", pattern: "^\\d+$" }, literal: { const: { pattern: "\\d" } } },
    required: ["tick", "literal"],
    additionalProperties: false,
  };
  const before = structuredClone(native),
    schema = pactReadQuerySchema([readTool.name], false, [{ name: readTool.name, inputSchema: native }]);
  expect(native).toEqual(before);
  expect(JSON.stringify(schema)).toContain("[0-9]");
  const check = new Ajv({ strict: false }).compile(schema);
  expect(check({ tool: readTool.name, args: { tick: "123", literal: { pattern: "\\d" } } })).toBe(true);
  expect(check({ tool: readTool.name, args: { tick: "abc", literal: { pattern: "\\d" } } })).toBe(false);
});

it("retrieves trusted argument metadata without reading or relabeling game facts", async () => {
  const { session, read } = await setup();
  const tool = (await session.catalog()).find((t) => t.name === readTool.name);
  expect(tool?.inputSchema).toEqual(readTool.inputSchema);
  expect(read).not.toHaveBeenCalled();
  const check = new Ajv({ strict: false }).compile(
    object(await session.readQuerySchema?.({ requireKnownArguments: true, retrievedTool: tool?.name })),
  );
  expect(check({ tool: readTool.name, args: { kingdomId: "peer" } })).toBe(true);
  const forbidden = new Ajv({ strict: false }).compile(
    object(await session.readQuerySchema?.({ requireKnownArguments: true, retrievedTool: "pact_write_v1" })),
  );
  expect(forbidden({ tool: "pact_write_v1", args: {} })).toBe(false);
  await session.close();
});

it("permits only proven empty native defaults without a schema-lookup round trip", async () => {
  const { session, setTools } = await setup();
  const tool = {
    ...readTool,
    name: "pact_agent_guide_v1",
    inputSchema: {
      type: "object",
      properties: { topic: { enum: ["start", "authority"] } },
      additionalProperties: false,
    },
  };
  setTools([tool, readTool]);
  const check = new Ajv({ strict: false }).compile(
    object(await session.readQuerySchema?.({ requireKnownArguments: true })),
  );
  expect(check({ tool: tool.name, args: {} })).toBe(true);
  expect(check({ tool: tool.name, args: { topic: "authority" } })).toBe(false);
  expect(check({ tool: readTool.name, args: {} })).toBe(false);
  expect(check({ tool: tool.name, args: { sourceRefs: [] } })).toBe(false);
  const known = new Ajv({ strict: false }).compile(
    object(await session.readQuerySchema?.({ requireKnownArguments: true, retrievedTool: tool.name })),
  );
  expect(known({ tool: tool.name, args: {} })).toBe(true);
  expect(known({ tool: tool.name, args: { topic: "authority" } })).toBe(true);
  await session.close();
});
