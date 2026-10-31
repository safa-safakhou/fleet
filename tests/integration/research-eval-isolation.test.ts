import { expect, test } from "vitest";
import { loadDataset } from "../../src/research/evaluation/datasets.js";
import { withEvaluationFixture } from "../fixtures/research/evaluation.js";

test("eval_never_bypasses_fleet: native allocations, purposes, call caps and scope refusals", async () => {
  const dataset = await loadDataset("evals/pact/datasets/manifest.json", "evaluator");
  await withEvaluationFixture(
    dataset,
    async (r) => {
      const c = dataset.development[0];
      await expect(
        r.broker.requestModel(
          r.session,
          r.scope,
          {
            operationId: r.scope.operationId,
            operationEpoch: r.scope.operationEpoch,
            logicalStepId: "model:unauthorized",
          },
          {
            messages: [{ role: "user", content: "bypass" }],
            schema: { type: "object" },
            maxOutputTokens: 100,
            purpose: "helper",
          },
        ),
      ).rejects.toThrow("EVALUATION_PORT_REQUIRED");
      const result = await r.client.call({
        datasetId: dataset.manifest.id,
        candidateId: "reference",
        caseId: c.id,
        phase: "candidate",
        prompt: c.actorInput,
      });
      expect(result.output).toEqual(c.recordedOutput);
      await r.client.call({
        datasetId: dataset.manifest.id,
        candidateId: "reference",
        caseId: c.id,
        phase: "judge",
        prompt: c.actorInput,
      });
      expect((await r.f.pool.query("SELECT status FROM compute_ledger ORDER BY id")).rows).toEqual([
        { status: "reported" },
        { status: "reported" },
      ]);
      expect(
        (await r.f.pool.query("SELECT purpose FROM research_evaluation_calls ORDER BY logical_step_id")).rows,
      ).toEqual([{ purpose: "decision" }, { purpose: "judge" }]);
      expect(
        (
          await r.f.pool.query(
            "SELECT event->'attributes'->>'purpose' purpose FROM research_events WHERE event->>'kind'='model.request' ORDER BY ordinal",
          )
        ).rows,
      ).toEqual([{ purpose: "decision" }, { purpose: "judge" }]);
      await expect(
        r.client.call({
          datasetId: dataset.manifest.id,
          candidateId: "reference",
          caseId: "heldout-authority",
          phase: "teacher",
          prompt: "heldout labels",
        }),
      ).rejects.toThrow("DATASET_SCOPE_DENIED");
      await expect(
        r.client.call({
          datasetId: dataset.manifest.id,
          candidateId: "reference",
          caseId: c.id,
          phase: "repair",
          prompt: c.actorInput,
        }),
      ).rejects.toThrow("EVALUATION_CALL_CAP");
      expect((await r.f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(2);
      await expect(
        r.broker.scopedPort(
          r.session,
          r.scope,
          { operationId: r.scope.operationId, operationEpoch: r.scope.operationEpoch, logicalStepId: "port:99" },
          "evaluation.heldout",
          [],
        ),
      ).rejects.toThrow("EVALUATION_PORT_REQUIRED");
      await expect(
        (async () => {
          for await (const _ of r.broker.artifact(r.session, r.scope, "00000000-0000-4000-8000-000000000099")) {
          }
        })(),
      ).rejects.toThrow("ARTIFACT_SCOPE_MISMATCH");
    },
    { maxCalls: 2, candidates: ["reference"] },
  );
});

test("actual Promptfoo library uses only the owned UDS provider with exact rubric scores", async () => {
  const dataset = await loadDataset("evals/pact/datasets/manifest.json", "evaluator"),
    { runFrameworkChild } = await import("../../scripts/lib/research-framework-child.js"),
    { resolve } = await import("node:path");
  await withEvaluationFixture(
    dataset,
    async (r) => {
      const batch = await runFrameworkChild(r, {
        manifestPath: resolve("evals/pact/datasets/manifest.json"),
        split: "development",
        caseIds: dataset.development.slice(0, 3).map((c) => c.id),
        candidates: ["reference"],
      });
      expect(batch.egressProbesDenied).toBe(2);
      expect(batch.successes).toBe(3);
      expect(batch.failures).toBe(0);
      expect(batch.results.length).toBe(3);
    },
    { maxCalls: 3, candidates: ["reference"] },
  );
}, 60000);
