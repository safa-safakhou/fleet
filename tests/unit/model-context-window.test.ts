import { expect, it } from "vitest";
import type { ModelPort } from "../../src/domain.js";
import { RoutedModel } from "../../src/model.js";
import { RouteCapacity } from "../../src/platform/admission.js";
import { RunWindow } from "../../src/run-window.js";
import type { Store } from "../../src/store.js";

it("forwards per-model context metadata through the complete provider wrapper chain without a call", () => {
  const http: ModelPort = {
      contextWindow: () => 32768,
      decide: async () => {
        throw Error("NO_CALL");
      },
    },
    codex: ModelPort = {
      decide: async () => {
        throw Error("NO_CALL");
      },
    };
  const routed = new RoutedModel(http, codex),
    window = new RunWindow(undefined).model(routed),
    capacity = new RouteCapacity({} as Store, () => {
      throw Error("NO_CAPACITY_CALL");
    }).wrap(window, () => undefined);
  expect(capacity.contextWindow?.({ route: "openai-compatible", provider: "vllm", model: "nemotron-4b" })).toBe(32768);
  expect(capacity.contextWindow?.({ route: "codex-cli", model: "synthetic" })).toBeUndefined();
});
