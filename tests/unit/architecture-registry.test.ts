import { expect, it } from "vitest";
import { builtinArchitectures } from "../../src/app/builtins.js";
import { type ArchitectureDefinition, ArchitectureRegistry } from "../../src/platform/architecture.js";
import { profileRequirements } from "../../src/qualification.js";

const fixture = (version = "1"): ArchitectureDefinition => ({
  manifest: {
    ref: { id: "fixture", version },
    name: "Fixture",
    description: "Synthetic architecture",
    schemaVersion: "fleet.architecture-manifest.v1",
    configSchema: {
      type: "object",
      properties: { steps: { type: "integer", minimum: 1, maximum: 3 } },
      required: ["steps"],
      additionalProperties: false,
    },
    defaults: { steps: 1 },
    presets: [],
    requirements: { capabilities: {} },
    triggers: ["periodic"],
    executionModes: ["serial"],
    observationOwner: "host",
    modules: [],
    stateCodecs: [],
    skillModes: ["off"],
    form: { fields: [] },
  },
  validate: () => [],
  create: () => ({ route: () => [], run: async () => {} }),
});
it("resolves exact versions without falling back or accepting duplicates", () => {
  const registry = new ArchitectureRegistry();
  registry.register(fixture());
  registry.register(fixture("2"));
  expect(registry.resolve({ id: "fixture", version: "2" }).manifest.ref.version).toBe("2");
  expect(() => registry.resolve({ id: "fixture", version: "3" })).toThrow("UNSUPPORTED_ARCHITECTURE");
  expect(() => registry.register(fixture())).toThrow("DUPLICATE_ARCHITECTURE");
  expect(registry.list()).toHaveLength(2);
});
it("enforces declarative config before trusted validation without loading executable user config", () => {
  const registry = new ArchitectureRegistry([fixture()]);
  expect(registry.validate({ id: "fixture", version: "1" }, { steps: 2 }, {})).toEqual([]);
  for (const config of [{ steps: 0 }, { steps: "2" }, { steps: 4 }, { steps: 1, create: "uploaded code" }])
    expect(registry.validate({ id: "fixture", version: "1" }, config, {}).length).toBeGreaterThan(0);
  expect(() =>
    registry.register({ ...fixture("3"), manifest: { ...fixture("3").manifest, configSchema: { type: "invalid" } } }),
  ).toThrow("INVALID_ARCHITECTURE_SCHEMA");
});
it("publishes immutable metadata without exposing factories and refuses malformed manifests", () => {
  const definition = fixture(),
    registry = new ArchitectureRegistry([definition]);
  definition.manifest.name = "changed after registration";
  expect(registry.list()[0]?.name).toBe("Fixture");
  expect(JSON.stringify(registry.list())).not.toContain("create");
  expect(() =>
    registry.register({ ...fixture("2"), manifest: { ...fixture("2").manifest, triggers: ["uploaded" as never] } }),
  ).toThrow("INVALID_ARCHITECTURE_MANIFEST");
});
it("preserves all five existing requirements and exact unsupported versions without making connections", () => {
  const r = builtinArchitectures();
  expect([...new Set(r.list().map((m) => m.ref.id))].sort()).toEqual(
    [
      "legacy-loop",
      "legacy-cognition",
      "reactive-basic",
      "reactive-cognition",
      "specialist-coordinator",
      "autonomous-specialists",
    ].sort(),
  );
  expect(
    r
      .list()
      .filter((m) => m.ref.id === "reactive-cognition")
      .map((m) => m.ref.version),
  ).toEqual(["1", "2"]);
  const expected = [
    [
      "legacy-loop",
      {
        capabilities: { timing: ["realtime"] },
        schemas: { observations: ["pact.observation.v1"], actions: ["pact.action.v1"] },
      },
    ],
    [
      "legacy-cognition",
      {
        capabilities: { timing: ["realtime"] },
        schemas: { observations: ["pact.observation.v1"], actions: ["pact.action.v1"] },
      },
    ],
    ["reactive-basic", { capabilities: { eventDelivery: ["native", "poll"] } }],
    ["reactive-cognition", { capabilities: { eventDelivery: ["native", "poll"], continuity: true } }],
    ["specialist-coordinator", { capabilities: { continuity: true, coordination: true } }],
  ] as const;
  for (const [id, requirements] of expected) expect(profileRequirements({ id, version: "1" })).toEqual(requirements);
  expect(profileRequirements({ id: "reactive-cognition", version: "2" })).toEqual({
    capabilities: { continuity: true },
  });
  expect(profileRequirements({ id: "reactive-cognition", version: "3" })).toBeUndefined();
  expect(r.validate({ id: "reactive-basic", version: "1" }, { code: "uploaded" }, {}).length).toBeGreaterThan(0);
});
