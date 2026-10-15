import { createHash } from "node:crypto";
import { Ajv, type ValidateFunction } from "ajv";
import { type Data, FleetError, object, type Tool } from "./domain.js";

const toolAjv = new Ajv({ strict: false, validateFormats: false, allErrors: false, useDefaults: true });
const cache = new Map<string, ValidateFunction>();
export class ToolArgumentError extends FleetError {
  constructor(readonly detail: Data) {
    super("INVALID_TOOL_ARGUMENTS");
  }
}
export function validateTool(tool: Tool, args: Data) {
  const digest = createHash("sha256").update(JSON.stringify(tool.inputSchema)).digest("hex");
  let v = cache.get(digest);
  if (!v) {
    if (cache.size > 200) cache.clear();
    v = toolAjv.compile(tool.inputSchema);
    cache.set(digest, v);
  }
  if (!v(args))
    throw new ToolArgumentError({
      schemaDigest: digest,
      errors: v.errors?.map(({ instancePath, schemaPath, keyword, params }) => ({
        instancePath,
        schemaPath,
        keyword,
        params,
      })),
    });
}
export function schemaChanged(old: Tool[], fresh: Tool[]) {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, value]) => [key, canonical(value)]),
          )
        : value;
  const key = (ts: Tool[]) =>
    JSON.stringify(
      ts
        .map((t) => ({
          name: t.name,
          inputSchema: canonical(object(t.inputSchema)),
          readOnly: t.annotations?.readOnlyHint === true,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  return key(old) !== key(fresh);
}
