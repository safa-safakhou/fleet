import { createHash } from "node:crypto";
import type { RecipientSpec } from "../../platform/architecture.js";
import type { ScopedEvent } from "../../platform/engine-context.js";
export type Subscription = {
  participantId: string;
  subscriptionVersion: string;
  categories: string[];
  periodic: boolean;
};
/** Registered subscriptions are trusted configuration, never peer-provided routing instructions. */
export function route(scope: ScopedEvent, subscriptions: Subscription[]): RecipientSpec[] {
  const event = scope.event,
    category = event.metadata.category,
    periodic = ["scheduled", "periodic_review"].includes(event.type),
    resync = event.type === "snapshot_resync";
  return subscriptions
    .filter((s) => resync || (periodic ? s.periodic : typeof category === "string" && s.categories.includes(category)))
    .map((s) => ({
      participantId: s.participantId,
      subscriptionVersion: s.subscriptionVersion,
      taskKey: resync
        ? "resync"
        : periodic
          ? "periodic"
          : `concern:${createHash("sha256")
              .update(JSON.stringify([category, event.metadata.groupRef ?? event.sourceRef]))
              .digest("hex")}`,
    }));
}
