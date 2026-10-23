import { type Data, object } from "../../domain.js";
/** Native read operations cannot persist participant updates. Keep nested contracts intact. */
export function readFinalGenerationContract(
  input: Data,
  options: { readSummary?: string; finalOnly?: boolean; waitAllowed?: boolean; waitSummary?: string } = {},
): Data {
  const schema = structuredClone(input),
    properties = object(schema.properties),
    decision = object(properties.decision);
  const key = Array.isArray(decision.oneOf) ? "oneOf" : Array.isArray(decision.anyOf) ? "anyOf" : undefined;
  if (!key) return schema;
  const variants = decision[key] as Data[],
    reads = variants.filter((v) => object(object(v.properties).kind).const === "read"),
    finals = variants.filter(
      (v) =>
        !reads.includes(v) && (options.waitAllowed !== false || object(object(v.properties).kind).const !== "wait"),
    );
  if (!reads.length) return schema;
  if (schema.additionalProperties !== false || (schema.required as string[] | undefined)?.includes("update"))
    throw Error("READ_FINAL_SCHEMA_REQUIRED");
  const { $schema, $id, $defs, definitions, ...body } = schema;
  const rootMeta = {
    ...($schema !== undefined ? { $schema } : {}),
    ...($id !== undefined ? { $id } : {}),
    ...($defs !== undefined ? { $defs } : {}),
    ...(definitions !== undefined ? { definitions } : {}),
  };
  if (options.waitSummary !== undefined)
    for (const final of finals)
      if (object(object(final.properties).kind).const === "wait")
        object(final.properties).summary = { ...object(object(final.properties).summary), const: options.waitSummary };
  if (options.finalOnly) {
    if (!finals.length) throw Error("FINAL_DECISION_SCHEMA_REQUIRED");
    return { ...rootMeta, ...body, properties: { ...properties, decision: { ...decision, [key]: finals } } };
  }
  if (options.readSummary !== undefined)
    for (const read of reads)
      object(read.properties).summary = { ...object(object(read.properties).summary), const: options.readSummary };
  const { update: _update, ...readProperties } = properties;
  readProperties.decision = { ...decision, [key]: reads };
  if (readProperties.skills) {
    const skills = object(readProperties.skills),
      select = object(skills.properties).select;
    readProperties.skills = { ...skills, properties: select ? { select } : {} };
  }
  return {
    ...rootMeta,
    anyOf: [
      { ...body, properties: readProperties },
      ...(finals.length ? [{ ...body, properties: { ...properties, decision: { ...decision, [key]: finals } } }] : []),
    ],
  };
}
