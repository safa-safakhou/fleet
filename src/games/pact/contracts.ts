import { validateTool } from "../../tools.js";

export { schemaChanged, validateTool } from "../../tools.js";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Ajv } from "ajv";
import { type Data, FleetError, object, type Tool } from "../../domain.js";

const ajv = new Ajv({ strict: false, validateFormats: false, allErrors: false });
// PACT publishes Zod defaults as required properties with JSON Schema defaults.
// Materialize those trusted tool defaults before validating and sending arguments.
// Action contracts intentionally keep their original validation semantics.

interface Family {
  name: string;
  version: string;
  schema: Data;
}
const artifact = JSON.parse(await readFile(resolve("vendor/pact-actions.json"), "utf8")) as {
  sha256: string;
  families: Family[];
};
if (createHash("sha256").update(JSON.stringify(artifact.families)).digest("hex") !== artifact.sha256)
  throw new FleetError("CONTRACT_DIGEST_MISMATCH");
const families = artifact.families.map((f) => ({ ...f, validate: ajv.compile(f.schema) }));
export function actionContract(action: Data) {
  const f = families.find((f) => f.validate(action));
  if (!f) throw new FleetError("INVALID_GAME_ACTION");
  return { version: f.version, action };
}
export const allActionSchemas = artifact.families.map((f) => f.schema);
function options(v: unknown): Data[] {
  const o = object(v);
  if (object(o.properties).kind && typeof object(object(o.properties).kind).const === "string") return [o];
  return Object.values(o).flatMap((x) =>
    Array.isArray(x) ? x.flatMap(options) : x && typeof x === "object" ? options(x) : [],
  );
}
export const actionKinds = allActionSchemas
  .flatMap(options)
  .map((o) => String(object(object(o.properties).kind).const));
export function actionSchema(kind: string) {
  const found = allActionSchemas.flatMap(options).find((o) => object(object(o.properties).kind).const === kind);
  if (!found) throw new FleetError("NOT_A_GAME_COMMAND");
  return found;
}
export function isRead(tool: Tool) {
  return tool.name.startsWith("pact_") && tool.annotations?.readOnlyHint === true;
}
export function readCatalog(tools: Tool[]) {
  return tools.filter(isRead).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
}
export function validateActionTool(tools: Tool[], id: string, action: Data) {
  actionContract(action);
  const tool = tools.find((t) => t.name === "pact_game_action_v2");
  if (!tool) throw new FleetError("SCHEMA_CHANGED");
  validateTool(tool, { commandId: id, action });
}
