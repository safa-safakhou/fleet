import { expect, test } from "vitest";
import { ContextAssembler } from "../../src/research/context/assembler.js";
import { memoryFixture } from "../fixtures/research/memory.js";

test("dispatched messages and lineage are identical and downstream mutation refuses before dispatch", async () => {
  const f = await memoryFixture(false);
  try {
    const assembler = new ContextAssembler(
      {
        resolve: async (_scope, id) => ({
          id,
          slot: id === "owner" ? "owner" : "observation",
          sourceClass: id === "owner" ? "owner-guidance" : "observation",
          text: id === "owner" ? "Owner mandate" : "Fresh 木材 facts",
          sourceRefs: [`native:${id}`],
          observedAt: f.now().toISOString(),
          expiresAt: new Date(f.now().getTime() + 60000).toISOString(),
        }),
      },
      f.capture,
    );
    const packet = await assembler.build(f.scope, {
      refs: [
        { id: "owner", mandatory: true },
        { id: "facts", mandatory: true },
      ],
      schema: { type: "object" },
      maxBytes: 5000,
      maxTokens: 2000,
      maxOutputTokens: 100,
      maxObservationAgeMs: 5000,
      now: f.now().toISOString(),
    });
    let dispatched = 0,
      mutate = false,
      hugeSchema = false;
    const provider = {
      tracksDispatch: true,
      decide: async (input: any) => {
        await input.onEvidence?.({
          kind: "prepared",
          body: {
            messages: mutate ? [...input.messages, { role: "system", content: "hidden addition" }] : input.messages,
            format: hugeSchema ? { ...input.schema, description: "x".repeat(10000) } : input.schema,
          },
        });
        await input.onDispatch?.();
        dispatched++;
        return { decision: { kind: "wait" }, inputTokens: 7, outputTokens: 8 };
      },
    };
    const request = {
      model: { route: "ollama" as const, model: "fake-model" },
      messages: packet.messages,
      schema: packet.schema,
      maxOutputTokens: 100,
      signal: new AbortController().signal,
    };
    await f.capture.withScope(f.scope, () =>
      f.capture.withInputContext(packet, () => f.capture.model(f.claim.turn, request, provider)),
    );
    const events = (await f.pool.query("SELECT event FROM research_events WHERE event->>'kind'='model.request'")).rows;
    const ref = events[0].event.artifacts[0],
      chunks = [];
    for await (const chunk of f.capture.artifacts.read(f.scope, ref)) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    expect(body.messages).toEqual(packet.messages);
    expect(body.contextLineageRef.id).toBe(packet.lineage.artifact!.id);
    mutate = true;
    await expect(
      f.capture.withScope(f.scope, () =>
        f.capture.withInputContext(packet, () => f.capture.model(f.claim.turn, request, provider)),
      ),
    ).rejects.toThrow("CONTEXT_INPUT_MISMATCH");
    expect(dispatched).toBe(1);
    mutate = false;
    hugeSchema = true;
    await expect(
      f.capture.withScope(f.scope, () =>
        f.capture.withInputContext(packet, () => f.capture.model(f.claim.turn, request, provider)),
      ),
    ).rejects.toThrow("CONTEXT_CAPACITY_REQUIRED");
    expect(dispatched).toBe(1);
  } finally {
    await f.close();
  }
});

test("scoped PACT worker opts into source-complete context while retaining native accounting", async () => {
  const f = await memoryFixture(false, { contextPolicy: "source-complete@1" });
  try {
    const { ResearchBroker } = await import("../../src/research/broker/server.js"),
      { builtinArchitectures } = await import("../../src/app/builtins.js"),
      { createScopedServices } = await import("../../src/app/host-services.js");
    f.store.observation = f.capture;
    let calls = 0;
    const h = f.host(
      {
        tracksDispatch: true,
        decide: async (input) => {
          await input.onEvidence?.({ kind: "prepared", body: { messages: input.messages, format: input.schema } });
          await input.onDispatch?.();
          calls++;
          return { decision: { kind: "wait" }, inputTokens: 7, outputTokens: 8 };
        },
      },
      async (ctx) => {
        const original = builtinArchitectures().resolve({ id: "reactive-basic", version: "1" }),
          definition = { ...original, manifest: { ...original.manifest, ref: f.claim.profile } },
          services = await createScopedServices(f.claim, definition, undefined, {
            context: ctx,
            store: f.store,
            tasks: f.tasks,
            bindings: f.bindings,
            model: h.admission,
            commands: h.commands,
          });
        const broker = new ResearchBroker(f.store, f.tasks, f.capture),
          auth = await broker.open(f.scope, services, "actor", ctx.signal, {
            ...ctx.observation,
            observedAt: f.now().toISOString(),
            sourceRefs: ["native:authorized-facts"],
          }),
          session = await broker.authenticate(auth.token);
        await broker.requestModel(
          session,
          f.scope,
          { operationId: f.scope.operationId, operationEpoch: f.scope.operationEpoch, logicalStepId: "model:1" },
          {
            messages: [{ role: "user", content: "Choose from supplied facts" }],
            schema: { type: "object" },
            maxOutputTokens: 100,
            purpose: "decision",
          },
        );
      },
    );
    await f.capture.withScope(f.scope, () => h.host.run(f.claim));
    expect(calls).toBe(1);
    expect((await f.pool.query("SELECT status FROM compute_ledger")).rows).toEqual([{ status: "reported" }]);
    expect(
      (await f.pool.query("SELECT count(*)::int n FROM research_events WHERE event->>'kind'='context.prepared'"))
        .rows[0].n,
    ).toBeGreaterThanOrEqual(2);
  } finally {
    await f.close();
  }
});
