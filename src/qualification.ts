import { createHash } from "node:crypto";
import { Ajv } from "ajv";
import type { Data } from "./domain.js";
/** Validate a supplied offline output. This function has no provider/network capability. */
export function qualifyOutput(schema: Data, messages: unknown[], output: unknown, limit = 24000) {
  const schemaId = createHash("sha256").update(JSON.stringify(schema)).digest("hex"),
    inputBytes = Buffer.byteLength(JSON.stringify(messages)) + Buffer.byteLength(JSON.stringify(schema));
  if (inputBytes > limit)
    return {
      schemaId,
      inputBytes,
      valid: false,
      stage: "delivery",
      diagnostics: [{ schemaId, fieldPath: "/", code: "CONTEXT_LIMIT" }],
    };
  const validate = new Ajv({ strict: false, validateFormats: false, allErrors: true }).compile(schema),
    valid = validate(output);
  return {
    schemaId,
    inputBytes,
    valid,
    stage: valid ? "validation" : "generation",
    diagnostics: (validate.errors ?? [])
      .slice(0, 20)
      .map((e) => ({ schemaId, fieldPath: e.instancePath || "/", code: e.keyword })),
  };
}
