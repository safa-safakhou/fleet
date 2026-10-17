import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { explainStep, StepExplanation } from "../../web/run-steps.js";

const step = (label: string, detail: Record<string, unknown> | null = {}, stage = "ready") => ({
  id: label,
  sequence: "1",
  at: "2026-10-16T10:00:00Z",
  stage,
  label,
  detail,
});
describe("plain-language run steps", () => {
  it("distinguishes account objectives from an imposed Fleet strategy", () => {
    const value = explainStep(
      step("Owner guidance applied", { mode: "account_autonomy", controllerStrategyApplied: false }),
    );
    expect(value.explanation).toContain("account");
    expect(value.outcome).toContain("No predefined Fleet strategy");
    expect(value.inputs).toMatchObject({ mode: "account_autonomy" });
    expect(value.outputs).toMatchObject({ controllerStrategyApplied: false });
  });
  it("shows both negative and positive blocker outcomes without treating a title as success", () => {
    expect(explainStep(step("Game blockers checked", { needsOwner: false })).outcome).toContain(
      "No owner-recovery blocker",
    );
    expect(
      explainStep(step("Game needs owner recovery", { needsOwner: true, label: "Queue needs review" })).outcome,
    ).toContain("Queue needs review");
    expect(explainStep(step("Game blockers checked")).outcome).toContain("not recorded");
  });
  it("keeps a proposed action distinct from an actual game commitment", () => {
    expect(explainStep(step("Debug: Model response", { decision: { kind: "action" } })).outcome).toContain("proposed");
    expect(
      explainStep(step("Game returned an action result", { committed: false, code: "SLOT_BUSY" })).outcome,
    ).toContain("No game change was confirmed");
    expect(
      explainStep(step("Game returned an action result", { committed: true, code: "COMMITTED" })).outcome,
    ).toContain("confirmed");
  });
  it("keeps missing, withheld and oversized details visibly unknown", () => {
    expect(explainStep(step("Reading current game state")).outcome).toContain("not recorded");
    expect(explainStep(step("Game blockers checked", null)).outcome).toContain("not available");
    expect(explainStep(step("Debug: Model response", { omitted: true, bytes: 300000 })).outcome).toContain("300000");
  });
  it("links only the matching model execution's recorded response", () => {
    const events = [
      step("Debug: Model request", { execution: 1 }),
      step("Debug: Model response", { execution: 2, decision: { kind: "wait" } }),
      step("Debug: Model response", { execution: 1, decision: { kind: "read" } }),
    ];
    expect(explainStep(events[0], events, 0).relatedStep).toBe(2);
    expect(explainStep(events[0], events.slice(0, 2), 0).relatedStep).toBeUndefined();
  });
  it("renders labeled inputs and outputs, readable fields and expandable escaped raw data", () => {
    const html = renderToStaticMarkup(
      <StepExplanation
        event={step("Debug: Tool response", {
          tool: "example_read",
          args: { limit: 2 },
          result: { message: "<script>unsafe</script>", complete: false },
        })}
        events={[]}
        index={0}
      />,
    );
    expect(html).toContain("Inputs");
    expect(html).toContain("Outputs");
    expect(html).toContain("Response body");
    expect(html).toContain("No");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("All recorded fields · raw JSON");
  });
});

it("links concurrent focused workers by allocation rather than their shared execution number", () => {
  const events = [
    step("Debug: Model request", { execution: 1, allocationId: "A" }),
    step("Debug: Model request", { execution: 1, allocationId: "B" }),
    step("Debug: Model response", { execution: 1, allocationId: "B", decision: { kind: "wait" } }),
    step("Debug: Model response", { execution: 1, allocationId: "A", decision: { kind: "wait" } }),
  ];
  expect(explainStep(events[0], events, 0).relatedStep).toBe(3);
});
