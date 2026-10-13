import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { FleetError } from "../src/domain.js";
import { LayaRecall } from "../src/laya.js";

// Explicit synthetic HTTP acceptance only. No LLM, game or Fleet DB access.
const cases = JSON.parse(await readFile("laya-service/recall-validation.json", "utf8")) as {
  query: string;
  relevant: string;
  distractor: string;
}[];
const helper = new LayaRecall("http://127.0.0.1:8832");
let accepted = 0,
  abstained = 0;
for (const c of cases) {
  for (const reverse of [false, true]) {
    const candidates = [
      { id: "relevant", text: c.relevant },
      { id: "distractor", text: c.distractor },
    ];
    if (reverse) candidates.reverse();
    try {
      const answer = await helper.choose(c.query, candidates, AbortSignal.timeout(3000));
      assert.equal(answer.id, "relevant");
      accepted++;
    } catch (error) {
      if (!(error instanceof FleetError) || error.code !== "LAYA_ABSTAINED") throw error;
      abstained++;
    }
  }
}
assert.equal(accepted, 18);
assert.equal(abstained, 14);
console.log(
  JSON.stringify({ task: "laya-recall-v1", accepted, correct: accepted, abstained, gameCalls: 0, llmCalls: 0 }),
);
