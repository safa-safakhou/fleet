import { once } from "node:events";
import { createServer } from "node:http";
import { expect, it } from "vitest";
import { HttpModel } from "../../src/model.js";

it("sends explicit context and keepalive to the native provider", async () => {
  let wire: Record<string, unknown> = {};
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    wire = JSON.parse(body);
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        message: { content: '{"kind":"wait"}' },
        prompt_eval_count: 10,
        eval_count: 5,
        done: true,
        done_reason: "stop",
      }),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw Error("missing port");
  try {
    const model = new HttpModel({ ollama: `http://127.0.0.1:${address.port}` }, undefined, {
      contextLength: 16384,
      keepAliveSeconds: 300,
    });
    const result = await model.decide({
      model: { route: "ollama", model: "nemotron-3-nano:4b", thinking: false },
      messages: [{ role: "user", content: "Synthetic wait" }],
      schema: { type: "object" },
      maxOutputTokens: 512,
      signal: AbortSignal.timeout(3000),
    });
    expect(wire.options).toEqual({ num_ctx: 16384, num_predict: 512 });
    expect(wire.keep_alive).toBe(300);
    expect(result.decision).toEqual({ kind: "wait" });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
