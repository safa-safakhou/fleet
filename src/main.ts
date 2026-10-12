import { runtime } from "./runtime.js";
import { buildServer } from "./server.js";

const r = runtime();
const server = buildServer({
  ...r,
  origin: r.settings.origin,
  operatorSecret: r.settings.operatorSecret,
  liveAllowed: r.settings.liveAllowed,
  demo: process.env.FLEET_DEMO === "1",
});
await server.listen({ host: process.env.FLEET_BIND ?? "127.0.0.1", port: r.settings.port });
console.log("Fleet console ready. No cohort starts on installation.");
const shutdown = async () => {
  await server.close();
  await r.pool.end();
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
