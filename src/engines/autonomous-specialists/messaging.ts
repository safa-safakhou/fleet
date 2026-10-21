import { z } from "zod";
export const InternalMessageSchema = z
  .object({
    to: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    kind: z.enum(["request", "reply", "publish", "conflict"]),
    text: z.string().min(1).max(2000),
    evidenceIds: z.array(z.uuid()).max(32),
    parentDeliveryId: z.uuid(),
  })
  .strict();
export type InternalMessage = z.infer<typeof InternalMessageSchema>;
