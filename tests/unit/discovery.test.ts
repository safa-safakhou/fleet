import { expect, it, vi } from "vitest";
import { type Data, type GamePort, object, type Tool } from "../../src/domain.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";

function game(toolNames: string[], discovery: Data) {
  const read = vi.fn(async (tool: string, args: Data) => {
    if (tool === "pact_world_read_v1") return { profile: { kingdomId: "self" } };
    if (tool === "pact_kingdom_discover_v2") return discovery;
    if (tool === "pact_play_view_v1")
      return {
        players: { players: [{ kingdomId: "legacy", handle: "old" }], offset: args.offset ?? 0 },
        parties: { legacy: {} },
      };
    return { contacts: [] };
  });
  return {
    read,
    tools: async (): Promise<Tool[]> =>
      toolNames.map((name) => ({ name, inputSchema: {}, annotations: { readOnlyHint: true } })),
  } as unknown as GamePort & { read: typeof read };
}
it("prefers a world-wide varied shortlist, retains public trade/relationship evidence, and never constrains it to its cohort name", async () => {
  const fake = game(["pact_kingdom_discover_v2", "pact_play_view_v1"], {
    kingdoms: [
      {
        kingdomId: "peer",
        handle: "outside_cohort",
        relationship: { contact: false },
        publicNotice: { title: "Grain offered", meaning: "statement" },
        sharedCourts: [],
      },
      { kingdomId: "self" },
    ],
    query: { rotation: 12 },
    selection: "varied_sample",
    hasMore: true,
    coverage: "bounded public candidates",
  });
  const facts = await pactAdapter.initial(fake, "self", {
    ordinal: 2,
    turn: 10,
    count: 5,
    name: "private cohort name",
  });
  expect(fake.read).toHaveBeenCalledWith("pact_kingdom_discover_v2", { rotation: 12, limit: 8 });
  expect(fake.read.mock.calls.some(([tool]) => tool === "pact_play_view_v1")).toBe(false);
  const discovery = object(facts.discovery);
  expect(discovery.players).toHaveLength(1);
  expect(object((discovery.players as Data[])[0]).publicNotice).toMatchObject({ title: "Grain offered" });
  expect(pactAdapter.compactFacts(facts).publicDiscovery).toEqual(discovery);
  expect(fake.read.mock.calls.some(([, args]) => JSON.stringify(args).includes("private cohort name"))).toBe(false);
});
it("keeps a genuine empty shortlist empty without falling back to an unrestricted old directory", async () => {
  const fake = game(["pact_kingdom_discover_v2", "pact_play_view_v1"], { kingdoms: [], hasMore: false });
  expect(object((await pactAdapter.initial(fake, "self")).discovery).players).toEqual([]);
  expect(fake.read.mock.calls.some(([tool]) => tool === "pact_play_view_v1")).toBe(false);
});
it("pages the whole world without a cohort search when the server lacks the new read", async () => {
  const fake = game(["pact_play_view_v1"], {});
  const facts = await pactAdapter.initial(fake, "self", { ordinal: 1, turn: 2, count: 50, name: "old cohort" });
  expect(fake.read).toHaveBeenCalledWith("pact_play_view_v1", { offset: 8 });
  expect(fake.read.mock.calls.some(([, args]) => "search" in args)).toBe(false);
  expect(object(facts.discovery).players).toEqual([{ kingdomId: "legacy", handle: "old", agentActivity: undefined }]);
  expect(pactAdapter.nextDiscoveryCursor?.(facts)).toEqual({ offset: 0 });
});
it("retains a global page cursor across turns and wraps at the actual directory end", async () => {
  const fake = game(["pact_play_view_v1"], {});
  fake.read = vi.fn(async (tool, args) => {
    if (tool === "pact_world_read_v1") return { profile: { kingdomId: "self", ambition: "Owner chosen objective" } };
    if (tool === "pact_play_view_v1")
      return {
        players: {
          players: [{ kingdomId: "outside", displayName: "Different kingdom" }],
          offset: args.offset,
          hasMore: args.offset === 80,
        },
        parties: { outside: { agent: { lastObservedAt: null, runActive: false } } },
      };
    return {};
  });
  const first = await pactAdapter.initial(fake, "self", {
    ordinal: 1,
    turn: 12,
    count: 10,
    name: "group",
    discoveryCursor: { offset: 80 },
  });
  expect(pactAdapter.nextDiscoveryCursor?.(first)).toEqual({ offset: 88 });
  const last = await pactAdapter.initial(fake, "self", {
    ordinal: 1,
    turn: 13,
    count: 10,
    name: "group",
    discoveryCursor: { offset: 88 },
  });
  expect(pactAdapter.nextDiscoveryCursor?.(last)).toEqual({ offset: 0 });
  expect(pactAdapter.accountObjective?.(last)).toBe("Owner chosen objective");
  expect(object((object(first.discovery).players as Data[])[0]).agentActivity).toEqual({
    lastObservedAt: null,
    runActive: false,
  });
});
it("does not bypass an advertised shortlist failure or accept a mismatched own identity", async () => {
  const fake = game(["pact_kingdom_discover_v2", "pact_play_view_v1"], {}),
    original = fake.read;
  fake.read = vi.fn(async (tool, args) => {
    if (tool === "pact_kingdom_discover_v2") throw Error("AUTH_REQUIRED");
    return original(tool, args);
  });
  await expect(pactAdapter.initial(fake, "self")).rejects.toThrow("AUTH_REQUIRED");
  await expect(pactAdapter.initial(fake, "other-owner")).rejects.toThrow("IDENTITY_MISMATCH");
});

it("supplies the discovery input shape up front so a bounded two-decision turn can search then act", () => {
  const schema = {
    type: "object",
    properties: { noticeResource: { enum: ["grain", "iron", "silver"] } },
    additionalProperties: false,
  };
  expect(
    pactAdapter.suppliedReadSchemas?.([
      { name: "pact_kingdom_discover_v2", inputSchema: schema, annotations: { readOnlyHint: true } },
    ]),
  ).toEqual([{ name: "pact_kingdom_discover_v2", inputSchema: schema }]);
});
