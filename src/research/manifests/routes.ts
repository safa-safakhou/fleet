import type { FastifyInstance } from "fastify";
import { FleetError } from "../../domain.js";
import type { ResearchCapabilityResolver } from "./capabilities.js";
import { compileManifest, isManifestInput } from "./compiler.js";
/** Register only on the server protected by its operator-session and CSRF hooks. */
export function registerManifestRoutes(app: FastifyInstance, resolve?: ResearchCapabilityResolver) {
  app.post("/api/research/manifests/preview", async (request) => {
    const input = request.body;
    if (!isManifestInput(input)) throw new FleetError("INVALID_MANIFEST", true);
    const capability = resolve?.(input);
    if (!capability) throw new FleetError("RESEARCH_CAPABILITIES_UNAVAILABLE", true);
    return compileManifest(input, capability);
  });
}
