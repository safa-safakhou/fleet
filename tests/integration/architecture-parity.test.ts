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

it("has no dependency from one architecture implementation to a sibling", async () => {
  const { readFile, readdir } = await import("node:fs/promises"),
    { resolve, dirname } = await import("node:path");
  const violations: string[] = [];
  async function scan(dir: string) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const path = resolve(dir, e.name);
      if (e.isDirectory()) await scan(path);
      else if (e.name.endsWith(".ts") && !e.name.endsWith("manifest.ts")) {
        const own = path.split("/engines/")[1]?.split("/")[0];
        for (const m of (await readFile(path, "utf8")).matchAll(/(?:from|import\s*\()\s*["']([^"']+)["']/g)) {
          const target = resolve(dirname(path), m[1]);
          const other = target.split("/engines/")[1]?.split("/")[0];
          if (other && own !== other) violations.push(`${own}->${other}`);
        }
      }
    }
  }
  await scan(resolve("src/engines"));
  expect(violations).toEqual([]);
});
it("never transfers one binding's delivered continuity evidence to another binding", async () => {
  const { platformFixture } = await import("../platform-helpers.js"),
    { Cognition } = await import("../../src/cognition.js"),
    { ContinuityModule } = await import("../../src/engines/continuity/state.js");
  const f = await platformFixture();
  try {
    await f.store.setState(f.group.id, "paused", true);
    await f.tasks.enroll(f.group.id, { id: "reactive-cognition", version: "1" });
    await f.store.consent(f.group.id, true);
    await f.store.setState(f.group.id, "running", true);
    const module = new ContinuityModule(f.tasks, f.bindings, new Cognition(f.store));
    const obs = (source: string) => ({
      schemaId: "board.position.v1",
      revision: "0",
      observedAt: f.now().toISOString(),
      environmentTime: { clockId: "board.ply", value: "0" },
      sourceRefs: [source],
      payload: {},
      coverage: {},
      continuity: {
        schemaVersion: "fleet.continuity-observation.v1" as const,
        self: { capabilities: [], needs: {}, dependencies: {}, ownerValues: {} },
        facts: [{ sourceRef: source, kind: "state" as const, subject: "self", predicate: "stock", value: "known" }],
      },
    });
    await f.enqueue(f.group.bindings[0], "a", "source:a");
    const a = await f.claim(),
      one = await module.context(f.group.bindings[0], a, obs("source:a"));
    await f.enqueue(f.group.bindings[1], "b", "source:b");
    const b = await f.claim(),
      two = await module.context(f.group.bindings[1], b, obs("source:b"));
    const ids = (c: Record<string, unknown>) => (c.evidence as { id: string }[]).map((e) => e.id);
    expect(ids(one).every((id) => !ids(two).includes(id))).toBe(true);
    module.restrict(a, { ...one, evidence: [] });
    const attempted = await module.apply(f.group.bindings[1], b, 0, {
      memories: [{ text: "Other actor's private evidence", evidenceRefs: ids(one) }],
    });
    expect(attempted.accepted).toBe(false);
    expect(attempted.code).toBe("EVIDENCE_NOT_DELIVERED");
  } finally {
    await f.pool.end();
  }
});
