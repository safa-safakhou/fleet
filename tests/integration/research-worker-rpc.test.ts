import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import { builtinArchitectures } from "../../src/app/builtins.js";
import { createScopedServices } from "../../src/app/host-services.js";
import { compileGenerationSchema } from "../../src/model-schema.js";
import { ResearchBroker } from "../../src/research/broker/server.js";
import { StepJournal } from "../../src/research/broker/steps.js";
import { serveBroker } from "../../src/research/broker/transport.js";
import { CaptureSession } from "../../src/research/evidence/boundaries.js";
import { ArtifactFilesystem } from "../../src/research/evidence/filesystem.js";
import { compileManifest } from "../../src/research/manifests/compiler.js";
import { ManifestRepository } from "../../src/research/manifests/repository.js";
import { runPythonWorker } from "../../src/research/workers/python.js";
import { assertOwnedFixture } from "../architecture-fixture.js";
import { capability, manifestInput } from "../fixtures/research/manifest.js";
import { platformFixture } from "../platform-helpers.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});
test.each(["native", "python"])("broker_is_the_only_effect_path (%s)", async (mode) => {
  await assertOwnedFixture(process.env.FLEET_TEST_DATABASE_URL ?? "", process.env.FLEET_ARCHITECTURE_NONCE ?? "");
  const f = await platformFixture(),
    root = await mkdtemp(join(tmpdir(), "fleet-broker-"));
  cleanup = async () => {
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  };
  await f.pool.query("UPDATE cohorts SET model=model||$2::jsonb WHERE id=$1", [
    f.group.id,
    JSON.stringify({ temperature: 1, topP: 1 }),
  ]);
  await f.store.consent(f.group.id, true);
  await f.enqueue();
  const claim = await f.claim();
  const input = manifestInput();
  input.environment.bindingId = claim.bindingId;
  input.profile = claim.profile;
  input.limits = { calls: "3", tokens: "1000000", concurrency: 1 };
  input.roles = [
    { id: "actor", authority: "actor" },
    { id: "helper", authority: "advisory" },
  ];
  input.model = { route: "ollama", model: "fake-model", parameters: { maxOutputTokens: 100 } };
  const m = compileManifest(input, {
    ...capability,
    model: { ...capability.model, route: "ollama", model: "fake-model" },
  });
  await new ManifestRepository(f.pool).save(m.manifest);
  const capture = new CaptureSession(f.store, new ArtifactFilesystem(root));
  f.store.observation = capture;
  const scope = await new StepJournal(f.store, f.tasks).open(claim, "broker-run", "broker-op", m.digest),
    broker = new ResearchBroker(f.store, f.tasks, capture);
  let providerCalls = 0;
  let deliveredRefs = ["fixture:source"];
  const h = f.host(
    {
      decide: async (request) => {
        providerCalls++;
        if (mode === "python" && providerCalls > 1) {
          for (const message of request.messages) {
            try {
              const value = JSON.parse(message.content);
              if (Array.isArray(value.value?.sourceRefs)) deliveredRefs = value.value.sourceRefs;
            } catch {
              /* Prompt prose is not a tool result. */
            }
          }
          expect(deliveredRefs).not.toEqual(["fixture:source"]);
        }
        const decision =
          mode === "python" && providerCalls === 1
            ? {
                kind: "read",
                payload: { tool: "look", arguments: {} },
                sourceRefs: ["fixture:source"],
                preconditions: {},
              }
            : {
                kind: "advisory",
                payload: { text: "synthetic" },
                sourceRefs: deliveredRefs,
                preconditions: {},
              };
        expect(compileGenerationSchema(request.schema)(decision)).toBe(true);
        expect(request.messages.every((message) => message.role !== "tool")).toBe(true);
        return {
          decision,
          inputTokens: 7,
          outputTokens: 8,
        };
      },
    },
    async (ctx) => {
      const definition = {
        ...builtinArchitectures().resolve({ id: "reactive-basic", version: "1" }),
        manifest: {
          ...builtinArchitectures().resolve({ id: "reactive-basic", version: "1" }).manifest,
          ref: claim.profile,
        },
      };
      const services = await createScopedServices(claim, definition, undefined, {
        context: ctx,
        store: f.store,
        tasks: f.tasks,
        bindings: f.bindings,
        model: h.admission,
        commands: h.commands,
      });
      await expect(
        broker.open(
          scope,
          {
            ...services,
            configuration: { ...services.configuration, model: { ...services.configuration.model, temperature: 0 } },
          },
          "actor",
          ctx.signal,
        ),
      ).rejects.toThrow("CAPABILITY_CHANGED");
      const auth = await broker.open(scope, services, "actor", ctx.signal, {
          ...ctx.observation,
          sourceRefs: ["fixture:source"],
        }),
        session = await broker.authenticate(auth.token),
        key = { operationId: scope.operationId, operationEpoch: scope.operationEpoch, logicalStepId: "model:1" };
      const request = {
        messages: [{ role: "user" as const, content: "Only synthetic observations." }],
        schema: { type: "object" },
        maxOutputTokens: 100,
        purpose: "decision" as const,
      };
      if (mode === "python") {
        const ipc = join(root, "ipc");
        await mkdir(ipc, { mode: 0o700 });
        const transport = await serveBroker(broker, join(ipc, "broker.sock"));
        try {
          const result = await runPythonWorker(
            { mode: "native-development", executable: resolve("workers/research/.venv/bin/python") },
            {
              socket: transport.socket,
              token: auth.token,
              input: {
                protocolVersion: 1,
                scope,
                workerVersion: "fixture@1",
                policyVersion: "fixture@1",
                roleId: "actor",
                instructions: "Synthetic only",
                observationJson: "{}",
                maxSteps: 2,
                deadlineUtc: new Date(Date.now() + 30000).toISOString(),
              },
            },
            ctx.signal,
          );
          expect(result).toMatchObject({ protocolVersion: 1, status: "proposed", sourceRefs: deliveredRefs });
          expect(await broker.loadCheckpoint(session, scope)).toMatchObject({
            version: "1",
            state: { terminal: { sourceRefs: deliveredRefs } },
          });
        } finally {
          await transport.close();
        }
        return;
      }
      const result = await broker.requestModel(session, scope, key, request);
      expect(result.status).toBe("completed");
      expect(result.usage).toEqual({ inputTokens: "7", outputTokens: "8" });
      expect(await broker.requestModel(session, scope, key, request)).toEqual(result);
      await expect(
        broker.requestModel(session, { ...scope, agentId: "forged" }, { ...key, logicalStepId: "forged" }, request),
      ).rejects.toThrow("OPERATION_SCOPE_MISMATCH");
      await expect(
        broker.readGame(session, scope, { ...key, logicalStepId: "bad-tool" }, { tool: "unknown", arguments: {} }),
      ).rejects.toThrow("TOOL_UNSUPPORTED");
      await expect(
        broker.requestModel(session, scope, { ...key, logicalStepId: "override" }, {
          ...request,
          usage: { inputTokens: 0 },
        } as never),
      ).rejects.toThrow();
      const helperAuth = await broker.open(scope, services, "helper", ctx.signal),
        helper = await broker.authenticate(helperAuth.token);
      await expect(
        broker.proposeAction(
          helper,
          scope,
          { ...key, logicalStepId: "helper-action" },
          {
            kind: "action",
            payload: { schemaId: "board.move.v1", payload: { to: "a4" } },
            sourceRefs: ["fixture:source"],
            preconditions: {},
          },
        ),
      ).rejects.toThrow("AUTHORITY_DENIED");
      const cp = await broker.checkpoint(session, scope, "0", {
        workerVersion: "fixture@1",
        policyVersion: "fixture@1",
        steps: [{ logicalStepId: key.logicalStepId, operationEpoch: key.operationEpoch, resultRef: result.resultRef }],
        sourceRefs: ["fixture:source"],
        state: { phase: "proposed" },
      });
      expect(cp.version).toBe("1");
      await expect(
        broker.checkpoint(session, scope, "0", {
          workerVersion: "fixture@1",
          policyVersion: "fixture@1",
          steps: [],
          sourceRefs: [],
          state: { phase: "changed" },
        }),
      ).rejects.toThrow("CHECKPOINT_CONFLICT");
      await broker.stop(auth.sessionId);
      await expect(broker.lookup(session, scope, key)).rejects.toThrow("WORKER_SESSION_FENCED");
    },
  );
  await capture.withScope(scope, () => h.host.run(claim));
  expect(providerCalls).toBe(mode === "python" ? 2 : 1);
  expect((await f.pool.query("SELECT status FROM compute_ledger")).rows).toEqual(
    Array.from({ length: mode === "python" ? 2 : 1 }, () => ({ status: "reported" })),
  );
  expect(f.board.executions).toBe(0);
});
