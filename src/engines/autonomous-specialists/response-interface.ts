import { type Data, object } from "../../domain.js";

/** Prompt grounding derived from the same scoped format; it grants no capability. */
export function responseContractGuide(schema: Data, options: { share?: boolean } = {}): Data {
  const fragments = new Map<string, { count: number; node: Data; read: boolean; text: string }>();
  const names = new Map<string, string>();
  let collecting = true;
  const resolve = (raw: Data, chain: string[] = []): Data => {
    if (typeof raw.$ref !== "string") return raw;
    const ref = raw.$ref;
    if (!ref.startsWith("#/") || chain.includes(ref)) throw Error("RESPONSE_INTERFACE_REFERENCE");
    const target = ref
      .slice(2)
      .split("/")
      .reduce<unknown>((v, key) => object(v)[key.replace(/~1/g, "/").replace(/~0/g, "~")], schema);
    if (!target || typeof target !== "object" || Array.isArray(target)) throw Error("RESPONSE_INTERFACE_REFERENCE");
    const { $ref: _ref, ...rest } = raw;
    return { ...resolve(object(target), [...chain, ref]), ...rest };
  };
  const render = (raw: unknown, depth = 0, read = false, skip?: string): string => {
    if (depth > 64) throw Error("RESPONSE_INTERFACE_DEPTH");
    if (typeof raw === "boolean") return raw ? "any" : "never";
    const node = resolve(object(raw));
    const key = JSON.stringify([node, read]),
      alias = names.get(key);
    if (!collecting && alias && key !== skip) return alias;
    const union = node.oneOf ?? node.anyOf;
    let text: string;
    if (Object.hasOwn(node, "const")) text = JSON.stringify(node.const);
    else if (Array.isArray(node.enum)) text = node.enum.map((v) => JSON.stringify(v)).join("|");
    else if (Array.isArray(union)) text = `(${union.map((v) => render(v, depth + 1)).join("|")})`;
    else if (node.type === "object" || node.properties) {
      const required = new Set(Array.isArray(node.required) ? node.required : []);
      const fields = Object.entries(object(node.properties)).map(
        ([name, value]) =>
          `${name}${required.has(name) ? "" : "?"}:${read && name === "query" ? "readInterface.queryShape" : render(value, depth + 1)}`,
      );
      if (node.additionalProperties !== false) fields.push(`*:${render(node.additionalProperties ?? true, depth + 1)}`);
      text = `{${fields.join(",")}}`;
    } else if (node.type === "array") text = `[${render(node.items ?? true, depth + 1)}]`;
    else text = Array.isArray(node.type) ? node.type.join("|") : String(node.type ?? "any");
    const bounds = [
      "minLength",
      "maxLength",
      "minimum",
      "maximum",
      "exclusiveMinimum",
      "exclusiveMaximum",
      "multipleOf",
      "minProperties",
      "maxProperties",
      "minItems",
      "maxItems",
      "uniqueItems",
      "pattern",
      "format",
      "dependencies",
    ]
      .filter((key) => node[key] !== undefined)
      .map((key) => `${key}=${JSON.stringify(node[key])}`);
    text += bounds.length ? `<${bounds.join(",")}>` : "";
    if (collecting) {
      const old = fragments.get(key);
      fragments.set(key, { count: (old?.count ?? 0) + 1, node, read, text });
    }
    return text;
  };
  const decisions: string[] = [],
    variants: { node: Data; read: boolean }[] = [];
  const visit = (raw: Data, depth = 0) => {
    if (depth > 64) throw Error("RESPONSE_INTERFACE_DEPTH");
    const node = resolve(raw),
      decision = object(node.properties).decision;
    if (decision) {
      const shape = resolve(object(decision)),
        options = shape.oneOf ?? shape.anyOf ?? [shape];
      if (!Array.isArray(options)) throw Error("RESPONSE_INTERFACE_REQUIRED");
      for (const option of options) {
        const variant = resolve(object(option));
        const read = object(object(variant.properties).kind).const === "read";
        variants.push({ node: variant, read });
        decisions.push(render(variant, 0, read));
      }
    } else {
      const variants = node.oneOf ?? node.anyOf;
      if (!Array.isArray(variants)) throw Error("RESPONSE_INTERFACE_REQUIRED");
      for (const variant of variants) visit(object(variant), depth + 1);
    }
  };
  visit(schema);
  if (!decisions.length) throw Error("RESPONSE_INTERFACE_REQUIRED");
  const plain = {
    notation:
      "{decision:<shape>}; ?=optional, |=alternatives, []=array; @n=local definition. Shapes, not authority; format/native checks remain binding.",
    decisions: [...new Set(decisions)],
  };
  if (options.share === false) return plain;
  // Factor schema nodes, never string substitutions in literal const/enum data.
  const candidates = [...fragments.entries()]
    .filter(([, v]) => v.count > 1 && (v.count - 1) * v.text.length > v.count * 4 + 12)
    .sort(([, a], [, b]) => (b.count - 1) * b.text.length - (a.count - 1) * a.text.length)
    .slice(0, 48);
  let ordinal = 0;
  for (const [key] of candidates) {
    let name: string;
    do {
      name = `@${ordinal++}`;
    } while (decisions.some((s) => s.includes(name)));
    names.set(key, name);
  }
  collecting = false;
  const definitions: Record<string, string> = {};
  for (const [key, v] of candidates) {
    const name = names.get(key);
    if (!name) throw Error("RESPONSE_INTERFACE_REFERENCE");
    definitions[name] = render(v.node, 0, v.read, key);
  }
  const shared = {
    ...plain,
    decisions: [...new Set(variants.map((v) => render(v.node, 0, v.read)))],
    definitions,
  };
  // Alias tokens were chosen absent from every literal. Inline unused/single-use
  // definitions after parent factoring; whole-token matching avoids @1/@10 overlap.
  for (;;) {
    const entry = Object.entries(shared.definitions).find(([name]) => {
      const re = new RegExp(`${name}(?![0-9])`, "g");
      return (
        [
          ...shared.decisions,
          ...Object.entries(shared.definitions)
            .filter(([key]) => key !== name)
            .map(([, v]) => v),
        ].reduce((n, text) => n + [...text.matchAll(re)].length, 0) <= 1
      );
    });
    if (!entry) break;
    const [name, value] = entry,
      re = new RegExp(`${name}(?![0-9])`, "g");
    delete shared.definitions[name];
    shared.decisions = shared.decisions.map((text) => text.replace(re, () => value));
    for (const key of Object.keys(shared.definitions))
      shared.definitions[key] = shared.definitions[key].replace(re, () => value);
  }
  return Buffer.byteLength(JSON.stringify(shared)) < Buffer.byteLength(JSON.stringify(plain)) ? shared : plain;
}

/** Same query shape, one copy of its documentation; no inference or authorization. */
export function queryContractGuide(schema: Data): Data {
  const guide = responseContractGuide({
    ...(schema.$defs ? { $defs: schema.$defs } : {}),
    ...(schema.definitions ? { definitions: schema.definitions } : {}),
    properties: { decision: schema },
  });
  return {
    variants: guide.decisions,
    ...(guide.definitions ? { notation: "@n=local definition" } : {}),
    ...(guide.definitions ? { definitions: guide.definitions } : {}),
    ...(typeof schema.description === "string" ? { instructions: schema.description } : {}),
  };
}
