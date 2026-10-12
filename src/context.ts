import { type Data, FleetError, object } from "./domain.js";

// Count the serialized transport envelope plus the separately supplied output schema.
// Keep executable shapes, command outcomes and current facts whole. Only the dated
// observation cache and read descriptions are optional under the input allowance.
export function fitMessages(
  context: Data,
  instructions: string,
  schema: Data,
  limit: number,
  compactReads: (reads: Data[], limit: number) => Data[],
  narrowRead?: (read: Data, limit: number) => Data,
) {
  const messages = (c: Data) => [
    { role: "system", content: instructions },
    { role: "user", content: JSON.stringify(c) },
  ];
  const fits = (m: ReturnType<typeof messages>) =>
    Buffer.byteLength(JSON.stringify(m)) + Buffer.byteLength(JSON.stringify(schema)) <= limit;
  const full = messages(context);
  if (fits(full)) return full;
  const reads = Array.isArray(context.readResults) ? context.readResults.map(object) : [];
  const names = Array.isArray(context.availableReads)
    ? context.availableReads.map((r) => ({ name: object(r).name }))
    : [];
  for (const allowance of [8000, 6000, 4000, 2000, 0]) {
    const smaller = messages({
      ...context,
      availableReads: names,
      readResults: compactReads(reads, allowance),
      omissions: [
        "Read descriptions and dated cache entries reduced to fit the full serialized input allowance. Current facts, command outcomes and supplied action schemas remain whole. Missing cached sections are unknown; request a narrower read when needed.",
      ],
    });
    if (fits(smaller)) return smaller;
  }
  // A requested result is indispensable feedback, separate from optional history.
  // Only narrow it after evicting all optional reads, and never silently drop it.
  if (context.requestedRead && narrowRead) {
    for (const allowance of [6000, 4000, 2000, 1000]) {
      const smaller = messages({
        ...context,
        availableReads: names,
        readResults: [],
        requestedRead: narrowRead(object(context.requestedRead), allowance),
        omissions: ["Dated cache omitted. The requested read is explicitly incomplete; use its narrowing guidance."],
      });
      if (fits(smaller)) return smaller;
    }
  }
  throw new FleetError("CONTEXT_LIMIT");
}
