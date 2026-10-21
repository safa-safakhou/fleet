import { type Data, object } from "../../domain.js";

const maps = ["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"];
const lists = ["oneOf", "anyOf", "allOf", "prefixItems"];
const singles = [
  "items",
  "contains",
  "not",
  "if",
  "then",
  "else",
  "additionalProperties",
  "unevaluatedProperties",
  "propertyNames",
];
/** Structural JSON Schema factoring only. Literal const/enum/example values are
 * never traversed as schemas. Accepted outputs and every numeric/enum bound stay exact.
 */
export function shareGenerationSchema(input: Data): Data {
  const root = structuredClone(input),
    counts = new Map<string, { count: number; node: Data }>();
  function children(node: Data, visit: (child: Data) => Data): Data {
    const out = { ...node };
    for (const key of maps)
      if (node[key] && typeof node[key] === "object" && !Array.isArray(node[key]))
        out[key] = Object.fromEntries(
          Object.entries(object(node[key])).map(([name, value]) => [
            name,
            value && typeof value === "object" && !Array.isArray(value) ? visit(object(value)) : value,
          ]),
        );
    for (const key of lists)
      if (Array.isArray(node[key]))
        out[key] = (node[key] as unknown[]).map((value) =>
          value && typeof value === "object" && !Array.isArray(value) ? visit(object(value)) : value,
        );
    for (const key of singles)
      if (node[key] && typeof node[key] === "object" && !Array.isArray(node[key])) out[key] = visit(object(node[key]));
    return out;
  }
  function count(node: Data): Data {
    const key = JSON.stringify(node),
      prior = counts.get(key);
    counts.set(key, { count: (prior?.count ?? 0) + 1, node });
    children(node, count);
    return node;
  }
  count(root);
  const candidates = [...counts.entries()]
    .filter(([key, value]) => value.count > 1 && key.length >= 120 && value.count * (key.length - 60) > key.length + 80)
    .sort(([a], [b]) => b.length - a.length || a.localeCompare(b))
    .slice(0, 32);
  if (!candidates.length) return root;
  const names = new Map<string, string>();
  let n = 0;
  for (const [key] of candidates) {
    while (Object.hasOwn(object(root.$defs), `fleet_shared_${n}`)) n++;
    names.set(key, `fleet_shared_${n++}`);
  }
  function rewrite(node: Data, skip?: string): Data {
    const key = JSON.stringify(node),
      name = names.get(key);
    return name && key !== skip ? { $ref: `#/$defs/${name}` } : children(node, (child) => rewrite(child));
  }
  const result = rewrite(root, JSON.stringify(root));
  result.$defs = {
    ...object(result.$defs),
    ...Object.fromEntries(candidates.map(([key, { node }]) => [names.get(key) ?? "invalid", rewrite(node, key)])),
  };
  // Factoring is optional; use it only when it actually reduces serialized input.
  return JSON.stringify(result).length < JSON.stringify(root).length ? result : root;
}
