import { once } from "node:events";
import { connect, createServer, type Server, type Socket } from "node:net";
import { expect, test } from "vitest";
import { postgresRelay } from "../../scripts/research-postgres-relay.mjs";

test("owned relay preserves fragmented large frames without delayed-ACK stalls", async () => {
  const sockets = new Set<Socket>();
  const target = createServer((socket) => {
    sockets.add(socket);
    socket.setNoDelay(true);
    let pending = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 2 && pending.length >= pending.readUInt16BE(0) + 2) {
        const length = pending.readUInt16BE(0) + 2;
        socket.write(pending.subarray(0, length));
        pending = pending.subarray(length);
      }
    });
  });
  let relay: Server | undefined, client: Socket | undefined;
  try {
    target.listen(0, "127.0.0.1");
    await once(target, "listening");
    relay = postgresRelay({ host: "127.0.0.1", port: (target.address() as { port: number }).port });
    relay.listen(0, "127.0.0.1");
    await once(relay, "listening");
    client = connect({ host: "127.0.0.1", port: (relay.address() as { port: number }).port });
    await once(client, "connect");
    client.setNoDelay(true);
    const frame = Buffer.alloc(32770, 83);
    frame.writeUInt16BE(32768);
    const times: number[] = [];
    for (let i = 0; i < 32; i++) {
      const start = performance.now();
      const received = new Promise<Buffer>((resolve) => {
        let body = Buffer.alloc(0);
        const read = (part: Buffer) => {
          body = Buffer.concat([body, part]);
          if (body.length >= frame.length) {
            client!.off("data", read);
            resolve(body);
          }
        };
        client!.on("data", read);
      });
      client.write(frame.subarray(0, 2));
      await new Promise<void>((resolve) => setImmediate(resolve));
      client.write(frame.subarray(2));
      const body = await received;
      times.push(performance.now() - start);
      expect(body).toEqual(frame);
    }
    // The Linux regression is a ~40ms transport stall, separate from service budgets.
    if (process.platform === "linux") expect(times.sort((a, b) => a - b)[30]).toBeLessThan(25);
  } finally {
    client?.destroy();
    for (const socket of sockets) socket.destroy();
    await Promise.all(
      [relay, target].filter(Boolean).map((server) => new Promise<void>((resolve) => server!.close(() => resolve()))),
    );
  }
});
