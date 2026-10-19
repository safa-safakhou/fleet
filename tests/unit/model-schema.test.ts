import { expect, it, vi } from "vitest";
import { HttpModel } from "../../src/model.js";

it("rejects a malformed generation schema before dispatch or network invocation", async () => {
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("NETWORK_MUST_NOT_RUN"));
  let dispatched = false;
  try {
    await expect(
      new HttpModel({ ollama: "http://127.0.0.1:11434" }, undefined).decide({
        model: { route: "ollama", model: "nemotron-3-nano:4b", thinking: false },
        messages: [{ role: "user", content: "Wait" }],
        schema: { type: "object", properties: { value: { enum: ["x", "x"] } } },
        maxOutputTokens: 2000,
        signal: new AbortController().signal,
        onDispatch: async () => {
          dispatched = true;
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_GENERATION_SCHEMA", notDispatched: true });
    expect(dispatched).toBe(false);
    expect(network).not.toHaveBeenCalled();
  } finally {
    network.mockRestore();
  }
});
