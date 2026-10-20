import { mkdir, writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import baseline from "../fixtures/engines/architecture-baseline-v1.json" with { type: "json" };
import { assertArchitectureParity, captureArchitectureTranscript } from "../legacy-parity.js";

const cases = [
  ["legacy-loop", "action"],
  ["legacy-cognition", "action"],
  ["reactive-basic", "action"],
  ["reactive-cognition", "action"],
  ["specialist-coordinator", "action"],
  ["reactive-basic", "correction"],
  ["reactive-basic", "unknown"],
  ["reactive-basic", "zero"],
  ["specialist-coordinator", "stale"],
  ["specialist-coordinator", "sibling-failure"],
] as const;

it("captures all five current profiles and correction uncertainty stale and zero-call behavior", async () => {
  const transcripts: Record<string, unknown> = {};
  for (const [id, scenario] of cases) {
    const result = await captureArchitectureTranscript({ id, version: "1" }, { scenario });
    transcripts[`${id}@1:${scenario}`] = result;
    if (scenario === "action") {
      expect(result.modelPackets.length, JSON.stringify({ id, code: result.code, turn: result.turn })).toBeGreaterThan(
        0,
      );
      expect(result.commands.length).toBe(1);
      expect(result.allocations.every((r) => r.status === "reported" && r.tokens === "40000")).toBe(true);
    }
    if (scenario === "zero") expect(result.modelPackets).toEqual([]);
    if (scenario === "unknown" || scenario === "sibling-failure") {
      expect(result.allocations.some((r) => r.status === "unknown" && r.tokens === "40000")).toBe(true);
      expect(result.commands).toEqual([]);
    }
    if (scenario === "correction") expect(result.modelPackets).toHaveLength(2);
    if (scenario === "stale") {
      expect(result.code).toBe("STALE_PROPOSAL");
      expect(result.commands).toEqual([]);
    }
  }
  await mkdir(".tmp", { recursive: true });
  await writeFile(
    ".tmp/architecture-capture.json",
    JSON.stringify({ sourceRevision: "fd39b37", cases: transcripts }, null, 2) + "\n",
  );
  assertArchitectureParity(transcripts, baseline.cases);
}, 30_000);

it("detects changed decision packets and missing or refunded accounting", () => {
  const original = {
    modelPackets: [{ messages: [{ content: "Both signatures are required" }] }],
    allocations: [{ tokens: "40000", status: "unknown" }],
  };
  const changed = structuredClone(original);
  changed.modelPackets[0].messages[0].content = "One signature is enough";
  expect(() => assertArchitectureParity(changed, original)).toThrow("ARCHITECTURE_PARITY_DRIFT");
  const refunded = structuredClone(original);
  refunded.allocations[0].tokens = "0";
  expect(() => assertArchitectureParity(refunded, original)).toThrow("ARCHITECTURE_PARITY_DRIFT");
});
