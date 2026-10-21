import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Claim } from "../src/store.js";
import type { FakeModel } from "./helpers.js";

export function assertArchitectureParity(actual: unknown, expected: unknown): void {
  if (!isDeepStrictEqual(actual, expected)) throw Error("ARCHITECTURE_PARITY_DRIFT");
}
export { captureArchitectureTranscript } from "./architecture-transcript.js";

/** Preserve identity relationships while normalizing independently generated fixture UUIDs. */
export function normalizedModelInputs(model: FakeModel, claim: Claim) {
  const known = new Map([
    [claim.id, "fixture-turn"],
    [claim.cohortId, "fixture-cohort"],
    [claim.agentId, "fixture-agent"],
    [claim.agent.account_id, "fixture-account"],
    [claim.agent.kingdom_id, "fixture-entity"],
  ]);
  let generated = 0;
  const input = model.inputs.map(({ model, messages, schema, maxOutputTokens }) => ({
    model,
    messages,
    schema,
    maxOutputTokens,
  }));
  return JSON.parse(
    JSON.stringify(input).replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, (id) => {
      if (!known.has(id)) known.set(id, `fixture-generated-${++generated}`);
      return known.get(id) ?? id;
    }),
  );
}

export function modelInputDigest(model: FakeModel, claim: Claim) {
  return createHash("sha256")
    .update(JSON.stringify(normalizedModelInputs(model, claim)))
    .digest("hex");
}
