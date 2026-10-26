import { readFileSync } from "node:fs";
import { afterEach, expect, it } from "vitest";
import { builtinArchitectures } from "../../src/app/builtins.js";
import { createScopedServices, scopedOperationFor } from "../../src/app/host-services.js";
import { ReactiveEngine } from "../../src/engines/reactive/engine.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { PactCoordination } from "../../src/games/pact/coordination.js";
import { pactActionBasis, pactWaitSchema, validatePactWait } from "../../src/games/pact/goal-state.js";
import { packPactObservation } from "../../src/games/pact/packing.js";
import { pactActionContracts } from "../../src/games/pact/proposals.js";
import { platformFixture } from "../platform-helpers.js";

let end: (() => Promise<void>) | undefined;
afterEach(async () => end?.());
it("fits a native PACT initial turn through the actual scoped host", async () => {
  const packet = JSON.parse(readFileSync("tests/fixtures/pact-initial-packing.json", "utf8"));
  const f = await platformFixture();
  end = () => f.pool.end();
  await f.pool.query("update cohorts set budget=$2 where id=$1", [
    f.group.id,
    { ...(await f.store.cohort(f.group.id)).budget, inputByteLimit: 32000 },
  ]);
  await f.store.consent(f.group.id, true);
  await f.enqueue();
  const claim = await f.claim();
  let calls = 0;
  const h = f.host(
    {
      decide: async () => {
        calls++;
        return {
          decision: {
            kind: "wait",
            summary: "Offline packing check",
            basis: {
              ...pactActionBasis(packet.observation.payload),
              deferral: {
                reason: "deliberate_pacing",
                explanation: "This synthetic check measures input composition only.",
                reconsiderWhen: "Next synthetic task.",
              },
            },
          },
          inputTokens: 1,
          outputTokens: 1,
        };
      },
    },
    async (ctx) => {
      ctx.observation = packet.observation;
      ctx.schemas = { observations: ["pact.observation.v1"], actions: ["pact.action.v1"] };
      ctx.instructions = pactAdapter.instructions;
      ctx.accountObjective = (o) => pactAdapter.accountObjective?.(o.payload);
      ctx.catalog = async () => packet.catalog;
      ctx.packObservation = packPactObservation;
      ctx.actionContracts = async (o) => pactActionContracts(o.payload);
      ctx.waitSchema = async (o) => pactWaitSchema(o.payload);
      ctx.validateWait = async (basis, o) => validatePactWait(basis, o.payload);
      const base = builtinArchitectures().resolve({ id: "reactive-basic", version: "1" }),
        definition = { ...base, manifest: { ...base.manifest, ref: ctx.claim.profile } };
      const services = await createScopedServices(
        ctx.claim,
        definition,
        { decisionGrounding: new PactCoordination(ctx.binding, {} as never, f.now).grounding } as never,
        {
          context: ctx,
          store: f.store,
          tasks: f.tasks,
          bindings: f.bindings,
          model: h.admission,
          commands: h.commands,
        },
      );
      await new ReactiveEngine().create(services).run(scopedOperationFor(services));
    },
  );
  await h.host.run(claim);
  expect(calls).toBe(1);
});
