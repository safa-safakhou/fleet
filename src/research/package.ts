import { composeRuntime } from "../app/composition.js";
import { config } from "../config.js";
import { buildServer } from "../server.js";
import { packageReadiness } from "./qualification/readiness.js";

// A separate compiled inspection entry point. It has no worker, task pump or activation path.
if (
  process.env.FLEET_LIVE_ENABLED === "1" ||
  process.env.FLEET_RESEARCH_TEMPORAL_ADDRESS ||
  process.env.FLEET_RESEARCH_PYTHON_EXECUTABLE ||
  process.env.FLEET_RESEARCH_PYTHON_IMAGE
)
  throw Error("RESEARCH_PACKAGE_EXECUTION_FORBIDDEN");
const settings = config({ ...process.env, FLEET_LIVE_ENABLED: "0" }),
  runtime = composeRuntime(settings);
const server = buildServer({
  ...runtime,
  origin: settings.origin,
  operatorSecret: settings.operatorSecret,
  liveAllowed: false,
});
server.addHook("onRequest", async (request, reply) => {
  if (!["GET", "HEAD"].includes(request.method) && !["/api/login", "/api/logout"].includes(request.url.split("?")[0]))
    return reply.code(403).send({ code: "RESEARCH_PACKAGE_READ_ONLY" });
});
server.get("/research/ready", async (_request, reply) => {
  const status = await packageReadiness(
    runtime.pool,
    runtime.store.vault,
    process.env.FLEET_RESEARCH_KEY_PROOF_FILE,
    process.env.FLEET_RESEARCH_REQUIRE_VECTOR !== "0",
  );
  return reply.code(status.ready ? 200 : 503).send(status);
});
await server.listen({ host: process.env.FLEET_BIND ?? "127.0.0.1", port: settings.port });
console.log("Fleet research inspection ready; execution is disabled.");
let closing = false;
const stop = async () => {
  if (closing) return;
  closing = true;
  await server.close();
  await runtime.pool.end();
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
