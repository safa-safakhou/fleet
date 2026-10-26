/** Fresh isolated one-fix-at-a-time synthetic qualification; no game runtime or command ports. */

import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { HttpModel } from "../src/model.js";
import { executeKingdomWorkflow } from "./lib/feedback-workflow.js";
import { type KingdomRepairs, noKingdomRepairs } from "./lib/grounded-kingdom-policy.js";
import { InferenceQueue } from "./lib/inference-queue.js";

if (
  process.argv[2] !== "--run" ||
  !process.argv[3] ||
  process.argv.length !== 4 ||
  process.env.FLEET_LIVE_ENABLED !== "0"
)
  throw Error("EXPLICIT_GAME_FREE_QUALIFICATION_REQUIRED");
const serviceRoot = resolve(process.argv[3]),
  root = resolve(serviceRoot, "singles");
await mkdir(root, { mode: 0o700 });
await writeFile(resolve(root, "run-once.marker"), new Date().toISOString(), { flag: "wx", mode: 0o600 });
const key = (await readFile(resolve(serviceRoot, "api-key"), "utf8")).trim();
const adapter = new HttpModel({ "openai-compatible": "http://127.0.0.1:18535/v1" }, key);
const model = {
  route: "openai-compatible" as const,
  provider: "vllm" as const,
  model: "nemotron-4b",
  thinking: false,
  temperature: 0.6,
  topP: 0.95,
  seed: 42,
};
const stop = new AbortController(),
  timer = setTimeout(() => stop.abort(Error("QUALIFICATION_DEADLINE")), 600000),
  queue = new InferenceQueue(4);
let calls = 0;
const started = performance.now(),
  rows = [];
const cases: Record<keyof KingdomRepairs, Array<[number, number]>> = {
  facts: [
    [1, 1],
    [1, 2],
    [3, 0],
    [3, 2],
    [5, 1],
    [5, 3],
    [6, 0],
    [7, 0],
  ],
  legal: [
    [6, 0],
    [6, 1],
    [6, 2],
    [6, 3],
    [0, 0],
    [2, 0],
    [7, 0],
    [7, 1],
  ],
  refresh: Array.from({ length: 8 }, (_, i) => [4, i % 4]),
  objective: [
    [0, 1],
    [0, 2],
    [0, 3],
    [2, 1],
    [2, 2],
    [2, 3],
    [1, 3],
    [5, 3],
  ],
};
const pins: Record<string, string> = {};
for (const path of [
  "scripts/qualify-grounded-fixes.ts",
  "scripts/lib/feedback-workflow.ts",
  "scripts/lib/grounded-kingdom-policy.ts",
  "src/platform/grounded-decision.ts",
  "src/platform/decision-feedback.ts",
  "tests/fixtures/kingdom-feedback-workflow.ts",
])
  pins[path] = createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
await writeFile(resolve(root, "source-pins.json"), JSON.stringify(pins, null, 2), { flag: "wx", mode: 0o600 });
try {
  for (const feature of Object.keys(cases) as Array<keyof KingdomRepairs>) {
    const outputs = [];
    for (let offset = 0; offset < 8; offset += 4) {
      const batch = await Promise.all(
        cases[feature].slice(offset, offset + 4).map(async ([variant, round], j) => {
          const id = `single-${feature}-${offset + j}`,
            repairs = { ...noKingdomRepairs, [feature]: true };
          const out = await executeKingdomWorkflow({
            id,
            bindingId: `kingdom-${offset + j}`,
            variant,
            round,
            repairs,
            model,
            signal: AbortSignal.any([stop.signal, AbortSignal.timeout(90000)]),
            queueDelayMs: 0,
            attempt: async (request) =>
              queue.run(request.signal, async () => {
                if (stop.signal.aborted || calls >= 192) throw Error("QUALIFICATION_CALL_LIMIT");
                calls++;
                try {
                  return await adapter.decide({
                    ...request,
                    signal: AbortSignal.any([request.signal, AbortSignal.timeout(60000)]),
                  });
                } catch (error) {
                  stop.abort(error);
                  throw error;
                }
              }),
          });
          await appendFile(resolve(root, "workflows.jsonl"), `${JSON.stringify(out)}\n`, { mode: 0o600 });
          return out;
        }),
      );
      outputs.push(...batch);
    }
    const row = {
      feature,
      repairs: { ...noKingdomRepairs, [feature]: true },
      workflows: outputs.length,
      completed: outputs.filter((o) => o.row.completed).length,
      correct: outputs.filter((o) => o.row.objectiveCorrect === true && o.row.factualCorrect === true).length,
      recovered: outputs.filter((o) => o.row.recovered).length,
      hostRefreshes: outputs.reduce((n, o) => n + o.hostRefreshes, 0),
      calls: outputs.reduce((n, o) => n + o.row.attempts, 0),
      errors: outputs.flatMap((o) => o.errors),
    };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
} finally {
  clearTimeout(timer);
  const result = {
    rows,
    calls,
    elapsedMs: performance.now() - started,
    interrupted: stop.signal.aborted,
    model,
    gameCommands: 0,
  };
  await writeFile(resolve(root, "result.json"), JSON.stringify(result, null, 2), { flag: "wx", mode: 0o600 });
}
