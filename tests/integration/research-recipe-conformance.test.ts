import { execFileSync } from "node:child_process";
import { expect, test, vi } from "vitest";
import { builtinArchitectures } from "../../src/app/builtins.js";
import { validateBrokerAction } from "../../src/research/broker/game.js";
import { validateCompatibility } from "../../src/research/manifests/compiler.js";
import { recipeDefaults, recipeIds } from "../../src/research/recipes/pact-reference.js";
import { existingSpecialistBridge } from "../../src/research/recipes/specialist-bridge.js";
import { runReferenceWorker } from "../../src/research/workers/reference.js";
import { fieldProblem } from "../../web/architecture-fields.js";
import { capability, manifestInput } from "../fixtures/research/manifest.js";
import corpus from "../fixtures/research/pact-reference.json" with { type: "json" };

test("same_contract_different_worker preserves recorded proposals, reads and source refs", async () => {
  let count = 0;
  const reads: any[] = [],
    proposals: any[] = [];
  const result = await runReferenceWorker(
    {
      steps: [],
      model: async () => structuredClone(corpus.replies[count++]),
      read: async (tool, args) => {
        reads.push({ tool, arguments: args });
        return corpus.observation;
      },
      propose: async (proposal) => {
        proposals.push(proposal);
        return { id: "fixture:proposal", kind: "proposal" };
      },
      checkpoint: async () => ({ id: "fixture:checkpoint", version: "1" }),
    },
    {
      instructions: "Supplied PACT evidence only",
      observation: corpus.observation,
      maxSteps: 4,
      workerVersion: "fixture@1",
      policyVersion: "pact-reference@1",
    },
  );
  const python = JSON.parse(
    execFileSync("workers/research/.venv/bin/python", ["workers/research/tests/conformance_fixture.py"], {
      input: JSON.stringify(corpus),
      encoding: "utf8",
    }),
  );
  expect(python).toEqual({ result, calls: count, reads, proposals });
});
test("draft recipes expose only validated experimental combinations and cannot start from registry defaults", async () => {
  const registry = builtinArchitectures();
  for (const id of recipeIds) {
    const def = registry.resolve({ id, version: "1" });
    expect(def.manifest.name).toContain("experimental");
    expect(fieldProblem(def.manifest.configSchema)).toBeNull();
    expect(registry.validate({ id, version: "1" }, recipeDefaults(id), {})).toEqual([]);
    await expect(def.create({} as never).run({} as never)).rejects.toThrow("RESEARCH_RUNTIME_DISABLED");
  }
  const input = manifestInput();
  input.profile = { id: "pact-research-advisory", version: "1" };
  expect(validateCompatibility(input, capability)).toContainEqual({
    code: "RECIPE_COMPONENT_INCOMPATIBLE",
    path: "/roles",
  });
  expect(
    registry.validate(
      { id: "pact-research-scripted", version: "1" },
      { ...recipeDefaults("pact-research-scripted"), worker: "python-pydantic@1" },
      {},
    ),
  ).not.toEqual([]);
});
test("broker preserves native PACT economic refusal before command preparation", async () => {
  const validate = vi.fn(async (_proposal: any, _observation: any) => ({
      valid: false,
      code: "OBSERVED_INSUFFICIENT_STOCK",
    })),
    submit = vi.fn();
  const services = {
    environment: { schemas: { actions: ["pact.action.v1"] }, validateProposal: validate },
    actions: { submit },
  } as any;
  const observation = {
    ...corpus.observation,
    coordination: {
      evidenceFrameRef: "frame:1",
      focuses: [
        {
          observation: {
            options: [
              {
                payload: { kind: "queue_build" },
                sourceRefs: ["fixture:stock"],
                claims: [{ kind: "resource", schemaId: "native", key: "wood", units: "10" }],
                expectedOutcome: { basis: { native: true } },
              },
            ],
          },
        },
      ],
    },
  } as any;
  await expect(
    validateBrokerAction(
      services,
      observation,
      "task:fixture",
      {
        commandId: "command:fixture",
        bindingId: "binding:fixture",
        schemaId: "pact.action.v1",
        expectedVersion: "r1",
        payload: { kind: "queue_build" },
      },
      { kind: "action", payload: {}, sourceRefs: ["fixture:stock"], preconditions: {} },
    ),
  ).rejects.toThrow("OBSERVED_INSUFFICIENT_STOCK");
  expect(validate.mock.calls[0][0].claims).toEqual(observation.coordination.focuses[0].observation.options[0].claims);
  expect(submit).not.toHaveBeenCalled();
});
test("specialist bridge preserves original runtime authority and rejects changed profile identity", async () => {
  const run = vi.fn(async () => {}),
    services = { participants: {}, state: {} } as never,
    registry = { resolve: vi.fn(() => ({ create: vi.fn(() => ({ route: () => [], run })) })) } as any,
    ref = { id: "specialist-coordinator", version: "1" };
  const bridge = existingSpecialistBridge(registry, ref, services),
    operation = { profile: ref } as any;
  await bridge.run(operation);
  expect(run).toHaveBeenCalledWith(operation);
  await expect(bridge.run({ profile: { id: "pact-research-advisory", version: "1" } } as any)).rejects.toThrow(
    "PROFILE_CONFIGURATION_MISMATCH",
  );
});

test("recipe preview seals selected components without widening advisory authority", async () => {
  const { compileRecipeManifest } = await import("../../src/research/manifests/architecture-adapter.js");
  const input = manifestInput();
  input.profile = { id: "pact-research-advisory", version: "1" };
  input.roles = [{ id: "helper", authority: "advisory" }];
  input.clock = { observationId: "pact.game-time-ms", deadlineId: "pact.game-time-ms", deadlineValue: "10000" };
  const cap = {
    ...capability,
    components: { worker: ["typescript-reference@1", "python-pydantic@1"], policy: ["pact-reference@1"] },
    environment: { ...capability.environment, clockId: "pact.game-time-ms" },
  };
  const result = compileRecipeManifest(
    input,
    { ...recipeDefaults(input.profile.id), worker: "python-pydantic@1" },
    cap,
  );
  expect(result.manifest.components).toEqual({ worker: "python-pydantic@1", policy: "pact-reference@1" });
  expect(result.manifest.roles).toEqual([{ id: "helper", authority: "advisory" }]);
  expect(result.manifest.status).toBe("experimental");
  expect(input.components).toEqual({ worker: "fixture@1" });
});

test("replacement action proposals preserve real PACT quotes, original receipts and one committed effect", async () => {
  const { randomUUID } = await import("node:crypto"),
    { PactCoordination } = await import("../../src/games/pact/coordination.js");
  const { DecisionSupportReader } = await import("../../../pact/packages/application/src/decision-support.js"),
    { actionEffectsFixture } = await import("../../../pact/tests/fixtures/action-effects.js");
  const f = await actionEffectsFixture();
  try {
    const owner = await f.owner(),
      binding = {
        id: randomUUID(),
        accountRef: owner.accountId,
        actorRef: owner.accountId,
        entityRef: owner.kingdomId,
        environment: { id: "pact", version: "1", instanceId: "owned-fixture" },
      };
    let original: any;
    const game = {
      open: async () => {},
      read: async () => new DecisionSupportReader(f.views).read(owner.accountId),
      effects: async (command: any) => f.effects.quote(owner.principal, command),
      submitGuarded: async (command: any, guard: any) => {
        original = { command, guard };
        return f.dispatcher.dispatchGuarded(owner.principal, original);
      },
    } as any;
    const policy = new PactCoordination(binding, game, () => new Date()),
      view = await policy.observe({
        ...corpus.observation,
        observedAt: new Date().toISOString(),
        revision: "unquoted",
        environmentTime: { clockId: "pact.game-time-ms", value: "0" },
        sourceRefs: [],
        payload: { world: { profile: { kingdomId: owner.kingdomId } } },
      }),
      focus = view.coordination!.focuses.find((x) => x.id === "game.building.queue")!,
      option = (focus.observation.options as any[])[0];
    const proposal = {
        kind: "action" as const,
        payload: { schemaId: "pact.action.v1", payload: option.payload },
        sourceRefs: option.sourceRefs,
        preconditions: {
          revision: view.revision,
          clockId: view.environmentTime.clockId,
          clockValue: view.environmentTime.value,
        },
      },
      data = {
        ...corpus,
        observation: view,
        replies: [{ decision: proposal, usage: { inputTokens: "7", outputTokens: "8" } }],
      };
    const python = JSON.parse(
      execFileSync("workers/research/.venv/bin/python", ["workers/research/tests/conformance_fixture.py"], {
        input: JSON.stringify(data),
        encoding: "utf8",
      }),
    );
    const proposals: any[] = [];
    await runReferenceWorker(
      {
        steps: [],
        model: async () => data.replies[0],
        read: async () => view,
        propose: async (p) => {
          proposals.push(p);
          return { id: "fixture:proposal", kind: "proposal" };
        },
        checkpoint: async () => ({ id: "fixture:checkpoint", version: "1" }),
      },
      {
        instructions: "Supplied PACT evidence only",
        observation: view,
        maxSteps: 1,
        workerVersion: "fixture@1",
        policyVersion: "pact-reference@1",
      },
    );
    expect(proposals).toEqual(python.proposals);
    const commandId = randomUUID(),
      services = {
        environment: {
          schemas: { actions: ["pact.action.v1"] },
          validateProposal: (p: any, o: any) => policy.validate(p, o),
        },
      } as any;
    const p = proposals[0];
    const intent = await validateBrokerAction(
      services,
      view,
      "fixture:task",
      {
        commandId,
        bindingId: binding.id,
        schemaId: "pact.action.v1",
        expectedVersion: view.revision,
        payload: p.payload.payload,
      },
      p,
    );
    const receipt = await policy.execute(intent);
    expect(receipt).toMatchObject({ commandId, code: expect.stringMatching(/COMMITTED/) });
    // A replacement consumes the original command receipt, never revalidates stale quotes as a new action.
    expect(await f.dispatcher.dispatchGuarded(owner.principal, original)).toMatchObject({
      commandId,
      code: expect.stringMatching(/COMMITTED/),
    });
    expect(
      (await f.pool.query("SELECT count(*)::int n FROM building_instructions WHERE kingdom_id=$1", [owner.kingdomId]))
        .rows[0].n,
    ).toBe(1);
  } finally {
    await f.close();
  }
});
