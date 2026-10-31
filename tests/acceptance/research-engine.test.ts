import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { ContextAssembler } from "../../src/research/context/assembler.js";
import { RunArchive, verifyArchive, writeArchive } from "../../src/research/evidence/export.js";
import { RunInspection } from "../../src/research/evidence/inspection.js";
import { EvidenceRepository } from "../../src/research/evidence/repository.js";
import { MetricRepository } from "../../src/research/metrics/repository.js";
import { memoryFixture } from "../fixtures/research/memory.js";

test("researcher_can_reconstruct_and_compare: native call, context, lost receipt, independent objective and complete archive", async () => {
  const f = await memoryFixture(false),
    root = await mkdtemp(join(tmpdir(), "fleet-walkthrough-"));
  try {
    f.store.observation = f.capture;
    const source = await f.source("observation", "PACT synthetic objective: move to a4");
    const memory = await f.memory.capture(f.scope, {
      kind: "episode",
      sourceClass: "observation",
      text: "Move to a4",
      sourceRefs: [source],
      observedAt: f.now().toISOString(),
      privacy: "private",
    });
    const recalled = await f.memory.get(f.scope, [memory.id]);
    expect(recalled[0]).toMatchObject({ version: "1", text: "Move to a4" });
    await f.capture.emit(f.scope, "memory.read", { records: recalled }, {}, { required: true, sourceRefs: [source] });
    const packet = await new ContextAssembler(
      {
        resolve: async () => ({
          id: "objective",
          slot: "observation",
          sourceClass: "observation",
          text: recalled[0].text,
          sourceRefs: recalled[0].sourceRefs,
          version: recalled[0].version,
          observedAt: f.now().toISOString(),
          expiresAt: new Date(f.now().getTime() + 60000).toISOString(),
        }),
      },
      f.capture,
    ).build(f.scope, {
      refs: [{ id: "objective", mandatory: true }],
      schema: { type: "object" },
      maxBytes: 8192,
      maxTokens: 4000,
      maxOutputTokens: 100,
      maxObservationAgeMs: 5000,
      now: f.now().toISOString(),
    });
    let calls = 0;
    const allocation = await f.store.reserveCall(f.claim.turn);
    const reply = await f.capture.withScope(f.scope, () =>
      f.capture.withInputContext(packet, () =>
        f.capture.model(
          f.claim.turn,
          {
            model: { route: "ollama", model: "fake-model" },
            messages: packet.messages,
            schema: packet.schema,
            maxOutputTokens: 100,
            signal: new AbortController().signal,
          },
          {
            tracksDispatch: true,
            decide: async (input) => {
              await input.onEvidence?.({ kind: "prepared", body: { messages: input.messages, format: input.schema } });
              await input.onDispatch?.();
              calls++;
              return {
                decision: {
                  kind: "action",
                  payload: { schemaId: "board.move.v1", payload: { to: "a4" } },
                  sourceRefs: [source],
                  preconditions: {},
                },
                inputTokens: 7,
                outputTokens: 8,
              };
            },
          },
          allocation,
        ),
      ),
    );
    await f.capture.withScope(f.scope, () => f.store.recordUsage(allocation, reply.inputTokens, reply.outputTokens));
    const responseEvent = (
      await f.pool.query("SELECT id FROM research_events WHERE run_id=$1 AND event->>'kind'='model.response'", [
        f.scope.runId,
      ])
    ).rows[0].id;
    const proposed = await f.capture.emit(
      f.scope,
      "decision.proposed",
      reply.decision,
      {},
      { required: true, parents: [responseEvent] },
    );
    expect(proposed).toBeDefined();
    const decision = reply.decision as { payload: { schemaId: string; payload: { to: string } } };
    const connect = f.board.adapter.connect;
    f.board.adapter.connect = async (binding) => {
      const session = await connect(binding);
      return {
        ...session,
        execute: async (intent) => {
          await session.execute(intent);
          throw Error("lost response after acceptance");
        },
      };
    };
    const h = f.host({
        decide: async () => {
          throw Error("hidden helper forbidden");
        },
      }),
      commandId = randomUUID();
    await f.capture.withScope(f.scope, () =>
      h.commands.submit(f.claim, {
        commandId,
        bindingId: f.claim.bindingId,
        schemaId: decision.payload.schemaId,
        payload: decision.payload.payload,
      }),
    );
    expect(
      (await f.pool.query("SELECT state FROM platform_commands WHERE command_id=$1", [commandId])).rows[0].state,
    ).toBe("unknown");
    await f.capture.withScope(f.scope, () => h.commands.reconcile(f.claim.turn.id, commandId));
    expect(f.board.executions).toBe(1);
    const observed = await (await connect(await f.bindings.get(f.claim.bindingId))).observe({});
    expect(observed.payload.square).toBe("a4");
    await f.capture.emit(
      f.scope,
      "observation.record",
      {
        port: "environment.observe",
        output: {
          schemaId: "pact.observation.v1",
          observedAt: f.now().toISOString(),
          sourceRefs: [source],
          payload: { position: observed.payload.square },
        },
      },
      {},
      { required: true },
    );
    await f.capture.withScope(f.scope, () => f.store.finish(f.claim.turn, "WAIT"));
    const sessionHash = randomUUID();
    await f.pool.query("INSERT INTO operator_sessions VALUES($1,$2,'fixture')", [
      sessionHash,
      new Date(f.now().getTime() + 3600000),
    ]);
    const inspection = new RunInspection(f.store, f.capture.artifacts),
      principal = { sessionHash },
      snap = await inspection.snapshot(f.scope.runId, principal);
    expect(snap.coverage.missing).toEqual([]);
    expect(snap.native.allocations).toHaveLength(1);
    expect(snap.native.commands).toHaveLength(1);
    expect(calls).toBe(1);
    const window = { start: f.now().toISOString(), end: new Date(f.now().getTime() + 1000).toISOString() };
    const metric = await new MetricRepository(inspection, f.capture, principal).compute(
      snap,
      ["calls.v1", "objective_success_rate.v1"],
      window,
      {
        version: "pact-rules@1",
        window,
        objectives: [{ id: "position", pointer: "/position", equals: "a4" }],
        facts: [],
        receipts: [{ commandId, meaning: "admission" }],
      },
    );
    expect(metric.metrics.values.find((x) => x.id === "calls.v1")?.value).toBe(1);
    expect(metric.metrics.values.find((x) => x.id === "objective_success_rate.v1")?.value).toBe(1);
    expect(metric.evaluation?.receipts[0].completedObjective).toBe(false);
    const final = await inspection.snapshot(f.scope.runId, principal),
      key = randomBytes(32),
      path = join(root, "walkthrough.fleet");
    await writeArchive(path, new RunArchive(inspection, key).export(final, principal));
    const verified = await verifyArchive(path, key),
      events = (
        await new EvidenceRepository(f.store).page(f.scope, { maximumOrdinal: final.maximumOrdinal, limit: 500 })
      ).events;
    const artifactCount = (
      await f.pool.query("SELECT count(*)::int n FROM research_artifacts WHERE run_id=$1 AND status='complete'", [
        f.scope.runId,
      ])
    ).rows[0].n;
    expect(verified).toMatchObject({ status: "verified", events: final.total, artifacts: artifactCount, gaps: 0 });
    expect(events.filter((x) => x.kind === "model.request")).toHaveLength(1);
    expect(events.some((x) => x.kind === "context.prepared" && x.parentIds.length > 0)).toBe(true);
    const chunks: Record<string, unknown> = {};
    for (const event of events)
      for (const artifact of event.artifacts)
        for (let index = 0; index < Number(artifact.chunks); index++)
          chunks[`${artifact.id}:${index}`] = await inspection.artifactChunk(
            f.scope.runId,
            principal,
            final.id,
            artifact.id,
            index,
          );
    await writeFile(
      ".superpowers/sdd/2026-10-30-pact-research-07-qualification/native-walkthrough.json",
      JSON.stringify(
        {
          fixtureTag: "fleet.owned-synthetic-walkthrough/v1",
          snapshot: final,
          events,
          chunks,
          metricSets: [metric],
          reconciliation: {
            calls,
            commands: f.board.executions,
            events: events.length,
            artifacts: artifactCount,
            archive: verified,
          },
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
  } finally {
    await f.close();
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
