import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { builtinArchitectures } from "../../../src/app/builtins.js";
import { createScopedServices } from "../../../src/app/host-services.js";
import { ResearchBroker } from "../../../src/research/broker/server.js";
import { serveBroker } from "../../../src/research/broker/transport.js";
import { digest } from "../../../src/research/contracts.js";
import { EvaluationBroker } from "../../../src/research/evaluation/broker.js";
import type { DatasetCase } from "../../../src/research/evaluation/datasets.js";
import { EvaluationRPCClient } from "../../../src/research/evaluation/rpc-client.js";
import { RunInspection } from "../../../src/research/evidence/inspection.js";
import { compileManifest } from "../../../src/research/manifests/compiler.js";
import { ManifestRepository } from "../../../src/research/manifests/repository.js";
import { capability, manifestInput } from "./manifest.js";
import { memoryFixture } from "./memory.js";

type Dataset = {
  manifest: { id: string; records: { id: string; split: string }[] };
  train: DatasetCase[];
  development: DatasetCase[];
  heldout?: DatasetCase[];
};
export async function withEvaluationFixture<T>(
  dataset: Dataset,
  work: (runtime: any) => Promise<T>,
  options: {
    split?: "development" | "train-development" | "heldout";
    maxCalls?: number;
    totalCalls?: number;
    candidates?: string[];
    corruptCandidates?: string[];
  } = {},
) {
  const split = options.split ?? "development",
    maxCalls = options.maxCalls ?? 3,
    candidates = options.candidates ?? ["reference", "corrupt"],
    datasetDigest = digest(dataset.manifest);
  const f = await memoryFixture(false, { evaluation: { datasetDigest, split, maxCalls } }),
    directory = await mkdtemp(join(tmpdir(), "fleet-evaluation-"));
  f.store.observation = f.capture;
  const sessionHash = randomUUID();
  await f.pool.query("INSERT INTO operator_sessions VALUES($1,$2,'fixture')", [
    sessionHash,
    new Date(f.now().getTime() + 86400000),
  ]);
  const inspection = new RunInspection(f.store, f.capture.artifacts),
    principal = { sessionHash };
  const sources = new Map([...dataset.train, ...dataset.development, ...(dataset.heldout ?? [])].map((c) => [c.id, c]));
  const model = {
    tracksDispatch: true,
    decide: async (request: any) => {
      await request.onEvidence?.({ kind: "prepared", body: { messages: request.messages, format: request.schema } });
      await request.onDispatch?.();
      const meta = JSON.parse(request.messages[0].content).fleetEvaluation,
        c = sources.get(meta.caseId);
      if (!c) throw Error("FIXTURE_CASE_UNAVAILABLE");
      const output =
        meta.candidateId === "corrupt" || options.corruptCandidates?.includes(meta.candidateId)
          ? {
              success: true,
              kind: "action",
              payload: { completed: true },
              sourceRefs: ["foreign:private"],
              preconditions: {},
            }
          : c.recordedOutput;
      return {
        decision: meta.format === "dspy" ? { answer: JSON.stringify(output) } : output,
        inputTokens: 7,
        outputTokens: 8,
      };
    },
  };
  const controllers = new Map<string, EvaluationBroker>(),
    broker = new ResearchBroker(f.store, f.tasks, f.capture, undefined, undefined, (session, scope, key, input) => {
      const control = controllers.get(scope.operationId);
      if (!control) throw Error("EVALUATION_SCOPE_REQUIRED");
      return control.dispatch(session, scope, key, input);
    });
  const server = await serveBroker(broker, join(directory, "broker.sock")),
    runtimes: any[] = [];
  let sharedBudgetId: string | undefined;
  let sharedBudgetCap = options.totalCalls ?? maxCalls;
  const run = async (
    claim: any,
    scope: any,
    selected: Dataset,
    phaseSplit: string,
    limit: number,
    callback: (runtime: any) => Promise<any>,
  ) => {
    const h = f.host(model, async (ctx) => {
      const original = builtinArchitectures().resolve({ id: "reactive-basic", version: "1" }),
        services = await createScopedServices(
          claim,
          { ...original, manifest: { ...original.manifest, ref: claim.profile } },
          undefined,
          {
            context: ctx,
            store: f.store,
            tasks: f.tasks,
            bindings: f.bindings,
            model: h.admission,
            commands: h.commands,
          },
        );
      const auth = await broker.open(scope, services, "evaluator", ctx.signal, ctx.observation),
        session = await broker.authenticate(auth.token);
      const control = await EvaluationBroker.install(broker, scope, {
        datasetId: selected.manifest.id,
        datasetDigest: digest(selected.manifest),
        mode: "offline",
        split: phaseSplit as any,
        maxCalls: limit,
        totalCalls: sharedBudgetCap,
        ...(sharedBudgetId ? { budgetId: sharedBudgetId } : {}),
        cases: [...selected.train, ...selected.development, ...(selected.heldout ?? [])].map((c) => ({
          id: c.id,
          split: c.split,
        })),
        candidates,
      });
      sharedBudgetId = control.grant.budgetId;
      controllers.set(scope.operationId, control);
      const client = new EvaluationRPCClient(join(directory, "broker.sock"), auth.token, scope);
      const runtime = {
        f,
        broker,
        control,
        client,
        scope,
        session,
        token: auth.token,
        socket: join(directory, "broker.sock"),
        inspection,
        principal,
        dataset: selected,
      };
      runtimes.push(runtime);
      try {
        result = await callback(runtime);
      } finally {
        client.close();
        broker.stop(auth.sessionId);
      }
    });
    let result: any;
    await f.capture.withScope(scope, () => h.host.run(claim));
    return result;
  };
  const prepare = async (selected: Dataset, limit: number, phaseSplit = "development", separateBudget = false) => {
    const group = await f.cohort(1);
    await f.pool.query("UPDATE cohorts SET model=model||$2::jsonb,budget=budget||$3::jsonb WHERE id=$1", [
      group.id,
      JSON.stringify({ temperature: 1, topP: 1 }),
      JSON.stringify({ maxCallsPerTurn: 3 }),
    ]);
    await f.store.consent(group.id, true);
    await f.enqueue(group.bindings[0], "eval-heldout", `source:${randomUUID()}`);
    const input = manifestInput();
    input.profile = f.claim.profile;
    input.environment.bindingId = group.bindings[0].id;
    input.model = f.manifest.model;
    input.roles = [{ id: "evaluator", authority: "advisory" }];
    input.tools = [];
    input.context.maxBytes = 16384;
    input.limits = { calls: String(limit), tokens: "1000000", concurrency: 1 };
    input.evaluation = { evaluator: "pact-rules@1", dataset: digest(selected.manifest), split: phaseSplit };
    const m = compileManifest(input, {
      ...capability,
      model: { ...capability.model, route: "ollama", model: "fake-model" },
    });
    await new ManifestRepository(f.pool).save(m.manifest);
    const runId = `evaluation-run:${randomUUID()}`,
      operationId = `evaluation-op:${randomUUID()}`;
    const scope = { runId, manifestDigest: m.digest };
    for (const c of selected.heldout ?? []) sources.set(c.id, c);

    return {
      scope,
      cohortId: group.id,
      manifest: m.manifest,
      execute: async (callback: (next: any) => Promise<any>) => {
        const claim = await f.claimTask();
        if (claim.bindingId !== group.bindings[0].id) throw Error("EVALUATION_FIXTURE_CLAIM_CONFLICT");
        const scope = await broker.journal.open(claim, runId, operationId, m.digest);
        const previousBudget = sharedBudgetId,
          previousCap = sharedBudgetCap;
        if (separateBudget) {
          sharedBudgetId = undefined;
          sharedBudgetCap = limit;
        }
        try {
          return await run(claim, scope, selected, phaseSplit, limit, callback);
        } finally {
          sharedBudgetId = previousBudget;
          sharedBudgetCap = previousCap;
        }
      },
    };
  };
  try {
    return await run(f.claim, f.scope, dataset, split, maxCalls, async (runtime) =>
      work({
        ...runtime,
        runtimes,
        prepare,
        additional: async (
          selected: Dataset,
          limit: number,
          callback: (next: any) => Promise<any>,
          phaseSplit = "development",
          separateBudget = false,
        ) => (await prepare(selected, limit, phaseSplit, separateBudget)).execute(callback),
      }),
    );
  } finally {
    await server.close();
    await f.close();
    await rm(directory, { recursive: true, force: true });
  }
}
