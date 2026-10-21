import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { NegotiationEvidenceJsonSchema, NegotiationEvidenceSchema } from "../../src/negotiation-evaluation.js";
import { designDigest } from "../../src/negotiation-plan.js";
import { evidenceFixture } from "../fixtures/negotiation/evidence.js";

it("paired contracts and all three manifests remain identical and reject drifted signed terms", async () => {
  const root = process.env.PACT_ACCEPTANCE_ROOT;
  if (!root || process.env.FLEET_ARCHITECTURE_TEST !== "1") throw Error("EXPLICIT_OWNED_PACT_REQUIRED");
  const pact = await import(pathToFileURL(resolve(root, "tests/evaluation/negotiation-contracts.ts")).href);
  expect(designDigest(pact.NegotiationEvidenceJsonSchema)).toBe(designDigest(NegotiationEvidenceJsonSchema));
  const fleet = await readFile(new URL("../../src/negotiation/design.json", import.meta.url), "utf8");
  expect(await readFile(new URL("../fixtures/negotiation/design.json", import.meta.url), "utf8")).toBe(fleet);
  expect(await readFile(resolve(root, "tests/evaluation/negotiation-design.json"), "utf8")).toBe(fleet);
  const { evidence } = evidenceFixture();
  expect(NegotiationEvidenceSchema.safeParse(evidence).success).toBe(true);
  expect(pact.NegotiationEvidenceSchema.safeParse(evidence).success).toBe(true);
  const altered = structuredClone(evidence);
  altered.contracts[0].terms = structuredClone(altered.contracts[0].terms);
  altered.contracts[0].terms.aToB!.wholePerHour++;
  expect(NegotiationEvidenceSchema.safeParse(altered).success).toBe(false);
  expect(pact.NegotiationEvidenceSchema.safeParse(altered).success).toBe(false);
});
