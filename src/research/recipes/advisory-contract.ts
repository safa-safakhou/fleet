/** A final advisory step cannot spend its only decision requesting another observation.
 * Exact references are choices from the host's delivered frame, never model-created IDs. */
export function oneStepAdvisorySchema(sourceRefs: string[]): Record<string, unknown> {
  return {
    $id: "fleet.one-step-advisory@1",
    type: "object",
    properties: {
      kind: { type: "string", enum: ["advisory", "wait"] },
      payload: {
        type: "object",
        properties: { text: { type: "string", minLength: 1, maxLength: 600 } },
        required: ["text"],
        additionalProperties: false,
      },
      sourceRefs: {
        type: "array",
        items: sourceRefs.length ? { type: "string", enum: [...new Set(sourceRefs)] } : { type: "string" },
        minItems: sourceRefs.length ? 1 : 0,
        maxItems: sourceRefs.length ? 1000 : 0,
      },
      preconditions: { type: "object", additionalProperties: false },
    },
    required: ["kind", "payload", "sourceRefs", "preconditions"],
    additionalProperties: false,
  };
}
