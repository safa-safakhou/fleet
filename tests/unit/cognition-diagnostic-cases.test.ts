import { expect, it } from "vitest";
import { buildRecallCases, diagnosticSituation } from "../../src/cognition-diagnostic-cases.js";

it("builds32 frozen,48 controlled and8 negative calls with exact text-preserving query arms and order inversion", () => {
  const frozen = Array.from({ length: 16 }, (_, i) => ({
    query: `Question ${i}`,
    relevant: "A relevant source",
    distractor: "An unrelated source",
  }));
  const pairs = Array.from({ length: 8 }, (_, i) => ({
    sourceId: String(i),
    query: "Broad goal",
    focused: "Which source contains the needed fact?",
    candidates: [
      { id: "a", text: "Source one" },
      { id: "b", text: "Source two" },
    ],
    compact: ["One", "Two"],
    expected: "a",
  }));
  const cases = buildRecallCases(frozen, pairs);
  expect(cases).toHaveLength(88);
  expect(cases.filter((c) => c.arm === "frozen")).toHaveLength(32);
  expect(cases.filter((c) => c.arm === "negative")).toHaveLength(8);
  const a = cases.find((c) => c.id === "pair:0:original:0"),
    b = cases.find((c) => c.id === "pair:0:focused:0"),
    rev = cases.find((c) => c.id === "pair:0:focused:1");
  if (!a || !b || !rev) throw Error("MISSING_CASE");
  expect(a.candidates).toEqual(b.candidates);
  expect(a.query).not.toBe(b.query);
  expect(rev.candidates).toEqual([...b.candidates].reverse());
  expect(rev.expected).toBe(b.expected);
  expect(() => buildRecallCases(frozen.slice(1), pairs)).toThrow();
});
it("keeps temporal facts separate and the abstention control has no relevant sources", () => {
  expect(diagnosticSituation("no-evidence", 0).facts).toEqual([]);
  expect(diagnosticSituation("promise", 0).facts[0].kind).toBe("statement");
  expect(diagnosticSituation("promise", 1).facts[0].kind).toBe("outcome");
  expect(diagnosticSituation("reserve", 0).facts[0].value).toContain("80 iron");
  expect(diagnosticSituation("reserve", 2).story).toContain("40 iron");
  expect(() => diagnosticSituation("no-evidence", 1)).toThrow();
});
