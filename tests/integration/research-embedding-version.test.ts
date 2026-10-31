import { expect, test } from "vitest";
import { EmbeddingPort } from "../../src/research/memory/embedding-client.js";
import { namespaceFor } from "../../src/research/memory/schema.js";
import { memoryFixture } from "../fixtures/research/memory.js";

const identity = { revision: "fixture@1", digest: "a".repeat(64), dimension: 3, normalization: "l2" as const };
test("index_revision_is_not_interchangeable and jobs are bounded, private and idempotent", async () => {
  const f = await memoryFixture(true, { strategy: "vector-exact-v1", embedding: identity });
  try {
    await f.memory.indexPolicy.grant(f.scope, "fixture-index");
    let calls = 0;
    const compute = {
      identity,
      async embed(texts: string[], mode: "query" | "document") {
        calls++;
        expect(texts).toEqual(["wood"]);
        expect(mode).toBe("query");
        return {
          identity,
          vectors: [[1, 0, 0]],
          usage: { purpose: "embedding" as const, cpuMs: 1, durationMs: 2, items: 1 },
        };
      },
    };
    const port = new EmbeddingPort(f.memory, compute);
    const input = { key: "query:1", mode: "query" as const, text: "wood" };
    const first = await port.embed(f.scope, input);
    expect(await port.embed(f.scope, input)).toEqual(first);
    expect(calls).toBe(1);
    await expect(port.embed(f.scope, { ...input, text: "stone" })).rejects.toThrow("EMBEDDING_INPUT_CONFLICT");
    for (const altered of [
      { ...identity, revision: "fixture@2" },
      { ...identity, dimension: 4 },
    ]) {
      expect(namespaceFor(f.scope, { ...f.manifest, memory: { ...f.manifest.memory, embedding: altered } })).not.toBe(
        namespaceFor(f.scope, f.manifest),
      );
      await expect(
        new EmbeddingPort(f.memory, { ...compute, identity: altered }).embed(f.scope, { ...input, key: "other" }),
      ).rejects.toThrow("EMBEDDING_INCOMPATIBLE");
    }
    expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
    await f.memory.indexPolicy.revoke(f.scope, "fixture-index");
    const job = (await f.pool.query("SELECT status,input_digest,result_cipher FROM research_embedding_jobs")).rows[0];
    expect(job).toEqual({ status: "expired", input_digest: null, result_cipher: null });
    await expect(port.embed(f.scope, input)).rejects.toThrow("INDEX_PERMISSION_REQUIRED");
  } finally {
    await f.close();
  }
});

test("source expiry or revocation during compute cannot publish a vector or body", async () => {
  const f = await memoryFixture(true, { embedding: identity });
  try {
    await f.memory.indexPolicy.grant(f.scope, "fixture-index");
    const source = await f.source("observation", "private wood");
    const ref = await f.memory.capture(f.scope, {
      kind: "episode",
      sourceClass: "observation",
      text: "private wood",
      sourceRefs: [source],
      observedAt: f.now().toISOString(),
      privacy: "private",
      indexPolicyId: "fixture-index",
    });
    const port = new EmbeddingPort(f.memory, {
      identity,
      async embed(texts) {
        expect(texts).toEqual(["private wood"]);
        await f.pool.query("UPDATE research_artifacts SET status='expired' WHERE id=$1", [source]);
        return { identity, vectors: [[1, 0, 0]], usage: { purpose: "embedding", cpuMs: 2, durationMs: 3, items: 1 } };
      },
    });
    await expect(
      port.embed(f.scope, { key: "document:1", mode: "document", memoryId: ref.id, version: ref.version }),
    ).rejects.toThrow("MEMORY_SOURCE_UNAVAILABLE");
    const job = (await f.pool.query("SELECT status,result_cipher,cpu_ms FROM research_embedding_jobs")).rows[0];
    expect(job.status).toBe("expired");
    expect(job.result_cipher).toBeNull();
    expect(Number(job.cpu_ms)).toBe(2);
    expect((await f.pool.query("SELECT count(*)::int n FROM research_memory_projections")).rows[0].n).toBe(0);
  } finally {
    await f.close();
  }
});

test("embedding unknowns do not retry and query jobs expire with observation retention", async () => {
  const f = await memoryFixture(true, { embedding: identity });
  try {
    await f.memory.indexPolicy.grant(f.scope, "fixture-index");
    let calls = 0;
    const unknown = new EmbeddingPort(f.memory, {
      identity,
      async embed() {
        calls++;
        throw Error("CPU_PROCESS_LOST");
      },
    });
    const input = { key: "unknown:1", mode: "query" as const, text: "wood" };
    await expect(unknown.embed(f.scope, input)).rejects.toThrow("CPU_PROCESS_LOST");
    await expect(unknown.embed(f.scope, input)).rejects.toThrow("EMBEDDING_JOB_UNKNOWN");
    expect(calls).toBe(1);
    f.advance(31 * 86400000);
    await f.capture.expire();
    expect((await f.pool.query("SELECT status,input_digest,result_cipher FROM research_embedding_jobs")).rows).toEqual([
      { status: "expired", input_digest: null, result_cipher: null },
    ]);
    expect(
      (
        await f.pool.query(
          "SELECT count(*)::int n FROM research_embedding_job_artifacts l JOIN research_artifacts a ON a.id=l.artifact_id WHERE a.status='complete'",
        )
      ).rows[0].n,
    ).toBe(0);
  } finally {
    await f.close();
  }
});

test("scoped protobuf embedding RPC uses only native local compute and no model allocation", async () => {
  const f = await memoryFixture(true, { embedding: identity });
  const { mkdtemp, rm } = await import("node:fs/promises"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "fleet-embedding-rpc-"));
  let server: { close(): Promise<void> } | undefined;
  try {
    await f.memory.indexPolicy.grant(f.scope, "fixture-index");
    const { ResearchBroker } = await import("../../src/research/broker/server.js"),
      { builtinArchitectures } = await import("../../src/app/builtins.js"),
      { createScopedServices } = await import("../../src/app/host-services.js");
    const { serveBroker, brokerServiceDefinition } = await import("../../src/research/broker/transport.js");
    const grpc = await import("@grpc/grpc-js");
    let calls = 0;
    const h = f.host(
      {
        decide: async () => {
          throw Error("NO_GENERATIVE_CALL_ALLOWED");
        },
      },
      async (ctx) => {
        const original = builtinArchitectures().resolve({ id: "reactive-basic", version: "1" });
        const services = await createScopedServices(
          f.claim,
          { ...original, manifest: { ...original.manifest, ref: f.claim.profile } },
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
        const broker = new ResearchBroker(f.store, f.tasks, f.capture, undefined, {
          identity,
          async embed(texts, mode) {
            calls++;
            expect(texts).toEqual(["wood"]);
            expect(mode).toBe("query");
            return {
              identity,
              vectors: [[1, 0, 0]],
              usage: { purpose: "embedding", cpuMs: 1, durationMs: 1, items: 1 },
            };
          },
        });
        const auth = await broker.open(f.scope, services, "actor", ctx.signal, ctx.observation);
        const socket = join(directory, "broker.sock");
        server = await serveBroker(broker, socket);
        const client = new grpc.Client(`unix:${socket}`, grpc.credentials.createInsecure());
        const metadata = new grpc.Metadata();
        metadata.set("authorization", `Bearer ${auth.token}`);
        const method = brokerServiceDefinition.execute;
        const request = {
          protocolVersion: 1,
          scope: f.scope,
          key: { operationId: f.scope.operationId, operationEpoch: f.scope.operationEpoch, logicalStepId: "port:1" },
          embedding: { mode: "query", text: "wood" },
        };
        const execute = () =>
          new Promise<any>((resolve, reject) =>
            client.makeUnaryRequest(
              method.path,
              method.requestSerialize,
              method.responseDeserialize,
              request,
              metadata,
              (error, result) => (error ? reject(error) : resolve(result)),
            ),
          );
        try {
          const first = await execute(),
            second = await execute();
          expect(first.result.status).toBe("completed");
          expect(second.result).toEqual(first.result);
        } finally {
          client.close();
        }
        expect(calls).toBe(1);
        await f.memory.indexPolicy.revoke(f.scope, "fixture-index");
        expect(
          (
            await f.pool.query(
              "SELECT count(*)::int n FROM research_embedding_job_artifacts l JOIN research_artifacts a ON a.id=l.artifact_id WHERE a.status='complete'",
            )
          ).rows[0].n,
        ).toBe(0);
      },
    );
    await h.host.run(f.claim);
    expect(calls).toBe(1);
    expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
  } finally {
    await server?.close();
    await f.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("revising memory invalidates completed embeddings and expired artifacts cannot be recaptured", async () => {
  const f = await memoryFixture(true, { embedding: identity });
  try {
    await f.memory.indexPolicy.grant(f.scope, "fixture-index");
    const source = await f.source("observation", "wood");
    const input = {
      kind: "episode" as const,
      sourceClass: "observation" as const,
      text: "wood",
      sourceRefs: [source],
      observedAt: f.now().toISOString(),
      privacy: "private" as const,
      indexPolicyId: "fixture-index",
    };
    const ref = await f.memory.capture(f.scope, input);
    const port = new EmbeddingPort(f.memory, {
      identity,
      async embed() {
        return { identity, vectors: [[1, 0, 0]], usage: { purpose: "embedding", cpuMs: 1, durationMs: 1, items: 1 } };
      },
    });
    await port.embed(f.scope, { key: "document:1", mode: "document", memoryId: ref.id, version: ref.version });
    const revised = await f.memory.revise(f.scope, ref.id, ref.version, { text: "stone" });
    expect(revised.version).toBe("2");
    expect((await f.memory.get(f.scope, [ref.id]))[0].version).toBe("2");
    expect((await f.pool.query("SELECT status,result_cipher FROM research_embedding_jobs")).rows).toEqual([
      { status: "expired", result_cipher: null },
    ]);
    await f.capture.expire();
    expect(
      (
        await f.pool.query(
          "SELECT count(*)::int n FROM research_embedding_job_artifacts l JOIN research_artifacts a ON a.id=l.artifact_id WHERE NOT a.purged",
        )
      ).rows[0].n,
    ).toBe(0);
    await f.pool.query("UPDATE research_artifacts SET expires_at=$2 WHERE id=$1", [source, f.now()]);
    await expect(f.memory.capture(f.scope, input)).rejects.toThrow("MEMORY_SOURCE_UNAVAILABLE");
  } finally {
    await f.close();
  }
});
