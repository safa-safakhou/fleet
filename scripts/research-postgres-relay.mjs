import { connect, createServer } from "node:net";

/** Byte-preserving transport for an already-validated owned fixture target. */
export function postgresRelay(remote) {
  return createServer((socket) => {
    const upstream = connect(remote);
    // Both legs carry PostgreSQL protocol fragments. Buffering a partial frame
    // behind a delayed ACK adds transport latency to every measured SQL cost.
    socket.setNoDelay(true);
    upstream.setNoDelay(true);
    socket.pipe(upstream).pipe(socket);
    socket.on("error", () => upstream.destroy());
    upstream.on("error", () => socket.destroy());
    socket.on("close", () => upstream.destroy());
    upstream.on("close", () => socket.destroy());
  });
}
