import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import baseline from "../../src/engines/legacy/baseline.json" with { type: "json" };

it("pins the unchanged controller to the recorded source snapshot", async () => {
  const source = await readFile(new URL("../../src/engine.ts", import.meta.url));
  const pinned = baseline.files.find((file) => file.path === "src/engine.ts");
  expect(createHash("sha256").update(source).digest("hex")).toBe(pinned?.sha256);
  expect(baseline.sourceRevision).toBe("c212373ccca98d3e064d24ebd2a9398dd94e2a77");
  const ordered = baseline.files.map(({ path, sha256 }) => ({ path, sha256 }));
  expect(createHash("sha256").update(JSON.stringify(ordered)).digest("hex")).toBe(baseline.artifactDigest);
});
