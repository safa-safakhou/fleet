import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { LayaRecall, layaRevision } from "../../src/laya.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
});
async function server(body: Record<string, unknown>) {
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  close = () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("missing port");
  return new LayaRecall(`http://127.0.0.1:${address.port}`);
}
const candidates = [
  { id: "one", text: "A promise" },
  { id: "two", text: "A delivery" },
];
const valid = {
  task: "laya-recall-v1",
  runtime: "0.4.6",
  revision: layaRevision,
  certificate: "a".repeat(64),
  probability: 0.8,
  id: "two",
  abstained: false,
};
describe("bounded Laya recall", () => {
  it("accepts only a known candidate from the pinned evaluated route", async () => {
    const helper = await server(valid);
    expect(await helper.choose("Review supply", candidates, AbortSignal.timeout(1000))).toEqual({
      id: "two",
      probability: 0.8,
      certificate: "a".repeat(64),
    });
  });
  it.each([
    { id: "foreign" },
    { revision: "new" },
    { probability: 0.5 },
    { probability: NaN },
    { certificate: "missing" },
  ])("rejects invalid helper metadata %j", async (change) => {
    const helper = await server({ ...valid, ...change });
    await expect(helper.choose("supply", candidates, AbortSignal.timeout(1000))).rejects.toThrow(
      "LAYA_INVALID_RESPONSE",
    );
  });
  it("distinguishes uncertainty and missing configuration from a strategy decision", async () => {
    const helper = await server({ ...valid, abstained: true });
    await expect(helper.choose("supply", candidates, AbortSignal.timeout(1000))).rejects.toThrow("LAYA_ABSTAINED");
    await expect(new LayaRecall().choose("supply", candidates, AbortSignal.timeout(1000))).rejects.toThrow(
      "LAYA_NOT_CONFIGURED",
    );
    await expect(helper.choose("غذا", candidates, AbortSignal.timeout(1000))).rejects.toThrow(
      "LAYA_LANGUAGE_NOT_EVALUATED",
    );
  });
});
