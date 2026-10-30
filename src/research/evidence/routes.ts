import { Readable } from "node:stream";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { FleetError, object } from "../../domain.js";
import { RunArchive } from "./export.js";
import type { ResearchPrincipal, RunInspection } from "./inspection.js";
import { EventKinds } from "./types.js";
/** Only register behind the existing operator-session/CSRF/no-store hooks. */
export function registerEvidenceRoutes(app: FastifyInstance, inspection?: RunInspection) {
  const use = () => {
    if (!inspection) throw new FleetError("EVIDENCE_UNAVAILABLE", true);
    return inspection;
  };
  const principal = (r: FastifyRequest): ResearchPrincipal => ({
    sessionHash: String(object(object(r).fleetSession).hash ?? ""),
  });
  const run = (r: FastifyRequest) => z.string().min(1).max(2000).parse(object(r.params).runId);
  const query = z
    .object({
      snapshotId: z.uuid(),
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(500).optional(),
      kind: z.enum(EventKinds).optional(),
      streamId: z.string().max(120).optional(),
    })
    .strict();
  app.get("/api/research/runs/:runId/export", async (r, reply) => {
    const { snapshotId } = z.object({ snapshotId: z.uuid() }).strict().parse(r.query);
    const raw = r.headers["x-fleet-export-key"];
    if (typeof raw !== "string" || !/^[a-f0-9]{64}$/.test(raw)) throw new FleetError("EXPORT_KEY_REQUIRED", true);
    const p = principal(r),
      snap = await use().retained(run(r), p, snapshotId),
      archive = new RunArchive(use(), Buffer.from(raw, "hex"));
    reply
      .type("application/vnd.fleet.encrypted-archive")
      .header("content-disposition", `attachment; filename="${snap.id}.fleet"`);
    return reply.send(Readable.from(archive.export(snap, p)));
  });
  app.get("/api/research/runs/:runId", async (r) => use().snapshot(run(r), principal(r)));
  app.get("/api/research/runs/:runId/events", async (r) => use().events(run(r), principal(r), query.parse(r.query)));
  app.get("/api/research/runs/:runId/coverage", async (r) => {
    const { snapshotId } = z.object({ snapshotId: z.uuid() }).strict().parse(r.query);
    return (await use().retained(run(r), principal(r), snapshotId)).coverage;
  });
  app.get("/api/research/runs/:runId/lineage", async (r) => {
    const q = z
      .object({ snapshotId: z.uuid(), limit: z.coerce.number().int().min(1).max(500).optional() })
      .strict()
      .parse(r.query);
    return use().lineage(run(r), principal(r), q.snapshotId, q.limit);
  });
  app.get("/api/research/runs/:runId/artifacts/:artifactId", async (r, reply) => {
    const { snapshotId } = z.object({ snapshotId: z.uuid() }).strict().parse(r.query),
      id = z.uuid().parse(object(r.params).artifactId),
      p = principal(r),
      runId = run(r);
    const { ref } = await use().artifactReference(runId, p, id, snapshotId);
    reply.type(ref.contentType).header("content-disposition", `attachment; filename="${id}.bin"`);
    return reply.send(Readable.from(use().artifact(runId, p, id, snapshotId)));
  });
}
