import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { type TrainingExample, VwDecision } from "../src/decision.js";

// Explicit synthetic acceptance only: no Fleet DB, LLM, credentials or game API.
const service = new VwDecision("http://127.0.0.1:8831");
const choices = ["development", "resilience"];
const history: TrainingExample[] = [];
for (let i = 0; i < 200; i++) {
  for (const shortage of [0, 1]) {
    const chosen = i % 2;
    history.push({
      features: { shortage, abundance: 1 - shortage },
      choices,
      chosen,
      probability: 0.5,
      reward: chosen === shortage ? 1 : -1,
    });
  }
}
const start = performance.now();
const cold = await service.predict({ shortage: 1 }, choices, [], AbortSignal.timeout(5000));
assert.deepEqual(cold, [0.5, 0.5]);
for (const shortage of [0, 1]) {
  const context = { shortage, abundance: 1 - shortage };
  const p = await service.predict(context, choices, history, AbortSignal.timeout(5000));
  const repeated = await service.predict(context, choices, history, AbortSignal.timeout(5000));
  assert.deepEqual(p, repeated);
  assert.ok(p[shortage] > 0.8);
  assert.ok(Math.min(...p) > 0);
}
console.log(
  JSON.stringify({
    policy: "vw-focus-v1",
    engine: "Vowpal Wabbit 9.11.9",
    syntheticTrainingExamples: history.length,
    predictions: 5,
    elapsedMs: Math.round(performance.now() - start),
    coldStart: "uniform",
    contextualLearning: "passed",
    restartReplay: "deterministic",
    llmCalls: 0,
    gameCalls: 0,
  }),
);
