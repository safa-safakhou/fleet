import { expect, it } from "vitest";
import { evidenceChain } from "../../src/platform/reports.js";

it("pairs overlapping worker telemetry by allocation ID rather than coincident turn execution numbers", () => {
  const events = [
    {
      id: "a",
      label: "Debug: Model request",
      detail: { allocationId: "A", execution: 1, stage: { kind: "worker", focusId: "one" } },
    },
    {
      id: "b",
      label: "Debug: Model request",
      detail: { allocationId: "B", execution: 1, stage: { kind: "worker", focusId: "two" } },
    },
    { id: "c", label: "Debug: Model response", detail: { allocationId: "B", execution: 1 } },
    { id: "d", label: "Debug: Model response", detail: { allocationId: "A", execution: 1 } },
  ];
  expect(evidenceChain(events).modelLinks).toEqual([
    { allocationId: "A", requestEventId: "a", responseEventId: "d" },
    { allocationId: "B", requestEventId: "b", responseEventId: "c" },
  ]);
  expect(evidenceChain([{ id: "old", label: "Model response", detail: null }]).modelLinks).toEqual([]);
});

it("shows retained predictions and proposal expectations separately from actual command admission", () => {
  const events = [
    {
      id: "request",
      label: "Debug: Model request",
      detail: {
        allocationId: "A",
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              continuity: {
                schemaVersion: "fleet.continuity.v1",
                predictions: [
                  {
                    id: "p",
                    expected: "fulfilled",
                    observed: "defaulted",
                    status: "contradicted",
                    outcomeRef: "e2",
                    evidenceRefs: ["e1"],
                  },
                ],
              },
              proposals: [{ intent: { commandId: "C" }, expectedOutcome: "Help before lock", evidenceRefs: ["e1"] }],
            }),
          },
        ],
      },
    },
    {
      id: "receipt",
      label: "Game returned an action result",
      detail: {
        commandId: "C",
        committed: true,
        environmentOutcome: { status: "confirmed", sourceRefs: ["receipt:C"] },
      },
    },
  ];
  const chain = evidenceChain(events);
  expect(chain.predictions).toMatchObject([
    { predictionId: "p", expected: "fulfilled", observed: "defaulted", status: "contradicted", outcomeRef: "e2" },
  ]);
  expect(chain.commands).toMatchObject([
    {
      commandId: "C",
      expectedOutcome: "Help before lock",
      resultEventId: "receipt",
      status: "confirmed",
      materialFulfilment: "unmeasured",
    },
  ]);
});
