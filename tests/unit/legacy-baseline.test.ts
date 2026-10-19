import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import baseline from "../../src/engines/legacy/baseline.json" with { type: "json" };

it("preserves the recorded controller except the explicit 19 October context and owner-assignment repairs", async () => {
  const source = await readFile(new URL("../../src/engine.ts", import.meta.url));
  const pinned = baseline.files.find((file) => file.path === "src/engine.ts");
  // Preserve the historical pin. Reverse only the explicitly reviewed repairs;
  // any other controller drift still fails against the original source digest.
  let historical = source.toString();
  const reviewed: [string, string][] = [
    [
      'import { currentOwnerObjectiveInstruction, ownerRecallQuery, ownerValues } from "./owner-guidance.js";',
      'import { ownerRecallQuery, ownerValues } from "./owner-guidance.js";',
    ],
    [
      '        const instructions =\n          this.adapter.instructions +\n          (cognition ? ` ${analysisInstructions}` : "") +\n          currentOwnerObjectiveInstruction(\n            claim.cohort.owner_guidance === "account_autonomy" ? this.adapter.accountObjective?.(facts) : undefined,\n          );',
      '        const instructions = this.adapter.instructions + (cognition ? ` ${analysisInstructions}` : "");',
    ],
    ["        const packetLimit = Math.min(b.inputByteLimit, b.perCallTokenLimit - b.maxOutputTokens - 1024);\n", ""],
    ["                packetLimit,", "                b.inputByteLimit,"],
    ["                packetLimit\n", "                b.inputByteLimit\n"],
  ];
  for (const [current, original] of reviewed) {
    expect(historical.split(current)).toHaveLength(2);
    historical = historical.replace(current, original);
  }
  expect(createHash("sha256").update(historical).digest("hex")).toBe(pinned?.sha256);
  expect(baseline.sourceRevision).toBe("c212373ccca98d3e064d24ebd2a9398dd94e2a77");
  const ordered = baseline.files.map(({ path, sha256 }) => ({ path, sha256 }));
  expect(createHash("sha256").update(JSON.stringify(ordered)).digest("hex")).toBe(baseline.artifactDigest);
});
