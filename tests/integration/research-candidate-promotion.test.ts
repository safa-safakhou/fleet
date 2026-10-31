import { expect, test } from "vitest";
import { digest } from "../../src/research/contracts.js";
import { loadDataset } from "../../src/research/evaluation/datasets.js";
import { CandidateRegistry } from "../../src/research/experiments/candidates.js";
import { withEvaluationFixture } from "../fixtures/research/evaluation.js";
import { capability } from "../fixtures/research/manifest.js";

test("candidate export is immutable, C2 checked, heldout once, source expiry clears derived cache", async () => {
  const dataset = await loadDataset("evals/pact/datasets/manifest.json", "optimizer");
  const candidates = ["reference"],
    corruptCandidates: string[] = [];
  await withEvaluationFixture(
    dataset,
    async (r) => {
      const c = dataset.train[0];
      const reply = await r.client.call({
        datasetId: dataset.manifest.id,
        candidateId: "reference",
        caseId: c.id,
        phase: "teacher",
        prompt: c.actorInput,
      });
      const content = {
        optimizer: "dspy-bootstrap-fewshot@1",
        optimizerVersion: "3.4.1",
        moduleVersion: "pact-bounded-decision@1",
        signature: "case_id, case_text -> answer",
        instructions: "Use authorized facts",
        seed: 42,
        datasetDigest: digest(dataset.manifest),
        splitDigests: dataset.manifest.splitDigests,
        demonstrations: [{ case_id: c.id, case_text: c.actorInput, answer: JSON.stringify(c.recordedOutput) }],
      };
      const body = {
        schemaVersion: "fleet.candidate/v1",
        content,
        digest: digest(content),
        lineage: { calls: 1, allocationIds: [reply.allocationId], resultRefs: [reply.resultRef] },
      };
      const candidate = { ...body, artifactDigest: digest(body) };
      const { status, capabilityDigest, ...base } = r.f.manifest;
      const registry = new CandidateRegistry(
        r.inspection,
        r.f.capture,
        r.principal,
        base,
        { ...capability, model: { ...capability.model, route: "ollama", model: "fake-model" } },
        dataset,
      );
      await expect(registry.propose({ ...candidate, digest: "f".repeat(64) })).rejects.toThrow("CANDIDATE_INTEGRITY");
      const id = await registry.propose(candidate);
      expect(await registry.propose(candidate)).toBe(id);
      const stored = await registry.get(id);
      expect(stored.manifest.status).toBe("experimental");
      expect(stored.manifest.build.build).toBe(candidate.digest);
      candidates.push(id);
      corruptCandidates.push(id);
      const heldout = await loadDataset("evals/pact/datasets/manifest.json", "evaluator", "heldout");
      await registry.beginHeldout(id, dataset.manifest.splitDigests.heldout);
      await expect(registry.beginHeldout(id, dataset.manifest.splitDigests.heldout)).rejects.toThrow(
        "HELDOUT_ALREADY_CONSUMED",
      );
      await expect(registry.assess(id, "00000000-0000-4000-8000-000000000001")).rejects.toThrow(
        "HELDOUT_RESULT_UNAVAILABLE",
      );
      const results: any[] = [];
      for (const candidateId of candidates)
        await r.additional(
          heldout,
          2,
          async (next: any) => {
            for (const c of heldout.heldout!) {
              const result = await next.client.call({
                datasetId: heldout.manifest.id,
                candidateId,
                caseId: c.id,
                phase: "candidate",
                prompt: c.actorInput,
              });
              results.push({
                candidateId,
                caseId: c.id,
                allocationId: result.allocationId,
                resultRef: result.resultRef,
                pass: true,
                score: 1,
              });
            }
          },
          "heldout",
          true,
        );
      const resultId = await registry.recordHeldout(id, heldout, results);
      const assessment = await registry.assess(id, resultId);
      expect(assessment.baseline).toBe(1);
      expect(assessment.candidate).toBe(0);
      expect(assessment.promoted).toBe(false);
      await expect(registry.recordHeldout(id, heldout, results)).rejects.toThrow("HELDOUT_ALREADY_CONSUMED");
      await r.f.pool.query("UPDATE research_artifacts SET expires_at=$2 WHERE id=$1", [reply.resultRef, r.f.now()]);
      await r.f.capture.expire();
      expect(
        (await r.f.pool.query("SELECT body_cipher FROM research_candidates WHERE id=$1", [id])).rows[0].body_cipher,
      ).toBeNull();
      await expect(registry.get(id)).rejects.toThrow("CANDIDATE_UNAVAILABLE");
    },
    { split: "train-development", maxCalls: 1, candidates, corruptCandidates },
  );
});
