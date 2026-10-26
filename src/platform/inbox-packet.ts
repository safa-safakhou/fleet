import { FleetError } from "../domain.js";

/** Deliver an ordered prefix of whole records; undispatched evidence remains pending. */
export function selectInboxPacket<T>(inbox: { records: T[]; omitted: number }, maxBytes: number) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 64) throw new FleetError("INVALID_INBOX_LIMIT", true);
  const packet = { records: [] as T[], omitted: inbox.omitted + inbox.records.length };
  for (const record of inbox.records) {
    packet.records.push(record);
    packet.omitted--;
    if (Buffer.byteLength(JSON.stringify(packet)) > maxBytes) {
      packet.records.pop();
      packet.omitted++;
      if (!packet.records.length) throw new FleetError("SPECIALIST_DELIVERY_TOO_LARGE", true);
      break;
    }
  }
  return packet;
}
