import { readFile } from "node:fs/promises";
import net from "node:net";
import { gradeCase } from "../../evals/pact/assertions.js";
import { FleetEvalProvider } from "../../evals/pact/provider.js";
import { loadDataset } from "../../src/research/evaluation/datasets.js";
import { EvaluationRPCClient } from "../../src/research/evaluation/rpc-client.js";
import { restrictOfflineNetwork } from "./research-offline-network.js";

try {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 1048576) throw Error("OFFLINE_INPUT_LIMIT");
    chunks.push(chunk);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString());
  restrictOfflineNetwork(input.socket);
  for (const attempt of [() => net.connect({ host: "127.0.0.1", port: 9 }), () => fetch("https://example.invalid")]) {
    let denied = false;
    try {
      attempt();
    } catch (error) {
      denied = error instanceof Error && error.message === "OFFLINE_EGRESS_DENIED";
    }
    if (!denied) throw Error("OFFLINE_EGRESS_PROBE_FAILED");
  }
  const { evaluate } = await import("promptfoo");
  const dataset = await loadDataset(input.manifestPath, "evaluator", input.split),
    cases = (dataset[input.split as "development" | "heldout"] ?? []).filter((c) => input.caseIds.includes(c.id));
  if (cases.length !== input.caseIds.length) throw Error("DATASET_SCOPE_DENIED");
  const broker = new EvaluationRPCClient(input.socket, input.token, input.scope);
  try {
    const providers = input.candidates.map(
      (candidateId: string) =>
        new FleetEvalProvider({ mode: "offline", datasetId: dataset.manifest.id, candidateId }, broker),
    );
    const record = await evaluate(
      {
        prompts: [input.candidatePrompt ?? "{{actorInput}}"],
        providers,
        sharing: false,
        writeLatestResults: false,
        tests: cases.map((c) => ({
          vars: { caseId: c.id, actorInput: c.actorInput },
          options: { disableConversationVar: true },
          assert: [{ type: "javascript" as const, value: (output: string) => gradeCase(output, c.rubric) }],
        })),
      },
      { cache: false, maxConcurrency: 1 },
    );
    const summary = await record.toEvaluateSummary();
    const results = summary.results.map((r: any) => ({
      caseId: String(r.vars.caseId),
      candidateId: String(r.response?.metadata?.candidateId),
      allocationId: String(r.response?.metadata?.allocationId),
      resultRef: String(r.response?.metadata?.resultRef),
      pass: r.success,
      score: r.score,
    }));
    if (
      results.length !== cases.length * providers.length ||
      results.some((r) => r.allocationId === "undefined" || typeof r.score !== "number")
    )
      throw Error("FRAMEWORK_RESULTS_INCOMPLETE");
    process.stdout.write(
      "\nFLEET_FRAMEWORK_RESULT " +
        JSON.stringify({
          version: "fleet.prompt-suite-batch/v1",
          egressProbesDenied: 2,
          promptfooVersion: JSON.parse(
            await readFile(new URL("../../node_modules/promptfoo/package.json", import.meta.url), "utf8"),
          ).version,
          results,
          successes: summary.stats.successes,
          failures: summary.stats.failures,
        }),
    );
  } finally {
    broker.close();
  }
} catch (error) {
  process.stderr.write(`OFFLINE_PROMPT_SUITE_FAILED:${error instanceof Error ? error.name : "Error"}`);
  process.exitCode = 1;
}
