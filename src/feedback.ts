import { type Data, object } from "./domain.js";

// Stored rejection evidence stays whole. The generation schema/lookup supplies
// executable shapes; feedback needs exact diagnostics, not a second schema copy.
export function promptFeedback(feedback: Data): Data {
  const { inputSchema, attemptedArgs, errors, guidance, ...rest } = feedback;
  const exact = object(attemptedArgs);
  const references = Object.fromEntries(
    Object.entries(exact).filter(
      ([key, value]) =>
        !/body|note|text|summary|description|token|password|secret|credential/i.test(key) &&
        (typeof value === "number" ||
          typeof value === "boolean" ||
          (typeof value === "string" && value.length <= 120) ||
          (Array.isArray(value) && value.length <= 40 && value.every((v) => typeof v === "string" && v.length <= 120))),
    ),
  );
  return {
    ...rest,
    ...(Object.keys(references).length ? { attemptedReferences: references } : {}),
    ...(Array.isArray(errors)
      ? {
          errors: errors.slice(0, 8).map((issue) => {
            const e = object(issue),
              p = object(e.params);
            return {
              instancePath: e.instancePath,
              keyword: e.keyword,
              params: Object.fromEntries(
                ["missingProperty", "additionalProperty", "type", "limit", "allowedValue"]
                  .filter((k) => Object.hasOwn(p, k))
                  .map((k) => [k, p[k]]),
              ),
            };
          }),
        }
      : {}),
    ...(inputSchema
      ? {
          schemaDelivery:
            "Use the exact generation schema; other admitted shapes are available through the schema lookup.",
        }
      : {}),
    ...(typeof guidance === "string"
      ? { guidance: guidance.length > 240 ? `${guidance.slice(0, 240)} (excerpt; stored feedback retained)` : guidance }
      : {}),
  };
}
