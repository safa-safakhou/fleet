import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { FleetError } from "../../domain.js";
import { compileRecipeManifest } from "./architecture-adapter.js";
import type { ResearchCapabilityResolver } from "./capabilities.js";
import { compileManifest, isManifestInput } from "./compiler.js";
/** Register only on the server protected by its operator-session and CSRF hooks. */
export function registerManifestRoutes(app: FastifyInstance, resolve?: ResearchCapabilityResolver) {
  app.post("/api/research/recipes/preview", async (request) => {
    const value = z
      .object({ input: z.unknown(), architectureConfig: z.record(z.string(), z.unknown()) })
      .strict()
      .parse(request.body);
    if (!isManifestInput(value.input)) throw new FleetError("INVALID_MANIFEST", true);
    const capability = resolve?.(value.input);
    if (!capability) throw new FleetError("RESEARCH_CAPABILITIES_UNAVAILABLE", true);
    return compileRecipeManifest(value.input, value.architectureConfig, capability);
  });
  app.post("/api/research/manifests/preview", async (request) => {
    const input = request.body;
    if (!isManifestInput(input)) throw new FleetError("INVALID_MANIFEST", true);
    const capability = resolve?.(input);
    if (!capability) throw new FleetError("RESEARCH_CAPABILITIES_UNAVAILABLE", true);
    return compileManifest(input, capability);
  });
}
