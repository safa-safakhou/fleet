import { z } from "zod";
import { type Data, object } from "../../domain.js";
import type { ConditionContract } from "../../platform/contracts.js";
import { WakeConditionSchema } from "../../platform/engine-context.js";
import { InternalMessageSchema } from "./messaging.js";

export type ParticipantContractContext = {
  specialistId: string;
  recipientIds: readonly string[];
  deliveries: readonly { id: string; depth: number; event: unknown }[];
  evidenceIds: readonly string[];
  knownRequestIds: readonly string[];
  conditionContracts: readonly ConditionContract[];
  temporalEvidence?: { eventCategories: readonly string[] };
};
/** Generation scope only. Native transactional ownership/time checks remain authoritative. */
export function participantGenerationContract(
  base: Data,
  context: ParticipantContractContext,
): { schema: Data; prompt: Data } {
  const schema = structuredClone(base),
    update = object(object(schema.properties).update);
  if (!Object.keys(update).length)
    return { schema, prompt: { mode: "no_update", meaning: "State updates are unavailable in this response." } };
  const fields = object(update.properties);
  const parents = [
    ...new Set(
      context.deliveries
        .filter(
          (d) => d.event && typeof d.event === "object" && Number.isInteger(d.depth) && d.depth >= 0 && d.depth < 4,
        )
        .map((d) => d.id),
    ),
  ];
  const recipients = [...new Set(context.recipientIds.filter((id) => id !== context.specialistId))];
  const evidence = [...new Set(context.evidenceIds)];
  if (
    [...parents, ...evidence, ...context.knownRequestIds].some((id) => !z.uuid().safeParse(id).success) ||
    recipients.some((id) => !InternalMessageSchema.shape.to.safeParse(id).success)
  )
    throw Error("PARTICIPANT_IDENTIFIER_REQUIRED");
  const messages = object(fields.messages),
    message = object(messages.items),
    messageFields = object(message.properties);
  if (!Object.keys(messageFields).length) throw Error("PARTICIPANT_SCHEMA_REQUIRED");
  if (!parents.length || !recipients.length) messages.maxItems = 0;
  else {
    messageFields.parentDeliveryId = { enum: parents };
    messageFields.to = { enum: recipients };
  }
  const messageEvidence = object(messageFields.evidenceIds);
  if (!evidence.length) messageEvidence.maxItems = 0;
  else messageEvidence.items = { enum: evidence };
  if (parents.length && recipients.length) {
    const ordinary = structuredClone(message);
    object(ordinary.properties).kind = { type: "string", enum: ["request", "publish", "conflict"] };
    const replies = context.deliveries
      .filter((d) => parents.includes(d.id))
      .flatMap((d) => {
        const event = object(d.event),
          metadata = object(event.metadata),
          sender = metadata.sender;
        if (
          !String(event.id).startsWith("internal:") ||
          metadata.kind !== "request" ||
          typeof sender !== "string" ||
          !recipients.includes(sender)
        )
          return [];
        const reply = structuredClone(message),
          properties = object(reply.properties);
        properties.kind = { const: "reply" };
        properties.to = { const: sender };
        properties.parentDeliveryId = { const: d.id };
        return [reply];
      });
    messages.items = { anyOf: [ordinary, ...replies] };
  }
  for (const name of ["goals", "memories", "predictions"]) {
    const records = object(fields[name]);
    if (!evidence.length) records.maxItems = 0;
    else {
      const ids = object(object(object(records.items).properties).evidenceIds);
      ids.items = { enum: evidence };
    }
  }
  const categories = context.temporalEvidence ? [...new Set(context.temporalEvidence.eventCategories)] : undefined;
  if (categories?.some((category) => !WakeConditionSchema.options[0].shape.category.safeParse(category).success))
    throw Error("PARTICIPANT_CATEGORY_REQUIRED");
  const native = z.toJSONSchema(WakeConditionSchema, { target: "draft-7" });
  const variants = ((native.oneOf ?? native.anyOf) as Data[]).flatMap((variant) => {
    const properties = object(variant.properties),
      kind = object(properties.kind).const;
    if (kind === "event" && categories)
      return categories.length ? [{ ...variant, properties: { ...properties, category: { enum: categories } } }] : [];
    if (kind === "reply") {
      const { requestId: _id, requestIndex: _index, ...common } = properties;
      const choices: Data[] = [
        {
          ...variant,
          properties: { ...common, requestIndex: properties.requestIndex },
          required: ["kind", "requestIndex", "deadline"],
        },
      ];
      if (context.knownRequestIds.length)
        choices.push({
          ...variant,
          properties: {
            ...common,
            requestId: { ...object(properties.requestId), enum: [...new Set(context.knownRequestIds)] },
          },
          required: ["kind", "requestId", "deadline"],
        });
      return choices;
    }
    if (kind === "predicate")
      return context.conditionContracts.map((c) => ({
        ...variant,
        properties: {
          kind: properties.kind,
          name: { const: c.name },
          version: { const: c.version },
          args: c.argsSchema,
        },
      }));
    return [variant];
  });
  const timed = variants.filter((v) =>
    ["deadline", "periodic"].includes(String(object(object(v.properties).kind).const)),
  );
  if (
    timed.length === 2 &&
    JSON.stringify({ ...timed[0], properties: { ...object(timed[0].properties), kind: null } }) ===
      JSON.stringify({ ...timed[1], properties: { ...object(timed[1].properties), kind: null } })
  ) {
    variants.splice(variants.indexOf(timed[1]), 1);
    object(timed[0].properties).kind = { enum: ["deadline", "periodic"] };
  }
  fields.wakeConditions = parents.length
    ? { ...object(fields.wakeConditions), items: { anyOf: variants } }
    : { type: "array", maxItems: 0, items: { type: "object" } };
  return {
    schema,
    prompt: {
      mode: "scoped_update",
      ...(categories
        ? {
            eventCategories: categories,
            temporalEvidence:
              "Owner/peer decisions and response times are unknown unless supplied. Own plans/wakes are conditional review choices, never their promises.",
          }
        : {}),
      parentDeliveryIds: parents,
      recipients,
      updates:
        "Optional; omit if nothing durable changes. Support uses evidence.deliveredIds; new goal/memory IDs are not evidence.",
      messages: "Use listed parents/other recipients. Reply only to their delivered request. Empty messages is valid.",
      wakes:
        "Use kind:event(category), deadline/periodic(at:{clockId,value}), reply(requestIndex or supplied requestId,deadline), or predicate per assessmentConditions. Use future times on the stated clock. Conditions claim no observed event or extra allowance.",
    },
  };
}
