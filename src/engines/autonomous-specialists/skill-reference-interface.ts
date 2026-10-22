import { type Data, FleetError, object } from "../../domain.js";
import { type SkillRef, SkillRefSchema } from "../../modules/skills/v1/schema.js";

function listed(raw: readonly SkillRef[]): SkillRef[] {
  const refs = new Map<string, SkillRef>();
  for (const value of raw) {
    const ref = SkillRefSchema.safeParse(value);
    if (!ref.success) throw new FleetError("SKILL_REFERENCE_SCOPE_INVALID", true);
    refs.set(JSON.stringify(ref.data), ref.data);
  }
  return [...refs.values()];
}
/** Generation envelope matches native read/final operations; literal tuples stay correlated. */
export function bindListedSkillReferences(input: Data, raw: readonly SkillRef[]): Data {
  const refs = listed(raw),
    schema = structuredClone(input);
  const visit = (node: Data) => {
    const properties = object(node.properties),
      decision = object(properties.decision);
    if (!Object.keys(decision).length) {
      const variants = node.anyOf ?? node.oneOf;
      if (!Array.isArray(variants)) throw new FleetError("SKILL_REFERENCE_SCHEMA_REQUIRED", true);
      for (const variant of variants) visit(object(variant));
      return;
    }
    // New hypotheses keep their own content/IDs; their existing parent, child and
    // invocation references must still name a delivered library version.
    const candidate = object(object(properties.proposals).items),
      candidateFields = object(candidate.properties);
    if (candidateFields.parent) {
      if (refs.length) candidateFields.parent = { enum: refs };
      else delete candidateFields.parent;
    }
    const procedure = object(object(candidateFields.procedure).properties);
    if (procedure.children)
      procedure.children = {
        ...object(procedure.children),
        ...(refs.length ? { items: { enum: refs } } : { maxItems: 0, items: { type: "object" } }),
      };
    const nodes = object(object(procedure.nodes).items),
      nodeKey = Array.isArray(nodes.oneOf) ? "oneOf" : Array.isArray(nodes.anyOf) ? "anyOf" : undefined;
    if (nodeKey)
      nodes[nodeKey] = (nodes[nodeKey] as Data[]).flatMap((variant) => {
        const fields = object(variant.properties);
        if (!fields.skill) return [variant];
        return refs.length ? [{ ...variant, properties: { ...fields, skill: { enum: refs } } }] : [];
      });
    if (!properties.skills) return;
    const kinds = ((decision.anyOf ?? decision.oneOf ?? [decision]) as Data[]).map(
        (v) => object(object(v.properties).kind).const,
      ),
      read = kinds.every((k) => k === "read");
    if (!kinds.length || (!read && kinds.some((k) => k === "read")))
      throw new FleetError("SKILL_REFERENCE_SCHEMA_REQUIRED", true);
    const skills = object(properties.skills),
      fields = object(skills.properties);
    if (!Object.keys(fields).length) throw new FleetError("SKILL_REFERENCE_SCHEMA_REQUIRED", true);
    for (const name of ["select", "publish", "adopt"]) {
      if ((read && name !== "select") || (!read && name === "select")) {
        delete fields[name];
        continue;
      }
      if (fields[name])
        fields[name] = {
          ...object(fields[name]),
          ...(refs.length ? { items: { enum: refs } } : { maxItems: 0, items: { type: "object" } }),
        };
    }
  };
  visit(schema);
  return schema;
}

/** A provider can ignore a generation schema. Refuse before any library operation too. */
export function assertListedSkillReferences(changes: unknown, raw: readonly SkillRef[]): void {
  const known = new Set(listed(raw).map((ref) => JSON.stringify(ref)));
  for (const name of ["select", "publish", "adopt"]) {
    const value = object(changes)[name];
    if (value === undefined) continue;
    if (!Array.isArray(value)) throw new FleetError("SKILL_REFERENCE_NOT_DELIVERED", true);
    for (const candidate of value) {
      const parsed = SkillRefSchema.safeParse(candidate);
      if (!parsed.success || !known.has(JSON.stringify(parsed.data)))
        throw new FleetError("SKILL_REFERENCE_NOT_DELIVERED", true);
    }
  }
}
