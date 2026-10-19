import type { EngineContext } from "../src/platform/engine-registry.js";
export function reactiveProbe(decide: EngineContext["model"]["decide"]): EngineContext {
  return {
    claim: {
      turn: {
        cohort: {
          model: { route: "ollama", model: "fake-model" },
          budget: { maxCallsPerTurn: 3, inputByteLimit: 24000, maxOutputTokens: 2000 },
        },
      },
    },
    binding: { id: "binding" },
    task: { key: "work", sourceCount: 1, sourceRefsOmitted: 0 },
    observation: {
      schemaId: "board.position.v1",
      revision: "1",
      observedAt: "2026-10-17T12:00:00Z",
      environmentTime: { clockId: "board.ply", value: "1" },
      sourceRefs: ["board:1"],
      payload: { position: "a2" },
      coverage: {},
    },
    eventRefs: ["source:1"],
    model: { decide },
    commands: {},
    observe: async () => {
      throw Error("UNEXPECTED_READ");
    },
    signal: new AbortController().signal,
    goal: "Reach the finish",
    schemas: { actions: ["board.move.v1"], observations: ["board.position.v1"] },
    catalog: async () => [],
  } as unknown as EngineContext;
}
