import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { expect, test } from "vitest";
import { createReplicaRouter } from "../../src/research/orchestration/replica-router.js";

const listen = async (server: Server) => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
};
const stop = async (server: Server) => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
};
const body = JSON.stringify({
  model: "synthetic",
  messages: [{ role: "user", content: "synthetic input — retain exact bytes" }],
});
test("isolated single-slot replicas receive concurrent byte-exact requests and refuse excess before dispatch", async () => {
  const received: Buffer[] = [];
  let release = () => {},
    ready = () => {};
  const gate = new Promise<void>((r) => {
      release = r;
    }),
    both = new Promise<void>((r) => {
      ready = r;
    });
  const backends = Array.from({ length: 2 }, () =>
    createServer(async (req, res) => {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      received.push(Buffer.concat(chunks));
      if (received.length === 2) ready();
      await gate;
      res.setHeader("content-type", "application/x-ndjson");
      res.write('{"message":{"content":"synthetic"}}\n');
      res.end('{"done":true,"prompt_eval_count":7,"eval_count":9}\n');
    }),
  );
  const urls = await Promise.all(backends.map(listen)),
    events: unknown[] = [];
  const router = createReplicaRouter({ backends: urls, expectedModel: "synthetic", onEvent: (e) => events.push(e) }),
    origin = await listen(router.server);
  try {
    const pending = [
      fetch(`${origin}/api/chat`, { method: "POST", body }),
      fetch(`${origin}/api/chat`, { method: "POST", body }),
    ];
    await both;
    const refused = await fetch(`${origin}/api/chat`, { method: "POST", body });
    expect(refused.status).toBe(503);
    expect(received).toHaveLength(2);
    release();
    for (const response of await Promise.all(pending)) {
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(
        '{"message":{"content":"synthetic"}}\n{"done":true,"prompt_eval_count":7,"eval_count":9}\n',
      );
    }
    expect(received.map((x) => x.toString())).toEqual([body, body]);
    expect(events.filter((e) => (e as { kind: string }).kind === "started")).toHaveLength(2);
    expect(JSON.stringify(events)).not.toContain("retain exact bytes");
  } finally {
    release();
    await stop(router.server);
    await Promise.all(backends.map(stop));
  }
});
test("replica failures propagate without a retry or invented successful provider response", async () => {
  let first = 0,
    second = 0;
  const a = createServer((req) => {
      first++;
      req.socket.destroy();
    }),
    b = createServer((_q, s) => {
      second++;
      s.end("unexpected retry");
    });
  const urls = await Promise.all([listen(a), listen(b)]),
    router = createReplicaRouter({ backends: urls, expectedModel: "synthetic" }),
    origin = await listen(router.server);
  try {
    await expect(fetch(`${origin}/api/chat`, { method: "POST", body })).rejects.toThrow();
    expect(first).toBe(1);
    expect(second).toBe(0);
  } finally {
    await stop(router.server);
    await stop(a);
    await stop(b);
  }
});
test("model and endpoint restrictions refuse unsupported work without contacting replicas", async () => {
  let calls = 0;
  const backend = createServer((_q, s) => {
      calls++;
      s.end("unexpected");
    }),
    url = await listen(backend),
    router = createReplicaRouter({ backends: [url], expectedModel: "synthetic" }),
    origin = await listen(router.server);
  try {
    expect(
      (await fetch(`${origin}/api/chat`, { method: "POST", body: JSON.stringify({ model: "different" }) })).status,
    ).toBe(400);
    expect((await fetch(`${origin}/api/pull`, { method: "POST", body })).status).toBe(405);
    expect(calls).toBe(0);
  } finally {
    await stop(router.server);
    await stop(backend);
  }
});
test("replica pools require distinct credential-free loopback endpoints", () => {
  for (const backends of [
    [],
    ["https://example.com"],
    ["http://secret:secret@127.0.0.1:1234"],
    ["http://127.0.0.1:1234/path"],
    ["http://127.0.0.1:1234", "http://127.0.0.1:1234"],
  ])
    expect(() => createReplicaRouter({ backends, expectedModel: "synthetic" })).toThrow("REPLICA_ENDPOINTS_REQUIRED");
});
test("metadata reports each loaded replica without creating an inference request", async () => {
  const backends = [0, 1].map((n) =>
      createServer((req, res) => {
        expect(req.method).toBe("GET");
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            models: [{ name: "synthetic", digest: `digest-${n}`, size: 100, size_vram: 100, context_length: 32768 }],
          }),
        );
      }),
    ),
    urls = await Promise.all(backends.map(listen)),
    router = createReplicaRouter({ backends: urls, expectedModel: "synthetic" }),
    origin = await listen(router.server);
  try {
    const value = await (await fetch(`${origin}/api/ps`)).json();
    expect(value.models.map((x: { replicaIndex: number }) => x.replicaIndex)).toEqual([0, 1]);
  } finally {
    await stop(router.server);
    await Promise.all(backends.map(stop));
  }
});

test("client cancellation aborts the selected replica without dispatching a replacement", async () => {
  let calls = 0,
    closed = () => {};
  const upstreamClosed = new Promise<void>((resolve) => {
    closed = resolve;
  });
  const backend = createServer(async (req, res) => {
      for await (const _chunk of req) {
      }
      calls++;
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      res.flushHeaders();
      res.on("close", closed);
    }),
    url = await listen(backend),
    router = createReplicaRouter({ backends: [url], expectedModel: "synthetic" }),
    origin = await listen(router.server),
    abort = new AbortController();
  try {
    const response = await fetch(`${origin}/api/chat`, { method: "POST", body, signal: abort.signal });
    abort.abort();
    await expect(response.text()).rejects.toThrow();
    await upstreamClosed;
    expect(calls).toBe(1);
    expect(router.state()[0].busy).toBe(false);
    expect(router.state()[0].available).toBe(false);
    expect((await fetch(`${origin}/api/chat`, { method: "POST", body })).status).toBe(503);
    expect(calls).toBe(1);
  } finally {
    await stop(router.server);
    await stop(backend);
  }
});

test("invalid and oversized bodies and audit failures never dispatch inference", async () => {
  let calls = 0;
  const backend = createServer((_req, res) => {
    calls++;
    res.end("unexpected");
  });
  const url = await listen(backend);
  const router = createReplicaRouter({
    backends: [url],
    expectedModel: "synthetic",
    maxBodyBytes: 512,
    onEvent: () => {
      throw new Error("SYNTHETIC_AUDIT_FAILURE");
    },
  });
  const origin = await listen(router.server);
  try {
    expect((await fetch(`${origin}/api/chat`, { method: "POST", body: "{" })).status).toBe(400);
    expect((await fetch(`${origin}/api/chat`, { method: "POST", body: "x".repeat(513) })).status).toBe(413);
    expect((await fetch(`${origin}/api/chat`, { method: "POST", body })).status).toBe(502);
    expect(calls).toBe(0);
  } finally {
    await stop(router.server);
    await stop(backend);
  }
});
