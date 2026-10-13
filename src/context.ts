import { type Data, FleetError, object } from "./domain.js";

// Count the serialized transport envelope plus the separately supplied output schema.
// Keep executable shapes, command outcomes and authoritative core facts whole.
// The game adapter can explicitly page optional fresh observations after cache eviction.
export function fitMessages(
  context: Data,
  instructions: string,
  schema: Data,
  limit: number,
  compactReads: (reads: Data[], limit: number) => Data[],
  narrowRead?: (read: Data, limit: number) => Data,
  compactEnvironment?: (environment: Data, limit: number) => Data,
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
  if (compactEnvironment) {
    const requested = context.requestedRead ? object(context.requestedRead) : undefined;
    const feedback = [requested];
    if (requested && narrowRead) for (const size of [4000, 2000, 1000]) feedback.push(narrowRead(requested, size));
    // Exhaust optional fresh-environment reductions before narrowing requested feedback.
    for (const requestedRead of feedback) {
      for (const allowance of [12000, 10000, 8000, 6000, 4000, 2000]) {
        let environment: Data;
        try {
          environment = compactEnvironment(object(context.environment), allowance);
        } catch (error) {
          if (error instanceof FleetError && error.code === "CONTEXT_LIMIT") continue;
          throw error;
        }
        const reduced = {
          ...context,
          environment,
          availableReads: names,
          readResults: [],
          requestedRead,
          omissions: [
            "Dated cache omitted; optional current observations are paged with explicit coverage. Core state, permissions, receipts and executable schemas remain whole. Missing records are unknown, not empty.",
          ],
        };
        const wholeNotes = messages(reduced);
        if (fits(wholeNotes)) return wholeNotes;
        // Never destroy persisted notes. Oversized optional continuation prose can
        // be omitted from this one input, with an explicit notice instead of truncation.
        const withoutNotes = messages({
          ...reduced,
          privateNotes: undefined,
          privateNotesCoverage: {
            omitted: true,
            originalBytes: Buffer.byteLength(JSON.stringify(context.privateNotes ?? null)),
            notice:
              "Stored private notes omitted from this input only. Fresh facts and requested feedback take priority; prior intent is not current state.",
          },
        });
        if (fits(withoutNotes)) return withoutNotes;
      }
    }
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
