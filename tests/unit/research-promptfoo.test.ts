import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { gradeCase } from "../../evals/pact/assertions.js";
import { FleetEvalProvider } from "../../evals/pact/provider.js";
import { loadDataset } from "../../src/research/evaluation/datasets.js";

test("eval_never_bypasses_fleet and deterministic rubric scores are exact", async () => {
  let calls = 0;
  const broker = {
    async call(input: any) {
      calls++;
      return {
        output: { kind: "wait", payload: {}, sourceRefs: ["native:fact"], preconditions: {} },
        allocationId: "allocation-1",
        inputTokens: "7",
        outputTokens: "8",
        resultRef: "opaque-result",
      };
    },
  };
  const provider = new FleetEvalProvider(
    { mode: "offline", datasetId: "synthetic-pact@1", candidateId: "reference" },
    broker,
  );
  const response = await provider.callApi("synthetic", { vars: { caseId: "development-owner" } });
  expect(response.metadata.allocationId).toBe("allocation-1");
  expect(calls).toBe(1);
  const rubric = {
    expectedKind: "wait",
    authorizedRefs: ["native:fact"],
    requiredRefs: ["native:fact"],
    forbiddenActions: true,
  };
  expect(gradeCase(response.output, rubric).score).toBe(1);
  expect(
    gradeCase(
      JSON.stringify({
        success: true,
        kind: "action",
        payload: {},
        sourceRefs: ["foreign:private"],
        preconditions: {},
      }),
      rubric,
    ).score,
  ).toBe(0);
  expect(() => new FleetEvalProvider({ mode: "real", endpoint: "https://example.invalid" } as never, broker)).toThrow();
});
test("optimizer dataset access refuses heldout and cross-family/hash overlap", async () => {
  const data = await loadDataset("evals/pact/datasets/manifest.json", "optimizer");
  expect(data.train.length).toBeGreaterThan(0);
  expect(data.development.length).toBeGreaterThan(0);
  expect("heldout" in data).toBe(false);
  await expect(loadDataset("evals/pact/datasets/manifest.json", "optimizer", "heldout")).rejects.toThrow(
    "HELDOUT_ACCESS_DENIED",
  );
});

test("overlap is rejected before any split file is read", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fleet-overlap-"));
  try {
    const manifest = JSON.parse(await readFile("evals/pact/datasets/manifest.json", "utf8"));
    manifest.records.find((r: any) => r.split === "heldout").contentHash = manifest.records[0].contentHash;
    const path = join(dir, "manifest.json");
    await writeFile(path, JSON.stringify(manifest));
    await expect(loadDataset(path, "optimizer")).rejects.toThrow("DATASET_SPLIT_OVERLAP");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
