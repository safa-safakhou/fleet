// Container-local proxy only to the parent-owned disposable PostgreSQL instance.

import { spawn } from "node:child_process";
import { connect, createServer } from "node:net";

const remote = new URL(process.env.FLEET_TEST_DATABASE_URL ?? "");
if (
  !["host.docker.internal", "owned-postgres"].includes(remote.hostname) ||
  remote.pathname !== "/fleet_test" ||
  (remote.hostname === "owned-postgres"
    ? remote.port !== "5432"
    : [5432, 5436, 5437, 5438, 5439, 5451, 5452].includes(Number(remote.port))) ||
  !/^[a-f0-9]{64}$/.test(process.env.FLEET_ARCHITECTURE_NONCE ?? "")
)
  throw Error("OWNED_LINUX_FIXTURE_REQUIRED");
const proxy = createServer((socket) => {
  const upstream = connect({ host: remote.hostname, port: Number(remote.port) });
  socket.pipe(upstream).pipe(socket);
  socket.on("error", () => upstream.destroy());
  upstream.on("error", () => socket.destroy());
  socket.on("close", () => upstream.destroy());
});
await new Promise((done) => proxy.listen(0, "127.0.0.1", done));
const local = new URL(remote);
local.hostname = "127.0.0.1";
local.port = String(proxy.address().port);
const pact = new URL(local);
pact.pathname = "/pact_test";
const args = process.argv.slice(2);
if (!args.length) throw Error("EXPLICIT_LINUX_COMMAND_REQUIRED");
const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    FLEET_TEST_DATABASE_URL: local.href,
    TEST_DATABASE_URL: pact.href,
    PACT_ACCEPTANCE_DATABASE_URL: pact.href,
    FLEET_BENCHMARK_DATABASE_URL: local.href,
    FLEET_BENCHMARK_NONCE: process.env.FLEET_ARCHITECTURE_NONCE,
  },
});
const code = await new Promise((done, fail) => {
  child.once("exit", done);
  child.once("error", fail);
});
proxy.close();
process.exitCode = code ?? 1;
