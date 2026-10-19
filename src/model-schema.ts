import { Ajv } from "ajv";
import { type Data, FleetError } from "./domain.js";

/** A local contract defect must fail before invoking any provider. */
export function compileGenerationSchema(schema: Data) {
  try {
    return new Ajv({ strict: false, validateFormats: false, allErrors: true }).compile(schema);
  } catch {
    throw new FleetError("INVALID_GENERATION_SCHEMA", true);
  }
}
