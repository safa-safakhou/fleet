import { expect, it } from "vitest";
import { selectInboxPacket } from "../../src/platform/inbox-packet.js";

const delivery = (id: string, text = "synthetic observation") => ({
  id,
  rootId: `root-${id}`,
  depth: 0,
  event: { id, payload: { text } },
});
it("bounds whole deliveries by serialized bytes and accounts for every omitted record", () => {
  const records = Array.from({ length: 100 }, (_, i) => delivery(String(i)));
  const packet = selectInboxPacket({ records, omitted: 244 }, 1200);
  expect(Buffer.byteLength(JSON.stringify(packet))).toBeLessThanOrEqual(1200);
  expect(packet.records.length).toBeGreaterThan(0);
  expect(packet.records.length).toBeLessThan(100);
  expect(packet.records).toEqual(records.slice(0, packet.records.length));
  expect(packet.omitted).toBe(344 - packet.records.length);
  expect(records).toHaveLength(100);
});
it("drains a backlog in ordered bounded batches without repeating or losing deliveries", () => {
  let pending = Array.from({ length: 344 }, (_, i) => delivery(String(i)));
  const seen: string[] = [];
  while (pending.length) {
    const packet = selectInboxPacket(
      { records: pending.slice(0, 100), omitted: Math.max(0, pending.length - 100) },
      1200,
    );
    seen.push(...packet.records.map((r) => r.id));
    pending = pending.slice(packet.records.length);
  }
  expect(seen).toEqual(Array.from({ length: 344 }, (_, i) => String(i)));
});
it("retains an oversized oldest event and fails explicitly instead of truncating or skipping it", () => {
  const records = [delivery("large", "x".repeat(3000)), delivery("later")];
  expect(() => selectInboxPacket({ records, omitted: 0 }, 1200)).toThrow("SPECIALIST_DELIVERY_TOO_LARGE");
  expect(records[0].event.payload.text).toHaveLength(3000);
});
