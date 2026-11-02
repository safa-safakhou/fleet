import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "vitest";
import { builtinArchitectures } from "../../src/app/builtins.js";
import { createScopedServices, scopedOperationFor } from "../../src/app/host-services.js";
import { packPactObservation } from "../../src/games/pact/packing.js";
import { compileGenerationSchema } from "../../src/model-schema.js";
import { ResearchBroker } from "../../src/research/broker/server.js";
import { StepJournal } from "../../src/research/broker/steps.js";
import { canonical } from "../../src/research/contracts.js";
import { CaptureSession } from "../../src/research/evidence/boundaries.js";
import { ArtifactFilesystem } from "../../src/research/evidence/filesystem.js";
import { compileManifest } from "../../src/research/manifests/compiler.js";
import { ManifestRepository } from "../../src/research/manifests/repository.js";
import { TemporalTaskOwner } from "../../src/research/orchestration/outbox.js";
import { recipeDefaults } from "../../src/research/recipes/pact-reference.js";
import { runPactRecipe } from "../../src/research/recipes/runtime.js";
import { assertOwnedFixture } from "../architecture-fixture.js";
import { capability, manifestInput } from "../fixtures/research/manifest.js";
import corpus from "../fixtures/research/pact-reference.json" with { type: "json" };
import { platformFixture } from "../platform-helpers.js";

test.each([
  ["pact-research-advisory", "typescript-reference@1", "small"],
  ["pact-research-deliberative", "python-pydantic@1", "small"],
  ["pact-research-scripted", "typescript-reference@1", "small"],
  ["pact-research-advisory", "typescript-reference@1", "large-pact"],
  ["pact-research-advisory", "python-pydantic@1", "small"],
  ["pact-research-advisory", "typescript-reference@1", "invalid-advisory"],
])("explicitly enrolled recipe executes %s with %s (%s)", async (id, worker, scenario) => {
  await assertOwnedFixture(process.env.FLEET_TEST_DATABASE_URL ?? "", process.env.FLEET_ARCHITECTURE_NONCE ?? "");
  const f = await platformFixture(),
    root = await mkdtemp(join(tmpdir(), "frt-"));
  try {
    f.advance(Date.now() - f.now().getTime());
    await f.pool.query("UPDATE cohorts SET budget=budget||$2::jsonb WHERE id=$1", [
      f.group.id,
      JSON.stringify({ deadlineAt: new Date(Date.now() + 3600000).toISOString() }),
    ]);
    await f.store.setState(f.group.id, "paused", false);
    await f.pool.query("UPDATE cohorts SET model=model||$2::jsonb WHERE id=$1", [
      f.group.id,
      JSON.stringify({ temperature: 1, topP: 1 }),
    ]);
    await f.store.consent(f.group.id, true);
    const profile = { id, version: "1" },
      config = { ...recipeDefaults(id), worker, ...(id === "pact-research-advisory" ? { maxSteps: 1 } : {}) },
      definition = builtinArchitectures().resolve(profile);
    await f.tasks.enroll(f.group.id, profile);
    await f.pool.query("UPDATE cohort_engine_profiles SET architecture_config=$2 WHERE cohort_id=$1", [
      f.group.id,
      config,
    ]);
    const task = await f.enqueue(),
      input = manifestInput();
    input.profile = profile;
    input.environment.bindingId = task.bindingId;
    input.components = { worker, policy: config.policy };
    input.roles = [{ id: "main", authority: id === "pact-research-advisory" ? "advisory" : "actor" }];
    input.clock = { observationId: "pact.game-time-ms", deadlineId: "pact.game-time-ms", deadlineValue: "1000000" };
    input.context.policy = config.contextPolicy;
    if (scenario === "large-pact") {
      input.context.maxBytes = 24000;
      input.context.maxTokens = 6000;
    }
    input.memory.namespace = config.memoryNamespace;
    input.model = { route: "ollama", model: "fake-model", parameters: { maxOutputTokens: 100 } };
    input.limits = { calls: "3", tokens: "1000000", concurrency: 1 };
    const m = compileManifest(input, {
      ...capability,
      components: { worker: [worker], policy: [config.policy] },
      environment: { ...capability.environment, clockId: "pact.game-time-ms" },
      model: { ...capability.model, route: "ollama", model: "fake-model" },
    });
    await new ManifestRepository(f.pool).save(m.manifest);
    const capture = new CaptureSession(f.store, new ArtifactFilesystem(root));
    f.store.observation = capture;
    const broker = new ResearchBroker(f.store, f.tasks, capture);
    let calls = 0;
    const observation = {
      ...structuredClone(corpus.observation),
      observedAt: f.now().toISOString(),
      ...(scenario === "large-pact"
        ? {
            payload: {
              world: {
                paused: false,
                profile: { accountId: "synthetic-owner", kingdomId: "synthetic-kingdom" },
                balances: { iron: { ordinaryUnits: "9007199254740993600" } },
                authority: { allowedActions: ["world.read"], resources: { iron: "0" } },
              },
              guide: { developmentRules: { guidance: "Synthetic rule explanation. ".repeat(1200) } },
              agentBriefing: { construction: { guidance: "Synthetic derived guidance. ".repeat(300) } },
            },
          }
        : {}),
    };
    let failure: unknown;
    const h = f.host({
      ...(scenario === "large-pact" ? { tracksDispatch: true } : {}),
      decide: async (request) => {
        if (id === "pact-research-advisory") {
          const validate = compileGenerationSchema(request.schema);
          expect(validate(corpus.replies[1].decision)).toBe(true);
          expect(validate(corpus.replies[0].decision)).toBe(false);
          expect(validate({ ...corpus.replies[1].decision, sourceRefs: ["invented:source"] })).toBe(false);
          expect(
            request.messages.some(
              (m) => m.role === "system" && m.content.includes("advisory") && m.content.includes("one"),
            ),
          ).toBe(true);
        }
        if (scenario === "large-pact") {
          expect(
            Buffer.byteLength(
              canonical({
                messages: request.messages,
                schema: request.schema,
                maxOutputTokens: request.maxOutputTokens,
                purpose: "decision",
              }),
            ),
          ).toBeLessThanOrEqual(24000);
          expect(JSON.stringify(request.messages)).toContain("9007199254740993600");
          await request.onEvidence?.({
            kind: "prepared",
            body: { messages: request.messages, format: request.schema },
          });
          await request.onDispatch?.();
        }
        calls++;
        return {
          decision: corpus.replies[scenario === "invalid-advisory" ? 0 : 1].decision,
          inputTokens: 7,
          outputTokens: 8,
        };
      },
    });
    const owner = new TemporalTaskOwner(f.store, f.tasks, { send: async () => {} }, async (claim) => {
      const scope = await new StepJournal(f.store, f.tasks).open(
        claim,
        `task:${claim.taskId}`,
        `task:${claim.taskId}`,
        m.digest,
      );
      const context = {
        claim,
        binding: await f.bindings.get(claim.bindingId),
        task: await f.tasks.get(claim.taskId),
        observation,
        model: h.admission,
        commands: h.commands,
        observe: async () => observation,
        packObservation: packPactObservation,
        eventRefs: ["fixture:stock"],
        signal: new AbortController().signal,
        schemas: { observations: ["pact.observation.v1"], actions: ["pact.action.v1"] },
        capabilities: {
          ...f.board.adapter.capabilities,
          coordination: true,
          nativeIdempotency: true,
          outcomeLookup: true,
        },
        instructions: "Synthetic PACT only",
        catalog: async () => [],
      };
      const services = await createScopedServices(claim, definition, undefined, {
        context,
        store: f.store,
        tasks: f.tasks,
        bindings: f.bindings,
        model: h.admission,
        commands: h.commands,
      });
      try {
        await capture.withScope(scope, () =>
          runPactRecipe(id, broker, scope, services, scopedOperationFor(services), {
            mode: "native-development",
            executable: resolve("workers/research/.venv/bin/python"),
          }),
        );
        await capture.withScope(scope, () =>
          runPactRecipe(id, broker, scope, services, scopedOperationFor(services), {
            mode: "native-development",
            executable: resolve("workers/research/.venv/bin/python"),
          }),
        );
      } catch (error) {
        failure = error;
        throw error;
      } finally {
        await f.store.finish(claim.turn, "WAIT");
      }
    });
    await f.store.setState(f.group.id, "running", true);
    expect(await f.tasks.claim("ordinary-before-enrollment", f.now(), task.id)).toBeNull();
    expect((await f.pool.query("SELECT count(*)::int n FROM turns")).rows[0].n).toBe(0);
    await f.store.setState(f.group.id, "paused", false);
    await owner.enroll(task.id, m.digest);
    await f.store.setState(f.group.id, "running", true);
    const ref = await owner.reference(
      (await f.pool.query("SELECT id FROM research_task_outbox WHERE kind='wake'")).rows[0].id,
    );
    await owner.execute(ref);
    if (scenario === "invalid-advisory") {
      expect(failure).toMatchObject({ code: "PROPOSAL_CONTRACT_INVALID" });
      expect(calls).toBe(1);
      expect((await f.pool.query("SELECT status FROM compute_ledger")).rows).toEqual([{ status: "reported" }]);
      expect(f.board.executions).toBe(0);
      return;
    }
    expect(failure).toBeUndefined();
    expect((await owner.inspect(ref)).phase).toBe("completed");
    expect((await f.pool.query("SELECT count(*)::int n FROM research_worker_checkpoints")).rows[0].n).toBe(1);
    expect(calls).toBe(id === "pact-research-scripted" ? 0 : 1);
    expect(f.board.executions).toBe(0);
    if (scenario === "large-pact") {
      expect(Buffer.byteLength(JSON.stringify(observation))).toBeGreaterThan(24000);
      const rows = (await f.pool.query("SELECT event FROM research_events WHERE event->>'kind'='context.prepared'"))
        .rows;
      expect(rows.length).toBeGreaterThan(0);
      expect((await f.pool.query("SELECT status FROM compute_ledger")).rows).toEqual([{ status: "reported" }]);
      await capture.artifacts.materialize(1000);
      let sourceRetained = false;
      for (const { event } of (await f.pool.query("SELECT event FROM research_events")).rows) {
        for (const ref of event.artifacts ?? []) {
          const chunks = [];
          for await (const chunk of capture.artifacts.read(event.scope, ref)) chunks.push(Buffer.from(chunk));
          const body = JSON.parse(Buffer.concat(chunks).toString());
          if (body.observation && canonical(body.observation) === canonical(observation)) sourceRetained = true;
        }
      }
      expect(sourceRetained).toBe(true);
    }
    expect((await f.pool.query("SELECT capture_failed FROM research_runs")).rows.every((r) => !r.capture_failed)).toBe(
      true,
    );
  } finally {
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  }
});
