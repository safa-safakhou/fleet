import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readContainerMemory } from "../../src/research/orchestration/container-memory.js";

const id = "a".repeat(64);
async function fixture(
  reply: (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => void,
  work: (socket: string) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "fleet-stat-")),
    socket = join(directory, "s");
  const server = createServer(reply);
  await new Promise<void>((r) => server.listen(socket, r));
  try {
    await work(socket);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await rm(directory, { recursive: true, force: true });
  }
}
it("reads exact container memory with a nonstreaming one-shot Unix socket request", async () => {
  await fixture(
    (q, s) => {
      expect(q.url).toBe(`/containers/${id}/stats?stream=false&one-shot=true`);
      s.end(JSON.stringify({ id, memory_stats: { usage: 400 * 1024 ** 2, limit: 768 * 1024 ** 2 } }));
    },
    async (socket) => {
      expect(await readContainerMemory(socket, id, AbortSignal.timeout(1000))).toEqual({
        usageBytes: 400 * 1024 ** 2,
        limitBytes: 768 * 1024 ** 2,
      });
    },
  );
});
it("rejects wrong identities and missing or invalid measurements without inventing memory", async () => {
  for (const data of [
    { id: "b".repeat(64), memory_stats: { usage: 1, limit: 2 } },
    { id },
    { id, memory_stats: { usage: 1.5, limit: 2 } },
    { id, memory_stats: { usage: 1, limit: 0 } },
  ])
    await fixture(
      (_q, s) => s.end(JSON.stringify(data)),
      async (socket) => {
        await expect(readContainerMemory(socket, id, AbortSignal.timeout(1000))).rejects.toMatchObject({
          code: "CONTAINER_MEMORY_INVALID",
        });
      },
    );
});
it("records a typed timeout and bounds an oversized or unavailable response", async () => {
  await fixture(
    () => {},
    async (socket) => {
      await expect(readContainerMemory(socket, id, AbortSignal.timeout(20))).rejects.toMatchObject({
        code: "CONTAINER_MEMORY_ABORTED",
      });
    },
  );
  await fixture(
    (_q, s) => s.end("x".repeat(65537)),
    async (socket) => {
      await expect(readContainerMemory(socket, id, AbortSignal.timeout(1000))).rejects.toMatchObject({
        code: "CONTAINER_MEMORY_TOO_LARGE",
      });
    },
  );
  await fixture(
    (_q, s) => {
      s.statusCode = 500;
      s.end("private error withheld");
    },
    async (socket) => {
      await expect(readContainerMemory(socket, id, AbortSignal.timeout(1000))).rejects.toMatchObject({
        code: "CONTAINER_MEMORY_UNAVAILABLE",
      });
    },
  );
});
