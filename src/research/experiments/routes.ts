import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { FleetError, object } from "../../domain.js";
import { EvaluatorSpecSchema } from "../evaluation/pact.js";
import { CaptureSession } from "../evidence/boundaries.js";
import type { RunInspection } from "../evidence/inspection.js";
import { MetricRepository } from "../metrics/repository.js";
import { WindowSchema } from "../metrics/types.js";
import { ComparisonService } from "./comparison.js";
import { ExperimentRepository } from "./repository.js";
import { ExperimentSpecSchema } from "./schema.js";
/** Registered behind the host's operator-session/CSRF/no-store hooks. No actor route. */
export function registerExperimentRoutes(app: FastifyInstance, inspection?: RunInspection) {
  const use = (r: FastifyRequest) => {
    if (!inspection) throw new FleetError("EVIDENCE_UNAVAILABLE", true);
    const principal = { sessionHash: String(object(object(r).fleetSession).hash ?? "") },
      capture = new CaptureSession(inspection.store, inspection.artifacts.files),
      metrics = new MetricRepository(inspection, capture, principal);
    return { metrics, experiments: new ExperimentRepository(metrics), principal };
  };
  const id = (r: FastifyRequest) => z.uuid().parse(object(r.params).id);
  app.post("/api/research/runs/:runId/metrics", async (r) => {
    const body = z
        .object({
          snapshotId: z.uuid(),
          ids: z.array(z.string()).min(1).max(200),
          window: WindowSchema,
          evaluator: EvaluatorSpecSchema.optional(),
        })
        .strict()
        .parse(r.body),
      services = use(r);
    const snapshot = await inspection!.retained(
      z.string().parse(object(r.params).runId),
      services.principal,
      body.snapshotId,
    );
    return services.metrics.compute(snapshot, body.ids, body.window, body.evaluator);
  });
  app.get("/api/research/metric-snapshots/:id", async (r) => use(r).metrics.get(id(r)));
  app.post("/api/research/experiments", async (r) => use(r).experiments.create(ExperimentSpecSchema.parse(r.body)));
  app.get("/api/research/experiments/:id", async (r) => use(r).experiments.spec(id(r)));
  app.post("/api/research/experiments/:id/snapshots", async (r) => {
    const body = z
      .object({ runSnapshots: z.array(z.uuid()).max(1000) })
      .strict()
      .parse(r.body);
    return use(r).experiments.snapshot(id(r), body.runSnapshots);
  });
  app.get("/api/research/experiment-snapshots/:id", async (r) =>
    new ComparisonService(use(r).experiments).compare(id(r)),
  );
}
