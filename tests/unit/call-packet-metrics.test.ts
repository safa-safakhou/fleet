import { expect, it } from "vitest";
import { callPacketMetrics } from "../../src/call-metrics.js";

it("records byte allocation and delivered/omitted counts without private packet contents", () => {
  const request = {
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          inbox: { records: [{ id: "private", text: "PRIVATE" }], omitted: 18 },
          coverage: { quotedOptionsOmitted: 3 },
        }),
      },
    ],
    schema: { type: "object" },
  };
  const metrics = callPacketMetrics(request);
  expect(metrics.inboxDelivered).toBe(1);
  expect(metrics.inboxOmitted).toBe(18);
  expect(metrics.quotedOptionsOmitted).toBe(3);
  expect(metrics.schemaBytes).toBe(Buffer.byteLength(JSON.stringify(request.schema)));
  expect(JSON.stringify(metrics)).not.toMatch(/private|PRIVATE/);
  expect(callPacketMetrics({ messages: [], schema: {} }).inboxDelivered).toBeNull();
});
