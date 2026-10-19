import { z } from "zod";
import { FleetError, type GamePort } from "../../domain.js";
import type { EventPage } from "../../platform/contracts.js";

const integer = z.string().regex(/^\d{1,20}$/);
const Page = z
  .object({
    schemaVersion: z.literal("pact.agent-events.v1"),
    events: z
      .array(
        z
          .object({
            sequence: integer,
            eventId: z.uuid(),
            type: z.string().max(96),
            sourceRef: z.string().max(200),
            occurredAt: z.iso.datetime(),
            publishedAt: z.iso.datetime(),
            gameTime: integer,
            deadline: z
              .object({ gameTime: integer, kind: z.string().max(64) })
              .strict()
              .optional(),
            metadata: z
              .object({
                category: z.enum(["completion", "conversation", "contact", "offer", "contract", "raid", "resource"]),
                groupRef: z.string().min(1).max(200),
                recordRef: z.string().max(200),
                quiet: z.boolean().optional(),
              })
              .strict(),
          })
          .strict(),
      )
      .max(50),
    nextCursor: z.string().max(2048).nullable(),
    resyncRequired: z.boolean(),
    resumeFrom: z.string().max(2048).optional(),
  })
  .strict();
/** Only the scoped MCP feed is accepted. A human session stream is never a fallback. */
export async function pactEvents(game: GamePort, cursor: string | null, now: () => Date): Promise<EventPage> {
  if (!(await game.tools()).some((t) => t.name === "pact_agent_events_v1" && t.annotations?.readOnlyHint === true))
    throw new FleetError("UNSUPPORTED_CAPABILITY");
  const raw = await game.read("pact_agent_events_v1", { ...(cursor ? { cursor } : {}), limit: 50 });
  if (Buffer.byteLength(JSON.stringify(raw)) > 32768) throw new FleetError("EVENT_PAGE_LIMIT");
  const page = Page.safeParse(raw);
  if (!page.success) throw new FleetError("INVALID_EVENT_PAGE");
  const p = page.data;
  if (p.resyncRequired && (!p.resumeFrom || p.events.length)) throw new FleetError("INVALID_EVENT_PAGE");
  return {
    events: p.events.map((e) => ({
      id: e.eventId,
      type: e.type,
      sourceRef: e.sourceRef,
      observedAt: now().toISOString(),
      environmentTime: { clockId: "pact.game-time-ms", value: e.gameTime },
      ...(e.deadline ? { deadline: { clockId: "pact.game-time-ms", value: e.deadline.gameTime } } : {}),
      metadata: {
        ...e.metadata,
        occurredAt: e.occurredAt,
        publishedAt: e.publishedAt,
        publicationSequence: e.sequence,
      },
    })),
    nextCursor: p.nextCursor,
    resyncRequired: p.resyncRequired,
    fromCursor: cursor,
    ...(p.resumeFrom ? { resumeFrom: p.resumeFrom } : {}),
  };
}
